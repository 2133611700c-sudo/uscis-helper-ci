/**
 * POST /api/translation/vision-extract
 *
 * Accepts ONE OR MORE Ukrainian document images (multipart/form-data
 * with repeated `file` key — up to MAX_PAGES). Each page is run through
 * the docintel spine (Gemini vision → KMU-55 transliteration); resulting
 * fields are merged across pages preferring the earliest non-empty value
 * for each field name. The translation wizard renders the merged set on
 * its review screen.
 *
 * Multi-page rationale: a Ukrainian internal-passport booklet has at least
 * an identity page + a registration/photo page; a birth certificate may be
 * a single double-sided sheet; users may upload front + back as separate
 * photos. The OCR call accepts them all in one request so the user is not
 * forced to pre-merge images.
 *
 * This is the REAL replacement for the wizard's previous fake-detection
 * animation that hardcoded "SHEVCHENKO TARAS HRYHOROVYCH". The user now sees
 * fields actually read from their own document(s).
 *
 * Privacy: free Gemini tier trains on data. Callers must use PAID Gemini for
 * real client PII — server reads GEMINI_API_KEY from env; production must set
 * the paid-tier key. v5 §30.
 *
 * Rate-limited (8 requests/min/IP — each request may span up to MAX_PAGES
 * pages, so cost is bounded). Backward compatible: a single `file` request
 * still works exactly as before.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runWithUploadCostTally } from '@/lib/v1/ocrCostMetrics'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { getCanonicalMode } from '@/lib/canonical/continuityMode'
import { preprocessImage } from '@/lib/ocr/image-preprocess'
import { heicToJpeg } from '@/lib/ocr/heicToJpeg'
import { isQualityGateEnabled, decideImageQuality, metricsFromPreprocess } from '@/lib/docintel/quality/documentImageQuality'
import { applyOcrFieldSafety } from '@/lib/documentSafety/applyOcrFieldSafety'
import { readDocument } from '@/lib/docintel/documentFieldReader'
import { googleVisionProvider } from '@/lib/ocr/providers/google-vision'
import { isBlocked, isProviderError } from '@/lib/ocr/types'
import { httpStatusForOcrError, type OcrProviderError } from '@/lib/ocr/ocrErrors'
import { applyDateEnsemble, isDateFieldName, extractDateCandidatesFromText } from '@/lib/docintel/ensemble/applyDateEnsemble'
import { readDateRegionsWithVision } from '@/lib/docintel/ensemble/dateRegionRead'
import { HANDWRITTEN_FABRICATION_RISK_CLASSES } from '@/lib/docintel/antiFabricationGate'
import { getGeminiApiKey } from '@/lib/gemini/apiKey'
import { normalizeGeminiModel } from '@/lib/gemini/model'
// ONE BRAIN Core — B2: Translation consumes same Core as TPS. toTranslationRows = the B2 adapter.
import { buildKnowledgeContext, applyKnowledgeBrainIfEnabled } from '@/lib/canonical/core/knowledgeBrain'
import { docintelToCandidate, buildCyrillicMap, toTranslationRows } from '@/lib/canonical/core/translationAdapter'
import { buildCanonicalResult } from '@/lib/canonical/core/buildCanonicalResult'
import { mrzCandidatesForTranslation } from '@/lib/canonical/core/mrzAuthority'
// POLICY_WIRED: document-class guards (2026-06-03 benchmark findings)
import {
  checkImageQuality,
  applyHardCaseReviewOverride,
  applyCertificateRoleGuard,
  docintelIdToDocumentClass,
  isUkrainianIdentityDoc,
} from '@/lib/canonical/core/documentClassPolicy'
// CANONICAL_CONTINUITY: persist canonical result after extraction (shadow/enforce modes)
import { persistCanonicalDocument } from '@/lib/canonical/persistence'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // multi-page: N pages read in parallel + a legacy fallback pass; 60s killed 4-page passports. Vision ~16-40s/page (handwriting). Caps at the Vercel plan limit if lower.

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  // HEIC / HEIF — iPhone default. heicToJpeg (WASM libde265 — sharp's prebuilt
  // libvips lacks the HEVC codec) converts at intake; downstream sees JPEG only.
  'image/heic',
  'image/heif',
])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB per page
const MAX_PAGES = 6                  // hard cap matching the wizard

/**
 * HONEST DEGRADATION (P1, 2026-06-14). Build an honest non-2xx response for a
 * provider failure (rate-limit / 5xx / billing / timeout / malformed).
 *
 * THE BUG this kills: a provider 429/5xx used to be flattened into HTTP 200 +
 * ok:false + fields:[] + status="vision_failed:HTTP 429" — the wizard treated it
 * as a successful-but-empty read and advanced the user as if the document had
 * been processed. A provider failure MUST NOT look like a success.
 *
 * The body is typed + PII-free: { ok:false, error_code, retryable,
 * retry_after_seconds?, message }. The HTTP status is derived from the class
 * (429 rate, 503 unavailable, 502 invalid). `Retry-After` is set when retryable.
 */
