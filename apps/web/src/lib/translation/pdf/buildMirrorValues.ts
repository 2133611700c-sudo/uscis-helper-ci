/**
 * buildMirrorValues — the missing bridge between EXTRACTION and the official
 * MIRROR schema. readDocument emits fields keyed by docintel-registry names
 * (child_family_name, dob, place_of_birth_city, ...); the official schema uses
 * its own normative keys (child_surname, date_of_birth, place_of_birth, ...).
 * This maps the former to the latter so renderOfficialTranslation can draw a
 * faithful English mirror from REAL data (previously it was fed only by mockOCR).
 *
 * Phase 3 contract: release value is finalValue-first (final_value when C3 ran,
 * else normalized_value). Review/uncertain fields carry review=true so the
 * renderer marks them [CONFIRM]; missing fields stay blank → [enter from document].
 * No value is ever invented.
 */
import type { OfficialFormSchema } from '../forms/ukraine/schemas/types'

export interface FieldValue { value: string; review: boolean; canRead: boolean }

/** A field as it arrives from extraction / the generate-pdf payload. */
export interface ExtractedFieldLite {
  field: string
  value?: string | null
  normalized_value?: string | null
  final_value?: string | null
  review_required?: boolean | null
}

/**
 * Per-docType alias map: EXTRACTION field name → SCHEMA key.
 * Only renames are listed; keys that already match are resolved directly.
 * Schema keys with no extraction source (e.g. series_number, oblast_of_birth)
 * are left blank and the renderer prompts the user to enter them.
 */
const ALIASES: Record<string, Record<string, string>> = {
  ua_birth_certificate: {
    child_family_name: 'child_surname',
    dob: 'date_of_birth',
    // TWO contracts feed birth: the live TRANSLATION path keys by documentRegistry
    // (`place_of_birth_city`); the TPS path keys by documentContracts (`city_of_birth`).
    // Alias BOTH → place_of_birth so the mirror fills regardless of which fed it.
    place_of_birth_city: 'place_of_birth',
    city_of_birth: 'place_of_birth',
    // (no oblast alias — the birth oblast field was removed; it fabricated)
    // TPS contract emits `certificate_series_number`; registry path emits no series.
    certificate_series_number: 'series_number',
    issuing_authority: 'place_of_registration',
  },
  ua_marriage_certificate: {
    // spouse_1 = husband (groom), spouse_2 = wife (bride). Registry emits split
    // name parts; schema uses groom_/bride_ keys. date_of_marriage / act_record_*
    // / date_of_issue match directly.
    spouse_1_surname: 'groom_surname',
    spouse_1_given_name: 'groom_given_name',
    spouse_1_patronymic: 'groom_patronymic',
    spouse_1_dob: 'groom_dob',
    spouse_1_place_of_birth: 'groom_place_of_birth',
    spouse_1_surname_after: 'groom_surname_after',
    spouse_2_surname: 'bride_surname',
    spouse_2_given_name: 'bride_given_name',
    spouse_2_patronymic: 'bride_patronymic',
    spouse_2_dob: 'bride_dob',
    spouse_2_place_of_birth: 'bride_place_of_birth',
    spouse_2_surname_after: 'bride_surname_after',
    // the registration office reads into the official "Place of state registration".
    issuing_authority: 'place_of_registration',
    certificate_series_number: 'series_number',
  },
  ua_divorce_certificate: {
    // spouse_1 = former husband (groom), spouse_2 = former wife (bride).
    spouse_1_surname: 'groom_surname',
    spouse_1_given_name: 'groom_given_name',
    spouse_1_patronymic: 'groom_patronymic',
    spouse_1_surname_after: 'groom_surname_after',
    spouse_2_surname: 'bride_surname',
    spouse_2_given_name: 'bride_given_name',
    spouse_2_patronymic: 'bride_patronymic',
    spouse_2_surname_after: 'bride_surname_after',
    date_of_divorce: 'date_of_dissolution',
    issuing_authority: 'place_of_registration',
    certificate_series_number: 'series_number',
  },
  ua_death_certificate: {
    // deceased_* / date_of_birth / date_of_death / place_of_death / act_record_*
    // match the schema keys directly.
    issuing_authority: 'place_of_registration',
    certificate_series_number: 'series_number',
  },
  ua_name_change_certificate: {
    // previous_* / new_* / date_of_birth / act_record_* match directly.
    issuing_authority: 'place_of_registration',
    certificate_series_number: 'series_number',
  },
}

