/**
 * labelValueExtractor.ts — Shared label/value extractor for Ukrainian/Russian/bilingual OCR.
 *
 * PURPOSE: Given raw OCR lines and a label pattern, find the VALUE — not the label itself.
 *
 * Core rules:
 *   - If extracted value equals or contains label text → REJECT (return null)
 *   - If value missing → null + review_required=true
 *   - If multiple candidates → first + review_required=true
 *   - NEVER invent missing values
 *   - Bilingual labels (e.g. "Прізвище / Прізвищ") must not leak into value
 *
 * Why this module exists:
 *   Without it, extractFieldFromBlock() returned "/ Прізвищ" or "ім'я, отчество,
 *   по батькові" as field values when OCR printed bilingual label variants on the
 *   same line as the field header. This is a hard-bug class — label text must
 *   NEVER be returned as a field value.
 */

export interface LabelValueResult {
  raw_value: string | null
  review_required: boolean
  rejection_reason?: string
  line_index?: number
  confidence: 'high' | 'medium' | 'low' | null
}

/**
 * Common Ukrainian/Russian label text that should NEVER be returned as a value.
 * Includes truncated forms (e.g. "прізвищ" = partial of "прізвище") as OCR may clip.
 */
const KNOWN_LABELS = new Set([
  // Names
  'прізвище', 'прізвищ', 'прізвища', 'фамилия', 'фамили', 'фамил',
  "ім'я", "ім'я", 'імя', 'имя', 'name', 'given name', 'given names',
  'по батькові', 'побатькові', 'по батьков', 'отчество', 'patronymic',
  // Dates
  'дата народження', 'дата рождения', 'date of birth',
  'дата видачі', 'дата видачи', 'дата складання', 'дата реєстрації',
  // Places
  'місце народження', 'место рождения', 'place of birth',
  'місто народження', 'місце реєстрації',
  // Parents
  'батько', 'батьк', 'отец', 'father',
  'мати', 'мать', 'mother',
  'родители', 'батьки', 'parents',
  'прізвище батька', 'прізвище матері',
  // Document labels
  'серія', 'серия', 'series',
  'акт', 'act', 'номер', 'number', '№',
  'підпис', 'подпись', 'signature',
  'національність', 'национальность', 'nationality',
  'громадянство', 'гражданство', 'citizenship',
  'стать', 'пол', 'sex', 'gender',
  'виданий', 'видано', 'issued by', 'issued',
  'орган', 'organ', 'authority',
  // Administrative
  'район', 'область', 'місто', 'город', 'регіон',
  // Bilingual separators that appear inline
  'отчество, по батькові', 'ім\'я, отчество', 'имя, отчество',
])

/**
 * Returns true if the given text is (or heavily resembles) a field label.
 * Used to reject label text being returned as a value.
 */
export function isLabelText(text: string): boolean {
  const lower = text.toLowerCase().trim()
  const compact = lower.replace(/\s+/g, ' ')

  // Exact match
  if (KNOWN_LABELS.has(compact)) return true

  // Starts with known label (within 5 chars — handles "прізвище:" → "прізвище")
  for (const label of KNOWN_LABELS) {
    if (compact.startsWith(label) && compact.length <= label.length + 6) return true
  }

  // Contains multiple known labels separated by commas/slashes → definitely a label line
  // e.g. "ім'я, отчество, по батькові" or "Прізвище / Прізвищ"
  const labelCount = Array.from(KNOWN_LABELS).filter(l =>
    compact.includes(l) && l.length >= 4
  ).length
  if (labelCount >= 2) return true

  // Looks like punctuation/separator only
  if (/^[:\-—\.\s,;\/\|]+$/.test(text)) return true

  // All-caps Cyrillic institutional headers (e.g. "УКРАЇНА", "ВІЙСЬКОВИЙ КВИТОК")
  if (/^[А-ЯІЇЄҐ\s]{4,}$/u.test(text.trim()) && !/[а-яіїєґ]/u.test(text)) return true

  return false
}

/**
 * Returns true if text contains real Cyrillic content and is NOT label text.
 * Minimum 2 real Cyrillic letters required.
 */
