/**
 * crossProductParity.test.ts — Phase 1 / Agent 4 (parity + fallback guards).
 *
 * ONE synthetic CanonicalDocumentResult (built via buildCanonicalResult) is run
 * through EVERY product adapter that exists today. The same canonical fact must
 * land identically in each consumer — no drift, no re-transliteration, no
 * resurrection of a C3-rejected value, no invented keys.
 *
 * NO real PII: every value here is synthetic (surname "TESTOVYI", dob 1990-01-01,
 * passport "AA000000"). Field keys / booleans / counts only.
 *
 * Consumer APIs actually called (and any wrapper needed):
 *   - Translation : toTranslationRows(fields, cyrillicMap)         — takes CanonicalField[] + Map
 *   - TPS         : canonicalToTpsModuleResult(fields, hint, docId) — takes CanonicalField[]
 *   - Re-Parole   : toReParoleCoreAnswers(canonicalResult)          — takes CanonicalDocumentResult
 *   - EAD         : toEadAnswers(canonicalResult)                   — takes CanonicalDocumentResult
 *   Translation + TPS take the raw field array; Re-Parole + EAD take the full
 *   wrapper. buildCanonicalResult is used to assemble the wrapper once so both
 *   call shapes are fed from the SAME source of truth (no per-adapter input drift).
 *
 * KNOWN PARITY FAILURE recorded by this suite (do NOT silently "fix" the assertion):
 *   reParoleAdapter has its OWN getValue() that reads `normalizedValue ?? rawValue`
 *   and IGNORES finalValue. So a C3-REJECTED field (finalValue=null) is RESURRECTED
 *   by Re-Parole — the exact "Re-Parole blind spot" the fieldAccessor docstring
 *   warns about. Translation / TPS / EAD all honor finalValue and correctly
 *   suppress the rejected field. This test PINS that divergence so it can't change
 *   unnoticed; the fix is to route reParoleAdapter through getCanonicalValue().
 */
import { describe, it, expect } from 'vitest'
import { buildCanonicalResult } from '../buildCanonicalResult'
import { getCanonicalValue, getValueByAliases } from '../fieldAccessor'
import { toTranslationRows } from '../translationAdapter'
import { canonicalToTpsModuleResult } from '../tpsAdapter'
import { toReParoleCoreAnswers } from '../reParoleAdapter'
import { toEadAnswers } from '../eadAdapter'
import type { CanonicalField } from '../../types'

// ── Synthetic field builder (no PII) ──────────────────────────────────────────
function field(key: string, overrides: Partial<CanonicalField>): CanonicalField {
  return {
    key,
    rawValue: null,
    normalizedValue: null,
    criticality: 'medium',
    confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
    source: 'ai_vision',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
    ...overrides,
  }
}

// Synthetic constants — NEVER real values.
const SURNAME = 'TESTOVYI'        // controlling Latin (e.g. MRZ-derived), must pass verbatim
const GIVEN = 'SYNTH'
const DOB = '1990-01-01'
const PASSPORT = 'AA000000'
const RAW_CYRILLIC = 'СИНТ'        // synthetic Cyrillic surface to be preserved
const REJECTED_NORM = 'SHOULD_NOT_RELEASE' // C3 rejected this field → must never surface

// ONE canonical document, consumed by every adapter.
function buildOnce() {
  const fields: CanonicalField[] = [
    // family_name = controlling Latin (source 'mrz'); rawCyrillic carried alongside.
    field('family_name', {
      rawValue: SURNAME,
      normalizedValue: SURNAME,
      finalValue: SURNAME,
      source: 'mrz',
      rawCyrillic: RAW_CYRILLIC,
    }),
    field('given_name', { rawValue: GIVEN, normalizedValue: GIVEN, finalValue: GIVEN }),
    // date_of_birth via its alias key 'dob' (every consumer must resolve the alias).
    field('dob', { rawValue: DOB, normalizedValue: DOB, finalValue: DOB }),
    field('passport_number', { rawValue: PASSPORT, normalizedValue: PASSPORT, finalValue: PASSPORT }),
    // A field carrying raw Cyrillic for the translation consumer.
    field('place_of_birth', {
      rawValue: 'Kyiv',
      normalizedValue: 'Kyiv',
      finalValue: 'Kyiv',
      rawCyrillic: 'Київ',
    }),
    // C3-REJECTED field: finalValue=null ⇒ NOTHING may be released, ever.
    field('country_of_nationality', {
      rawValue: REJECTED_NORM,
      normalizedValue: REJECTED_NORM,
      finalValue: null,
      reviewRequired: true,
      reviewReasons: ['c3_rejected'],
    }),
  ]
  return buildCanonicalResult({
    documentSessionId: 'parity-synth-1',
    product: 'tps',
    docType: 'ua_international_passport',
    fields,
    createdAt: '2026-06-13T00:00:00.000Z',
  })
}

