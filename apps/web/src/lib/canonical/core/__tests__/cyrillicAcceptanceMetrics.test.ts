import { describe, it, expect } from 'vitest'
import {
  scoreDocumentAcceptance,
  acceptanceVerdict,
  rollupByType,
  characterErrorRate,
  isWrongTransliteration,
  levenshtein,
  type AcceptanceProducedField,
} from '../cyrillicAcceptanceMetrics'
import type { GroundTruth } from '../benchmark'

const truth = (fields: Record<string, string>, doc_type = 'ua_internal_passport_booklet'): GroundTruth => ({
  document_id: 'opaque-001', doc_type,
  fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, critical: true }])),
})

describe('levenshtein / CER', () => {
  it('0 for identical, full for disjoint', () => {
    expect(levenshtein('abc', 'abc')).toBe(0)
    expect(characterErrorRate('abc', 'abc')).toBe(0)
    expect(characterErrorRate('Ivanenko', 'Ivanenku')).toBeCloseTo(1 / 8, 5)
  })
})

describe('EMPTY is a FIRST-CLASS failure — never folded into success', () => {
  it('an empty critical field is EMPTY, NOT fabricated, NOT exact', () => {
    const gt = truth({ family_name: 'Ivanenko', dob: '2000-01-02', patronymic: 'Petrovych' })
    const produced: AcceptanceProducedField[] = [
      { key: 'family_name', value: 'Ivanenko' },          // exact
      { key: 'dob', value: null, reviewRequired: true },  // EMPTY
      { key: 'patronymic', value: '' },                   // EMPTY
    ]
    const { metrics } = scoreDocumentAcceptance(produced, gt)
    expect(metrics.empty_critical_fields).toBe(2)         // both empties counted as EMPTY
    expect(metrics.fabricated_critical_fields).toBe(0)    // NOT fabrication
    expect(metrics.critical_field_exact_match).toBeCloseTo(1 / 3, 5) // only 1/3 exact — NOT 100%
  })

  it('a doc that reads NOTHING is NOT production_ready (the old "0 fabricated" bug)', () => {
    const gt = truth({ family_name: 'Ivanenko', dob: '2000-01-02' })
    const produced: AcceptanceProducedField[] = [
      { key: 'family_name', value: null }, { key: 'dob', value: null },
    ]
    const { metrics } = scoreDocumentAcceptance(produced, gt)
    expect(metrics.fabricated_critical_fields).toBe(0)    // true, but...
    expect(metrics.empty_critical_fields).toBe(2)
    const v = acceptanceVerdict(metrics)
    expect(v.production_ready).toBe(false)                // NOT ready — it reads nothing
    expect(v.reasons.join(' ')).toMatch(/EMPTY|exact_match/)
  })
})

describe('FABRICATION = a wrong/invented value auto-released (distinct from empty)', () => {
  it('a wrong, non-flagged critical value is FABRICATED', () => {
    const gt = truth({ family_name: 'Ivanenko' })
    const { metrics, verdicts } = scoreDocumentAcceptance([{ key: 'family_name', value: 'Petrenko' }], gt)
    expect(metrics.fabricated_critical_fields).toBe(1)
    expect(verdicts[0].verdict).toBe('WRONG')
  })
  it('a value emitted where truth is EMPTY is FABRICATED', () => {
    const gt: GroundTruth = { document_id: 'd', doc_type: 't', fields: { patronymic: { value: '', critical: true } } }
    const { metrics, verdicts } = scoreDocumentAcceptance([{ key: 'patronymic', value: 'Invented' }], gt)
    expect(metrics.fabricated_critical_fields).toBe(1)
    expect(verdicts[0].verdict).toBe('FABRICATED')
  })
  it('a wrong but REVIEW-FLAGGED value is NOT fabrication (honestly parked)', () => {
    const gt = truth({ family_name: 'Ivanenko' })
    const { metrics, verdicts } = scoreDocumentAcceptance([{ key: 'family_name', value: 'Petrenko', reviewRequired: true }], gt)
    expect(metrics.fabricated_critical_fields).toBe(0)
    expect(verdicts[0].verdict).toBe('REVIEW')
  })
})

