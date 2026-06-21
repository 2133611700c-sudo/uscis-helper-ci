/**
 * Unit tests for labelValueExtractor.ts
 *
 * Hard rules:
 *   - Label text MUST NEVER be returned as a value
 *   - Bilingual label lines must not leak
 *   - Real values are extracted correctly
 *   - Multiple candidates → first + review_required
 *   - Missing value → null + review_required
 */

import { describe, it, expect } from 'vitest'
import {
  extractValueAfterLabel,
  isLabelText,
  isCyrillicValue,
} from '../labelValueExtractor'

// ── isLabelText ──────────────────────────────────────────────────────────────

describe('isLabelText', () => {
  it('returns true for "прізвище"', () => {
    expect(isLabelText('прізвище')).toBe(true)
  })

  it('returns true for truncated "прізвищ" (OCR clip)', () => {
    expect(isLabelText('Прізвищ')).toBe(true)
  })

  it('returns true for "ім\'я, отчество, по батькові" (bilingual label line)', () => {
    expect(isLabelText("ім'я, отчество, по батькові")).toBe(true)
  })

  it('returns true for punctuation-stripped "Прізвищ" (inline label remnant after slash)', () => {
    // The stripping of leading punctuation "/ " happens in extractValueAfterLabel.
    // isLabelText itself checks the word "Прізвищ" which IS a label.
    expect(isLabelText('Прізвищ')).toBe(true)
  })

  it('returns false for "Іваненко" (real surname)', () => {
    expect(isLabelText("Іваненко")).toBe(false)
  })

  it('returns false for "Іван" (real given name)', () => {
    expect(isLabelText('Іван')).toBe(false)
  })

  it('returns false for "01 січня 1990" (date value)', () => {
    expect(isLabelText('01 січня 1990')).toBe(false)
  })

  it('returns true for punctuation-only "---"', () => {
    expect(isLabelText('---')).toBe(true)
  })

  it('returns true for "УКРАЇНА" (all-caps header)', () => {
    expect(isLabelText('УКРАЇНА')).toBe(true)
  })
})

// ── isCyrillicValue ──────────────────────────────────────────────────────────

describe('isCyrillicValue', () => {
  it('returns true for real surname', () => {
    expect(isCyrillicValue("Іваненко")).toBe(true)
  })

  it('returns false for label text', () => {
    expect(isCyrillicValue('прізвище')).toBe(false)
  })

  it('returns false for "/ Прізвищ" (label remnant with slash)', () => {
    expect(isCyrillicValue('/ Прізвищ')).toBe(false)
  })

  it('returns false for short text under 2 chars', () => {
    expect(isCyrillicValue('А')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isCyrillicValue('')).toBe(false)
  })

  it('returns false for Latin-only text', () => {
    expect(isCyrillicValue('Hello')).toBe(false)
  })
})

// ── extractValueAfterLabel — core extraction ──────────────────────────────────

describe('extractValueAfterLabel — inline value', () => {
  it('extracts "Іваненко" from "Прізвище: Іваненко"', () => {
    const lines = ["Прізвище: Іваненко"]
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    expect(result.raw_value).toBe("Іваненко")
    expect(result.review_required).toBe(false)
    expect(result.confidence).toBe('high')
  })

  it('extracts "Іван" from "Ім\'я: Іван"', () => {
    const lines = ["Ім'я: Іван"]
    const result = extractValueAfterLabel(lines, [/ім['ʼ'`]?я\s*[:.]?/iu])
    expect(result.raw_value).toBe('Іван')
    expect(result.review_required).toBe(false)
  })
})

describe('extractValueAfterLabel — value on next line', () => {
  it('extracts surname from next line after bare label', () => {
    const lines = ['Прізвище', "Іваненко"]
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    expect(result.raw_value).toBe("Іваненко")
    expect(result.review_required).toBe(false)
    expect(result.confidence).toBe('medium')
  })

  it('extracts given name from next line', () => {
    const lines = ["Ім'я", 'Іван']
    const result = extractValueAfterLabel(lines, [/ім['ʼ'`]?я\s*[:.]?/iu])
    expect(result.raw_value).toBe('Іван')
  })
})

