/**
 * docintel/antiFabricationGate — minimal hard-case identity safety gate.
 * Behind ANTI_FABRICATION_GATE_ENABLED (default OFF). Design:
 * docs/reports/ANTI_FABRICATION_GATE_DESIGN.md.
 *
 * Why: a multimodal model on a degraded/handwritten/Soviet document can fabricate
 * a plausible-but-WRONG identity and self-report review_required=false (CONFIRMED:
 * gemini-2.5-flash produced 2 distinct identities across 3 runs on birth_cert_soviet,
 * all identity fields review_required=false). On hard-case document classes the
 * model's own review flag is not trustworthy for identity fields.
 *
 * What this does (and ONLY this):
 *   - For confirmed HANDWRITTEN-FABRICATION-RISK classes (narrow allowlist below),
 *     force review_required=true on identity/document-critical fields + attach reasons.
 *   - NEVER changes a value, NEVER invents, NEVER normalizes, NEVER LOWERS a flag.
 *   - Everything else (passports/booklet, military, PRINTED marriage_apostille,
 *     unknown_document) is untouched → MRZ-controlled passport fields not blanket-forced,
 *     stable printed docs not punished.
 *
 * Runs as a document-level post-pass in readDocument — the single door all four
 * products call — so coverage is uniform (TPS / Translation / Re-Parole / EAD).
 * Two-read self-consistency is NOT implemented here (separate, costed step).
 */

import { docintelIdToDocumentClass } from '@/lib/canonical/core/documentClassPolicy'
import type { ExtractedDocField } from './types'

/**
 * Classes that carry handwritten identity zones and have CONFIRMED model-fabrication
 * risk (different person across runs, model review_required=false). This is a NARROW
 * allowlist, NOT all hard-case classes:
 *   - marriage_apostille is PRINTED (its hard-case reason is image-size, not handwriting)
 *     and an old-but-printed marriage read stably in testing → excluded.
 *   - unknown_document is unknown, not specifically handwritten → excluded.
 * The trigger is class-name based because the only runtime handwriting signal in the
 * registry (DocFieldSpec.handwritten) is set for the booklet ONLY — birth/marriage cert
 * fields are all handwritten:false — so it cannot distinguish these classes today.
 */
export const HANDWRITTEN_FABRICATION_RISK_CLASSES: ReadonlySet<string> = new Set([
  'birth_certificate_handwritten',
  'birth_certificate_soviet_bilingual',
])

/** Reasons attached when the gate forces review on a handwritten-risk identity field. */
export const ANTI_FABRICATION_REASONS = [
  'handwritten_document',
  'model_instability_risk',
  'no_strong_identity_anchor',
] as const

/**
 * Substrings that mark a field as identity/document-critical. Matched against the
 * lowercased field id, so role-grounded variants (child_family_name,
 * spouse_1_full_name, child_dob, ...) are covered without enumerating each.
 */
const IDENTITY_SUBSTRINGS = [
  'family_name',
  'given_name',
  'patronymic',
  'middle_name',
  'full_name', // parent/spouse full names on certificates — identity-relevant
  'date_of_birth',
  'dob',
  'place_of_birth',
  'place_city',
  'issuing_authority',
] as const

export function isIdentityCriticalField(fieldId: string): boolean {
  const f = (fieldId ?? '').toLowerCase()
  return IDENTITY_SUBSTRINGS.some((s) => f.includes(s))
}

/**
 * Apply the gate over the full field set for a given docTypeId. Pure: returns a
 * NEW array; non-hard-case docs and non-identity fields pass through unchanged.
 */
export function applyAntiFabricationGate(
  fields: ExtractedDocField[],
  docTypeId: string,
): ExtractedDocField[] {
  const docClass = docintelIdToDocumentClass(docTypeId)
  // NARROW trigger: only confirmed handwritten-fabrication-risk classes. Passports
  // (internal_passport_booklet), military, printed marriage_apostille and
  // unknown_document are NOT blanket-forced here.
  if (!HANDWRITTEN_FABRICATION_RISK_CLASSES.has(docClass)) return fields

  return fields.map((f) => {
    if (!isIdentityCriticalField(f.field)) return f // non-identity → unchanged
    const reasons = Array.from(new Set([...(f.review_reasons ?? []), ...ANTI_FABRICATION_REASONS]))
    return {
      ...f,
      // never lower; force true. Value is NOT touched.
      review_required: true,
      review_reasons: reasons,
    }
  })
}
