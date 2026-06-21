/**
 * Ukrainian Birth Certificate Module — Messenginfo v6.0
 *
 * STATUS: active
 * Document type: ua_birth_certificate
 *
 * This module defines the field contract, extraction config, validators,
 * review policy, and PDF render config for Ukrainian birth certificates
 * (Свідоцтво про народження).
 *
 * Critical distinction (USCIS-required):
 *   certificate_number  (e.g. І-КВ 123456) — printed on certificate face
 *   act_record_number   (e.g. 789)          — civil registry act record
 *   These are DIFFERENT fields. USCIS forms sometimes request act_record_number
 *   specifically. Both MUST be extracted and displayed separately.
 *
 * Validators referenced here correspond to implementations in:
 *   certificate_number_not_act_record_number → birthCertificateValidators.ts
 *   act_record_date_lock                     → birthCertificateValidators.ts
 *   date_of_birth_lock                       → dateFieldLockValidator.ts (extended)
 *   date_of_issue_lock                       → birthCertificateValidators.ts
 *   parent_names_not_swapped                 → birthCertificateValidators.ts
 *   nominative_case_required                 → birthCertificateValidators.ts
 *   civil_registry_glossary                  → agencyGlossary.ts (ЗАГС/РАЦС/ДРАЦС)
 *   source_evidence_required                 → BboxStatus not 'missing' for critical fields
 *   bilingual_layer                          → Ukrainian primary, Russian → review_required
 *   name_mixed_script                        → mixed Cyrillic/Latin → review_required
 *   forbidden_birth_cert_mislabels           → birthCertificateValidators.ts
 */
import type { DocumentModule } from './types'

