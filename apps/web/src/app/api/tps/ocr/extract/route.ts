/**
 * POST /api/tps/ocr/extract — TPS document OCR endpoint.
 *
 * SPRINT-OCR Day 1, Block B.
 *
 * Accepts a multipart upload of a single document image (passport, I-94,
 * or EAD card), runs Google Vision DOCUMENT_TEXT_DETECTION on it through
 * the existing OCR provider, and returns the raw `OcrResult` (words +
 * lines + bboxes) for downstream agents to consume.
 *
 * This route does NOT yet do field extraction, classification, or
 * confidence routing — those come in later blocks. It is a thin wrapper
 * around the OCR provider so we can prove the Vision key is wired in
 * production before building the rest of the pipeline.
 *
 * Privacy: the route does NOT persist the image. After the response is
 * returned, the in-memory buffer is dropped. Persistence (Supabase
 * Storage) is a later block.
 *
 * Reuse: the OCR provider, types, and image-preprocess helpers are
 * shared with the Translation Engine v5 — see docs/translation/
 * DOCUMENT_TRANSLATION_ENGINE_V5.md §3.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { googleVisionProvider } from '@/lib/ocr/providers/google-vision'
import { docAIProvider, isDocAIEnabled } from '@/lib/docai/provider'
import { logOcrRun } from '@/lib/tps/ocrAudit'
import { sanitizeBrainRawForAudit } from '@/lib/tps/ocrAuditSanitize'
import { processDocument as processDocAI } from '@/lib/docai/client'
import { runDualOcrCrossref } from '@/lib/tps/ai/dualOcrCrossref'
import { readBookletViaVision, visionReadsToFields } from '@/lib/tps/ai/geminiVisionArbiter'
import { isUnusableOcr, isProviderError } from '@/lib/ocr/types'
import { httpStatusForOcrError } from '@/lib/ocr/ocrErrors'
import { preprocessImage } from '@/lib/ocr/image-preprocess'
import { runPassportModule } from '@/lib/tps/modules/passport'
import { runPassportBookletModule } from '@/lib/tps/modules/passportBooklet'
import { runI94Module } from '@/lib/tps/modules/i94'
import { runEadModule } from '@/lib/tps/modules/ead'
import { runDlModule } from '@/lib/tps/modules/dl'
import { runI797Module } from '@/lib/tps/modules/i797'
import { runMilitaryIdModule } from '@/lib/tps/modules/militaryId'
import { runBirthCertificateModule } from '@/lib/tps/modules/birthCertificate'
import type { TpsModuleResult, TpsExtractedField } from '@/lib/tps/types'
import { applyContract } from '@/lib/tps/ocr/documentContracts'
import { isShadowEnabled } from '@/lib/canonical'
import { summarizeTpsReviewShift } from '@/lib/canonical/liveShadow'
import {
  runBrain,
  validateBrainField,
  isBrainEnabled,
  type DocumentBrainOutput,
} from '@/lib/tps/ai/documentBrain'
import { postExtractNormalize } from '@/lib/tps/ocr/postExtractNormalize'
// P2 OCR cost OBSERVABILITY (shadow, observe-only): roll up per-upload provider
// calls + est cost. Does NOT change output/behaviour — emits one summary event.
import { runWithUploadCostTally } from '@/lib/v1/ocrCostMetrics'
// ONE BRAIN B1: TPS → Core default for UA-identity docs (Phase 2.2)
import { readDocument } from '@/lib/docintel/documentFieldReader'
import { buildKnowledgeContext, applyKnowledgeBrainIfEnabled } from '@/lib/canonical/core/knowledgeBrain'
import { docintelToCandidate } from '@/lib/canonical/core/translationAdapter'
import { mapTpsHintToDocintelId, canonicalToTpsModuleResult } from '@/lib/canonical/core/tpsAdapter'
import { buildCanonicalResult } from '@/lib/canonical/core/buildCanonicalResult'
// CANONICAL_CONTINUITY: persist canonical result after extraction (shadow/enforce modes)
import { persistCanonicalDocument } from '@/lib/canonical/persistence'
import { classifyCriticality, isOcrFieldSafetyEnabled } from '@/lib/documentSafety/applyOcrFieldSafety'
import { protectOcrField } from '@/lib/documentSafety/ocrFieldSafetyGate'
// MRZ_WIRED: inject MRZ authority for international passport in Core path
import { mrzCandidatesFromText, parseMrzFromText } from '@/lib/canonical/core/mrzAuthority'
// POLICY_WIRED: document-class guards (2026-06-03 benchmark findings)
import {
  checkImageQuality,
  applyHardCaseReviewOverride,
  applyCertificateRoleGuard,
  tpsHintToDocumentClass,
  isUkrainianIdentityDoc,
} from '@/lib/canonical/core/documentClassPolicy'

// Vision REST call needs full Node runtime (Buffer + fetch with timeout).
export const runtime = 'nodejs'
export const maxDuration = 60  // dual-OCR crossref: Vision ~5s + DocAI ~3s + DeepSeek ~7s + overhead
export const dynamic = 'force-dynamic'

// 10 MB hard limit per image. USCIS recommends pages < 5 MB.
const MAX_BYTES = 10 * 1024 * 1024

// Accept only inline images. PDFs are rejected here — they should be
// pre-split client-side or via a different endpoint.
// SVG / HTML / scripts are NOT in the list — fail-closed against the
// disguised-payload class of attacks.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg', // some clients use the non-standard /jpg subtype
  'image/png',
  'image/webp',
  // HEIC / HEIF — iPhone default. Sharp can transcode in preprocessing.
  'image/heic',
  'image/heif',
])

export async function POST(req: NextRequest) {
  // P2 shadow cost observability: wrap the handler so every provider call inside
  // rolls up into ONE ocr_upload_cost_summary (PII-free). The handler result is
  // returned UNCHANGED — no output/behaviour change.
  return runWithUploadCostTally({ product: 'tps', route: '/api/tps/ocr/extract' }, () => POST_impl(req))
}

async function POST_impl(req: NextRequest) {
  // ── Rate limit: 20 OCR calls per minute per IP. Vision is paid; we
  //    do not want a single user (or bot) hammering it.
  const ip = getClientIP(req)
  const rl = await rateLimit(`tps-ocr:${ip}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many OCR requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
    )
  }

  // ── Parse multipart form
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
  // Accept both names — wizard uploads send `docHint`, legacy / curl scripts
  // and evidence tooling use `doc_type_hint`. Either way the value is the
  // wizard's slot id (passport / i94 / ead / tps_notice / ead_old / photo).
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
      {
        error: 'Unsupported image type. Use JPEG, PNG, or WebP.',
        received_mime: mimeType,
        allowed: Array.from(ALLOWED_MIME),
      },
      { status: 415 },
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: 'Image is too large. Maximum 10 MB per file.',
        size_bytes: file.size,
        max_bytes: MAX_BYTES,
      },
      { status: 413 },
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const rawBuffer = Buffer.from(arrayBuffer)

  // ── Image-quality gate (PP.T2 — reuses the v5 translation engine's
  //    preprocessor). This catches blurry / too-small / corrupt photos
  //    BEFORE we pay for a Vision call AND returns a structured error
  //    that DocumentUploadScreen can render in the user's language
  //    ("plохо видно — снимите ещё раз"). Phone photos with EXIF
  //    rotation get auto-rotated, and oversized images get resized to
  //    ≤2048px so Vision doesn't time out on 50-MP camera shots.
  const t0 = Date.now()
  const pre = await preprocessImage(rawBuffer, mimeType)
  if (!pre.ok) {
    return NextResponse.json(
      {
        error: pre.message,
        quality_error: {
          code: pre.code,            // 'too_small' | 'too_blurry' | 'too_dark' | 'too_bright' | 'corrupt_image' | 'unsupported_file_type'
          message: pre.message,      // user-safe localized in the client
        },
        ok: false,
      },
      {
        status: 422,
        headers: {
          'X-OCR-QualityGate': pre.code,
        },
      },
    )
  }
  // Use the normalised buffer + MIME. The original is dropped here —
  // no global cache, no logging, GC eligible after response.
  const imageBuffer = pre.buffer
  const effectiveMime = pre.mimeType

  // ── POLICY_WIRED: checkImageQuality — document-class size guard ─────────
  // Runs BEFORE OCR/Vision call. Blocks 82KB marriage apostille (proved insufficient).
  // Warns on images >2MB (503 risk on Gemini). Only applies to Ukrainian identity docs.
  if (isUkrainianIdentityDoc(docTypeHint)) {
    const docClass = tpsHintToDocumentClass(docTypeHint)
    const qualityCheck = checkImageQuality(docClass, imageBuffer.byteLength)
    if (qualityCheck.action === 'needs_better_scan') {
      console.warn('[documentClassPolicy] needs_better_scan:', qualityCheck.reason, 'hint:', docTypeHint)
      return NextResponse.json(
        {
          status: 'needs_better_scan',
          review_required: true,
          reason: qualityCheck.reason,
          fields: null,
          ok: false,
          error: 'Image quality insufficient for reliable extraction. Please upload a higher-resolution scan.',
          quality_error: { code: 'needs_better_scan', message: qualityCheck.reason },
        },
        { status: 200 },
      )
    }
    if (qualityCheck.action === 'resize') {
      // Log resize warning — do not block extraction, but flag for monitoring
      console.warn('[documentClassPolicy] image_large_resize_recommended:', qualityCheck.reason, 'hint:', docTypeHint)
    }
  }

  // ── Call OCR provider (DocAI when enabled, Vision otherwise)
  const ocrProvider = isDocAIEnabled() ? docAIProvider : googleVisionProvider
  const result = await ocrProvider.extractText({ imageBuffer, mimeType: effectiveMime })

  if (isUnusableOcr(result)) {
    // A provider FAILURE (rate-limit / 5xx / billing / timeout) is honest non-2xx
    // with a typed body — NOT a 503 "not configured" (P1 honest degradation).
    if (isProviderError(result)) {
      const err = result.error
      return NextResponse.json(
        { ok: false, error_code: err.error_code, retryable: err.retryable,
          ...(typeof err.retry_after_seconds === 'number' ? { retry_after_seconds: err.retry_after_seconds } : {}),
          message: err.message },
        { status: httpStatusForOcrError(err.error_code),
          ...(err.retryable && typeof err.retry_after_seconds === 'number'
            ? { headers: { 'Retry-After': String(err.retry_after_seconds) } } : {}) },
      )
    }
    return NextResponse.json(
      {
        error: result.reason,
        required_env_vars: result.required_env_vars,
        configured: false,
      },
      { status: 503 },
    )
  }

  // ── Run the per-document extraction module if a hint was supplied.
  //    Hint-based routing keeps the response shape stable: caller asks
  //    "this is a passport" and gets passport-specific TpsExtractedField[].
  //    Without a hint we return raw OCR only.
  //
  //    For doc_type_hint=passport we try BOTH formats:
  //      1. TD3 MRZ (international Ukrainian passport / загранпаспорт)
  //      2. Internal Ukrainian passport-booklet (паспорт-книжка) — if TD3
  //         not located.
  //    This is critical for real Ukrainian users — many never had a
  //    travel passport and only have the internal booklet, which is
  //    explicitly accepted by USCIS I-821 Instructions as a national
  //    identity document with photograph.
  const document_id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  let moduleResult: TpsModuleResult | null = null
  let crossrefStatus = 'not_applicable'
  let visionArbiterStatus = process.env.TPS_GEMINI_VISION_ARBITER_ENABLED === 'true' ? 'enabled' : 'off'
  // Track the OCR result actually used by the module — when we retry
  // with a rotated image, we want downstream Brain calls to see the
  // text from the successful rotation, not the first failed attempt.
  let effectiveOcrResult = result

  // ── ONE BRAIN B1: Core — default for UA-identity docs (Phase 2.2) ──────────
  // UA: passport, booklet, birth, military → Core (readDocument → arbitration → tpsAdapter).
  // US-form slots (i94/ead/dl/i797): no docintelId mapping → old path unchanged.
  // Errors: coreStatus='error', moduleResult=null → falls through to old path.
  let coreStatus: 'skipped_no_mapping' | 'skipped_no_fields' | 'ok' | 'error' = 'skipped_no_mapping'
  let oldModuleForComparison: TpsModuleResult | null = null
  // CANONICAL_CONTINUITY: tracks the persisted canonical document id for this request
  let tpsCanonicalDocumentId: string | null = null
  const docintelId = mapTpsHintToDocintelId(docTypeHint)
  if (!docintelId) {
    coreStatus = 'skipped_no_mapping'
  } else {
    try {
      const coreRead = await readDocument(imageBuffer, effectiveMime, docintelId, { timeoutMs: 40_000, product: 'tps' })
      if (coreRead.ok && Array.isArray(coreRead.fields) && coreRead.fields.length > 0) {
        const candidates = coreRead.fields.map((f) => docintelToCandidate(f, 1))
        if (docintelId === 'ua_international_passport') {
          const mrzCandidates = mrzCandidatesFromText(result.raw_text ?? '')
          if (mrzCandidates.length > 0) {
            candidates.push(...mrzCandidates)
            console.info('[Core/TPS] MRZ_WIRED: injected', mrzCandidates.length,
              'MRZ candidates, mrzCheckValid:', mrzCandidates[0]?.mrzCheckValid)
          }
        }
        const canonicalFields = applyKnowledgeBrainIfEnabled(
          candidates,
          buildKnowledgeContext({ docTypeId: docintelId, product: 'tps' }),
        )
        if (canonicalFields.length > 0) {
          moduleResult = canonicalToTpsModuleResult(canonicalFields, docTypeHint, document_id)
          coreStatus = 'ok'
          console.info('[Core/TPS] used Core for', docTypeHint, 'fields:', moduleResult.fields.length,
            'review_required:', moduleResult.fields.filter(f => f.review_required).length)
          // CANONICAL_CONTINUITY: persist the canonical result (shadow/enforce modes)
          const tpsContinuityMode = getCanonicalMode('tps')
          if (tpsContinuityMode !== 'off') {
            try {
              const tpsCanonicalResult = buildCanonicalResult({
                documentSessionId: document_id,
                product: 'tps',
                docType: docTypeHint,
                fields: canonicalFields,
                createdAt: new Date().toISOString(),
              })
              const persisted = await persistCanonicalDocument(tpsCanonicalResult, document_id)
              tpsCanonicalDocumentId = persisted.id
              console.info('[canonical/continuity] persisted TPS', {
                event: 'canonical_persisted',
                canonical_document_id: persisted.id,
                fields_hash: persisted.fieldsHash.slice(0, 8),
                mode: tpsContinuityMode,
              })
            } catch {
              if (tpsContinuityMode === 'enforce') {
                return NextResponse.json(
                  { error: 'canonical_persistence_failed' },
                  { status: 503 }
                )
              }
              console.warn('[canonical/continuity] TPS persist failed (shadow — non-blocking)', { mode: tpsContinuityMode })
            }
          } else {
            console.info('[canonical/continuity] continuity=off — TPS persistence skipped')
          }
        } else {
          coreStatus = 'skipped_no_fields'
        }
      } else {
        coreStatus = 'skipped_no_fields'
      }
    } catch (e: any) {
      console.error('[Core/TPS] error, falling back to old path:', e?.message ?? e)
      coreStatus = 'error'
      moduleResult = null
    }
  }

  // Old path: runs when Core is not applicable (US-form slots) or failed.
  if (moduleResult === null) {
  switch (docTypeHint) {
    case 'passport': {
      let td3 = runPassportModule(result, { document_id })
      let booklet: TpsModuleResult | null = null

      // 2026-05-20 T3PS_ROBUST_OCR P0 (revised): the booklet module
      // matches as soon as it finds ANY field, so a 180-rotated
      // international passport with a readable visible Cyrillic zone
      // (УКРАЇНА, ІВАНІВ, ІВАНЕНКО…) trips booklet.matched=true and
      // skips the rotation retry — but the MRZ block is unreadable
      // upside-down so passport_number/passport_expiration_date/sex
      // are missing. Retry condition is therefore: TD3 didn't match
      // AND the upright result lacks an MRZ-derived passport_number.
      // That covers both the never-matched and the booklet-only
      // (visible-zone-only) cases. Cost: at most 3 extra Vision calls,
      // only on passports where MRZ wasn't located.
      if (!td3.matched) {
        booklet = runPassportBookletModule(result, { document_id })
      }

      // ── Dual-OCR cross-reference for booklet handwritten Cyrillic ──
      // When booklet matched: also call DocAI, then DeepSeek cross-ref.
      // This proven approach reconstructs surname from two OCR readings.
      if (booklet?.matched && process.env.DUAL_OCR_CROSSREF !== 'false') {
        crossrefStatus = 'attempted'
        try {
          const docaiResult = await processDocAI(imageBuffer, effectiveMime)
          if (docaiResult.ok) {
            crossrefStatus = 'docai_ok'
            const crossref = await runDualOcrCrossref(result.raw_text, docaiResult.text)
            if (crossref.ok) {
              crossrefStatus = 'crossref_ok'
              // Merge high/medium confidence cross-ref fields into booklet
              const fieldMap: Record<string, string> = {
                surname: 'family_name', city_of_birth: 'city_of_birth',
                province_of_birth: 'province_of_birth', patronymic: 'middle_name',
              }
              for (const [crKey, tpsKey] of Object.entries(fieldMap)) {
                const cr = (crossref as any)[crKey] as { value: string | null; confidence: string; review_required: boolean }
                if (!cr?.value || cr.confidence === 'garbage') continue
                // Reject partial patronymic fragments (e.g. "Yovych" = just "-ович" suffix, no name root)
                if (crKey === 'patronymic' && cr.value.length < 8) continue
                const existing = booklet!.fields.find((f) => f.field === tpsKey)
                // Only override if crossref has better value or existing is empty
                // Override if: no existing, existing empty, or existing from weaker source
                const weakSources = new Set(['ocr_keyword', 'ocr_visual', 'ai_brain'])
                const shouldOverride = !existing || !existing.normalized_value ||
                  weakSources.has(existing.extraction_source)
                if (shouldOverride) {
                  const newField: TpsExtractedField = {
                    field: tpsKey,
                    raw_value: cr.value,
                    normalized_value: cr.value,
                    confidence: cr.confidence === 'high' ? 0.9 : cr.confidence === 'medium' ? 0.7 : 0.5,
                    extraction_source: 'dual_ocr_crossref',
                    // Booklet handwritten Cyrillic: ALWAYS review-required
                    review_required: true,
                    source_document_id: document_id,
                    source_zone: 'dual_ocr_crossref',
                    bbox: null,
                    language_layer: 'cyrillic',
                    ocr_word_ids: [],
                    passes: [],
                    failures: [],
                    user_corrected: false,
                  }
                  if (existing) {
                    Object.assign(existing, newField)
                  } else {
                    booklet!.fields.push(newField)
                  }
                }
              }
            }
          }
        } catch (crossrefErr: any) {
          // Log but never crash
          console.error('[dual-ocr-crossref] failed:', crossrefErr?.message || crossrefErr)
        }
      }

      const hasPassportNumberFromMrz = (mr: TpsModuleResult | null): boolean =>
        !!mr?.fields?.some(
          (f) => f.field === 'passport_number' && f.extraction_source === 'ocr_mrz',
        )
      const mrzAlreadyFound =
        hasPassportNumberFromMrz(td3) || hasPassportNumberFromMrz(booklet)
      // Count booklet identity fields (non-empty values) — used to pick the best
      // rotation for an INTERNAL passport booklet, which has no MRZ to anchor on.
      const bookletFieldCount = (mr: TpsModuleResult | null): number =>
        mr?.fields?.filter((f) => (f.normalized_value ?? '').trim().length >= 2).length ?? 0
      let bestRot: { booklet: TpsModuleResult; ocr: typeof result } | null = null
      // Rotate when the MRZ was not found (sparse OCR) OR a booklet matched but
      // carries almost no identity fields (rotated internal-passport booklet).
      if (!td3.matched && !mrzAlreadyFound && (result.lines.length < 8 || (booklet?.matched && bookletFieldCount(booklet) < 2))) {
        for (const angle of [90, 180, 270] as const) {
          try {
            const sharp = (await import('sharp')).default
            const rotatedBuffer = await sharp(imageBuffer).rotate(angle).jpeg({ quality: 85 }).toBuffer()
            const rotatedResult = await ocrProvider.extractText({
              imageBuffer: rotatedBuffer,
              mimeType: 'image/jpeg',
            })
            if (isUnusableOcr(rotatedResult)) continue
            const tryTd3 = runPassportModule(rotatedResult, { document_id })
            if (tryTd3.matched) {
              td3 = tryTd3
              effectiveOcrResult = rotatedResult
              break
            }
            const tryBooklet = runPassportBookletModule(rotatedResult, { document_id })
            if (tryBooklet.matched && hasPassportNumberFromMrz(tryBooklet)) {
              booklet = tryBooklet
              effectiveOcrResult = rotatedResult
              break
            }
            // Booklet without MRZ: remember the rotation with the most identity fields.
            if (bookletFieldCount(tryBooklet) > (bestRot ? bookletFieldCount(bestRot.booklet) : 0)) {
              bestRot = { booklet: tryBooklet, ocr: rotatedResult }
            }
            // Booklet matched but still no MRZ — keep trying other angles.
          } catch {
            // sharp unavailable / Vision failure — stop trying rotations.
            break
          }
        }
      }

      // Adopt the best rotation for an MRZ-less booklet if it beats the upright read.
      if (!td3.matched && bestRot && bookletFieldCount(bestRot.booklet) > bookletFieldCount(booklet)) {
        booklet = bestRot.booklet
        effectiveOcrResult = bestRot.ocr
      }

      if (td3.matched) {
        moduleResult = td3
      } else {
        if (!booklet) booklet = runPassportBookletModule(effectiveOcrResult, { document_id })
        if (booklet.matched) {
          moduleResult = booklet
        } else {
          // Neither matched — surface the more informative reason so the
          // user-facing UI can localize properly.
          moduleResult = td3.match_reason === 'mrz_not_located'
            ? booklet // (matched=false, booklet_signals_missing) — better hint
            : td3
        }
      }
      break
    }
    case 'i94': {
      // 2026-05-21 FIX_TPS_ROTATION_PARITY_I94: real users photograph
      // their I-94 sideways or upside-down. The rule module needs
      // CBP labels ('Most Recent Date of Entry', 'Admit Until Date',
      // 'Class of Admission') in their normal positions; rotation
      // mangles them and the module returns 0 fields. Mirror the
      // passport/DL rotation retry: if first pass yields <3 fields,
      // try 90/180/270 and pick the rotation with the most fields.
      let i94Result = runI94Module(result, { document_id })
      const i94FieldCount = (mr: TpsModuleResult | null): number => mr?.fields?.length ?? 0
      if (i94FieldCount(i94Result) < 3 && result.lines.length < 8) {
        for (const angle of [90, 180, 270] as const) {
          try {
            const sharp = (await import('sharp')).default
            const rotatedBuffer = await sharp(imageBuffer)
              .rotate(angle)
              .jpeg({ quality: 85 })
              .toBuffer()
            const rotatedResult = await ocrProvider.extractText({
              imageBuffer: rotatedBuffer,
              mimeType: 'image/jpeg',
            })
            if (isUnusableOcr(rotatedResult)) continue
            const tryI94 = runI94Module(rotatedResult, { document_id })
            if (i94FieldCount(tryI94) > i94FieldCount(i94Result)) {
              i94Result = tryI94
              effectiveOcrResult = rotatedResult
              // Stop early if we have a strong match (≥5 fields).
              if (i94FieldCount(tryI94) >= 5) break
            }
          } catch {
            break
          }
        }
      }
      moduleResult = i94Result
      break
    }
    case 'ead': {
      // 2026-05-21 FIX_TPS_ROTATION_PARITY_EAD: symmetric retry for
      // EAD photos. The EAD card layout is fixed (USCIS-standardized),
      // so labels appear at predictable positions when upright. Rotation
      // breaks anchor matching; retry at 90/180/270.
      let eadResult = runEadModule(result, { document_id })
      const eadFieldCount = (mr: TpsModuleResult | null): number => mr?.fields?.length ?? 0
      if (eadFieldCount(eadResult) < 3 && result.lines.length < 8) {
        for (const angle of [90, 180, 270] as const) {
          try {
            const sharp = (await import('sharp')).default
            const rotatedBuffer = await sharp(imageBuffer)
              .rotate(angle)
              .jpeg({ quality: 85 })
              .toBuffer()
            const rotatedResult = await ocrProvider.extractText({
              imageBuffer: rotatedBuffer,
              mimeType: 'image/jpeg',
            })
            if (isUnusableOcr(rotatedResult)) continue
            const tryEad = runEadModule(rotatedResult, { document_id })
            if (eadFieldCount(tryEad) > eadFieldCount(eadResult)) {
              eadResult = tryEad
              effectiveOcrResult = rotatedResult
              if (eadFieldCount(tryEad) >= 5) break
            }
          } catch {
            break
          }
        }
      }
      moduleResult = eadResult
      break
    }
    case 'dl': {
      // 2026-05-20: deterministic anchor parser. We deliberately do
      // NOT call Brain for DL because DeepSeek's safety classifier
      // refuses JSON output on US driver license content, causing
      // brain_status='error' / brain_error_code='INVALID_JSON' on
      // every prod call. The DL layout is AAMVA-standardized and the
      // rule module reliably extracts 9 fields (dl_number, ln, fn,
      // dob, sex, hgt, wgt, eyes, hair) + the 4 address parts.
      //
      // 2026-05-21 FIX_TPS_DL_ROTATION_AND_ADDRESS_EXTRACTION: real
      // users photograph their DL sideways. Google Vision OCR's text
      // comes out unreadable when the card is rotated 90/180/270,
      // so the AAMVA labels (DL/LN/FN/DOB/HGT/WGT/EYES/HAIR) don't
      // match anchors and the address block is unparseable. Mirror
      // the passport rotation retry (a77727d): try 0° first, then
      // 90/180/270 if either (a) module didn't match at all or
      // (b) module matched but failed to find the address — the
      // address is the primary product value of the DL slot.
      let dlResult = runDlModule(result, { document_id })
      const dlHasAddressStreet = (mr: TpsModuleResult | null): boolean =>
        !!mr?.fields?.some((f) => f.field === 'us_address_street')
      const dlGood = (mr: TpsModuleResult | null): boolean =>
        !!mr && mr.matched && dlHasAddressStreet(mr)
      if (!dlGood(dlResult) && result.lines.length < 8) {
        for (const angle of [90, 180, 270] as const) {
          try {
            const sharp = (await import('sharp')).default
            const rotatedBuffer = await sharp(imageBuffer)
              .rotate(angle)
              .jpeg({ quality: 85 })
              .toBuffer()
            const rotatedResult = await ocrProvider.extractText({
              imageBuffer: rotatedBuffer,
              mimeType: 'image/jpeg',
            })
            if (isUnusableOcr(rotatedResult)) continue
            const tryDl = runDlModule(rotatedResult, { document_id })
            // Best rotation = matched AND address recovered → stop.
            if (dlGood(tryDl)) {
              dlResult = tryDl
              effectiveOcrResult = rotatedResult
              break
            }
            // Soft accept: this rotation found strictly more fields than
            // whatever we have so far. Keep iterating in case a later
            // rotation produces a good-quality match, but don't waste
            // the better partial result.
            if (tryDl.fields.length > dlResult.fields.length) {
              dlResult = tryDl
              effectiveOcrResult = rotatedResult
            }
          } catch {
            // sharp unavailable / Vision failure — stop trying.
            break
          }
        }
      }
      moduleResult = dlResult
      break
    }
    case 'i797': {
      // I-797/I-797C Notice of Action. Deterministic rule extraction.
      // No rotation retry — notices are standard letter format.
      // No Brain — receipt numbers and A-numbers are deterministic patterns.
      moduleResult = runI797Module(result, { document_id })
      break
    }
    // BUG-4c FIX (2026-05-24): wizard sends docHint='booklet' for the
    // internal Ukrainian passport slot, but there was no case for it →
    // booklet module NEVER ran → patronymic, city_of_birth, province
    // were never extracted. The booklet module was only reachable as a
    // fallback inside case 'passport' when MRZ failed.
    case 'booklet': {
      moduleResult = runPassportBookletModule(result, { document_id })

      // ── Gemini vision arbiter (flag-gated, OFF by default) — VISION-FIRST ──
      // Reads handwritten Cyrillic directly from the IMAGE; KMU-55 transliterates.
      // Vision-on-pixels beats the text crossref, so when it reads the page
      // (anchor = family_name) we SKIP the slower DocAI+DeepSeek crossref below
      // (~10s saved). Candidate-only (review_required); overrides all sources
      // except user edits and MRZ; failure → fall through to crossref. PAID
      // Gemini tier required for client PII.
      let visionReadPage = false
      if (process.env.TPS_GEMINI_VISION_ARBITER_ENABLED === 'true' && moduleResult?.matched) {
        try {
          const vision = await readBookletViaVision(imageBuffer, effectiveMime)
          if (vision.ok) {
            const protectedSources = new Set(['user_corrected', 'user_input', 'ocr_mrz'])
            const vfields = visionReadsToFields(vision.fields, document_id)
            for (const vf of vfields) {
              const existing = moduleResult.fields.find((f) => f.field === vf.field)
              if (!existing) { moduleResult.fields.push(vf); continue }
              if (!protectedSources.has(existing.extraction_source)) Object.assign(existing, vf)
            }
            // Anchor: if vision read the surname, it read the page → skip crossref.
            visionReadPage = vfields.some((f) => f.field === 'family_name')
            visionArbiterStatus = `ok:${vision.model}:${vision.ms}ms:${vfields.length}f`
          } else {
            visionArbiterStatus = `failed:${vision.error ?? 'unknown'}`
          }
        } catch (e: any) {
          console.error('[gemini-vision-arbiter:booklet]', e?.message)
          visionArbiterStatus = 'error'
        }
      }

      // ── Dual-OCR cross-reference — fallback when vision did NOT read the page
      //    (flag OFF, vision failed, or surname unreadable). Skipped when vision
      //    succeeded, saving the DocAI + DeepSeek round-trips.
      if (!visionReadPage && moduleResult?.matched && process.env.DUAL_OCR_CROSSREF !== 'false') {
        crossrefStatus = 'attempted'
        try {
          const docaiResult = await processDocAI(imageBuffer, effectiveMime)
          if (docaiResult.ok) {
            crossrefStatus = 'docai_ok'
            const crossref = await runDualOcrCrossref(effectiveOcrResult.raw_text, docaiResult.text)
            if (crossref.ok) {
              crossrefStatus = 'crossref_ok'
              const fieldMap: Record<string, string> = {
                surname: 'family_name', city_of_birth: 'city_of_birth',
                province_of_birth: 'province_of_birth', patronymic: 'middle_name',
              }
              for (const [crKey, tpsKey] of Object.entries(fieldMap)) {
                const cr = (crossref as any)[crKey] as { value: string | null; confidence: string; review_required: boolean }
                if (!cr?.value || cr.confidence === 'garbage') continue
                // Reject partial patronymic fragments (e.g. "Yovych" = just "-ович" suffix, no name root)
                if (crKey === 'patronymic' && cr.value.length < 8) continue
                const existing = moduleResult!.fields.find((f) => f.field === tpsKey)
                // Override if: no existing, existing empty, or existing from weaker source
                const weakSources = new Set(['ocr_keyword', 'ocr_visual', 'ai_brain'])
                const shouldOverride = !existing || !existing.normalized_value ||
                  weakSources.has(existing.extraction_source)
                if (shouldOverride) {
                  const newField: TpsExtractedField = {
                    field: tpsKey, raw_value: cr.value, normalized_value: cr.value,
                    confidence: cr.confidence === 'high' ? 0.9 : cr.confidence === 'medium' ? 0.7 : 0.5,
                    // Booklet handwritten Cyrillic: ALWAYS review-required regardless
                    // of DeepSeek confidence. Crossref improves accuracy but cannot
                    // eliminate the inherent risk of handwritten OCR misreads.
                    extraction_source: 'dual_ocr_crossref', review_required: true,
                    source_document_id: document_id, source_zone: 'dual_ocr_crossref',
                    bbox: null, language_layer: 'cyrillic', ocr_word_ids: [],
                    passes: [], failures: [], user_corrected: false,
                  }
                  if (existing) Object.assign(existing, newField)
                  else moduleResult!.fields.push(newField)
                }
              }
            }
          }
        } catch (e: any) { console.error('[dual-ocr-crossref:booklet]', e?.message) }
      }
      break
    }
    // ── P0 FIX (2026-05-24): three wizard slot IDs had NO case in this
    // switch, so rule-based extraction never ran for them. The contract
    // firewall (documentContracts.ts) would then kill all fields as
    // UNKNOWN_SLOT (for i797_or_ead) or surface only Brain output (for
    // tps_notice / ead_old). Users saw "Not found — enter manually" for
    // every field despite uploading a valid document.
    case 'tps_notice': {
      // Rereg TPS Approval/Receipt Notice = same document family as I-797.
      // No rotation retry — notices are standard letter format.
      moduleResult = runI797Module(result, { document_id })
      break
    }
    case 'i797_or_ead': {
      // Init-path combined slot: user uploads either I-797 OR EAD card.
      // Strategy: try BOTH modules, pick the one with more fields.
      const i797Try = runI797Module(result, { document_id })
      let eadTry = runEadModule(result, { document_id })
      // Rotation retry for EAD half (same logic as case 'ead').
      const eadTryCount = (mr: TpsModuleResult | null): number => mr?.fields?.length ?? 0
      if (eadTryCount(eadTry) < 3) {
        for (const angle of [90, 180, 270] as const) {
          try {
            const sharp = (await import('sharp')).default
            const rotatedBuffer = await sharp(imageBuffer)
              .rotate(angle).jpeg({ quality: 85 }).toBuffer()
            const rotatedResult = await ocrProvider.extractText({
              imageBuffer: rotatedBuffer, mimeType: 'image/jpeg',
            })
            if (isUnusableOcr(rotatedResult)) continue
            const tryEad2 = runEadModule(rotatedResult, { document_id })
            if (eadTryCount(tryEad2) > eadTryCount(eadTry)) {
              eadTry = tryEad2
              effectiveOcrResult = rotatedResult
              if (eadTryCount(tryEad2) >= 5) break
            }
          } catch { break }
        }
      }
      // Winner: whichever matched with more fields. I-797 wins ties
      // because it carries receipt_number and uscis_online_account
      // which EAD doesn't have.
      if (i797Try.matched && (!eadTry.matched || i797Try.fields.length >= eadTry.fields.length)) {
        moduleResult = i797Try
      } else if (eadTry.matched) {
        moduleResult = eadTry
      } else {
        // Neither matched — return the one with more fields for Brain
        // to augment, or i797Try if tied (better field coverage).
        moduleResult = i797Try.fields.length >= eadTry.fields.length ? i797Try : eadTry
      }
      break
    }
    case 'ead_old': {
      // Rereg previous EAD card. Same extraction as case 'ead' but
      // the wizard sends docHint='ead_old'.
      let eadOldResult = runEadModule(result, { document_id })
      const eadOldCount = (mr: TpsModuleResult | null): number => mr?.fields?.length ?? 0
      if (eadOldCount(eadOldResult) < 3) {
        for (const angle of [90, 180, 270] as const) {
          try {
            const sharp = (await import('sharp')).default
            const rotatedBuffer = await sharp(imageBuffer)
              .rotate(angle).jpeg({ quality: 85 }).toBuffer()
            const rotatedResult = await ocrProvider.extractText({
              imageBuffer: rotatedBuffer, mimeType: 'image/jpeg',
            })
            if (isUnusableOcr(rotatedResult)) continue
            const tryEadOld = runEadModule(rotatedResult, { document_id })
            if (eadOldCount(tryEadOld) > eadOldCount(eadOldResult)) {
              eadOldResult = tryEadOld
              effectiveOcrResult = rotatedResult
              if (eadOldCount(tryEadOld) >= 5) break
            }
          } catch { break }
        }
      }
      moduleResult = eadOldResult
      break
    }
    case 'military_id': {
      // Ukrainian military booklet (Військовий квиток).
      // Hard-case: review_required=true on every field always.
      // Never populates I-94/A-number/EAD — slot firewall enforces this.
      moduleResult = runMilitaryIdModule(result, { document_id })
      break
    }
    case 'birth_certificate': {
      // Ukrainian birth certificate (Свідоцтво про народження).
      // Hard-case: review_required=true ALWAYS. Role-grounded extraction.
      // wrong_person_risk flag is set when child/parent blocks are ambiguous.
      moduleResult = runBirthCertificateModule(result, { document_id })
      break
    }
    default:
      moduleResult = null
  }
  } // end: if (moduleResult === null) — old path

  // ── DS.2 — Optional AI Brain fallback. Runs ONLY when:
  //   (a) operator has set TPS_AI_BRAIN_ENABLED=1 in the environment, AND
  //   (b) the rule-based module produced no result OR fewer than 5 fields,
  //       OR high-value targeted fields are missing from rule output.
  // Privacy: only raw_text + lines (no image, no PII bundle beyond
  // what Vision already extracted) is sent to DeepSeek.
  // Validators (validateBrainField) are applied to each Brain field
  // before it's surfaced — anything failing is left as requires_review
  // and is never auto-merged into PDF data.
  let brainResult: DocumentBrainOutput | null = null
  const ruleFieldsCount = moduleResult?.fields?.length ?? 0

  // P1 FIX: Brain threshold must account for contract filtering.
  // Without this, I-94 module finds 5+ fields → Brain skips → contract
  // kills some → only 4 survive → identity/place fields never extracted.
  // Pre-compute how many fields will survive the contract to decide
  // whether Brain should run.
  const contractPreview = applyContract(
    docTypeHint,
    moduleResult ? moduleResult.fields.map((f) => f.field) : [],
    null, // Brain hasn't run yet, no doc_type classification
  )
  const postContractFieldCount = contractPreview.accepted_field_keys.length

  // 2026-05-22: Targeted Brain Fill — high-value fields that rule modules
  // cannot extract from their primary structured source (e.g. MRZ for
  // passport has no middle_name or country_of_birth). If any of these
  // are missing after rule extraction, Brain runs even when the rule
  // module met the general threshold. The slot firewall still blocks
  // forbidden fields; the merge strategy still lets rule-based fields
  // win on conflicts. This targets the zero-manual-entry product goal
  // without lowering the global threshold.
  const TARGETED_BRAIN_FIELDS: Record<string, string[]> = {
    passport: ['middle_name', 'country_of_birth', 'province_of_birth'],
    booklet: ['city_of_birth', 'province_of_birth', 'middle_name'],
    // P2 FIX: I-94 rule module often misses name/place fields due to
    // CBP format variations. Brain should fill identity + port of entry.
    i94: ['place_of_last_entry', 'family_name', 'given_name'],
    // P2 FIX: EAD rule module sometimes duplicates family_name as given_name.
    ead: ['given_name'],
    ead_old: ['given_name'],
  }
  // Use POST-CONTRACT field keys for targeted check — pre-contract keys
  // include fields that contract will kill (false "already have it").
  const postContractKeys = new Set(contractPreview.accepted_field_keys)
  const targetedMissing = (TARGETED_BRAIN_FIELDS[docTypeHint] ?? [])
    .filter((f) => !postContractKeys.has(f))

  // P1 FIX: use postContractFieldCount instead of ruleFieldsCount.
  // Before this fix, I-94 had 5+ pre-contract fields → Brain skipped →
  // contract killed 1+ → only 4 fields survived → gaps never filled.
  const shouldTryBrain =
    isBrainEnabled() &&
    (moduleResult === null || moduleResult.matched === false || postContractFieldCount < 5 ||
     targetedMissing.length > 0)
  if (shouldTryBrain) {
    try {
      // Use effectiveOcrResult so Brain sees the text from the rotation
      // that the passport rule module actually succeeded on.
      brainResult = await runBrain({
        raw_text: effectiveOcrResult.raw_text,
        lines: effectiveOcrResult.lines.map((l: { text: string }) => l.text),
        doc_type_hint: docTypeHint || null,
      })
    } catch (e: unknown) {
      // Never let Brain failure crash the OCR response. Surface as a
      // soft warning — the user still gets rule-based output + can edit.
      brainResult = {
        ok: false,
        error_code: 'UNKNOWN',
        detail: e instanceof Error ? e.message : 'unknown',
      }
    }
  }

  // Build extra TpsExtractedField[] from validated Brain output. Each
  // brain-derived field is marked extraction_source='ai_brain' so the
  // review screen can render an "AI" badge and the user explicitly
  // confirms it.
  let brainFields: TpsExtractedField[] = []
  let brainSkipped: Array<{ field: string; reason: string }> = []
  if (brainResult?.ok) {
    const r = brainResult.result
    for (const [k, f] of Object.entries(r.fields)) {
      if (!f) continue
      const validation = validateBrainField(k, f)
      if (!validation.ok) {
        brainSkipped.push({ field: k, reason: validation.reason ?? 'invalid' })
        continue
      }
      brainFields.push({
        field: k,
        raw_value: f.source_value,
        normalized_value: f.final_value,
        extraction_source: 'ai_brain',
        source_document_id: document_id,
        source_zone: f.source_line ?? 'ai_brain',
        bbox: null,
        language_layer: 'mixed',
        confidence: f.confidence,
        review_required: f.requires_review,
        ocr_word_ids: [],
        passes: [],
        failures: [],
        user_corrected: false,
      })
    }
  }

  // Merge strategy: rule-based fields win when both sources have the
  // same field key (rule-based is deterministic and audited). Brain
  // fills the gaps.
  let mergedModule = moduleResult
  if (brainFields.length > 0) {
    const existingKeys = new Set<string>(moduleResult?.fields?.map((f) => f.field) ?? [])
    const additions = brainFields.filter((f) => !existingKeys.has(f.field))
    mergedModule = {
      module:
        (moduleResult?.module as string) ||
        (brainResult?.ok ? `ai_brain:${brainResult.result.document_type}` : 'ai_brain'),
      matched: (moduleResult?.matched ?? false) || additions.length > 0,
      match_reason: moduleResult?.match_reason ?? 'ai_brain_fallback',
      fields: [...(moduleResult?.fields ?? []), ...additions],
      manual_review_required:
        Boolean(moduleResult?.manual_review_required) ||
        (brainResult?.ok ? brainResult.result.needs_manual_review : false),
    } as TpsModuleResult
  }

  // ── R1B name-stability override ────────────────────────────────────────
  // Brain's choice of source_value for name fields is non-deterministic on
  // passport scans where only part of the MRZ is OCR'd (rule passport
  // module fails its strict TD3 check, but the upper line "P<UKR..." is
  // usually still in raw_text). OCR observed "Sergi" vs "Taras"
  // varying across runs of the same image. Fix: scan raw_text once for
  // any MRZ-shape line, pull surname + given Latin tokens directly, and
  // force-override Brain's name fields with that deterministic value.
  // KMU-55 is unnecessary — MRZ is already Latin and authoritative.
  //
  // Phase 1 cutover invariant: on a successful Document Core read
  // (coreStatus==='ok') the canonical result ALREADY carries the MRZ-derived,
  // arbitrated name — MRZ candidates are injected into Core at the read seam
  // above. Re-parsing raw_text MRZ here and force-overriding would be a
  // post-canonical MRZ override (forbidden) and would MUTATE the canonical value
  // (e.g. controlling-Latin "IVANENKO" → title-cased "Ivanenko"). This
  // deterministic R1B fix exists only to stabilize the LEGACY Brain path's
  // non-deterministic name source, so it must run ONLY when Core did not produce
  // the result.
  if (coreStatus !== 'ok' && mergedModule && effectiveOcrResult.raw_text) {
    const MRZ = /\bP<([A-Z]{3})([A-Z<]+?)<<([A-Z<]+?)(?:<<|<\s|$)/m
    const m = effectiveOcrResult.raw_text.match(MRZ)
    if (m) {
      const mrzSurname = m[2].replace(/</g, ' ').trim().replace(/\s+/g, ' ')
      const mrzGiven = m[3].replace(/</g, ' ').trim().replace(/\s+/g, ' ').split(' ')[0] || ''
      const titleCase = (s: string) =>
        s.toLowerCase().replace(/(^|\s|-)([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
      const overrides: Record<string, string> = {}
      if (mrzSurname && /^[A-Z]+$/.test(mrzSurname.replace(/\s/g, ''))) {
        overrides.family_name = titleCase(mrzSurname)
      }
      if (mrzGiven && /^[A-Z]+$/.test(mrzGiven)) {
        overrides.given_name = titleCase(mrzGiven)
      }
      if (Object.keys(overrides).length > 0) {
        mergedModule = {
          ...mergedModule,
          fields: mergedModule.fields.map((f) =>
            overrides[f.field]
              ? {
                  ...f,
                  raw_value: overrides[f.field],
                  normalized_value: overrides[f.field],
                  extraction_source: 'ocr_mrz' as const,
                  source_zone: 'mrz_line_1',
                }
              : f,
          ),
        }
      }
    }
  }

  // ── Document Slot Firewall ─────────────────────────────────────────────
  // Apply the per-slot allowed/forbidden field contract BEFORE we surface
  // anything to the wizard. This blocks two real failure modes seen in
  // production:
  //
  //   1. Brain hallucinating fields the document can't possibly contain
  //      (e.g. an A-number from a passport upload).
  //   2. User dropping the wrong document into the wrong slot (e.g.
  //      passport into the I-94 input). The Brain's `document_type`
  //      classification doesn't match what the slot expects → flag
  //      `slot_mismatch: true` so the wizard can warn instead of
  //      silently merging unrelated fields.
  //
  // The contract is the single source of truth; defining a new field
  // requires explicitly listing it under the right slot.
  const rawDocTypeFromBrain =
    brainResult?.ok ? brainResult.result.document_type : null
  const allMergedKeys = mergedModule
    ? Array.from(new Set(mergedModule.fields.map((f) => f.field)))
    : []
  const contract = applyContract(docTypeHint, allMergedKeys, rawDocTypeFromBrain)
  if (mergedModule && contract.rejected_fields.length > 0) {
    const acceptedSet = new Set(contract.accepted_field_keys)
    mergedModule = {
      ...mergedModule,
      fields: mergedModule.fields.filter((f) => acceptedSet.has(f.field)),
    }
  }

  // ── Module-level slot mismatch (Brain-independent) ─────────────────────
  //
  // The contract's slot_mismatch flag fires only when Brain successfully
  // classified the document with a type that disagrees with the slot.
  // But when Brain fails (INVALID_JSON, timeout, off) AND the rule module
  // for the requested slot ALSO explicitly says matched=false, we still
  // have strong evidence the user uploaded the wrong document — the rule
  // module looked for the slot's anchors and didn't find them. In that
  // case the wizard should still show the wrong-slot warning instead of
  // silently rendering an empty Step 5. Observed in production when a
  // California DL is uploaded into the I-94 slot: rule module returned
  // 'too_few_i94_anchors_matched', Brain returned INVALID_JSON, and the
  // user saw zero fields with no explanation.
  const moduleSaysWrong =
    docTypeHint !== '' &&
    moduleResult !== null &&
    moduleResult.matched === false &&
    effectiveOcrResult.raw_text.length > 30  // there IS readable text — just not for this slot
  const effectiveSlotMismatch = contract.slot_mismatch || moduleSaysWrong

  // ── Knowledge normalization pass ─────────────────────────────────────
  // Normalize extracted fields through @uscis-helper/knowledge before
  // returning to the wizard. This ensures oblast genitive→nominative,
  // settlement type expansion, and other canonical rules are applied
  // at extraction time, not deferred to PDF write time.
  let normalizationMeta = {
    normalizations_applied: [] as string[],
    conflicts: [] as Array<{ field: string; reason: string }>,
    low_confidence: [] as Array<{ field: string; confidence: number }>,
    rejected_fields: [] as string[],
    diagnostics: [] as Array<{
      field: string
      status: 'normalized' | 'rejected' | 'passed'
      reason: string
      input_raw: string
      input_normalized: string | null
      output_normalized: string | null
      manual_required: boolean
    }>,
  }
  if (mergedModule && mergedModule.fields.length > 0) {
    normalizationMeta = postExtractNormalize(mergedModule.fields)
    if (normalizationMeta.rejected_fields.length > 0) {
      const rejected = new Set(normalizationMeta.rejected_fields)
      mergedModule = {
        ...mergedModule,
        fields: mergedModule.fields.filter((f) => !rejected.has(f.field)),
      }
    }
  }

  // ── POLICY_WIRED: post-extraction document-class guards ─────────────────
  // Guards run AFTER all extraction/normalization, BEFORE response.
  // Only applied to Ukrainian identity documents. US-form slots are excluded.
  let policyGuardStatus: 'not_applicable' | 'applied' | 'role_guard_triggered' = 'not_applicable'
  if (mergedModule && isUkrainianIdentityDoc(docTypeHint)) {
    const docClass = tpsHintToDocumentClass(docTypeHint)

    // Wire 2: applyHardCaseReviewOverride — forces review_required=true on
    // all fields for hard-case classes (birth certs, marriage apostille, unknown).
    // Benchmark evidence: gemini-2.5-pro set review_required=false while returning
    // wrong person on birth_cert_soviet — most dangerous failure mode observed.
    if (isUkrainianIdentityDoc(docTypeHint)) {
      const hardCaseCheck = applyHardCaseReviewOverride(docClass, { review_required: false })
      if ('override_reason' in hardCaseCheck) {
        // Hard case: force review_required=true on ALL fields
        console.info('[documentClassPolicy] applyHardCaseReviewOverride applied:', docClass, hardCaseCheck.override_reason)
        mergedModule = {
          ...mergedModule,
          fields: mergedModule.fields.map((f) => ({ ...f, review_required: true })),
          manual_review_required: true,
        }
        policyGuardStatus = 'applied'
      }
    }

    // Wire 3: applyCertificateRoleGuard — rejects generic family_name without role
    // grounding on certificate documents (birth/marriage).
    const fieldRecord: Record<string, unknown> = {}
    for (const f of mergedModule.fields) {
      fieldRecord[f.field] = f.normalized_value ?? f.raw_value
    }
    const roleCheck = applyCertificateRoleGuard(docClass, fieldRecord)
    if (!roleCheck.safe) {
      console.warn('[documentClassPolicy] applyCertificateRoleGuard triggered:', roleCheck.reason, 'forced review on:', roleCheck.forcedReviewFields)
      // Force review_required=true on the fields that lack role grounding
      const forcedSet = new Set(roleCheck.forcedReviewFields)
      mergedModule = {
        ...mergedModule,
        fields: mergedModule.fields.map((f) =>
          forcedSet.has(f.field) ? { ...f, review_required: true } : f
        ),
        manual_review_required: true,
      }
      policyGuardStatus = 'role_guard_triggered'
    }
  }

  // ── Top-level diagnostics so the wizard, monitors, and audit scripts
  // can see at a glance what happened to extraction without parsing the
  // nested brain object. No PII surfaced — counts and codes only.
  const finalFieldKeys = mergedModule
    ? Array.from(new Set(mergedModule.fields.map((f) => f.field))).sort()
    : []
  const finalFieldCount = finalFieldKeys.length
  const brainStatus: 'off' | 'skipped' | 'ran' | 'error' = !isBrainEnabled()
    ? 'off'
    : !shouldTryBrain
      ? 'skipped'
      : brainResult?.ok
        ? 'ran'
        : 'error'
  const brainErrorCode = brainResult && !brainResult.ok ? brainResult.error_code : null
  const brainAddedCount = brainFields.length
  const brainTrigger: 'off' | 'threshold' | 'targeted' | 'no_match' | 'not_needed' =
    !isBrainEnabled()
      ? 'off'
      : moduleResult === null || moduleResult.matched === false
        ? 'no_match'
        : postContractFieldCount < 5
          ? 'threshold'
          : targetedMissing.length > 0
          ? 'targeted'
          : 'not_needed'

  const brainRejectedByField = new Map<string, string>()
  for (const skipped of brainSkipped) {
    brainRejectedByField.set(skipped.field, skipped.reason)
  }

  const brainRawAudit =
    brainResult && brainResult.ok
      ? {
          provider: isDocAIEnabled() ? 'google_docai' : 'google_vision',
          crossref_status: crossrefStatus,
          vision_arbiter_status: visionArbiterStatus,
          brain_status: brainStatus,
          brain_trigger: brainTrigger,
          brain_document_type: brainResult.result.document_type,
          brain_document_type_confidence: brainResult.result.document_type_confidence,
          brain_needs_manual_review: brainResult.result.needs_manual_review,
          brain_warnings: brainResult.result.warnings,
          brain_fields: Object.entries(brainResult.result.fields).map(([field, value]) => {
            if (!value) return { field, present: false }
            const rejectedReason = brainRejectedByField.get(field) ?? null
            return {
              field,
              present: true,
              source_value: value.source_value,
              final_value: value.final_value,
              confidence: value.confidence,
              requires_review: value.requires_review,
              source_line: value.source_line ?? null,
              inferred: !value.source_line,
              validation_status: rejectedReason ? `rejected:${rejectedReason}` : 'passed',
            }
          }),
          validated_skipped: brainSkipped,
          contract_rejected_fields: contract.rejected_fields,
          normalization_rejected_fields: normalizationMeta.rejected_fields,
          normalization_diagnostics: normalizationMeta.diagnostics.map((d) => ({
            field: d.field,
            status: d.status,
            reason: d.reason,
            manual_required: d.manual_required,
            input_raw: d.input_raw,
            output_normalized: d.output_normalized,
          })),
        }
      : {
          provider: isDocAIEnabled() ? 'google_docai' : 'google_vision',
          crossref_status: crossrefStatus,
          vision_arbiter_status: visionArbiterStatus,
          brain_status: brainStatus,
          brain_trigger: brainTrigger,
          brain_error_code: brainErrorCode,
          validated_skipped: brainSkipped,
          contract_rejected_fields: contract.rejected_fields,
          normalization_rejected_fields: normalizationMeta.rejected_fields,
          normalization_diagnostics: normalizationMeta.diagnostics.map((d) => ({
            field: d.field,
            status: d.status,
            reason: d.reason,
            manual_required: d.manual_required,
            input_raw: d.input_raw,
            output_normalized: d.output_normalized,
          })),
        }

  // ── Successful OCR. Build a response with just what downstream agents
  //    need; we do NOT include the raw API response (could leak provider
  //    internals or echoed key).

  // ── Audit: write to Supabase tps_ocr_audit (must await on serverless)
  await logOcrRun({
    provider: isDocAIEnabled() ? 'google_docai' : 'google_vision',
    doc_type_hint: docTypeHint || null,
    document_id,
    text_length: result.raw_text.length,
    page_count: result.pages.length,
    field_count: finalFieldCount,
    rejected_fields: normalizationMeta.rejected_fields,
    success: true,
    processing_ms: result.processing_ms,
    brain_status: brainStatus,
    // P0 PII safety: strip applicant values (source_value/final_value/input_raw/
    // source_line text, names/DOB/doc numbers/addresses) from the audit object
    // BEFORE it is persisted. The writer also re-sanitizes (defence in depth).
    // This does NOT change what the user receives from OCR — only the audit row.
    brain_raw: sanitizeBrainRawForAudit(brainRawAudit),
  })

  // ── ONE_BRAIN_SHADOW (default OFF) — observe-only. Build the canonical result
  //    from the SAME live fields and log how the canonical review policy would
  //    differ from the live module flags. NEVER affects the response: flag-gated
  //    AND fully try/catch-guarded. This collects the real-traffic parity signal
  //    we need before any migration onto the single canonical brain.
  if (mergedModule && isShadowEnabled()) {
    try {
      console.info(
        '[ONE_BRAIN_SHADOW]',
        summarizeTpsReviewShift(mergedModule.fields, {
          documentSessionId: document_id,
          docType: contract.detected_document_type ?? docTypeHint ?? 'unknown',
          createdAt: new Date().toISOString(),
        }),
      )
    } catch {
      /* shadow must never affect extraction */
    }
  }

  // ── C3: Global OCR field safety guard (OCR_FIELD_SAFETY_ENABLED, default OFF) ──
  // OFF ⇒ skipped (byte-identical). ON ⇒ an unsafe critical field loses its FINAL value
  // (normalized_value→null; raw_value preserved as the candidate) and is forced to review +
  // manual. Legacy (non-Core) reads are untrusted for critical identity/document fields.
  if (isOcrFieldSafetyEnabled() && mergedModule) {
    const safetyDocClass = tpsHintToDocumentClass(docTypeHint)
    let anyUnsafeCritical = false
    const guardedFields = mergedModule.fields.map((f) => {
      const criticality = classifyCriticality(f.field)
      if (criticality !== 'critical_identity' && criticality !== 'critical_document') return f
      const r = protectOcrField({
        flow: coreStatus === 'ok' ? 'tps_core' : 'tps_legacy',
        field_name: f.field,
        criticality,
        document_class: safetyDocClass,
        value_present: (f.normalized_value ?? '').trim() !== '',
        candidate_value_present: ((f.normalized_value ?? f.raw_value) ?? '').trim() !== '',
        review_required: f.review_required === true,
        legacy_reader: coreStatus !== 'ok',
        strong_source_anchor: f.extraction_source === 'ocr_mrz',
      })
      if (r.final_value_allowed) return f
      anyUnsafeCritical = true
      return { ...f, normalized_value: null, review_required: true }
    })
    mergedModule = {
      ...mergedModule,
      fields: guardedFields,
      manual_review_required: mergedModule.manual_review_required || anyUnsafeCritical,
    }
  }

  // ── CANONICAL CUTOVER (GAP-2): fallback semantics ───────────────────────
  // On Core success (coreStatus==='ok') the canonical path produced the
  // fields — NO legacy fallback was taken. On a TECHNICAL Core failure
  // (coreStatus==='error') the legacy switch ran instead → that IS a
  // fallback and must be reported as one; we never hide a fallback under
  // an 'ok' status. 'skipped_no_mapping' (US-form slots: i94/ead/dl/i797 —
  // never had Core) and 'skipped_no_fields' (Core ran, read nothing) are
  // not technical failures of an applicable Core, so they are not flagged
  // as fallbacks; core_path reflects which path actually produced fields.
  const fallbackUsed = coreStatus === 'error'
  const corePath: 'canonical' | 'legacy_fallback' | 'legacy' =
    coreStatus === 'ok' ? 'canonical' : coreStatus === 'error' ? 'legacy_fallback' : 'legacy'

  return NextResponse.json(
    {
      ok: true,
      provider: result.provider,
      doc_type_hint: docTypeHint || null,
      document_id,
      // CANONICAL_CONTINUITY: canonical document id for session linkage (null when mode=off or persist failed in shadow mode)
      canonical_document_id: tpsCanonicalDocumentId,
      vision_text_length: result.raw_text.length,
      page_count: result.pages.length,
      word_count: result.words.length,
      line_count: result.lines.length,
      ocr_provider: isDocAIEnabled() ? 'google_docai' : 'google_vision',
      // ONE BRAIN B1 diagnostics (shows Core path result even when flag OFF)
      core_status: coreStatus,
      // CANONICAL CUTOVER (GAP-2): explicit fallback signal. true ONLY when a
      // technical Core failure forced the legacy path. Never hidden under 'ok'.
      fallback_used: fallbackUsed,
      core_path: corePath,
      // POLICY_WIRED: document-class policy guard diagnostics
      policy_guard_status: policyGuardStatus,
      // MRZ_DEBUG: parse status for passport slots — metadata only, no PII, no raw MRZ string.
      // Helps diagnose why MRZ was not used (no lines found, bad check digits, OCR noise, etc.)
      // Only computed for passport / booklet hints to avoid wasted CPU on non-passport slots.
      ...(docTypeHint === 'passport' || docTypeHint === 'booklet'
        ? (() => {
            const mrzDbg = parseMrzFromText(result.raw_text ?? '')
            return {
              _mrz_debug_status: mrzDbg.debug_status,
              _mrz_lines_found: mrzDbg.mrz_lines_found,
              _mrz_valid: mrzDbg.valid,
            }
          })()
        : {}
      ),
      // Flat extraction diagnostics — auditable at a glance.
      brain_status: brainStatus,
      crossref_status: crossrefStatus,
      vision_arbiter_status: visionArbiterStatus,
      brain_error_code: brainErrorCode,
      brain_added_count: brainAddedCount,
      brain_trigger: brainTrigger,
      targeted_brain_missing: targetedMissing,
      final_field_count: finalFieldCount,
      final_field_keys: finalFieldKeys,
      // ── Slot firewall diagnostics. Surfaces both the hard-rejected
      // fields (so the wizard never sees them) and the document-type
      // mismatch flag (so the wizard can show a "wrong document for
      // this slot" warning instead of silently merging unrelated data).
      // slot_mismatch is the OR of the contract's Brain-based flag and
      // the module-says-wrong heuristic (covers the case when Brain
      // also failed but the rule module is confident the document is
      // not what the slot expected).
      slot: contract.slot,
      slot_mismatch: effectiveSlotMismatch,
      slot_mismatch_source: contract.slot_mismatch
        ? 'brain_doc_type'
        : moduleSaysWrong
          ? 'rule_module_no_anchors'
          : null,
      detected_document_type: contract.detected_document_type,
      rejected_fields: contract.rejected_fields,
      rejected_field_count: contract.rejected_fields.length,
      pages: result.pages.map((p) => ({
        page: p.page,
        width: p.width,
        height: p.height,
        line_count: p.lines.length,
        word_count: p.words.length,
      })),
      // CANONICAL CUTOVER (GAP-2): raw OCR `words`/`lines` (full text + bboxes,
      // PII-heavy) removed from the client JSON — no UI component consumes them
      // (verified: DocumentUploadScreen reads ok/error/quality_error/module/
      // document_id; TPSWizardV2 reads module.fields + knowledge_diagnostics +
      // slot/brain diagnostics). Per-page counts are retained below.
      processing_ms: result.processing_ms,
      route_total_ms: Date.now() - t0,
      image_quality: pre.quality,
      warnings: result.warnings,
      // Per-document module output — present only when doc_type_hint is set.
      // If the AI Brain ran and added fields, `module` is the merged shape.
      module: mergedModule,
      // Backward-compatible aliases for evidence scripts and external checks.
      // Keep these flat so shell tooling can grep counts/keys quickly.
      module_result: mergedModule,
      module_matched: mergedModule ? mergedModule.matched : null,
      module_field_count: mergedModule ? mergedModule.fields.length : 0,
      module_field_keys: mergedModule
        ? Array.from(new Set(mergedModule.fields.map((f) => f.field))).sort()
        : [],
      // Knowledge normalization diagnostics
      knowledge_normalizations: normalizationMeta.normalizations_applied,
      knowledge_conflicts: normalizationMeta.conflicts,
      knowledge_low_confidence: normalizationMeta.low_confidence,
      knowledge_rejected_fields: normalizationMeta.rejected_fields,
      // CANONICAL CUTOVER (GAP-2): the UI (TPSWizardV2 booklet drop-rule) reads
      // only field/status/reason/manual_required from knowledge_diagnostics.
      // The raw value pair (input_raw/input_normalized/output_normalized) is
      // PII (actual document field values) and is NOT consumed by any client —
      // strip it from the client JSON. The full diagnostic still flows to the
      // server-side audit (brainRawAudit → logOcrRun) where it is needed.
      knowledge_diagnostics: normalizationMeta.diagnostics.map((d) => ({
        field: d.field,
        status: d.status,
        reason: d.reason,
        manual_required: d.manual_required,
      })),
      // DS.2 — Brain diagnostics surfaced to the client (UI never renders
      // raw_response_length; this is for /api/tps/health-style monitoring).
      brain: brainResult
        ? brainResult.ok
          ? {
              ok: true,
              document_type: brainResult.result.document_type,
              document_type_confidence: brainResult.result.document_type_confidence,
              field_count: Object.keys(brainResult.result.fields).length,
              needs_manual_review: brainResult.result.needs_manual_review,
              warnings: brainResult.result.warnings,
              validated_skipped: brainSkipped,
            }
          : {
              ok: false,
              error_code: brainResult.error_code,
              detail: brainResult.detail,
            }
        : { ok: false, error_code: 'NOT_RUN', detail: shouldTryBrain ? 'flag_off' : 'rules_sufficient' },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        // Surface counts in headers so curl smoke can assert without
        // parsing JSON.
        'X-OCR-Provider': result.provider,
        'X-OCR-Word-Count': String(result.words.length),
        'X-OCR-Page-Count': String(result.pages.length),
        // Preprocess fingerprint — auditors can see what the gate did.
        'X-OCR-Preprocess-Resized': String(pre.resized),
        'X-OCR-Preprocess-Width': String(pre.width),
        'X-OCR-Preprocess-Height': String(pre.height),
        'X-TPS-Module': mergedModule ? mergedModule.module : 'none',
        'X-TPS-Module-Matched': mergedModule ? String(mergedModule.matched) : 'na',
        'X-TPS-Module-Fields': mergedModule ? String(mergedModule.fields.length) : '0',
        'X-TPS-Module-ManualReview': mergedModule ? String(mergedModule.manual_review_required) : 'na',
        // Brain headers — only present when the Brain was attempted.
        'X-TPS-Brain': brainResult ? (brainResult.ok ? brainResult.result.document_type : `error:${brainResult.error_code}`) : 'off',
        'X-TPS-Brain-Added': String(brainFields.length),
        'X-TPS-Brain-Skipped': String(brainSkipped.length),
      },
    },
  )
}

export async function GET() {
  // Friendly response for someone who lands here from a browser address bar.
  return NextResponse.json(
    {
      route: '/api/tps/ocr/extract',
      method: 'POST',
      content_type: 'multipart/form-data',
      fields: {
        file: 'JPEG / PNG / WebP image (≤ 10 MB)',
        doc_type_hint: 'optional: passport | i94 | ead | i797 | evidence',
      },
      note: 'This is a thin OCR endpoint. Field extraction and classification happen in later pipeline stages.',
    },
    { status: 405, headers: { Allow: 'POST' } },
  )
}
