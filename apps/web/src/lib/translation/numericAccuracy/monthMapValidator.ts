/**
 * Month Map Validator — v5 §11/§10
 *
 * Resolves Ukrainian and Russian genitive-case month tokens (as written
 * inside Ukrainian dates: "19 лютого 2003") to canonical English month
 * names + month index.
 *
 * Refuses unknown tokens. Calling validators MUST set
 * review_required=true on the field if validateMonthToken returns
 * { valid: false }.
 *
 * Backed by canonical month maps exported from dateFieldLockValidator.ts.
 */
import {
  UKRAINIAN_MONTHS,
  RUSSIAN_MONTHS,
  ALL_MONTHS,
} from './dateFieldLockValidator'

export interface MonthValidatorResult {
  valid: boolean
  /** Canonical English month name, e.g. "May". Empty when invalid. */
  monthName: string
  /** 1-based month index (1..12). 0 when invalid. */
  monthIndex: number
  /** Which language the token resolved through. */
  source: 'uk' | 'ru' | 'en' | 'unknown'
  /** The original token, lowercased and trimmed. */
  normalizedToken: string
}

const ENGLISH_MONTH_BY_INDEX = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** Resolve canonical English month name → 1-based index. */
function indexOfEnglishMonth(name: string): number {
  const lower = name.toLowerCase()
  return ENGLISH_MONTH_BY_INDEX.findIndex(m => m.toLowerCase() === lower) + 1
}

/**
 * Validate a single month token (as encountered in raw OCR text).
 * Token may be capitalised, lowercase, or have extra whitespace.
 */
export function validateMonthToken(token: string): MonthValidatorResult {
  const normalized = token.trim().toLowerCase()

  if (normalized in UKRAINIAN_MONTHS) {
    const en = UKRAINIAN_MONTHS[normalized]
    return {
      valid: true,
      monthName: en,
      monthIndex: indexOfEnglishMonth(en),
      source: 'uk',
      normalizedToken: normalized,
    }
  }

  if (normalized in RUSSIAN_MONTHS) {
    const en = RUSSIAN_MONTHS[normalized]
    return {
      valid: true,
      monthName: en,
      monthIndex: indexOfEnglishMonth(en),
      source: 'ru',
      normalizedToken: normalized,
    }
  }

  // Some OCR returns the English month already (rare, bilingual booklets).
  const englishIdx = ENGLISH_MONTH_BY_INDEX.findIndex(
    m => m.toLowerCase() === normalized,
  )
  if (englishIdx >= 0) {
    return {
      valid: true,
      monthName: ENGLISH_MONTH_BY_INDEX[englishIdx],
      monthIndex: englishIdx + 1,
      source: 'en',
      normalizedToken: normalized,
    }
  }

  return {
    valid: false,
    monthName: '',
    monthIndex: 0,
    source: 'unknown',
    normalizedToken: normalized,
  }
}

/**
 * Convenience: parse a date string like "19 лютого 2003" / "19 лютого 2003 р."
 * into { day, monthIndex, year, monthName, source }. Returns null when
 * the month token is unknown or the day/year is malformed.
 */
export interface ParsedDate {
  day: number
  monthIndex: number
  year: number
  monthName: string
  source: 'uk' | 'ru' | 'en' | 'unknown'
}

export function parseUkrainianDate(raw: string): ParsedDate | null {
  // Trim Ukrainian "р." (рік / year) suffix.
  const cleaned = raw.trim().replace(/[\.,]?\s*р\.?\s*$/u, '').trim()
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  if (tokens.length < 3) return null

  const dayN = Number.parseInt(tokens[0], 10)
  if (!Number.isFinite(dayN) || dayN < 1 || dayN > 31) return null

  // year: last 4-digit token in the sequence
  const yearTok = [...tokens].reverse().find(t => /^\d{4}$/.test(t))
  if (!yearTok) return null
  const yearN = Number.parseInt(yearTok, 10)
  if (yearN < 1900 || yearN > 2100) return null

  const yearIdxFromEnd = [...tokens].reverse().indexOf(yearTok)
  const monthTokens = tokens.slice(1, tokens.length - 1 - yearIdxFromEnd)
  const monthRaw = monthTokens.join(' ').trim()

  const m = validateMonthToken(monthRaw)
  if (!m.valid) return null

  return {
    day: dayN,
    monthIndex: m.monthIndex,
    year: yearN,
    monthName: m.monthName,
    source: m.source,
  }
}

/** Re-export the canonical month maps for downstream consumers. */
export { UKRAINIAN_MONTHS, RUSSIAN_MONTHS, ALL_MONTHS }
