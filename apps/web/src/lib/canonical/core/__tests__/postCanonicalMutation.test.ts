/**
 * postCanonicalMutation.test.ts — Phase 1 / Agent 4 (independent final gate).
 *
 * MUTATION DETECTOR. The canonical core is the single currency: once a value is
 * resolved in the canonical document, NO downstream consumer may MUTATE it.
 * Allowed transforms are exactly two, both additive/cosmetic and both already
 * pinned by sibling suites:
 *   - trim/whitespace→null normalization (getCanonicalValue)
 *   - the TRANSLATION-only «смт» settlement designator PREFIX re-add for
 *     city/place_of_birth (taken ONLY from raw Cyrillic, never inferred).
 * EVERYTHING ELSE is a mutation and must FAIL here:
 *   - retransliteration (Latin surname/given rewritten)
 *   - semantic case change (TESTOVYI → Testovyi)
 *   - city / oblast rewrite (genitive→nominative, modernization)
 *   - date rewrite (format or value)
 *   - sex rewrite (M↔F, normalization to other tokens)
 *   - authority rewrite (Militsiya→Police, etc.)
 *   - review DOWNGRADE (reviewRequired true→false at the consumer)
 *
 * Strategy: snapshot the canonical input value (read through the sanctioned
 * accessor getCanonicalValue) and compare it byte-for-byte against the value
 * each consumer derives for the SAME key. A mismatch that is not the one
 * sanctioned settlement-prefix exception is a mutation.
 *
 * NO PII — every value is synthetic (surname 'TESTOVYI', dob '1990-01-01',
 * passport 'AA000000', sex 'M', oblast nominative 'VINNYTSIA OBLAST').
 */
import { describe, it, expect } from 'vitest'
import { buildCanonicalResult } from '../buildCanonicalResult'
import { getCanonicalValue } from '../fieldAccessor'
import { toTranslationRows } from '../translationAdapter'
import { canonicalToTpsModuleResult } from '../tpsAdapter'
import { toReParoleCoreAnswers } from '../reParoleAdapter'
import { toEadAnswers } from '../eadAdapter'
import type { CanonicalField, CanonicalDocumentResult } from '../../types'

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

// Synthetic constants chosen to EXPOSE each mutation class if it happened.
const SURNAME = 'TESTOVYI'             // mixed/all-caps Latin — case change would show
const GIVEN = 'Synthetyk'             // mixed case — would change if re-cased
const DOB = '1990-01-01'              // a date rewrite would change format/value
const PASSPORT = 'AA000000'
const SEX = 'M'                       // sex rewrite would flip token
const OBLAST = 'VINNYTSIA OBLAST'     // already nominative+verified; a "fix" would rewrite
const AUTHORITY = 'Militsiya'         // historical; a rewrite to Police/Militia is forbidden
const REVIEW_VALUE = 'NEEDS_HUMAN'    // a field carrying reviewRequired=true (must not downgrade)

function synthDoc(): CanonicalDocumentResult {
  const fields: CanonicalField[] = [
    field('family_name', { rawValue: SURNAME, normalizedValue: SURNAME, finalValue: SURNAME, source: 'mrz', criticality: 'high' }),
    field('given_name', { rawValue: GIVEN, normalizedValue: GIVEN, finalValue: GIVEN, criticality: 'high' }),
    field('dob', { rawValue: DOB, normalizedValue: DOB, finalValue: DOB, criticality: 'critical' }),
    field('passport_number', { rawValue: PASSPORT, normalizedValue: PASSPORT, finalValue: PASSPORT, criticality: 'critical' }),
    field('sex', { rawValue: SEX, normalizedValue: SEX, finalValue: SEX }),
    // oblast carried via its place key; no raw Cyrillic ⇒ NO settlement prefix re-add.
    field('country_of_birth', { rawValue: OBLAST, normalizedValue: OBLAST, finalValue: OBLAST }),
    // issuing authority — historical-name preservation rule lives upstream; the
    // consumer must pass whatever canonical holds, verbatim.
    field('issuing_authority', { rawValue: AUTHORITY, normalizedValue: AUTHORITY, finalValue: AUTHORITY }),
    // a field that MUST stay in review through every consumer.
    field('country_of_nationality', {
      rawValue: REVIEW_VALUE, normalizedValue: REVIEW_VALUE, finalValue: REVIEW_VALUE,
      reviewRequired: true, reviewReasons: ['source_script_ambiguous'],
    }),
  ]
  return buildCanonicalResult({
    documentSessionId: 'mutation-synth-1',
    product: 'tps',
    docType: 'ua_international_passport',
    fields,
    createdAt: '2026-06-13T00:00:00.000Z',
  })
}

// The canonical truth for each key, read through the single sanctioned accessor.
function truthByKey(doc: CanonicalDocumentResult): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const f of doc.fields) out[f.key] = getCanonicalValue(f)
  return out
}