describe('extractValueAfterLabel — label-as-value rejection', () => {
  it('returns null when next line is also a label ("прізвище" → "ім\'я")', () => {
    // Classic bilingual form: label lines only, no values
    const lines = ['СВІДОЦТВО', 'Прізвище', "Ім'я", 'по батькові']
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    expect(result.raw_value).toBeNull()
    expect(result.review_required).toBe(true)
  })

  it('rejects "/ Прізвищ" inline tail (bilingual label)', () => {
    // OCR: "Прізвище / Прізвищ" — tail after stripping pattern is "/ Прізвищ"
    const lines = ['Прізвище / Прізвищ']
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    expect(result.raw_value).toBeNull()
  })

  it('rejects "ім\'я, отчество, по батькові" as inline value', () => {
    // This was the bug: given_name returned as "ім'я, отчество, по батькові"
    const lines = ["Ім'я, отчество, по батькові"]
    const result = extractValueAfterLabel(lines, [/ім['ʼ'`]?я\s*[:.]?/iu])
    // The whole line matches label pattern AND tail is also labels
    // Either no match on pattern (no Cyrillic suffix that's not label)
    // or null raw_value
    if (result.raw_value !== null) {
      // If a value was extracted, it must not be the label itself
      expect(result.raw_value).not.toMatch(/отчество|по батькові|прізвищ/i)
    }
  })

  it('returns null + review_required when label found but no value follows', () => {
    const lines = ['Прізвище']
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    expect(result.raw_value).toBeNull()
    expect(result.review_required).toBe(true)
    expect(result.rejection_reason).toBe('value_not_found_after_label')
  })

  it('returns null when label not found at all', () => {
    const lines = ['СВІДОЦТВО ПРО НАРОДЖЕННЯ', 'Вінниця']
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    expect(result.raw_value).toBeNull()
    expect(result.review_required).toBe(true)
    expect(result.rejection_reason).toBe('label_not_found')
  })
})

describe('extractValueAfterLabel — multiple candidates', () => {
  it('returns first candidate + review_required when two values follow label', () => {
    const lines = ['Прізвище', "Іваненко", 'Петренко']
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    expect(result.raw_value).toBe("Іваненко")
    expect(result.review_required).toBe(true)
    expect(result.rejection_reason).toBe('multiple_candidates')
  })
})

describe('extractValueAfterLabel — date extraction', () => {
  it('extracts "01 січня 1990" from next line after дата народження', () => {
    const lines = ['Дата народження', '01 січня 1990 р.']
    const result = extractValueAfterLabel(lines, [/дата\s+народження\s*[:.]?/iu])
    expect(result.raw_value).toBe('01 січня 1990 р.')
    expect(result.review_required).toBe(false)
  })

  it('extracts inline date', () => {
    const lines = ['Дата народження: 01 січня 1990 р.']
    const result = extractValueAfterLabel(lines, [/дата\s+народження\s*[:.]?/iu])
    expect(result.raw_value).toBe('01 січня 1990 р.')
  })
})

describe('extractValueAfterLabel — bilingual OCR scenarios', () => {
  it('label repeated bilingual → no label-as-value', () => {
    // Form with UA + RU label on one line, value on next
    const lines = ['Прізвище / Фамилия', "Іваненко"]
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    // inline tail is "/ Фамилия" — rejected as label
    // next line "Іваненко" — accepted as value
    expect(result.raw_value).toBe("Іваненко")
  })

  it('does not return "прізвищ" as child_family_name', () => {
    // Specific regression: OCR variant of the label printed on next line
    const lines = ['Прізвище', 'прізвищ']
    const result = extractValueAfterLabel(lines, [/прізвище\s*[:.]?/iu])
    // "прізвищ" IS a known label — must be rejected
    expect(result.raw_value).toBeNull()
  })
})
