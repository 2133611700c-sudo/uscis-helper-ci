/**
 * readinessPolicy — THE single source of truth for "which TPS fields are
 * required, at which stage".
 *
 * Before this module, three gates each kept their own required-field literal:
 *   - centralBrain.REQUIRED_FOR_GENERATE  (document-merge readiness)
 *   - answers.isMinimallyComplete         (server can fill the PDF)
 *   - mailReadyGate.REQUIRED_FIELDS       (final pre-export blockers)
 * They drifted apart (e.g. status_at_last_entry was required for merge but only
 * recommended for mail; passport_country_of_issuance was required for generate
 * but not checked by mail at all). That divergence is exactly why the generate
 * button "appeared and disappeared" unpredictably. Every gate now derives its
 * list from this file. No gate keeps a local required-field literal.
 *
 * STAGES — intentionally different strictness (this is BY DESIGN, not drift):
 *   - 'merge'    : centralBrain. Identity + entry fields expected from uploaded
 *                  DOCUMENTS. Does NOT include user-typed contact/address fields,
 *                  because the Central Brain only merges document data.
 *   - 'generate' : isMinimallyComplete. Everything the server needs to fill the
 *                  PDF: identity + birthplace + passport + address + filing +
 *                  contact + marital + Part 7 (+ ead_category if wants_ead).
 *   - 'mail'     : mailReadyGate. Final user-facing blockers before export.
 *
 * KNOWN INCONSISTENCIES preserved here on purpose (Phase 0 = consolidate the
 * SOURCE without changing BEHAVIOR). Flagged for a future owner decision, NOT
 * resolved in this change:
 *   [KI-1] status_at_last_entry: required at 'merge' but only recommended at
 *          'mail' — a user can mail without it. Likely should be required at
 *          'mail' too. Owner decision pending.
 *   [KI-2] passport_country_of_issuance: required at 'generate' but absent from
 *          'mail' entirely (not even recommended). Owner decision pending.
 */

import type { TPSAnswers } from './answers'

export type ReadinessStage = 'merge' | 'generate' | 'mail'

export interface ReadinessRule {
  field: keyof TPSAnswers
  label: string
  /** Stages where this field is a HARD requirement (blocker). */
  requiredAt: ReadinessStage[]
  /** Stages where it is recommended only (warning, never a blocker). */
  recommendedAt?: ReadinessStage[]
  /** If present, the rule only applies when this returns true (e.g. ead_category only if wants_ead). */
  conditional?: (a: Partial<TPSAnswers>) => boolean
}

/**
 * The policy table. Field membership per stage reproduces — exactly — the three
 * gates' historical lists as of 2026-05-27. Order is not behaviourally
 * significant (consumers use sets / contains checks).
 */