describe('post-canonical mutation detector — no consumer mutates a resolved value', () => {
  const doc = synthDoc()
  const truth = truthByKey(doc)
  const fields = doc.fields

  const translation = toTranslationRows(fields, new Map<string, string>())
  const tps = canonicalToTpsModuleResult(fields, 'passport', 'doc-mut-1')
  const reparole = toReParoleCoreAnswers(doc)
  const ead = toEadAnswers(doc)

  const tVal = (k: string) => translation.find((r) => r.field === k)?.value ?? null
  const pVal = (k: string) => tps.fields.find((f) => f.field === k)?.normalized_value ?? null

  it('sanity: synthetic truth is exactly the values we put in (no input drift)', () => {
    expect(truth.family_name).toBe(SURNAME)
    expect(truth.given_name).toBe(GIVEN)
    expect(truth.dob).toBe(DOB)
    expect(truth.sex).toBe(SEX)
    expect(truth.country_of_birth).toBe(OBLAST)
    expect(truth.issuing_authority).toBe(AUTHORITY)
  })

  it('Translation: identity/date/sex/oblast/authority values are byte-identical (no mutation)', () => {
    // place_of_birth/city would get the settlement prefix; these keys never do.
    for (const k of ['family_name', 'given_name', 'dob', 'passport_number', 'sex', 'country_of_birth', 'issuing_authority']) {
      expect({ key: k, value: tVal(k) }).toEqual({ key: k, value: truth[k] })
    }
  })

  it('TPS: identity/date/sex/oblast/authority values are byte-identical (no mutation)', () => {
    for (const k of ['family_name', 'given_name', 'dob', 'passport_number', 'sex', 'country_of_birth', 'issuing_authority']) {
      expect({ key: k, value: pVal(k) }).toEqual({ key: k, value: truth[k] })
    }
  })

  it('Re-Parole: mapped values are byte-identical to canonical truth', () => {
    expect(reparole.family_name).toBe(truth.family_name)
    expect(reparole.given_name).toBe(truth.given_name)
    expect(reparole.date_of_birth).toBe(truth.dob)
    expect(reparole.passport_number).toBe(truth.passport_number)
    expect(reparole.sex).toBe(truth.sex)
    expect(reparole.country_of_birth).toBe(truth.country_of_birth)
  })

  it('EAD: mapped values are byte-identical to canonical truth', () => {
    expect(ead.family_name).toBe(truth.family_name)
    expect(ead.given_name).toBe(truth.given_name)
    expect(ead.date_of_birth).toBe(truth.dob)
    expect(ead.passport_number).toBe(truth.passport_number)
    expect(ead.sex).toBe(truth.sex)
    expect(ead.country_of_birth).toBe(truth.country_of_birth)
  })

  // ── Specific mutation-class assertions (each would catch a real-world bug) ──

  it('NO retransliteration: controlling Latin surname is verbatim everywhere', () => {
    expect(tVal('family_name')).toBe(SURNAME)
    expect(pVal('family_name')).toBe(SURNAME)
    expect(reparole.family_name).toBe(SURNAME)
    expect(ead.family_name).toBe(SURNAME)
  })

  it('NO semantic case change: given name keeps its exact casing', () => {
    // 'Synthetyk' must not become 'SYNTHETYK' or 'synthetyk'.
    for (const v of [tVal('given_name'), pVal('given_name'), reparole.given_name, ead.given_name]) {
      expect(v).toBe(GIVEN)
    }
  })

  it('NO oblast rewrite: nominative+verified oblast is not re-cased or modernized', () => {
    for (const v of [tVal('country_of_birth'), pVal('country_of_birth'), reparole.country_of_birth, ead.country_of_birth]) {
      expect(v).toBe(OBLAST)
    }
  })

  it('NO date rewrite: canonical YYYY-MM-DD is preserved exactly', () => {
    for (const v of [tVal('dob'), pVal('dob'), reparole.date_of_birth, ead.date_of_birth]) {
      expect(v).toBe(DOB)
    }
  })

  it('NO sex rewrite: M stays M (never flipped or expanded)', () => {
    for (const v of [tVal('sex'), pVal('sex'), reparole.sex, ead.sex]) {
      expect(v).toBe(SEX)
    }
  })

  it('NO authority rewrite: historical authority passes verbatim (Militsiya, not Police)', () => {
    // Only Translation/TPS emit this key (it is not in the Re-Parole/EAD shape);
    // those that emit it must not rewrite it.
    expect(tVal('issuing_authority')).toBe(AUTHORITY)
    expect(pVal('issuing_authority')).toBe(AUTHORITY)
    expect(tVal('issuing_authority')).not.toMatch(/police|militia/i)
    expect(pVal('issuing_authority')).not.toMatch(/police|militia/i)
  })

  it('NO review downgrade: a reviewRequired field stays in review through every consumer', () => {
    const tReview = translation.find((r) => r.field === 'country_of_nationality')
    const pReview = tps.fields.find((f) => f.field === 'country_of_nationality')
    expect(tReview?.review_required).toBe(true)
    expect(pReview?.review_required).toBe(true)
    // The reviewing field key must be listed as uncertain by the wrapper adapters,
    // i.e. its review state is propagated, never silently cleared.
    expect(reparole.uncertain_fields).toContain('country_of_nationality')
    expect(ead.uncertain_fields).toContain('country_of_nationality')
    expect(reparole.review_required).toBe(true)
    expect(ead.review_required).toBe(true)
  })

  it('SETTLEMENT EXCEPTION is scoped: prefix re-add only touches city/place keys with raw Cyrillic', () => {
    // country_of_birth has NO rawCyrillic ⇒ even though it contains a place name,
    // the Translation adapter must NOT prepend a settlement designator to it.
    expect(tVal('country_of_birth')).toBe(OBLAST)
    expect(tVal('country_of_birth')).not.toMatch(/urban-type settlement/i)
  })
})