describe('false_final_critical — C3 released a wrong non-null value (worst case)', () => {
  it('counts a finalValue string that mismatches truth', () => {
    const gt = truth({ family_name: 'Ivanenko' })
    const { metrics } = scoreDocumentAcceptance(
      [{ key: 'family_name', value: 'Petrenko', finalValue: 'Petrenko' }], gt,
    )
    expect(metrics.false_final_critical).toBe(1)
    expect(acceptanceVerdict(metrics).production_ready).toBe(false)
  })
  it('a finalValue=null (C3 rejected) is NOT a false final', () => {
    const gt = truth({ family_name: 'Ivanenko' })
    const { metrics } = scoreDocumentAcceptance(
      [{ key: 'family_name', value: null, finalValue: null, reviewRequired: true }], gt,
    )
    expect(metrics.false_final_critical).toBe(0)
    expect(metrics.empty_critical_fields).toBe(1) // it's EMPTY, honestly
  })
})

describe('wrong transliteration + MRZ conflict', () => {
  it('flags a name whose Latin does not match KMU-55 of the raw Cyrillic', () => {
    // synthetic UA surname 'Іваненко' → KMU-55 'Ivanenko'; a wrong Latin must flag.
    expect(isWrongTransliteration('family_name', 'Zzwrong', 'Іваненко', null)).toBe(true)
    // empty is NOT a wrong transliteration — it's EMPTY
    expect(isWrongTransliteration('family_name', null, 'Іваненко', null)).toBe(false)
  })
  it('a controlling Latin (MRZ/I-94/EAD) overrides — got must match it', () => {
    expect(isWrongTransliteration('surname', 'IVANENKO', 'Іваненко', 'IVANOV')).toBe(true)
    expect(isWrongTransliteration('surname', 'IVANOV', 'Іваненко', 'IVANOV')).toBe(false)
  })
  it('mrz_conflict_rate counts a critical value diverging from its controlling Latin', () => {
    const gt = truth({ surname: 'IVANOV' })
    const { metrics } = scoreDocumentAcceptance(
      [{ key: 'surname', value: 'IVANENKO', controllingLatin: 'IVANOV' }], gt,
    )
    expect(metrics.mrz_conflict_rate).toBe(1)
  })
})

describe('acceptanceVerdict gate + rollupByType', () => {
  it('production_ready only when fabricated=0, false_final=0, exact>=95%', () => {
    const gt = truth(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${i}`, `V${i}`])))
    // 19/20 exact, 1 review-flagged-wrong → exact=95%, fabricated=0 → ready
    const produced: AcceptanceProducedField[] = Array.from({ length: 20 }, (_, i) =>
      i < 19 ? { key: `f${i}`, value: `V${i}` } : { key: `f${i}`, value: 'X', reviewRequired: true })
    const { metrics } = scoreDocumentAcceptance(produced, gt)
    expect(metrics.critical_field_exact_match).toBeCloseTo(0.95, 5)
    expect(acceptanceVerdict(metrics).production_ready).toBe(true)
  })

  it('rolls up per type with production_ready / not_ready split', () => {
    const ready = scoreDocumentAcceptance([{ key: 'a', value: 'X' }], truth({ a: 'X' }, 'type_ok')).metrics
    const bad = scoreDocumentAcceptance([{ key: 'a', value: 'WRONG' }], truth({ a: 'X' }, 'type_bad')).metrics
    const roll = rollupByType([ready, bad])
    const ok = roll.find((r) => r.doc_type === 'type_ok')!
    const nope = roll.find((r) => r.doc_type === 'type_bad')!
    expect(ok.production_ready).toBe(true)
    expect(nope.production_ready).toBe(false)
    expect(nope.fabricated_critical_fields).toBe(1)
  })
})

describe('PII-free: aggregate metrics carry NO field values', () => {
  it('DocumentAcceptanceMetrics has only ids/types/counts/rates', () => {
    const gt = truth({ family_name: 'Ivanenko', dob: '2000-01-02' })
    const { metrics } = scoreDocumentAcceptance([{ key: 'family_name', value: 'Ivanenko' }], gt)
    const blob = JSON.stringify(metrics)
    expect(blob).not.toContain('Ivanenko')   // no PII in the aggregate
    expect(blob).not.toContain('2000')
    expect(metrics.document_id).toBe('opaque-001')
  })
})
