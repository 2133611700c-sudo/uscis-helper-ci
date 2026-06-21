/**
 * Passport-booklet extraction module — Ukrainian internal passport (паспорт-книжка).
 *
 * Input:  OcrResult from /api/tps/ocr/extract
 * Output: TpsModuleResult with TpsExtractedField[] for the few fields the
 *         I-821 needs that we can read from the internal-passport booklet:
 *
 *           family_name        ← Прізвище / Фамилия
 *           given_name         ← Ім'я / Имя
 *           middle_name        ← По батькові / Отчество
 *           dob                ← Дата народження
 *           sex                ← Стать / Пол
 *           city_of_birth      ← Місце народження (city/settlement part)
 *           province_of_birth  ← Місце народження (oblast part)
 *           passport_number    ← Series+Number, e.g. "ЕА 991991"
 *           country_of_nationality ← always 'Ukraine'
 *           passport_country_of_issuance ← always 'Ukraine'
 *
 * Why this module exists:
 *   The TPS USCIS Form I-821 Instructions allow ANY national ID with photo,
 *   including the internal Ukrainian passport-booklet. Many real Ukrainian
 *   users never had a foreign-travel passport (загранпаспорт with TD3 MRZ);
 *   they only have the internal booklet. Without this module the OCR path
 *   would fail for them and force manual entry.
 *
 * Strategy:
 *   Label-based extraction. The booklet has Cyrillic labels printed next to
 *   handwritten field values. We:
 *     1. Find the page-1 dotted series-number header (e.g. "ЕА 991991") via
 *        regex over OcrLine text.
 *     2. For each critical field, find a line containing the label string
 *        (Cyrillic, fuzzy), then take the nearest non-empty adjacent line.
 *     3. Mark EVERY extracted field as review_required=true — handwritten
 *        Cyrillic OCR is unreliable; user MUST verify.
 *     4. passport_expiration_date is NEVER returned — internal booklets have
 *        no expiration. Caller (GeneratePacketBlock) must surface this to
 *        the user as a manual field.
 *
 * Privacy: place of birth, marital status, etc. are NOT extracted — they
 * are not USCIS form fields and we deliberately do not propagate them.
 */

import type { OcrResult, OcrLine } from '@/lib/ocr/types'
import type {
  TpsExtractedField,
  TpsModuleResult,
  TpsDocType,
} from '@/lib/tps/types'

const BOOKLET_MODULE: TpsDocType = 'passport'

// Series+number lives on every page top: two Cyrillic letters + 6 digits,
// printed as perforation. e.g. "ЕА 991991", "КН 123456". OCR reads it as
// the dotted version most of the time. We accept Vision's variants:
//   - "ЕА 991991"
//   - "ЕА991991" (no space)
//   - "ЕА 991 991" or "ЕА 99 19 91" (spaced digit groups)
//   - "EA 991991" (Latin look-alikes mistaken for Cyrillic)
// We allow Latin A/B/C/E/H/I/K/M/O/P/T/X for letters because Cyrillic
// letters that look identical to those Latin chars confuse Vision.
const SERIES_NUMBER_RE =
  /\b([А-ЯІЇЄҐABCEHIKMOPTX]{2})\s*((?:[0-9]\s*){6})\b/u

// Date of birth — many formats. We try several:
//   "01 січня 1990 року"  (UA written-out month)
//   "25 июня 1986 года"     (RU written-out month)
//   "01.01.1990" / "01/01/1990"
//   "01-01-1990"
const UA_MONTHS: Record<string, number> = {
  січня: 1, лютого: 2, березня: 3, квітня: 4, травня: 5, червня: 6,
  липня: 7, серпня: 8, вересня: 9, жовтня: 10, листопада: 11, грудня: 12,
}
const RU_MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
}

interface LineCandidate {
  line: OcrLine
  text: string
  idx: number
}

/**
 * Index every line of an OcrResult into a flat array — easier to scan
 * for adjacent label/value pairs.
 */
function indexLines(ocr: OcrResult): LineCandidate[] {
  return ocr.lines.map((line, idx) => ({
    line,
    text: (line.text ?? '').trim(),
    idx,
  }))
}

/**
 * Case-insensitive substring match in a line, tolerant to Latin/Cyrillic
 * confusables (e.g. Latin 'I' vs Cyrillic 'І').
 *
 * Vision reads "Ім'я" as "IM'A" (the M is also Latin) in many booklet
 * scans, so we must reverse-map ALL Latin look-alikes — not just I/E/A —
 * before comparing to a Cyrillic label.
 */
