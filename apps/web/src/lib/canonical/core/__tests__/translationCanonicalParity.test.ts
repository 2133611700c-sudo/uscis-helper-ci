/**
 * translationCanonicalParity.test.ts — Phase 1 (Agent 2, translation migration).
 *
 * Proves the translation product now consumes the ONE canonical currency
 * (CanonicalDocumentResult built by buildCanonicalResult) through the single
 * sanctioned value accessor (getCanonicalValue, via canonicalToFieldOut), WITHOUT
 * changing any user-visible value vs the pre-refactor local precedence rule.
 *
 * The synthetic CanonicalField[] below uses field KEYS and synthetic values only —
 * NO real PII. It exercises the C3 contract corners that matter for parity:
 *   - a C3-REJECTED field (finalValue=null)        → must NOT release a value
 *   - a controlling-Latin name (MRZ-style, verbatim)→ must pass through untouched
 *   - a field carrying rawCyrillic + reviewReasons  → both preserved on output
 *   - a suggestedValue                              → now carried (was dropped)
 *   - no field is invented / fabricated             → output keys == input keys
 */
import { describe, it, expect } from 'vitest'
import { buildCanonicalResult } from '../buildCanonicalResult'
import { toTranslationRows } from '../translationAdapter'
import type { CanonicalField } from '../../types'

function mk(overrides: Partial<CanonicalField> & { key: string }): CanonicalField {
  return {
    rawValue: null,
    normalizedValue: null,
    criticality: 'high',
    confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
    source: 'ai_vision',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [],
    ...overrides,
  }
}

describe('translation Phase-1 canonical parity (buildCanonicalResult → accessor)', () => {
  // Synthetic canonical fields — keys + synthetic values only, NO PII.
  const fields: CanonicalField[] = [
    // C3 ran and REJECTED — the safety layer killed the value. Must NOT resurface.
    mk({ key: 'family_name', rawValue: 'SyntheticRaw', normalizedValue: 'SyntheticNorm', finalValue: null, reviewRequired: true, reviewReasons: ['c3_rejected'] }),
    // Controlling Latin (MRZ authority): verbatim, must pass through unchanged.
    mk({ key: 'given_name', rawValue: 'TARASYNTH', normalizedValue: 'TARASYNTH', finalValue: 'TARASYNTH', source: 'mrz' }),
    // rawCyrillic + reviewReasons preservation; finalValue undefined → falls back to normalized.
    mk({ key: 'place_of_birth_note', rawValue: 'PlaceSynth', normalizedValue: 'PlaceSynth', rawCyrillic: 'СинтетичнеМісце', reviewRequired: true, reviewReasons: ['source_script_ambiguous'] }),
    // suggestedValue must now ride along (was dropped at the adapter pre-Phase-1).
    mk({ key: 'date_of_birth', normalizedValue: '1990-01-02', finalValue: '1990-01-02', suggestedValue: '1990-02-01' }),
  ]

  const result = buildCanonicalResult({
    documentSessionId: 'parity-test',
    product: 'translation',
    docType: 'ua_international_passport',
    fields,
    createdAt: '2026-01-01T00:00:00Z',
  })
  const rows = toTranslationRows(result.fields, new Map())
  const byKey = Object.fromEntries(rows.map((r) => [r.field, r]))

  it('builds a CanonicalDocumentResult whose requiresReview is derived from the fields', () => {
    expect(result.requiresReview).toBe(true) // two review-required fields present
    expect(result.fields).toHaveLength(4)
  })

  it('C3-REJECTED field (finalValue=null) releases NO value [key=family_name → null/EMPTY]', () => {
    expect(byKey['family_name'].value).toBeNull()
    expect(byKey['family_name'].review_required).toBe(true)
    expect(byKey['family_name'].review_reasons).toEqual(['c3_rejected'])
  })

  it('controlling-Latin name passes through verbatim [key=given_name → SAME]', () => {
    expect(byKey['given_name'].value).toBe('TARASYNTH')
  })

  it('rawCyrillic is preserved [key=place_of_birth_note → SAME]', () => {
    expect(byKey['place_of_birth_note'].raw_cyrillic).toBe('СинтетичнеМісце')
    expect(byKey['place_of_birth_note'].value).toBe('PlaceSynth')
  })

  it('reviewReasons are preserved [key=place_of_birth_note → SAME]', () => {
    expect(byKey['place_of_birth_note'].review_reasons).toEqual(['source_script_ambiguous'])
  })

  it('suggestedValue is now carried [key=date_of_birth → SAME, suggested_value populated]', () => {
    expect(byKey['date_of_birth'].value).toBe('1990-01-02')
    expect(byKey['date_of_birth'].suggested_value).toBe('1990-02-01')
  })

  it('NO field is invented/fabricated — output keys exactly equal input keys', () => {
    expect(rows.map((r) => r.field).sort()).toEqual(fields.map((f) => f.key).sort())
  })

  it('parity: value resolution is identical to the old local precedence rule', () => {
    // Old rule: finalValue !== undefined ? finalValue : (normalizedValue ?? rawValue ?? null)
    for (const f of fields) {
      const old = f.finalValue !== undefined ? f.finalValue : (f.normalizedValue ?? f.rawValue ?? null)
      const oldTrimmed = typeof old === 'string' ? (old.trim().length ? old.trim() : null) : old
      // place_of_birth_note carries the settlement re-add only when rawCyrillic has a
      // designator; СинтетичнеМісце has none, so value is unchanged from the old rule.
      expect(byKey[f.key].value).toBe(oldTrimmed)
    }
  })
})
