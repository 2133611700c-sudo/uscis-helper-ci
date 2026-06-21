/**
 * formMapperCanonicalParity.test.ts — Phase 1 cross-adapter parity proof.
 *
 * Asserts the "one canonical currency" invariant across all FOUR product
 * adapters that bridge CanonicalDocumentResult → product answers:
 *   - tpsAdapter         (canonicalToTpsModuleResult)
 *   - eadAdapter         (toEadAnswers)
 *   - translationAdapter (toTranslationRows)
 *   - reParoleAdapter    (toReParoleCoreAnswers)
 *
 * Two guarantees, on ONE synthetic CanonicalDocumentResult (no real PII):
 *
 *   1. PARITY — for every document-derived field that an adapter surfaces, the
 *      value it emits equals `getCanonicalValue(field)` (the single sanctioned
 *      accessor). No adapter re-implements the finalValue precedence and gets a
 *      different answer.
 *
 *   2. C3 REJECTION — a field that C3 rejected (finalValue === null) is ABSENT
 *      (null / empty / not present) from all four adapter outputs. This is the
 *      reParoleAdapter blind spot that was just fixed; the other three already
 *      honored it. This test locks all four together.
 *
 * Source-gated EAD fields (a_number, i94_*, us_address, ead_*) are out of scope
 * here: they're gated on docType, not on the finalValue contract. We use
 * identity/passport fields that every adapter surfaces from an identity doc.
 */
import { describe, it, expect } from 'vitest'
import type { CanonicalDocumentResult, CanonicalField } from '../../types'
import { getCanonicalValue } from '../fieldAccessor'
import { canonicalToTpsModuleResult } from '../tpsAdapter'
import { toEadAnswers } from '../eadAdapter'
import { toTranslationRows } from '../translationAdapter'
import { toReParoleCoreAnswers } from '../reParoleAdapter'

// ── Synthetic fixture (field keys + synthetic values only — NO real PII) ───────

function makeField(
  key: string,
  rawValue: string | null,
  overrides: Partial<CanonicalField> = {},
): CanonicalField {
  return {
    key,
    rawValue,
    normalizedValue: rawValue,
    criticality: 'medium',
    confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
    source: 'ai_vision',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
    ...overrides,
  }
}

/** A passport-shaped canonical result with a mix of C3 states. */
function makeFixture(): CanonicalDocumentResult {
  return {
    documentSessionId: 'parity-session',
    product: 'reparole',
    docType: 'ua_international_passport',
    fields: [
      // C3 not run (undefined) → fall back to normalizedValue.
      makeField('family_name', 'Synthsurname'),
      // C3 accepted (finalValue string) → release finalValue, NOT normalizedValue.
      makeField('given_name', 'SYNTHGIVEN', { normalizedValue: 'SYNTHGIVEN', finalValue: 'Synthgiven' }),
      makeField('date_of_birth', '1990-01-02'),
      makeField('sex', 'F'),
      makeField('country_of_birth', 'Ukraine'),
      makeField('passport_number', 'XX000000'),
      // C3 REJECTED (finalValue null) → must be absent everywhere.
      makeField('country_of_nationality', 'Ukraine', {
        finalValue: null,
        reviewRequired: true,
        reviewReasons: ['ocr_field_safety_rejected'],
      }),
    ],
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-13T00:00:00.000Z',
    requiresReview: true,
  }
}

