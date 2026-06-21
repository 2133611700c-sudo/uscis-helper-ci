/**
 * canonical/adapter.ts — P2.2: readCanonicalDocument over the strongest existing
 * reader. Maps the current TPS extraction output (`TpsExtractedField[]`) into a
 * `CanonicalDocumentResult`, applying the P2.1 policy.
 *
 * ADDITIVE: nothing in the live flow imports this yet. It exists so we can build a
 * canonical result from real extraction output and shadow-compare it (P2.3) before
 * any product is migrated onto it.
 *
 * Two invariants:
 *  1. It NEVER lowers a source module's review flag — `reviewRequired` is the OR of
 *     the module's own `review_required` and the canonical policy decision.
 *  2. It NEVER silently drops a candidate — every reading for a field key is kept
 *     in `evidence[]`; cross-source disagreement surfaces via `resolveDisagreement`.
 */
import type { TpsExtractedField } from '@/lib/tps/types'
import type {
  CanonicalField,
  CanonicalDocumentResult,
  CanonicalProduct,
  FieldConfidence,
  FieldEvidence,
  SourceKind,
} from './types'
import { criticalityOf, buildConfidence, decideReviewRequired, resolveDisagreement } from './policy'

/** Map a TPS extraction source to the canonical SourceKind (authority ranking). */
function mapSource(f: TpsExtractedField): SourceKind {
  switch (f.extraction_source) {
    case 'ocr_mrz':
      return 'mrz'
    case 'ai_brain':
      return 'ai_vision'
    case 'user_input':
    case 'user_corrected':
      return 'manual_user_entry'
    // ocr_visual / ocr_keyword / dual_ocr_crossref / inferred → generic document OCR.
    // We deliberately do NOT promote visual reads to 'passport_visual' rank without
    // proof the zone is a passport VIZ — over-ranking would let a guess outrank EAD/I-94.
    default:
      return 'document_ocr'
  }
}

/**
 * Derive the split confidence honestly from what TPS actually provides. TPS gives
 * a single provider `confidence` (→ ocr) and validator pass/fail signals. We only
 * assert `source_match` where we have real evidence (MRZ check digits). Layers we
 * have no signal for stay null (excluded from the `final` min — not faked as 1).
 */
function deriveLayers(f: TpsExtractedField, source: SourceKind): Omit<FieldConfidence, 'final'> {
  const ocr = typeof f.confidence === 'number' ? f.confidence : null
  let source_match: number | null = null
  if (source === 'mrz') {
    const checkFailed = f.failures.some((p) => /mrz|check/i.test(p))
    const checkPassed = f.passes.some((p) => /mrz|check/i.test(p))
    source_match = checkFailed ? 0.3 : checkPassed ? 0.99 : null
  }
  return { ocr, field_match: null, normalization: null, source_match }
}

function mergeReasons(f: TpsExtractedField, decided: { reasons: string[] }): string[] {
  return Array.from(
    new Set([
      ...(f.review_required ? ['source_module_review_required'] : []),
      ...f.failures.map((x) => `validator_failed:${x}`),
      ...decided.reasons,
    ]),
  )
}

/** Map one TPS field to a CanonicalField (single candidate of evidence). */
export function toCanonicalField(f: TpsExtractedField): CanonicalField {
  const source = mapSource(f)
  const confidence = buildConfidence(deriveLayers(f, source))
  const evidence: FieldEvidence[] = [
    {
      value: f.normalized_value ?? f.raw_value,
      source,
      confidence: typeof f.confidence === 'number' ? f.confidence : null,
      provider: `${f.extraction_source}:${f.source_zone}`,
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
    // INVARIANT 1: never lower the module's own review flag.
    reviewRequired: f.review_required || decided.reviewRequired,
    reviewReasons: mergeReasons(f, decided),
    evidence,
  }
}

/**
 * Merge canonical fields that share a key (e.g. family_name read from BOTH the
 * passport MRZ and the EAD card). All candidates are retained as evidence; the
 * highest-authority candidate is provisional; a material disagreement on a
 * critical/high field forces review. (INVARIANT 2: no candidate is dropped.)
 */
export function mergeCanonicalByKey(fields: CanonicalField[]): CanonicalField[] {
  const byKey = new Map<string, CanonicalField[]>()
  for (const f of fields) {
    const arr = byKey.get(f.key)
    if (arr) arr.push(f)
    else byKey.set(f.key, [f])
  }
  const out: CanonicalField[] = []
  for (const [key, group] of byKey) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const allEvidence = group.flatMap((g) => g.evidence)
    const crit = criticalityOf(key)
    const { forcesReview, provisional } = resolveDisagreement(allEvidence, crit)
    // Primary = the group member that owns the provisional (highest-authority) candidate.
    const primary = group.find((g) => g.evidence.some((e) => e === provisional)) ?? group[0]
    const reasons = Array.from(
      new Set([...group.flatMap((g) => g.reviewReasons), ...(forcesReview ? ['provider_disagreement'] : [])]),
    )
    out.push({
      ...primary,
      evidence: allEvidence,
      reviewRequired: forcesReview || group.some((g) => g.reviewRequired),
      reviewReasons: reasons,
    })
  }
  return out
}

export interface ReadCanonicalInput {
  documentSessionId: string
  product: CanonicalProduct
  docType: string
  fields: TpsExtractedField[]
  /** ISO-8601 UTC — caller stamps it (Date is unavailable in some contexts). */
  createdAt: string
}

/**
 * Build the single CanonicalDocumentResult from TPS extraction output. Pure: no
 * I/O, no hashing here (hash chain is populated in a later phase). Deterministic
 * for a given input.
 */
export function readCanonicalDocumentFromTps(input: ReadCanonicalInput): CanonicalDocumentResult {
  const mapped = input.fields.map(toCanonicalField)
  const merged = mergeCanonicalByKey(mapped)
  return {
    documentSessionId: input.documentSessionId,
    product: input.product,
    docType: input.docType,
    fields: merged,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: input.createdAt,
    requiresReview: merged.some((f) => f.reviewRequired),
  }
}
