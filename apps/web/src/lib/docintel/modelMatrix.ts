/**
 * modelMatrix — the SINGLE CODE source of truth for which model does what.
 *
 * ADR-018 ("Iron Model Matrix") used to live only in markdown, so an agent (or a
 * script) could act against it — e.g. measure acceptance on a fallback model. This
 * module encodes the matrix in TYPED code + provides hard assertions so that the
 * wrong thing FAILS CLOSED instead of relying on anyone reading the ADR.
 *
 * THE LAW (ADR-018):
 *   - PRIMARY_READER is the ONLY model whose read is a valid product/acceptance result.
 *   - FALLBACK models exist for AVAILABILITY only; a fallback read of a non-Latin doc
 *     is force-reviewed and is NEVER a quality/acceptance number.
 *   - Some fallback models are DISQUALIFIED for whole doc classes (read a different
 *     person on a handwritten certificate — 2026-06-02 / 2026-06-09 adjudication).
 *   - DEPRECATED models must never appear in any chain.
 *
 * Nobody promotes a flash model to primary. Nobody reports a fallback read as
 * acceptance. These are invariants, enforced here + by tests + by a CI guard.
 */

/** The ONE document reader (D1). The only model a quality/acceptance number may use. */
export const PRIMARY_READER = 'gemini-3.1-pro-preview' as const

/** Availability fallbacks, in order. NEVER primary. A non-Latin read here is force-reviewed. */
export const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'] as const

/** Models disqualified for specific doc-class families (returned a DIFFERENT person). */
export const DISQUALIFIED: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'gemini-2.5-flash': ['certificate', 'birth', 'marriage', 'divorce', 'death', 'name_change'],
})

/** Models that must never appear anywhere (deprecated / 404 on generation). */
export const DEPRECATED_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-3-pro-preview'] as const

/** The full sanctioned provider chain (primary first). Anything else is a violation. */
export const SANCTIONED_CHAIN = [PRIMARY_READER, ...FALLBACK_MODELS] as const

/** Is `model` the primary reader? (Acceptance/quality numbers require true.) */
export function isPrimaryReader(model: string | null | undefined): boolean {
  return model === PRIMARY_READER
}

/** Is `model` allowed to read AT ALL in the sanctioned chain? */
export function isSanctionedModel(model: string | null | undefined): boolean {
  return !!model && (SANCTIONED_CHAIN as readonly string[]).includes(model)
}

/**
 * Acceptance gate: a read is a VALID quality/acceptance result ONLY if it came from
 * the primary reader. A fallback (or any other) model is availability, never quality.
 * Returns a typed reason so a runner can record it instead of silently scoring.
 */
export type AcceptanceModelVerdict =
  | { valid: true }
  | { valid: false; reason: 'fallback_model_not_acceptance_valid' | 'unsanctioned_model' | 'no_model' }

export function acceptanceModelVerdict(model: string | null | undefined): AcceptanceModelVerdict {
  if (!model) return { valid: false, reason: 'no_model' }
  if (model === PRIMARY_READER) return { valid: true }
  if ((FALLBACK_MODELS as readonly string[]).includes(model)) return { valid: false, reason: 'fallback_model_not_acceptance_valid' }
  return { valid: false, reason: 'unsanctioned_model' }
}

/** HARD assert: throw if a model is being used as primary that isn't the primary reader. */
export function assertPrimaryReader(model: string | null | undefined): asserts model is typeof PRIMARY_READER {
  if (model !== PRIMARY_READER) {
    throw new Error(`model_matrix_violation: primary reader must be ${PRIMARY_READER}, got ${model ?? 'null'} (ADR-018)`)
  }
}

/** Is `model` disqualified for a given doc type id? (substring match on the family). */
export function isDisqualifiedFor(model: string | null | undefined, docTypeId: string | null | undefined): boolean {
  if (!model || !docTypeId) return false
  const families = DISQUALIFIED[model]
  if (!families) return false
  const t = docTypeId.toLowerCase()
  return families.some((fam) => t.includes(fam))
}
