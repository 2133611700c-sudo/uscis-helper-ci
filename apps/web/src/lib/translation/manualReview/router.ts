/**
 * Manual Review Router — central gate logic.
 *
 * shouldRouteToManualReview() takes signals from classification, image quality,
 * extraction, and validators, and returns a structured routing decision.
 *
 * This is the single function that pipeline integration points (extract route,
 * render route, certification gate) call to decide whether to escalate.
 *
 * Contract:
 *   - Pure function. No DB, no I/O. No PII. Inputs only.
 *   - Never throws. Always returns a decision.
 *   - When in doubt → manualReviewRequired: true (safe default).
 */

import type {
  ManualReviewReason,
  ManualReviewPriority,
} from './types'

// ── Threshold constants (tunable) ────────────────────────────────────────────

export const ROUTER_THRESHOLDS = {
  /** Below this classifier confidence → low_classification_confidence */
  classifierConfidence: 0.85,
  /** Below this overall OCR confidence → low_ocr_confidence */
  ocrConfidence: 0.65,
  /** Maximum allowed image-quality retries before image_quality_failed fires */
  maxImageQualityRetries: 3,
} as const

// ── Input shape ──────────────────────────────────────────────────────────────

export interface RouterInput {
  /** Resolved canonical document type from classifier (null if unknown) */
  documentType?: string | null

  /** Module status from registry */
  moduleStatus?: 'active' | 'draft' | 'manual_only' | 'disabled' | null

  /** Classifier confidence 0–1 */
  classifierConfidence?: number | null

  /** Image quality verdict */
  imageQuality?: {
    failed: boolean
    retries: number
  } | null

  /** Critical-field extraction outcome */
  criticalFieldResults?: {
    fieldKey: string
    /** True = extracted; false = missing */
    present: boolean
    /** True = OCR bbox / source trace present */
    hasEvidence: boolean
  }[] | null

  /** Validator output (any failed validators surface as missing/critical) */
  validatorResults?: {
    fieldKey: string
    passed: boolean
    severity: 'info' | 'warn' | 'error'
  }[] | null

  /** Aggregated OCR confidence 0–1 */
  ocrConfidence?: number | null

  /** True if user explicitly clicked "Need human help" */
  userRequestedHelp?: boolean

  /** Any extraction or render system error caught upstream */
  extractionErrors?: string[] | null

  /** Document content signals (computed during OCR/extraction) */
  contentSignals?: {
    longLegalText?: boolean
    complexTable?: boolean
    handwritingHeavy?: boolean
    unclearSealOrStamp?: boolean
    legalOrCourt?: boolean
    military?: boolean
    diplomaOrTranscript?: boolean
    glossaryUnresolved?: boolean
    identityConflict?: boolean
  } | null

  /** Whether the user has paid (for priority bumping) */
  paidUser?: boolean

  /** True if the user marked the case as urgent */
  urgent?: boolean

  /** Repeated attempts on the same document → priority high */
  ocrFailureCount?: number | null
}

export interface RouterDecision {
  manualReviewRequired: boolean
  reasons: ManualReviewReason[]
  priority: ManualReviewPriority
  /**
   * i18n key for the user-facing message. The route handler picks the
   * locale-appropriate string from messages/manualReview.ts.
   */
  userMessageKey: string
}

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Decide whether this document needs manual review and why.
 *
 * Routing rules (any one triggers escalation):
 *   1. unknown/missing document type
 *   2. module status not 'active'
 *   3. classifier confidence below threshold
 *   4. image quality failed after max retries
 *   5. any critical field missing
 *   6. any critical field missing source evidence (review-safe fallback gone)
 *   7. ocr confidence below threshold
 *   8. validator with severity 'error'
 *   9. content signals: legal text, table, handwriting, seal, court, military, diploma
 *  10. glossary unresolved
 *  11. identity conflict
 *  12. extraction/system errors present
 *  13. user explicitly requested help
 */
