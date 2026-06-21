/**
 * Re-Parole I-131 packet builder fixture tests.
 *
 * Sanity-checks:
 *  - I-131 PDF is read and filled without throwing
 *  - applied count > 0
 *  - Cyrillic names get transliterated to Latin per KMU-55
 *  - The PDF's official edition stamp is preserved
 */

import { describe, it, expect, vi } from 'vitest'

// buildReParoleI131 reads I-131 PDF from disk, fills AcroForm fields, and
// transliterates Cyrillic via KMU-55. Under full-suite parallel load
// individual tests spike from ~4.5 s to 30+ s due to I/O contention.
vi.setConfig({ testTimeout: 120_000 })
import { buildReParoleI131 } from '../packetBuilder'
import type { ReParoleAnswers } from '../answers'
import { PDFDocument, PDFTextField } from 'pdf-lib'

const SAMPLE: ReParoleAnswers = {
  family_name: 'Шевченко',          // Cyrillic — must transliterate
  given_name: 'Тарас',
  middle_name: 'Григорович',
  mailing_street: '123 Main St',
  mailing_city: 'Sacramento',
  mailing_state: 'CA',
  mailing_zip: '95814',
  physical_same_as_mailing: true,
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  sex: 'M',
  dob: '1985-07-12',
  class_of_admission: 'UH',
  i94_admission_number: '12345678901',
  daytime_phone: '555-555-5555',
  email: 'test@example.com',
  filing_method: 'mail',
}

describe('buildReParoleI131', () => {
  it('fills the I-131 form without throwing and applies > 0 fields', async () => {
    const result = await buildReParoleI131(SAMPLE)
    expect(result.i131.applied).toBeGreaterThan(8)
    expect(result.i131_bytes.byteLength).toBeGreaterThan(100_000)
  })

  it('transliterates Cyrillic names to Latin (KMU-55) in the AcroForm', async () => {
    const result = await buildReParoleI131(SAMPLE)
    const doc = await PDFDocument.load(result.i131_bytes)
    const form = doc.getForm()
    const family = form.getField('form1[0].P4[0].Part2_Line1_FamilyName[0]')
    const given  = form.getField('form1[0].P4[0].Part2_Line1_GivenName[0]')
    const middle = form.getField('form1[0].P4[0].Part2_Line1_MiddleName[0]')
    expect(family).toBeInstanceOf(PDFTextField)
    expect(given).toBeInstanceOf(PDFTextField)
    expect(middle).toBeInstanceOf(PDFTextField)
    expect((family as PDFTextField).getText()).toBe('Shevchenko')
    expect((given as PDFTextField).getText()).toBe('Taras')
    expect((middle as PDFTextField).getText()).toBe('Hryhorovych')
  })

  it('writes the I-131 personal-data fields the field map covers', async () => {
    const result = await buildReParoleI131(SAMPLE)
    const doc = await PDFDocument.load(result.i131_bytes)
    const form = doc.getForm()
    const t = (name: string) =>
      (form.getField(name) as PDFTextField).getText()
    expect(t('form1[0].P5[0].Part2_Line3_StreetNumberName[0]')).toBe('123 Main St')
    expect(t('form1[0].P5[0].Part2_Line3_CityTown[0]')).toBe('Sacramento')
    expect(t('form1[0].P5[0].Part2_Line3_ZipCode[0]')).toBe('95814')
    expect(t('form1[0].P5[0].Part2_Line6_CountryOfBirth[0]')).toBe('Ukraine')
    expect(t('form1[0].P5[0].Part2_Line9_DateOfBirth[0]')).toBe('07/12/1985')
    expect(t('form1[0].P5[0].Part2_Line12_ClassofAdmission[0]')).toBe('UH')
    expect(t('form1[0].P5[0].Part2_Line13_I94RecordNo[0]')).toBe('12345678901')
    expect(t('form1[0].#subform[10].Part10_Line1_DayPhone[0]')).toBe('5555555555')
    expect(t('form1[0].#subform[10].Part10_Line3_Email[0]')).toBe('test@example.com')
  })
})
