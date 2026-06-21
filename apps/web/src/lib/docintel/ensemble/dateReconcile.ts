/**
 * docintel/ensemble/dateReconcile — cross-engine date reconciliation.
 *
 * WHY: handwritten Cyrillic DATES are the single field a general vision LLM
 * misreads (GT bench 2026-06-10: Gemini stably read the wrong month). The
 * proven fix (live-tested on a real handwritten birth cert) is an ENSEMBLE:
 * Gemini and Google Vision DISAGREE on the handwritten month — and Vision read
 * it correctly where Gemini did not. Neither engine alone is reliable; together,
 * agreement = trust, disagreement = a hard signal to force human review with BOTH
 * candidates surfaced. This module is the deterministic reconciler; the engines
 * are called by the caller and their date strings passed in here.
 *
 * No engine I/O, no AI. Ukrainian + Russian month words supported. Never invents.
 */

export interface DateCandidate {
  source: string        // 'gemini' | 'gemini_crop' | 'google_vision' | …
  /** raw recognized date text from this engine (any common form). */
  text: string
}

export interface ParsedDate { day: number | null; month: number | null; year: number | null }

export interface DateReconcileResult {
  agree: boolean
  /** ISO YYYY-MM-DD when fully agreed AND complete; else null. */
  value: string | null
  reviewRequired: boolean
  reasonCodes: string[]
  /** per-component winners with provenance, for the review UI to surface. */
  components: { day: Resolved; month: Resolved; year: Resolved }
  candidates: Array<{ source: string; parsed: ParsedDate }>
}
interface Resolved { value: number | null; agreed: boolean; sources: string[] }

// month index 1..12 → all accepted Ukrainian + Russian spellings (lowercased stems).
const MONTH_STEMS: Record<number, string[]> = {
  1: ['січ', 'январ', 'янв'], 2: ['лют', 'феврал', 'фев'], 3: ['берез', 'март', 'мар'],
  4: ['квіт', 'апрел', 'апр'], 5: ['трав', 'ма'], 6: ['черв', 'июн'], 7: ['лип', 'июл'],
  8: ['серп', 'август', 'авг'], 9: ['вер', 'сентябр', 'сен'], 10: ['жовт', 'октябр', 'окт'],
  11: ['листоп', 'ноябр', 'ноя'], 12: ['груд', 'декабр', 'дек'],
}

function monthFromWord(s: string): number | null {
  const t = s.toLowerCase()
  // longest-stem match first so 'мар' doesn't shadow 'март', etc.
  let best: number | null = null, bestLen = 0
  for (const [m, stems] of Object.entries(MONTH_STEMS)) {
    for (const st of stems) {
      if (t.includes(st) && st.length > bestLen) { best = Number(m); bestLen = st.length }
    }
  }
  return best
}

/** Parse one engine's date string → {day, month, year}. Accepts "14 червня 1990",
 *  "1990-06-14", "06/14/1990", "14.06.1990", and OCR-noisy variants with a month word. */
export function parseDateText(text: string): ParsedDate {
  const t = (text ?? '').trim()
  if (!t) return { day: null, month: null, year: null }

  // ISO / numeric first
  const iso = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] }
  const mdy = t.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/)
  if (mdy) {
    const a = +mdy[1], b = +mdy[2]
    // MM/DD/YYYY if first ≤12 and second >12; else DD.MM.YYYY
    const month = a <= 12 && b > 12 ? a : b
    const day = a <= 12 && b > 12 ? b : a
    return { day, month, year: +mdy[3] }
  }

  // word-month form: day (1-2 digits) … monthWord … year (4 digits)
  const year = t.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]
  const day = t.match(/\b(\d{1,2})\b/)?.[1]
  const month = monthFromWord(t)
  return {
    day: day ? +day : null,
    month,
    year: year ? +year : null,
  }
}

const ALL_MONTH_STEMS = Object.values(MONTH_STEMS).flat().join('|')
// Day is OPTIONAL: OCR of a handwritten date region often yields "<month> YYYY"
// without a clean adjacent day digit. Capturing month+year still lets the
// reconciler catch a MONTH disagreement (the high-value handwritten signal).
const WORD_DATE_RE = new RegExp(`(?:\\b(\\d{1,2})\\s+)?\\p{L}*(?:${ALL_MONTH_STEMS})\\p{L}*\\s+(1[89]\\d{2}|20\\d{2})`, 'giu')
const ISO_DATE_RE = /\b\d{4}-\d{1,2}-\d{1,2}\b/g
const NUM_DATE_RE = /\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g

/**
 * Pull every date-like substring out of an OCR full-text blob (e.g. Google
 * Vision raw_text). Used to feed a SECOND engine's date readings into
 * reconcileDate. Returns the raw matched strings (parseDateText handles them).
 */
export function extractDateCandidatesFromText(text: string): string[] {
  const t = text ?? ''
  const out = new Set<string>()
  for (const re of [WORD_DATE_RE, ISO_DATE_RE, NUM_DATE_RE]) {
    for (const m of t.matchAll(re)) out.add(m[0].trim().replace(/\s+/g, ' '))
  }
  return [...out]
}

function resolveComponent(vals: Array<{ source: string; v: number | null }>): Resolved {
  const present = vals.filter((x) => x.v != null)
  if (present.length === 0) return { value: null, agreed: false, sources: [] }
  const distinct = [...new Set(present.map((x) => x.v))]
  if (distinct.length === 1) return { value: distinct[0]!, agreed: true, sources: present.map((x) => x.source) }
  // disagreement: no silent winner — return null + the fact it disagreed.
  return { value: null, agreed: false, sources: present.map((x) => x.source) }
}

/**
 * Reconcile a date across independent engine readings.
 * Agreement on a component → trusted; ANY disagreement or missing component →
 * reviewRequired with all candidates surfaced. Never picks a value silently.
 */
export function reconcileDate(candidates: DateCandidate[]): DateReconcileResult {
  const parsed = candidates.map((c) => ({ source: c.source, parsed: parseDateText(c.text) }))
  const day = resolveComponent(parsed.map((p) => ({ source: p.source, v: p.parsed.day })))
  const month = resolveComponent(parsed.map((p) => ({ source: p.source, v: p.parsed.month })))
  const year = resolveComponent(parsed.map((p) => ({ source: p.source, v: p.parsed.year })))

  const reasonCodes: string[] = []
  if (!day.agreed && day.sources.length > 1) reasonCodes.push('date_day_disagreement')
  if (!month.agreed && month.sources.length > 1) reasonCodes.push('date_month_disagreement')
  if (!year.agreed && year.sources.length > 1) reasonCodes.push('date_year_disagreement')

  const complete = day.value != null && month.value != null && year.value != null
  const allAgreed = day.agreed && month.agreed && year.agreed
  const value = complete && allAgreed
    ? `${year.value}-${String(month.value).padStart(2, '0')}-${String(day.value).padStart(2, '0')}`
    : null

  return {
    agree: allAgreed && complete,
    value,
    reviewRequired: !value, // anything short of full agreement → human confirms
    reasonCodes,
    components: { day, month, year },
    candidates: parsed,
  }
}
