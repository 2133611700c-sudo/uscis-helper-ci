/**
 * POST /api/translation/[sessionId]/ocr-from-storage
 *
 * Dedicated OCR pipeline — synchronous HTTP 200 (target ≤15s).
 *
 * Architecture (v6.0):
 *   1. Validate session + document
 *   2. Load image from Supabase Storage
 *   3. Preprocess (EXIF rotate, resize ≤2048px, JPEG 85)
 *   4. Dedicated OCR — Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *      → returns words/lines with stable IDs (w_NNNN, l_NNNN) and normalised bboxes
 *   5. DeepSeek Text field mapper
 *      → receives OCR token list; returns fields referencing OCR IDs (NO coordinates)
 *   6. Bbox resolver
 *      → maps ocr_ids → exact bboxes from OCR result
 *      → combines multi-word bboxes via union
 *   7. Post-process (transliteration, glossary, date normalisation)
 *   8. Persist extracted_fields with ocr_ids + bbox/evidence metadata
 *   9. Write audit logs, return HTTP 200
 *
 * Errors:
 *   400 — missing sessionId
 *   404 — session or document not found
 *   422 — Smart Retake (image quality too low)
 *   503 — OCR provider credentials missing (BLOCKED)
 *   500 — unexpected server error
 *
 * Body (optional):
 *   { doc_type?, document_id?, controlling_spelling?, retake_count? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { runWithUploadCostTally } from '@/lib/v1/ocrCostMetrics'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { loadGlossary, lookupTerm } from '@/lib/translation/glossary/glossaryLoader'
import { transliterateName } from '@/lib/translation/glossary/nominativeCaseRestorer'
import { normalizeDateUkrainian } from '@/lib/translation/numericAccuracy/dateFieldLockValidator'
import { persistExtractedFields, writeAuditLog } from '@/lib/translation/packetStateManager'
import type { DocumentType, ExtractedField } from '@/lib/translation/types'
import { preprocessImage } from '@/lib/ocr/image-preprocess'
import { getOcrProvider } from '@/lib/ocr/providers'
import { mapFieldsWithDeepSeek } from '@/lib/ocr/field-mapper'
import { buildOcrLookup, resolveOcrIds } from '@/lib/ocr/bbox-resolver'
import { isUnusableOcr, isProviderError } from '@/lib/ocr/types'
import {
  getCriticalFieldSetForDocumentType,
  getCriticalFieldsForDocumentType,
} from '@/lib/translation/modules/adapters'
import { findDocumentModule } from '@/lib/translation/modules/registry'
import {
  routePipelineToManualReview,
  gateInputFromSignals,
} from '@/lib/translation/manualReview/integrations'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // safety ceiling; target ≤15s (Vision ~5s + DeepSeek Text ~8s + overhead)

// ── Constants ─────────────────────────────────────────────────────────────────
const SMART_RETAKE_QUALITY_THRESHOLD = 0.4
const SMART_RETAKE_MAX_ATTEMPTS = 2
const SMART_RETAKE_USER_MESSAGE =
  'The photo is too blurry or poorly lit for reliable extraction. ' +
  'Please retake with better lighting, steady hands, and the document flat on a surface.'

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  // P2 shadow cost observability (observe-only): roll up provider calls into one
  // PII-free ocr_upload_cost_summary. Handler result returned UNCHANGED.
  return runWithUploadCostTally(
    { product: 'translation', route: '/api/translation/[sessionId]/ocr-from-storage' },
    () => POST_impl(req, ctx),
  )
}

async function POST_impl(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const startMs = Date.now()
  const { sessionId } = await params

  if (!sessionId) {
    return NextResponse.json({ ok: false, error: 'sessionId required' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as {
    doc_type?: DocumentType
    document_id?: string
    controlling_spelling?: Record<string, string>
    retake_count?: number
  }

  const retakeCount  = typeof body.retake_count === 'number' ? body.retake_count : 0
  const supabase     = createAdminSupabaseClient()

  // ── 1. Validate session ───────────────────────────────────────────────────
  const { data: session } = await supabase
    .from('translation_sessions')
    .select('session_id, doc_type, status')
    .eq('session_id', sessionId)
    .single()

  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 })
  }

  const docType: DocumentType =
    body.doc_type ?? (session.doc_type as DocumentType) ?? 'ua_passport_booklet'

  // Critical field set — driven by module registry, not hardcoded
  // This replaces the old static 8-field CRITICAL_FIELDS constant.
  const CRITICAL_FIELDS = getCriticalFieldSetForDocumentType(docType)

  // ── 2. Locate document ────────────────────────────────────────────────────
  const docQuery = supabase
    .from('translation_documents')
    .select('id, storage_key, mime_type, original_name')
    .eq('session_id', sessionId)

  if (body.document_id) {
    docQuery.eq('id', body.document_id)
  } else {
    docQuery.order('created_at', { ascending: false }).limit(1)
  }

  const { data: docRows } = await docQuery
  const doc = docRows?.[0]

  if (!doc) {
    return NextResponse.json({
      ok: false,
      error: 'No uploaded document found. Upload a document first via POST /api/translation/upload.',
    }, { status: 404 })
  }

  // ── Create extraction_runs row for audit ──────────────────────────────────
  let runId: string | null = null
  const { data: runRow } = await supabase
    .from('extraction_runs')
    .insert({
      session_id:   sessionId,
      document_id:  doc.id,
      status:       'processing',
      started_at:   new Date().toISOString(),
      retake_count: retakeCount,
    })
    .select('id')
    .single()
  runId = runRow?.id ?? null

  await writeAuditLog({
    session_id: sessionId,
    event_type: 'ocr_started',
    metadata: { run_id: runId, doc_type: docType, document_id: doc.id, provider: 'google_vision', retake_count: retakeCount },
  })

  // ── 3. Download image from Supabase Storage ───────────────────────────────
  let imageBuffer: Buffer
  try {
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('translation-documents')
      .download(doc.storage_key)

    if (dlErr || !fileData) throw new Error(dlErr?.message ?? 'download returned no data')
    imageBuffer = Buffer.from(await fileData.arrayBuffer())
  } catch (err) {
    await finaliseRun(supabase, runId, 'failed', sessionId, {
      error_message: 'Could not load your document. Please try re-uploading.',
      error_detail: String(err),
    })
    return NextResponse.json({ ok: false, error: 'Failed to load document from storage.' }, { status: 500 })
  }

  // ── 4. Preprocess image ───────────────────────────────────────────────────
  const pre = await preprocessImage(imageBuffer, doc.mime_type ?? 'image/jpeg')

  if (!pre.ok) {
    if (pre.code === 'unsupported_file_type') {
      await finaliseRun(supabase, runId, 'failed', sessionId, {
        error_message: pre.message,
        error_detail:  pre.detail,
      })
      // G2: image quality / file type failure → manual review ticket
      await routePipelineToManualReview(gateInputFromSignals({
        sessionId,
        documentId: doc.id,
        documentType: docType,
        moduleStatus: findDocumentModule(docType)?.status ?? null,
        imageQuality: { failed: true, retries: retakeCount },
        retakeExhausted: retakeCount >= SMART_RETAKE_MAX_ATTEMPTS,
        extractionErrors: ['preprocess_unsupported_file_type'],
      }))
      return NextResponse.json({ ok: false, error: pre.message, code: pre.code }, { status: 422 })
    }
    await finaliseRun(supabase, runId, 'failed', sessionId, {
      error_message: pre.message,
      error_detail:  pre.detail,
    })
    // G2: preprocess generic failure → manual review ticket
    await routePipelineToManualReview(gateInputFromSignals({
      sessionId,
      documentId: doc.id,
      documentType: docType,
      moduleStatus: findDocumentModule(docType)?.status ?? null,
      imageQuality: { failed: true, retries: retakeCount },
      retakeExhausted: retakeCount >= SMART_RETAKE_MAX_ATTEMPTS,
      extractionErrors: ['preprocess_failed'],
    }))
    return NextResponse.json({ ok: false, error: pre.message }, { status: 422 })
  }

  // ── 5. Run Google Vision OCR ──────────────────────────────────────────────
  const ocrProvider = getOcrProvider()
  const ocrRaw      = await ocrProvider.extractText({
    imageBuffer: pre.buffer,
    mimeType:    pre.mimeType,
  })

  // BLOCKED: missing credentials
  if (isUnusableOcr(ocrRaw)) {
    // Distinguish a missing-credentials BLOCK from a provider FAILURE (P1):
    // both halt this storage-OCR run, but a failure carries a typed reason/code.
    const blockReason = isProviderError(ocrRaw) ? ocrRaw.error.message : ocrRaw.reason
    const requiredEnv = isProviderError(ocrRaw) ? [] : ocrRaw.required_env_vars
    const blockCode = isProviderError(ocrRaw) ? ocrRaw.error.error_code : 'ocr_provider_blocked'
    await finaliseRun(supabase, runId, 'failed', sessionId, {
      error_message: 'OCR provider not configured. Contact support.',
      error_detail:  blockReason,
    })
    // G3: ocr provider blocked → manual review ticket (system_error, high priority via paidUser/urgent)
    await routePipelineToManualReview(gateInputFromSignals({
      sessionId,
      documentId: doc.id,
      documentType: docType,
      moduleStatus: findDocumentModule(docType)?.status ?? null,
      extractionErrors: ['ocr_provider_blocked'],
      paidUser: true,  // surface as HIGH priority — this is a system outage
    }))
    return NextResponse.json({
      ok: false,
      error: 'OCR provider is not configured.',
      code: blockCode,
      required_env_vars: requiredEnv,
      setup_instructions: requiredEnv.length
        ? `Add the following environment variables to your Vercel project settings:\n${requiredEnv.map(v => `  ${v}`).join('\n')}`
        : undefined,
    }, { status: 503 })
  }

  const ocrResult = ocrRaw

  // No text detected → Smart Retake or manual review
  if (ocrResult.words.length === 0 || ocrResult.raw_text.trim().length < 5) {
    if (retakeCount < SMART_RETAKE_MAX_ATTEMPTS) {
      await finaliseRun(supabase, runId, 'retake_required', sessionId, {
        error_message: SMART_RETAKE_USER_MESSAGE,
        image_quality: { overall: 0.1, issues: ['no_text_detected'] },
        retake_count: retakeCount,
      })
      return NextResponse.json({
        ok: false,
        code: 'retake_required',
        error: SMART_RETAKE_USER_MESSAGE,
        retake_count: retakeCount,
        max_retakes:  SMART_RETAKE_MAX_ATTEMPTS,
      }, { status: 422 })
    }
    // Exhausted retakes → manual review
    await finaliseRun(supabase, runId, 'manual_review_required', sessionId, {
      error_message: 'Automatic extraction could not read your document. Please use manual entry or re-upload a clearer photo.',
    })
    // G4: smart-retake exhausted (no text detected) → manual review ticket
    await routePipelineToManualReview(gateInputFromSignals({
      sessionId,
      documentId: doc.id,
      documentType: docType,
      moduleStatus: findDocumentModule(docType)?.status ?? null,
      retakeExhausted: true,
      ocrFailureCount: retakeCount,
      extractionErrors: ['no_text_detected'],
    }))
    return NextResponse.json({
      ok: false,
      code: 'manual_review_required',
      error: 'Automatic extraction could not read your document. Please re-upload or enter fields manually.',
    }, { status: 422 })
  }

  // ── 6. DeepSeek Text field mapping ───────────────────────────────────────
  const glossary       = loadGlossary(docType)
  const glossaryJson   = JSON.stringify(glossary, null, 2)

  const mapResult = await mapFieldsWithDeepSeek({ ocrResult, docType, glossaryJson })

  if (!mapResult.ok || mapResult.fields.length === 0) {
    await finaliseRun(supabase, runId, 'manual_review_required', sessionId, {
      error_message: 'Could not identify fields in your document. Please re-upload a clearer photo or enter fields manually.',
      raw_text: ocrResult.raw_text.slice(0, 2000),
    })
    // G5: DeepSeek field-mapping failure → manual review ticket
    await routePipelineToManualReview(gateInputFromSignals({
      sessionId,
      documentId: doc.id,
      documentType: docType,
      moduleStatus: findDocumentModule(docType)?.status ?? null,
      ocrConfidence: 0.3,
      extractionErrors: ['deepseek_mapping_failed'],
    }))
    return NextResponse.json({
      ok: false,
      code: 'manual_review_required',
      error: 'Could not identify fields in your document. Please re-upload or enter fields manually.',
      warnings: mapResult.warnings,
    }, { status: 422 })
  }

  // Smart Retake: image quality too low
  const imageQuality = mapResult.image_quality
  if (
    imageQuality &&
    imageQuality.overall < SMART_RETAKE_QUALITY_THRESHOLD &&
    retakeCount < SMART_RETAKE_MAX_ATTEMPTS
  ) {
    await finaliseRun(supabase, runId, 'retake_required', sessionId, {
      error_message: SMART_RETAKE_USER_MESSAGE,
      image_quality: imageQuality,
      retake_count: retakeCount,
    })
    return NextResponse.json({
      ok: false,
      code: 'retake_required',
      error: SMART_RETAKE_USER_MESSAGE,
      retake_count: retakeCount,
      max_retakes:  SMART_RETAKE_MAX_ATTEMPTS,
    }, { status: 422 })
  }

  // G4 (image quality variant): retake budget exhausted with low quality
  if (
    imageQuality &&
    imageQuality.overall < SMART_RETAKE_QUALITY_THRESHOLD &&
    retakeCount >= SMART_RETAKE_MAX_ATTEMPTS
  ) {
    await routePipelineToManualReview(gateInputFromSignals({
      sessionId,
      documentId: doc.id,
      documentType: docType,
      moduleStatus: findDocumentModule(docType)?.status ?? null,
      retakeExhausted: true,
      ocrFailureCount: retakeCount,
      ocrConfidence: imageQuality.overall,
      imageQuality: { failed: true, retries: retakeCount },
      extractionErrors: ['image_quality_below_threshold'],
    }))
  }

  // ── 7. Resolve OCR IDs → bboxes ──────────────────────────────────────────
  const ocrLookup = buildOcrLookup(ocrResult)

  const fields: ExtractedField[] = mapResult.fields.map(mf => {
    const resolved = resolveOcrIds(mf.ocr_ids, ocrLookup)

    // If any OCR ID was unknown → flag review_required
    const hasUnknownIds = resolved.unresolved_ids.length > 0
    const isCritical    = CRITICAL_FIELDS.has(mf.field)
    const reviewRequired =
      mf.review_required ||
      resolved.review_required_by_bbox ||
      (hasUnknownIds && isCritical)

    // evidence_type: exact → 'ocr_bbox', multi-word → 'combined_ocr_bbox', missing → 'zone_fallback'
    const evidenceType =
      resolved.bbox_status === 'exact'    ? 'ocr_bbox' as const :
      resolved.bbox_status === 'combined' ? 'combined_ocr_bbox' as const :
      'zone_fallback' as const

    return {
      field:            mf.field,
      source_label:     mf.source_label ?? '',
      source_zone:      mf.source_zone ?? '',
      bbox:             resolved.bbox,
      raw_value:        mf.raw_value,
      normalized_value: mf.normalized_value,
      language_layer:   mf.language_layer ?? 'uk',
      confidence:       mf.confidence,
      review_required:  reviewRequired,
      ocr_ids:          mf.ocr_ids,
      combined_bbox:    resolved.bbox_status === 'combined' ? resolved.bbox : undefined,
      evidence_type:    evidenceType,
      bbox_status:      resolved.bbox_status,
    } satisfies ExtractedField
  })

  // ── 8. Post-process: transliteration + date normalisation + glossary ──────
  const nameFields = new Set(['surname','given_names','full_name','last_name','first_name','father_name','mother_name'])
  const controllingSpelling = body.controlling_spelling ?? {}

  const processed = fields.map(f => {
    let normalized = f.normalized_value
    if (nameFields.has(f.field)) {
      normalized = transliterateName(f.raw_value, controllingSpelling[f.field])
    } else if (f.field.startsWith('date_') || f.field.endsWith('_date') || f.field === 'issue_date') {
      const dateNorm = normalizeDateUkrainian(f.raw_value, glossary.months ?? {})
      if (dateNorm) normalized = dateNorm
    } else {
      const looked = lookupTerm(glossary, f.raw_value)
      if (looked) normalized = looked
    }
    return { ...f, normalized_value: normalized }
  })

  // ── 9a. Phase 3: Critical field completeness guard ───────────────────────
  // All critical fields (per module) must have a DB row — even if unreadable.
  // Missing fields get a review_required placeholder so the Evidence Review
  // UI can show them and block certification until the user resolves them.
  const ALL_CRITICAL_FIELDS = getCriticalFieldsForDocumentType(docType)

  const presentFieldNames = new Set(processed.map(f => f.field))
  const missingCritical = ALL_CRITICAL_FIELDS.filter(f => !presentFieldNames.has(f))

  const placeholders: ExtractedField[] = missingCritical.map(f => ({
    field:            f,
    source_label:     '',
    source_zone:      'unknown',
    bbox:             [0, 0, 0, 0] as [number, number, number, number],
    raw_value:        '',
    normalized_value: '',
    language_layer:   'uk',
    confidence:       0,
    review_required:  true,
    evidence_type:    'zone_fallback',
    bbox_status:      'missing',
    ocr_ids:          [],
  }))

  const withPlaceholders = [...processed, ...placeholders]
  if (placeholders.length > 0) {
    console.warn(`[ocr-from-storage] ${sessionId} — ${placeholders.length} critical field(s) not extracted: ${missingCritical.join(', ')}`)
  }

  // G6: missing critical fields → manual review ticket
  // G7: non-active module → manual review ticket (covered by same call via moduleStatus)
  // Both are bundled into a single router invocation so we get one ticket with
  // both reasons rather than two separate tickets.
  const moduleForGate = findDocumentModule(docType)
  const moduleStatusForGate = moduleForGate?.status ?? null
  const needsTicket = (placeholders.length > 0) || (moduleStatusForGate !== null && moduleStatusForGate !== 'active')

  if (needsTicket) {
    const ocrAvgConf = withPlaceholders.length
      ? withPlaceholders.reduce((s, f) => s + f.confidence, 0) / withPlaceholders.length
      : 0
    await routePipelineToManualReview(gateInputFromSignals({
      sessionId,
      documentId: doc.id,
      documentType: docType,
      moduleStatus: moduleStatusForGate,
      ocrConfidence: ocrAvgConf,
      criticalFieldResults: ALL_CRITICAL_FIELDS.map(f => {
        const found = processed.find(p => p.field === f)
        return {
          fieldKey: f,
          present: Boolean(found),
          hasEvidence: Boolean(found && found.evidence_type === 'ocr_bbox'),
        }
      }),
    }))
  }

  // ── 9. Persist extracted_fields ───────────────────────────────────────────
  await persistExtractedFields(sessionId, withPlaceholders)

  // Advance session status
  await supabase.from('translation_sessions').update({
    status:     'extracted',
    doc_type:   docType,
    updated_at: new Date().toISOString(),
  }).eq('session_id', sessionId)

  // Finalise extraction_runs row
  const durationMs      = Date.now() - startMs
  const ocrConfidence   = withPlaceholders.length
    ? withPlaceholders.reduce((s, f) => s + f.confidence, 0) / withPlaceholders.length
    : 0

  await finaliseRun(supabase, runId, 'completed', sessionId, {
    provider:       'google_vision',
    raw_text:       ocrResult.raw_text.slice(0, 8000),
    warnings:       [...ocrResult.warnings, ...mapResult.warnings],
    confidence:     ocrConfidence,
    image_quality:  imageQuality ?? null,
    retake_count:   retakeCount,
  })

  // Audit
  await writeAuditLog({
    session_id: sessionId,
    event_type: 'ocr_completed',
    metadata: {
      run_id: runId, doc_id: doc.id, provider: 'google_vision',
      ocr_words: ocrResult.words.length, ocr_lines: ocrResult.lines.length,
      ocr_processing_ms: ocrResult.processing_ms, total_ms: durationMs,
      fields_total: withPlaceholders.length,
      review_required_count: withPlaceholders.filter(f => f.review_required).length,
      missing_critical_count: placeholders.length,
      bbox_exact:    withPlaceholders.filter(f => f.bbox_status === 'exact').length,
      bbox_combined: withPlaceholders.filter(f => f.bbox_status === 'combined').length,
      bbox_missing:  withPlaceholders.filter(f => f.bbox_status === 'missing').length,
    },
  })

  await writeAuditLog({
    session_id: sessionId,
    event_type: 'extraction_completed',
    metadata: { run_id: runId, doc_id: doc.id, total_fields: processed.length },
  })

  console.log(`[ocr-from-storage] ${sessionId} — ${withPlaceholders.length} fields (${placeholders.length} placeholders) in ${durationMs}ms (ocr=${ocrResult.processing_ms}ms)`)

  // ── Return HTTP 200 with extracted fields ────────────────────────────────
  return NextResponse.json({
    ok: true,
    status: 'completed',
    extraction_run_id: runId,
    session_id: sessionId,
    doc_type: docType,
    provider: 'google_vision',
    ocr_words_count: ocrResult.words.length,
    fields_count: withPlaceholders.length,
    review_required_count: withPlaceholders.filter(f => f.review_required).length,
    missing_critical_count: placeholders.length,
    duration_ms: durationMs,
    warnings: [...ocrResult.warnings, ...mapResult.warnings],
    fields: withPlaceholders.map(f => ({
      field:            f.field,
      raw_value:        f.raw_value,
      normalized_value: f.normalized_value,
      ocr_ids:          f.ocr_ids ?? [],
      bbox:             f.bbox,
      bbox_status:      f.bbox_status,
      evidence_type:    f.evidence_type,
      confidence:       f.confidence,
      review_required:  f.review_required,
    })),
    next_step: `/en/services/translate-document/session/${sessionId}/review`,
  })
}

// ── Helper: update extraction_runs row ───────────────────────────────────────
async function finaliseRun(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  runId: string | null,
  status: string,
  sessionId: string,
  extra: Record<string, unknown>
): Promise<void> {
  if (!runId) return
  await supabase.from('extraction_runs').update({
    status,
    completed_at: new Date().toISOString(),
    ...extra,
  }).eq('id', runId).then(() => {}, () => {})

  if (status === 'failed' || status === 'manual_review_required' || status === 'retake_required') {
    await writeAuditLog({
      session_id: sessionId,
      event_type: status === 'retake_required' ? 'ocr_retake_required' : 'ocr_failed',
      metadata: { run_id: runId, status, ...extra },
    })
  }
}
