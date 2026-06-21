/**
 * documentSafety/ocrFieldSafetyGate — the ONE global OCR field safety guard.
 *
 * Containment for the P0 incident (docs/reports/P0_ROOT_CAUSE_ANALYSIS.md): there are 6 reader paths with 4
 * different safety regimes, and a wrong/garbled critical value can currently be shown AS the field value.
 * This pure guard is the single source of truth for: "may this OCR-derived field be a FINAL value, or must it
 * be candidate-only / manual / blocked?" — applied identically across Translation / TPS / legacy / Re-Parole / EAD.
 *
 * DESIGN — safe by construction:
 *  - It NEVER receives or emits the actual value (only `value_present` booleans) → cannot leak or alter content,
 *    PII-free, no silent correction (contract rule 8). It decides METADATA only: final/candidate/review/manual/block.
 *  - `review_required` / `manual_required` can only INCREASE, never decrease (contract rule 9).
 *  - Deterministic, no I/O, no model call.
 *
 * It does NOT read documents and is NOT a reader. Wiring into product flows is the next increment (behind a
 * flag, default OFF). See GLOBAL_OCR_FIELD_SAFETY_CONTRACT.md.
 */

export type OcrFlow =
  | 'translation_public'
  | 'translation_session'
  | 'tps_core'
  | 'tps_legacy'
  | 'legacy_ocr'
  | 'reparole'
  | 'ead'
  | 'unknown'

export type OcrFieldCriticality = 'critical_identity' | 'critical_document' | 'admin' | 'optional'

export type OcrSafetyDecision = 'accept_final' | 'candidate_only' | 'manual_required' | 'block'

export type OcrSafetyReason =
  | 'zero_usable_recognition'
  | 'hard_case_manual_required'
  | 'source_doc_type_mismatch'
  | 'source_label_mismatch'
  | 'no_strong_source_anchor'
  | 'legacy_reader_untrusted'
  | 'stale_or_ambiguous_session'
  | 'classifier_conflict'
  | 'review_flag_missing'
  | 'candidate_final_not_separated'
  | 'low_confidence'
  | 'unknown_document_class'

export interface OcrFieldSafetyInput {
  flow: OcrFlow
  field_name: string
  criticality: OcrFieldCriticality
  document_class?: string | null
  source_doc_type?: string | null
  expected_source_doc_type?: string | null
  source_label?: string | null
  value_present: boolean
  candidate_value_present?: boolean
  review_required?: boolean
  manual_required?: boolean
  confidence?: number | null
  strong_source_anchor?: boolean
  source_doc_id_hash?: string | null
  session_doc_id_hash?: string | null
  zero_usable_recognition?: boolean
  hard_case?: boolean
  legacy_reader?: boolean
  classifier_conflict?: boolean
}

export interface OcrFieldSafetyOutput {
  decision: OcrSafetyDecision
  final_value_allowed: boolean
  candidate_allowed: boolean
  review_required: boolean
  manual_required: boolean
  blocked_for_pdf: boolean
  blocked_for_payment: boolean
  reason_codes: OcrSafetyReason[]
  no_pii: true
  policy_version: string
}

export const OCR_SAFETY_POLICY_VERSION = 'ocr-field-safety-1'

const CONFIDENCE_FLOOR = 0.70 // unify the divergent per-path thresholds (RC-3)

function isCritical(c: OcrFieldCriticality): boolean {
  return c === 'critical_identity' || c === 'critical_document'
}

const HARD_CASE_CLASSES = new Set([
  'birth_certificate_soviet_bilingual',
  'birth_certificate_handwritten',
  'ua_birth_certificate',
  'unknown_document',
])

/**
 * The global guard. Pure. Returns metadata only — never a value.
 * Precedence for critical fields: block > manual_required > candidate_only > accept_final.
 */
