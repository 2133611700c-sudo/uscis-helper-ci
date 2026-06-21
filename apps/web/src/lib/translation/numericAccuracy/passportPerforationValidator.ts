/**
 * Passport Perforation Validator — Messenginfo v5.0
 * Validates Ukrainian internal passport booklet series + number
 * extracted from perforated (punched) text. Flags ambiguous digits.
 *
 * Ukrainian internal passport format: 2 Cyrillic letters + 6 digits
 * Example: "АА 123456", "КА 654321"
 */

export interface PerforationResult {
  series: string
  number: string
  combined: string
  valid_format: boolean
  ambiguous_digits: Array<{ position: number; digit: string; alternatives: string[] }>
  confidence_adjusted: number
  review_required: boolean
  warnings: string[]
}

// Digits that are visually ambiguous in perforation
const AMBIGUOUS_PAIRS: Record<string, string[]> = {
  '0': ['8', '6'],
  '8': ['0', '6'],
  '6': ['0', '8', '9'],
  '9': ['6'],
  '1': ['7'],
}

// Valid Cyrillic series letters for Ukrainian passports
const VALID_SERIES_LETTERS = new Set([
  'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Є', 'Ж', 'З', 'І',
  'К', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У',
  'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Ю', 'Я',
])

export function validatePassportPerforation(
  rawSeries: string,
  rawNumber: string,
  confidenceMap?: Record<number, number>  // position → confidence
): PerforationResult {
  const series = rawSeries.trim().toUpperCase()
  const number = rawNumber.replace(/\s/g, '')
  const combined = `${series} ${number}`
  const warnings: string[] = []

  // Format check
  const formatOk = /^[А-ЯЄІЇҐа-яєіїґ]{2}$/.test(series) && /^\d{6}$/.test(number)
  if (!formatOk) {
    warnings.push(`Passport format invalid: expected 2 Cyrillic letters + 6 digits, got '${combined}'`)
  }

  // Series letter check
  const letters = [...series]
  for (const letter of letters) {
    if (!VALID_SERIES_LETTERS.has(letter)) {
      warnings.push(`Unusual series letter '${letter}' — verify manually`)
    }
  }

  // Ambiguous digit detection
  const ambiguous: PerforationResult['ambiguous_digits'] = []
  const digits = [...number]
  for (let i = 0; i < digits.length; i++) {
    const d = digits[i]
    const conf = confidenceMap?.[i] ?? 1.0
    if (AMBIGUOUS_PAIRS[d] && conf < 0.90) {
      ambiguous.push({
        position: i,
        digit: d,
        alternatives: AMBIGUOUS_PAIRS[d],
      })
    }
  }

  if (ambiguous.length > 0) {
    warnings.push(
      `${ambiguous.length} ambiguous perforated digit(s) at positions: ` +
      ambiguous.map(a => `${a.position}('${a.digit}'→${a.alternatives.join('/')})`).join(', ')
    )
  }

  // Adjust confidence
  const baseConfidence = formatOk ? 0.92 : 0.50
  const penaltyPerAmbiguous = 0.08
  const confidence_adjusted = Math.max(
    0,
    baseConfidence - ambiguous.length * penaltyPerAmbiguous
  )

  return {
    series,
    number,
    combined,
    valid_format: formatOk,
    ambiguous_digits: ambiguous,
    confidence_adjusted,
    review_required: !formatOk || ambiguous.length > 0 || confidence_adjusted < 0.70,
    warnings,
  }
}
