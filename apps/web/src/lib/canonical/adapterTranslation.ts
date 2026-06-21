/**
 * canonical/adapterTranslation.ts — the Translation-stack half of P2.2.
 *
 * Mirrors adapter.ts (the TPS half): maps the Translation reader's output
 * (`ExtractedField`) into a `CanonicalDocumentResult` using the SAME P2.1 policy.
 * With both adapters emitting the identical canonical shape, P2.3's `diffCanonical`
 * can finally measure the two brains against each other on one document.
 *
 * ADDITIVE: imported by nothing in the live flow. Same two invariants as the TPS
 * adapter — never lower the reader's review flag; never drop a candidate.
 */
import type { ExtractedField } from '@/lib/translation/types'
import type {
  CanonicalField,
  CanonicalDocumentResult,
  CanonicalProduct,
  FieldConfidence,
  FieldEvidence,
  SourceKind,
} from './types'
import { criticalityOf, buildConfidence, decideReviewRequired } from './policy'
import { mergeCanonicalByKey } from './adapter'

/**
 * The Translation stack has no explicit source enum — it reads primarily via an
 * AI vision model (Gemini). Infer authority from the zone: an MRZ zone is the
 * controlling Latin source; a user correction is manual; otherwise the reader is
 * AI vision (ranked below document OCR, deliberately — a vision guess must not
 * outrank a labelled document read).
 */
function mapSource(f: ExtractedField): SourceKind {
  if (f.user_corrected) return 'manual_user_entry'
  if (/mrz/i.test(f.source_zone)) return 'mrz'
  return 'ai_vision'
}

/**
 * Honest split confidence. ExtractedField gives one provider `confidence` (→ ocr)
 * and a `passes[]` list (no `failures[]`). We only assert `source_match` for an
 * MRZ zone whose passes include a check-digit pass. Unknown layers stay null
 * (excluded from the `final` min — not faked as 1).
 */
function deriveLayers(f: ExtractedField, source: SourceKind): Omit<FieldConfidence, 'final'> {
  const ocr = typeof f.confidence === 'number' ? f.confidence : null
  let source_match: number | null = null
  if (source === 'mrz') {
    const passes = f.passes ?? []
    source_match = passes.some((p) => /mrz|check/i.test(p)) ? 0.99 : null
  }
  return { ocr, field_match: null, normalization: null, source_match }
}

/** Map one Translation field to a CanonicalField (single candidate of evidence). */
export function toCanonicalFieldFromTranslation(f: ExtractedField): CanonicalField {
  const source = mapSource(f)
  const confidence = buildConfidence(deriveLayers(f, source))
  const evidence: FieldEvidence[] = [
    {
      value: f.normalized_value || f.raw_value,
      source,
      confidence: typeof f.confidence === 'number' ? f.confidence : null,
      provider: `translation:${f.source_zone || f.source_label || 'unknown'}`,
    },
  ]
  const decided = decideReviewRequired(
    { key: f.field, rawValue: f.raw_value, normalizedValue: f.normalized_value, confidence, evidence },
    {},
  )
  return {
    key: f.field,
    rawValue: f.raw_value,
    normalizedValue: f.normalized_value,
    criticality: criticalityOf(f.field),
    confidence,
    source,
    reviewRequired: f.review_required || decided.reviewRequired, // never lower the reader's flag
    reviewReasons: Array.from(
      new Set([...(f.review_required ? ['source_module_review_required'] : []), ...decided.reasons]),
    ),
    evidence,
  }
}

export interface ReadCanonicalTranslationInput {
  documentSessionId: string
  docType: string
  fields: ExtractedField[]
  /** ISO-8601 UTC — caller stamps it. */
  createdAt: string
  /** Defaults to 'translation'. */
  product?: CanonicalProduct
}

/** Build the single CanonicalDocumentResult from Translation extraction output. */
export function readCanonicalDocumentFromTranslation(
  input: ReadCanonicalTranslationInput,
): CanonicalDocumentResult {
  const mapped = input.fields.map(toCanonicalFieldFromTranslation)
  const merged = mergeCanonicalByKey(mapped)
  return {
    documentSessionId: input.documentSessionId,
    product: input.product ?? 'translation',
    docType: input.docType,
    fields: merged,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: input.createdAt,
    requiresReview: merged.some((f) => f.reviewRequired),
  }
}
