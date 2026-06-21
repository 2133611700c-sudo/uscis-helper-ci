/**
 * Passport Booklet Contract — Messenginfo v5.0
 *
 * Single source of truth for the Ukrainian internal passport booklet module.
 * Defines the 11 critical fields + 3 extended fields with:
 *  - canonical internal field key (used in DB, API, and field-mapper)
 *  - display labels in EN / RU / UK
 *  - Ukrainian source label patterns as they appear on the document
 *  - evidence type expectation
 *  - validators that must run before confirmed
 *  - review / fallback policy
 *
 * Import this everywhere field definitions are needed.
 * Do NOT hard-code field names or labels in other files.
 *
 * Note on naming:
 *   Internal key   ↔  Spec label (USCIS/public)
 *   series         ↔  passport_series
 *   number         ↔  passport_number
 *   given_names    ↔  given_name
 *   issued_by      ↔  issuing_authority
 */

import type { EvidenceType } from '../types'

// ── Validator IDs (correspond to actual validator functions) ─────────────────

export type ValidatorId =
  | 'perforation'        // passportPerforationValidator — series + number format + ambiguous digits
  | 'date_zone_lock'     // dateFieldLockValidator       — date_of_birth vs date_of_issue zone
  | 'date_normalize'     // normalizeDateUkrainian       — Ukrainian spelled-out date → MM/DD/YYYY
  | 'name_normalize'     // nameNormalizer               — lookalike detection, casing
  | 'agency_glossary'    // agencyGlossary               — issued_by → resolved English
  | 'sex_normalize'      // inline in field-mapper       — Ч/М→Male, Ж/Ж→Female

// ── Review policy ────────────────────────────────────────────────────────────

export type ReviewPolicy =
  | 'always'             // always require user confirmation, no matter what
  | 'if_low_confidence'  // require confirmation when confidence < threshold
  | 'if_validator_flag'  // require confirmation when any validator sets review_required
  | 'never'              // extended/informational fields only

// ── Fallback behaviour when field is missing from OCR ───────────────────────

export type MissingFieldBehavior =
  | 'block'              // critical: prevent certification until field is present
  | 'warn_review'        // warn and mark review_required but do not block
  | 'skip'               // extended field: omit silently if not present

// ── Field contract ───────────────────────────────────────────────────────────

export interface PassportFieldContract {
  /** Canonical internal key — used in DB, API, field-mapper, and type guards */
  key: string

  /** Corresponds to the USCIS-facing / public label (may differ from key) */
  spec_label: string

  /** Is this a critical field? Critical fields block certification when missing. */
  critical: boolean

  /** Display labels */
  display: {
    en: string   // shown to user in English review UI
    ru: string   // shown to user in Russian UI
    uk: string   // shown to user in Ukrainian UI
  }

  /**
   * Ukrainian source label patterns that appear on the physical document.
   * Used by field-mapper to identify and cross-check field extraction.
   * Ordered: most common first.
   */
  source_labels: string[]

  /** Expected evidence type for a well-extracted field */
  expected_evidence: EvidenceType

  /** Minimum OCR confidence below which review_required is set automatically */
  min_confidence: number

  /** Validators that must run on this field */
  validators: ValidatorId[]

  /** When does the user need to confirm this field? */
  review_policy: ReviewPolicy

  /** What happens if OCR does not return this field at all? */
  on_missing: MissingFieldBehavior

  /**
   * For date fields: which source zones are allowed.
   * Mirrors DATE_ZONE_LOCKS in dateFieldLockValidator.ts (kept in sync manually).
   */
  allowed_zones?: string[]

  /** Additional notes for maintainers */
  notes?: string
}

// ── 11 Critical fields ───────────────────────────────────────────────────────

