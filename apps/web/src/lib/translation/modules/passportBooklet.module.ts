/**
 * Ukrainian Internal Passport Booklet Module — Messenginfo v6.0
 *
 * STATUS: active
 * Document type: ua_internal_passport_booklet
 *
 * This is the authoritative production module for Ukrainian internal passport
 * (blue booklet, book format). It replaces the scattered CRITICAL_FIELDS arrays
 * in certify/route.ts, render/route.ts, and ocr-from-storage/route.ts.
 *
 * Field naming: uses INTERNAL names (series, number, given_names, issued_by)
 * as used in the DB and OCR pipeline. For USCIS-facing spec names, see
 * INTERNAL_TO_SPEC in passportBookletContract.ts.
 *
 * Validators referenced here correspond to actual implementations:
 *   passport_series_format   → passportPerforationValidator.validatePassportPerforation
 *   passport_number_format   → passportPerforationValidator.validatePassportPerforation
 *   date_of_birth_lock       → dateFieldLockValidator.validateDateFieldLock
 *   date_of_issue_lock       → dateFieldLockValidator.validateDateFieldLock
 *   month_map_uk_ru          → dateFieldLockValidator / UKRAINIAN_MONTHS + RUSSIAN_MONTHS
 *   name_mixed_script        → nameNormalizer.analyseNameField
 *   agency_glossary          → agencyGlossary.resolveIssuedBy
 *   no_police_for_pre2015_mvs → agencyGlossary era rules
 *   bilingual_layer          → UKRAINIAN_MONTHS > RUSSIAN_MONTHS priority
 *   source_evidence_required → BboxStatus not 'missing' for critical fields
 *   date_zone_cross_check    → passportBookletContract.crossCheckDateZones
 */
import type { DocumentModule } from './types'

