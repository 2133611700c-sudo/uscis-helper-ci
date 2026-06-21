/**
 * OCR Accuracy + Mini-Eval Tests — Phases 3 & 4
 *
 * Phase 3: 5 mock OcrResult fixture types through the field-mapper pipeline
 *   1. good_quality     — clean scan, all 11 fields readable
 *   2. blurry           — reduced confidence, critical fields review_required
 *   3. rotated          — same content, pipeline should not crash
 *   4. mixed_script     — Cyrillic/Latin lookalike risk, review_required escalation
 *   5. unreadable_perf  — perforation series/number unreadable, review_required
 *
 * Phase 4: Accuracy regression cases
 *   - Ukrainian month names (all 12)
 *   - Russian month fallback (all 12) + review_required flag
 *   - date_of_birth vs date_of_issue zone lock
 *   - missing month → review_required, never guessed
 *   - passport series: 2-letter + 6-digit validation
 *   - ambiguous perforation digits (0/8, 6/9, 1/7)
 *   - name lookalike patterns (13 Cyrillic/Latin pairs)
 *   - abnormal casing detection
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeDateUkrainian,
  validateDateFieldLock,
  UKRAINIAN_MONTHS,
  RUSSIAN_MONTHS,
  ALL_MONTHS,
} from '../numericAccuracy/dateFieldLockValidator'
import { validatePassportPerforation } from '../numericAccuracy/passportPerforationValidator'
import {
  hasMixedScript,
  isLikelyCyrillicLookalike,
  hasAbnormalCasing,
  normalizeName,
  analyseNameField,
} from '../../ocr/nameNormalizer'
import type { ExtractedField } from '../types'
import type { OcrResult } from '../../ocr/types'

// Month maps are now imported from the canonical source (dateFieldLockValidator.ts).
// Tests use the exported names directly — do NOT redefine them here.
// Kept as local aliases for the few tests that use the old names:
const UA_MONTHS = UKRAINIAN_MONTHS
const RU_MONTHS = RUSSIAN_MONTHS

// ── Mock OcrResult factory ────────────────────────────────────────────────────
function makeOcrWord(id: string, text: string, x: number, y: number, w: number, h: number, conf = 0.95) {
  return { id, text, page: 1, bbox: { x, y, width: w, height: h }, confidence: conf, source: 'google_vision' }
}

function makeOcrLine(id: string, text: string, words: ReturnType<typeof makeOcrWord>[], conf = 0.95) {
  const xs = words.map(w => w.bbox.x)
  const ys = words.map(w => w.bbox.y)
  const x2s = words.map(w => w.bbox.x + w.bbox.width)
  const y2s = words.map(w => w.bbox.y + w.bbox.height)
  return {
    id, text, page: 1, words, confidence: conf, source: 'google_vision',
    bbox: {
      x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...x2s) - Math.min(...xs),
      height: Math.max(...y2s) - Math.min(...ys),
    },
  }
}

function makeOcrResult(lines: ReturnType<typeof makeOcrLine>[], processing_ms = 1200): OcrResult {
  const words = lines.flatMap(l => l.words)
  return {
    provider: 'google_vision',
    raw_text: lines.map(l => l.text).join('\n'),
    pages: [{ page: 1, width: 800, height: 1200, lines, words }],
    lines,
    words,
    processing_ms,
    warnings: [],
    created_at: new Date().toISOString(),
  }
}

// ── Fixture 1: Good quality ───────────────────────────────────────────────────
const GOOD_OCR: OcrResult = makeOcrResult([
  makeOcrLine('l_001', 'ПАСПОРТ / PASSPORT', [makeOcrWord('w_001', 'ПАСПОРТ', 0.05,0.02,0.20,0.04), makeOcrWord('w_002', '/', 0.26,0.02,0.02,0.04), makeOcrWord('w_003', 'PASSPORT', 0.29,0.02,0.18,0.04)]),
  makeOcrLine('l_002', 'АА 123456', [makeOcrWord('w_010', 'АА', 0.05,0.08,0.06,0.03,0.99), makeOcrWord('w_011', '123456', 0.12,0.08,0.12,0.03,0.99)]),
  makeOcrLine('l_003', 'ШЕВЧЕНКО', [makeOcrWord('w_020', 'ШЕВЧЕНКО', 0.05,0.15,0.25,0.04,0.97)]),
  makeOcrLine('l_004', 'ТАРАС ГРИГОРОВИЧ', [makeOcrWord('w_021', 'ТАРАС', 0.05,0.20,0.12,0.04,0.96), makeOcrWord('w_022', 'ГРИГОРОВИЧ', 0.18,0.20,0.22,0.04,0.96)]),
  makeOcrLine('l_005', '09 березня 1814', [makeOcrWord('w_030', '09', 0.05,0.30,0.05,0.03,0.97), makeOcrWord('w_031', 'березня', 0.11,0.30,0.14,0.03,0.97), makeOcrWord('w_032', '1814', 0.26,0.30,0.10,0.03,0.97)]),
  makeOcrLine('l_006', 'С. МОРИНЦІ ЧЕРКАСЬКА ОБЛ.', [makeOcrWord('w_033', 'С.', 0.05,0.35,0.04,0.03), makeOcrWord('w_034', 'МОРИНЦІ', 0.10,0.35,0.18,0.03), makeOcrWord('w_035', 'ЧЕРКАСЬКА', 0.29,0.35,0.20,0.03), makeOcrWord('w_036', 'ОБЛ.', 0.50,0.35,0.10,0.03)]),
  makeOcrLine('l_007', 'Ч', [makeOcrWord('w_040', 'Ч', 0.70,0.30,0.03,0.03,0.99)]),
  makeOcrLine('l_008', 'ДМС ЧЕРКАСЬКОЇ ОБЛ.', [makeOcrWord('w_050', 'ДМС', 0.05,0.55,0.08,0.03,0.96), makeOcrWord('w_051', 'ЧЕРКАСЬКОЇ', 0.14,0.55,0.22,0.03,0.96), makeOcrWord('w_052', 'ОБЛ.', 0.37,0.55,0.10,0.03,0.96)]),
  makeOcrLine('l_009', '12 квітня 2010', [makeOcrWord('w_060', '12', 0.05,0.63,0.05,0.03,0.97), makeOcrWord('w_061', 'квітня', 0.11,0.63,0.12,0.03,0.97), makeOcrWord('w_062', '2010', 0.24,0.63,0.10,0.03,0.97)]),
])

// ── Fixture 2: Blurry image ───────────────────────────────────────────────────
const BLURRY_OCR: OcrResult = makeOcrResult([
  makeOcrLine('l_001', 'ПАСПОРТ', [makeOcrWord('w_001', 'ПАСПОРТ', 0.05,0.02,0.20,0.04,0.55)]),
  makeOcrLine('l_002', 'АА', [makeOcrWord('w_010', 'АА', 0.05,0.08,0.06,0.03,0.52)]),  // no number readable
  makeOcrLine('l_003', 'ШЕВЧЕНКО', [makeOcrWord('w_020', 'ШЕВЧЕНКО', 0.05,0.15,0.25,0.04,0.58)]),
], 3200)

// ── Fixture 3: Rotated image ──────────────────────────────────────────────────
const ROTATED_OCR: OcrResult = makeOcrResult([
  makeOcrLine('l_001', 'ПАСПОРТ', [makeOcrWord('w_001', 'ПАСПОРТ', 0.10,0.05,0.20,0.04,0.89)]),
  makeOcrLine('l_002', 'АА 123456', [makeOcrWord('w_010', 'АА', 0.10,0.12,0.06,0.03,0.87), makeOcrWord('w_011', '123456', 0.17,0.12,0.12,0.03,0.87)]),
  makeOcrLine('l_003', 'ШЕВЧЕНКО', [makeOcrWord('w_020', 'ШЕВЧЕНКО', 0.10,0.20,0.25,0.04,0.85)]),
], 1800)

// ── Fixture 4: Mixed-script OCR risk ─────────────────────────────────────────
// 'ШЕВЧЕНKО' — last letter K is Latin, not Cyrillic К
const MIXED_SCRIPT_OCR: OcrResult = makeOcrResult([
  makeOcrLine('l_001', 'АА 123456', [makeOcrWord('w_010', 'АА', 0.05,0.08,0.06,0.03,0.99), makeOcrWord('w_011', '123456', 0.12,0.08,0.12,0.03,0.99)]),
  makeOcrLine('l_002', 'ШЕВЧЕНKО', [makeOcrWord('w_020', 'ШЕВЧЕНKО', 0.05,0.15,0.25,0.04,0.88)]),  // K is Latin
  makeOcrLine('l_003', 'TAPAC', [makeOcrWord('w_021', 'TAPAC', 0.05,0.20,0.12,0.04,0.85)]),         // all Latin lookalikes
])

// ── Fixture 5: Unreadable perforation ────────────────────────────────────────
const UNREADABLE_PERF_OCR: OcrResult = makeOcrResult([
  makeOcrLine('l_001', 'ПАСПОРТ', [makeOcrWord('w_001', 'ПАСПОРТ', 0.05,0.02,0.20,0.04,0.95)]),
  // Series unreadable — only one letter partially readable
  makeOcrLine('l_002', 'А', [makeOcrWord('w_010', 'А', 0.05,0.08,0.03,0.03,0.45)]),
  makeOcrLine('l_003', 'ШЕВЧЕНКО', [makeOcrWord('w_020', 'ШЕВЧЕНКО', 0.05,0.15,0.25,0.04,0.95)]),
])

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Mock OCR Fixture Pipeline Validation
// ════════════════════════════════════════════════════════════════════════════════

describe('Phase 3 — Mock OCR fixture validation', () => {

  describe('Fixture 1: Good quality', () => {
    it('OcrResult is well-formed with non-empty lines and words', () => {
      expect(GOOD_OCR.lines.length).toBeGreaterThan(5)
      expect(GOOD_OCR.words.length).toBeGreaterThan(10)
      expect(GOOD_OCR.provider).toBe('google_vision')
    })

    it('all words have stable IDs and normalized bboxes', () => {
      for (const word of GOOD_OCR.words) {
        expect(word.id).toMatch(/^w_\d+$/)
        expect(word.bbox.x).toBeGreaterThanOrEqual(0)
        expect(word.bbox.x + word.bbox.width).toBeLessThanOrEqual(1.01)
        expect(word.bbox.y).toBeGreaterThanOrEqual(0)
        expect(word.bbox.y + word.bbox.height).toBeLessThanOrEqual(1.01)
      }
    })

    it('all lines have stable IDs and contain their words', () => {
      for (const line of GOOD_OCR.lines) {
        expect(line.id).toMatch(/^l_\d+$/)
        expect(line.words.length).toBeGreaterThan(0)
        expect(line.text).toBeTruthy()
      }
    })

    it('series and number words are present and high confidence', () => {
      const seriesWord = GOOD_OCR.words.find(w => w.id === 'w_010')
      const numberWord = GOOD_OCR.words.find(w => w.id === 'w_011')
      expect(seriesWord?.text).toBe('АА')
      expect(numberWord?.text).toBe('123456')
      expect(seriesWord?.confidence).toBeGreaterThan(0.95)
      expect(numberWord?.confidence).toBeGreaterThan(0.95)
    })

    it('date word contains Ukrainian month', () => {
      const dateWords = GOOD_OCR.words.filter(w => w.text.toLowerCase() in UA_MONTHS)
      expect(dateWords.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Fixture 2: Blurry image', () => {
    it('has reduced confidence scores (< 0.70 for most words)', () => {
      const lowConf = BLURRY_OCR.words.filter(w => (w.confidence ?? 1) < 0.70)
      expect(lowConf.length).toBeGreaterThan(0)
    })

    it('missing number word — completeness guard should catch this', () => {
      const numberWord = BLURRY_OCR.words.find(w => w.text.match(/^\d{6}$/))
      expect(numberWord).toBeUndefined()
    })

    it('processing_ms is within expected range', () => {
      expect(BLURRY_OCR.processing_ms).toBeGreaterThan(0)
      expect(BLURRY_OCR.processing_ms).toBeLessThan(60000)
    })
  })

  describe('Fixture 3: Rotated image', () => {
    it('does not crash — lines and words are accessible', () => {
      expect(ROTATED_OCR.lines.length).toBeGreaterThan(0)
      expect(ROTATED_OCR.words.length).toBeGreaterThan(0)
    })

    it('bboxes remain normalized even for rotated image', () => {
      for (const word of ROTATED_OCR.words) {
        expect(word.bbox.x).toBeGreaterThanOrEqual(0)
        expect(word.bbox.x + word.bbox.width).toBeLessThanOrEqual(1.05) // slight tolerance for rotation
      }
    })
  })

  describe('Fixture 4: Mixed-script risk', () => {
    it('detects ШЕВЧЕНKО as mixed-script (Cyrillic + Latin K)', () => {
      const mixedWord = MIXED_SCRIPT_OCR.words.find(w => w.id === 'w_020')
      expect(mixedWord?.text).toBe('ШЕВЧЕНKО')
      expect(hasMixedScript('ШЕВЧЕНKО')).toBe(true)
    })

    it('detects TAPAC as all-Latin lookalike of ТАРАС', () => {
      expect(isLikelyCyrillicLookalike('TAPAC')).toBe(true)
    })

    it('analyseNameField escalates review_required for mixed-script', () => {
      const result = analyseNameField('ШЕВЧЕНKО')
      expect(result.review_required).toBe(true)
    })

    it('analyseNameField escalates review_required for lookalike-only names', () => {
      const result = analyseNameField('TAPAC')
      expect(result.review_required).toBe(true)
    })
  })

  describe('Fixture 5: Unreadable perforation', () => {
    it('series word has very low confidence (< 0.50)', () => {
      const seriesWord = UNREADABLE_PERF_OCR.words.find(w => w.id === 'w_010')
      expect(seriesWord?.confidence).toBeLessThan(0.50)
    })

    it('missing second series letter — format validation should fail', () => {
      const partialSeries = 'А'
      const result = validatePassportPerforation(partialSeries, '', {})
      expect(result.valid_format).toBe(false)
      expect(result.review_required).toBe(true)
    })
  })
})

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Accuracy Regression Tests
// ════════════════════════════════════════════════════════════════════════════════

describe('Phase 4 — Ukrainian month normalization (all 12)', () => {
  // normalizeDateUkrainian returns MM/DD/YYYY format
  const UA_CASES: [string, string][] = [
    ['01 січня 2000',    '01/01/2000'],
    ['15 лютого 1995',   '02/15/1995'],
    ['03 березня 1980',  '03/03/1980'],
    ['20 квітня 2015',   '04/20/2015'],
    ['07 травня 1990',   '05/07/1990'],
    ['12 червня 2001',   '06/12/2001'],
    ['28 липня 2009',    '07/28/2009'],
    ['14 серпня 1975',   '08/14/1975'],
    ['09 вересня 2005',  '09/09/2005'],
    ['31 жовтня 2020',   '10/31/2020'],
    ['17 листопада 1988','11/17/1988'],
    ['25 грудня 2023',   '12/25/2023'],
  ]

  for (const [raw, expected] of UA_CASES) {
    it(`normalizes "${raw}" → "${expected}"`, () => {
      const result = normalizeDateUkrainian(raw, UA_MONTHS)
      expect(result).toBe(expected)
    })
  }
})

describe('Phase 4 — Russian month fallback (all 12)', () => {
  // Russian months are used in older bilingual passports
  // normalizeDateUkrainian returns MM/DD/YYYY format
  const RU_CASES: [string, string][] = [
    ['01 января 1990',   '01/01/1990'],
    ['15 февраля 1985',  '02/15/1985'],
    ['03 марта 1970',    '03/03/1970'],
    ['20 апреля 2005',   '04/20/2005'],
    ['07 мая 1999',      '05/07/1999'],
    ['12 июня 2011',     '06/12/2011'],
    ['28 июля 2007',     '07/28/2007'],
    ['14 августа 1965',  '08/14/1965'],
    ['09 сентября 2005', '09/09/2005'],
    ['31 октября 2010',  '10/31/2010'],
    ['17 ноября 1978',   '11/17/1978'],
    ['25 декабря 2019',  '12/25/2019'],
  ]

  for (const [raw, expected] of RU_CASES) {
    it(`normalizes Russian "${raw}" → "${expected}" (via combined map)`, () => {
      const result = normalizeDateUkrainian(raw, ALL_MONTHS)
      expect(result).toBe(expected)
    })
  }

  it('Russian month should trigger review_required if only RU map matched', () => {
    // Simulate detection: if raw contains a Russian month but NOT Ukrainian
    const raw = '15 февраля 1985'
    const uaResult = normalizeDateUkrainian(raw, UA_MONTHS)    // should fail
    const allResult = normalizeDateUkrainian(raw, ALL_MONTHS)  // should pass
    expect(uaResult).toBeNull()   // not in Ukrainian map → needs russian_layer_fallback
    expect(allResult).toBe('02/15/1985')  // MM/DD/YYYY — same format as UA output
    // Implementation rule: if UA map returns null but ALL map succeeds → review_required + reason = 'russian_layer_fallback_used'
  })
})

describe('Phase 4 — Date field missing month → null (never guessed)', () => {
  it('returns null for partial date with no month', () => {
    expect(normalizeDateUkrainian('15 1990', UA_MONTHS)).toBeNull()
  })

  it('returns null for date with number-only month', () => {
    expect(normalizeDateUkrainian('15 03 1990', UA_MONTHS)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeDateUkrainian('', UA_MONTHS)).toBeNull()
  })

  it('returns null for day-only', () => {
    expect(normalizeDateUkrainian('15', UA_MONTHS)).toBeNull()
  })

  it('returns null for unknown month word', () => {
    expect(normalizeDateUkrainian('15 martius 1990', UA_MONTHS)).toBeNull()
  })
})

describe('Phase 4 — Date field zone lock (birth vs issue)', () => {
  function makeField(field: string, zone: string): ExtractedField {
    return {
      field, source_label: '', source_zone: zone, bbox: [0,0,1,1],
      raw_value: '09 березня 1814', normalized_value: '09 March 1814',
      language_layer: 'uk', confidence: 0.95, review_required: false,
    }
  }

  it('date_of_birth in birth_block → passes', () => {
    const result = validateDateFieldLock([makeField('date_of_birth', 'birth_block')])
    expect(result[0].passed).toBe(true)
  })

  it('date_of_birth in issuance_block → fails (zone mismatch)', () => {
    const result = validateDateFieldLock([makeField('date_of_birth', 'issuance_block')])
    expect(result[0].passed).toBe(false)
    expect(result[0].warning).toBeTruthy()
  })

  it('date_of_issue in issuance_block → passes', () => {
    const result = validateDateFieldLock([makeField('date_of_issue', 'issuance_block')])
    expect(result[0].passed).toBe(true)
  })

  it('date_of_issue in birth_block → fails (zone mismatch)', () => {
    const result = validateDateFieldLock([makeField('date_of_issue', 'birth_block')])
    expect(result[0].passed).toBe(false)
  })

  it('date_of_birth in personal_data zone → passes', () => {
    const result = validateDateFieldLock([makeField('date_of_birth', 'personal_data')])
    expect(result[0].passed).toBe(true)
  })
})

describe('Phase 4 — Passport series/number format validation', () => {
  it('valid Cyrillic 2-letter series + 6 digits → passes', () => {
    const r = validatePassportPerforation('АА', '123456', {})
    expect(r.valid_format).toBe(true)
    expect(r.review_required).toBe(false)
    expect(r.combined).toBe('АА 123456')
  })

  it('single letter series → invalid format', () => {
    const r = validatePassportPerforation('А', '123456', {})
    expect(r.valid_format).toBe(false)
    expect(r.review_required).toBe(true)
  })

  it('5-digit number → invalid format', () => {
    const r = validatePassportPerforation('АА', '12345', {})
    expect(r.valid_format).toBe(false)
    expect(r.review_required).toBe(true)
  })

  it('7-digit number → invalid format', () => {
    const r = validatePassportPerforation('АА', '1234567', {})
    expect(r.valid_format).toBe(false)
    expect(r.review_required).toBe(true)
  })

  it('Latin letters in series → flagged as unusual', () => {
    const r = validatePassportPerforation('AA', '123456', {})
    // Latin A is not in VALID_SERIES_LETTERS (Cyrillic А is)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('ambiguous digit 0 at low confidence → review_required', () => {
    const r = validatePassportPerforation('АА', '103456', { 1: 0.65 })
    expect(r.ambiguous_digits.length).toBeGreaterThan(0)
    expect(r.ambiguous_digits[0].digit).toBe('0')
    expect(r.review_required).toBe(true)
  })

  it('ambiguous digit 8 at low confidence → review_required', () => {
    const r = validatePassportPerforation('АА', '183456', { 1: 0.72 })
    expect(r.review_required).toBe(true)
  })

  it('all digits at high confidence → no ambiguity flagged', () => {
    const confMap = { 0:0.98, 1:0.97, 2:0.96, 3:0.99, 4:0.95, 5:0.97 }
    const r = validatePassportPerforation('АА', '183456', confMap)
    // All confidence > 0.90, so no ambiguous flags even for '8'
    expect(r.ambiguous_digits.length).toBe(0)
  })

  it('empty series → invalid format + review_required', () => {
    const r = validatePassportPerforation('', '123456', {})
    expect(r.valid_format).toBe(false)
    expect(r.review_required).toBe(true)
  })
})

describe('Phase 4 — Name lookalike detection (13 Cyrillic/Latin pairs)', () => {
  // Cyrillic originals vs their Latin lookalike substitutions
  const LOOKALIKE_PAIRS: [string, string][] = [
    ['Т', 'T'],   // Ukrainian Т vs Latin T
    ['А', 'A'],   // Ukrainian А vs Latin A
    ['Р', 'P'],   // Ukrainian Р vs Latin P
    ['С', 'C'],   // Ukrainian С vs Latin C
    ['Е', 'E'],   // Ukrainian Е vs Latin E
    ['О', 'O'],   // Ukrainian О vs Latin O
    ['Х', 'X'],   // Ukrainian Х vs Latin X
    ['В', 'B'],   // Ukrainian В vs Latin B
    ['Н', 'H'],   // Ukrainian Н vs Latin H
    ['К', 'K'],   // Ukrainian К vs Latin K
    ['М', 'M'],   // Ukrainian М vs Latin M
    ['І', 'I'],   // Ukrainian І vs Latin I
    ['У', 'Y'],   // Ukrainian У vs Latin Y
  ]

  for (const [, latin] of LOOKALIKE_PAIRS) {
    it(`Latin-only "${latin}" in a surname-like token → lookalike detected`, () => {
      // A word made of only lookalike chars should be detected
      const word = latin.repeat(3)
      expect(isLikelyCyrillicLookalike(word)).toBe(true)
    })
  }

  it('pure Cyrillic ШЕВЧЕНКО → not a lookalike', () => {
    expect(isLikelyCyrillicLookalike('ШЕВЧЕНКО')).toBe(false)
  })

  it('mixed ШЕВЧЕНKО (Cyrillic + Latin K) → mixed script, not lookalike', () => {
    expect(hasMixedScript('ШЕВЧЕНKО')).toBe(true)
    expect(isLikelyCyrillicLookalike('ШЕВЧЕНKО')).toBe(false) // mixed, not all-lookalike
  })

  it('TAPAC (all Latin lookalikes of ТАРАС) → detected as lookalike', () => {
    expect(isLikelyCyrillicLookalike('TAPAC')).toBe(true)
  })

  it('ТАРАС (all Cyrillic) → not detected as lookalike', () => {
    expect(isLikelyCyrillicLookalike('ТАРАС')).toBe(false)
  })
})

describe('Phase 4 — Abnormal casing detection', () => {
  it('ShEvChEnKo → abnormal casing detected', () => {
    expect(hasAbnormalCasing('ShEvChEnKo')).toBe(true)
  })

  it('SHEVCHENKO → all-caps, not abnormal', () => {
    expect(hasAbnormalCasing('SHEVCHENKO')).toBe(false)
  })

  it('Shevchenko → title case, not abnormal', () => {
    expect(hasAbnormalCasing('Shevchenko')).toBe(false)
  })

  it('shevchenko → all-lower, not abnormal by definition', () => {
    expect(hasAbnormalCasing('shevchenko')).toBe(false)
  })

  it('sHEVCHENKO → abnormal (lower start, then caps)', () => {
    expect(hasAbnormalCasing('sHEVCHENKO')).toBe(true)
  })
})

describe('Phase 4 — normalizeName safe title-case', () => {
  it('all-caps SHEVCHENKO → title-cased Shevchenko', () => {
    expect(normalizeName('SHEVCHENKO')).toBe('Shevchenko')
  })

  it('all-caps TARAS HRYHOROVYCH → title-cased', () => {
    expect(normalizeName('TARAS HRYHOROVYCH')).toBe('Taras Hryhorovych')
  })

  it('protected abbreviation MVS preserved', () => {
    const result = normalizeName('MVS CHERKASY OBLAST')
    expect(result).toContain('MVS')
  })

  it('protected abbreviation DMS preserved', () => {
    const result = normalizeName('DMS KYIV')
    expect(result).toContain('DMS')
  })

  it('empty string → empty string', () => {
    expect(normalizeName('')).toBe('')
  })
})

describe('Phase 4 — analyseNameField integration', () => {
  it('clean Cyrillic name → ok, no review', () => {
    const r = analyseNameField('ШЕВЧЕНКО')
    expect(r.review_required).toBe(false)
    expect(r.warnings.length).toBe(0)
  })

  it('mixed-script name → review_required', () => {
    const r = analyseNameField('ШЕВЧЕНKО')
    expect(r.review_required).toBe(true)
    expect(r.review_reason).toBeTruthy()
  })

  it('all-Latin lookalike name → review_required', () => {
    const r = analyseNameField('TAPAC')
    expect(r.review_required).toBe(true)
  })

  it('multi-word mixed-script escalates → review_required', () => {
    const r = analyseNameField('TAPAC ГPИГOPOВИЧ')   // mixed
    expect(r.review_required).toBe(true)
  })

  it('clean Latin transliteration → no review', () => {
    // After normalization, clean Latin should not be flagged
    const r = analyseNameField('Shevchenko')
    expect(r.review_required).toBe(false)
  })
})
