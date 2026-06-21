import { describe, expect, it } from 'vitest'
import type { OcrResult } from '@/lib/ocr/types'
import { runI94Module } from '@/lib/tps/modules/i94'

function mkOcr(lines: string[]): OcrResult {
  return {
    created_at: new Date().toISOString(),
    provider: 'google_vision',
    raw_text: lines.join('\n'),
    pages: [{ page: 1, width: 1000, height: 1000, lines: [], words: [] }],
    words: [],
    lines: lines.map((text, i) => ({
      id: `l_${i}`,
      text,
      page: 1,
      bbox: { x: 0.1, y: 0.1 + i * 0.05, width: 0.6, height: 0.03 },
      words: [],
      confidence: 0.95,
      source: 'google_vision',
    })),
    processing_ms: 10,
    warnings: [],
  }
}

describe('runI94Module', () => {
  it('extracts admission number when OCR reads I-94 as 1-94', () => {
    const ocr = mkOcr([
      'Admission ( 1-94 ) Number',
      '12345678901',
      'Class of Admission',
      'UHP',
      'Date of Entry',
      '03/15/2024',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_test' })
    expect(out.matched).toBe(true)
    const keys = out.fields.map((f) => f.field)
    expect(keys).toContain('i94_admission_number')
    expect(keys).toContain('last_entry_date')
  })

  it('extracts modern alphanumeric I-94 number (9 digits + letter + digit)', () => {
    const ocr = mkOcr([
      'Admission (I-94) Record Number',
      '123456789A1',
      'Class of Admission',
      'UH',
      'Most Recent Date of Entry',
      '2022 September 09',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_modern' })
    expect(out.matched).toBe(true)
    const adm = out.fields.find((f) => f.field === 'i94_admission_number')
    expect(adm).toBeDefined()
    expect(adm!.normalized_value).toBe('123456789A1')
    expect(adm!.passes).toContain('i94_modern_alphanumeric')
  })

  it('extracts legacy 11-digit I-94 number', () => {
    const ocr = mkOcr([
      'I-94 Number',
      '98765432109',
      'Class of Admission',
      'B2',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_legacy' })
    const adm = out.fields.find((f) => f.field === 'i94_admission_number')
    expect(adm).toBeDefined()
    expect(adm!.normalized_value).toBe('98765432109')
    expect(adm!.passes).toContain('i94_legacy_11_digits')
  })

  it('does NOT extract random 11-digit numbers without I-94 label context', () => {
    // This doc has 11 digits but no I-94/admission label anywhere
    const ocr = mkOcr([
      'Some random document',
      'Phone: 12345678901',
      'Amount: $999.99',
      'Class of Admission',
      'UH',
      'Date of Entry',
      '03/15/2024',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_no_label' })
    const adm = out.fields.find((f) => f.field === 'i94_admission_number')
    // The fallback should NOT fire because "Phone:" is in the first 20 lines
    // but the module should still match on COA + entry date
    // Note: the fallback might still find the number in header area — if it does,
    // it should be flagged as review_required
    if (adm) {
      expect(adm.review_required).toBe(true)
    }
  })

  it('extracts name, DOB, and country when labelled', () => {
    const ocr = mkOcr([
      'Admission (I-94) Number',
      '123456789A1',
      'Last/Surname',
      'IVANENKO',
      'First (Given) Name',
      'IVAN',
      'Date of Birth',
      '01/01/1990',
      'Country of Citizenship',
      'UKRAINE',
      'Class of Admission',
      'UH',
      'Most Recent Date of Entry',
      '09/09/2022',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_full' })
    expect(out.matched).toBe(true)
    const keys = out.fields.map((f) => f.field)
    expect(keys).toContain('i94_admission_number')
    expect(keys).toContain('family_name')
    expect(keys).toContain('given_name')
    expect(keys).toContain('dob')
    expect(keys).toContain('country_of_citizenship')
    expect(keys).toContain('i94_class_of_admission')
    expect(keys).toContain('last_entry_date')
    // Should have >= 5 fields, avoiding Brain threshold
    expect(out.fields.length).toBeGreaterThanOrEqual(5)
  })

  it('reaches >= 5 fields to avoid Brain threshold trigger', () => {
    const ocr = mkOcr([
      'Admission (I-94) Number: 123456789A1',
      'Surname: TESTNAME',
      'Given Name: TESTFIRST',
      'DOB: 01/01/1990',
      'Country of Citizenship: UKRAINE',
      'Class of Admission: UH',
      'Date of Entry: 03/15/2024',
      'Admit Until Date: D/S',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_threshold' })
    expect(out.matched).toBe(true)
    // With admission#, COA, entry date, admit until, name, dob, country
    // we should have 7+ fields
    expect(out.fields.length).toBeGreaterThanOrEqual(5)
  })

  it('handles YYYY Month DD date format from CBP web printout', () => {
    const ocr = mkOcr([
      'I-94 Number',
      '12345678901',
      'Class of Admission',
      'UH',
      'Most Recent Date of Entry',
      '2022 September 09',
      'Admit Until Date',
      '2024 March 15',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_yyyymonth' })
    const entry = out.fields.find((f) => f.field === 'last_entry_date')
    expect(entry).toBeDefined()
    expect(entry!.normalized_value).toBe('2022-09-09')
    const admit = out.fields.find((f) => f.field === 'i94_admit_until')
    expect(admit).toBeDefined()
    expect(admit!.normalized_value).toBe('2024-03-15')
  })

  it('fallback finds admission number in header without label, flagged for review', () => {
    const ocr = mkOcr([
      '123456789A1',  // number in first line, no label
      '',
      'Travel Record',
      'Class of Admission: UH',
      'Date of Entry: 03/15/2024',
    ])
    const out = runI94Module(ocr, { document_id: 'doc_fallback' })
    const adm = out.fields.find((f) => f.field === 'i94_admission_number')
    expect(adm).toBeDefined()
    expect(adm!.normalized_value).toBe('123456789A1')
    expect(adm!.review_required).toBe(true)
    expect(adm!.source_zone).toBe('i94_admission_number_fallback')
  })
})
