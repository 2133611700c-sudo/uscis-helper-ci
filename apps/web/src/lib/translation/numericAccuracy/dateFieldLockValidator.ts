/**
 * Date Field Lock Validator — Messenginfo v5.0
 * Ensures date values are only accepted from the correct source zone.
 * Prevents AI from pulling date_of_birth from the issuance_block, etc.
 *
 * EXPORTED month maps (UKRAINIAN_MONTHS, RUSSIAN_MONTHS, ALL_MONTHS) are the
 * canonical source of truth for month name → English mapping.
 * Import these in tests and production code — do NOT define them inline elsewhere.
 */
import { ExtractedField } from '../types'

// ── Canonical month name maps ────────────────────────────────────────────────
// Genitive forms as they appear in Ukrainian government documents.
// Key: lowercase Ukrainian/Russian genitive month name
// Value: English month name (for normalizeDateUkrainian output)

export const UKRAINIAN_MONTHS: Readonly<Record<string, string>> = {
  'січня':    'January',
  'лютого':   'February',
  'березня':  'March',
  'квітня':   'April',
  'травня':   'May',
  'червня':   'June',
  'липня':    'July',
  'серпня':   'August',
  'вересня':  'September',
  'жовтня':   'October',
  'листопада':'November',
  'грудня':   'December',
}

export const RUSSIAN_MONTHS: Readonly<Record<string, string>> = {
  'января':   'January',
  'февраля':  'February',
  'марта':    'March',
  'апреля':   'April',
  'мая':      'May',
  'июня':     'June',
  'июля':     'July',
  'августа':  'August',
  'сентября': 'September',
  'октября':  'October',
  'ноября':   'November',
  'декабря':  'December',
}

/**
 * Combined map of Ukrainian + Russian month names.
 * Ukrainian takes priority on key collision (none expected).
 * Pass this as the `months` argument to normalizeDateUkrainian() in production.
 */
export const ALL_MONTHS: Readonly<Record<string, string>> = {
  ...RUSSIAN_MONTHS,
  ...UKRAINIAN_MONTHS,
}

// Maps field name → allowed source zone patterns
const DATE_ZONE_LOCKS: Record<string, string[]> = {
  // Passport booklet fields
  date_of_birth:         ['birth_block', 'personal_data', 'dob_line', 'demographic_block', 'child_block'],
  date_of_issue:         ['issuance_block', 'issue_block', 'validity_block', 'administrative_block', 'footer_block'],
  date_of_expiry:        ['issuance_block', 'validity_block', 'expiry_block'],
  date_of_marriage:      ['registration_block', 'civil_act_block', 'main_block'],
  date_of_death:         ['registration_block', 'civil_act_block', 'main_block'],
  date_of_registration:  ['registration_block', 'civil_act_block', 'footer_block'],
  // Birth certificate fields
  act_record_date:       ['act_record_block', 'civil_act_block', 'registration_block'],
}

export interface DateLockResult {
  field: string
  passed: boolean
  source_zone: string
  allowed_zones: string[]
  warning?: string
}

export function validateDateFieldLock(fields: ExtractedField[]): DateLockResult[] {
  const results: DateLockResult[] = []

  for (const field of fields) {
    const allowedZones = DATE_ZONE_LOCKS[field.field]
    if (!allowedZones) continue  // Not a date field we lock

    const zoneLower = field.source_zone.toLowerCase()
    const passed = allowedZones.some(z => zoneLower.includes(z))

    results.push({
      field: field.field,
      passed,
      source_zone: field.source_zone,
      allowed_zones: allowedZones,
      warning: passed ? undefined :
        `Date field '${field.field}' extracted from zone '${field.source_zone}' ` +
        `which is not in allowed zones: ${allowedZones.join(', ')}. ` +
        `Possible zone mismatch — review required.`,
    })
  }

  return results
}

export function normalizeDateUkrainian(raw: string, months: Record<string, string>): string | null {
  // Pattern: "19 лютого 2003" or "19 лютого 2003 р."
  const match = raw.trim().match(/^(\d{1,2})\s+([а-яїієА-ЯЇІЄа-яёА-Яё]+)\s+(\d{4})/)
  if (!match) return null

  const day = match[1].padStart(2, '0')
  const monthRaw = match[2].toLowerCase()
  const year = match[3]
  const monthEn = months[monthRaw]

  if (!monthEn) return null
  const monthNum = MONTH_TO_NUM[monthEn]
  if (!monthNum) return null

  return `${monthNum}/${day}/${year}`
}

const MONTH_TO_NUM: Record<string, string> = {
  January:'01', February:'02', March:'03', April:'04',
  May:'05', June:'06', July:'07', August:'08',
  September:'09', October:'10', November:'11', December:'12',
}
