/**
 * translationExtractor.ts unit tests.
 *
 * Verifies:
 * 1. formatDobForTranslation handles all supported input formats
 * 2. extractTranslationFields correctly prioritizes cb_merged → cb_rejected → manual
 * 3. Sex normalization (M→Male, Ж→Female, etc.)
 * 4. Fields blocked by CB form contract flow via cb_rejected path
 */

import { describe, it, expect } from 'vitest'
import { formatDobForTranslation, extractTranslationFields } from '../translationExtractor'
import type { MergedField, RejectedField } from '../centralBrain'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mf(field: string, value: string, raw_value?: string): MergedField {
  return {
    field, value, raw_value,
    source_slot: 'booklet', source_type: 'ocr_keyword',
    confidence: 0.9,
    controlling_spelling_applied: false, cross_validated: false,
    plausibility_passed: true, hallucination_risk: 'none',
    normalization_source: 'knowledge', conflicts: [],
  }
}

function rf(field: string, raw_value: string, slot: 'booklet' | 'passport' = 'booklet'): RejectedField {
  return { field, slot, raw_value, reason: 'FIELD_NOT_ALLOWED_FOR_DOCUMENT_SLOT' }
}

// ── formatDobForTranslation ───────────────────────────────────────────────────

describe('formatDobForTranslation', () => {
  it('converts ISO YYYY-MM-DD to Month DD, YYYY', () => {
    expect(formatDobForTranslation('1990-01-01')).toBe('January 1, 1990')
  })

  it('converts US format MM/DD/YYYY (wizard state)', () => {
    expect(formatDobForTranslation('01/01/1990')).toBe('January 1, 1990')
  })

  it('converts dot format DD.MM.YYYY (OCR document)', () => {
    expect(formatDobForTranslation('01.01.1990')).toBe('January 1, 1990')
  })

  it('passes through already-formatted "Month DD, YYYY"', () => {
    expect(formatDobForTranslation('January 1, 1990')).toBe('January 1, 1990')
  })

  it('handles single-digit day', () => {
    expect(formatDobForTranslation('1990-01-07')).toBe('January 7, 1990')
  })

  it('returns null for empty string', () => {
    expect(formatDobForTranslation('')).toBeNull()
  })

  it('returns null for unparseable string', () => {
    expect(formatDobForTranslation('not-a-date')).toBeNull()
  })

  it('handles all 12 months correctly via ISO format', () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    months.forEach((month, i) => {
      const mm = String(i + 1).padStart(2, '0')
      expect(formatDobForTranslation(`2000-${mm}-15`)).toBe(`${month} 15, 2000`)
    })
  })
})

// ── extractTranslationFields ──────────────────────────────────────────────────

