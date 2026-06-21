/**
 * canonical/core/eadAdapter.ts — B4 bridge: CanonicalDocumentResult → EAD types.
 *
 * Converts Core arbitration output into EadCoreAnswers so the EAD wizard
 * can consume document-extracted fields from the single canonical brain.
 *
 * Architecture contract:
 *  - NO OCR call inside this adapter
 *  - NO Gemini call inside this adapter
 *  - NO independent parser inside this adapter
 *  - Pure field mapping only: canonical fields → EAD answer fields
 *  - Source-gated fields: EAD/USCIS fields only from EAD/I-797 sources
 *  - I-94 fields only from I-94 sources
 *  - Address only from DL/manual sources (NOT from passport)
 *  - Preserves review_required from canonical (never lowers it)
 *  - Missing fields stay null (no invention, no silent correction)
 *  - uncertain_fields list tracks every missing or review-flagged field
 *  - invented_fields_count MUST always be 0
 *
 * Used behind ONE_CORE_EAD_ENABLED flag only. Never affects old path.
 * See docs/architecture/ONE_BRAIN_DECISION.md for the architecture contract.
 *
 * ONE_BRAIN_COMPLETE_CODE_READY: TPS (B1) + Translation (B2) + Re-Parole (B3) + EAD (B4).
 */
import type { CanonicalDocumentResult, CanonicalField } from '../types'

/**
 * EAD answers extracted from the canonical document result.
 *
 * Source-gating rules (hard constraints, never violated):
 *  - identity fields: from ANY identity document
 *  - passport_number / passport_expiry: always mapped (null if absent)
 *  - a_number / uscis_number / ead_category / card_number / ead_validity_*:
 *      ONLY when source is ead_card | i766 | i797 | uscis_notice
 *  - i94_admission_number / i94_date_of_entry / i94_class_of_admission / i94_place_of_entry:
 *      ONLY when source is i94 | i-94 | arrival_departure_record
 *  - us_address: ONLY when source is drivers_license | dl | state_id | manual
 *
 * This is the Core adapter output — feeds EAD wizard for pre-fill, not
 * the packet builder directly (user reviews & corrects).
 */
export interface EadCoreAnswers {
  // ── Identity — from any identity document source ───────────────────────────
  family_name?: string | null
  given_name?: string | null
  middle_name?: string | null
  date_of_birth?: string | null   // YYYY-MM-DD (canonical date format)
  sex?: string | null              // 'M' | 'F' | null
  country_of_birth?: string | null
  country_of_nationality?: string | null

  // ── Passport fields ────────────────────────────────────────────────────────
  passport_number?: string | null
  passport_expiry?: string | null

  // ── EAD/USCIS fields — ONLY if source doc is EAD card (I-766) or I-797 ───
  a_number?: string | null
  uscis_number?: string | null
  ead_category?: string | null
  card_number?: string | null
  ead_validity_from?: string | null
  ead_validity_to?: string | null

  // ── I-94 fields — ONLY if source doc is I-94 ──────────────────────────────
  i94_admission_number?: string | null
  i94_date_of_entry?: string | null
  i94_class_of_admission?: string | null
  i94_place_of_entry?: string | null

  // ── Address — ONLY if source is DL, state_id, or manual ──────────────────
  // Do NOT infer address from passport — addresses in passports are unreliable
  us_address?: string | null

  // ── Quality / provenance metadata ─────────────────────────────────────────
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
  /**
   * Count of fields invented without source evidence.
   * MUST always be 0 — this adapter NEVER invents fields.
   * If this is non-zero, there is a bug in the adapter.
   */
  invented_fields_count: 0
}

// ── Source-type guards ────────────────────────────────────────────────────────

/** True when the source document is an EAD card (I-766) or USCIS notice (I-797). */
function isEadSource(docType: string): boolean {
  const t = docType.toLowerCase()
  return (
    t === 'ead_card' || t === 'i766' || t === 'i-766' ||
    t === 'i797' || t === 'i-797' || t === 'uscis_notice' ||
    t === 'ead' || t === 'us_ead'
  )
}

/** True when the source document is a Form I-94. */
function isI94Source(docType: string): boolean {
  const t = docType.toLowerCase()
  return t === 'i94' || t === 'i-94' || t === 'us_i94' || t === 'arrival_departure_record'
}

/** True when the source document is a driver's license or state ID. */
function isDLSource(docType: string): boolean {
  const t = docType.toLowerCase()
  return t === 'drivers_license' || t === 'dl' || t === 'state_id' || t === 'driver_license'
}

// ── Field helpers (mirrors reParoleAdapter pattern) ───────────────────────────

function findField(fields: CanonicalField[], key: string): CanonicalField | null {
  return fields.find((f) => f.key === key) ?? null
}

function getValue(field: CanonicalField | null): string | null {
  if (!field) return null
  // Phase 3 (ADR-017 C3 contract): use finalValue when C3 has run.
  // finalValue=string → C3 accepted (release). finalValue=null → C3 rejected (block → return null).
  // finalValue=undefined → C3 not run (flag OFF); fall back to normalizedValue for backward compat.
  const v = field.finalValue !== undefined ? field.finalValue : (field.normalizedValue ?? field.rawValue)
  if (!v || v.trim() === '') return null
  return v
}

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
 * Map a source-gated field — returns null (without adding to uncertain) when
 * the source gate is not met. Only adds to uncertain when gate IS met but
 * the value is absent.
 */