export function isCyrillicValue(text: string): boolean {
  if (!text || text.trim().length < 2) return false
  // Must have at least 2 Cyrillic chars
  if (!/[А-ЯІЇЄҐа-яіїєґ]{2,}/u.test(text)) return false
  // Must not be label text
  if (isLabelText(text)) return false
  // Must not be mostly punctuation/slashes with a short Cyrillic word
  // e.g. "/ Прізвищ" — has Cyrillic but is label remnant
  const stripped = text.replace(/^[\s:\/\-—\.\|,;]+/, '').replace(/[\s:\/\-—\.\|,;]+$/, '')
  if (isLabelText(stripped)) return false
  return true
}

/**
 * Strip common inline label prefixes from a tail string.
 * e.g. "/ Прізвищ" → "" (stripped), "Іваненко" → "Іваненко" (unchanged)
 */
function stripInlineLabelTail(tail: string): string {
  // Remove leading punctuation/slashes
  let cleaned = tail.replace(/^[\s:\/\-—\.\|,;]+/, '').trim()
  // If what remains IS a label, return empty
  if (isLabelText(cleaned)) return ''
  return cleaned
}

/**
 * Extract the value for a label from OCR lines.
 *
 * Strategy:
 *   1. Find a line matching any of labelPatterns
 *   2. Try inline tail (after pattern match) — reject if it's label text
 *   3. Try next N lines — return first that passes isCyrillicValue()
 *   4. Try previous lines (some printed forms put value ABOVE the label)
 *
 * @param lines         Array of OCR lines (already trimmed)
 * @param labelPatterns Regex patterns that identify the label line
 * @param opts          Options: maxLinesAfter (default 3), allowInline (default true),
 *                               allowPrevLine (default true)
 */
export function extractValueAfterLabel(
  lines: string[],
  labelPatterns: RegExp[],
  opts: {
    maxLinesAfter?: number
    allowInline?: boolean
    allowPrevLine?: boolean
  } = {},
): LabelValueResult {
  const maxAfter = opts.maxLinesAfter ?? 3
  const allowInline = opts.allowInline ?? true
  const allowPrevLine = opts.allowPrevLine ?? true

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    for (const pattern of labelPatterns) {
      if (!pattern.test(line)) continue

      // ── 1. Inline tail: "Прізвище: Іваненко" ──────────────────────────────
      if (allowInline) {
        const rawTail = line.replace(pattern, '').replace(/^[\s:\-—.\/|,;]+/, '').trim()
        const tail = stripInlineLabelTail(rawTail)
        if (tail.length >= 2 && isCyrillicValue(tail)) {
          return {
            raw_value: tail,
            review_required: false,
            line_index: i,
            confidence: 'high',
          }
        }
      }

      // ── 2. Previous lines (value above label in some printed forms) ──────
      if (allowPrevLine) {
        for (let off = 1; off <= 2; off++) {
          const prev = lines[i - off]?.trim()
          if (!prev) continue
          if (isLabelText(prev)) break // hit another label going up
          if (isCyrillicValue(prev) && prev.length >= 2) {
            return {
              raw_value: prev,
              review_required: false,
              line_index: i,
              confidence: 'medium',
            }
          }
        }
      }

      // ── 3. Next lines ──────────────────────────────────────────────────────
      const candidates: string[] = []
      for (let j = i + 1; j <= Math.min(i + maxAfter, lines.length - 1); j++) {
        const next = lines[j].trim()
        if (!next) continue
        // Stop scanning if we hit another label (structural boundary)
        if (isLabelText(next)) break
        // Must have real Cyrillic
        if (next.length < 2 || !/[А-ЯІЇЄҐа-яіїєґ]/u.test(next)) continue
        if (isCyrillicValue(next)) {
          candidates.push(next)
          if (candidates.length >= 2) break // found multiple — flag review
        }
      }

      if (candidates.length === 1) {
        return {
          raw_value: candidates[0],
          review_required: false,
          line_index: i,
          confidence: 'medium',
        }
      }
      if (candidates.length > 1) {
        return {
          raw_value: candidates[0],
          review_required: true,
          rejection_reason: 'multiple_candidates',
          line_index: i,
          confidence: 'low',
        }
      }

      // Nothing found after this label
      return {
        raw_value: null,
        review_required: true,
        rejection_reason: 'value_not_found_after_label',
        line_index: i,
        confidence: null,
      }
    }
  }

  return {
    raw_value: null,
    review_required: true,
    rejection_reason: 'label_not_found',
    confidence: null,
  }
}
