/**
 * canonical/documentGate.ts — Document-Type Confidence Gate + Provider Output
 * Quarantine (ENGINEERING_MASTER_PLAN.md §5 "Canonical core").
 *
 * Two related rules, both pure:
 *
 *  1. Document-Type Confidence Gate — if we are not confident WHAT the document is
 *     (low doc-type confidence / unknown page), then we cannot trust that a region
 *     maps to a given field. Every recognized field is forced to review with reason
 *     'unknown_document_type'. A confident value on an unknown page is a lie.
 *
 *  2. Provider Output Quarantine — a value is a CANDIDATE until the gates pass.
 *     `partitionQuarantine` splits a result into accepted (no review needed) vs
 *     quarantined (still requires review). Downstream may only auto-use accepted
 *     fields; quarantined ones must be confirmed.
 */
import type { CanonicalDocumentResult, CanonicalField } from './types'

/** Default minimum document-type confidence to trust field→region mapping. */
export const DOC_TYPE_GATE_THRESHOLD = 0.7

/**
 * If the document type is not confidently known, quarantine EVERY field for review
 * (we can't trust the field map). At/above threshold, the result is unchanged.
 */
export function applyDocumentTypeGate(
  doc: CanonicalDocumentResult,
  docTypeConfidence: number,
  opts: { threshold?: number } = {},
): CanonicalDocumentResult {
  const threshold = opts.threshold ?? DOC_TYPE_GATE_THRESHOLD
  if (docTypeConfidence >= threshold) return doc

  const fields: CanonicalField[] = doc.fields.map((f) =>
    f.reviewRequired && f.reviewReasons.includes('unknown_document_type')
      ? f
      : {
          ...f,
          reviewRequired: true,
          reviewReasons: Array.from(new Set([...f.reviewReasons, 'unknown_document_type'])),
        },
  )
  return { ...doc, fields, requiresReview: fields.length > 0 ? true : doc.requiresReview }
}

export interface QuarantinePartition {
  /** Fields that passed every gate — safe to auto-use. */
  accepted: CanonicalField[]
  /** Fields still requiring human confirmation (candidates). */
  quarantined: CanonicalField[]
}

/**
 * Split a result into accepted vs quarantined. A field is accepted ONLY when it
 * requires no review; everything else is a candidate held in quarantine until
 * confirmed. (Expresses "providers emit candidates until the gates pass".)
 */
export function partitionQuarantine(doc: CanonicalDocumentResult): QuarantinePartition {
  const accepted: CanonicalField[] = []
  const quarantined: CanonicalField[] = []
  for (const f of doc.fields) {
    if (f.reviewRequired) quarantined.push(f)
    else accepted.push(f)
  }
  return { accepted, quarantined }
}
