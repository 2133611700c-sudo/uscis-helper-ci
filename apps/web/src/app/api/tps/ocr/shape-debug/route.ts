/**
 * Forensic shape-debug endpoint for the TPS OCR pipeline.
 *
 * PURPOSE
 *   When a real user reports "OCR didn't extract X", the wizard's normal
 *   /api/tps/ocr/extract response strips raw_text for privacy. That leaves
 *   no way to determine why a specific field is missing without asking the
 *   user to share their actual document file. This endpoint gives the
 *   project owner (authenticated by a server-side secret) a full
 *   diagnostic dump for one upload — raw OCR text, every module's output,
 *   every validation decision — without persisting or logging anything.
 *
 * AUTHENTICATION
 *   Header `x-debug-secret: <value>` must match process.env.TPS_DEBUG_SECRET.
 *   - If env var is not set         → 503 (endpoint disabled in this env).
 *   - If header missing or mismatch → 401.
 *   - Use `timingSafeEqual` to avoid timing oracles.
 *
 * PRIVACY
 *   - No file persistence. The image buffer is held in memory for one
 *     OCR call and discarded when the response returns.
 *   - No console.log of raw_text. Anywhere. Search this file for
 *     console.log — there are none.
 *   - No database insert, no fs write, no log-aggregator calls.
 *   - Response body contains raw OCR text + extracted field values
 *     (i.e. PII for the document owner). This is intentional — the
 *     ENDPOINT IS FOR THE OWNER ONLY, gated by secret. Sharing the
 *     response with anyone else is the caller's choice.
 *   - All shaping happens in-memory; nothing leaves the request scope.
 *
 * RESPONSE SHAPE
 *   {
 *     raw_text: string,                         // full OCR text
 *     raw_text_length: number,
 *     lines: string[],                          // per-line OCR text
 *     mrz_candidate_lines: string[],            // lines looking like TD3
 *     td3: {                                    // runPassportModule output
 *       matched, match_reason, fields:[{field,value,source,review_required,failures}]
 *     },
 *     booklet: {                                // runPassportBookletModule output
 *       matched, match_reason, fields:[{field,value,source,review_required,failures}]
 *     },
 *     brain: null | { ok, error_code?, fields?, document_type?, needs_manual_review? },
 *     r1b_override: { applied: boolean, mrz_match?, would_override?:{family,given} },
 *     strict_validator_drops: [{field, raw_value, reason}],
 *     prod_sha: string                          // from /api/tps/health logic
 *   }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { googleVisionProvider } from '@/lib/ocr/providers/google-vision'
import { isUnusableOcr, isProviderError, type OcrLine } from '@/lib/ocr/types'
import { runPassportModule } from '@/lib/tps/modules/passport'
import { runPassportBookletModule } from '@/lib/tps/modules/passportBooklet'
import { runI94Module } from '@/lib/tps/modules/i94'
import { runEadModule } from '@/lib/tps/modules/ead'
import { runDlModule } from '@/lib/tps/modules/dl'
import { runBrain, isBrainEnabled, type DocumentBrainOutput } from '@/lib/tps/ai/documentBrain'
import { isStrictValidValue } from '@/lib/tps/strictValidators'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Constant-time secret compare. Returns false if env not set OR mismatch.
 * Both inputs are forced to identical length before compare to avoid
 * an early-exit timing leak.
 */