export function protectOcrField(input: OcrFieldSafetyInput): OcrFieldSafetyOutput {
  const reasons = new Set<OcrSafetyReason>()
  const critical = isCritical(input.criticality)

  // "hard" unsafe conditions → block + manual (the field cannot be trusted at all)
  const sourceMismatch =
    (!!input.expected_source_doc_type && !!input.source_doc_type &&
      input.source_doc_type !== input.expected_source_doc_type)
  const staleSession =
    (!!input.source_doc_id_hash && !!input.session_doc_id_hash &&
      input.source_doc_id_hash !== input.session_doc_id_hash)
  const unknownClass = (input.document_class ?? '') === 'unknown_document'

  if (input.zero_usable_recognition) reasons.add('zero_usable_recognition')
  if (sourceMismatch) reasons.add('source_doc_type_mismatch')
  if (staleSession) reasons.add('stale_or_ambiguous_session')
  if (input.classifier_conflict) reasons.add('classifier_conflict')

  // "soft" unsafe conditions → candidate-only + manual (a value may exist but is not trustworthy as final)
  const hardCase = !!input.hard_case || HARD_CASE_CLASSES.has(input.document_class ?? '')
  const lowConf = typeof input.confidence === 'number' && input.confidence < CONFIDENCE_FLOOR
  const noAnchor = input.strong_source_anchor !== true
  const legacy = !!input.legacy_reader

  if (critical) {
    if (hardCase) reasons.add('hard_case_manual_required')
    if (legacy && !input.strong_source_anchor) reasons.add('legacy_reader_untrusted')
    if (noAnchor) reasons.add('no_strong_source_anchor')
    if (lowConf) reasons.add('low_confidence')
    if (unknownClass) reasons.add('unknown_document_class')
  }

  const hardUnsafe =
    reasons.has('zero_usable_recognition') ||
    reasons.has('source_doc_type_mismatch') ||
    reasons.has('stale_or_ambiguous_session') ||
    reasons.has('classifier_conflict') ||
    reasons.has('unknown_document_class')

  const softUnsafe =
    reasons.has('hard_case_manual_required') ||
    reasons.has('legacy_reader_untrusted') ||
    reasons.has('no_strong_source_anchor') ||
    reasons.has('low_confidence')

  let decision: OcrSafetyDecision
  if (critical && hardUnsafe) {
    decision = input.zero_usable_recognition || !input.value_present ? 'block' : 'manual_required'
  } else if (critical && softUnsafe) {
    decision = input.value_present || input.candidate_value_present ? 'candidate_only' : 'manual_required'
  } else if (!critical) {
    // admin / optional: pass through unless the source itself is mismatched/stale (then review)
    decision = sourceMismatch || staleSession ? 'manual_required' : 'accept_final'
  } else {
    // critical + all-safe (strong anchor, source matches, not hard-case/legacy, conf ok, recognized)
    decision = input.value_present ? 'accept_final' : 'manual_required'
    if (decision === 'manual_required') reasons.add('zero_usable_recognition')
  }

  const final_value_allowed = decision === 'accept_final'
  const candidate_allowed = decision === 'candidate_only' || (!final_value_allowed && !!input.candidate_value_present)
  // monotonic: never lower an incoming flag
  const review_required = (input.review_required === true) || decision !== 'accept_final'
  // Contract 2.5: an unsafe critical field requires human action (confirm/correct) — candidate_only,
  // manual_required and block all set manual_required; only accept_final leaves it as the incoming value.
  const manual_required = (input.manual_required === true) || decision !== 'accept_final'
  const blocked_for_pdf = decision !== 'accept_final'
  const blocked_for_payment = blocked_for_pdf

  return {
    decision,
    final_value_allowed,
    candidate_allowed,
    review_required,
    manual_required,
    blocked_for_pdf,
    blocked_for_payment,
    reason_codes: [...reasons],
    no_pii: true,
    policy_version: OCR_SAFETY_POLICY_VERSION,
  }
}

/** Are there unresolved critical fields that must block PDF/payment/download? (shared output gate, contract rule 10) */
export function hasUnresolvedCriticalForOutput(
  fields: Array<{ criticality: OcrFieldCriticality; review_required?: boolean; manual_required?: boolean; confirmed?: boolean }>,
): boolean {
  return fields.some(
    (f) => isCritical(f.criticality) && (f.review_required === true || f.manual_required === true) && f.confirmed !== true,
  )
}
