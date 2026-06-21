/**
 * canonicalContract.test — pins the Phase 1 frozen contract: the safe value
 * accessor (C3 semantics), the alias registry (mechanical only), the dumb adapter
 * engine, and the wrapper builder. Synthetic data only — no PII.
 */
import { describe, it, expect } from 'vitest'
import type { CanonicalDocumentResult, CanonicalField } from '../../types'
import {
  getCanonicalValue,
  isCanonicalFieldRejected,
  wasFinalizationApplied,
  getValueByAliases,
  getValueByKey,
} from '../fieldAccessor'
import { keysFor, primaryKeyOf } from '../keyAliases'
import { applyCanonicalFieldMap } from '../adapterContract'
import { buildCanonicalResult } from '../buildCanonicalResult'

const fld = (over: Partial<CanonicalField>): CanonicalField => ({
  key: 'given_name',
  rawValue: null,
  normalizedValue: null,
  criticality: 'medium',
  confidence: { ocr: null, field_match: null, normalization: null, source_match: null, final: 0.9 },
  source: 'ai_vision' as CanonicalField['source'],
  reviewRequired: false,
  reviewReasons: [],
  evidence: [],
  ...over,
})

describe('getCanonicalValue — exact C3 semantics', () => {
  it('C3 REJECTED (finalValue=null) → null, NEVER falls back to normalizedValue', () => {
    const f = fld({ finalValue: null, normalizedValue: 'Taras', rawValue: 'Тарас' })
    expect(getCanonicalValue(f)).toBeNull()
    expect(isCanonicalFieldRejected(f)).toBe(true)
    expect(wasFinalizationApplied(f)).toBe(true)
  })
  it('C3 ACCEPTED (finalValue=string) → finalValue', () => {
    const f = fld({ finalValue: 'Taras', normalizedValue: 'WRONG' })
    expect(getCanonicalValue(f)).toBe('Taras')
    expect(isCanonicalFieldRejected(f)).toBe(false)
  })
  it('C3 NOT APPLIED (finalValue=undefined) → normalizedValue ?? rawValue', () => {
    expect(getCanonicalValue(fld({ normalizedValue: 'Taras', rawValue: 'Тарас' }))).toBe('Taras')
    expect(getCanonicalValue(fld({ normalizedValue: null, rawValue: 'Тарас' }))).toBe('Тарас')
    expect(wasFinalizationApplied(fld({ normalizedValue: 'x' }))).toBe(false)
  })
  it('empty/whitespace → null (never a blank value)', () => {
    expect(getCanonicalValue(fld({ finalValue: '   ' }))).toBeNull()
    expect(getCanonicalValue(fld({ normalizedValue: '', rawValue: '' }))).toBeNull()
  })
})

describe('keyAliases — mechanical only', () => {
  it('primary + aliases resolve', () => {
    expect(keysFor('date_of_birth')).toEqual(['date_of_birth', 'dob'])
    expect(primaryKeyOf('dob')).toBe('date_of_birth')
    expect(primaryKeyOf('patronymic')).toBe('middle_name')
    expect(primaryKeyOf('unmapped_key')).toBe('unmapped_key')
  })
})

const result = (fields: CanonicalField[]): CanonicalDocumentResult =>
  buildCanonicalResult({ documentSessionId: 's', product: 'tps', docType: 'ua_international_passport', fields, createdAt: '2026-01-01T00:00:00Z' })

describe('getValueByAliases', () => {
  it('reads via an alias key when the primary is absent', () => {
    const r = result([fld({ key: 'dob', normalizedValue: '1990-01-01' })])
    expect(getValueByAliases(r, 'date_of_birth')).toMatchObject({ value: '1990-01-01', matchedKey: 'dob' })
  })
  it('a C3-rejected alias is skipped (no resurrection)', () => {
    const r = result([fld({ key: 'dob', finalValue: null, normalizedValue: '1990-01-01' })])
    expect(getValueByAliases(r, 'date_of_birth').value).toBeNull()
  })
})

describe('applyCanonicalFieldMap — dumb engine', () => {
  it('maps by key/alias, honors sourceGate, never transforms', () => {
    const r = result([
      fld({ key: 'family_name', finalValue: 'IVANENKO' }),
      fld({ key: 'a_number', normalizedValue: 'A123', reviewRequired: true }),
    ])
    const out = applyCanonicalFieldMap(r, [
      { out: 'lastName', canonicalKey: 'family_name' },
      { out: 'alienNumber', canonicalKey: 'a_number' },
      { out: 'gatedOut', canonicalKey: 'family_name', sourceGate: (dt) => dt === 'us_ead' }, // gate closed
    ])
    expect(out.values).toEqual({ lastName: 'IVANENKO', alienNumber: 'A123' })
    expect(out.values.gatedOut).toBeUndefined()
    expect(out.reviewFields).toContain('alienNumber')
  })
})

describe('buildCanonicalResult', () => {
  it('derives requiresReview and leaves fields untouched', () => {
    const fields = [fld({ key: 'x', reviewRequired: true })]
    const r = buildCanonicalResult({ documentSessionId: 's', product: 'translation', docType: 'd', fields, createdAt: 't' })
    expect(r.requiresReview).toBe(true)
    expect(r.fields).toBe(fields)
    expect(getValueByKey(r, 'x')).toBeNull()
  })
})
