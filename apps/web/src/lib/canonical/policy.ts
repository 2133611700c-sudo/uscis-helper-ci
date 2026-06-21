/**
 * canonical/policy.ts — the decision logic of the canonical contract.
 *
 * Pure functions only (no I/O). Each rule maps to an acceptance bullet in
 * FIELD_CONFIDENCE_AND_CRITICALITY_POLICY.md §F. These are the rules every
 * product will share once they read CanonicalDocumentResult — the single brain.
 */
import type {
  Criticality,
  FieldConfidence,
  SourceKind,
  CanonicalField,
  FieldEvidence,
} from './types'

/** The six legally critical fields — NEVER auto-final without explicit review. */
export const CRITICAL_FIELDS: ReadonlySet<string> = new Set([
  'family_name',
  'given_name',
  'patronymic',
  'date_of_birth',
  'dob',                  // alias: Gemini docintel emits this key
  'passport_number',
  'a_number',
  'uscis_number',
  // birth certificate child identity (same criticality as adult fields)
  'child_family_name',
  'child_given_name',
  'child_patronymic',
  'child_dob',
  'child_date_of_birth',
])

/** Criticality matrix (policy §B). Unlisted keys default to 'low'. */
const CRITICALITY: Record<string, Criticality> = {
  family_name: 'critical',
  given_name: 'critical',
  patronymic: 'critical',
  date_of_birth: 'critical',
  dob: 'critical',               // alias: Gemini docintel emits this key
  passport_number: 'critical',
  a_number: 'critical',
  uscis_number: 'critical',
  // birth certificate child identity fields
  child_family_name: 'critical',
  child_given_name: 'critical',
  child_patronymic: 'critical',
  child_dob: 'critical',
  child_date_of_birth: 'critical',
  issuing_authority: 'high',
  place_of_birth: 'high',
  date_of_issue: 'high',
  date_of_expiry: 'high',
  document_series: 'high',
  sex: 'medium',
  document_color: 'low',
}

export function criticalityOf(fieldKey: string): Criticality {
  return CRITICALITY[fieldKey] ?? 'low'
}

/** Review threshold for critical/high fields (policy §A). */
export const REVIEW_THRESHOLD = 0.85

/**
 * Derive `final` confidence: ≤ the minimum of the APPLICABLE layers. A layer set
 * to null does not apply and is excluded from the min (not treated as 1). If no
 * layer applies, final is 0 (we have no basis to trust the value).
 *
 * `final` is always derived here — never read from a provider.
 */
export function computeFinalConfidence(
  layers: Omit<FieldConfidence, 'final'>,
): number {
  const present = [
    layers.ocr,
    layers.field_match,
    layers.normalization,
    layers.source_match,
  ].filter((v): v is number => typeof v === 'number')
  if (present.length === 0) return 0
  return Math.min(...present)
}

/** Build a full FieldConfidence with the derived `final`. */
export function buildConfidence(layers: Omit<FieldConfidence, 'final'>): FieldConfidence {
  return { ...layers, final: computeFinalConfidence(layers) }
}

/**
 * No-silent-correction comparator (policy §E). Two values are "materially
 * different" if they differ by more than whitespace / case / surrounding
 * punctuation. An optional canonicalizer (e.g. KMU-55 name canonicalization)
 * lets callers treat transliteration-equivalent names as equal.
 */
export function materiallyDifferent(
  raw: string | null | undefined,
  normalized: string | null | undefined,
  canonicalize?: (s: string) => string,
): boolean {
  const a = raw ?? ''
  const b = normalized ?? ''
  if (a === '' || b === '') return false // nothing to compare / no replacement made
  const base = (s: string) =>
    s
      .normalize('NFC')
      .replace(/[\s.,;:'"`-]+/g, '') // strip whitespace + light punctuation
      .toLocaleLowerCase()
  let na = base(a)
  let nb = base(b)
  if (canonicalize) {
    na = base(canonicalize(a))
    nb = base(canonicalize(b))
  }
  return na !== nb
}

/** Source authority ranking (policy §D). Higher index = higher authority. */
const SOURCE_RANK: Record<SourceKind, number> = {
  manual_user_entry: 0,
  ai_vision: 1,
  document_ocr: 2,
  driver_license: 3,
  ead: 4,
  i94: 5,
  gov_ua: 6,
  passport_visual: 7,
  mrz: 8,
}

export function sourceRank(source: SourceKind): number {
  return SOURCE_RANK[source] ?? 0
}

/** Returns the higher-authority source of the two. */
export function higherAuthority(a: SourceKind, b: SourceKind): SourceKind {
  return sourceRank(a) >= sourceRank(b) ? a : b
}

/**
 * Provider-disagreement resolution (policy §C). Given the candidate evidence for
 * ONE field, decide whether the disagreement forces review and which candidate
 * (if any) provisionally wins. Never auto-wins a critical/high field on
 * disagreement — both candidates are retained as evidence.
 */
export function resolveDisagreement(
  candidates: FieldEvidence[],
  criticality: Criticality,
  canonicalize?: (s: string) => string,
): { forcesReview: boolean; provisional: FieldEvidence | null } {
  if (candidates.length <= 1) {
    return { forcesReview: false, provisional: candidates[0] ?? null }
  }
  const norm = (s: string) =>
    (canonicalize ? canonicalize(s) : s).normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase()
  const distinct = new Set(candidates.map((c) => norm(c.value)))
  const materiallyDisagree = distinct.size > 1
  // Highest authority, then highest provider confidence, wins provisionally.
  const provisional = [...candidates].sort((x, y) => {
    const r = sourceRank(y.source) - sourceRank(x.source)
    if (r !== 0) return r
    return (y.confidence ?? 0) - (x.confidence ?? 0)
  })[0]
  if (!materiallyDisagree) return { forcesReview: false, provisional }
  const forcesReview = criticality === 'critical' || criticality === 'high'
  return { forcesReview, provisional }
}

/**
 * The central review decision for a field. Combines: critical-field invariant,
 * confidence threshold, no-silent-correction, and provider disagreement. Returns
 * the reasons (machine-readable) so the UI + audit can explain the flag.
 *
 * Note: critical fields ALWAYS require review here — there is no auto-final
 * shortcut for the six critical fields (policy §B invariant). Human confirmation
 * happens downstream (the review gate), not in this function.
 */
export function decideReviewRequired(
  field: Pick<CanonicalField, 'key' | 'rawValue' | 'normalizedValue' | 'confidence' | 'evidence'>,
  opts: { canonicalize?: (s: string) => string } = {},
): { reviewRequired: boolean; reasons: string[] } {
  const reasons: string[] = []
  const crit = criticalityOf(field.key)

  if (crit === 'critical') reasons.push('critical_field_requires_review')

  if ((crit === 'critical' || crit === 'high') && field.confidence.final < REVIEW_THRESHOLD) {
    reasons.push('low_final_confidence')
  }

  if (materiallyDifferent(field.rawValue, field.normalizedValue, opts.canonicalize)) {
    reasons.push('material_normalization_change')
  }

  const disagreement = resolveDisagreement(field.evidence ?? [], crit, opts.canonicalize)
  if (disagreement.forcesReview) reasons.push('provider_disagreement')

  return { reviewRequired: reasons.length > 0, reasons }
}
