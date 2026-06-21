/**
 * POST /api/translation/extract
 *
 * Full extraction pipeline per v5.0 standard:
 * 1. Classify document type
 * 2. Load relevant glossary modules
 * 3. Extract raw fields via DeepSeek (text from Tesseract) or vision
 * 4. Normalize using glossary + nominative case restorer + date lock
 * 5. Build source traces
 * 6. Return ExtractedField[] + ImageQualityReport
 *
 * Hard rule: never return final values without source traces.
 */
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { loadGlossary, lookupTerm } from '@/lib/translation/glossary/glossaryLoader'
import { transliterateName } from '@/lib/translation/glossary/nominativeCaseRestorer'
import { normalizeDateUkrainian } from '@/lib/translation/numericAccuracy/dateFieldLockValidator'
import { DocumentType, ExtractedField } from '@/lib/translation/types'
import { persistExtractedFields, writeAuditLog } from '@/lib/translation/packetStateManager'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), '../../prompts/translation-agent-system.md')

async function getSystemPrompt(): Promise<string> {
  try {
    return await readFile(SYSTEM_PROMPT_PATH, 'utf-8')
  } catch {
    return 'You are a Ukrainian-to-English document translation agent. Extract fields accurately with source traces. Never guess.'
  }
}

async function extractWithDeepSeek(params: {
  rawText: string
  docType: DocumentType
  systemPrompt: string
}): Promise<{ ok: boolean; fields: ExtractedField[]; imageQuality?: { overall: number; issues: string[] } }> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return { ok: false, fields: [] }

  const glossary = loadGlossary(params.docType)
  const glossaryJson = JSON.stringify(glossary, null, 2)

  const userPrompt = `Document type: ${params.docType}
Glossary (use ONLY these terms for translation):
${glossaryJson}

Raw OCR text from document:
\`\`\`
${params.rawText.slice(0, 4000)}
\`\`\`

Extract ALL visible fields. For each field return:
{
  "field": "snake_case_field_name",
  "source_label": "exact label as printed in source",
  "source_zone": "zone_description (e.g. personal_data.surname_line)",
  "bbox": [0.1, 0.2, 0.9, 0.3],
  "raw_value": "exactly as found in document",
  "normalized_value": "English normalized value",
  "language_layer": "uk|ru|mixed|unknown",
  "confidence": 0.95,
  "review_required": false
}

Return JSON only: { "fields": [...], "image_quality": { "overall": 0.9, "issues": [] } }`

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        max_tokens: 2000,
        temperature: 0.05,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return { ok: false, fields: [] }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ''
    const clean = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(clean) as { fields?: ExtractedField[]; image_quality?: { overall: number; issues: string[] } }

    const fields = (parsed.fields ?? []).map(f => ({
      ...f,
      bbox: Array.isArray(f.bbox) && f.bbox.length === 4 ? f.bbox : [0, 0, 1, 1] as [number,number,number,number],
      confidence: typeof f.confidence === 'number' ? Math.min(1, Math.max(0, f.confidence)) : 0.5,
      review_required: f.confidence < 0.70 || f.review_required,
    })) as ExtractedField[]

    return { ok: true, fields, imageQuality: parsed.image_quality }
  } catch (err) {
    console.error('[translation/extract] DeepSeek call failed:', err)
    return { ok: false, fields: [] }
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`translation_extract:${ip}`, 20, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({})) as {
    session_id?: string
    doc_type?: DocumentType
    raw_text?: string
    controlling_spelling?: Record<string, string>
  }

  const { doc_type, raw_text, controlling_spelling = {} } = body
  if (!doc_type) return NextResponse.json({ ok: false, error: 'doc_type required' }, { status: 400 })
  if (!raw_text || raw_text.trim().length < 20) {
    return NextResponse.json({ ok: false, error: 'raw_text too short — run Tesseract first' }, { status: 400 })
  }

  const systemPrompt = await getSystemPrompt()
  const glossary = loadGlossary(doc_type)
  const result = await extractWithDeepSeek({ rawText: raw_text, docType: doc_type, systemPrompt })

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      mode: 'manual_review_required',
      error: 'DeepSeek extraction failed — manual review needed',
      fields: [],
    }, { status: 503 })
  }

  // Post-process: apply glossary lookups + transliteration + date normalization
  const processed = result.fields.map(field => {
    let normalized = field.normalized_value

    // Names: apply transliteration with controlling spelling override
    if (['surname','given_names','full_name','last_name','first_name','father_name','mother_name'].includes(field.field)) {
      normalized = transliterateName(field.raw_value, controlling_spelling[field.field])
    }
    // Dates: normalize to MM/DD/YYYY
    else if (field.field.startsWith('date_') && glossary.months) {
      const dateNorm = normalizeDateUkrainian(field.raw_value, glossary.months)
      if (dateNorm) normalized = dateNorm
    }
    // Admin terms: glossary lookup
    else {
      const looked = lookupTerm(glossary, field.raw_value)
      if (looked) normalized = looked
    }

    return { ...field, normalized_value: normalized }
  })

  // Persist fields + advance session status → extracted
  const session_id = body.session_id
  if (session_id) {
    try {
      await persistExtractedFields(session_id, processed)

      const supabase = createAdminSupabaseClient()
      await supabase.from('translation_sessions').update({
        status: 'extracted',
        doc_type,
        updated_at: new Date().toISOString(),
      }).eq('session_id', session_id)

      await writeAuditLog({
        session_id,
        event_type: 'extraction_completed',
        metadata: {
          doc_type,
          total_fields: processed.length,
          review_required_count: processed.filter(f => f.review_required).length,
          image_quality: result.imageQuality,
        },
      })
    } catch (err) {
      console.error('[translation/extract] persist failed:', err)
      // Non-fatal: still return the fields
    }
  }

  return NextResponse.json({
    ok: true,
    session_id,
    doc_type,
    fields: processed,
    image_quality: result.imageQuality,
    total_fields: processed.length,
    review_required_count: processed.filter(f => f.review_required).length,
  })
}