describe('cross-product canonical parity — identity keys are identical across consumers', () => {
  const canonical = buildOnce()
  const fields = canonical.fields

  // The canonical truth (read through the sanctioned accessor) — the reference.
  const truthFamily = getValueByAliases(canonical, 'family_name').value
  const truthGiven = getValueByAliases(canonical, 'given_name').value
  const truthDob = getValueByAliases(canonical, 'date_of_birth').value // alias resolves 'dob'

  // Each consumer's view of the same facts.
  const cyrMap = new Map<string, string>()
  const translation = toTranslationRows(fields, cyrMap)
  const tps = canonicalToTpsModuleResult(fields, 'passport', 'doc-synth-1')
  const reparole = toReParoleCoreAnswers(canonical)
  const ead = toEadAnswers(canonical)

  const tFam = translation.find((r) => r.field === 'family_name')
  const tGiven = translation.find((r) => r.field === 'given_name')
  const tDob = translation.find((r) => r.field === 'dob')
  const psFam = tps.fields.find((f) => f.field === 'family_name')
  const psGiven = tps.fields.find((f) => f.field === 'given_name')
  const psDob = tps.fields.find((f) => f.field === 'dob')

  it('reference truth is the synthetic controlling-Latin value (sanity)', () => {
    expect(truthFamily).toBe(SURNAME)
    expect(truthGiven).toBe(GIVEN)
    expect(truthDob).toBe(DOB)
  })

  it('family_name is SAME across all consumers', () => {
    expect(tFam?.value).toBe(truthFamily)
    expect(psFam?.normalized_value).toBe(truthFamily)
    expect(reparole.family_name).toBe(truthFamily)
    expect(ead.family_name).toBe(truthFamily)
  })

  it('given_name is SAME across all consumers', () => {
    expect(tGiven?.value).toBe(truthGiven)
    expect(psGiven?.normalized_value).toBe(truthGiven)
    expect(reparole.given_name).toBe(truthGiven)
    expect(ead.given_name).toBe(truthGiven)
  })

  it('date_of_birth (via dob alias) is SAME across all consumers', () => {
    expect(tDob?.value).toBe(truthDob)
    expect(psDob?.normalized_value).toBe(truthDob)
    expect(reparole.date_of_birth).toBe(truthDob)
    expect(ead.date_of_birth).toBe(truthDob)
  })

  it('controlling-Latin surname is passed VERBATIM (never re-transliterated)', () => {
    // No consumer may mutate the MRZ-controlling Latin value.
    expect(tFam?.value).toBe(SURNAME)
    expect(psFam?.normalized_value).toBe(SURNAME)
    expect(reparole.family_name).toBe(SURNAME)
    expect(ead.family_name).toBe(SURNAME)
    // It must equal the canonical field value exactly (identity, not transform).
    expect(getCanonicalValue(fields.find((f) => f.key === 'family_name')!)).toBe(SURNAME)
  })

  it('rawCyrillic is preserved where the consumer carries it (Translation)', () => {
    // Translation is the consumer that surfaces raw_cyrillic.
    expect(tFam?.raw_cyrillic).toBe(RAW_CYRILLIC)
    const tPlace = translation.find((r) => r.field === 'place_of_birth')
    expect(tPlace?.raw_cyrillic).toBe('Київ')
  })

  it('C3-rejected field is ABSENT from compliant consumers (Translation / TPS / EAD)', () => {
    // Translation/TPS emit the row but with NO releasable value (null), honoring C3.
    const tReject = translation.find((r) => r.field === 'country_of_nationality')
    expect(tReject?.value).toBeNull()
    const psReject = tps.fields.find((f) => f.field === 'country_of_nationality')
    expect(psReject?.normalized_value).toBeNull()
    // EAD: rejected identity field resolves to null (not resurrected).
    expect(ead.country_of_nationality).toBeNull()
  })

  it('Re-Parole now HONORS the C3 rejection (blind spot fixed in Phase 1)', () => {
    // reParoleAdapter previously had its own getValue() reading normalizedValue ??
    // rawValue, resurrecting a C3-rejected field (finalValue=null). Phase 1 routed it
    // through getCanonicalValue() — now all four consumers suppress the rejected
    // value. (This was a recorded KNOWN PARITY FAILURE; the fix flipped it to null.)
    expect(reparole.country_of_nationality).toBeNull()
    expect(ead.country_of_nationality).toBeNull()
  })

  it('no consumer invents a key that was not in the canonical input', () => {
    const inputKeys = new Set(fields.map((f) => f.key))
    // Translation + TPS emit one row per input field — every emitted key must exist.
    for (const r of translation) expect(inputKeys.has(r.field)).toBe(true)
    for (const f of tps.fields) expect(inputKeys.has(f.field)).toBe(true)
    // Translation/TPS must not drop or add identity rows.
    expect(translation.length).toBe(fields.length)
    expect(tps.fields.length).toBe(fields.length)
    // EAD declares invented_fields_count — contract requires 0.
    expect(ead.invented_fields_count).toBe(0)
    // EAD source-gated fields (EAD/I-94/DL) must be null for a passport docType —
    // i.e. NOT invented from a passport source.
    expect(ead.a_number).toBeNull()
    expect(ead.uscis_number).toBeNull()
    expect(ead.i94_admission_number).toBeNull()
    expect(ead.us_address).toBeNull()
  })
})
