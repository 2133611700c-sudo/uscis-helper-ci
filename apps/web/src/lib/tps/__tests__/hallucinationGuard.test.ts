import { describe, it, expect } from 'vitest'
import {
  detectGarbageString,
  checkGeography,
  crossDocumentConflict,
  guardField,
} from '../hallucinationGuard'
import type { SlottedField } from '../sourcePriority'

function sf(field: string, value: string): SlottedField {
  return {
    field,
    value,
    slot: 'passport',
    extraction_source: 'ai_brain',
    confidence: 0.7,
  }
}

describe('hallucinationGuard.detectGarbageString', () => {
  it('blocks a label-as-value for name field', () => {
    const r = detectGarbageString('family_name', 'surname')
    expect(r.should_block).toBe(true)
    expect(r.risk).toBe('high')
  })

  it('passes a plausible name', () => {
    const r = detectGarbageString('family_name', 'Kovalenko')
    expect(r.should_block).toBe(false)
  })

  it('blocks mixed-script lookalike in name field', () => {
    // "B" is Latin lookalike for Cyrillic "В" in "BiRHEROI"
    const r = detectGarbageString('family_name', 'BiRHEROI')
    expect(r.risk).toBe('high')
    expect(r.should_block).toBe(true)
  })

  it('passes a known-good Latin name', () => {
    const r = detectGarbageString('family_name', 'Ivanenko')
    expect(r.risk).toBe('none')
    expect(r.should_block).toBe(false)
  })

  it('passes non-name fields without name plausibility check', () => {
    // a_number is not a STRONG_IDENTITY name field
    const r = detectGarbageString('a_number', '123456789')
    expect(r.should_block).toBe(false)
  })
})

describe('hallucinationGuard.checkGeography', () => {
  it('accepts a known Ukrainian oblast — nominative full form', () => {
    const r = checkGeography('province_of_birth', 'Вінницька область')
    expect(r.should_block).toBe(false)
    expect(r.risk).toBe('none') // regression: was incorrectly 'high' before oblast regex fix
  })

  it('accepts a known Ukrainian oblast — genitive full form', () => {
    const r = checkGeography('province_of_birth', 'Вінницької області')
    expect(r.should_block).toBe(false)
    expect(r.risk).toBe('none')
  })

  it('accepts a known Ukrainian oblast — abbreviated nominative', () => {
    const r = checkGeography('province_of_birth', 'Вінницька обл.')
    expect(r.should_block).toBe(false)
    expect(r.risk).toBe('none')
  })

  it('accepts a different oblast — Kharkiv', () => {
    const r = checkGeography('province_of_birth', 'Харківська область')
    expect(r.should_block).toBe(false)
    expect(r.risk).toBe('none')
  })

  it('flags an unknown province with low/none risk (foreign possible)', () => {
    const r = checkGeography('province_of_birth', 'SomewhereUnknown')
    expect(r.should_block).toBe(false) // foreign, not blocked
    expect(r.risk).toBe('high') // but flagged
  })

  it('blocks city containing oblast descriptor', () => {
    const r = checkGeography('city_of_birth', 'Vinnytsia Oblast settlement')
    expect(r.should_block).toBe(true)
  })

  it('passes a clean city name', () => {
    const r = checkGeography('city_of_birth', 'Vinnytsia')
    expect(r.should_block).toBe(false)
    expect(r.risk).toBe('none')
  })
})

describe('hallucinationGuard.crossDocumentConflict', () => {
  it('returns none for identical values', () => {
    const r = crossDocumentConflict('family_name', 'Kovalenko', 'Kovalenko')
    expect(r.risk).toBe('none')
  })

  it('returns risk=low for distance <= 2 (OCR transcription)', () => {
    // Kovalenko vs Kovalenk0 — distance 1 (0 vs o)
    const r = crossDocumentConflict('family_name', 'Kovalenko', 'Kovalenk0')
    expect(r.risk).toBe('low')
    expect(r.should_block).toBe(false)
  })

  it('returns risk=high for large distance (real conflict)', () => {
    const r = crossDocumentConflict('given_name', 'Ivan', 'Saghi')
    expect(r.risk).toBe('high')
    expect(r.should_block).toBe(true)
  })
})

describe('hallucinationGuard.guardField', () => {
  it('passes a clean name field', () => {
    const r = guardField(sf('family_name', 'Ivanenko'))
    expect(r.should_block).toBe(false)
    expect(r.risk).toBe('none')
  })

  it('blocks a label-as-value name', () => {
    const r = guardField(sf('family_name', 'name'))
    expect(r.should_block).toBe(true)
  })

  it('blocks city with oblast descriptor', () => {
    const r = guardField({ ...sf('city_of_birth', 'Vinnytsia Oblast'), slot: 'booklet' })
    expect(r.should_block).toBe(true)
  })
})