/**
 * Pick the single error to report when multiple pages failed. Terminal
 * config/account problems (billing/quota/budget) outrank an invalid response,
 * which outranks a provider outage, which outranks a transient rate-limit. This
 * way a user is not told to "retry shortly" when the real problem is a hard cap.
 */
function pickMostSevereOcrError(errors: OcrProviderError[]): OcrProviderError {
  const rank: Record<OcrProviderError['error_code'], number> = {
    OCR_BILLING_DISABLED: 5,
    OCR_QUOTA_EXHAUSTED: 4,
    OCR_BUDGET_EXCEEDED: 4,
    OCR_INVALID_RESPONSE: 3,
    OCR_PROVIDER_UNAVAILABLE: 2,
    OCR_RATE_LIMITED: 1,
  }
  return errors.reduce((worst, e) => (rank[e.error_code] > rank[worst.error_code] ? e : worst), errors[0])
}

function ocrUnavailableResponse(err: OcrProviderError): NextResponse {
  const status = httpStatusForOcrError(err.error_code)
  const headers: Record<string, string> = {}
  if (err.retryable && typeof err.retry_after_seconds === 'number') {
    headers['Retry-After'] = String(err.retry_after_seconds)
  }
  return NextResponse.json(
    {
      ok: false,
      error_code: err.error_code,
      retryable: err.retryable,
      ...(typeof err.retry_after_seconds === 'number' ? { retry_after_seconds: err.retry_after_seconds } : {}),
      // status kept for clients that switch on it; clearly a FAILURE, not "no_fields".
      status: 'provider_unavailable',
      message: err.message ?? 'recognition temporarily unavailable',
      // The document was NOT processed. The wizard must not advance as a success.
      review_required: true,
      fields: null,
    },
    { status, headers },
  )
}

// FieldOut shape is now owned by the canonical translationAdapter (toTranslationRows
// returns it for BOTH the Core path and — post-cutover — the legacy fallback). The
// route no longer builds rows by hand, so the local duplicate type was removed.

/**
 * ENSEMBLE_DATE_ENABLED (default OFF): cross-engine date check shared by BOTH the
 * Core path and the legacy path. For handwritten-risk docs, read the date REGIONS
 * with a zoomed Google Vision pass and reconcile — disagreement forces review +
 * attaches the second reading. Fail-open; never lowers review. Returns PII-free diag.
 */
async function runDateEnsemble<T extends {
  field: string; kind?: string; value?: string | null; raw_cyrillic?: string | null
  review_required?: boolean; review_reasons?: string[]; ensemble_candidate?: string | null
}>(fields: T[], docTypeId: string, firstFile: File): Promise<{ fields: T[]; diag: Record<string, unknown> }> {
  if (!(
    process.env.ENSEMBLE_DATE_ENABLED === '1' &&
    isUkrainianIdentityDoc(docTypeId) &&
    HANDWRITTEN_FABRICATION_RISK_CLASSES.has(docintelIdToDocumentClass(docTypeId)) &&
    fields.some((f) => isDateFieldName(f.field, f.kind))
  )) return { fields, diag: { status: 'off' } }
  try {
    const apiKey = getGeminiApiKey()
    const imageBuffer = Buffer.from(await firstFile.arrayBuffer())
    const mimeType = firstFile.type || 'image/jpeg'
    let secondText = ''
    let diag: Record<string, unknown> = {}
    if (apiKey) {
      const rr = await readDateRegionsWithVision({
        imageBuffer, mimeType, geminiApiKey: apiKey,
        geminiModel: normalizeGeminiModel(process.env.GEMINI_MODEL, 'gemini-3.1-pro-preview'),
        vision: googleVisionProvider,
      })
      secondText = rr.text; diag = { ...rr.diag, source: 'region_crop' }
    }
    if (!secondText) {
      const full = await googleVisionProvider.extractText({ imageBuffer, mimeType })
      // Ensemble is best-effort: a blocked/provider-error second read just means no
      // cross-check (fail-open). It NEVER fails the primary extract.
      if (!isBlocked(full) && !isProviderError(full)) { secondText = full.raw_text ?? ''; diag = { ...diag, fallback_chars: secondText.length } }
    }
    if (secondText) {
      // PII-free diagnostics: do month words / years appear, and how many date candidates parsed?
      const monthHits = (secondText.match(/січ|лют|берез|квіт|трав|черв|лип|серп|вер|жовт|листоп|груд|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр/gi) || []).length
      const yearHits = (secondText.match(/\b(1[89]\d{2}|20\d{2})\b/g) || []).length
      const cands = extractDateCandidatesFromText(secondText).length
      const outcome = applyDateEnsemble(fields, secondText)
      if (outcome.disagreements.length) console.info('[date_ensemble] disagreement', JSON.stringify({ doc_type_id: docTypeId, fields: outcome.disagreements }))
      return { fields: outcome.fields, diag: { ...diag, status: outcome.applied ? 'applied' : 'no_dates', disagreements: outcome.disagreements.length, month_hits: monthHits, year_hits: yearHits, cands } }
    }
    return { fields, diag: { ...diag, status: 'no_dates' } }
  } catch (e) {
    return { fields, diag: { status: 'error', error: e instanceof Error ? e.message.slice(0, 60) : 'err' } }
  }
}

