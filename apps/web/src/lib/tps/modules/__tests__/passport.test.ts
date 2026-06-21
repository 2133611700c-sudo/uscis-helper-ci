/**
 * Passport module fixture tests.
 *
 * No real PII. Uses synthetic MRZ strings — these are NOT real passports.
 * The MRZ format is public (ICAO 9303); the content here is generated to
 * pass check digits without resembling any real person.
 */

import { describe, it, expect } from 'vitest'
import { runPassportModule } from '../passport'
import { computeCheckDigit } from '@/lib/translation/identity/mrzParser'
import type { OcrResult, OcrLine } from '@/lib/ocr/types'

/**
 * Build a fake OcrResult with two MRZ lines positioned at the bottom of
 * the document.
 */
function makeOcrFromMrz(line1: string, line2: string): OcrResult {
  const mk = (id: string, text: string, y: number): OcrLine => ({
    id,
    text,
    page: 1,
    bbox: { x: 0.05, y, width: 0.9, height: 0.04 },
    words: [],
    confidence: 0.95,
    source: 'google_vision',
  })
  const l1 = mk('l_0098', line1, 0.85)
  const l2 = mk('l_0099', line2, 0.90)
  return {
    provider: 'google_vision',
    raw_text: `${line1}\n${line2}`,
    pages: [
      { page: 1, width: 1000, height: 700, lines: [l1, l2], words: [] },
    ],
    lines: [l1, l2],
    words: [],
    processing_ms: 1000,
    warnings: [],
    created_at: new Date().toISOString(),
  }
}

/**
 * Build a synthetic TD3 MRZ that passes all check digits.
 * Output: { line1, line2 } each exactly 44 characters.
 *
 *   docNumber = 'AB1234567' (9 chars), dob = 850712 (1985-07-12),
 *   sex = 'M', expiry = 320630 (2032-06-30), nationality = 'UKR',
 *   personalNumber = '0000000000000<' (14 chars total inc. check)
 */
function buildSyntheticTd3({
  surname = 'TESTSURNAME',
  given = 'TESTGIVEN',
  docNumber = 'AB1234567',
  nationality = 'UKR',
  dob = '850712',
  sex = 'M',
  // Default expiry chosen carefully: 29 -> 2029 (parseMrzDate century
  // heuristic puts YY ≤ currentYY+5 into 2000s; currentYY=26 today, +5=31,
  // so 29 ≤ 31 → 2029, which is future-dated.).
  expiry = '290630',
  personalNumber = '0000000000000',
}: Partial<{
  surname: string
  given: string
  docNumber: string
  nationality: string
  dob: string
  sex: 'M' | 'F'
  expiry: string
  personalNumber: string
}> = {}) {
  // Line 1: P< + UKR + SURNAME<<GIVEN<<... padded to 44
  const nameField = `${surname}<<${given}`.padEnd(39, '<')
  const line1 = `P<UKR${nameField}`.padEnd(44, '<').slice(0, 44)

  const docNumberPadded = docNumber.padEnd(9, '<')
  const docNumberCheck = computeCheckDigit(docNumberPadded)!
  const dobCheck = computeCheckDigit(dob)!
  const expiryCheck = computeCheckDigit(expiry)!
  const personalPadded = personalNumber.padEnd(14, '<')
  const personalCheck = computeCheckDigit(personalPadded)!

  // Composite check is over line2[0..42]
  const beforeComposite =
    docNumberPadded + docNumberCheck +
    nationality +
    dob + dobCheck +
    sex +
    expiry + expiryCheck +
    personalPadded + personalCheck
  const compositeCheck = computeCheckDigit(beforeComposite)!

  const line2 = (beforeComposite + compositeCheck).padEnd(44, '<').slice(0, 44)
  return { line1, line2 }
}

