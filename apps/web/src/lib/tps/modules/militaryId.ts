/**
 * Military ID extraction module — Ukrainian military booklet (Військовий квиток).
 *
 * Input:  raw OCR text from Google Vision (or any OCR provider)
 * Output: TpsModuleResult with TpsExtractedField[] for identity page fields
 *
 * Strategy:
 *   Regex + keyword anchors on raw OCR text. The military booklet layout
 *   prints labels in Cyrillic followed by values. We scan for label anchors
 *   and extract adjacent lines.
 *
 * HARD RULES (do NOT relax):
 *   - review_required=true on EVERY field (hard-case policy, military docs)
 *   - Does NOT populate: I-94, A-number, EAD category, address, immigration fields
 *   - issuing_authority_english via agency glossary only (no LLM)
 *   - source_page='identity' for page-1 fields, 'service' for service page
 *   - review_required=true ALWAYS — never auto-final for military docs
 *
 * Privacy: rank, unit, military speciality etc. are NOT extracted — not
 * USCIS form fields. Only civil identity fields are surfaced.
 *
 * Reference: documentClassPolicy.ts military_id class:
 *   auto_fill_allowed=true, always_review=false, review_required_fields=['uncertain_fields']
 *   model_candidate='gemini-3.1-flash-image'
 */

import type { OcrResult } from '@/lib/ocr/types'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'
import { lookupAuthority } from '@uscis-helper/knowledge'

// ── Ukrainian month names (genitive — as printed in dates) ────────────────────
const UA_MONTH_MAP: Record<string, string> = {
  'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
  'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
  'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12',
}

// Small agency glossary — expands as new documents are processed.
// Only self-name-on-.gov.ua sources allowed. NEVER third-party.
const AGENCY_GLOSSARY: Record<string, string> = {
  'Тростянецький РВК': 'Trostianets District Military Commissariat',
  'Тростянецький ОМВК': 'Trostianets Unified Military Commissariat',
  'Вінницький ОВК': 'Vinnytsia Oblast Military Commissariat',
  'Вінницький ОМВК': 'Vinnytsia Unified Military Commissariat',
  'Київський ОВК': 'Kyiv Oblast Military Commissariat',
  'Харківський ОВК': 'Kharkiv Oblast Military Commissariat',
  'Одеський ОВК': 'Odesa Oblast Military Commissariat',
  'Дніпропетровський ОВК': 'Dnipropetrovsk Oblast Military Commissariat',
  'Львівський ОВК': 'Lviv Oblast Military Commissariat',
  'Запорізький ОВК': 'Zaporizhzhia Oblast Military Commissariat',
}

/**
 * Parse Ukrainian written-out date "01 січня 1990 р." → "1990-01-01".
 * Returns null if not parseable.
 */
