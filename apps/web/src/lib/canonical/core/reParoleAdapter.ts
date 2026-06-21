/**
 * canonical/core/reParoleAdapter.ts — B3 bridge: CanonicalDocumentResult → ReParole types.
 *
 * Converts Core arbitration output into ReParoleCoreAnswers so the Re-Parole
 * wizard can consume document-extracted fields from the single canonical brain.
 *
 * Architecture contract:
 *  - NO OCR call inside this adapter
 *  - NO Gemini call inside this adapter
 *  - NO independent parser inside this adapter
 *  - Pure field mapping only: canonical fields → Re-Parole answer fields
 *  - Preserves review_required from canonical (never lowers it)
 *  - Missing fields stay null (no invention, no silent correction)
 *  - uncertain_fields list tracks every missing or review-flagged field
 *
 * Used behind ONE_CORE_REPAROLE_ENABLED flag only. Never affects old path.
 * See docs/architecture/ONE_BRAIN_DECISION.md for the architecture contract.
 *
 * ONE_BRAIN_PARTIAL_3_PRODUCTS: TPS (B1) + Translation (B2) + Re-Parole (B3).
 */
import type { CanonicalDocumentResult, CanonicalField } from '../types'
import { getCanonicalValue } from './fieldAccessor'

/**
 * Re-Parole answers extracted from the canonical document result.
 * Field naming mirrors ReParoleAnswers (lib/reparole/answers.ts) where
 * fields overlap; Re-Parole I-131 specific fields use the same names.
 *
 * This is the Core adapter output — it feeds the Re-Parole wizard for
 * pre-fill, not the packet builder directly (user still reviews & corrects).
 */
export interface ReParoleCoreAnswers {
  // ── Identity (Part 2 Item 1) ─────────────────────────────────────────────
  family_name?: string | null
  given_name?: string | null
  middle_name?: string | null
  date_of_birth?: string | null   // YYYY-MM-DD (canonical date format)
  sex?: string | null              // 'M' | 'F' | null
  country_of_birth?: string | null
  country_of_nationality?: string | null

  // ── Travel document (Part 2 Items 12-13, and identity source) ───────────
  passport_number?: string | null
  passport_expiration_date?: string | null

  // ── Admission / I-94 (Part 2 Items 12-13) ───────────────────────────────
  i94_admission_number?: string | null
  last_entry_date?: string | null          // date of last entry
  i94_class_of_admission?: string | null   // typically 'UH' for U4U

  // ── USCIS identifiers (Part 2 Item 5) ───────────────────────────────────
  a_number?: string | null

  // ── Quality / provenance metadata ───────────────────────────────────────
  /** True if any mapped field needs human review. */
  review_required: boolean
  /** Keys of fields that were null or flagged for review. */
  uncertain_fields: string[]
  /** 'ok' = all critical fields present; 'partial' = some missing; 'failed' = no fields. */
  core_status: 'ok' | 'partial' | 'failed'
  /** True when the old path was used instead of Core (always false from this adapter). */
  fallback_used: boolean
  /** The docType(s) that produced the canonical result. */
  source_doc_types: string[]
}

/**
 * Helper: look up a field by key in the canonical fields array.
 * Returns the CanonicalField or null when the key is absent.
 */
function findField(fields: CanonicalField[], key: string): CanonicalField | null {
  return fields.find((f) => f.key === key) ?? null
}

/**
 * Helper: extract the C3-honoring release value for a field.
 *
 * BUGFIX (Phase 1, finalValue blind spot): previously this read
 * `normalizedValue ?? rawValue`, IGNORING finalValue. A field that C3
 * (applyOcrFieldSafety) had explicitly rejected (finalValue === null) would
 * still be released into the I-131 PDF via the Re-Parole wizard — a C3 contract
 * violation. Re-Parole was the ONLY one of the four adapters with this blind
 * spot (tps/ead/translation already honored finalValue).
 *
 * Now delegates to the single sanctioned accessor `getCanonicalValue`, which:
 *   - finalValue === null      → returns null (C3 rejected; no resurrection)
 *   - finalValue is a string   → returns it (trimmed; C3 accepted)
 *   - finalValue === undefined → falls back to normalizedValue ?? rawValue
 * For non-rejected fields the output is IDENTICAL to the old behavior (parity).
 *
 * Returns null when the field is absent or has no usable value.
 */
function getValue(field: CanonicalField | null): string | null {
  if (!field) return null
  return getCanonicalValue(field)
}

/**
 * Map one field from canonical to the Re-Parole answer shape.
 * Appends the fieldName to uncertain when the value is null OR the field
 * itself carries reviewRequired=true.
 *
 * Adapter rule: NEVER lower the canonical review flag.
 */
function mapField(
  fields: CanonicalField[],
  key: string,
  uncertain: string[],
): string | null {
  const f = findField(fields, key)
  const v = getValue(f)
  if (v === null) {
    uncertain.push(key)
    return null
  }
  if (f?.reviewRequired) {
    uncertain.push(key)
  }
  return v
}

/**
 * Map a field with multiple fallback key aliases (first match wins).
 * All aliases are tried; if none produce a value, the primary key is
 * recorded in uncertain.
 */
