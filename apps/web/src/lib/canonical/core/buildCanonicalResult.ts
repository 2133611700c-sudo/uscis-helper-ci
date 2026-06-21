/**
 * buildCanonicalResult — the ONE way to wrap arbitrated CanonicalField[] into a full
 * CanonicalDocumentResult. Today only Re-Parole and EAD build the wrapper (inline);
 * TPS and Translation stop at CanonicalField[] and discard it. Phase 1 gives all four
 * the same one-line builder so the wrapper is the single internal currency.
 *
 * PURE: wraps the fields as-is. It does NOT change any field value, review state, or
 * source — it only assembles the envelope (docType / product / requiresReview derived
 * from the fields). `createdAt` is passed in (Date is unavailable in some contexts).
 */
import type {
  CanonicalDocumentResult,
  CanonicalField,
  CanonicalHashChain,
  CanonicalProduct,
} from '../types'

const EMPTY_HASHES: CanonicalHashChain = {
  uploadHash: null,
  normalizedImageHash: null,
  canonicalResultHash: null,
}

export function buildCanonicalResult(input: {
  documentSessionId: string
  product: CanonicalProduct
  docType: string
  fields: CanonicalField[]
  createdAt: string
  hashes?: CanonicalHashChain
}): CanonicalDocumentResult {
  return {
    documentSessionId: input.documentSessionId,
    product: input.product,
    docType: input.docType,
    fields: input.fields,
    hashes: input.hashes ?? EMPTY_HASHES,
    createdAt: input.createdAt,
    requiresReview: input.fields.some((f) => f.reviewRequired),
  }
}