export function parseUkrainianDate(s: string): string | null {
  if (!s) return null
  const text = s.trim().toLowerCase()

  // Written-out: "01 січня 1990" or "01 січня 1990 р." or "01 січня 1990 року"
  const m1 = text.match(/(\d{1,2})\s+([а-яіїєґ]+)\s+(\d{4})/)
  if (m1) {
    const day = parseInt(m1[1], 10)
    const monthWord = m1[2]
    const year = parseInt(m1[3], 10)
    const month = UA_MONTH_MAP[monthWord] ?? null
    if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${month}-${String(day).padStart(2, '0')}`
    }
  }

  // Numeric: "01.01.1990" / "01/01/1990" / "01-01-1990"
  const m2 = text.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/)
  if (m2) {
    const day = parseInt(m2[1], 10)
    const month = parseInt(m2[2], 10)
    const year = parseInt(m2[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return null
}

/**
 * Translate issuing authority via glossary only. Returns null if not found.
 * NEVER uses LLM for translation.
 * Uses: 1) hardcoded AGENCY_GLOSSARY (highest confidence), then
 *        2) knowledge registry authority lookup (military_authority + authority categories).
 */
function translateAuthority(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // Exact match first (hardcoded glossary)
  if (AGENCY_GLOSSARY[trimmed]) return AGENCY_GLOSSARY[trimmed]
  // Partial match in hardcoded glossary
  for (const [key, value] of Object.entries(AGENCY_GLOSSARY)) {
    if (trimmed.includes(key)) return value
  }
  // Knowledge registry: covers ТЦК (Territorial Recruitment Center, from 2022 reform)
  // and general authority entries (МВС, МЗС, etc.)
  const regResult = lookupAuthority(trimmed)
  if (regResult.matched && regResult.official_en) return regResult.official_en
  return null
}

/**
 * Reject given_name if it looks like a patronymic label or label text that OCR
 * mistook for the given name field (e.g. "По батьковим Іванові").
 * Better to return null + review than to store a label as a name.
 */
export function isLikelyPatronymicOrLabel(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase().trim()
  return (
    lower.startsWith('по батьк') ||     // "По батькові", "По батьковим"
    lower.startsWith('по отч') ||
    lower.includes('батькові') ||
    lower.includes('батьков') ||
    lower.includes('отчест') ||
    lower.length > 35 ||               // Suspiciously long for a given name
    /[,;!@#$%^&*()=+\[\]{}<>]/.test(text) // Contains unusual chars
  )
}

/**
 * Reject issuing authority if OCR clearly produced garbage.
 * Known good patterns: "Вінницький ОВК", "ТЦК Вінниці", "ОМВК"
 * Garbage: random consonant clusters, OCR noise like "гровоградськельковим"
 * Returns true when text should be rejected (not trusted).
 */
export function isAuthorityOcrGarbage(text: string): boolean {
  if (!text || text.trim().length < 5) return true
  // Must have recognizable Cyrillic (at least one run of 3+ Cyrillic chars)
  const hasCyrillic = /[А-ЯІЇЄҐа-яіїєґ]{3,}/u.test(text)
  if (!hasCyrillic) return true
  // Too long to be a real authority name
  if (text.length > 80) return true
  // Known-bad OCR pattern: concatenated words without spaces that are too long
  // e.g. "гровоградськельковим" (20 chars) = OCR garbled multi-word into one. Heuristic:
  // a Cyrillic token >= 20 chars with no spaces is almost certainly OCR noise
  // (the longest real Ukrainian authority word is typically < 20 chars).
  const longestToken = text.split(/\s+/).reduce((max, tok) => tok.length > max ? tok.length : max, 0)
  if (longestToken >= 20) return true
  return false
}

/**
 * Extract the military ID series and number from text.
 * Format: "Серія Со № 845621" → series="Со", number="Со 845621"
 */
function extractSerialNumber(rawText: string): { series: string | null; number: string | null } {
  // Matches "Серія Со № 845621" or "Серія АА №123456" etc.
  // Series is 2 Cyrillic letters; number is 6+ digits
  const m = rawText.match(/[Сс]ері[яі]\s+([А-ЯІЇЄҐа-яіїєґ]{1,3})\s*[№N#]\s*(\d{5,7})/u)
  if (m) {
    const series = m[1].trim()
    const num = m[2].trim()
    return { series, number: `${series} ${num}` }
  }
  // Also try "АА 845621" without "Серія" label (some OCR variants)
  const m2 = rawText.match(/\b([А-ЯІЇЄҐа-яіїєґ]{2})\s+(\d{6})\b/u)
  if (m2) {
    const series = m2[1].trim()
    const num = m2[2].trim()
    return { series, number: `${series} ${num}` }
  }
  return { series: null, number: null }
}

/**
 * Detect page type from OCR text.
 * Page 1 = identity page (has "ВІЙСЬКОВИЙ КВИТОК", name/dob fields)
 * Service page = has "Відомості про проходження служби"
 */
function detectSourcePage(rawText: string): 'identity' | 'service' | 'unknown' {
  const lower = rawText.toLowerCase()
  if (lower.includes('відомості про проходження') || lower.includes('проходження служби')) {
    return 'service'
  }
  if (lower.includes('військовий квиток') || lower.includes('прізвище') || lower.includes('ім\'я')) {
    return 'identity'
  }
  return 'unknown'
}

/**
 * Extract text from the next non-empty line after a label anchor.
 * Scans both lines[] and fallback on raw line splits.
 */
function extractAfterLabel(lines: string[], labelPatterns: RegExp[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    for (const pattern of labelPatterns) {
      if (pattern.test(line)) {
        // Same-line continuation: text after the label
        const tail = line.replace(pattern, '').trim().replace(/^[:.\-—\s]+/, '').trim()
        if (tail.length >= 2 && /[А-ЯІЇЄҐа-яіїєґ]/u.test(tail)) {
          return tail
        }
        // Previous line (booklet-style: value ABOVE label)
        for (let off = 1; off <= 2; off++) {
          const prev = lines[i - off]?.trim()
          if (prev && prev.length >= 2 && /[А-ЯІЇЄҐа-яіїєґ]/u.test(prev) && !looksLikeMilitaryLabel(prev)) {
            return prev
          }
        }
        // Next lines
        for (let off = 1; off <= 3; off++) {
          const next = lines[i + off]?.trim()
          if (next && next.length >= 2 && /[А-ЯІЇЄҐа-яіїєґ]/u.test(next) && !looksLikeMilitaryLabel(next)) {
            return next
          }
        }
        break
      }
    }
  }
  return null
}

function looksLikeMilitaryLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, '').toLowerCase()
  // Also skip country headers, document titles, and single ALL-CAPS country words
  const upper = text.trim().toUpperCase()
  if (/^[A-ZА-ЯІЇЄҐ]{3,}$/.test(upper) && ['УКРАЇНА', 'UKRAINE', 'РОСІЯ', 'РОССИЯ'].includes(upper)) return true
  return [
    'прізвище', 'імя', 'ім\'я', 'побатькові', 'датанародження',
    'місценародження', 'військовийквиток', 'військовий', 'квиток',
    'серія', 'виданий', 'органщовидав', 'орган', 'підпис',
    'особистий', 'ukraine', 'україна',
  ].some((h) => compact.includes(h))
}

/**
 * Run the military ID module against raw OCR text.
 *
 * Always returns a result — never throws. All fields have review_required=true.
 * Service page fields never overwrite identity page fields.
 */
export function runMilitaryIdModule(
  ocr: OcrResult | { raw_text: string; lines: Array<{ text: string }> },
  opts: { document_id: string },
): TpsModuleResult {
  const rawText: string = 'raw_text' in ocr ? (ocr.raw_text ?? '') : ''
  const lines: string[] = [
    ...rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean),
    ...('lines' in ocr ? (ocr as OcrResult).lines.map(l => l.text.trim()).filter(Boolean) : []),
  ]
  // Deduplicate while preserving order
  const seen = new Set<string>()
  const uniqueLines: string[] = []
  for (const l of lines) {
    if (!seen.has(l)) { seen.add(l); uniqueLines.push(l) }
  }

  const rawLower = rawText.toLowerCase()

  // ── Match signal: must have military booklet indicators ──
  const strongSignals = ['військовий квиток', 'военный билет']
  const weakSignals = ['серія', 'прізвище', 'по батькові', 'дата народження']
  const hasStrong = strongSignals.some(s => rawLower.includes(s))
  const hasWeak = weakSignals.some(s => rawLower.includes(s))

  if (!hasStrong && !hasWeak) {
    return {
      module: 'unknown',
      matched: false,
      match_reason: 'military_id_signals_missing',
      fields: [],
      warnings: ['Could not find military ID indicators in OCR text.'],
      manual_review_required: false,
      manual_review_reasons: [],
    }
  }

  const sourcePage = detectSourcePage(rawText)
  const matchReason = hasStrong ? 'military_id_strong_signal' : 'military_id_weak_signal'

  const fields: TpsExtractedField[] = []
  const warnings: string[] = []

  const emit = (
    field: string,
    rawValue: string,
    normalizedValue: string | null,
    sourceZone: string,
    passes: string[] = [],
    failures: string[] = [],
  ) => {
    fields.push({
      field,
      raw_value: rawValue,
      normalized_value: normalizedValue,
      extraction_source: 'ocr_keyword',
      source_document_id: opts.document_id,
      source_zone: sourceZone,
      bbox: null,
      language_layer: 'cyrillic',
      confidence: null,
      review_required: true, // ALWAYS true — hard-case policy for military docs
      ocr_word_ids: [],
      passes,
      failures,
      user_corrected: false,
    })
  }

  // ── Serial number (Серія + №) ─────────────────────────────────────────────
  const { series, number: serialNumber } = extractSerialNumber(rawText)
  if (serialNumber) {
    emit('military_id_number', serialNumber, serialNumber, 'military_id_serial_regex', ['serial_format'])
    if (series) {
      emit('military_id_series', series, series, 'military_id_series_regex', ['series_format'])
    }
  } else {
    warnings.push('military_id_serial_not_found')
  }

  // ── Family name (Прізвище) ────────────────────────────────────────────────
  const familyName = extractAfterLabel(uniqueLines, [
    /прізвище\s*[:.]?/iu,
    /фамили[яі]\s*[:.]?/iu,
  ])
  if (familyName) {
    emit('family_name', familyName, familyName, 'military_id_label_family_name', ['label_anchor'])
  } else {
    // Fallback: first standalone Cyrillic-only ALL-CAPS or Title-case line after serial
    // that doesn't look like a label. Heuristic for identity page layout.
    const serialIdx = uniqueLines.findIndex(l => /серія|№|серий/iu.test(l))
    if (serialIdx >= 0) {
      for (let i = serialIdx + 1; i < Math.min(serialIdx + 5, uniqueLines.length); i++) {
        const candidate = uniqueLines[i].trim()
        if (
          candidate.length >= 3 &&
          candidate.length <= 40 &&
          /^[А-ЯІЇЄҐа-яіїєґ''\-]+$/u.test(candidate.replace(/\s/g, '')) &&
          !looksLikeMilitaryLabel(candidate)
        ) {
          emit('family_name', candidate, candidate, 'military_id_serial_proximity', ['proximity_heuristic'])
          break
        }
      }
    }
    if (!fields.some(f => f.field === 'family_name')) {
      warnings.push('military_id_family_name_not_found')
    }
  }

  // ── Given name (Ім'я) ─────────────────────────────────────────────────────
  // Military IDs often omit the "Ім'я" label entirely — the given name
  // appears as a standalone line immediately after the family name.
  const givenNameRaw = extractAfterLabel(uniqueLines, [
    /^ім['ʼ'`]?я\s*[:.]?/iu,
    /^имя\s*[:.]?/iu,
  ])
  // Guard: reject if OCR confused a patronymic label with the given name
  const givenNameFromLabel = (givenNameRaw && isLikelyPatronymicOrLabel(givenNameRaw))
    ? null
    : givenNameRaw
  if (givenNameFromLabel) {
    emit('given_name', givenNameFromLabel, givenNameFromLabel, 'military_id_label_given_name', ['label_anchor'])
  } else {
    if (givenNameRaw && isLikelyPatronymicOrLabel(givenNameRaw)) {
      // Rejected — emit null and warn rather than store garbage
      warnings.push('military_id_given_name_rejected_patronymic_or_label')
    }
    // Fallback: given name is the standalone Cyrillic line immediately AFTER
    // the family name line (military booklet layout — no explicit label)
    const familyNameField = fields.find(f => f.field === 'family_name')
    if (familyNameField) {
      const familyNameIdx = uniqueLines.findIndex(l =>
        l.trim() === familyNameField.raw_value.trim()
      )
      if (familyNameIdx >= 0) {
        for (let i = familyNameIdx + 1; i < Math.min(familyNameIdx + 4, uniqueLines.length); i++) {
          const candidate = uniqueLines[i].trim()
          if (
            candidate.length >= 2 &&
            candidate.length <= 40 &&
            /^[А-ЯІЇЄҐа-яіїєґ''\-]+$/u.test(candidate.replace(/\s/g, '')) &&
            !looksLikeMilitaryLabel(candidate) &&
            !isLikelyPatronymicOrLabel(candidate) &&  // Guard applied to proximity candidate too
            !extractSerialNumber(candidate).number  // not another serial
          ) {
            emit('given_name', candidate, candidate, 'military_id_name_proximity', ['proximity_heuristic'])
            break
          }
        }
      }
    }
    if (!fields.some(f => f.field === 'given_name')) {
      warnings.push('military_id_given_name_not_found')
    }
  }

  // ── Patronymic (По батькові) ──────────────────────────────────────────────
  const patronymic = extractAfterLabel(uniqueLines, [
    /по\s+батькові\s*[:.]?/iu,
    /побатькові\s*[:.]?/iu,
    /отчество\s*[:.]?/iu,
  ])
  if (patronymic) {
    emit('middle_name', patronymic, patronymic, 'military_id_label_patronymic', ['label_anchor'])
  } else {
    warnings.push('military_id_patronymic_not_found')
  }

  // ── Date of birth ─────────────────────────────────────────────────────────
  // Military ID writes DOB inline: "01 січня 1990 р." or after a label
  // Also scan raw text for date patterns directly
  let dobRaw: string | null = null
  let dobIso: string | null = null

  // First: try label-anchored extraction
  const dobLine = extractAfterLabel(uniqueLines, [
    /дата\s+народження\s*[:.]?/iu,
    /дата\s+рождени[яі]\s*[:.]?/iu,
    /date\s+of\s+birth\s*[:.]?/iu,
  ])
  if (dobLine) {
    dobRaw = dobLine
    dobIso = parseUkrainianDate(dobLine)
  }

  // Fallback: scan all lines for a date pattern
  if (!dobIso) {
    for (const line of uniqueLines) {
      const iso = parseUkrainianDate(line)
      if (iso) {
        const year = parseInt(iso.slice(0, 4), 10)
        // Only accept plausible birth years
        if (year >= 1920 && year <= 2010) {
          dobRaw = line
          dobIso = iso
          break
        }
      }
    }
  }

  if (dobRaw && dobIso) {
    emit('dob', dobRaw, dobIso, 'military_id_dob', ['date_parsed', 'ukrainian_month'])
  } else if (dobRaw) {
    emit('dob', dobRaw, null, 'military_id_dob_unparsed', [], ['date_parse_failed'])
    warnings.push('military_id_dob_parse_failed')
  } else {
    warnings.push('military_id_dob_not_found')
  }

  // ── Issuing authority (Виданий / Орган що видав) ──────────────────────────
  const authorityRaw = extractAfterLabel(uniqueLines, [
    /виданий\s*[:.]?/iu,
    /виданий\s+(?:підрозділом|органом)/iu,
    /орган(?:ом)?\s*(?:що|який)\s+видав/iu,
    /орган\s+видачі/iu,
  ])
  if (authorityRaw && authorityRaw.length >= 4) {
    // Guard: reject authority if OCR quality is clearly bad
    if (isAuthorityOcrGarbage(authorityRaw)) {
      warnings.push('military_id_authority_ocr_uncertain')
      // Do NOT emit — garbage is worse than null
    } else {
      const authorityEn = translateAuthority(authorityRaw)
      emit(
        'issuing_authority',
        authorityRaw,
        authorityRaw,
        'military_id_label_authority',
        ['label_anchor'],
      )
      if (authorityEn) {
        emit(
          'issuing_authority_english',
          authorityEn,
          authorityEn,
          'military_id_authority_glossary',
          ['glossary_match'],
        )
      } else {
        warnings.push('military_id_authority_not_in_glossary')
      }
    }
  } else {
    warnings.push('military_id_authority_not_found')
  }

  // ── Source page metadata ──────────────────────────────────────────────────
  // Emitted as a non-form field for audit purposes only.
  if (sourcePage !== 'unknown') {
    emit(
      'military_id_source_page',
      sourcePage,
      sourcePage,
      'military_id_page_detection',
      ['page_type_detected'],
    )
  }

  const matched = fields.some(f =>
    ['family_name', 'given_name', 'dob', 'military_id_number'].includes(f.field)
  )

  return {
    module: 'unknown' as const, // 'military_id' is not in TpsDocType enum — uses unknown
    matched,
    match_reason: matched ? matchReason : 'military_id_no_identity_fields',
    fields,
    warnings,
    manual_review_required: true, // ALWAYS — military docs are hard-case
    manual_review_reasons: ['military_document_always_review'],
  }
}