describe('extractTranslationFields', () => {
  const baseMerged: Record<string, MergedField> = {
    family_name:       mf('family_name',       'Ivanenko'),
    middle_name:       mf('middle_name',        'Petrovych'),
    dob:               mf('dob',               '1990-01-01'),
    city_of_birth:     mf('city_of_birth',     'Vinnytsia'),
    province_of_birth: mf('province_of_birth', 'Vinnytsia Oblast'),
  }

  it('extracts family_name and patronymic from cb_merged', () => {
    const result = extractTranslationFields(baseMerged, [], {})
    expect(result.family_name).toBe('Ivanenko')
    expect(result.patronymic).toBe('Petrovych')
    expect(result._sources.family_name).toBe('cb_merged')
    expect(result._sources.middle_name).toBe('cb_merged')
  })

  it('formats DOB from ISO to Month DD, YYYY', () => {
    const result = extractTranslationFields(baseMerged, [], {})
    expect(result.date_of_birth).toBe('January 1, 1990')
  })

  it('picks up given_name from cb_rejected when not in merged (booklet contract blocks it)', () => {
    const rejected = [rf('given_name', 'Ivan')]
    const result = extractTranslationFields(baseMerged, rejected, {})
    expect(result.given_name).toBe('Ivan')
    expect(result._sources.given_name).toBe('cb_rejected')
  })

  it('picks up sex from cb_rejected when not in merged', () => {
    const rejected = [rf('sex', 'M')]
    const result = extractTranslationFields(baseMerged, rejected, {})
    expect(result.sex).toBe('Male')
    expect(result._sources.sex).toBe('cb_rejected')
  })

  it('picks up passport_number from cb_rejected when not in merged', () => {
    const rejected = [rf('passport_number', 'FU 262473')]
    const result = extractTranslationFields(baseMerged, rejected, {})
    expect(result.passport_number).toBe('FU 262473')
    expect(result._sources.passport_number).toBe('cb_rejected')
  })

  it('falls back to manual when field absent from both merged and rejected', () => {
    const result = extractTranslationFields(baseMerged, [], { given_name: 'Ivan_Manual' })
    expect(result.given_name).toBe('Ivan_Manual')
    expect(result._sources.given_name).toBe('manual')
  })

  it('cb_merged beats cb_rejected beats manual (priority order)', () => {
    const mergedWithGiven = { ...baseMerged, given_name: mf('given_name', 'From_Merged') }
    const rejected = [rf('given_name', 'From_Rejected')]
    const manual = { given_name: 'From_Manual' }
    const result = extractTranslationFields(mergedWithGiven, rejected, manual)
    expect(result.given_name).toBe('From_Merged')
    expect(result._sources.given_name).toBe('cb_merged')
  })

  it('ignores rejected fields from non-booklet slots', () => {
    const rejected = [rf('given_name', 'From_Passport_Slot', 'passport')]
    const result = extractTranslationFields(baseMerged, rejected, {})
    // passport slot rejection not used for translation extractor (booklet only)
    expect(result.given_name).toBeNull()
  })

  it('normalizes sex M → Male', () => {
    const merged = { ...baseMerged, sex: mf('sex', 'M') }
    const result = extractTranslationFields(merged, [], {})
    expect(result.sex).toBe('Male')
  })

  it('normalizes sex F → Female', () => {
    const merged = { ...baseMerged, sex: mf('sex', 'F') }
    const result = extractTranslationFields(merged, [], {})
    expect(result.sex).toBe('Female')
  })

  it('normalizes Cyrillic sex Ж → Female', () => {
    const rejected = [rf('sex', 'Ж')]
    const result = extractTranslationFields(baseMerged, rejected, {})
    expect(result.sex).toBe('Female')
  })

  it('returns null for absent fields', () => {
    const result = extractTranslationFields({}, [], {})
    expect(result.family_name).toBeNull()
    expect(result.given_name).toBeNull()
    expect(result.passport_number).toBeNull()
    expect(result.issued_by).toBeNull()
  })

  it('formats date_of_issue from ISO', () => {
    const merged = { ...baseMerged, passport_date_of_issue: mf('passport_date_of_issue', '2019-08-12') }
    const result = extractTranslationFields(merged, [], {})
    expect(result.date_of_issue).toBe('August 12, 2019')
  })

  // ── Settlement type expansion (смт → "urban-type settlement") ─────────────
  it('expands смт prefix to "urban-type settlement" in city_of_birth', () => {
    const merged = {
      ...baseMerged,
      city_of_birth: mf('city_of_birth', 'Vinnytsia', 'смт Вінниця'),
    }
    const result = extractTranslationFields(merged, [], {})
    expect(result.city_of_birth).toBe('Vinnytsia urban-type settlement')
  })

  it('expands смт. prefix (with dot) to "urban-type settlement"', () => {
    const merged = {
      ...baseMerged,
      city_of_birth: mf('city_of_birth', 'Ustynivka', 'смт. Устинівка'),
    }
    const result = extractTranslationFields(merged, [], {})
    expect(result.city_of_birth).toBe('Ustynivka urban-type settlement')
  })

  it('expands пгт prefix to "urban-type settlement"', () => {
    const merged = {
      ...baseMerged,
      city_of_birth: mf('city_of_birth', 'Vilshanka', 'пгт Вільшанка'),
    }
    const result = extractTranslationFields(merged, [], {})
    expect(result.city_of_birth).toBe('Vilshanka urban-type settlement')
  })

  it('expands с. prefix to "village"', () => {
    const merged = {
      ...baseMerged,
      city_of_birth: mf('city_of_birth', 'Ivanivka', 'с. Іванівка'),
    }
    const result = extractTranslationFields(merged, [], {})
    expect(result.city_of_birth).toBe('Ivanivka village')
  })

  it('leaves city unchanged when raw_value has no settlement prefix (city)', () => {
    const merged = {
      ...baseMerged,
      city_of_birth: mf('city_of_birth', 'Kyiv', 'м. Київ'),
    }
    const result = extractTranslationFields(merged, [], {})
    // м. = city — no suffix appended per map
    expect(result.city_of_birth).toBe('Kyiv')
  })

  it('leaves city unchanged when no raw_value stored', () => {
    const result = extractTranslationFields(baseMerged, [], {})
    expect(result.city_of_birth).toBe('Vinnytsia')
  })
})