describe('runPassportModule', () => {
  it('extracts fields from a valid Ukrainian TD3 MRZ', () => {
    const { line1, line2 } = buildSyntheticTd3()
    const ocr = makeOcrFromMrz(line1, line2)
    const r = runPassportModule(ocr, { document_id: 'doc_test' })

    expect(r.matched).toBe(true)
    expect(r.match_reason).toBe('td3_parsed_valid')
    expect(r.manual_review_required).toBe(false)

    const byField = Object.fromEntries(r.fields.map(f => [f.field, f]))
    expect(byField.family_name?.normalized_value).toBe('Testsurname')
    expect(byField.given_name?.normalized_value).toBe('Testgiven')
    expect(byField.passport_number?.normalized_value).toBe('AB1234567')
    expect(byField.country_of_nationality?.normalized_value).toBe('Ukraine')
    expect(byField.dob?.normalized_value).toBe('1985-07-12')
    expect(byField.sex?.normalized_value).toBe('M')
    expect(byField.passport_expiration_date?.normalized_value).toBe('2029-06-30')
    expect(byField.passport_country_of_issuance?.normalized_value).toBe('Ukraine')

    // No field should be flagged for review on a fully valid MRZ.
    expect(r.fields.every(f => f.review_required === false)).toBe(true)
  })

  it('flags non-Ukrainian nationality for manual review', () => {
    const { line1, line2 } = buildSyntheticTd3({ nationality: 'USA' })
    const ocr = makeOcrFromMrz(line1, line2)
    const r = runPassportModule(ocr, { document_id: 'doc_test' })

    expect(r.matched).toBe(true)
    expect(r.manual_review_required).toBe(true)
    expect(r.manual_review_reasons).toContain('not_ukrainian_nationality')

    const nat = r.fields.find(f => f.field === 'country_of_nationality')
    expect(nat?.review_required).toBe(true)
    expect(nat?.failures).toContain('nationality_not_ukr')
  })

  it('flags expired passport for manual review', () => {
    // Expiry in 2010 — always in the past.
    const { line1, line2 } = buildSyntheticTd3({ expiry: '100101' })
    const ocr = makeOcrFromMrz(line1, line2)
    const r = runPassportModule(ocr, { document_id: 'doc_test' })

    expect(r.matched).toBe(true)
    expect(r.manual_review_required).toBe(true)
    expect(r.manual_review_reasons).toContain('expired_passport')

    const exp = r.fields.find(f => f.field === 'passport_expiration_date')
    expect(exp?.review_required).toBe(true)
    expect(exp?.failures).toContain('expired_passport')
  })

  it('returns matched=false when no MRZ is present', () => {
    const ocr: OcrResult = {
      provider: 'google_vision',
      raw_text: 'Just a photo of a kitten',
      pages: [
        {
          page: 1, width: 800, height: 600,
          lines: [
            { id: 'l_0', text: 'Just a photo', page: 1, bbox: { x: 0, y: 0, width: 1, height: 0.05 }, words: [], confidence: 0.99, source: 'google_vision' },
          ],
          words: [],
        },
      ],
      lines: [
        { id: 'l_0', text: 'Just a photo', page: 1, bbox: { x: 0, y: 0, width: 1, height: 0.05 }, words: [], confidence: 0.99, source: 'google_vision' },
      ],
      words: [],
      processing_ms: 100,
      warnings: [],
      created_at: new Date().toISOString(),
    }
    const r = runPassportModule(ocr, { document_id: 'doc_kitten' })

    expect(r.matched).toBe(false)
    expect(r.match_reason).toBe('mrz_not_located')
    expect(r.fields).toEqual([])
  })

  it('every extracted field carries provenance (source_document_id, source_zone, bbox, language_layer)', () => {
    const { line1, line2 } = buildSyntheticTd3()
    const ocr = makeOcrFromMrz(line1, line2)
    const r = runPassportModule(ocr, { document_id: 'doc_provenance_test' })

    for (const f of r.fields) {
      expect(f.source_document_id).toBe('doc_provenance_test')
      expect(f.extraction_source).toBe('ocr_mrz')
      expect(f.language_layer).toBe('mrz')
      expect(f.source_zone.startsWith('mrz_line_')).toBe(true)
      expect(f.bbox).not.toBeNull()
    }
  })

  // 2026-05-21 regression: user reported passport_number EK790396 returned
  // with review_required=false even though match_reason was
  // td3_parsed_with_check_failures. The fix: when ANY MRZ check digit
  // fails, mark EVERY MRZ-derived field as requires_review so the UI
  // shows "проверьте" — OCR could have mis-read a character anywhere in
  // the 88-character TD3 block, and adjacent fields whose individual
  // check digits happen to validate are still suspect.
  it('marks every MRZ-derived field requires_review when ANY check digit fails', () => {
    // Build a valid TD3 then corrupt ONE character in line2 outside the
    // doc-number check span. This trips the composite check while leaving
    // the per-field docNumber check intact — exactly the regression case.
    const { line1, line2 } = buildSyntheticTd3()
    // Flip a character in the personal-number area (positions 28..41).
    // That area's own check digit will fail AND the composite recalc will
    // fail, but the document-number's own check (positions 0..9) stays valid.
    const corrupted = line2.slice(0, 30) + (line2[30] === '0' ? '5' : '0') + line2.slice(31)
    const ocr = makeOcrFromMrz(line1, corrupted)
    const r = runPassportModule(ocr, { document_id: 'doc_overall_suspect' })

    expect(r.matched).toBe(true)
    expect(r.match_reason).toBe('td3_parsed_with_check_failures')

    // Every emitted MRZ field must be flagged for review now.
    for (const f of r.fields) {
      expect(f.review_required, `${f.field} should require review when MRZ overall failed`).toBe(true)
    }

    // passport_number specifically — the user-visible regression — must
    // carry mrz_overall_check_digit in failures so the audit log explains
    // why we flagged a field whose own check happened to pass.
    const pn = r.fields.find(f => f.field === 'passport_number')
    expect(pn?.review_required).toBe(true)
    expect(pn?.failures.some(x => x.includes('mrz'))).toBe(true)
  })
})