export const passportBookletModule: DocumentModule = {
  documentType: 'ua_internal_passport_booklet',

  displayName: {
    en: 'Ukrainian Internal Passport Booklet',
    ru: 'Паспорт гражданина Украины (книжечка)',
    uk: 'Паспорт громадянина України (книжечка)',
  },

  status: 'active',

  supportedLanguages: ['uk', 'ru'],

  // ── 11 Critical fields ───────────────────────────────────────────────────
  // Every field: reviewRequired=true, evidenceRequired='required'
  // Any missing critical field → placeholder row + review_required=true

  criticalFields: [
    {
      key: 'document_type',
      label: { en: 'Document Type', ru: 'Тип документа', uk: 'Тип документа' },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПАСПОРТ', 'PASSPORT'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'series',
      label: { en: 'Passport Series', ru: 'Серия паспорта', uk: 'Серія паспорта' },
      required: true,
      valueType: 'series',
      sourceLabels: ['СЕРІЯ', 'СЕРIЯ', 'серія'],
      validators: ['passport_series_format'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'number',
      label: { en: 'Passport Number', ru: 'Номер паспорта', uk: 'Номер паспорта' },
      required: true,
      valueType: 'number',
      sourceLabels: ['НОМЕР', 'NUMBER', '№'],
      validators: ['passport_number_format'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'surname',
      label: { en: 'Surname', ru: 'Фамилия', uk: 'Прізвище' },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПРІЗВИЩЕ', 'ПРIЗВИЩЕ', 'ФАМИЛИЯ'],
      validators: ['name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'given_names',
      label: { en: 'Given Name', ru: 'Имя', uk: "Ім'я" },
      required: true,
      valueType: 'text',
      sourceLabels: ["ІМ'Я", 'ІМЯ', 'ИМЯ'],
      validators: ['name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'patronymic',
      label: { en: 'Patronymic', ru: 'Отчество', uk: 'По батькові' },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПО БАТЬКОВІ', 'ПО БАТЬКОВI', 'ОТЧЕСТВО', 'PATRONYMIC'],
      validators: ['name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'date_of_birth',
      label: { en: 'Date of Birth', ru: 'Дата рождения', uk: 'Дата народження' },
      required: true,
      valueType: 'date',
      sourceLabels: ['ДАТА НАРОДЖЕННЯ', 'ДАТА НАРОДЖ.', 'DATE OF BIRTH'],
      validators: ['date_of_birth_lock', 'month_map_uk_ru', 'date_zone_cross_check'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'place_of_birth',
      label: { en: 'Place of Birth', ru: 'Место рождения', uk: 'Місце народження' },
      required: true,
      valueType: 'multi_line',
      sourceLabels: ['МІСЦЕ НАРОДЖЕННЯ', 'МІСЦЕ НАРОДЖ.', 'PLACE OF BIRTH'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'sex',
      label: { en: 'Sex', ru: 'Пол', uk: 'Стать' },
      required: true,
      valueType: 'sex',
      sourceLabels: ['СТАТЬ', 'SEX', 'ПОЛ'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'issued_by',
      label: { en: 'Issuing Authority', ru: 'Орган выдачи', uk: 'Орган видачі' },
      required: true,
      valueType: 'authority',
      sourceLabels: ['ОРГАН ВИДАЧІ', 'ОРГАН ВИДАЧI', 'ВИДАНИЙ', 'ВИДАНИЙ(-А)', 'ISSUED BY'],
      validators: ['agency_glossary', 'no_police_for_pre2015_mvs'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'date_of_issue',
      label: { en: 'Date of Issue', ru: 'Дата выдачи', uk: 'Дата видачі' },
      required: true,
      valueType: 'date',
      sourceLabels: ['ДАТА ВИДАЧІ', 'ДАТА ВИДАЧI', 'DATE OF ISSUE'],
      validators: ['date_of_issue_lock', 'month_map_uk_ru', 'date_zone_cross_check'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
  ],

  // ── Optional fields ───────────────────────────────────────────────────────
  optionalFields: [
    {
      key: 'nationality',
      label: { en: 'Nationality', ru: 'Гражданство', uk: 'Громадянство' },
      required: false,
      valueType: 'text',
      sourceLabels: ['ГРОМАДЯНСТВО', 'NATIONALITY', 'CITIZENSHIP'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'date_of_expiry',
      label: { en: 'Date of Expiry', ru: 'Действителен до', uk: 'Дійсний до' },
      required: false,
      valueType: 'date',
      sourceLabels: ['ДІЙСНИЙ ДО', 'ДIЙСНИЙ ДО'],
      validators: ['month_map_uk_ru'],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'record_number',
      label: { en: 'Tax ID (РНОКПП)', ru: 'ИНН (РНОКПП)', uk: 'РНОКПП' },
      required: false,
      valueType: 'number',
      sourceLabels: ['РНОКПП', 'ІПН', 'ІНН'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'registration_address',
      label: {
        en: 'Registration Address',
        ru: 'Адрес регистрации',
        uk: 'Адреса реєстрації',
      },
      required: false,
      valueType: 'multi_line',
      sourceLabels: ['МІСЦЕ ПРОЖИВАННЯ', 'МІСЦЕ РЕЄСТРАЦІЇ'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
  ],

  expectedLabels: {
    'ПАСПОРТ':        ['document_type'],
    'PASSPORT':       ['document_type'],
    'СЕРІЯ':          ['series'],
    'НОМЕР':          ['number'],
    'ПРІЗВИЩЕ':       ['surname'],
    "ІМ'Я":          ['given_names'],
    'ПО БАТЬКОВІ':    ['patronymic'],
    'ДАТА НАРОДЖЕННЯ':['date_of_birth'],
    'МІСЦЕ НАРОДЖЕННЯ':['place_of_birth'],
    'СТАТЬ':          ['sex'],
    'ОРГАН ВИДАЧІ':        ['issued_by'],
    'ВИДАНИЙ':             ['issued_by'],
    'ДАТА ВИДАЧІ':         ['date_of_issue'],
    'МІСЦЕ ПРОЖИВАННЯ':    ['registration_address'],
    'МІСЦЕ РЕЄСТРАЦІЇ':    ['registration_address'],
  },

  glossaryModules: ['ukraine_agency_abbreviations'],

  validators: [
    'passport_series_format',
    'passport_number_format',
    'date_of_birth_lock',
    'date_of_issue_lock',
    'month_map_uk_ru',
    'name_mixed_script',
    'agency_glossary',
    'no_police_for_pre2015_mvs',
    'bilingual_layer',
    'source_evidence_required',
    'date_zone_cross_check',
  ],

  extraction: {
    ocrProvider: 'google_vision',
    fieldMapper: 'deepseek_text',
    glossaryFiles: ['ukraine_agency_abbreviations.json'],
    fieldTargets: [
      // 11 critical
      'document_type', 'series', 'number', 'surname', 'given_names',
      'patronymic', 'date_of_birth', 'place_of_birth', 'sex', 'issued_by', 'date_of_issue',
      // 4 extended
      'nationality', 'date_of_expiry', 'record_number', 'registration_address',
    ],
    timeoutMs: 45_000,
  },

  render: {
    templateId: 'ua_passport_booklet_v1',
    renderFields: [
      'document_type', 'series', 'number', 'surname', 'given_names',
      'patronymic', 'date_of_birth', 'place_of_birth', 'sex', 'issued_by', 'date_of_issue',
      'registration_address',
    ],
    certificationTemplate: 'self_cert_8cfr_v1',
    twoPageLayout: true,
  },

  reviewPolicy: {
    requireUserConfirmation: true,
    requireEvidenceForCriticalFields: true,
    allowAutoPdf: true,            // allowed ONLY after all review + certification gates
    manualReviewIfMissingCritical: true,
    manualReviewIfLowConfidence: true,
    manualReviewIfUnsupportedLayout: true,
    lowConfidenceThreshold: 0.65,
  },

  unsupportedConditions: [
    {
      code: 'image_too_blurry',
      description: 'Image quality insufficient to read perforated series/number',
      action: 'route_to_manual_review',
    },
    {
      code: 'non_ukrainian_passport',
      description: 'Document appears to be a foreign passport, not Ukrainian',
      action: 'route_to_manual_review',
    },
    {
      code: 'biometric_passport',
      description: 'Biometric ID card detected — use ua_passport_id_card module',
      action: 'route_to_manual_review',
    },
  ],
}

// ── Convenience: the 11 critical field keys in order ─────────────────────────
// Use this instead of hardcoded arrays in routes.
export const PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS: readonly string[] =
  passportBookletModule.criticalFields.map(f => f.key)

// ── Certification gate fields ─────────────────────────────────────────────────
// Subset used for the certify + render gates.
// Includes all 11 critical fields (previously only 8 were checked — this is correct).
export const PASSPORT_BOOKLET_GATE_FIELDS: readonly string[] =
  PASSPORT_BOOKLET_CRITICAL_FIELD_KEYS