/** An extracted field that has a value but NO slot in the official schema.
 *  Surfaced in the mirror's "ADDITIONAL ENTRIES" section so no read line is
 *  ever silently dropped (owner rule: "ни одна строка не теряется"). */
export interface ExtraEntry { key: string; label: string; value: string; review: boolean }

function humanizeKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function normVal(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function releaseValue(f: ExtractedFieldLite): string {
  // finalValue-first (Phase 3), then normalized_value, then value.
  const v = f.final_value !== undefined && f.final_value !== null
    ? f.final_value
    : (f.normalized_value ?? f.value ?? '')
  return (v ?? '').trim()
}

/**
 * Build the schema-keyed value map the mirror renderer expects.
 * Every schema field gets an entry: present+clean, present+review, or blank.
 */
export function buildMirrorValues(
  schema: OfficialFormSchema,
  extracted: ExtractedFieldLite[],
): Record<string, FieldValue> {
  const alias = ALIASES[schema.docType] ?? {}
  // Resolve each extracted field to its schema key (alias or identity).
  const bySchemaKey = new Map<string, ExtractedFieldLite>()
  for (const f of extracted) {
    const schemaKey = alias[f.field] ?? f.field
    // Prefer the first non-empty occurrence; don't let a later blank overwrite a value.
    const existing = bySchemaKey.get(schemaKey)
    if (!existing || (!releaseValue(existing) && releaseValue(f))) bySchemaKey.set(schemaKey, f)
  }

  const out: Record<string, FieldValue> = {}
  for (const spec of schema.fields) {
    const f = bySchemaKey.get(spec.key)
    if (!f) { out[spec.key] = { value: '', review: false, canRead: false }; continue }
    const value = releaseValue(f)
    if (!value) { out[spec.key] = { value: '', review: false, canRead: false }; continue }
    out[spec.key] = { value, review: f.review_required === true, canRead: true }
  }
  return out
}

/**
 * collectMirrorExtras — extracted fields that carry a value but have NO slot in
 * the official schema. Without this they are silently dropped (the renderer only
 * iterates schema.fields). We surface them in an "ADDITIONAL ENTRIES" section so
 * no recognized line is ever lost. NEVER invents: only echoes extracted values.
 * Deduped against values already shown as labeled schema fields (so a datum is
 * not printed twice — but distinct fields that happen to share a value, e.g. two
 * people with the same surname, are NOT collapsed).
 */
export function collectMirrorExtras(
  schema: OfficialFormSchema,
  extracted: ExtractedFieldLite[],
): ExtraEntry[] {
  const alias = ALIASES[schema.docType] ?? {}
  const schemaKeys = new Set(schema.fields.map((f) => f.key))
  const shownValues = buildMirrorValues(schema, extracted)
  const seen = new Set<string>(
    Object.values(shownValues).filter((v) => v.canRead).map((v) => normVal(v.value)),
  )
  // Resolve each extracted field to its schema key (alias or identity), first
  // non-empty wins — same rule as buildMirrorValues.
  const bySchemaKey = new Map<string, ExtractedFieldLite>()
  for (const f of extracted) {
    const schemaKey = alias[f.field] ?? f.field
    const existing = bySchemaKey.get(schemaKey)
    if (!existing || (!releaseValue(existing) && releaseValue(f))) bySchemaKey.set(schemaKey, f)
  }
  const extras: ExtraEntry[] = []
  for (const [schemaKey, f] of bySchemaKey) {
    if (schemaKeys.has(schemaKey)) continue // it has a labeled slot → not an extra
    const value = releaseValue(f)
    if (!value) continue
    const n = normVal(value)
    if (seen.has(n)) continue // already shown under a labeled field → don't repeat
    seen.add(n)
    extras.push({ key: f.field, label: humanizeKey(f.field), value, review: f.review_required === true })
  }
  return extras
}