export const birthCertificateModule: DocumentModule = {
  documentType: 'ua_birth_certificate',

  displayName: {
    en: 'Ukrainian Birth Certificate',
    ru: 'Свидетельство о рождении (Украина)',
    uk: 'Свідоцтво про народження (Україна)',
  },

  // Demoted from 'active' to 'draft' on 2026-05-09 per
  // DEMOTE_UNPROVEN_MODULES_AND_LOCK_PRODUCTION_SCOPE.
  // Synthetic-only E2E is not sufficient for self-serve auto-PDF.
  // Re-promote only after a real (sanitized) fixture passes the FULL
  // pipeline (upload → OCR → extraction → review → certify → render).
  // While 'draft', registry.getDocumentModule() returns manualReviewModule
  // for ua_birth_certificate, so customer PDF cannot be produced and the
  // session is escalated to manual review.
  status: 'draft',

  supportedLanguages: ['uk', 'ru'],

  // ── 14 Critical fields ───────────────────────────────────────────────────
  // Every critical field: reviewRequired=true, user must confirm before PDF.
  // Missing critical field → placeholder row with review_required=true.

  criticalFields: [
    {
      key: 'document_type',
      label: { en: 'Document Type', ru: 'Тип документа', uk: 'Тип документа' },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'СВІДОЦТВО ПРО НАРОДЖЕННЯ',
        'СВИДЕТЕЛЬСТВО О РОЖДЕНИИ',
      ],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'certificate_series',
      label: {
        en: 'Certificate Series',
        ru: 'Серия свидетельства',
        uk: 'Серія свідоцтва',
      },
      required: true,
      valueType: 'series',
      sourceLabels: ['СЕРІЯ', 'СЕРIЯ', 'СЕРИЯ'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'certificate_number',
      label: {
        en: 'Certificate Number',
        ru: 'Номер свидетельства',
        uk: 'Номер свідоцтва',
      },
      required: true,
      valueType: 'number',
      sourceLabels: ['№', 'НОМЕР', 'СВІДОЦТВО №'],
      validators: ['certificate_number_not_act_record_number'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'act_record_number',
      label: {
        en: 'Act Record Number',
        ru: 'Номер актовой записи',
        uk: 'Номер актового запису',
      },
      required: true,
      valueType: 'number',
      sourceLabels: [
        'АКТОВИЙ ЗАПИС №',
        'АКТОВАЯ ЗАПИСЬ №',
        'АКТ. ЗАПИС №',
        'НОМЕР АКТОВОГО ЗАПИСУ',
      ],
      validators: ['certificate_number_not_act_record_number'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'act_record_date',
      label: {
        en: 'Act Record Date',
        ru: 'Дата актовой записи',
        uk: 'Дата актового запису',
      },
      required: true,
      valueType: 'date',
      sourceLabels: [
        'ДАТА СКЛАДАННЯ ЗАПИСУ',
        'ДАТА СОСТАВЛЕНИЯ ЗАПИСИ',
        'ДАТА СКЛАДАННЯ АКТОВОГО ЗАПИСУ',
      ],
      validators: ['act_record_date_lock', 'month_map_uk_ru'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'child_surname',
      label: {
        en: "Child's Surname",
        ru: 'Фамилия ребёнка',
        uk: 'Прізвище дитини',
      },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПРІЗВИЩЕ ДИТИНИ', 'ФАМИЛИЯ РЕБЕНКА', 'ПРІЗВИЩЕ'],
      validators: ['name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'child_given_name',
      label: {
        en: "Child's Given Name",
        ru: 'Имя ребёнка',
        uk: "Ім'я дитини",
      },
      required: true,
      valueType: 'text',
      sourceLabels: ["ІМ'Я ДИТИНИ", "ІМ'Я", 'ИМЯ РЕБЕНКА'],
      validators: ['name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'child_patronymic',
      label: {
        en: "Child's Patronymic",
        ru: 'Отчество ребёнка',
        uk: 'По батькові дитини',
      },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПО БАТЬКОВІ ДИТИНИ', 'ПО БАТЬКОВІ', 'ОТЧЕСТВО РЕБЕНКА'],
      validators: ['name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'date_of_birth',
      label: {
        en: 'Date of Birth',
        ru: 'Дата рождения',
        uk: 'Дата народження',
      },
      required: true,
      valueType: 'date',
      sourceLabels: ['ДАТА НАРОДЖЕННЯ', 'ДАТА РОЖДЕНИЯ'],
      validators: ['date_of_birth_lock', 'month_map_uk_ru'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'place_of_birth',
      label: {
        en: 'Place of Birth',
        ru: 'Место рождения',
        uk: 'Місце народження',
      },
      required: true,
      valueType: 'multi_line',
      sourceLabels: ['МІСЦЕ НАРОДЖЕННЯ', 'МЕСТО РОЖДЕНИЯ'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'father_full_name',
      label: {
        en: "Father's Full Name",
        ru: 'Полное имя отца',
        uk: "Повне ім'я батька",
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        "ІМ'Я ТА ПО БАТЬКОВІ БАТЬКА",
        "БАТЬКО: ІМ'Я ТА ПО БАТЬКОВІ",
        'ИМЯ И ОТЧЕСТВО ОТЦА',
        'ОТЕЦ',
        'БАТЬКО',
      ],
      validators: ['parent_names_not_swapped', 'nominative_case_required', 'name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'mother_full_name',
      label: {
        en: "Mother's Full Name",
        ru: 'Полное имя матери',
        uk: "Повне ім'я матері",
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        "ІМ'Я ТА ПО БАТЬКОВІ МАТЕРІ",
        "МАТИ: ІМ'Я ТА ПО БАТЬКОВІ",
        'ИМЯ И ОТЧЕСТВО МАТЕРИ',
        'МАТЬ',
        'МАТИ',
      ],
      validators: ['parent_names_not_swapped', 'nominative_case_required', 'name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'issuing_authority',
      label: {
        en: 'Issuing Authority',
        ru: 'Орган выдачи',
        uk: 'Орган видачі',
      },
      required: true,
      valueType: 'authority',
      sourceLabels: [
        'ОРГАН РЕЄСТРАЦІЇ',
        'ОРГАН РЕГИСТРАЦИИ',
        'ВІДДІЛ РАЦС',
        'ВІДДІЛ ДРАЦС',
        'ЗАГС',
        'РАЦС',
        'ДРАЦС',
        'ВІДДІЛ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ',
      ],
      validators: ['civil_registry_glossary', 'source_evidence_required'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'date_of_issue',
      label: {
        en: 'Date of Issue',
        ru: 'Дата выдачи',
        uk: 'Дата видачі',
      },
      required: true,
      valueType: 'date',
      sourceLabels: ['ДАТА ВИДАЧІ', 'ДАТА ВЫДАЧИ'],
      validators: ['date_of_issue_lock', 'month_map_uk_ru'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
  ],

  // ── 7 Optional fields ────────────────────────────────────────────────────
  // Not required for PDF render. Extracted if present.

  optionalFields: [
    {
      key: 'citizenship',
      label: { en: 'Citizenship', ru: 'Гражданство', uk: 'Громадянство' },
      required: false,
      valueType: 'text',
      sourceLabels: ['ГРОМАДЯНСТВО', 'ГРАЖДАНСТВО'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'sex',
      label: { en: 'Sex', ru: 'Пол', uk: 'Стать' },
      required: false,
      valueType: 'sex',
      sourceLabels: ['СТАТЬ', 'ПОЛ'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'registration_place',
      label: { en: 'Registration Place', ru: 'Место регистрации', uk: 'Місце реєстрації' },
      required: false,
      valueType: 'multi_line',
      sourceLabels: ['МІСЦЕ РЕЄСТРАЦІЇ', 'МЕСТО РЕГИСТРАЦИИ'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'repeated_certificate_marker',
      label: {
        en: 'Repeated Certificate',
        ru: 'Повторное свидетельство',
        uk: 'Повторне свідоцтво',
      },
      required: false,
      valueType: 'boolean',
      sourceLabels: ['ПОВТОРНО', 'ПОВТОРНОЕ'],
      validators: [],
      reviewRequired: true,    // affects document status if present
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'readable_stamp_text',
      label: { en: 'Stamp Text', ru: 'Текст штампа', uk: 'Текст штампу' },
      required: false,
      valueType: 'text',
      sourceLabels: [],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'document_language_layer',
      label: {
        en: 'Document Language',
        ru: 'Язык документа',
        uk: 'Мова документа',
      },
      required: false,
      valueType: 'text',
      sourceLabels: [],
      validators: ['bilingual_layer'],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'archive_or_duplicate_note',
      label: {
        en: 'Archive / Duplicate Note',
        ru: 'Архивная / дубликатная запись',
        uk: 'Архівна / дублікатна позначка',
      },
      required: false,
      valueType: 'text',
      sourceLabels: ['АРХІВ', 'ДУБЛІКАТ', 'АРХИВ', 'ДУБЛИКАТ'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
  ],

  expectedLabels: {
    'СВІДОЦТВО ПРО НАРОДЖЕННЯ':       ['document_type'],
    'СВИДЕТЕЛЬСТВО О РОЖДЕНИИ':        ['document_type'],
    'СЕРІЯ':                           ['certificate_series'],
    'АКТОВИЙ ЗАПИС №':                 ['act_record_number'],
    'ДАТА СКЛАДАННЯ ЗАПИСУ':           ['act_record_date'],
    'ДАТА НАРОДЖЕННЯ':                 ['date_of_birth'],
    'МІСЦЕ НАРОДЖЕННЯ':                ['place_of_birth'],
    'БАТЬКО':                          ['father_full_name'],
    'МАТИ':                            ['mother_full_name'],
    'ОРГАН РЕЄСТРАЦІЇ':                ['issuing_authority'],
    'ДАТА ВИДАЧІ':                     ['date_of_issue'],
  },

  glossaryModules: ['civil_registry_glossary', 'agency_glossary'],

  validators: [
    'certificate_number_not_act_record_number',
    'act_record_date_lock',
    'date_of_birth_lock',
    'date_of_issue_lock',
    'parent_names_not_swapped',
    'nominative_case_required',
    'civil_registry_glossary',
    'source_evidence_required',
    'bilingual_layer',
    'name_mixed_script',
    'forbidden_birth_cert_mislabels',
  ],

  extraction: {
    ocrProvider: 'google_vision',
    fieldMapper: 'deepseek_text',
    glossaryFiles: [
      'civil_registry_terms.json',
      'ukraine_agency_abbreviations.json',
    ],
    fieldTargets: [
      // Critical fields — all 14
      'document_type',
      'certificate_series',
      'certificate_number',
      'act_record_number',
      'act_record_date',
      'child_surname',
      'child_given_name',
      'child_patronymic',
      'date_of_birth',
      'place_of_birth',
      'father_full_name',
      'mother_full_name',
      'issuing_authority',
      'date_of_issue',
      // Optional fields — 7
      'citizenship',
      'sex',
      'registration_place',
      'repeated_certificate_marker',
      'readable_stamp_text',
      'document_language_layer',
      'archive_or_duplicate_note',
    ],
    timeoutMs: 45_000,
  },

  render: {
    templateId: 'birth_certificate_v1',
    renderFields: [
      'document_type',
      'certificate_series',
      'certificate_number',
      'act_record_number',
      'act_record_date',
      'child_surname',
      'child_given_name',
      'child_patronymic',
      'date_of_birth',
      'place_of_birth',
      'father_full_name',
      'mother_full_name',
      'issuing_authority',
      'date_of_issue',
    ],
    certificationTemplate: 'self_cert_birth_v1',
    twoPageLayout: true,
  },

  reviewPolicy: {
    requireUserConfirmation: true,
    requireEvidenceForCriticalFields: true,
    // Demoted to false on 2026-05-09 — synthetic-only E2E does not justify
    // self-serve auto-PDF. The DocumentModule.status='draft' above is the
    // primary safety lock (registry returns manualReviewModule for non-active
    // statuses); allowAutoPdf:false here is defense-in-depth.
    allowAutoPdf: false,
    manualReviewIfMissingCritical: true,
    manualReviewIfLowConfidence: true,
    manualReviewIfUnsupportedLayout: true,
    lowConfidenceThreshold: 0.85,
  },

  unsupportedConditions: [
    {
      code: 'act_record_number_ambiguous',
      description: 'Act record number and certificate number cannot be distinguished',
      action: 'route_to_manual_review',
    },
    {
      code: 'soviet_era_handwriting',
      description: 'Soviet-era birth certificate with handwritten fields; OCR confidence too low',
      action: 'route_to_manual_review',
    },
    {
      code: 'certificate_number_missing',
      description: 'Certificate series or number not found on document',
      action: 'route_to_manual_review',
    },
    {
      code: 'child_name_missing',
      description: 'Child surname or given name could not be extracted',
      action: 'route_to_manual_review',
    },
    {
      code: 'parent_labels_unclear',
      description: 'Father and mother labels are ambiguous; names cannot be assigned safely',
      action: 'route_to_manual_review',
    },
    {
      code: 'issuing_authority_unknown',
      description: 'Issuing civil registry abbreviation not recognized and not reviewed',
      action: 'route_to_manual_review',
    },
    {
      code: 'dates_not_label_locked',
      description: 'Date fields cannot be confirmed to specific source labels',
      action: 'route_to_manual_review',
    },
    {
      code: 'image_quality_failed',
      description: 'Image is blurred, cropped, or glare prevents reliable OCR',
      action: 'route_to_manual_review',
    },
    {
      code: 'unsupported_layout',
      description: 'Document layout (e.g., tabular or free-text) is not recognized',
      action: 'route_to_manual_review',
    },
    {
      code: 'not_birth_certificate',
      description: 'Document does not appear to be a Ukrainian birth certificate',
      action: 'route_to_manual_review',
    },
  ],

  userStatusMessage:
    'This birth certificate needs manual review. ' +
    'We can help prepare it, but it cannot be automatically finalized yet.',
}

// ── Convenience exports ───────────────────────────────────────────────────────

/** All 14 critical field keys, in extraction order */
export const BIRTH_CERT_CRITICAL_FIELD_KEYS = birthCertificateModule.criticalFields.map(
  f => f.key,
) as readonly string[]

/** All field targets for extraction (critical + optional) */
export const BIRTH_CERT_ALL_FIELD_TARGETS =
  birthCertificateModule.extraction.fieldTargets as readonly string[]

/** Fields to include in the rendered PDF */
export const BIRTH_CERT_RENDER_FIELDS =
  birthCertificateModule.render.renderFields as readonly string[]