function mapGatedField(
  fields: CanonicalField[],
  primaryKey: string,
  aliases: string[],
  uncertain: string[],
  gateOpen: boolean,
): string | null {
  if (!gateOpen) return null
  return mapFieldWithAliases(fields, primaryKey, aliases, uncertain)
}

/**
 * Convert a CanonicalDocumentResult to EadCoreAnswers.
 *
 * ADAPTER CONTRACT:
 *  - Pure function (no I/O, no side effects)
 *  - Maps canonical fields → EAD fields using canonical key names
 *  - EAD/USCIS fields: null unless source is EAD/I-797
 *  - I-94 fields: null unless source is I-94
 *  - Address: null unless source is DL/manual (NOT passport)
 *  - Does not invent any field (invented_fields_count always 0)
 *  - Preserves review_required from canonical (never lowers it)
 *  - core_status=ok when all critical EAD fields are present
 *  - core_status=partial when some fields are missing
 *  - core_status=failed when no fields are mapped at all
 */
export function toEadAnswers(canonical: CanonicalDocumentResult): EadCoreAnswers {
  const fields = canonical.fields
  const uncertain: string[] = []
  const docType = canonical.docType ?? ''

  const eadGate = isEadSource(docType)
  const i94Gate = isI94Source(docType)
  const dlGate = isDLSource(docType)

  // ── Identity fields (any identity document) ───────────────────────────────
  const family_name = mapFieldWithAliases(fields, 'family_name', ['family_name_latin'], uncertain)
  const given_name = mapFieldWithAliases(fields, 'given_name', ['given_name_latin'], uncertain)
  const middle_name = mapFieldWithAliases(fields, 'middle_name', ['patronymic', 'middle_name_cyrillic'], uncertain)
  const date_of_birth = mapFieldWithAliases(fields, 'date_of_birth', ['dob'], uncertain)
  const sex = mapField(fields, 'sex', uncertain)
  const country_of_birth = mapFieldWithAliases(
    fields, 'country_of_birth', ['place_of_birth', 'country_of_issuance'], uncertain,
  )
  const country_of_nationality = mapFieldWithAliases(
    fields, 'country_of_nationality', ['nationality', 'citizenship'], uncertain,
  )

  // ── Passport fields (available from any identity doc) ─────────────────────
  const passport_number = mapField(fields, 'passport_number', uncertain)
  const passport_expiry = mapFieldWithAliases(
    fields, 'date_of_expiry', ['passport_expiration_date', 'expiry_date'], uncertain,
  )

  // ── EAD/USCIS fields — only if source is EAD card or I-797 ───────────────
  const a_number = mapGatedField(fields, 'a_number', ['alien_registration_number'], uncertain, eadGate)
  const uscis_number = mapGatedField(fields, 'uscis_number', ['uscis_online_account', 'uscis_account_number'], uncertain, eadGate)
  const ead_category = mapGatedField(fields, 'ead_category', ['category', 'eligibility_category'], uncertain, eadGate)
  const card_number = mapGatedField(fields, 'card_number', ['ead_card_number', 'card_no'], uncertain, eadGate)
  const ead_validity_from = mapGatedField(fields, 'ead_validity_from', ['issue_date', 'valid_from', 'card_valid_from'], uncertain, eadGate)
  const ead_validity_to = mapGatedField(fields, 'ead_validity_to', ['expiry_date', 'valid_to', 'card_valid_to', 'date_of_expiry'], uncertain, eadGate)

  // ── I-94 fields — only if source is I-94 ─────────────────────────────────
  const i94_admission_number = mapGatedField(fields, 'i94_admission_number', ['admission_number'], uncertain, i94Gate)
  const i94_date_of_entry = mapGatedField(fields, 'i94_date_of_entry', ['date_of_last_entry', 'last_entry_date', 'last_entry'], uncertain, i94Gate)
  const i94_class_of_admission = mapGatedField(fields, 'i94_class_of_admission', ['class_of_admission', 'status_at_last_entry'], uncertain, i94Gate)
  const i94_place_of_entry = mapGatedField(fields, 'i94_place_of_entry', ['place_of_last_entry', 'place_of_entry'], uncertain, i94Gate)

  // ── Address — only if source is DL or manual ──────────────────────────────
  // Passports do NOT carry reliable US address — never infer address from passport
  const us_address = mapGatedField(fields, 'us_address', ['address', 'mailing_address'], uncertain, dlGate)

  // ── Determine core_status ─────────────────────────────────────────────────
  // Critical EAD fields for I-765: family_name, given_name, date_of_birth
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
    passport_expiry,
    // EAD-gated (null when source is not EAD/I-797)
    a_number,
    uscis_number,
    ead_category,
    card_number,
    ead_validity_from,
    ead_validity_to,
    // I-94-gated (null when source is not I-94)
    i94_admission_number,
    i94_date_of_entry,
    i94_class_of_admission,
    i94_place_of_entry,
    // DL-gated (null when source is not DL/manual)
    us_address,
    review_required,
    uncertain_fields: [...new Set(uncertain)], // deduplicate
    core_status,
    fallback_used: false,
    source_doc_types: [canonical.docType].filter(Boolean),
    invented_fields_count: 0, // MUST always be 0 — adapter never invents
  }
}