export function shouldRouteToManualReview(input: RouterInput): RouterDecision {
  const reasons: ManualReviewReason[] = []

  // ── 1. Unknown document type ──────────────────────────────────────────────
  const docType = (input.documentType ?? '').trim()
  if (!docType) {
    reasons.push('unknown_document_type')
  }

  // ── 2. Module status ──────────────────────────────────────────────────────
  const moduleStatus = input.moduleStatus ?? null
  if (moduleStatus !== null && moduleStatus !== 'active') {
    if (moduleStatus === 'draft' || moduleStatus === 'disabled' || moduleStatus === 'manual_only') {
      reasons.push('unsupported_document_type')
    }
  }

  // ── 3. Classifier confidence ──────────────────────────────────────────────
  const cConf = input.classifierConfidence
  if (typeof cConf === 'number' && cConf < ROUTER_THRESHOLDS.classifierConfidence) {
    reasons.push('low_classification_confidence')
  }

  // ── 4. Image quality ──────────────────────────────────────────────────────
  if (input.imageQuality?.failed && (input.imageQuality.retries ?? 0) >= ROUTER_THRESHOLDS.maxImageQualityRetries) {
    reasons.push('image_quality_failed')
  } else if (input.imageQuality?.failed) {
    // Failed but retries available — caller may decide to retry first.
    // Still surface as a soft reason so retry loop can record it.
  }

  // ── 5. Critical fields missing ────────────────────────────────────────────
  if (Array.isArray(input.criticalFieldResults) && input.criticalFieldResults.length > 0) {
    const missing = input.criticalFieldResults.filter(r => !r.present)
    if (missing.length > 0) {
      reasons.push('missing_critical_fields')
    }

    // ── 6. Critical fields without source evidence ──────────────────────────
    const presentNoEvidence = input.criticalFieldResults.filter(r => r.present && !r.hasEvidence)
    if (presentNoEvidence.length > 0) {
      reasons.push('missing_source_evidence')
    }
  }

  // ── 7. OCR confidence ─────────────────────────────────────────────────────
  const oConf = input.ocrConfidence
  if (typeof oConf === 'number' && oConf < ROUTER_THRESHOLDS.ocrConfidence) {
    reasons.push('low_ocr_confidence')
  }

  // ── 8. Validator errors ───────────────────────────────────────────────────
  if (Array.isArray(input.validatorResults)) {
    const hardFails = input.validatorResults.filter(v => !v.passed && v.severity === 'error')
    if (hardFails.length > 0 && !reasons.includes('missing_critical_fields')) {
      reasons.push('missing_critical_fields')
    }
  }

  // ── 9. Content signals ────────────────────────────────────────────────────
  const cs = input.contentSignals
  if (cs) {
    if (cs.longLegalText) reasons.push('long_legal_text')
    if (cs.complexTable) reasons.push('complex_table_document')
    if (cs.handwritingHeavy) reasons.push('unclear_handwriting')
    if (cs.unclearSealOrStamp) reasons.push('unclear_seal_or_stamp')
    if (cs.legalOrCourt) reasons.push('legal_or_court_document')
    if (cs.military) reasons.push('military_document')
    if (cs.diplomaOrTranscript) reasons.push('diploma_or_transcript')
    if (cs.glossaryUnresolved) reasons.push('glossary_unresolved')
    if (cs.identityConflict) reasons.push('identity_conflict')
  }

  // ── 10. Extraction errors ─────────────────────────────────────────────────
  if (Array.isArray(input.extractionErrors) && input.extractionErrors.length > 0) {
    reasons.push('system_error')
  }

  // ── 11. User asked for help ──────────────────────────────────────────────
  if (input.userRequestedHelp === true) {
    reasons.push('user_requested_human_help')
  }

  // ── Dedup ─────────────────────────────────────────────────────────────────
  const dedup = Array.from(new Set(reasons))

  const manualReviewRequired = dedup.length > 0
  const priority = computePriority(input, dedup)
  const userMessageKey = computeUserMessageKey(dedup)

  return {
    manualReviewRequired,
    reasons: dedup,
    priority,
    userMessageKey,
  }
}

// ── Priority logic ───────────────────────────────────────────────────────────

function computePriority(input: RouterInput, reasons: ManualReviewReason[]): ManualReviewPriority {
  if (reasons.length === 0) return 'normal'

  // High triggers
  if (reasons.includes('identity_conflict')) return 'high'
  if (input.urgent === true) return 'high'
  if (input.paidUser === true && reasons.length > 0) return 'high'
  if (typeof input.ocrFailureCount === 'number' && input.ocrFailureCount >= 3) return 'high'

  // Low triggers — user asked help with no document
  if (reasons.length === 1 && reasons[0] === 'user_requested_human_help') {
    return 'low'
  }

  return 'normal'
}

// ── User message key resolver ────────────────────────────────────────────────

/**
 * Map reasons to a single user-facing message key. The first matching reason
 * in priority order wins. Routes without manual review return 'mr.not_required'.
 */
function computeUserMessageKey(reasons: ManualReviewReason[]): string {
  if (reasons.length === 0) return 'mr.not_required'

  // Priority order — most actionable to user first
  const ordered: ManualReviewReason[] = [
    'image_quality_failed',
    'identity_conflict',
    'missing_critical_fields',
    'unsupported_document_type',
    'unknown_document_type',
    'long_legal_text',
    'complex_table_document',
    'legal_or_court_document',
    'military_document',
    'diploma_or_transcript',
    'unclear_handwriting',
    'unclear_seal_or_stamp',
    'glossary_unresolved',
    'low_classification_confidence',
    'low_ocr_confidence',
    'missing_source_evidence',
    'system_error',
    'user_requested_human_help',
  ]

  for (const r of ordered) {
    if (reasons.includes(r)) return `mr.${r}`
  }
  return 'mr.generic_manual_review'
}