function fieldByKey(result: CanonicalDocumentResult, key: string): CanonicalField {
  const f = result.fields.find((x) => x.key === key)
  if (!f) throw new Error(`fixture missing key ${key}`)
  return f
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('form mapper ↔ canonical parity (all four adapters)', () => {
  const fixture = makeFixture()

  // Expected release values straight from the single sanctioned accessor.
  const expected = {
    family_name: getCanonicalValue(fieldByKey(fixture, 'family_name')),            // 'Synthsurname'
    given_name: getCanonicalValue(fieldByKey(fixture, 'given_name')),              // 'Synthgiven' (finalValue)
    date_of_birth: getCanonicalValue(fieldByKey(fixture, 'date_of_birth')),        // '1990-01-02'
    sex: getCanonicalValue(fieldByKey(fixture, 'sex')),                            // 'F'
    country_of_birth: getCanonicalValue(fieldByKey(fixture, 'country_of_birth')),  // 'Ukraine'
    passport_number: getCanonicalValue(fieldByKey(fixture, 'passport_number')),    // 'XX000000'
    country_of_nationality: getCanonicalValue(fieldByKey(fixture, 'country_of_nationality')), // null (rejected)
  }

  it('sanity: the rejected field resolves to null via getCanonicalValue', () => {
    expect(expected.country_of_nationality).toBeNull()
    // The accepted field releases finalValue, not the (uppercase) normalizedValue.
    expect(expected.given_name).toBe('Synthgiven')
  })

  it('reParoleAdapter: parity per key + rejected field absent', () => {
    const r = toReParoleCoreAnswers(fixture)
    expect(r.family_name).toBe(expected.family_name)
    expect(r.given_name).toBe(expected.given_name)
    expect(r.date_of_birth).toBe(expected.date_of_birth)
    expect(r.sex).toBe(expected.sex)
    expect(r.country_of_birth).toBe(expected.country_of_birth)
    expect(r.passport_number).toBe(expected.passport_number)
    // C3-rejected → null.
    expect(r.country_of_nationality).toBeNull()
  })

  it('eadAdapter: parity per key + rejected field absent', () => {
    const r = toEadAnswers(fixture)
    expect(r.family_name).toBe(expected.family_name)
    expect(r.given_name).toBe(expected.given_name)
    expect(r.date_of_birth).toBe(expected.date_of_birth)
    expect(r.sex).toBe(expected.sex)
    expect(r.country_of_birth).toBe(expected.country_of_birth)
    expect(r.passport_number).toBe(expected.passport_number)
    expect(r.country_of_nationality).toBeNull()
  })

  it('translationAdapter: parity per key + rejected field carries no value', () => {
    const rows = toTranslationRows(fixture.fields, new Map())
    const byField = new Map(rows.map((row) => [row.field, row.value]))
    expect(byField.get('family_name')).toBe(expected.family_name)
    expect(byField.get('given_name')).toBe(expected.given_name)
    expect(byField.get('date_of_birth')).toBe(expected.date_of_birth)
    expect(byField.get('sex')).toBe(expected.sex)
    expect(byField.get('country_of_birth')).toBe(expected.country_of_birth)
    expect(byField.get('passport_number')).toBe(expected.passport_number)
    // translation surfaces the rejected key as a row, but with NO releasable value.
    expect(byField.get('country_of_nationality')).toBeNull()
  })

  it('tpsAdapter: parity per key + rejected field releases no value', () => {
    const mod = canonicalToTpsModuleResult(fixture.fields, 'passport', 'doc-1')
    const byField = new Map(mod.fields.map((f) => [f.field, f.normalized_value]))
    expect(byField.get('family_name')).toBe(expected.family_name)
    expect(byField.get('given_name')).toBe(expected.given_name)
    expect(byField.get('date_of_birth')).toBe(expected.date_of_birth)
    expect(byField.get('sex')).toBe(expected.sex)
    expect(byField.get('country_of_birth')).toBe(expected.country_of_birth)
    expect(byField.get('passport_number')).toBe(expected.passport_number)
    // tpsAdapter sets normalized_value = finalValue when C3 ran → null for rejected.
    expect(byField.get('country_of_nationality')).toBeNull()
  })

  it('the C3-rejected field is absent from ALL FOUR adapter outputs', () => {
    const rep = toReParoleCoreAnswers(fixture)
    const ead = toEadAnswers(fixture)
    const tr = new Map(toTranslationRows(fixture.fields, new Map()).map((r) => [r.field, r.value]))
    const tps = new Map(
      canonicalToTpsModuleResult(fixture.fields, 'passport', 'doc-1').fields.map((f) => [f.field, f.normalized_value]),
    )
    expect(rep.country_of_nationality).toBeNull()
    expect(ead.country_of_nationality).toBeNull()
    expect(tr.get('country_of_nationality')).toBeNull()
    expect(tps.get('country_of_nationality')).toBeNull()
  })
})
