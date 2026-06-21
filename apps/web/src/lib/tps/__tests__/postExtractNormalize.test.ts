import { describe, expect, it } from 'vitest'
import { postExtractNormalize } from '../ocr/postExtractNormalize'
import type { TpsExtractedField } from '../types'

function mkField(field: string, raw: string, normalized: string): TpsExtractedField {
  return {
    field,
    raw_value: raw,
    normalized_value: normalized,
    extraction_source: 'ocr_visual',
    source_document_id: 'booklet_page_1',
    source_zone: 'visual_birthplace',
    bbox: null,
    language_layer: 'mixed',
    confidence: 0.92,
    review_required: false,
    ocr_word_ids: [],
    passes: [],
    failures: [],
    user_corrected: false,
  }
}

describe('postExtractNormalize', () => {
  it('normalizes broken city prefix from booklet into canonical city value', () => {
    const input = [mkField('city_of_birth', 'слет . Вінниця', 'слет . Вінниця')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toEqual([])
    expect(result.fields[0].normalized_value).toBeTruthy()
    expect(result.fields[0].normalized_value?.toLowerCase()).not.toContain('слет')
    expect(result.diagnostics[0]?.status).toBe('normalized')
  })

  it('normalizes latin oblast alias to canonical english oblast', () => {
    const input = [mkField('province_of_birth', 'VINNYTSKA OBL.', 'VINNYTSKA OBL.')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toEqual([])
    expect(result.fields[0].normalized_value).toBe('Vinnytsia Oblast')
  })

  it('rejects label-noise city values and marks manual_required diagnostic', () => {
    const input = [mkField('city_of_birth', 'место рождения', 'место рождения')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toContain('city_of_birth')
    expect(result.fields[0].normalized_value).toBeNull()
    expect(result.fields[0].review_required).toBe(true)
    expect(result.diagnostics[0]?.status).toBe('rejected')
    expect(result.diagnostics[0]?.manual_required).toBe(true)
  })

  // ── BOOKLET GARBAGE-REJECTION GUARD TESTS ──────────────────────────────
  it('rejects mixed-case garbage city "BiRHEROI odwaemi"', () => {
    const input = [mkField('city_of_birth', 'BiRHEROI odwaemi', 'BiRHEROI odwaemi')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toContain('city_of_birth')
    expect(result.fields[0].normalized_value).toBeNull()
    expect(result.fields[0].review_required).toBe(true)
  })

  it('rejects single mixed-case garbage word "BiRHEROI"', () => {
    const input = [mkField('city_of_birth', 'BiRHEROI', 'BiRHEROI')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toContain('city_of_birth')
  })

  it('rejects Cyrillic oblast abbreviation in city "ВІННИЦЬКА ОБЛ."', () => {
    const input = [mkField('city_of_birth', 'ВІННИЦЬКА ОБЛ.', 'VINNYTSKA OBL.')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toContain('city_of_birth')
  })

  it('passes valid Latin city "Vinnytsia"', () => {
    const input = [mkField('city_of_birth', 'Вінниця', 'Vinnytsia')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).not.toContain('city_of_birth')
    expect(result.fields[0].normalized_value).toBe('Vinnytsia')
  })

  it('passes valid Cyrillic city "Київ"', () => {
    const input = [mkField('city_of_birth', 'Київ', 'Київ')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).not.toContain('city_of_birth')
  })

  it('passes valid two-word city "Bila Tserkva"', () => {
    const input = [mkField('city_of_birth', 'Біла Церква', 'Bila Tserkva')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).not.toContain('city_of_birth')
  })

  it('rejects english settlement descriptor "Prostianets settlement"', () => {
    const input = [mkField('city_of_birth', 'Prostianets settlement', 'Prostianets settlement')]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toContain('city_of_birth')
    expect(result.fields[0].normalized_value).toBeNull()
    expect(result.diagnostics[0]?.reason).toBe('contains_settlement_descriptor')
  })

  it('does not affect strong MRZ fields when booklet garbage is rejected', () => {
    const input = [
      mkField('family_name', 'Ivanenko', 'Ivanenko'),
      mkField('city_of_birth', 'BiRHEROI', 'BiRHEROI'),
    ]
    const result = postExtractNormalize(input)
    expect(result.rejected_fields).toContain('city_of_birth')
    expect(result.rejected_fields).not.toContain('family_name')
  })
})