// ── Pure extraction function for testing (no OcrResult required) ──────────────
// Accepts raw OCR text string directly. Returns structured fields without
// the TpsModuleResult wrapper. Used by unit tests and direct callers.
export function extractMilitaryId(rawText: string): {
  family_name_cyrillic: string | null
  given_name_cyrillic: string | null
  patronymic_cyrillic: string | null
  date_of_birth: string | null
  military_id_number: string | null
  military_id_series: string | null
  issuing_authority_raw: string | null
  issuing_authority_english: string | null
  source_page: 'identity' | 'service' | 'unknown'
  review_required: boolean
} {
  const syntheticOcr = {
    raw_text: rawText,
    lines: rawText.split(/\r?\n/).filter(Boolean).map(text => ({ text })),
  }
  const result = runMilitaryIdModule(syntheticOcr, { document_id: 'test' })

  const getField = (name: string) =>
    result.fields.find(f => f.field === name)?.normalized_value ?? null
  const getRawField = (name: string) =>
    result.fields.find(f => f.field === name)?.raw_value ?? null

  return {
    family_name_cyrillic: getField('family_name'),
    given_name_cyrillic: getField('given_name'),
    patronymic_cyrillic: getField('middle_name'),
    date_of_birth: getField('dob'),
    military_id_number: getField('military_id_number'),
    military_id_series: getField('military_id_series'),
    issuing_authority_raw: getRawField('issuing_authority'),
    issuing_authority_english: getField('issuing_authority_english'),
    source_page: detectSourcePage(rawText),
    review_required: true, // ALWAYS true — hard-case policy
  }
}
