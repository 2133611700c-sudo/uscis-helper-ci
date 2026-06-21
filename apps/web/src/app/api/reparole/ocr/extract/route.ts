/**
 * POST /api/reparole/ocr/extract — Re-Parole document OCR endpoint (Core path).
 *
 * B3: Re-Parole consumes CanonicalDocumentResult (ONE_BRAIN_PARTIAL_3_PRODUCTS).
 *
 * When ONE_CORE_REPAROLE_ENABLED=true:
 *   image → readDocument (Gemini docintel) → arbitrateDocument (Core) →
 *   toReParoleCoreAnswers (Re-Parole adapter) → ReParoleCoreAnswers JSON
 *
 * When ONE_CORE_REPAROLE_ENABLED=false (default):
 *   Falls through to old TPS OCR path at /api/tps/ocr/extract.
 *   This route returns a redirect or proxied response so the wizard
 *   continues working without any UI changes.
 *
 * Privacy: the image is not persisted. In-memory only; GC-eligible after response.
 *
 * Architecture contract:
 *  - No OCR or Gemini call inside toReParoleCoreAnswers (pure adapter)
 *  - Old path unchanged when flag is OFF
 *  - On Core failure: log, set fallback_used=true, return error (caller retries old path)
 *  - No PII in logs — counts and codes only
 *
 * ONE_BRAIN_PARTIAL_3_PRODUCTS: TPS (B1) + Translation (B2) + Re-Parole (B3).
 * Not done: EAD (B4). ONE_BRAIN complete requires B4.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runWithUploadCostTally } from '@/lib/v1/ocrCostMetrics'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { readDocument } from '@/lib/docintel/documentFieldReader'
import { buildKnowledgeContext, applyKnowledgeBrainIfEnabled } from '@/lib/canonical/core/knowledgeBrain'
import { docintelToCandidate } from '@/lib/canonical/core/translationAdapter'
import { toReParoleCoreAnswers } from '@/lib/canonical/core/reParoleAdapter'
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { preprocessImage } from '@/lib/ocr/image-preprocess'
import { isUnusableOcr } from '@/lib/ocr/types'
// MRZ_WIRED: inject MRZ authority for international passport
import { googleVisionProvider } from '@/lib/ocr/providers/google-vision'
import { mrzCandidatesFromText } from '@/lib/canonical/core/mrzAuthority'
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
 * Map Re-Parole wizard docHint → docintel document type ID.
 * Only Ukrainian identity documents are covered (passport, booklet).
 * US-form slots (i94, ead, dl) return null — Core does not cover them yet.
 */
function mapReParoleHintToDocintelId(hint: string): string | null {
  const map: Record<string, string> = {
    passport: 'ua_international_passport',
    booklet:  'ua_internal_passport_booklet',
  }
  return map[hint] ?? null
}

export async function POST(req: NextRequest) {
  // P2 shadow cost observability (observe-only): roll up provider calls into one
  // PII-free ocr_upload_cost_summary. Handler result returned UNCHANGED.
  return runWithUploadCostTally({ product: 'reparole', route: '/api/reparole/ocr/extract' }, () => POST_impl(req))
}

