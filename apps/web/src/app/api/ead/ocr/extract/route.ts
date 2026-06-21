/**
 * POST /api/ead/ocr/extract — EAD document OCR endpoint (Core path).
 *
 * B4: EAD consumes CanonicalDocumentResult (ONE_BRAIN_COMPLETE_CODE_READY).
 *
 * When ONE_CORE_EAD_ENABLED=true:
 *   image → readDocument (Gemini docintel) → arbitrateDocument (Core) →
 *   toEadAnswers (EAD adapter) → EadCoreAnswers JSON
 *
 * When ONE_CORE_EAD_ENABLED=false (default):
 *   Returns 503 — caller falls back to old path (no EAD OCR existed before B4).
 *
 * Privacy: the image is not persisted. In-memory only; GC-eligible after response.
 *
 * Architecture contract:
 *  - No OCR or Gemini call inside toEadAnswers (pure adapter)
 *  - Old path unchanged when flag is OFF
 *  - On Core failure: log, set fallback_used=true, return 500
 *  - No PII in logs — counts and codes only
 *  - invented_fields_count always 0
 *
 * ONE_BRAIN_COMPLETE_CODE_READY: TPS (B1) + Translation (B2) + Re-Parole (B3) + EAD (B4).
 * Not live until ONE_CORE_EAD_ENABLED=true in Vercel + ONE_BRAIN_FINAL_SMOKE_TEST.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runWithUploadCostTally } from '@/lib/v1/ocrCostMetrics'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { readDocument } from '@/lib/docintel/documentFieldReader'
import { buildKnowledgeContext, applyKnowledgeBrainIfEnabled } from '@/lib/canonical/core/knowledgeBrain'
import { docintelToCandidate } from '@/lib/canonical/core/translationAdapter'
import { toEadAnswers } from '@/lib/canonical/core/eadAdapter'
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { preprocessImage } from '@/lib/ocr/image-preprocess'
// CANONICAL_CONTINUITY: persist canonical result after extraction (shadow/enforce modes)
import { persistCanonicalDocument } from '@/lib/canonical/persistence'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

/**
 * Map EAD wizard docHint → docintel document type ID.
 * Covers: passport, EAD card (I-766), I-94.
 * Returns null for unrecognized slots (caller falls back).
 */
function mapEadHintToDocintelId(hint: string): string | null {
  const map: Record<string, string> = {
    passport:   'ua_international_passport',
    booklet:    'ua_internal_passport_booklet',
    ead:        'us_ead',
    i766:       'us_ead',
    i94:        'us_i94',
    i797:       'us_i797',
  }
  return map[hint.toLowerCase()] ?? null
}

export async function POST(req: NextRequest) {
  // P2 shadow cost observability (observe-only): roll up provider calls into one
  // PII-free ocr_upload_cost_summary. Handler result returned UNCHANGED.
  return runWithUploadCostTally({ product: 'ead', route: '/api/ead/ocr/extract' }, () => POST_impl(req))
}