export async function POST(req: NextRequest) {
  // P2 shadow cost observability (observe-only): roll up provider calls into one
  // PII-free ocr_upload_cost_summary. Handler result returned UNCHANGED.
  return runWithUploadCostTally({ product: 'translation', route: '/api/translation/vision-extract' }, () => POST_impl(req))
}

async function POST_impl(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`translation-vision:${ip}`, 8, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Wait a minute.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data with one or more "file" entries.' }, { status: 400 })
  }

  const docTypeId = (form.get('docTypeId') as string | null) ?? 'ua_internal_passport_booklet'

  // Collect all `file` entries (repeated key supports multi-page upload).
  const rawFiles = form.getAll('file').filter((v) => v && typeof v !== 'string') as File[]
  if (rawFiles.length === 0) {
    return NextResponse.json({ ok: false, error: 'Missing "file" field.' }, { status: 400 })
  }
  if (rawFiles.length > MAX_PAGES) {
    return NextResponse.json(
      { ok: false, error: `Too many pages: ${rawFiles.length}. Max ${MAX_PAGES}.` },
      { status: 413 },
    )
  }
  // HEIC/HEIF (iPhone default camera format) → JPEG BEFORE validation, so every
  // downstream read (ensemble, Core, legacy) sees a plain JPEG. Fail-open: a
  // failed decode leaves the original file, which the MIME gate below rejects
  // with the standard 415 — never a 500.
  for (let i = 0; i < rawFiles.length; i++) {
    const f = rawFiles[i]
    const suspicious =
      /heic|heif/i.test(f.type) || !f.type ||
      f.type === 'application/octet-stream' || /\.(heic|heif)$/i.test(f.name)
    if (!suspicious) continue
    const conv = await heicToJpeg(Buffer.from(await f.arrayBuffer()), f.type)
    if (conv.converted) {
      rawFiles[i] = new File(
        [new Uint8Array(conv.buffer)],
        f.name.replace(/\.(heic|heif)$/i, '') + '.jpg',
        { type: 'image/jpeg' },
      )
    }
  }
  // Validate every page before spending any vision budget.
  for (const file of rawFiles) {
    const mime = file.type || 'image/jpeg'
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported image type: ${mime}. Use JPEG, PNG, WebP, or HEIC.` },
        { status: 415 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 10 MB per page.` },
        { status: 413 },
      )
    }
  }

  // ── POLICY_WIRED: checkImageQuality — document-class size guard ──────────
  // Runs BEFORE any Gemini/Vision call. Blocks tiny images (82KB marriage
  // apostille proved insufficient). Warns on >2MB images (503 risk).
  // Only applies to Ukrainian identity documents (not US forms).
  if (isUkrainianIdentityDoc(docTypeId)) {
    const docClass = docintelIdToDocumentClass(docTypeId)
    // Use largest file for the size check — if any page is too small, block all
    const largestFile = rawFiles.reduce((max, f) => f.size > max.size ? f : max, rawFiles[0])
    const smallestFile = rawFiles.reduce((min, f) => f.size < min.size ? f : min, rawFiles[0])
    // Block if the smallest file is below the minimum (every page must be readable)
    const qualityCheck = checkImageQuality(docClass, smallestFile.size)
    if (qualityCheck.action === 'needs_better_scan') {
      console.warn('[documentClassPolicy] needs_better_scan:', qualityCheck.reason, 'docTypeId:', docTypeId)
      return NextResponse.json(
        {
          ok: false,
          status: 'needs_better_scan',
          review_required: true,
          reason: qualityCheck.reason,
          fields: null,
          error: 'Image quality insufficient for reliable extraction. Please upload a higher-resolution scan.',
          doc_type_id: docTypeId,
        },
        { status: 200 },
      )
    }
    if (checkImageQuality(docClass, largestFile.size).action === 'resize') {
      console.warn('[documentClassPolicy] image_large_resize_recommended:', largestFile.size, 'bytes, docTypeId:', docTypeId)
      // Continue — do not block, but log for monitoring
    }
  }

  // ── ONE BRAIN Core — default path (Phase 2.1) ────────────────────────────
  //
  // Flow: readDocument (Gemini docintel) → buildCyrillicMap → docintelToCandidate
  //       → arbitrateDocument (Core judge) → toTranslationRows (B2 adapter)
  //
  // raw_cyrillic threaded from ExtractedDocField → FieldCandidate.rawCyrillic
  // → CanonicalField.rawCyrillic → FieldOut.raw_cyrillic (Phase 2.0).
  // cyrillicMap kept as display fallback only.
  // 0 fields → legacy reader (with preprocessing) as fallback; errors → legacy.
  try {
    const allCandidates: ReturnType<typeof docintelToCandidate>[] = []
    const cyrillicMap = new Map<string, string>()
    // PAGES IN PARALLEL (504 fix, 2026-06-11). Sequential pages overflowed the
    // 60s hobby-plan ceiling on a 2-page handwritten booklet (16-40s/page →
    // owner hit four 504s live). Parallel wall-clock = slowest page, not the
    // sum. Paid Gemini tier handles 2-6 concurrent calls; per-page timeout
    // stays 40s. Merge order is preserved by index (earliest page still wins
    // in the arbiter) — results are awaited as a positional array.
    const corePages = await Promise.all(rawFiles.map(async (file, i) => {
      // HEIC was already converted to JPEG at intake (heicToJpeg, top of handler).
      const buffer = Buffer.from(await file.arrayBuffer())
      // timeoutMs is the TOTAL deadline per page across the fallback chain (not
      // per attempt). Handwritten/Soviet docs need the model to think 40-70s, so
      // 40s was too tight (it failed a real Soviet birth cert outright). Pages run
      // in PARALLEL, so a generous per-page budget still fits maxDuration=120.
      // attemptsPerModel:1 so a slow primary doesn't burn the budget on a retry —
      // the budget goes to the faster fallback models instead.
      const r = await readDocument(buffer, file.type || 'image/jpeg', docTypeId, { timeoutMs: 85_000, attemptsPerModel: 1, product: 'translation' })
      return { i, r }
    }))
    const corePageResults: Array<{ page: number; ok: boolean; status: string; ms: number }> = []
    // HONEST DEGRADATION (P1): collect any typed provider error a page surfaced.
    const coreProviderErrors: OcrProviderError[] = []
    for (const { i, r } of corePages) {
      corePageResults.push({ page: i + 1, ok: r.ok, status: r.status, ms: r.ms })
      if (r.ok && Array.isArray(r.fields)) {
        buildCyrillicMap(r.fields).forEach((v, k) => { if (!cyrillicMap.has(k)) cyrillicMap.set(k, v) })
        allCandidates.push(...r.fields.map((f) => docintelToCandidate(f, i + 1)))
      } else if (r.provider_error) {
        coreProviderErrors.push(r.provider_error)
      }
    }
    // FAIL CLOSED: if NO page produced any usable candidate AND at least one page
    // failed with a typed provider error (429 rate-limit / 5xx / billing / timeout),
    // the document was NOT read — return an HONEST non-2xx instead of falling
    // through to the legacy reader (which would hit the SAME throttled provider and
    // ultimately return HTTP 200 + fields:[], masking the failure). The genuine
    // empty-but-successful read (provider returned 200, zero fields, NO error) is
    // unaffected: it produces no provider_error and falls through as before.
    if (allCandidates.length === 0 && coreProviderErrors.length > 0) {
      const chosen = pickMostSevereOcrError(coreProviderErrors)
      console.warn('[Core B2] provider failure — honest degradation:', chosen.error_code, JSON.stringify({ doc_type_id: docTypeId, pages: corePageResults.map((p) => p.status) }))
      return ocrUnavailableResponse(chosen)
    }
    // 1A — MRZ authority for the international passport (flag-gated, default OFF
    // = byte-identical prod). A valid MRZ (Latin, math-checkable) auto-resolves
    // passport_number/dob/expiry/names so the field doesn't fall to
    // critical_no_mrz_anchor. Fail-open: Vision blocked / no MRZ lines → [] →
    // identical to today. Vision OCR runs on the first (data) page only.
    if (process.env.MRZ_TRANSLATION_ENABLED === '1' && docTypeId === 'ua_international_passport' && rawFiles.length > 0) {
      try {
        const firstBuf = Buffer.from(await rawFiles[0].arrayBuffer())
        const vis = await googleVisionProvider.extractText({ imageBuffer: firstBuf, mimeType: rawFiles[0].type || 'image/jpeg' })
        if (!isBlocked(vis) && !isProviderError(vis) && vis.raw_text) {
          const mrz = mrzCandidatesForTranslation(vis.raw_text, docTypeId)
          if (mrz.length > 0) {
            allCandidates.push(...mrz)
            console.info('[Core B2] MRZ_WIRED:', mrz.length, 'candidates for', docTypeId, 'valid=', mrz[0]?.mrzCheckValid)
          }
        }
      } catch (e) {
        console.warn('[Core B2] MRZ best-effort failed (fail-open):', (e as Error)?.message ?? e)
      }
    }
    const canonicalFields = applyKnowledgeBrainIfEnabled(
      allCandidates,
      buildKnowledgeContext({ docTypeId, product: 'translation' }),
    )
    if (canonicalFields.length > 0) {
      // Phase 1 (one canonical currency): wrap the arbitrated fields into the ONE
      // internal envelope (CanonicalDocumentResult) instead of stopping at a bare
      // CanonicalField[]. PURE wrapper — buildCanonicalResult changes no value, no
      // review state. The product adapter then reads from result.fields, so value
      // resolution is the single accessor path (no duplicate post-canonical work).
      // documentSessionId is optional on this stateless extract endpoint (the wizard
      // holds the session client-side); a synthetic marker keeps the contract honest
      // without inventing PII.
      const documentSessionId =
        (form.get('documentSessionId') as string | null) ?? 'translation-vision-extract'
      const canonicalResult = buildCanonicalResult({
        documentSessionId,
        product: 'translation',
        docType: docTypeId,
        fields: canonicalFields,
        createdAt: new Date().toISOString(),
      })
      // CANONICAL_CONTINUITY: persist canonical result (shadow/enforce modes)
      const continuityMode = getCanonicalMode('translation')
      let canonicalDocumentId: string | null = null
      if (continuityMode !== 'off') {
        try {
          const persisted = await persistCanonicalDocument(canonicalResult, documentSessionId)
          canonicalDocumentId = persisted.id
          console.info('[canonical/continuity] persisted', {
            event: 'canonical_persisted',
            canonical_document_id: persisted.id,
            fields_hash: persisted.fieldsHash.slice(0, 8),
            mode: continuityMode,
          })
        } catch {
          if (continuityMode === 'enforce') {
            return NextResponse.json(
              { error: 'canonical_persistence_failed' },
              { status: 503 }
            )
          }
          console.warn('[canonical/continuity] persist failed (shadow — non-blocking)', { mode: continuityMode })
        }
      } else {
        console.info('[canonical/continuity] continuity=off — persistence skipped')
      }
      let fields = toTranslationRows(canonicalResult.fields, cyrillicMap)
      // Cross-engine date ensemble (handwritten-risk; flag-gated) — wired HERE in
      // the Core path because this is the live return (status ok:core-b2).
      const ens = await runDateEnsemble(fields, docTypeId, rawFiles[0])
      fields = ens.fields
      const requiresReview = fields.some((f) => f.review_required)
      console.info('[Core B2] Translation: arbitrated', fields.length, 'fields; requiresReview=', requiresReview)
      return NextResponse.json({
        ok: true, doc_type_id: docTypeId, fields,
        date_ensemble: ens.diag,
        pages: corePageResults, page_count: rawFiles.length,
        provider: 'one-brain-core:translation-b2',
        model: normalizeGeminiModel(process.env.GEMINI_MODEL, 'gemini-2.5-flash'),
        status: 'ok:core-b2',
        core_version: 'b2',
        // CUTOVER: the Core path is the canonical arbitration path. Marked honestly
        // so the client/telemetry can distinguish it from the legacy fallback below.
        core_path: 'canonical',
        fallback_used: false,
        // CANONICAL_CONTINUITY: canonical document id for session linkage
        canonical_document_id: canonicalDocumentId,
      }, { status: 200 })
    }
    console.warn('[Core B2] 0 fields — falling through to legacy reader (with preprocessing)')
  } catch (e: any) {
    console.error('[Core B2] error, falling through to legacy reader:', e?.message ?? e)
  }

  // Legacy fallback — pages IN PARALLEL too (504 fix, 2026-06-11; the old
  // sequential rationale was the FREE Gemini tier, prod runs the paid key).
  //
  // CUTOVER (Phase 1 GAP-1): the fallback now runs the SAME canonical pipeline as
  // the Core path. It collects FieldCandidate[] via docintelToCandidate(f, page)
  // (which carries the page → arbitrateDocument still picks the earliest valid
  // candidate, preserving the old "earliest non-empty page wins" merge) and a
  // cyrillicMap, then after the page loop runs
  //   applyKnowledgeBrainIfEnabled → buildCanonicalResult → toTranslationRows.
  // It no longer raw-merges ExtractedDocField into a Map<string,FieldOut> — so it
  // now honors C3 (getCanonicalValue rejects finalValue===null), applies the
  // settlement-designator/getCanonicalValue logic that lives in toTranslationRows,
  // and preserves rawCyrillic/reviewReasons/suggestedValue by construction. The
  // fallback differs from the Core path ONLY by per-page preprocessing (rotate +
  // quality gate), the shorter per-page timeout, and the explicit fallback flag.
  const legacyCandidates: ReturnType<typeof docintelToCandidate>[] = []
  const legacyCyrillicMap = new Map<string, string>()
  const pageResults: Array<{ page: number; ok: boolean; status: string; ms: number; provider?: string; error?: string }> = []
  const legacyProviderErrors: OcrProviderError[] = []
  let lastResult: Awaited<ReturnType<typeof readDocument>> | null = null

  type LegacyPage =
    | { kind: 'reshoot'; page: number; q: ReturnType<typeof decideImageQuality> }
    | { kind: 'read'; page: number; r: Awaited<ReturnType<typeof readDocument>> }
    | { kind: 'error'; page: number; message: string }
  const legacyPages: LegacyPage[] = await Promise.all(rawFiles.map(async (file, i): Promise<LegacyPage> => {
    const mime = file.type || 'image/jpeg'
    const rawBuffer = Buffer.from(await file.arrayBuffer())
    // Auto-rotate (EXIF), resize >2048px, normalize orientation.
    // Fixes upside-down/rotated phone photos of birth certs, marriage certs, etc.
    const pre = await preprocessImage(rawBuffer, mime).catch(() => null)
    const buffer = pre?.ok ? pre.buffer : rawBuffer
    const effectiveMime = pre?.ok ? pre.mimeType : mime
    // ── D0 intake quality gate (QUALITY_GATE_ENABLED, default OFF) ──────────
    // Flag OFF ⇒ skipped ⇒ byte-identical. ON ⇒ a too-blurry/dark/small photo is
    // bounced back for a reshoot BEFORE model spend. Never a fabrication signal.
    if (isQualityGateEnabled() && pre?.ok) {
      const q = decideImageQuality(metricsFromPreprocess(pre))
      if (q.reshoot_required) return { kind: 'reshoot', page: i + 1, q }
    }
    try {
      // 25s (was 15s): the primary model (gemini-3.1-pro-preview) takes 20-40s on
      // a full page, so 15s aborted it every time → always fell to the flash
      // fallback → every field flagged review. Pages run in parallel under the
      // 60s route budget, so 25s is safe.
      const r = await readDocument(buffer, effectiveMime, docTypeId, { timeoutMs: 25_000, product: 'translation' })
      return { kind: 'read', page: i + 1, r }
    } catch (e: any) {
      console.error('[translation/vision-extract page', i + 1, ']', e?.message ?? e)
      return { kind: 'error', page: i + 1, message: e?.message ?? 'unknown' }
    }
  }))
  for (const p of legacyPages) {
    if (p.kind === 'reshoot') {
      return NextResponse.json({
        ok: false,
        status: 'reshoot_required',
        reshoot: true,
        page: p.page,
        message_key: p.q.user_message_key,
        quality_decision: p.q.decision,
        signals: p.q.signals,
      }, { status: 200 })
    }
    if (p.kind === 'error') {
      pageResults.push({ page: p.page, ok: false, status: 'error', ms: 0, error: p.message })
      continue
    }
    const r = p.r
    lastResult = r
    pageResults.push({ page: p.page, ok: r.ok, status: r.status, ms: r.ms, ...(r.provider ? { provider: r.provider } : {}), ...(r.error ? { error: r.error } : {}) })
    if (!r.ok && r.provider_error) legacyProviderErrors.push(r.provider_error)
    if (r.ok && Array.isArray(r.fields)) {
      // Same as the Core path: build the cyrillic display fallback and collect
      // candidates carrying the page. The arbiter (arbitrateDocument inside
      // applyKnowledgeBrainIfEnabled) picks the earliest valid candidate, so the
      // previous "earliest non-empty page wins" behavior is preserved here.
      buildCyrillicMap(r.fields).forEach((v, k) => { if (!legacyCyrillicMap.has(k)) legacyCyrillicMap.set(k, v) })
      legacyCandidates.push(...r.fields.map((f) => docintelToCandidate(f, p.page)))
    }
  }

  // FAIL CLOSED (P1): legacy path also hit a typed provider failure and read
  // nothing usable → honest non-2xx, NOT the generic 200+no_fields. This covers
  // the case where the Core path returned 0 candidates for a non-HTTP reason and
  // the legacy retry then hit a 429/5xx/timeout.
  if (legacyCandidates.length === 0 && legacyProviderErrors.length > 0) {
    const chosen = pickMostSevereOcrError(legacyProviderErrors)
    console.warn('[legacy] provider failure — honest degradation:', chosen.error_code, JSON.stringify({ doc_type_id: docTypeId, pages: pageResults.map((p) => p.status) }))
    return ocrUnavailableResponse(chosen)
  }

  // Run the canonical pipeline on the collected candidates — identical arbitration
  // to the Core path. Empty candidate set ⇒ empty arbitrated set ⇒ ok:false below.
  const legacyCanonicalFields = applyKnowledgeBrainIfEnabled(
    legacyCandidates,
    buildKnowledgeContext({ docTypeId, product: 'translation' }),
  )
  const legacyDocumentSessionId =
    (form.get('documentSessionId') as string | null) ?? 'translation-vision-extract'
  const legacyCanonicalResult = buildCanonicalResult({
    documentSessionId: legacyDocumentSessionId,
    product: 'translation',
    docType: docTypeId,
    fields: legacyCanonicalFields,
    createdAt: new Date().toISOString(),
  })

  // CANONICAL_CONTINUITY: persist canonical result (shadow/enforce modes)
  const legacyContinuityMode = getCanonicalMode('translation')
  let legacyCanonicalDocumentId: string | null = null
  if (legacyContinuityMode !== 'off') {
    try {
      const persisted = await persistCanonicalDocument(legacyCanonicalResult, legacyDocumentSessionId)
      legacyCanonicalDocumentId = persisted.id
      console.info('[canonical/continuity] persisted (legacy path)', {
        event: 'canonical_persisted',
        canonical_document_id: persisted.id,
        fields_hash: persisted.fieldsHash.slice(0, 8),
        mode: legacyContinuityMode,
      })
    } catch {
      if (legacyContinuityMode === 'enforce') {
        return NextResponse.json(
          { error: 'canonical_persistence_failed' },
          { status: 503 }
        )
      }
      console.warn('[canonical/continuity] persist failed (shadow — non-blocking)', { mode: legacyContinuityMode })
    }
  } else {
    console.info('[canonical/continuity] continuity=off — persistence skipped (legacy path)')
  }

  // Any field at all? Then the request is considered ok even if some pages
  // failed (e.g. user uploaded one good page + one blurry one).
  // Reaching here means Core returned 0 fields or errored — legacy reader ran.
  let fields = toTranslationRows(legacyCanonicalResult.fields, legacyCyrillicMap)
  const ok = fields.length > 0

  // ── POLICY_WIRED: post-extraction document-class guards ───────────────────
  // Applied AFTER extraction, BEFORE response. Only for Ukrainian identity docs.
  let translationPolicyGuardStatus: 'not_applicable' | 'applied' | 'role_guard_triggered' = 'not_applicable'
  if (ok && isUkrainianIdentityDoc(docTypeId)) {
    const docClass = docintelIdToDocumentClass(docTypeId)

    // Wire 2: applyHardCaseReviewOverride — forces review_required=true on hard-case classes
    const hardCaseCheck = applyHardCaseReviewOverride(docClass, { review_required: false })
    if ('override_reason' in hardCaseCheck) {
      console.info('[documentClassPolicy] applyHardCaseReviewOverride applied (translation):', docClass, hardCaseCheck.override_reason)
      fields = fields.map((f) => ({ ...f, review_required: true }))
      translationPolicyGuardStatus = 'applied'
    }

    // Wire 3: applyCertificateRoleGuard — rejects generic family_name without role grounding
    const fieldRecord: Record<string, unknown> = {}
    for (const f of fields) {
      fieldRecord[f.field] = f.value
    }
    const roleCheck = applyCertificateRoleGuard(docClass, fieldRecord)
    if (!roleCheck.safe) {
      console.warn('[documentClassPolicy] applyCertificateRoleGuard triggered (translation):', roleCheck.reason, 'fields:', roleCheck.forcedReviewFields)
      const forcedSet = new Set(roleCheck.forcedReviewFields)
      fields = fields.map((f) => forcedSet.has(f.field) ? { ...f, review_required: true } : f)
      translationPolicyGuardStatus = 'role_guard_triggered'
    }
  }

  // ── ENSEMBLE_DATE_ENABLED (default OFF): cross-engine date check (legacy path) ──
  // Same shared helper as the Core path. OFF ⇒ skipped (byte-identical).
  const legacyEns = ok ? await runDateEnsemble(fields, docTypeId, rawFiles[0]) : { fields, diag: { status: 'off' } as Record<string, unknown> }
  fields = legacyEns.fields
  const dateEnsembleDiag = legacyEns.diag

  // ── C3 critical-null discipline: ALWAYS ON for the TRANSLATION pipeline ──
  // C2 (audit #195, Agent B HIGHEST-PRIORITY finding). The hard rule "NEVER guess a
  // critical field — uncertain critical → review_required=true AND final_value=null"
  // must hold at PROD DEFAULTS. Previously this guard was gated behind the env flag
  // OCR_FIELD_SAFETY_ENABLED (default OFF), so at prod defaults translation SHIPPED A
  // GUESS for an uncertain critical field — a hard-rule violation. The guard now runs
  // UNCONDITIONALLY here.
  //
  // SCOPE IS LOCAL TO TRANSLATION: this is the only call site that runs with
  // flow='translation_public'; the TPS/EAD/legacy/Re-Parole readers that share the same
  // env flag and the same underlying reader are NOT changed (no global default flip).
  //
  // Pure guard — no content changed, PII-free. An unsafe critical read (hard-case,
  // source/stale mismatch, low confidence, zero recognition) is emitted with
  // value=null + finalValue=null + review_required=true and the raw read parked in
  // candidate_value; it is NEVER shipped as the final value.
  let ocrFieldSafety: { applied: boolean; unresolved_critical?: boolean } = { applied: false }
  {
    const res = applyOcrFieldSafety(fields as never[], {
      flow: 'translation_public',
      document_class: docintelIdToDocumentClass(docTypeId),
    }, { zeroRecognition: !ok })
    // applyOcrFieldSafety returns SafeField[] (kind optional); the row type is the
    // adapter's FieldOut (kind required). The guard preserves every input property
    // it does not touch, so the runtime shape is intact — cast through unknown.
    fields = res.fields as unknown as typeof fields
    ocrFieldSafety = { applied: true, unresolved_critical: res.anyUnresolvedCritical }
  }

  return NextResponse.json({
    ok,
    doc_type_id: docTypeId,
    fields,
    ocr_field_safety: ocrFieldSafety,
    date_ensemble: dateEnsembleDiag,
    policy_guard_status: translationPolicyGuardStatus,
    // CUTOVER: honest fallback marking. The fallback now runs the same canonical
    // arbitration as the Core path; it is reached only on Core failure (0 fields)
    // or a thrown Core error. The provider/model below stay the REAL legacy reader
    // values — never relabeled as canonical-clean, never downgrading review state.
    core_path: 'legacy_fallback',
    fallback_used: true,
    // CANONICAL_CONTINUITY: canonical document id for session linkage
    canonical_document_id: legacyCanonicalDocumentId,
    pages: pageResults,
    page_count: rawFiles.length,
    // Backward compat: keep the single-call shape too for legacy clients.
    anchor_read: lastResult?.anchor_read ?? null,
    provider: lastResult?.provider ?? null,
    model: lastResult?.model ?? null,
    ms: pageResults.reduce((s, p) => s + p.ms, 0),
    status: ok ? 'ok:legacy-reader' : (lastResult?.status ?? 'no_fields'),
    ...(ok ? {} : { error: lastResult?.error ?? 'No fields extracted across all pages.' }),
    // Zero recognition is review_required even without the C3 flag, so the client
    // always treats a no-fields read as "needs your review", never silent success.
    ...(ok ? {} : { review_required: true }),
    // HTTP 200 always. "No fields recognized" / per-page provider error are EXPECTED
    // operational outcomes communicated by ok:false + status + error in the body — NOT
    // gateway errors. Returning 502 here was the P0 incident: it made Cloudflare mask the
    // JSON with a generic "error code: 502" page and the client show "HTTP 502" instead of
    // a real message, for every hard-case doc that read 0 fields. This matches the route's
    // other non-fatal returns (needs_better_scan / reshoot_required also return 200). True
    // unhandled exceptions still surface as a platform 500. (P0 triage 2026-06-06.)
  }, { status: 200 })
}
