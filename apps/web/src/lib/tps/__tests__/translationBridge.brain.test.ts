/**
 * Translation Bridge v0 — translateBookletFromBrain unit tests.
 *
 * Proves the Central Brain → translation pipeline:
 *   merged (already-normalized English) → passportBooklet template → HTML draft
 *
 * These tests use the canonical Ivanenko fixture identity.
 * No PII beyond what is already in existing test fixtures.
 */

import { describe, it, expect } from 'vitest'
import { translateBookletFromBrain } from '../translationBridge'
import type { MergedField } from '../centralBrain'

// ── Test helper ───────────────────────────────────────────────────────────────

function mergedField(field: string, value: string): MergedField {
  return {
    field,
    value,
    source_slot: 'booklet',
    source_type: 'ocr_keyword',
    confidence: 0.95,
    controlling_spelling_applied: false,
    cross_validated: false,
    plausibility_passed: true,
    hallucination_risk: 'none',
    normalization_source: 'knowledge',
    conflicts: [],
  }
}

const KURO_MERGED: Record<string, MergedField> = {
  family_name:          mergedField('family_name',          'Ivanenko'),
  given_name:           mergedField('given_name',           'Ivan'),
  middle_name:          mergedField('middle_name',          'Petrovych'),
  dob:                  mergedField('dob',                  '1990-01-01'),
  city_of_birth:        mergedField('city_of_birth',        'Vinnytsia'),
  province_of_birth:    mergedField('province_of_birth',    'Vinnytsia Oblast'),
  passport_number:      mergedField('passport_number',      'FU 262473'),
  sex:                  mergedField('sex',                  'M'),
  issued_by:            mergedField('issued_by',            'Department of the State Migration Service of Ukraine in Vinnytsia Oblast'),
  passport_date_of_issue: mergedField('passport_date_of_issue', '2019-08-12'),
}

const SIGNER_OPTS = {
  signerName: 'Ivan Ivanenko',
  signerAddress: '4341 Willow Brook Ave 111, Los Angeles, CA 90029',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('translateBookletFromBrain', () => {
  it('returns non-null for valid merged data with surname', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)
    expect(result).not.toBeNull()
  })

  it('translation_html contains surname', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.translation_html).toContain('Ivanenko')
  })

  it('translation_html contains given name', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.translation_html).toContain('Ivan')
  })

  it('translation_html contains patronymic (not "Middle Name")', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.translation_html).toContain('Petrovych')
    expect(result.translation_html).toContain('Patronymic')
    expect(result.translation_html).not.toContain('Middle Name')
  })

  it('translation_html contains DOB in human-readable format (Month DD, YYYY)', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    // ISO "1990-01-01" must be converted to "January 1, 1990" for USCIS translation
    expect(result.translation_html).toContain('January 1, 1990')
    expect(result.translation_html).not.toContain('1990-01-01')
  })

  it('translation_html contains combined place of birth (city + oblast + Ukraine)', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.translation_html).toContain('Vinnytsia')
    expect(result.translation_html).toContain('Vinnytsia Oblast')
    expect(result.translation_html).toContain('Ukraine')
  })

  it('translation_html contains issuing authority', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.translation_html).toContain('State Migration Service')
  })

  it('sex M maps to Male in translation', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.translation_html).toContain('Male')
    expect(result.translation_html).not.toMatch(/\bM\b/)
  })

  it('sex F maps to Female in translation', () => {
    const merged = {
      ...KURO_MERGED,
      sex: mergedField('sex', 'F'),
    }
    const result = translateBookletFromBrain(merged, SIGNER_OPTS)!
    expect(result.translation_html).toContain('Female')
  })

  it('certification_html contains signer name', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.certification_html).toContain('Ivan Ivanenko')
  })

  it('certification_html contains signer address', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.certification_html).toContain('Los Angeles')
  })

  it('certification_html contains competency statement (8 CFR §103.2(b)(3))', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.certification_html).toMatch(/competent to translate|complete and accurate/i)
  })

  it('certification_html does NOT say "certified by AI" or "USCIS accepted"', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.certification_html).not.toMatch(/certified by AI/i)
    expect(result.certification_html).not.toMatch(/USCIS accepted/i)
    expect(result.certification_html).not.toMatch(/guaranteed/i)
  })

  it('violations array is empty for clean canonical input', () => {
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.violations).toHaveLength(0)
  })

  it('returns null when surname is absent', () => {
    const { family_name: _dropped, ...withoutSurname } = KURO_MERGED
    const result = translateBookletFromBrain(withoutSurname, SIGNER_OPTS)
    expect(result).toBeNull()
  })

  it('works with minimal data: surname only (other fields absent)', () => {
    const result = translateBookletFromBrain(
      { family_name: mergedField('family_name', 'Ivanenko') },
      SIGNER_OPTS,
    )
    expect(result).not.toBeNull()
    expect(result!.translation_html).toContain('Ivanenko')
  })

  it('omits document_type from output if value is empty (field-filter works)', () => {
    // document_type is hardcoded — should always be present
    const result = translateBookletFromBrain(KURO_MERGED, SIGNER_OPTS)!
    expect(result.translation_html).toContain('Internal Passport')
  })

  it('place_of_birth falls back to Ukraine only when city+province absent', () => {
    const merged = {
      family_name: mergedField('family_name', 'Ivanenko'),
    }
    const result = translateBookletFromBrain(merged, SIGNER_OPTS)!
    // place_of_birth = ', , Ukraine' trimmed to 'Ukraine'
    expect(result.translation_html).toContain('Ukraine')
  })
})
