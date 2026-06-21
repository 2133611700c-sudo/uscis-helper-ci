/**
 * Birth certificate extraction module — Ukrainian birth certificate
 * (Свідоцтво про народження).
 *
 * Input:  raw OCR text from Google Vision (or any OCR provider)
 * Output: BirthCertificateExtractionResult with role-grounded fields
 *
 * CRITICAL DESIGN RULES (never relax):
 *   1. review_required=true ALWAYS — hard-case class (documentClassPolicy)
 *   2. role_grounding REQUIRED — child block separate from parent block
 *   3. Parent name must NEVER flow into child_family_name
 *   4. wrong_person_risk=true when structure is ambiguous
 *   5. Does NOT populate: I-94, A-number, EAD, address, immigration fields
 *   6. issuing_authority_english via glossary only (no LLM)
 *
 * Why role grounding matters:
 *   Benchmark evidence (2026-06-02): gemini-2.5-pro returned the WRONG PERSON
 *   on birth certificates — returned parent name instead of child name.
 *   This module must never repeat that failure.
 *
 * Document structure assumed:
 *   [CHILD BLOCK] — fields before "Батько" / "Мати" / father/mother section
 *   [PARENT BLOCK] — fields after parent header
 *   [REGISTRATION BLOCK] — act number, dates, authority
 *
 * Reference: documentClassPolicy.ts birth_certificate_handwritten:
 *   auto_fill_allowed=false, always_review=true, final_without_review=false
 */

import type { OcrResult } from '@/lib/ocr/types'
import type { TpsExtractedField, TpsModuleResult } from '@/lib/tps/types'
import { extractValueAfterLabel, isLabelText } from './labelValueExtractor'
import { translateCivilRegistryTerm, lookupAuthority } from '@uscis-helper/knowledge'

// ── Ukrainian month names (genitive) ─────────────────────────────────────────
const UA_MONTH_MAP: Record<string, string> = {
  'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
  'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
  'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12',
  // Russian month names — Soviet-era bilingual certs
  'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
  'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
  'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12',
}

// Civil registry agency glossary — only self-name-on-.gov.ua sources
const REGISTRY_GLOSSARY: Record<string, string> = {
  'Тростянецький міський відділ реєстрації актів цивільного стану':
    'Trostianets City Department of Civil Status Acts Registration',
  'Тростянецький відділ РАЦС': 'Trostianets Department of Civil Status Acts Registration',
  'Тростянецький РАЦС': 'Trostianets Civil Status Acts Registration Office',
  'Вінницький міський відділ РАЦС': 'Vinnytsia City Department of Civil Status Acts Registration',
  'Вінницький обласний РАЦС': 'Vinnytsia Oblast Civil Status Acts Registration',
  'Київський міський РАЦС': 'Kyiv City Civil Status Acts Registration',
  'Харківський міський РАЦС': 'Kharkiv City Civil Status Acts Registration',
  'Одеський міський РАЦС': 'Odesa City Civil Status Acts Registration',
  'Дніпропетровський міський РАЦС': 'Dnipropetrovsk City Civil Status Acts Registration',
  'Львівський міський РАЦС': 'Lviv City Civil Status Acts Registration',
  'Запорізький міський РАЦС': 'Zaporizhzhia City Civil Status Acts Registration',
}

/**
 * Parse Ukrainian/Russian written-out date or numeric date.
 * "01 січня 1990" → "1990-01-01", "01.01.1990" → "1990-01-01"
 */