export const READINESS_POLICY: readonly ReadinessRule[] = [
  // ── Identity (passport MRZ / booklet crossref / EAD) ──
  { field: 'family_name',                  label: 'Last Name',                    requiredAt: ['merge', 'generate', 'mail'] },
  { field: 'given_name',                   label: 'First Name',                   requiredAt: ['merge', 'generate', 'mail'] },
  { field: 'dob',                          label: 'Date of Birth',                requiredAt: ['merge', 'generate', 'mail'] },
  { field: 'sex',                          label: 'Sex',                          requiredAt: ['merge', 'generate', 'mail'] },
  { field: 'country_of_birth',             label: 'Country of Birth',             requiredAt: ['generate', 'mail'] },
  { field: 'country_of_nationality',       label: 'Country of Nationality',       requiredAt: ['merge', 'generate', 'mail'] },
  { field: 'passport_number',              label: 'Passport Number',              requiredAt: ['merge', 'generate', 'mail'] },
  { field: 'passport_country_of_issuance', label: 'Passport Country of Issuance', requiredAt: ['generate'] }, // [KI-2]
  { field: 'passport_expiration_date',     label: 'Passport Expiration Date',     requiredAt: ['merge', 'generate', 'mail'] },

  // ── US address (DL / typed) ──
  { field: 'us_address_street',            label: 'US Address (Street)',          requiredAt: ['generate', 'mail'] },
  { field: 'us_address_city',              label: 'US Address (City)',            requiredAt: ['generate', 'mail'] },
  { field: 'us_address_state',             label: 'US Address (State)',           requiredAt: ['generate', 'mail'] },
  { field: 'us_address_zip',               label: 'US Address (ZIP)',             requiredAt: ['generate', 'mail'] },

  // ── Entry (I-94) ──
  { field: 'last_entry_date',              label: 'Last Entry Date',              requiredAt: ['merge', 'generate', 'mail'] },
  { field: 'status_at_last_entry',         label: 'Status at Last Entry',         requiredAt: ['merge'], recommendedAt: ['mail'] }, // [KI-1]

  // ── Filing ──
  { field: 'filing_path',                  label: 'Filing Type',                  requiredAt: ['generate', 'mail'] },

  // ── Contact (typed) ──
  { field: 'daytime_phone',                label: 'Phone Number',                 requiredAt: ['generate', 'mail'] },
  { field: 'email',                        label: 'Email',                        requiredAt: ['generate', 'mail'] },

  // ── Civil status ──
  { field: 'marital_status',               label: 'Marital Status',               requiredAt: ['generate', 'mail'] },

  // ── EAD (conditional) ──
  { field: 'ead_category',                 label: 'EAD Category',                 requiredAt: ['generate'], conditional: (a) => a.wants_ead === true },

  // ── Part 7 background declaration (must be explicitly reviewed) ──
  { field: 'part7_reviewed',               label: 'Part 7 Background Review',     requiredAt: ['generate', 'mail'] },

  // ── Recommended only (warnings at mail stage) ──
  { field: 'middle_name',                  label: 'Patronymic / Middle Name',     requiredAt: [], recommendedAt: ['mail'] },
  { field: 'a_number',                     label: 'A-Number',                     requiredAt: [], recommendedAt: ['mail'] },
  { field: 'i94_admission_number',         label: 'I-94 Number',                  requiredAt: [], recommendedAt: ['mail'] },
  { field: 'city_of_birth',                label: 'City of Birth',                requiredAt: [], recommendedAt: ['mail'] },
  { field: 'province_of_birth',            label: 'Province of Birth',            requiredAt: [], recommendedAt: ['mail'] },
  { field: 'ssn',                          label: 'SSN',                          requiredAt: [], recommendedAt: ['mail'] },
]

/** Rules that are a hard requirement at `stage` (applying conditionals if answers given). */
export function requiredRules(stage: ReadinessStage, answers?: Partial<TPSAnswers>): ReadinessRule[] {
  return READINESS_POLICY.filter(
    (r) =>
      r.requiredAt.includes(stage) &&
      (!r.conditional || (answers ? r.conditional(answers) : true)),
  )
}

/** Required field keys (string) at `stage`. Used by centralBrain. */
export function requiredFieldKeys(stage: ReadinessStage, answers?: Partial<TPSAnswers>): string[] {
  return requiredRules(stage, answers).map((r) => r.field as string)
}

/** Required field keys + human labels at `stage`. Used by mailReadyGate. */
export function requiredFieldsWithLabels(
  stage: ReadinessStage,
  answers?: Partial<TPSAnswers>,
): Array<{ key: keyof TPSAnswers; label: string }> {
  return requiredRules(stage, answers).map((r) => ({ key: r.field, label: r.label }))
}

/** Recommended (warning-only) field keys + labels at `stage`. */
export function recommendedFieldsWithLabels(
  stage: ReadinessStage,
): Array<{ key: keyof TPSAnswers; label: string }> {
  return READINESS_POLICY.filter((r) => r.recommendedAt?.includes(stage)).map((r) => ({
    key: r.field,
    label: r.label,
  }))
}
