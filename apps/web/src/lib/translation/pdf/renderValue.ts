/**
 * renderValue.ts — PDF-safe value rendering WITHOUT silent data loss.
 *
 * Replaces the old `safe()` sanitiser in renderOfficialTranslation, which did
 * `replace(/[^\x00-\xFF]/g, '')` — silently DELETING every char above U+00FF.
 * That dropped Cyrillic series letters: "I-АМ 000001" rendered as "I- 000001",
 * corrupting an official document series. Silent deletion is forbidden.
 *
 * Pipeline (no character is ever dropped):
 *   1. KMU-55 transliteration (single source of truth: @uscis-helper/knowledge).
 *      Cyrillic → Latin: "АМ" → "AM", "Шевченко" → "Shevchenko".
 *   2. Known typographic symbols → ASCII equivalents the StandardFont can encode
 *      ("№" → "No.", em-dash → "-", curly quotes → straight).
 *   3. Any STILL-unrenderable char (e.g. CJK, emoji) → visible "[?]" marker,
 *      never removed, and flagged so callers can force review.
 *
 * Names/series/geography that arrive in Cyrillic are transliterated here as a
 * last-resort net; the controlled upstream pipeline should normally resolve them
 * first (KMU-55 names, glossary agencies, registry geography).
 */
import { transliterateKMU55 } from '@uscis-helper/knowledge'

// Typographic / currency symbols outside WinAnsi that StandardFonts cannot draw.
// Mapped to ASCII so the value stays readable instead of vanishing.
const SYMBOL_MAP: Record<string, string> = {
  '№': 'No.', '—': '-', '–': '-', '−': '-',
  '’': "'", '‘': "'", '“': '"', '”': '"', '«': '"', '»': '"',
  '…': '...', '₴': 'UAH', ' ': ' ', ' ': ' ', ' ': ' ',
}

const NON_WINANSI = /[^\x00-\xFF]/g
// One maximal run of Ukrainian/Cyrillic letters (incl. Ґґ). We transliterate each
// run IN PLACE so Latin text, punctuation, and English apostrophes are untouched —
// avoids the name-transliterator's apostrophe-drop and all-caps heuristic leaking
// into mixed label/act strings (e.g. "TRANSLATOR'S", "КМУ Resolution No. 1025").
const CYRILLIC_RUN = /[Ѐ-ӿҐґ]+/g

export interface RenderValueResult {
  /** PDF-safe string — never empty when input was non-empty unless input was empty. */
  text: string
  /** True if any Cyrillic was transliterated to Latin. */
  transliterated: boolean
  /** True if any char could not be rendered and was replaced by a visible marker. */
  unrenderable: boolean
}

/**
 * Convert a source value to a PDF-safe string with NO silent loss.
 * Returns the text plus flags so a field-aware caller can set review_required.
 */
export function renderValueForPdf(input: string | null | undefined): RenderValueResult {
  const raw = input ?? ''
  if (!raw) return { text: '', transliterated: false, unrenderable: false }

  const transliterated = /[Ѐ-ӿҐґ]/.test(raw)
  // Transliterate only Cyrillic runs; leave Latin/punctuation exactly as-is.
  let s = raw.replace(CYRILLIC_RUN, (run) => transliterateKMU55(run))
  for (const [k, v] of Object.entries(SYMBOL_MAP)) {
    if (s.includes(k)) s = s.split(k).join(v)
  }
  let unrenderable = false
  s = s.replace(NON_WINANSI, () => { unrenderable = true; return '[?]' })

  return { text: s, transliterated, unrenderable }
}

/** Convenience: PDF-safe string only (drops the flags). Never deletes silently. */
export function pdfSafe(input: string | null | undefined): string {
  return renderValueForPdf(input).text
}