export const PASSPORT_BOOKLET_CRITICAL_FIELDS: readonly PassportFieldContract[] = [
  {
    key:               'document_type',
    spec_label:        'document_type',
    critical:          true,
    display: {
      en: 'Document Type',
      ru: 'Тип документа',
      uk: 'Тип документа',
    },
    source_labels:     ['ПАСПОРТ', 'PASSPORT'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.80,
    validators:        [],
    review_policy:     'if_low_confidence',
    on_missing:        'block',
    notes:             'Normalized value must be "Ukrainian Internal Passport". No abbreviations.',
  },

  {
    key:               'series',
    spec_label:        'passport_series',
    critical:          true,
    display: {
      en: 'Passport Series',
      ru: 'Серия паспорта',
      uk: 'Серія паспорта',
    },
    source_labels:     ['СЕРІЯ', 'СЕРIЯ', 'серія', 'серiя'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.85,
    validators:        ['perforation'],
    review_policy:     'if_validator_flag',
    on_missing:        'block',
    notes:             '2 Cyrillic uppercase letters. Perforation validator checks for ambiguous digit lookalikes in the series.',
  },

  {
    key:               'number',
    spec_label:        'passport_number',
    critical:          true,
    display: {
      en: 'Passport Number',
      ru: 'Номер паспорта',
      uk: 'Номер паспорта',
    },
    source_labels:     ['НОМЕР', 'NUMBER', '№'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.90,
    validators:        ['perforation'],
    review_policy:     'if_validator_flag',
    on_missing:        'block',
    notes:             '6 digits. Perforation validator flags: 0/8, 1/7, 6/9 ambiguity. review_required if any ambiguous digit found.',
  },

  {
    key:               'surname',
    spec_label:        'surname',
    critical:          true,
    display: {
      en: 'Surname',
      ru: 'Фамилия',
      uk: 'Прізвище',
    },
    source_labels:     ['ПРІЗВИЩЕ', 'ПРIЗВИЩЕ', 'ФАМИЛИЯ'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.80,
    validators:        ['name_normalize'],
    review_policy:     'if_validator_flag',
    on_missing:        'block',
    notes:             'nameNormalizer runs lookalike detection (Latin/Cyrillic), abnormal casing check. User corrected value is controlling_spelling.',
  },

  {
    key:               'given_names',
    spec_label:        'given_name',
    critical:          true,
    display: {
      en: 'Given Name',
      ru: 'Имя',
      uk: "Ім'я",
    },
    source_labels:     ["ІМ'Я", 'ІМЯ', 'IМJA', 'ИМЯ'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.80,
    validators:        ['name_normalize'],
    review_policy:     'if_validator_flag',
    on_missing:        'block',
    notes:             'First name only. Patronymic is a separate field. nameNormalizer applies same rules as surname.',
  },

  {
    key:               'patronymic',
    spec_label:        'patronymic',
    critical:          true,
    display: {
      en: 'Patronymic',
      ru: 'Отчество',
      uk: 'По батькові',
    },
    source_labels:     ['ПО БАТЬКОВІ', 'ПО БАТЬКОВI', 'ОТЧЕСТВО', 'PATRONYMIC'],
    expected_evidence: 'combined_ocr_bbox',
    min_confidence:    0.75,
    validators:        ['name_normalize'],
    review_policy:     'if_validator_flag',
    on_missing:        'warn_review',
    notes:             'Ukrainian patronymic is NOT a middle name. Translation must use "Patronymic" as the field label, not "Middle Name". combined_ocr_bbox expected as label is multi-word.',
  },

  {
    key:               'date_of_birth',
    spec_label:        'date_of_birth',
    critical:          true,
    display: {
      en: 'Date of Birth',
      ru: 'Дата рождения',
      uk: 'Дата народження',
    },
    source_labels:     ['ДАТА НАРОДЖЕННЯ', 'ДАТА НАРОДЖ.', 'DATE OF BIRTH'],
    expected_evidence: 'combined_ocr_bbox',
    min_confidence:    0.85,
    validators:        ['date_zone_lock', 'date_normalize'],
    review_policy:     'if_validator_flag',
    on_missing:        'block',
    allowed_zones:     ['birth_block', 'personal_data', 'dob_line', 'demographic_block'],
    notes:             'Zone lock: MUST come from birth/personal_data zone, NOT issuance_block. date_normalize handles Ukrainian/Russian spelled-out months.',
  },

  {
    key:               'place_of_birth',
    spec_label:        'place_of_birth',
    critical:          true,
    display: {
      en: 'Place of Birth',
      ru: 'Место рождения',
      uk: 'Місце народження',
    },
    source_labels:     ['МІСЦЕ НАРОДЖЕННЯ', 'МІСЦЕ НАРОДЖ.', 'PLACE OF BIRTH'],
    expected_evidence: 'combined_ocr_bbox',
    min_confidence:    0.75,
    validators:        [],
    review_policy:     'if_low_confidence',
    on_missing:        'block',
    notes:             'May span multiple lines (city + oblast). Do not modernize historical oblast names (pre-1991 Soviet names must appear verbatim as printed).',
  },

  {
    key:               'sex',
    spec_label:        'sex',
    critical:          true,
    display: {
      en: 'Sex',
      ru: 'Пол',
      uk: 'Стать',
    },
    source_labels:     ['СТАТЬ', 'SEX', 'ПОЛ'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.90,
    validators:        ['sex_normalize'],
    review_policy:     'if_low_confidence',
    on_missing:        'block',
    notes:             'Ч or М → Male; Ж → Female. Never output raw Cyrillic code in PDF — must be English.',
  },

  {
    key:               'issued_by',
    spec_label:        'issuing_authority',
    critical:          true,
    display: {
      en: 'Issuing Authority',
      ru: 'Орган выдачи',
      uk: 'Орган видачі',
    },
    source_labels:     ['ОРГАН ВИДАЧІ', 'ОРГАН ВИДАЧI', 'ВИДАНИЙ', 'ВИДАНИЙ(-А)', 'ISSUED BY'],
    expected_evidence: 'combined_ocr_bbox',
    min_confidence:    0.75,
    validators:        ['agency_glossary'],
    review_policy:     'if_validator_flag',
    on_missing:        'block',
    notes:             'agencyGlossary resolves abbreviations. Pre-2015 УМВС/МВС units: "Militsiya Department", NOT "Police" (ADR-004). НПУ before 2015 → review_required. Geographic qualifiers (Київський РВ etc.) do not trigger review.',
  },

  {
    key:               'date_of_issue',
    spec_label:        'date_of_issue',
    critical:          true,
    display: {
      en: 'Date of Issue',
      ru: 'Дата выдачи',
      uk: 'Дата видачі',
    },
    source_labels:     ['ДАТА ВИДАЧІ', 'ДАТА ВИДАЧI', 'DATE OF ISSUE'],
    expected_evidence: 'combined_ocr_bbox',
    min_confidence:    0.85,
    validators:        ['date_zone_lock', 'date_normalize'],
    review_policy:     'if_validator_flag',
    on_missing:        'block',
    allowed_zones:     ['issuance_block', 'issue_block', 'validity_block', 'administrative_block'],
    notes:             'Zone lock: MUST come from issuance_block zone, NOT birth/personal_data zone. date_of_issue zone must NOT overlap with date_of_birth zone.',
  },
] as const

// ── 3 Extended fields (extract if present; do not block certification) ────────

export const PASSPORT_BOOKLET_EXTENDED_FIELDS: readonly PassportFieldContract[] = [
  {
    key:               'nationality',
    spec_label:        'nationality',
    critical:          false,
    display: {
      en: 'Nationality',
      ru: 'Гражданство',
      uk: 'Громадянство',
    },
    source_labels:     ['ГРОМАДЯНСТВО', 'CITIZENSHIP', 'NATIONALITY'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.70,
    validators:        [],
    review_policy:     'never',
    on_missing:        'skip',
    notes:             'Normalized: "Ukrainian". Skip if not present.',
  },

  {
    key:               'date_of_expiry',
    spec_label:        'date_of_expiry',
    critical:          false,
    display: {
      en: 'Date of Expiry',
      ru: 'Действителен до',
      uk: 'Дійсний до',
    },
    source_labels:     ['ДІЙСНИЙ ДО', 'ДIЙСНИЙ ДО', 'DATE OF EXPIRY'],
    expected_evidence: 'combined_ocr_bbox',
    min_confidence:    0.75,
    validators:        ['date_normalize'],
    review_policy:     'if_low_confidence',
    on_missing:        'skip',
    allowed_zones:     ['issuance_block', 'validity_block', 'expiry_block'],
  },

  {
    key:               'record_number',
    spec_label:        'record_number',
    critical:          false,
    display: {
      en: 'Tax ID (РНОКПП)',
      ru: 'ИНН (РНОКПП)',
      uk: 'РНОКПП',
    },
    source_labels:     ['РНОКПП', 'ІПН', 'ІНН'],
    expected_evidence: 'ocr_bbox',
    min_confidence:    0.70,
    validators:        [],
    review_policy:     'never',
    on_missing:        'skip',
    notes:             '10-digit Ukrainian tax number. Never include in PDF unless user confirms it should be present. PII — extra caution.',
  },
] as const

// ── Combined flat list (all fields) ─────────────────────────────────────────

export const PASSPORT_BOOKLET_ALL_FIELDS: readonly PassportFieldContract[] = [
  ...PASSPORT_BOOKLET_CRITICAL_FIELDS,
  ...PASSPORT_BOOKLET_EXTENDED_FIELDS,
]

// ── Lookup helpers ───────────────────────────────────────────────────────────

/** All valid internal field keys for this document type */
export const PASSPORT_BOOKLET_FIELD_KEYS: ReadonlySet<string> = new Set(
  PASSPORT_BOOKLET_ALL_FIELDS.map(f => f.key)
)

/** Only the 11 critical field keys */
export const PASSPORT_BOOKLET_CRITICAL_KEYS: ReadonlySet<string> = new Set(
  PASSPORT_BOOKLET_CRITICAL_FIELDS.map(f => f.key)
)

/**
 * Maps internal key → spec label.
 * Use when writing field labels to the PDF or USCIS-facing output.
 */
export const INTERNAL_TO_SPEC: Readonly<Record<string, string>> = Object.fromEntries(
  PASSPORT_BOOKLET_ALL_FIELDS.map(f => [f.key, f.spec_label])
)

/**
 * Maps spec label → internal key (reverse lookup).
 */
export const SPEC_TO_INTERNAL: Readonly<Record<string, string>> = Object.fromEntries(
  PASSPORT_BOOKLET_ALL_FIELDS.map(f => [f.spec_label, f.key])
)

/**
 * Look up a field contract by internal key.
 * Returns undefined if the key is not part of this document type.
 */
export function getPassportFieldContract(key: string): PassportFieldContract | undefined {
  return PASSPORT_BOOKLET_ALL_FIELDS.find(f => f.key === key)
}

/**
 * Check whether a field key is valid for this document type.
 * Replaces scattered .has() checks against manual Sets in other files.
 */
export function isPassportBookletField(key: string): boolean {
  return PASSPORT_BOOKLET_FIELD_KEYS.has(key)
}

/**
 * Check whether a field is critical (blocks certification when missing).
 */
export function isCriticalPassportField(key: string): boolean {
  return PASSPORT_BOOKLET_CRITICAL_KEYS.has(key)
}

/**
 * Return the display label for a field in the given locale.
 * Defaults to English if locale not found.
 */
export function getDisplayLabel(key: string, locale: 'en' | 'ru' | 'uk' = 'en'): string {
  const contract = getPassportFieldContract(key)
  if (!contract) return key
  return contract.display[locale] ?? contract.display.en
}

/**
 * Cross-check validator: date_of_birth and date_of_issue must come
 * from non-overlapping zones. Returns an error string if there is a conflict,
 * or null if clean.
 */
export function crossCheckDateZones(params: {
  date_of_birth_zone?: string
  date_of_issue_zone?: string
}): string | null {
  const { date_of_birth_zone, date_of_issue_zone } = params
  if (!date_of_birth_zone || !date_of_issue_zone) return null

  const dob = date_of_birth_zone.toLowerCase()
  const doi = date_of_issue_zone.toLowerCase()

  const dobAllowed = PASSPORT_BOOKLET_CRITICAL_FIELDS.find(f => f.key === 'date_of_birth')?.allowed_zones ?? []
  const doiAllowed = PASSPORT_BOOKLET_CRITICAL_FIELDS.find(f => f.key === 'date_of_issue')?.allowed_zones ?? []

  // If date_of_birth's zone appears in date_of_issue's allowed list → conflict
  if (doiAllowed.some(z => dob.includes(z))) {
    return `date_of_birth zone '${date_of_birth_zone}' overlaps with date_of_issue allowed zones — possible field swap`
  }

  // If date_of_issue's zone appears in date_of_birth's allowed list → conflict
  if (dobAllowed.some(z => doi.includes(z))) {
    return `date_of_issue zone '${date_of_issue_zone}' overlaps with date_of_birth allowed zones — possible field swap`
  }

  return null
}