async function POST_impl(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`ead-ocr:${ip}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many OCR requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
    )
  }

  // ── Parse multipart form ─────────────────────────────────────────────────
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data with a "file" field.' },
      { status: 400 },
    )
  }

  const file = form.get('file')
  const docTypeHint =
    ((form.get('docHint') as string | null) ??
      (form.get('doc_type_hint') as string | null) ??
      '').trim()

  if (!file || typeof file === 'string') {
    return NextResponse.json(
      { error: 'Missing "file" field. Send the image as multipart form-data.' },
      { status: 400 },
    )
  }

  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: 'Unsupported image type. Use JPEG, PNG, or WebP.', received_mime: mimeType },
      { status: 415 },
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Image is too large. Maximum 10 MB per file.', size_bytes: file.size },
      { status: 413 },
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const rawBuffer = Buffer.from(arrayBuffer)

  // ── Image preprocessing ──────────────────────────────────────────────────
  const t0 = Date.now()
  const pre = await preprocessImage(rawBuffer, mimeType)
  if (!pre.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: pre.message,
        quality_error: { code: pre.code, message: pre.message },
      },
      { status: 422 },
    )
  }
  const imageBuffer = pre.buffer
  const effectiveMime = pre.mimeType

  // ── Map hint → docintel document ID ─────────────────────────────────────
  const docintelId = mapEadHintToDocintelId(docTypeHint)
  if (!docintelId) {
    return NextResponse.json(
      {
        ok: false,
        error: `docHint '${docTypeHint}' is not covered by the EAD Core path.`,
        hint_received: docTypeHint,
        _flag: 'ONE_CORE_EAD_ENABLED',
        _core: false,
        fallback_used: true,
      },
      { status: 422 },
    )
  }

  // ── Core path: docintel → arbitration → EAD adapter ─────────────────────
  const document_id = `ead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  try {
    // 1. Visual read (Gemini docintel) — the only I/O call in this route
    const coreRead = await readDocument(imageBuffer, effectiveMime, docintelId, { timeoutMs: 40_000, product: 'ead' })

    if (!coreRead.ok || !Array.isArray(coreRead.fields) || coreRead.fields.length === 0) {
      console.warn('[B4/EAD/Core] docintel returned no fields:', {
        hint: docTypeHint,
        docintelId,
        ok: coreRead.ok,
        fieldCount: Array.isArray(coreRead.fields) ? coreRead.fields.length : 0,
      })
      return NextResponse.json(
        {
          ok: false,
          error: 'Core document read returned no fields. Please try a higher-resolution image.',
          _flag: 'ONE_CORE_EAD_ENABLED',
          _core: true,
          core_status: 'failed',
          fallback_used: false,
        },
        { status: 200 },
      )
    }

    // 2. Convert docintel output → Core FieldCandidates
    const candidates = coreRead.fields.map((f) => docintelToCandidate(f, 1))

    // 3. Arbitrate: candidates → CanonicalField[] (Core's single judgment).
    //    Knowledge Brain via the shared helper (D2 authority, flag-gated; EAD is non-UA → ukrainianDoc=false).
    const canonicalFields = applyKnowledgeBrainIfEnabled(
      candidates,
      buildKnowledgeContext({ docTypeId: docintelId, product: 'ead' }),
    )

    if (canonicalFields.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Core arbitration produced no usable fields.',
          _flag: 'ONE_CORE_EAD_ENABLED',
          _core: true,
          core_status: 'failed',
          fallback_used: false,
        },
        { status: 200 },
      )
    }

    // 4. Build CanonicalDocumentResult
    const canonical: CanonicalDocumentResult = {
      documentSessionId: document_id,
      product: 'ead',
      docType: docintelId,
      fields: canonicalFields,
      hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
      createdAt: new Date().toISOString(),
      requiresReview: canonicalFields.some((f) => f.reviewRequired),
    }

    // 5. Map to EAD answers (pure, no I/O)
    const eadAnswers = toEadAnswers(canonical)

    // ── CANONICAL_CONTINUITY: persist the canonical result (shadow/enforce modes) ──
    // SAFE carriage: on success we return the persisted UUID so the wizard can resend
    // it to /api/ead/generate-packet. On shadow persist failure we return null (NEVER a
    // fabricated id) — a wrong/stale id is worse than none. In enforce mode a persist
    // failure is a hard 503 (the generate route requires a valid id).
    let canonicalDocumentId: string | null = null
    const continuityMode = getCanonicalMode('ead')
    if (continuityMode !== 'off') {
      try {
        const persisted = await persistCanonicalDocument(canonical, document_id)
        canonicalDocumentId = persisted.id
        console.info('[canonical/continuity] persisted EAD', {
          event: 'canonical_persisted',
          canonical_document_id: persisted.id,
          fields_hash: persisted.fieldsHash.slice(0, 8),
          mode: continuityMode,
        })
      } catch {
        if (continuityMode === 'enforce') {
          return NextResponse.json(
            { error: 'canonical_persistence_failed' },
            { status: 503 },
          )
        }
        // shadow: PII-free divergence log; carriage degrades to null (no fabricated id)
        console.warn('[canonical/continuity] EAD persist failed (shadow — non-blocking)', { mode: continuityMode })
        canonicalDocumentId = null
      }
    } else {
      console.info('[canonical/continuity] continuity=off — EAD persistence skipped')
    }

    // Log for monitoring (no PII — counts and codes only)
    console.log('[B4/EAD/Core]', {
      doc_type: docintelId,
      hint: docTypeHint,
      field_count: canonicalFields.length,
      review_required: eadAnswers.review_required,
      uncertain_fields: eadAnswers.uncertain_fields,
      core_status: eadAnswers.core_status,
      invented_fields_count: eadAnswers.invented_fields_count, // must be 0
      processing_ms: Date.now() - t0,
    })

    return NextResponse.json(
      {
        ok: true,
        ...eadAnswers,
        document_id,
        // CANONICAL_CONTINUITY: null when persistence is off or failed in shadow.
        // The wizard captures this and resends it to /api/ead/generate-packet.
        canonical_document_id: canonicalDocumentId,
        doc_type_hint: docTypeHint,
        _core: true,
        _flag: 'ONE_CORE_EAD_ENABLED',
        processing_ms: Date.now() - t0,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Core-Status': eadAnswers.core_status,
          'X-Core-Fields': String(canonicalFields.length),
          'X-Core-ReviewRequired': String(eadAnswers.review_required),
          'X-Invented-Fields': String(eadAnswers.invented_fields_count), // must be 0
        },
      },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[B4/EAD/Core] Core failed, fallback_used=true:', msg)
    return NextResponse.json(
      {
        ok: false,
        error: 'Core extraction failed.',
        detail: msg,
        _flag: 'ONE_CORE_EAD_ENABLED',
        _core: true,
        core_status: 'failed',
        fallback_used: true,
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json(
    {
      route: '/api/ead/ocr/extract',
      method: 'POST',
      content_type: 'multipart/form-data',
      flag: 'ONE_CORE_EAD_ENABLED',
      fields: {
        file: 'JPEG / PNG / WebP image (≤ 10 MB)',
        docHint: 'passport | booklet | ead | i766 | i94 | i797',
      },
      note: 'Returns EadCoreAnswers when flag is ON. EAD Core OCR is new in B4.',
    },
    { status: 405, headers: { Allow: 'POST' } },
  )
}