function secretOk(provided: string | null): boolean {
  const expected = process.env.TPS_DEBUG_SECRET
  if (!expected || expected.length < 8) return false
  if (!provided) return false
  // Normalize length: pad whichever is shorter to the other's length with
  // a non-collidable filler. Then compare.
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** "Looks like a TD3 MRZ line" — used for human-readable candidate listing only. */
function looksLikeMrz(line: string): boolean {
  return /^P<[A-Z]{3}/.test(line) || (line.length >= 30 && (line.match(/</g) || []).length >= 5)
}

/**
 * Re-shape a TpsExtractedField into the compact debug form. Keeps the
 * raw value (we ARE in debug mode, gated by secret) and the validation
 * failures the module recorded.
 */
function dumpField(f: TpsExtractedField) {
  return {
    field: f.field,
    raw_value: f.raw_value,
    normalized_value: f.normalized_value,
    source: f.extraction_source,
    source_zone: f.source_zone,
    review_required: f.review_required,
    failures: f.failures,
    passes: f.passes,
    confidence: f.confidence,
  }
}

function dumpModule(m: TpsModuleResult) {
  return {
    module: m.module,
    matched: m.matched,
    match_reason: m.match_reason,
    fields: m.fields.map(dumpField),
    warnings: m.warnings,
    manual_review_required: m.manual_review_required,
    manual_review_reasons: m.manual_review_reasons,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Authentication: secret env required + header match (constant-time).
  if (!process.env.TPS_DEBUG_SECRET) {
    return NextResponse.json(
      { error: 'shape_debug_disabled', detail: 'TPS_DEBUG_SECRET env var not set on this deployment.' },
      { status: 503 },
    )
  }
  const provided = req.headers.get('x-debug-secret')
  if (!secretOk(provided)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 2. Parse multipart upload — same shape as /api/tps/ocr/extract.
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_multipart' }, { status: 400 })
  }
  const file = form.get('file')
  const docHintRaw = form.get('docHint')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 })
  }
  const docHint =
    typeof docHintRaw === 'string' && ['passport', 'i94', 'ead', 'dl'].includes(docHintRaw)
      ? (docHintRaw as 'passport' | 'i94' | 'ead' | 'dl')
      : null

  // 3. Run OCR. Buffer is local to this request — discarded when the
  //    response is sent.
  const buf = Buffer.from(await file.arrayBuffer())
  const mime = file.type || 'image/jpeg'
  const ocr = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: mime })
  if (isUnusableOcr(ocr)) {
    return NextResponse.json(
      isProviderError(ocr)
        ? { blocked: true, error_code: ocr.error.error_code, retryable: ocr.error.retryable, reason: ocr.error.message }
        : { blocked: true, reason: ocr.reason, required_env_vars: ocr.required_env_vars },
    )
  }

  const rawText = ocr.raw_text || ''
  const lineTexts = (ocr.lines || []).map((l: OcrLine) => l.text || '')
  const mrzCandidates = lineTexts.filter(looksLikeMrz)

  // 4. Run every module that could possibly fire for the doc type.
  //    For full visibility we run TD3 + booklet for passport, even though
  //    production route runs booklet only when !td3.matched.
  const document_id = `dbg_${Date.now()}`
  let td3Dump = null
  let bookletDump = null
  let i94Dump = null
  let eadDump = null
  let dlDump = null

  if (!docHint || docHint === 'passport') {
    td3Dump = dumpModule(runPassportModule(ocr, { document_id }))
    bookletDump = dumpModule(runPassportBookletModule(ocr, { document_id }))
  }
  if (!docHint || docHint === 'i94') {
    i94Dump = dumpModule(runI94Module(ocr, { document_id }))
  }
  if (!docHint || docHint === 'ead') {
    eadDump = dumpModule(runEadModule(ocr, { document_id }))
  }
  if (!docHint || docHint === 'dl') {
    dlDump = dumpModule(runDlModule(ocr, { document_id }))
  }

  // 5. Brain (if enabled). Best-effort — failure becomes a dump line, not a 500.
  let brainDump: DocumentBrainOutput | { ok: false; error_code: 'NOT_RUN'; detail: string } = {
    ok: false,
    error_code: 'NOT_RUN',
    detail: isBrainEnabled() ? 'brain_was_enabled_but_not_called_in_debug' : 'TPS_AI_BRAIN_ENABLED is false',
  }
  if (isBrainEnabled()) {
    try {
      brainDump = await runBrain({
        raw_text: rawText,
        lines: lineTexts,
        doc_type_hint: docHint,
      })
    } catch (e: unknown) {
      brainDump = {
        ok: false,
        error_code: 'UNKNOWN',
        detail: e instanceof Error ? e.message : 'brain_threw',
      }
    }
  }

  // 6. Mimic production R1B name override decision — would it fire?
  const MRZ_RE = /\bP<([A-Z]{3})([A-Z<]+?)<<([A-Z<]+?)(?:<<|<\s|$)/m
  const mrzMatch = rawText.match(MRZ_RE)
  const r1bOverride = mrzMatch
    ? {
        applied: true,
        mrz_match: mrzMatch[0],
        would_override: {
          family: mrzMatch[2].replace(/</g, ' ').trim(),
          given: mrzMatch[3].replace(/</g, ' ').trim().split(' ')[0] || '',
        },
      }
    : { applied: false }

  // 7. Mimic wizard-side strict validator: which fields, if emitted by ANY
  //    module above, would be dropped at intake?
  type Drop = { module: string; field: string; raw_value: string; normalized_value: string | null; reason: string }
  const dropsCollector: Drop[] = []
  const checkDrops = (moduleName: string, fields: TpsExtractedField[]): void => {
    for (const f of fields) {
      const v = (typeof f.normalized_value === 'string' && f.normalized_value)
        ? f.normalized_value
        : (typeof f.raw_value === 'string' ? f.raw_value : '')
      if (!v) {
        dropsCollector.push({
          module: moduleName,
          field: f.field,
          raw_value: f.raw_value ?? '',
          normalized_value: f.normalized_value,
          reason: 'empty_after_resolve',
        })
        continue
      }
      if (!isStrictValidValue(f.field, v)) {
        dropsCollector.push({
          module: moduleName,
          field: f.field,
          raw_value: f.raw_value ?? '',
          normalized_value: f.normalized_value,
          reason: 'failed_strict_shape_validator',
        })
      }
    }
  }
  if (td3Dump) checkDrops('td3', td3Dump.fields as unknown as TpsExtractedField[])
  if (bookletDump) checkDrops('booklet', bookletDump.fields as unknown as TpsExtractedField[])
  if (i94Dump) checkDrops('i94', i94Dump.fields as unknown as TpsExtractedField[])
  if (eadDump) checkDrops('ead', eadDump.fields as unknown as TpsExtractedField[])
  if (dlDump) checkDrops('dl', dlDump.fields as unknown as TpsExtractedField[])

  return NextResponse.json(
    {
      doc_hint: docHint,
      ocr_provider: ocr.provider,
      processing_ms: ocr.processing_ms,
      raw_text_length: rawText.length,
      lines_count: lineTexts.length,
      mrz_candidate_lines: mrzCandidates,
      raw_text: rawText,
      lines: lineTexts,
      td3: td3Dump,
      booklet: bookletDump,
      i94: i94Dump,
      ead: eadDump,
      dl: dlDump,
      brain: brainDump,
      brain_enabled: isBrainEnabled(),
      r1b_override: r1bOverride,
      strict_validator_drops: dropsCollector,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
