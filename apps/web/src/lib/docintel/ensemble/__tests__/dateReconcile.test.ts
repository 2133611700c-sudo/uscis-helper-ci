/**
 * dateReconcile.test.ts — cross-engine date reconciliation, pinned on the REAL
 * handwritten failure pattern (GT bench / 2026-06-10 live ensemble proof):
 * Gemini read the month as July; Google Vision read it as June; agreement on
 * day+year. The reconciler must NOT silently pick — it must flag the month
 * disagreement for human review and surface both candidates.
 */
import { describe, it, expect } from 'vitest'
import { parseDateText, reconcileDate } from '../dateReconcile'

describe('parseDateText', () => {
  it('parses Ukrainian word-month form', () => {
    expect(parseDateText('14 червня 1990')).toEqual({ day: 14, month: 6, year: 1990 })
  })
  it('parses Russian word-month form', () => {
    expect(parseDateText('14 июня 1990')).toEqual({ day: 14, month: 6, year: 1990 })
  })
  it('distinguishes червня (June) from липня (July)', () => {
    expect(parseDateText('липня').month).toBe(7)
    expect(parseDateText('червня').month).toBe(6)
  })
  it('parses ISO and MM/DD/YYYY', () => {
    expect(parseDateText('1990-06-14')).toEqual({ day: 14, month: 6, year: 1990 })
    expect(parseDateText('06/14/1990')).toEqual({ day: 14, month: 6, year: 1990 })
  })
})

describe('reconcileDate — agreement', () => {
  it('full agreement → trusted ISO value, no review', () => {
    const r = reconcileDate([
      { source: 'gemini', text: '14 червня 1990' },
      { source: 'google_vision', text: '14 июня 1990' },
    ])
    expect(r.agree).toBe(true)
    expect(r.value).toBe('1990-06-14')
    expect(r.reviewRequired).toBe(false)
  })
})

describe('reconcileDate — the real handwritten failure (month disagreement)', () => {
  it('Gemini July vs Vision June → flag month, force review, no silent pick', () => {
    const r = reconcileDate([
      { source: 'gemini_crop', text: '14 липня 1990' },   // Gemini misread month
      { source: 'google_vision', text: '14 июня 1990' },  // Vision read June (correct)
    ])
    expect(r.agree).toBe(false)
    expect(r.value).toBeNull()                       // never silently emits a wrong date
    expect(r.reviewRequired).toBe(true)
    expect(r.reasonCodes).toContain('date_month_disagreement')
    // day + year agreed; month did not
    expect(r.components.day.value).toBe(14)
    expect(r.components.day.agreed).toBe(true)
    expect(r.components.year.value).toBe(1990)
    expect(r.components.month.agreed).toBe(false)
    // both candidate readings preserved for the human to choose
    expect(r.candidates.map((c) => c.parsed.month).sort()).toEqual([6, 7])
  })

  it('day disagreement is flagged too', () => {
    const r = reconcileDate([
      { source: 'gemini', text: '17 червня 1990' },
      { source: 'google_vision', text: '14 червня 1990' },
    ])
    expect(r.reasonCodes).toContain('date_day_disagreement')
    expect(r.reviewRequired).toBe(true)
  })
})

describe('reconcileDate — missing components', () => {
  it('a single reading with a missing month → review, no value', () => {
    const r = reconcileDate([{ source: 'gemini', text: '1990' }])
    expect(r.value).toBeNull()
    expect(r.reviewRequired).toBe(true)
  })
})
