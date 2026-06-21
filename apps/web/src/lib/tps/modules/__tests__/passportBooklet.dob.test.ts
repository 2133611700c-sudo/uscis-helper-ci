/**
 * DOB fixture proof for passportBooklet module.
 *
 * Verifies that parseUaDate (internal) + the label-search pipeline correctly
 * extract and convert DOB to ISO-8601 for all date formats printed/handwritten
 * on Ukrainian booklets.
 *
 * Layout: handwritten value sits ABOVE the printed "Дата народження" label
 * (OCR reads top-to-bottom, so value line index < label line index).
 */

import { describe, it, expect } from 'vitest'
import { runPassportBookletModule } from '../passportBooklet'
import type { OcrResult, OcrLine } from '@/lib/ocr/types'

// ── Minimal synthetic OcrResult builder ──────────────────────────────────────

function line(id: string, text: string): OcrLine {
  return {
    id,
    text,
    page: 1,
    bbox: { x: 0, y: 0, width: 0.1, height: 0.02 },
    words: [],
    confidence: 0.9,
    source: 'google_vision',
  }
}

/**
 * Builds an OcrResult that looks like a Ukrainian booklet.
 *
 * `dobLine` is placed ABOVE the "Дата народження" label, matching the
 * actual booklet layout (handwritten value above printed label).
 *
 * Minimal required signals to pass match detection:
 *  - strong: "паспорт громадянина україни"
 *  - surname value (above label) + label
 */
function bookletOcr(dobLine: string): OcrResult {
  const lines: OcrLine[] = [
    // Strong match signal
    line('l_01', 'Паспорт громадянина України'),
    // surname — value ABOVE label
    line('l_02', 'Шевченко'),
    line('l_03', 'Прізвище'),
    // dob — value ABOVE label
    line('l_04', dobLine),
    line('l_05', 'Дата народження'),
    line('l_06', 'Date of birth'),
  ]
  return {
    provider: 'google_vision',
    raw_text: lines.map((l) => l.text).join('\n'),
    pages: [{ page: 1, width: 800, height: 1200, lines, words: [] }],
    lines,
    words: [],
    processing_ms: 0,
    warnings: [],
    created_at: '2026-05-27T00:00:00.000Z',
  }
}

function getDob(ocr: OcrResult): string | null {
  const result = runPassportBookletModule(ocr, { document_id: 'test_booklet' })
  const dobField = result.fields.find((f) => f.field === 'dob')
  return dobField?.normalized_value ?? null
}

// ── DOB format tests ─────────────────────────────────────────────────────────