function mapFieldWithAliases(
  fields: CanonicalField[],
  primaryKey: string,
  aliases: string[],
  uncertain: string[],
): string | null {
  // Try primary key first
  const primary = findField(fields, primaryKey)
  const primaryVal = getValue(primary)
  if (primaryVal !== null) {
    if (primary?.reviewRequired) uncertain.push(primaryKey)
    return primaryVal
  }
  // Try aliases
  for (const alias of aliases) {
    const aliased = findField(fields, alias)
    const aliasedVal = getValue(aliased)
    if (aliasedVal !== null) {
      if (aliased?.reviewRequired) uncertain.push(primaryKey)
      return aliasedVal
    }
  }
  // Nothing found
  uncertain.push(primaryKey)
  return null
}

/**
 * Convert a CanonicalDocumentResult to ReParoleCoreAnswers.
 *
 * ADAPTER CONTRACT:
 *  - Pure function (no I/O, no side effects)
 *  - Maps canonical fields → Re-Parole fields using canonical key names
 *  - Does not invent I-94 fields when absent (they stay null)
 *  - Does not correct values silently (preserves raw/normalized from canonical)
 *  - Preserves review_required from canonical (never lowers it)
 *  - core_status=ok when all critical Re-Parole fields are present
 *  - core_status=partial when some fields are missing
 *  - core_status=failed when no fields are mapped at all
 */
export function toReParoleCoreAnswers(canonical: CanonicalDocumentResult): ReParoleCoreAnswers {
  const fields = canonical.fields
  const uncertain: string[] = []

  // ── Identity fields ───────────────────────────────────────────────────────
  // family_name / given_name: canonical uses these keys directly
  const family_name = mapField(fields, 'family_name', uncertain)
  const given_name = mapField(fields, 'given_name', uncertain)
  // middle_name / patronymic: Re-Parole I-131 middle name
  const middle_name = mapFieldWithAliases(fields, 'middle_name', ['patronymic', 'middle_name_cyrillic'], uncertain)

  // date_of_birth: Gemini docintel emits 'dob' as an alias
  const date_of_birth = mapFieldWithAliases(fields, 'date_of_birth', ['dob'], uncertain)

  // sex: canonical key is 'sex'
  const sex = mapField(fields, 'sex', uncertain)

  // country_of_birth: canonical uses 'country_of_birth'; some readers use 'place_of_birth'
  const country_of_birth = mapFieldWithAliases(
    fields, 'country_of_birth', ['place_of_birth', 'country_of_issuance'], uncertain,
  )

  // country_of_nationality: canonical uses 'country_of_nationality'; alias 'nationality'
  const country_of_nationality = mapFieldWithAliases(
    fields, 'country_of_nationality', ['nationality', 'citizenship'], uncertain,
  )

  // ── Travel document ───────────────────────────────────────────────────────
  const passport_number = mapField(fields, 'passport_number', uncertain)

  // passport expiry: canonical uses 'date_of_expiry'; TPS uses 'passport_expiration_date'
  const passport_expiration_date = mapFieldWithAliases(
    fields, 'date_of_expiry', ['passport_expiration_date', 'expiry_date'], uncertain,
  )

  // ── I-94 / admission ─────────────────────────────────────────────────────
  // These fields only come from I-94 source documents. When the document
  // processed is a passport (not an I-94), they stay null. The adapter
  // MUST NOT invent them.
  const i94_admission_number = mapFieldWithAliases(
    fields, 'i94_admission_number', ['admission_number'], uncertain,
  )
  const last_entry_date = mapFieldWithAliases(
    fields, 'last_entry_date', ['date_of_last_entry', 'last_entry'], uncertain,
  )
  const i94_class_of_admission = mapFieldWithAliases(
    fields, 'i94_class_of_admission', ['class_of_admission', 'status_at_last_entry'], uncertain,
  )

  // ── USCIS identifiers ─────────────────────────────────────────────────────
  const a_number = mapField(fields, 'a_number', uncertain)

  // ── Determine core_status ─────────────────────────────────────────────────
  // Critical Re-Parole fields for I-131: family_name, given_name, date_of_birth
  const criticalFields = [family_name, given_name, date_of_birth]
  const mappedCount = [
    family_name, given_name, date_of_birth, sex,
    country_of_birth, passport_number,
  ].filter((v) => v !== null).length

  let core_status: 'ok' | 'partial' | 'failed'
  if (mappedCount === 0) {
    core_status = 'failed'
  } else if (criticalFields.every((v) => v !== null)) {
    core_status = 'ok'
  } else {
    core_status = 'partial'
  }

  // ── Combine review_required from canonical + uncertain fields ─────────────
  const review_required = canonical.requiresReview || uncertain.length > 0

  return {
    family_name,
    given_name,
    middle_name,
    date_of_birth,
    sex,
    country_of_birth,
    country_of_nationality,
    passport_number,
    passport_expiration_date,
    i94_admission_number,
    last_entry_date,
    i94_class_of_admission,
    a_number,
    review_required,
    uncertain_fields: [...new Set(uncertain)], // deduplicate
    core_status,
    fallback_used: false,
    source_doc_types: [canonical.docType].filter(Boolean),
  }
}