function parseDate(s: string): string | null {
  if (!s) return null
  const text = s.trim().toLowerCase()

  // Written-out month
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

  // Numeric
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

function translateAuthority(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  // 1. Try inline hardcoded glossary first (highest-confidence exact entries)
  if (REGISTRY_GLOSSARY[trimmed]) return REGISTRY_GLOSSARY[trimmed]
  for (const [key, value] of Object.entries(REGISTRY_GLOSSARY)) {
    if (trimmed.includes(key)) return value
  }
  // 2. Try knowledge registry (civil_registry_term + general authority categories)
  // translateCivilRegistryTerm covers РАЦС/ЗАГС/ДРАЦС abbreviations
  const civilResult = translateCivilRegistryTerm(trimmed)
  if (civilResult.matched && civilResult.official_en) return civilResult.official_en
  const authorityResult = lookupAuthority(trimmed)
  if (authorityResult.matched && authorityResult.official_en) return authorityResult.official_en
  return null
}

// ── Header patterns that mark the boundary between child / parent blocks ──────
const PARENT_HEADERS = [
  /^(?:батько|батьків|батька)\s*[:.]?/iu,
  /^(?:мати|матір|матері)\s*[:.]?/iu,
  /^father\s*[:.]?/i,
  /^mother\s*[:.]?/i,
  /^отец\s*[:.]?/iu,
  /^мать\s*[:.]?/iu,
]

const REGISTRATION_HEADERS = [
  /актовий\s+запис/iu,
  /акт\s*[№#]\s*\d/iu,
  /орган\s+реєстрації/iu,
  /дата\s+(?:складання|видачі|реєстрації)/iu,
  /свідоцтво\s+(?:видано|серії)/iu,
]

function looksLikeBirthCertLabel(text: string): boolean {
  const compact = text.replace(/\s+/g, '').toLowerCase()
  return [
    'прізвище', "ім'я", 'ім’я', 'імя', 'побатькові', 'датанародження',
    'місценародження', 'батько', 'мати', 'father', 'mother',
    'актовийзапис', 'органреєстрації', 'свідоцтво', 'народження',
  ].some(h => compact.includes(h))
}

/**
 * Split OCR lines into three blocks: child, parent, registration.
 * Uses parent/registration header detection as structural anchors.
 *
 * Role-grounding: child fields are ONLY extracted from the child block.
 * Parent names from the parent block NEVER flow into child_* fields.
 */
function splitDocumentBlocks(lines: string[]): {
  childLines: string[]
  parentLines: string[]
  registrationLines: string[]
  structureDetected: boolean
} {
  let parentStartIdx = -1
  let registrationStartIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (parentStartIdx < 0 && PARENT_HEADERS.some(p => p.test(line))) {
      parentStartIdx = i
    }
    if (registrationStartIdx < 0 && REGISTRATION_HEADERS.some(p => p.test(line))) {
      registrationStartIdx = i
    }
  }

  const structureDetected = parentStartIdx >= 0

  if (!structureDetected) {
    // Cannot separate child/parent blocks — entire text is ambiguous
    return {
      childLines: lines,
      parentLines: [],
      registrationLines: [],
      structureDetected: false,
    }
  }

  const childEnd = parentStartIdx
  const parentEnd = registrationStartIdx >= 0 ? registrationStartIdx : lines.length

  return {
    childLines: lines.slice(0, childEnd),
    parentLines: lines.slice(parentStartIdx, parentEnd),
    registrationLines: registrationStartIdx >= 0 ? lines.slice(registrationStartIdx) : [],
    structureDetected: true,
  }
}

/**
 * Extract a named field from a block of lines by label anchor.
 * Delegates to extractValueAfterLabel which rejects label-as-value.
 * Returns null if not found or if found value IS a label (the core bug fix).
 *
 * CRITICAL FIX (2026-06-03):
 *   Previous implementation returned label text as values, e.g.:
 *   "Прізвище / Прізвищ" → returned "/ Прізвищ" as family_name.
 *   "Ім'я, отчество, по батькові" → returned label string as given_name.
 *   extractValueAfterLabel() rejects all label text via isLabelText().
 */
function extractFieldFromBlock(blockLines: string[], labelPatterns: RegExp[]): string | null {
  // allowPrevLine=false: Ukrainian birth certificate printed forms always put the
  // label first (or inline), never value-above-label. Enabling prev-line lookup
  // caused cross-contamination between adjacent fields (e.g. family_name appearing
  // as given_name because the previous line was the already-found surname).
  const result = extractValueAfterLabel(blockLines, labelPatterns, {
    maxLinesAfter: 3,
    allowInline: true,
    allowPrevLine: false,
  })
  return result.raw_value
}

/**
 * Extract act record number from registration lines.
 * Matches "Актовий запис № 42" or "Акт № 42" etc.
 */
function extractActNumber(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/актовий\s+запис\s*[№#]?\s*(\d+)/iu)
    if (m) return m[1]
    const m2 = line.match(/акт\s*[№#]\s*(\d+)/iu)
    if (m2) return m2[1]
    const m3 = line.match(/[№#]\s*(\d+)/iu)
    if (m3) return m3[1]
  }
  return null
}

/**
 * Extract certificate series/number (e.g. "І-ВН № 123456").
 */
function extractCertNumber(rawText: string): string | null {
  // Matches "І-ВН № 123456" or similar
  const m = rawText.match(/([А-ЯІЇЄҐ]-[А-ЯІЇЄҐ]+)\s*[№#]\s*(\d{4,7})/u)
  if (m) return `${m[1]} № ${m[2]}`
  return null
}

// ── Main result type ──────────────────────────────────────────────────────────

export interface BirthCertificateExtractionResult {
  // CHILD block — the person being registered
  child_family_name: string | null
  child_given_name: string | null
  child_patronymic: string | null
  child_date_of_birth: string | null
  child_place_of_birth: string | null

  // PARENTS block — separate from child
  father_name: string | null
  mother_name: string | null

  // REGISTRATION block
  act_record_number: string | null
  registration_date: string | null
  issuing_authority_raw: string | null
  issuing_authority_english: string | null
  certificate_series_number: string | null

  // Safety flags
  review_required: true  // ALWAYS true — hard-case class
  role_grounding_verified: boolean
  wrong_person_risk: boolean
}

/**
 * Extract structured fields from birth certificate OCR text.
 * Always returns review_required=true.
 * Sets wrong_person_risk=true when child/parent blocks are ambiguous.
 */
export function extractBirthCertificate(rawText: string): BirthCertificateExtractionResult {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const rawLower = rawText.toLowerCase()

  const { childLines, parentLines, registrationLines, structureDetected } =
    splitDocumentBlocks(lines)

  const roleGroundingVerified = structureDetected
  // Wrong person risk: if we couldn't separate blocks, parent name might contaminate child
  const wrongPersonRisk = !structureDetected

  // ── Child block extraction ────────────────────────────────────────────────
  // ONLY from childLines — never from parentLines
  const childFamilyName = extractFieldFromBlock(childLines, [
    /прізвище\s*[:.]?/iu,
    /фамили[яі]\s*[:.]?/iu,
    // Also look for explicit "дитини" qualifier
    /прізвище\s+дитини\s*[:.]?/iu,
  ])

  const childGivenName = extractFieldFromBlock(childLines, [
    /(?:^|\s)ім['']?я\s*[:.]?/iu,
    /имя\s*[:.]?/iu,
    /ім'?я\s+дитини\s*[:.]?/iu,
  ])

  const childPatronymic = extractFieldFromBlock(childLines, [
    /по\s+батькові\s*[:.]?/iu,
    /побатькові\s*[:.]?/iu,
    /отчество\s*[:.]?/iu,
  ])

  // Date of birth — try label then scan child block for dates
  let childDob: string | null = null
  const dobLine = extractFieldFromBlock(childLines, [
    /дата\s+народження\s*[:.]?/iu,
    /дата\s+рождени[яі]\s*[:.]?/iu,
    /народи(?:вся|лась|лося)\s*[:.]?/iu,
  ])
  if (dobLine) {
    childDob = parseDate(dobLine)
    if (!childDob) {
      // Maybe the label extracted the date as raw text
      childDob = parseDate(dobLine)
    }
  }
  // Fallback: scan all child lines for a birth-year-range date
  if (!childDob) {
    for (const line of childLines) {
      const iso = parseDate(line)
      if (iso) {
        const year = parseInt(iso.slice(0, 4), 10)
        if (year >= 1900 && year <= 2020) {
          childDob = iso
          break
        }
      }
    }
  }

  // Place of birth — from child block
  const childPlaceRaw = extractFieldFromBlock(childLines, [
    /місце\s+народження\s*[:.]?/iu,
    /місцем\s+народження\s*[:.]?/iu,
    /место\s+рождени[яі]\s*[:.]?/iu,
    /місто\s+народження\s*[:.]?/iu,
  ])
  // Normalize place — keep raw Cyrillic (KMU-55 done downstream)
  const childPlaceOfBirth = childPlaceRaw

  // ── Parent block extraction ───────────────────────────────────────────────
  // Extracted from parentLines only — NEVER merged into child fields
  let fatherName: string | null = null
  let motherName: string | null = null

  if (parentLines.length > 0) {
    fatherName = extractFieldFromBlock(parentLines, [
      /^батько\s*[:.]?/iu,
      /^батька?\s*[:.]?/iu,
      /^father\s*[:.]?/i,
      /^отец\s*[:.]?/iu,
      /прізвище\s+батька\s*[:.]?/iu,
    ])
    motherName = extractFieldFromBlock(parentLines, [
      /^мати\s*[:.]?/iu,
      /^матір\s*[:.]?/iu,
      /^mother\s*[:.]?/i,
      /^мать\s*[:.]?/iu,
      /прізвище\s+матері\s*[:.]?/iu,
    ])
  }

  // ── Registration block ────────────────────────────────────────────────────
  const allRegistrationLines = registrationLines.length > 0 ? registrationLines : lines

  const actRecordNumber = extractActNumber(allRegistrationLines)

  // Registration date — typically "дата складання" or "дата видачі"
  const regDateLine = extractFieldFromBlock(allRegistrationLines, [
    /дата\s+складання\s*[:.]?/iu,
    /дата\s+видачі\s*[:.]?/iu,
    /дата\s+реєстрації\s*[:.]?/iu,
    /дата\s+видачи\s*[:.]?/iu,
  ])
  const registrationDate = regDateLine ? parseDate(regDateLine) : null

  // Issuing authority
  const authorityRaw = extractFieldFromBlock(allRegistrationLines, [
    /орган\s+реєстрації\s*[:.]?/iu,
    /відділ\s+(?:рацс|реєстрації)\s*[:.]?/iu,
    /відділом\s+(?:рацс|реєстрації)\s*[:.]?/iu,
    /орган\s+(?:що|який)\s+видав\s*[:.]?/iu,
    /зареєстровано\s*[:.]?/iu,
  ])
  const authorityEnglish = authorityRaw ? translateAuthority(authorityRaw) : null

  // Certificate series/number
  const certSeriesNumber = extractCertNumber(rawText)

  return {
    child_family_name: childFamilyName,
    child_given_name: childGivenName,
    child_patronymic: childPatronymic,
    child_date_of_birth: childDob,
    child_place_of_birth: childPlaceOfBirth,
    father_name: fatherName,
    mother_name: motherName,
    act_record_number: actRecordNumber,
    registration_date: registrationDate,
    issuing_authority_raw: authorityRaw,
    issuing_authority_english: authorityEnglish,
    certificate_series_number: certSeriesNumber,
    review_required: true, // ALWAYS true — hard-case class (birth_certificate_handwritten)
    role_grounding_verified: roleGroundingVerified,
    wrong_person_risk: wrongPersonRisk,
  }
}

/**
 * Run the birth certificate module against an OcrResult.
 * Returns a TpsModuleResult compatible with the TPS pipeline.
 *
 * review_required=true on EVERY field — always.
 * manual_review_required=true always — hard-case class.
 */
export function runBirthCertificateModule(
  ocr: OcrResult | { raw_text: string; lines: Array<{ text: string }> },
  opts: { document_id: string },
): TpsModuleResult {
  const rawText: string = 'raw_text' in ocr ? (ocr.raw_text ?? '') : ''
  const rawLower = rawText.toLowerCase()

  // ── Match signal: must have birth certificate indicators ──
  const strongSignals = [
    'свідоцтво про народження',
    'свидетельство о рождении',
    'certificate of birth',
  ]
  const weakSignals = ['народження', 'рождени', 'актовий запис', 'рацс']
  const hasStrong = strongSignals.some(s => rawLower.includes(s))
  const hasWeak = weakSignals.some(s => rawLower.includes(s))

  if (!hasStrong && !hasWeak) {
    return {
      module: 'unknown',
      matched: false,
      match_reason: 'birth_certificate_signals_missing',
      fields: [],
      warnings: ['Could not find birth certificate indicators in OCR text.'],
      manual_review_required: false,
      manual_review_reasons: [],
    }
  }

  const extracted = extractBirthCertificate(rawText)
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
      review_required: true, // ALWAYS — never auto-final for certificates
      ocr_word_ids: [],
      passes,
      failures,
      user_corrected: false,
    })
  }

  // Child block fields — role-prefixed to prevent wrong-person contamination
  if (extracted.child_family_name) {
    emit('child_family_name', extracted.child_family_name, extracted.child_family_name,
      'birth_cert_child_block', ['role_grounded'])
  } else {
    warnings.push('birth_cert_child_family_name_not_found')
  }

  if (extracted.child_given_name) {
    emit('child_given_name', extracted.child_given_name, extracted.child_given_name,
      'birth_cert_child_block', ['role_grounded'])
  } else {
    warnings.push('birth_cert_child_given_name_not_found')
  }

  if (extracted.child_patronymic) {
    emit('child_patronymic', extracted.child_patronymic, extracted.child_patronymic,
      'birth_cert_child_block', ['role_grounded'])
  }

  if (extracted.child_date_of_birth) {
    emit('dob', extracted.child_date_of_birth, extracted.child_date_of_birth,
      'birth_cert_child_block', ['date_parsed', 'role_grounded'])
  } else {
    warnings.push('birth_cert_child_dob_not_found')
  }

  if (extracted.child_place_of_birth) {
    emit('city_of_birth', extracted.child_place_of_birth, extracted.child_place_of_birth,
      'birth_cert_child_block', ['role_grounded'])
  }

  // Parent block fields — clearly namespaced as father/mother
  // NEVER mapped to child_family_name or family_name
  if (extracted.father_name) {
    emit('father_full_name', extracted.father_name, extracted.father_name,
      'birth_cert_parent_block', ['role_grounded', 'parent_block'])
  }
  if (extracted.mother_name) {
    emit('mother_full_name', extracted.mother_name, extracted.mother_name,
      'birth_cert_parent_block', ['role_grounded', 'parent_block'])
  }

  // Registration block
  if (extracted.act_record_number) {
    emit('act_record_number', extracted.act_record_number, extracted.act_record_number,
      'birth_cert_registration_block', ['act_number_format'])
  }
  if (extracted.registration_date) {
    emit('date_of_issue', extracted.registration_date, extracted.registration_date,
      'birth_cert_registration_block', ['date_parsed'])
  }
  if (extracted.issuing_authority_raw) {
    emit('issuing_authority', extracted.issuing_authority_raw, extracted.issuing_authority_raw,
      'birth_cert_registration_block', ['label_anchor'])
    if (extracted.issuing_authority_english) {
      emit('issuing_authority_english', extracted.issuing_authority_english,
        extracted.issuing_authority_english, 'birth_cert_glossary', ['glossary_match'])
    }
  }
  if (extracted.certificate_series_number) {
    emit('certificate_series_number', extracted.certificate_series_number,
      extracted.certificate_series_number, 'birth_cert_registration_block', ['cert_number_format'])
  }

  // Role grounding metadata — emitted as audit fields
  if (!extracted.role_grounding_verified) {
    warnings.push('birth_cert_role_grounding_not_verified')
  }
  if (extracted.wrong_person_risk) {
    warnings.push('birth_cert_wrong_person_risk_high')
  }

  const matched = fields.some(f =>
    ['child_family_name', 'child_given_name', 'dob'].includes(f.field)
  )

  const manual_review_reasons = [
    'birth_certificate_always_review', // hard-case class
    ...(extracted.wrong_person_risk ? ['wrong_person_risk_ambiguous_structure'] : []),
    ...(!extracted.role_grounding_verified ? ['role_grounding_not_verified'] : []),
  ]

  return {
    module: 'unknown' as const,
    matched,
    match_reason: matched
      ? (hasStrong ? 'birth_cert_strong_signal' : 'birth_cert_weak_signal')
      : 'birth_cert_no_identity_fields',
    fields,
    warnings,
    manual_review_required: true, // ALWAYS — hard-case class
    manual_review_reasons,
  }
}