function lineMatchesLabel(text: string, label: string): boolean {
  if (!text || !label) return false
  // Latin → Cyrillic look-alike substitutions covering every char that
  // ever appears in a Ukrainian booklet label.
  const SUBS: ReadonlyArray<[RegExp, string]> = [
    [/A/g, 'А'], [/B/g, 'В'], [/C/g, 'С'], [/E/g, 'Е'], [/H/g, 'Н'],
    [/I/g, 'І'], [/K/g, 'К'], [/M/g, 'М'], [/O/g, 'О'], [/P/g, 'Р'],
    [/T/g, 'Т'], [/X/g, 'Х'], [/Y/g, 'У'],
  ]
  const normChunk = (s: string) => {
    let t = s.toUpperCase().replace(/['ʼ`’]/g, '')
    for (const [re, repl] of SUBS) t = t.replace(re, repl)
    // Drop everything that isn't a Cyrillic letter — strips slashes,
    // English label residue ("Surname"), whitespace, etc.
    return t.replace(/[^А-ЯІЇЄҐ]/gu, '')
  }
  const l = normChunk(label)
  if (!l.length) return false
  // Short single-word labels (≤ 6 Cyrillic chars, no slash/space) use
  // token-level matching to prevent false positives where the label
  // is a prefix of a longer unrelated word. Example: "Пол" (sex, 3 chars)
  // must NOT match "Поліграфічний" (printing company, 14 chars).
  // Each space-separated token is normalized independently; the match
  // requires the token to start with the label AND be ≤ label+3 chars
  // (allows declension endings).
  if (!label.includes('/') && !label.includes(' ') && l.length <= 6) {
    return text.split(/\s+/).some(chunk => {
      const c = normChunk(chunk)
      return c.startsWith(l) && c.length <= l.length + 3
    })
  }
  // Long or compound labels: full normalized-text substring match.
  const t = normChunk(text)
  return t.includes(l)
}

/**
 * Strip bilingual-layer noise from an extracted booklet value.
 *
 * The Ukrainian booklet is bilingual: labels are printed as
 *   "Прізвище / Surname"
 *   "Ім'я / Given Names"
 *   "Дата народження / Date of birth"
 * Vision often reads the slash + English label as part of the line, so
 * what we want as "Шевченко" arrives as "/ Surname Шевченко" or
 * "Шевченко / Surname". We strip:
 *   - leading separators ":-—_/"
 *   - a leading or trailing English-word run (Latin letters)
 *   - duplicate inner whitespace
 */
function stripBilingualNoise(s: string): string {
  let t = s.trim()
  // Strip leading separator(s)
  t = t.replace(/^[:\-—_\/\s.]+/, '')
  // 2026-05-21 FIX_TPS_BOOKLET_ENGLISH_LABEL_STRIP_BEFORE_DIGITS:
  // Strip well-known English passport-label prefixes even when followed
  // by DIGITS instead of Cyrillic. The previous regex only fired when
  // a Cyrillic value followed, so DOB lines like "Date of birth 13 СЕР
  // / AUG 60" kept the "Date of birth" prefix and surfaced as raw OCR
  // garbage in the wizard. Hardcode the small set of English labels
  // that appear on the Ukrainian booklet (date of birth, place of
  // birth, surname, given names, nationality, sex, authority).
  t = t.replace(
    /^(?:date\s+of\s+(?:birth|issue|expiry|expir(?:y|ation)|issuance)|place\s+of\s+(?:birth|issue|issuance)|surname|given\s+names?|nationality|sex|authority)\b[:\s.\-—\/]*/i,
    '',
  )
  // Strip a leading English-label run: "Surname Шевченко" → "Шевченко"
  t = t.replace(/^[A-Za-z][A-Za-z .'\-]{0,40}(?=\s+[А-ЯІЇЄҐа-яіїєґ])/u, '')
  // Strip a trailing English-label run: "Шевченко / Surname" → "Шевченко"
  t = t.replace(/\s*[\/\-—]\s*[A-Za-z][A-Za-z .'\-]{0,40}$/u, '')
  // Strip any trailing Latin-only word salad after the Cyrillic value
  t = t.replace(/([А-ЯІЇЄҐа-яіїєґ][А-ЯІЇЄҐа-яіїєґ\-' ]+?)\s+[A-Za-z][A-Za-z .'\-]{0,40}$/u, '$1')
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Latin → Cyrillic look-alike reverse map for Ukrainian/Russian context.
 *
 * Real-world failure mode: Google Vision often reads handwritten Cyrillic
 * letters that visually match Latin glyphs as Latin. So "ТАРАС" (Cyrillic)
 * arrives as "TAPAC" (Latin). For an all-look-alike string we would
 * previously discard it as "junk" — losing the real name. With this map
 * we recognize the substitution and rebuild the Cyrillic so KMU-55
 * transliteration produces the correct USCIS-spelling ("Taras", not
 * "Tarac" or worse).
 *
 * Only characters that have BOTH a Cyrillic glyph and a visually
 * identical Latin glyph are in this map. Latin B/D/F/G/J/L/N/Q/R/S/U/V/W/Z
 * are deliberately NOT included — they're not common look-alike
 * substitutions and including them would cause false positives on
 * actual English values.
 */
const LATIN_TO_CYRILLIC_LOOKALIKE: Record<string, string> = {
  'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н',
  'I': 'І', 'K': 'К', 'M': 'М', 'O': 'О', 'P': 'Р',
  'T': 'Т', 'X': 'Х', 'Y': 'У',
  'a': 'а', 'c': 'с', 'e': 'е', 'i': 'і', 'o': 'о',
  'p': 'р', 'x': 'х', 'y': 'у',
}

/**
 * True when every character is either:
 *   - whitespace / dash / apostrophe (separators)
 *   - a Latin character that has a Cyrillic look-alike
 * i.e. the string CAN be the Cyrillic value that Vision misread.
 */
function isAllLookalikeLatin(s: string): boolean {
  if (!s) return false
  let sawLetter = false
  for (const ch of s) {
    if (/\s|[-'’ʼ`]/u.test(ch)) continue
    if (!(ch in LATIN_TO_CYRILLIC_LOOKALIKE)) return false
    sawLetter = true
  }
  return sawLetter
}

/**
 * Reverse-map Latin look-alike chars back to their Cyrillic equivalents.
 * Non-look-alike Latin chars are preserved (so "Smith" → "Smith"),
 * but in practice this is only called when isAllLookalikeLatin returned
 * true.
 */
function unlookalike(s: string): string {
  let out = ''
  for (const ch of s) {
    out += LATIN_TO_CYRILLIC_LOOKALIKE[ch] ?? ch
  }
  return out
}

/**
 * Did the cleaned value end up looking like junk? (e.g. only a separator
 * or only Latin label words). Used to know whether to fall back to the
 * NEXT line instead of returning a useless "value".
 *
 * Special case: if the value is all Latin LOOK-ALIKES (chars that have
 * Cyrillic counterparts) AND ≥2 letters, it's likely real Cyrillic that
 * Vision misread — treat as NOT junk. The caller is expected to reverse-
 * map before transliterating.
 */
function isValueJunk(s: string): boolean {
  if (!s || s.length < 2) return true
  const hasCyrillic = /[А-ЯІЇЄҐа-яіїєґ]/u.test(s)
  const hasDigit = /\d/.test(s)
  if (hasCyrillic || hasDigit) return false
  // All-Latin: still acceptable if it's all-look-alike (Cyrillic misread).
  if (isAllLookalikeLatin(s)) return false
  return true
}

/**
 * Find the value associated with a label. 
 * 
 * BUG-7 FIX (2026-05-24): Ukrainian booklet layout has handwritten value
 * ABOVE the printed label, not below it. The OCR reads top-to-bottom, so
 * the value line comes BEFORE the label line in the array. Previous code
 * checked NEXT lines first (step 2) then PREVIOUS as "fallback" (step 3).
 * This caused every field to grab the WRONG value (the next field's value
 * instead of the current one).
 *
 * Fixed order: same-line → PREVIOUS lines → NEXT lines.
 */
function findValueNear(
  lines: LineCandidate[],
  labelIdx: number,
  label: string,
): { value: string; sourceLine: OcrLine } | null {
  const labelLine = lines[labelIdx]
  if (!labelLine) return null

  // 1) Same-line continuation: text after the label match.
  const text = labelLine.text
  const labelStartCi = text.toLowerCase().indexOf(label.toLowerCase())
  if (labelStartCi >= 0) {
    const tail = text.slice(labelStartCi + label.length).trim()
    if (tail.length >= 2 && !/^[:\-—_\.]+$/.test(tail)) {
      const cleaned = stripBilingualNoise(tail)
      if (!isValueJunk(cleaned)) {
        return { value: cleaned, sourceLine: labelLine.line }
      }
    }
  }

  // 2) PREVIOUS lines — booklet standard layout: handwritten value ABOVE
  //    the printed label. This is the PRIMARY search direction.
  for (let off = 1; off <= 2; off++) {
    const prev = lines[labelIdx - off]
    if (!prev || prev.text.length < 2) continue
    if (looksLikeLabel(prev.text)) continue
    const cleaned = stripBilingualNoise(prev.text)
    if (!isValueJunk(cleaned)) {
      return { value: cleaned, sourceLine: prev.line }
    }
  }

  // 3) Fallback: NEXT lines — for edge cases where Vision reorders lines
  //    or the value wraps to the line after the label.
  for (let off = 1; off <= 3; off++) {
    const next = lines[labelIdx + off]
    if (!next || next.text.length < 2) continue
    if (looksLikeLabel(next.text)) continue
    const cleaned = stripBilingualNoise(next.text)
    if (!isValueJunk(cleaned)) {
      return { value: cleaned, sourceLine: next.line }
    }
  }

  return null
}

/**
 * Cheap heuristic: this line is probably a printed label, not a value.
 * Used to skip past consecutive label lines when searching for a value.
 */
function looksLikeLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, '').toLowerCase()
  const labelHints = [
    'прізвище', 'призвище', 'фамилия',
    'ім\'я', 'імя', 'имя',
    'побатькові', 'отчество',
    'датанародження', 'датарождения',
    'місценародження', 'местарождения', 'местарожд',
    'паспортгромадянинаукраїни',
    'паспортгражданинаукраины',
    'підписвласникапаспорта',
  ]
  return labelHints.some((h) => compact.includes(h))
}

/**
 * Title-case a Cyrillic name. "ИВАН" → "Иван", "ИВАН ПЕТРОВИЧ" → "Иван Петрович".
 *
 * Also handles the all-Latin-look-alike case: when Vision misread the
 * Cyrillic name as Latin homoglyphs (e.g. "TAPAC" instead of "ТАРАС"),
 * we reverse-map back to Cyrillic before title-casing. This is the
 * crucial fix that lets booklet given_name extraction work in practice.
 */
function titleCaseCyrillic(s: string): string {
  const restored = isAllLookalikeLatin(s) ? unlookalike(s) : s
  return restored
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim()
}

/**
 * Parse a Ukrainian/Russian date into ISO YYYY-MM-DD, or null on failure.
 */
// 3-letter abbreviations seen on Ukrainian booklet date strips (lowercase).
// Latin look-alike variants are folded back to Cyrillic by parseUaDate before
// lookup, so we only need ONE entry per real month.
const MONTH_ABBR3: Record<string, number> = {
  // UA Cyrillic abbreviations (січ, лют, бер, кві, тра, чер, лип, сер, вер, жов, лис, гру)
  січ: 1, лют: 2, бер: 3, кві: 4, тра: 5, чер: 6,
  лип: 7, сер: 8, вер: 9, жов: 10, лис: 11, гру: 12,
  // RU Cyrillic abbreviations (янв, фев, мар, апр, май, июн, июл, авг, сен, окт, ноя, дек)
  янв: 1, фев: 2, мар: 3, апр: 4, май: 5, июн: 6,
  июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
  // English abbreviations (Jan/Feb/Mar/.../Dec) — the bilingual right column.
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

// Latin char → Cyrillic look-alike. Used to fix Vision misreads like "CEP"
// for "СЕР" (серпня = August). Apply ONLY when the token has no Latin chars
// that are NOT in this lookalike set — guards against mangling real English
// abbreviations like "MAY".
const LATIN_TO_CYR: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І',
  K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
}
function tryUnlookalikeToken(token: string): string | null {
  // Returns the Cyrillic-restored token if every uppercase letter is a
  // known look-alike; null otherwise.
  const upper = token.toUpperCase()
  let out = ''
  for (const ch of upper) {
    const sub = LATIN_TO_CYR[ch]
    if (sub) { out += sub; continue }
    if (/[А-ЯІЇЄҐ]/u.test(ch)) { out += ch; continue }
    return null // contains a non-lookalike Latin letter — keep as-is
  }
  return out.toLowerCase()
}

function parseUaDate(s: string): string | null {
  // 2026-05-21 FIX_TPS_BOOKLET_DOB_PARSE_ABBR: extend the parser so it
  // handles the date format actually printed on Ukrainian booklet
  // photo pages — "13 СЕР / AUG 60" — which OCR usually delivers as
  // "13 CEP / AUG 60" (Cyrillic СЕР look-alike-mangled to Latin CEP).
  // Previously parseUaDate only matched full-word Ukrainian months
  // ("серпня") and numeric formats with separators, so this layout
  // silently returned null and the wizard surfaced the raw OCR text.
  const text = s.trim().toLowerCase()

  // 1) Written-out month: "01 січня 1990" / "25 июня 1986"
  const m1 = text.match(/(\d{1,2})\s+([а-яії]+)\s+(\d{2,4})/u)
  if (m1) {
    const day = parseInt(m1[1], 10)
    const monthWord = m1[2]
    let year = parseInt(m1[3], 10)
    const month =
      UA_MONTHS[monthWord] ??
      RU_MONTHS[monthWord] ??
      MONTH_ABBR3[monthWord.slice(0, 3)] ??
      null
    if (year < 100) year = year > 30 ? 1900 + year : 2000 + year
    if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // 2) Numeric: "01.01.1990" / "01/01/1990" / "01-01-1990"
  const m2 = text.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/)
  if (m2) {
    const day = parseInt(m2[1], 10)
    const month = parseInt(m2[2], 10)
    let year = parseInt(m2[3], 10)
    if (year < 100) year = year > 30 ? 1900 + year : 2000 + year
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // 3) Abbreviated bilingual: "13 CEP / AUG 60" or "13 СЕР AUG 60" etc.
  //    Strategy: pull out the FIRST digit-group as day, the LAST digit-group
  //    as year, then scan every non-digit token between them. If ANY token
  //    (after Latin→Cyrillic look-alike fold) matches a 3-letter month
  //    abbreviation, use it.
  const m3 = text.match(/(\d{1,2})\b([^0-9]+)\b(\d{2,4})\b/)
  if (m3) {
    const day = parseInt(m3[1], 10)
    let year = parseInt(m3[3], 10)
    if (year < 100) year = year > 30 ? 1900 + year : 2000 + year
    const tokens = m3[2]
      .split(/[\s/\\.,\-—_:;]+/u)
      .map((t) => t.trim())
      .filter(Boolean)
    let month: number | null = null
    for (const token of tokens) {
      const head = token.slice(0, 3).toLowerCase()
      // First try the token AS-IS (handles English JAN/FEB/AUG and Cyrillic СЕР).
      if (MONTH_ABBR3[head] !== undefined) {
        month = MONTH_ABBR3[head]
        break
      }
      // Then try Latin→Cyrillic restore (handles OCR-mangled "CEP" → "сер").
      const restored = tryUnlookalikeToken(token.slice(0, 3))
      if (restored && MONTH_ABBR3[restored] !== undefined) {
        month = MONTH_ABBR3[restored]
        break
      }
    }
    if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return null
}

/**
 * Try to detect a Ukrainian internal passport-booklet from an OcrResult.
 * Returns matched=false (with a debug match_reason) if signals are absent.
 */
export function runPassportBookletModule(
  ocr: OcrResult,
  opts: { document_id: string },
): TpsModuleResult {
  const lines = indexLines(ocr)
  const rawText = (ocr.raw_text || '').toLowerCase()

  // ── Match signals: the booklet's distinguishing text features.
  //    We require at least one strong + at least one weak signal.
  const strongSignals = [
    'паспорт громадянина україни',
    'паспорт гражданина украины',
  ]
  const weakSignals = [
    'прізвище', 'призвище', 'фамилия',
    'ім\'я', 'імя', 'имя',
    'дата народження', 'дата рождения',
    'підпис власника', 'подпись владельца',
  ]
  const hasStrong = strongSignals.some((s) => rawText.includes(s))
  const hasWeak = weakSignals.some((s) => rawText.includes(s))

  if (!hasStrong && !hasWeak) {
    return {
      module: BOOKLET_MODULE,
      matched: false,
      match_reason: 'booklet_signals_missing',
      fields: [],
      warnings: [],
      manual_review_required: false,
      manual_review_reasons: [],
    }
  }
  const matchReason = hasStrong
    ? 'booklet_strong_signal_matched'
    : 'booklet_weak_signal_matched'

  // ── Series + number — search the whole text once.
  let passportNumber: string | null = null
  let passportNumberLine: OcrLine | null = null
  for (const lc of lines) {
    const m = lc.text.match(SERIES_NUMBER_RE)
    if (m) {
      passportNumber = `${m[1]} ${m[2]}`.toUpperCase()
      passportNumberLine = lc.line
      break
    }
  }

  // ── Find each labelled field. We try multiple label variants.
  const findField = (labels: string[]): { value: string; sourceLine: OcrLine } | null => {
    for (const label of labels) {
      for (const lc of lines) {
        if (lineMatchesLabel(lc.text, label)) {
          const v = findValueNear(lines, lc.idx, label)
          if (v) return v
        }
      }
    }
    return null
  }

  const surname = findField(['Прізвище', 'Призвище', 'Фамилия'])
  // The given-name label is "Ім'я" in Ukrainian; the apostrophe Vision
  // returns varies (', ʼ, ’, `) — try all forms plus the curly variants
  // plus the plain Russian "Имя".
  const givenName = findField([
    "Ім'я", 'Імʼя', 'Ім’я', 'Ім`я', 'Ім я', 'Імя', 'Имя',
  ])
  const middleName = findField(['По батькові', 'Побатькові', 'Отчество'])
  const dobRaw = findField(['Дата народження', 'Дата рождения', 'Датарождения'])
  // 2026-05-21 FIX_TPS_PASSPORT_MRZ_NUMBER_AND_SEX_FAILURE: booklet
  // had no sex extraction at all. Add it — Ukrainian booklets print
  // "Стать / Sex" (UA) or "Пол / Sex" (RU) followed by single-letter
  // value (Ч=male, Ж=female) or full word. Strict shape validator at
  // wizard intake will only accept M/F/X, so non-conforming OCR reads
  // (e.g. "ЧОЛ" mangled to "yon") get rejected automatically.
  const sexRaw = findField(['Стать', 'Пол', 'Sex'])

  // ── Emit fields. Every booklet field is review_required=true because
  // handwritten Cyrillic OCR is unreliable.
  const fields: TpsExtractedField[] = []
  const warnings: string[] = []

  const emit = (
    field: string,
    raw: string,
    normalized: string | null,
    sourceLine: OcrLine | null,
    sourceZone: string,
    passes: string[] = [],
    failures: string[] = [],
  ) => {
    fields.push({
      field,
      raw_value: raw,
      normalized_value: normalized,
      extraction_source: 'ocr_keyword',
      source_document_id: opts.document_id,
      source_zone: sourceZone,
      bbox: sourceLine?.bbox ?? null,
      language_layer: 'cyrillic',
      confidence: sourceLine?.confidence ?? null,
      review_required: true,
      ocr_word_ids: [],
      passes,
      failures,
      user_corrected: false,
    })
  }

  if (surname) {
    emit(
      'family_name',
      surname.value,
      titleCaseCyrillic(surname.value),
      surname.sourceLine,
      'booklet_label_surname',
    )
  } else {
    warnings.push('booklet_surname_missing')
  }

  if (givenName) {
    emit(
      'given_name',
      givenName.value,
      titleCaseCyrillic(givenName.value),
      givenName.sourceLine,
      'booklet_label_given_name',
    )
  } else {
    warnings.push('booklet_given_name_missing')
  }

  if (middleName) {
    // BUG-6 validation: reject garbage — name should not contain digits,
    // should not be a date fragment, and should be reasonable length.
    const mv = middleName.value.trim()
    const hasDigits = /\d/.test(mv)
    const tooShort = mv.length < 2
    const tooLong = mv.length > 40
    const looksLikeDate = /(?:січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня|января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/iu.test(mv)
    if (!hasDigits && !tooShort && !tooLong && !looksLikeDate) {
      emit(
        'middle_name',
        middleName.value,
        titleCaseCyrillic(middleName.value),
        middleName.sourceLine,
        'booklet_label_patronymic',
      )
    } else {
      warnings.push('booklet_patronymic_rejected_validation')
    }
  }

  if (dobRaw) {
    const iso = parseUaDate(dobRaw.value)
    if (iso) {
      // Only emit when we have a clean ISO date. Previously we emitted
      // the field with normalized_value=null + raw_value=raw, and the
      // wizard's value resolver fell back to the raw OCR string —
      // surfacing things like "Date of birth 13 CEP / AUG 60" as the
      // final DOB shown to the user (regression report 2026-05-21).
      // If parseUaDate refuses the line, we now stay silent and let
      // the wizard render "Не найдено — введите вручную" so the user
      // types the date by hand instead of trusting OCR garbage.
      emit(
        'dob',
        dobRaw.value,
        iso,
        dobRaw.sourceLine,
        'booklet_label_dob',
        ['date_parsed'],
        [],
      )
    } else {
      warnings.push('booklet_dob_unparseable')
    }
  } else {
    // Label "Дата народження" was NOT found by OCR — scan ALL lines for any
    // line that parses as a valid date (booklet_date_scan_fallback).
    // Real booklet failure mode: Vision reads "01 січня 1990 року" but drops
    // the "Дата народження" label entirely, so findField returns null.
    const currentYear = new Date().getUTCFullYear()
    const dateCandidates: Array<{ lc: LineCandidate; iso: string }> = []
    for (const lc of lines) {
      if (looksLikeLabel(lc.text)) continue
      const cleaned = stripBilingualNoise(lc.text)
      const iso = parseUaDate(cleaned)
      if (!iso) continue
      const year = parseInt(iso.slice(0, 4), 10)
      if (year >= 1920 && year <= currentYear - 10) {
        dateCandidates.push({ lc, iso })
      }
    }
    if (dateCandidates.length === 1) {
      const { lc, iso } = dateCandidates[0]
      emit(
        'dob',
        lc.text,
        iso,
        lc.line,
        'booklet_date_scan_fallback',
        ['date_parsed', 'label_scan_fallback'],
        [],
      )
      warnings.push('booklet_dob_label_missing_used_date_scan')
    } else {
      warnings.push('booklet_dob_missing')
    }
  }

  // Try labelled extraction as a FALLBACK when perforation pattern
  // didn't catch (perforation is often photographically faint or cropped).
  // 2026-05-21 FIX_TPS_PASSPORT_MRZ_NUMBER_AND_SEX_FAILURE: code audit
  // showed booklet relied ONLY on perforation pattern for passport_number;
  // if Vision missed the perforation digits, the field was never emitted.
  // Now also look for label "Серія/Номер" or "Серия/Номер" or "Number".
  if (!passportNumber) {
    const labelHit = findField([
      'Серія', 'Серия', 'Series',
      'Номер', 'Number',
      'Серія/Номер', 'Серия/Номер', 'Series/Number',
    ])
    if (labelHit) {
      // Strip spaces and accept only the 2-letter + 6-digit shape we know
      // booklets actually use, with Latin look-alike substitution.
      const cleaned = labelHit.value.toUpperCase().replace(/\s+/g, '')
      // Map Latin look-alikes back to Cyrillic so SERIES_NUMBER_RE matches
      // both "ЕК790396" and Vision's "EK790396" misread.
      const m = cleaned.match(/^([А-ЯІЇЄҐABCEHIKMOPTX]{2})([0-9]{6})$/u)
      if (m) {
        passportNumber = `${m[1]} ${m[2]}`
        passportNumberLine = labelHit.sourceLine
      }
    }
  }

  if (passportNumber) {
    emit(
      'passport_number',
      passportNumber,
      passportNumber,
      passportNumberLine,
      'booklet_series_number',
      ['series_number_format'],
    )
  } else {
    warnings.push('booklet_passport_number_missing')
  }

  // Sex: normalize Ukrainian/Russian/English values to M/F. Anything we
  // can't confidently map gets dropped (the strict wizard validator
  // would reject it anyway).
  if (sexRaw) {
    const v = sexRaw.value.trim().toUpperCase()
    // Strip any trailing punctuation / bilingual residue.
    const head = v.replace(/[^A-ZА-ЯІЇЄҐ]/gu, '').slice(0, 5)
    let normalized: string | null = null
    if (head === 'M' || head === 'MALE' || head === 'Ч' || head === 'ЧОЛ' || head === 'ЧОЛОВ' || head === 'МУЖ' || head === 'МУЖСК') {
      normalized = 'M'
    } else if (head === 'F' || head === 'FEM' || head === 'FEMAL' || head === 'Ж' || head === 'ЖІН' || head === 'ЖІНОЧ' || head === 'ЖЕН' || head === 'ЖЕНСК') {
      normalized = 'F'
    } else if (head === 'X') {
      normalized = 'X'
    }
    if (normalized) {
      emit('sex', sexRaw.value, normalized, sexRaw.sourceLine, 'booklet_label_sex', ['sex_mapped'], [])
    } else {
      warnings.push('booklet_sex_unrecognized')
    }
  } else {
    warnings.push('booklet_sex_missing')
  }

  // Nationality + issuing country are always Ukraine for this document.

  // ── Place of birth: city/settlement + oblast ────────────────────────
  // I-765 Line 18a (city_of_birth) + Line 18b (province_of_birth).
  // Internal passport has "Місце народження / Место рождения" label
  // followed by locality + oblast, often on 2 separate lines.
  //
  // BUG-5 FIX (2026-05-24): findValueNear returns only the FIRST
  // adjacent line. When booklet has city and oblast on separate lines,
  // only one was captured (usually oblast). Now we scan ALL adjacent
  // lines and merge them.
  const OBLAST_RE = /[\wА-ЯІЇЄҐа-яіїєґ']+(?:ської|зької|цької|ського)\s+(?:обл(?:асті)?\.?)/iu

  // Find the label line index first
  let birthLabelIdx = -1
  for (const lc of lines) {
    if (lineMatchesLabel(lc.text, 'Місце народження') ||
        lineMatchesLabel(lc.text, 'Место рождения') ||
        lineMatchesLabel(lc.text, 'Place of birth')) {
      birthLabelIdx = lc.idx
      break
    }
  }

  if (birthLabelIdx >= 0) {
    // BUG-8 FIX (2026-05-24): booklet layout has city ABOVE label and
    // oblast BELOW label. Must scan BOTH directions.
    // Scan from -2 (above label) through +4 (below label)
    const valueParts: string[] = []
    for (let off = -2; off <= 4; off++) {
      const candidate = lines[birthLabelIdx + off]
      if (!candidate || candidate.text.length < 2) continue
      if (looksLikeLabel(candidate.text)) continue
      let cleaned: string
      if (off === 0) {
        // Same line as label — strip the label text itself
        const lowerText = candidate.text.toLowerCase()
        const labelEnd = lowerText.indexOf('народження') >= 0
          ? lowerText.indexOf('народження') + 'народження'.length
          : lowerText.indexOf('рождения') >= 0
            ? lowerText.indexOf('рождения') + 'рождения'.length
            : lowerText.indexOf('birth') >= 0
              ? lowerText.indexOf('birth') + 'birth'.length
              : 0
        cleaned = stripBilingualNoise(candidate.text.slice(labelEnd))
      } else {
        cleaned = stripBilingualNoise(candidate.text)
      }
      if (cleaned && !isValueJunk(cleaned)) {
        valueParts.push(cleaned)
      }
    }

    // Now separate city and oblast from collected parts
    const fullBirthText = valueParts.join(' ')
    let foundCity: string | null = null
    let foundOblast: string | null = null

    // Check each part for oblast pattern
    for (const part of valueParts) {
      if (OBLAST_RE.test(part)) {
        foundOblast = part.trim()
      } else if (!foundCity && part.trim().length >= 2) {
        foundCity = part.trim()
      }
    }

    // Also try regex on full merged text (handles single-line "м. Вінниця Вінницької обл.")
    if (!foundOblast || !foundCity) {
      const oblastMatch = fullBirthText.match(/(.*?)\s*([\wА-ЯІЇЄҐа-яіїєґ']+(?:ської|зької|цької|ського)\s+(?:обл(?:асті)?\.?))/iu)
      if (oblastMatch) {
        if (!foundOblast) foundOblast = oblastMatch[2].trim()
        if (!foundCity && oblastMatch[1].trim()) foundCity = oblastMatch[1].trim()
      }
    }

    // Fallback: if only one part and no oblast → treat as city
    if (!foundCity && !foundOblast && fullBirthText.length >= 2) {
      foundCity = fullBirthText
    }

    const birthSourceLine = lines[birthLabelIdx]?.line ?? null

    // BUG-6 validation: reject garbage city/province values
    const cityValid = foundCity && foundCity.length >= 2 && foundCity.length <= 60
      && !/\d{4}/.test(foundCity)  // no year-like sequences
      && !/(?:січня|червня|серпня|жовтня|января|июня|августа)/iu.test(foundCity)
    const oblastValid = foundOblast && foundOblast.length >= 4

    if (cityValid) {
      emit(
        'city_of_birth',
        foundCity!,
        foundCity!,
        birthSourceLine,
        'booklet_label_birthplace_city',
      )
    }
    if (oblastValid) {
      emit(
        'province_of_birth',
        foundOblast!,
        foundOblast!,
        birthSourceLine,
        'booklet_label_birthplace_oblast',
      )
    }
    if (!cityValid && !oblastValid) {
      warnings.push('booklet_birth_place_unparseable')
    }
  } else {
    warnings.push('booklet_birth_place_missing')
  }

  // ── Issuing authority (Орган, що видав) ────────────────────────────
  // Translation only — not a USCIS form field but required in USCIS-format translation.
  // CB contract blocks this from the form path; translationExtractor picks it up.
  const issuedByRaw = findField([
    'Орган, що видав', 'Органщовидав', 'Орган що видав',
    'Орган выдавший', 'Орган,выдавший',
    'Authority', 'Issued by',
  ])
  if (issuedByRaw) {
    const cleaned = stripBilingualNoise(issuedByRaw.value)
    if (cleaned && cleaned.length >= 4 && cleaned.length <= 200) {
      emit(
        'issued_by',
        cleaned,
        cleaned,
        issuedByRaw.sourceLine,
        'booklet_label_issued_by',
      )
    } else {
      warnings.push('booklet_issued_by_rejected_length')
    }
  } else {
    warnings.push('booklet_issued_by_missing')
  }

  // ── Date of issue (Дата видачі) ─────────────────────────────────────
  // Translation only — not a USCIS form field but required in USCIS-format translation.
  const dateOfIssueRaw = findField([
    'Дата видачі', 'Датавидачі', 'Дата видачи', 'Дата выдачи',
    'Date of issue', 'Date issued',
  ])
  if (dateOfIssueRaw) {
    const iso = parseUaDate(dateOfIssueRaw.value)
    if (iso) {
      emit(
        'passport_date_of_issue',
        dateOfIssueRaw.value,
        iso,
        dateOfIssueRaw.sourceLine,
        'booklet_label_date_of_issue',
        ['date_parsed'],
      )
    } else {
      warnings.push('booklet_date_of_issue_unparseable')
    }
  } else {
    warnings.push('booklet_date_of_issue_missing')
  }

  // Nationality, birth country, and issuing country are always Ukraine
  // for this document type. Emit as inferred (not from OCR).
  emit(
    'country_of_nationality',
    'Ukraine',
    'Ukraine',
    null,
    'booklet_inferred_nationality',
    ['inferred_from_document_type'],
  )
  emit(
    'country_of_birth',
    'Ukraine',
    'Ukraine',
    null,
    'booklet_inferred_birth_country',
    ['inferred_from_document_type'],
  )
  emit(
    'passport_country_of_issuance',
    'Ukraine',
    'Ukraine',
    null,
    'booklet_inferred_issuing_country',
    ['inferred_from_document_type'],
  )

  // Internal Ukrainian passport-booklets do not expire. We DO NOT emit
  // passport_expiration_date — GeneratePacketBlock will treat it as empty
  // and the user must fill it manually (or use a placeholder per
  // USCIS guidance for non-expiring national documents).
  warnings.push('booklet_no_expiration_date')

  const matched = fields.length > 0
  return {
    module: BOOKLET_MODULE,
    matched,
    match_reason: matched ? matchReason : 'booklet_no_fields_extracted',
    fields,
    warnings,
    manual_review_required: true, // ALWAYS — handwritten Cyrillic = always verify
    manual_review_reasons: ['handwritten_cyrillic_low_confidence'],
  }
}