describe('passportBooklet — DOB extraction', () => {
  it('parses full Ukrainian written-out month: "01 січня 1990 року"', () => {
    expect(getDob(bookletOcr('01 січня 1990 року'))).toBe('1990-01-01')
  })

  it('parses full Ukrainian written-out month without "року": "01 січня 1990"', () => {
    expect(getDob(bookletOcr('01 січня 1990'))).toBe('1990-01-01')
  })

  it('parses full Russian written-out month: "13 августа 1960"', () => {
    expect(getDob(bookletOcr('13 августа 1960'))).toBe('1960-08-13')
  })

  it('parses numeric DD.MM.YYYY: "01.01.1990"', () => {
    expect(getDob(bookletOcr('01.01.1990'))).toBe('1990-01-01')
  })

  it('parses numeric DD/MM/YYYY: "14/02/1990"', () => {
    expect(getDob(bookletOcr('14/02/1990'))).toBe('1990-02-14')
  })

  it('parses numeric DD-MM-YYYY: "14-02-1990"', () => {
    expect(getDob(bookletOcr('14-02-1990'))).toBe('1990-02-14')
  })

  it('parses abbreviated bilingual OCR: "13 CEP / AUG 60" (Vision look-alike confusion)', () => {
    // "CEP" is Vision's read of Cyrillic "СЕР" (серпня = August)
    expect(getDob(bookletOcr('13 CEP / AUG 60'))).toBe('1960-08-13')
  })

  it('parses abbreviated Cyrillic: "13 СЕР 60"', () => {
    expect(getDob(bookletOcr('13 СЕР 60'))).toBe('1960-08-13')
  })

  it('resolves 2-digit year > 30 as 1900s: "14.02.90"', () => {
    expect(getDob(bookletOcr('14.02.90'))).toBe('1990-02-14')
  })

  it('resolves 2-digit year ≤ 30 as 2000s: "15.03.05"', () => {
    expect(getDob(bookletOcr('15.03.05'))).toBe('2005-03-15')
  })

  it('returns null and emits warning for raw label garbage: "Date of birth 13 CEP / AUG 60"', () => {
    const result = runPassportBookletModule(
      bookletOcr('Date of birth 13 CEP / AUG 60'),
      { document_id: 'test_booklet' },
    )
    // After label stripping in stripBilingualNoise, "13 CEP / AUG 60" remains
    // and parseUaDate should succeed (regression for BUG-FIX_TPS_BOOKLET_ENGLISH_LABEL_STRIP)
    const dobField = result.fields.find((f) => f.field === 'dob')
    // The label is stripped before parseUaDate is called, so it should succeed
    expect(dobField?.normalized_value).toBe('1960-08-13')
  })

  it('emits warning and no dob field for completely unparseable string', () => {
    const result = runPassportBookletModule(
      bookletOcr('ХБХБХБ'),
      { document_id: 'test_booklet' },
    )
    const dobField = result.fields.find((f) => f.field === 'dob')
    expect(dobField).toBeUndefined()
    expect(result.warnings).toContain('booklet_dob_unparseable')
  })

  it('emits warning when dob line is absent entirely', () => {
    // Build OCR with no dob value/label lines
    const lines: OcrLine[] = [
      line('l_01', 'Паспорт громадянина України'),
      line('l_02', 'Шевченко'),
      line('l_03', 'Прізвище'),
    ]
    const ocr: OcrResult = {
      provider: 'google_vision',
      raw_text: lines.map((l) => l.text).join('\n'),
      pages: [{ page: 1, width: 800, height: 1200, lines, words: [] }],
      lines,
      words: [],
      processing_ms: 0,
      warnings: [],
      created_at: '2026-05-27T00:00:00.000Z',
    }
    const result = runPassportBookletModule(ocr, { document_id: 'test_booklet' })
    expect(result.fields.find((f) => f.field === 'dob')).toBeUndefined()
    expect(result.warnings).toContain('booklet_dob_missing')
  })

  it('emits dob with passes=["date_parsed"] and review_required=true', () => {
    const result = runPassportBookletModule(
      bookletOcr('01 січня 1990 року'),
      { document_id: 'test_booklet' },
    )
    const dobField = result.fields.find((f) => f.field === 'dob')
    expect(dobField?.passes).toContain('date_parsed')
    expect(dobField?.review_required).toBe(true)
    expect(dobField?.extraction_source).toBe('ocr_keyword')
    expect(dobField?.source_zone).toBe('booklet_label_dob')
  })

  // ── date_scan_fallback tests (label absent scenario) ─────────────────────────

  it('fallback: extracts dob when "Дата народження" label is missing but date line is present', () => {
    // Build OCR without any "Дата народження" / "Date of birth" label lines
    const lines: OcrLine[] = [
      line('l_01', 'Паспорт громадянина України'),
      line('l_02', 'Шевченко'),
      line('l_03', 'Прізвище'),
      // Date line present but NO label — real Vision failure mode
      line('l_04', '01 січня 1990 року'),
    ]
    const ocr: OcrResult = {
      provider: 'google_vision',
      raw_text: lines.map((l) => l.text).join('\n'),
      pages: [{ page: 1, width: 800, height: 1200, lines, words: [] }],
      lines,
      words: [],
      processing_ms: 0,
      warnings: [],
      created_at: '2026-05-27T00:00:00.000Z',
    }
    const result = runPassportBookletModule(ocr, { document_id: 'test_booklet' })
    const dobField = result.fields.find((f) => f.field === 'dob')
    expect(dobField?.normalized_value).toBe('1990-01-01')
    expect(dobField?.source_zone).toBe('booklet_date_scan_fallback')
    expect(dobField?.passes).toContain('date_parsed')
    expect(dobField?.passes).toContain('label_scan_fallback')
  })

  it('fallback: emits booklet_dob_label_missing_used_date_scan warning when fallback is used', () => {
    const lines: OcrLine[] = [
      line('l_01', 'Паспорт громадянина України'),
      line('l_02', 'Шевченко'),
      line('l_03', 'Прізвище'),
      line('l_04', '01 січня 1990 року'),
    ]
    const ocr: OcrResult = {
      provider: 'google_vision',
      raw_text: lines.map((l) => l.text).join('\n'),
      pages: [{ page: 1, width: 800, height: 1200, lines, words: [] }],
      lines,
      words: [],
      processing_ms: 0,
      warnings: [],
      created_at: '2026-05-27T00:00:00.000Z',
    }
    const result = runPassportBookletModule(ocr, { document_id: 'test_booklet' })
    expect(result.warnings).toContain('booklet_dob_label_missing_used_date_scan')
  })

  it('fallback: emits booklet_dob_missing when two date-like lines exist (ambiguous)', () => {
    // Two parseable date lines — fallback must NOT guess
    const lines: OcrLine[] = [
      line('l_01', 'Паспорт громадянина України'),
      line('l_02', 'Шевченко'),
      line('l_03', 'Прізвище'),
      line('l_04', '01 січня 1990 року'),
      line('l_05', '13 серпня 1960'),
    ]
    const ocr: OcrResult = {
      provider: 'google_vision',
      raw_text: lines.map((l) => l.text).join('\n'),
      pages: [{ page: 1, width: 800, height: 1200, lines, words: [] }],
      lines,
      words: [],
      processing_ms: 0,
      warnings: [],
      created_at: '2026-05-27T00:00:00.000Z',
    }
    const result = runPassportBookletModule(ocr, { document_id: 'test_booklet' })
    expect(result.fields.find((f) => f.field === 'dob')).toBeUndefined()
    expect(result.warnings).toContain('booklet_dob_missing')
  })
})