async function POST_impl(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`reparole-ocr:${ip}`, 20, 60_000)
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
  const docintelId = mapReParoleHintToDocintelId(docTypeHint)
  if (!docintelId) {
    // US-form slots (i94, ead, dl) not covered by Core yet.
    // Caller should fall back to /api/tps/ocr/extract for these.
    return NextResponse.json(
      {
        ok: false,
        error: `docHint '${docTypeHint}' is not covered by the Re-Parole Core path. Use /api/tps/ocr/extract.`,
        hint_received: docTypeHint,
        _flag: 'ONE_CORE_REPAROLE_ENABLED',
        _core: false,
        fallback_used: true,
      },
      { status: 422 },
    )
  }

  // ── Core path: docintel → arbitration → Re-Parole adapter ───────────────
  const document_id = `reparole_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  try {
    // 1. For international passport: run Vision OCR in parallel with Gemini docintel
    //    to obtain raw text for MRZ parsing. MRZ_WIRED: the MRZ (machine-readable zone)
    //    carries authoritative values for passport identity fields.
    //    Vision OCR is lightweight (text detection only) and runs concurrently.
    //    If Vision OCR fails, MRZ candidates are simply not injected (graceful degradation).
    const mrzRawTextPromise: Promise<string> =
      docintelId === 'ua_international_passport'
        ? googleVisionProvider
            .extractText({ imageBuffer, mimeType: effectiveMime })
            .then((r) => (!isUnusableOcr(r) ? r.raw_text : ''))
            .catch(() => '')
        : Promise.resolve('')

    // 2. Visual read (Gemini docintel) and Vision OCR run in parallel
    const [coreRead, mrzRawText] = await Promise.all([
      readDocument(imageBuffer, effectiveMime, docintelId, { timeoutMs: 40_000, product: 'reparole' }),
      mrzRawTextPromise,
    ])

    if (!coreRead.ok || !Array.isArray(coreRead.fields) || coreRead.fields.length === 0) {
      console.warn('[B3/ReParole/Core] docintel returned no fields:', {
        hint: docTypeHint,
        docintelId,
        ok: coreRead.ok,
        fieldCount: Array.isArray(coreRead.fields) ? coreRead.fields.length : 0,
      })
      return NextResponse.json(
        {
          ok: false,
          error: 'Core document read returned no fields. Please try a higher-resolution image.',
          _flag: 'ONE_CORE_REPAROLE_ENABLED',
          _core: true,
          core_status: 'failed',
          fallback_used: false,
        },
        { status: 200 },
      )
    }

    // 3. Convert docintel output → Core FieldCandidates
    const candidates = coreRead.fields.map((f) => docintelToCandidate(f, 1))

    // 4. MRZ_WIRED: inject MRZ authority candidates for international passport.
    //    Valid MRZ: confidence=0.99, wins over Gemini for controlled fields.
    //    Invalid MRZ: confidence=0.3, reviewRequired=true — never silently falls back.
    //    Missing MRZ: empty array — arbitrateDocument sees no MRZ candidates.
    if (docintelId === 'ua_international_passport' && mrzRawText) {
      const mrzCandidates = mrzCandidatesFromText(mrzRawText)
      if (mrzCandidates.length > 0) {
        candidates.push(...mrzCandidates)
        console.info('[B3/ReParole/Core] MRZ_WIRED: injected', mrzCandidates.length,
          'MRZ candidates, mrzCheckValid:', mrzCandidates[0]?.mrzCheckValid)
      }
    }

    // 5. Arbitrate: candidates → CanonicalField[] (Core's single judgment).
    //    Knowledge Brain applied via the shared helper (D2 authority, flag-gated, OFF=identical).
    const canonicalFields = applyKnowledgeBrainIfEnabled(
      candidates,
      buildKnowledgeContext({ docTypeId: docintelId, product: 'reparole' }),
    )

    if (canonicalFields.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Core arbitration produced no usable fields.',
          _flag: 'ONE_CORE_REPAROLE_ENABLED',
          _core: true,
          core_status: 'failed',
          fallback_used: false,
        },
        { status: 200 },
      )
    }

    // 6. Build CanonicalDocumentResult
    const canonical: CanonicalDocumentResult = {
      documentSessionId: document_id,
      product: 'reparole',
      docType: docintelId,
      fields: canonicalFields,
      hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
      createdAt: new Date().toISOString(),
      requiresReview: canonicalFields.some((f) => f.reviewRequired),
    }

    // 6b. CANONICAL_CONTINUITY: persist the canonical result (shadow/enforce modes).
    //     The persisted row id is carried by the wizard into generate-packet so the
    //     packet route loads the immutable canonical instead of reconstructing from DTO.
    //     SAFE CARRIAGE: on persist failure in shadow we return canonical_document_id=null
    //     (never fabricate) — a wrong/stale id is worse than none. In enforce mode a persist
    //     failure is fatal (503) so generate-packet never runs without a verifiable canonical.
    //     Mirrors the TPS extract route persist pattern.
    let reParoleCanonicalDocumentId: string | null = null
    const continuityMode = getCanonicalMode('reparole')
    if (continuityMode !== 'off') {
      try {
        const persisted = await persistCanonicalDocument(canonical, document_id)
        reParoleCanonicalDocumentId = persisted.id
        console.info('[canonical/continuity] persisted ReParole', {
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
        // Shadow: log PII-free divergence, return null id — never fabricate.
        console.warn('[canonical/continuity] ReParole persist failed (shadow — non-blocking)', { mode: continuityMode })
      }
    } else {
      console.info('[canonical/continuity] continuity=off — ReParole persistence skipped')
    }

    // 7. Map to Re-Parole answers (pure, no I/O)
    const reParoleAnswers = toReParoleCoreAnswers(canonical)

    // Log for monitoring (no PII — counts and codes only)
    console.log('[B3/ReParole/Core]', {
      doc_type: docintelId,
      hint: docTypeHint,
      field_count: canonicalFields.length,
      review_required: reParoleAnswers.review_required,
      uncertain_fields: reParoleAnswers.uncertain_fields,
      core_status: reParoleAnswers.core_status,
      processing_ms: Date.now() - t0,
    })

    return NextResponse.json(
      {
        ok: true,
        ...reParoleAnswers,
        document_id,
        // CANONICAL_CONTINUITY: persisted canonical row id (null when off / shadow persist failed).
        canonical_document_id: reParoleCanonicalDocumentId,
        doc_type_hint: docTypeHint,
        _core: true,
        _flag: 'ONE_CORE_REPAROLE_ENABLED',
        processing_ms: Date.now() - t0,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Core-Status': reParoleAnswers.core_status,
          'X-Core-Fields': String(canonicalFields.length),
          'X-Core-ReviewRequired': String(reParoleAnswers.review_required),
        },
      },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[B3/ReParole/Core] Core failed, fallback_used=true:', msg)
    return NextResponse.json(
      {
        ok: false,
        error: 'Core extraction failed. Use /api/tps/ocr/extract as fallback.',
        detail: msg,
        _flag: 'ONE_CORE_REPAROLE_ENABLED',
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
      route: '/api/reparole/ocr/extract',
      method: 'POST',
      content_type: 'multipart/form-data',
      flag: 'ONE_CORE_REPAROLE_ENABLED',
      fields: {
        file: 'JPEG / PNG / WebP image (≤ 10 MB)',
        docHint: 'passport | booklet (Ukrainian identity docs only)',
      },
      note: 'Returns ReParoleCoreAnswers when flag is ON. Use /api/tps/ocr/extract when flag is OFF or for US-form slots.',
    },
    { status: 405, headers: { Allow: 'POST' } },
  )
}
