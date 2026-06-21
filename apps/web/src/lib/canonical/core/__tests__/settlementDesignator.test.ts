/**
 * settlementDesignator.test.ts — «смт» preservation through the LIVE translation
 * door (owner live bug 2026-06-11: «смт. Муровані Курилівці» rendered as bare
 * "Murovani Kurylivtsi"). The designator is SOURCE-driven: comes only from the
 * raw Cyrillic, never inferred, never modernized. Suffix form = the convention
 * already test-locked in packages/knowledge and the TPS extractor.
 */
import { describe, it, expect } from 'vitest'
import { settlementDesignatorEn } from '@uscis-helper/knowledge'
import { canonicalToFieldOut } from '../translationAdapter'
import type { CanonicalField } from '../../types'

describe('settlementDesignatorEn (knowledge)', () => {
  it('смт variants → urban-type settlement (NEVER city/town)', () => {
    for (const raw of ['смт. Муровані Курилівці', 'смт Муровані Курилівці', 'селище міського типу Іванівка', 'пгт. Іванівка']) {
      expect(settlementDesignatorEn(raw), raw).toBe('urban-type settlement')
    }
  })
  it('село/с. → village; селище → settlement; хутір → khutor', () => {
    expect(settlementDesignatorEn('с. Іванівка')).toBe('village')
    expect(settlementDesignatorEn('село Іванівка')).toBe('village')
    expect(settlementDesignatorEn('селище Іванівка')).toBe('settlement')
    expect(settlementDesignatorEn('хутір Зелений')).toBe('khutor')
  })
  it('м./місто → null (cities stay bare); no prefix → null; с. without capital → null', () => {
    expect(settlementDesignatorEn('м. Київ')).toBeNull()
    expect(settlementDesignatorEn('Вінниця')).toBeNull()
    expect(settlementDesignatorEn('с. м. т')).toBeNull()
    expect(settlementDesignatorEn(null)).toBeNull()
  })
})

const base: CanonicalField = {
  key: 'city_of_birth', rawValue: 'Murovani Kurylivtsi', normalizedValue: 'Murovani Kurylivtsi',
  rawCyrillic: 'смт. Муровані Курилівці', source: 'ai_vision',
  confidence: { final: 0.9 }, reviewRequired: true, reviewReasons: [],
} as unknown as CanonicalField

describe('canonicalToFieldOut — designator re-add (translation door)', () => {
  it('prefixes urban-type settlement from the raw Cyrillic (mirrors «смт Х»)', () => {
    const out = canonicalToFieldOut(base)
    expect(out.value).toBe('urban-type settlement Murovani Kurylivtsi')
  })
  it('no prefix in raw → value unchanged', () => {
    const out = canonicalToFieldOut({ ...base, rawCyrillic: 'Муровані Курилівці' } as CanonicalField)
    expect(out.value).toBe('Murovani Kurylivtsi')
  })
  it('no double-add when the value already carries the designator', () => {
    const out = canonicalToFieldOut({ ...base, normalizedValue: 'urban-type settlement Murovani Kurylivtsi' } as CanonicalField)
    expect(out.value).toBe('urban-type settlement Murovani Kurylivtsi')
  })
  it('non-place keys are untouched even with a prefixed raw', () => {
    const out = canonicalToFieldOut({ ...base, key: 'family_name', normalizedValue: 'Ivanenko', rawCyrillic: 'смт. Іваненко' } as CanonicalField)
    expect(out.value).toBe('Ivanenko')
  })
  it('null value never gets a designator invented', () => {
    const out = canonicalToFieldOut({ ...base, normalizedValue: null, rawValue: null } as unknown as CanonicalField)
    expect(out.value).toBeNull()
  })
})
