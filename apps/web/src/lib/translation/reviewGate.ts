/**
 * reviewGate.ts — single source of truth for the Translation Review Gate.
 *
 * Legal boundary (8 CFR §103.2(b)(3)): a certified English translation may only
 * be rendered/delivered after a human reviewed the machine draft, attested it is
 * complete and accurate, and signed. Messenginfo does NOT certify — the user
 * (applicant or a named certifier) self-certifies.
 *
 * FINAL certified output is refused unless ALL of these are present:
 *   1. certifier name,
 *   2. certifier address,
 *   3. checkbox 1 — the user reviewed the data and it is correct,
 *   4. checkbox 2 — the user understands their signature attests accuracy,
 *   5. a completed signature (drawn-on-screen with data, or wet).
 *
 * `reviewConfirmed` is kept as a back-compat alias: when true it satisfies both
 * checkboxes (older callers that sent a single confirmation flag).
 */

export type SignatureMethod = 'drawn_on_screen' | 'manual_wet_signature'

export interface ReviewGateField {
  field: string
  normalized_value?: string | null
  review_required?: boolean | null
  /** Why the field was flagged. Used to separate soft (no-MRZ-anchor) from hard blocks. */
  review_reasons?: string[] | null
}

export interface ReviewGateInput {
  /** Back-compat single-flag confirmation; true ⇒ both checkboxes satisfied. */
  reviewConfirmed?: boolean | null
  /** Checkbox 1 — "I reviewed the translation, the data is correct." */
  dataReviewed?: boolean | null
  /** Checkbox 2 — "I understand my signature attests the translation is accurate." */
  accuracyAttested?: boolean | null
  signerName?: string | null
  signerAddress?: string | null
  /** ISO timestamp recorded when the user signed the certification. */
  signedAt?: string | null
  signatureMethod?: SignatureMethod | string | null
  /** Data URL of a drawn signature (required when method === 'drawn_on_screen'). */
  signatureDataUrl?: string | null
  /** Legacy public wizard fields — any unresolved OCR review must block output. */
  extractedFields?: ReviewGateField[] | null
}

export type ReviewGateReason =
  | 'signer_name_required'
  | 'signer_address_required'
  | 'data_not_reviewed'
  | 'accuracy_not_attested'
  | 'ocr_review_unresolved'
  | 'signature_required'

export type ReviewGateResult =
  | { ok: true }
  | { ok: false; gate: 'review'; reason: ReviewGateReason; detail: string }

const DETAIL: Record<ReviewGateReason, string> = {
  signer_name_required: 'Certifier name is required before the translation can be certified.',
  signer_address_required: 'Certifier address is required before the translation can be certified.',
  data_not_reviewed: 'Confirm you reviewed the translation and the data is correct.',
  accuracy_not_attested: 'Confirm you understand your signature attests the translation is accurate.',
  ocr_review_unresolved: 'Resolve every OCR field marked for review before certifying the translation.',
  signature_required: 'A signature is required before the translation can be certified.',
}

/** True when the payload carries a completed signature certification act. */
export function isSignatureComplete(input: ReviewGateInput): boolean {
  if (!input.signedAt || !String(input.signedAt).trim()) return false
  if (input.signatureMethod === 'manual_wet_signature') return true
  if (input.signatureMethod === 'drawn_on_screen') {
    return !!input.signatureDataUrl && String(input.signatureDataUrl).trim().length > 0
  }
  return false
}

export function getUnresolvedReviewFields(fields?: ReviewGateField[] | null): string[] {
  if (!Array.isArray(fields)) return []
  const unresolved = new Set<string>()
  for (const field of fields) {
    if (!field?.field) continue
    const normalized = (field.normalized_value ?? '').trim()
    if (field.review_required === true || !normalized) unresolved.add(field.field)
  }
  return [...unresolved]
}

/**
 * A field is "soft-anchor-only" when its ONLY review reason is
 * `critical_no_mrz_anchor` — i.e. it was flagged solely because the document
 * has no MRZ math-anchor (every internal passport booklet, and any passport
 * whose MRZ strip is out of frame). Genuine doubt reasons — low_confidence,
 * mrz_check_failed, provider_conflict, fuzzy_match, reader_review_required,
 * knowledge:* conflicts — make this false.
 */
export function isSoftAnchorOnly(field: ReviewGateField): boolean {
  const reasons = field.review_reasons ?? []
  if (reasons.length === 0) return false
  return reasons.every((r) => r === 'critical_no_mrz_anchor')
}

/**
 * CLIENT pay-gate variant. A field whose only reason is `critical_no_mrz_anchor`
 * AND which has a non-empty value becomes a one-click SOFT confirm, not a hard
 * block on payment. Empty values and genuine doubt reasons still hard-block.
 *
 * Safe: a soft confirm only unlocks the Stripe step. The operator re-reviews
 * every field in /admin and signs before any certified PDF is sent, so user
 * confirmation is never the certification. This does NOT relax the server-side
 * `assertReviewGate` (PDF generation stays strict via getUnresolvedReviewFields).
 */
export function getHardUnresolvedReviewFields(fields?: ReviewGateField[] | null): string[] {
  if (!Array.isArray(fields)) return []
  const unresolved = new Set<string>()
  for (const field of fields) {
    if (!field?.field) continue
    const normalized = (field.normalized_value ?? '').trim()
    if (!normalized) { unresolved.add(field.field); continue }
    if (field.review_required === true && !isSoftAnchorOnly(field)) unresolved.add(field.field)
  }
  return [...unresolved]
}

/** Soft-confirm fields: review_required, value present, only the no-MRZ-anchor reason. */
export function getSoftReviewFields(fields?: ReviewGateField[] | null): string[] {
  if (!Array.isArray(fields)) return []
  const soft = new Set<string>()
  for (const field of fields) {
    if (!field?.field) continue
    const normalized = (field.normalized_value ?? '').trim()
    if (normalized && field.review_required === true && isSoftAnchorOnly(field)) soft.add(field.field)
  }
  return [...soft]
}

/**
 * Hard gate for FINAL certified output. Returns { ok: true } only when name,
 * address, both attestation checkboxes, and a completed signature are present.
 * Never throws — callers branch on .ok and return 403 on failure.
 */
export function assertReviewGate(input: ReviewGateInput): ReviewGateResult {
  const name = (input.signerName ?? '').trim()
  if (!name) return fail('signer_name_required')

  const address = (input.signerAddress ?? '').trim()
  if (!address) return fail('signer_address_required')

  const dataReviewed = input.dataReviewed === true || input.reviewConfirmed === true
  if (!dataReviewed) return fail('data_not_reviewed')

  const accuracyAttested = input.accuracyAttested === true || input.reviewConfirmed === true
  if (!accuracyAttested) return fail('accuracy_not_attested')

  if (getUnresolvedReviewFields(input.extractedFields).length > 0) {
    return fail('ocr_review_unresolved')
  }

  if (!isSignatureComplete(input)) return fail('signature_required')

  return { ok: true }
}

function fail(reason: ReviewGateReason): ReviewGateResult {
  return { ok: false, gate: 'review', reason, detail: DETAIL[reason] }
}
