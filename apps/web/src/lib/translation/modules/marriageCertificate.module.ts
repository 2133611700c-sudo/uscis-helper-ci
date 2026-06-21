/**
 * Ukrainian Marriage Certificate Module — Messenginfo v6.0
 *
 * STATUS: active
 * Document type: ua_marriage_certificate
 *
 * This module defines the field contract, extraction config, validators,
 * review policy, and PDF render config for Ukrainian marriage certificates
 * (Свідоцтво про шлюб).
 *
 * Critical distinctions (USCIS-required):
 *   certificate_number  — printed on certificate face (e.g. І-КВ 123456)
 *   act_record_number   — civil registry act record number (different field)
 *   act_record_date     — date of the act record (≠ date_of_marriage, ≠ date_of_issue)
 *   date_of_marriage    — date marriage was registered (may equal act_record_date, must verify)
 *
 * Spouse name safety:
 *   - spouse_1 and spouse_2 must NOT be swapped
 *   - surname_before_marriage ≠ surname_after_marriage — separate fields, separate labels
 *   - patronymic = Patronymic, NEVER "Middle Name"
 *   - name case normalization: genitive/dative → nominative candidate only, never silent
 *
 * Validators referenced here:
 *   certificate_number_not_act_record_number → marriageCertificateValidators.ts
 *   act_record_date_lock                     → marriageCertificateValidators.ts
 *   date_of_marriage_lock                    → marriageCertificateValidators.ts
 *   date_of_issue_lock                       → marriageCertificateValidators.ts
 *   spouse_order_preserved                   → marriageCertificateValidators.ts
 *   before_after_surname_not_swapped         → marriageCertificateValidators.ts
 *   spouse_names_not_swapped                 → marriageCertificateValidators.ts
 *   nominative_case_required_for_names       → marriageCertificateValidators.ts
 *   civil_registry_glossary_required         → agencyGlossary.ts + civil_registry_terms.json
 *   source_evidence_required                 → BboxStatus not 'missing' for critical fields
 *   bilingual_layer_protection               → Ukrainian primary, Russian → review_required
 *   name_mixed_script                        → mixed Cyrillic/Latin → review_required
 *   forbidden_marriage_mislabels             → marriageCertificateValidators.ts
 */
import type { DocumentModule } from './types'

export const marriageCertificateModule: DocumentModule = {
  documentType: 'ua_marriage_certificate',

  displayName: {
    en: 'Ukrainian Marriage Certificate',
    ru: 'Свидетельство о браке (Украина)',
    uk: 'Свідоцтво про шлюб (Україна)',
  },

  // Demoted from 'active' to 'draft' on 2026-05-09 per
  // DEMOTE_UNPROVEN_MODULES_AND_LOCK_PRODUCTION_SCOPE.
  // No real fixture / no E2E smoke / no PDF QA / no privacy QA committed.
  // While 'draft', registry.getDocumentModule() returns manualReviewModule
  // for ua_marriage_certificate, so customer PDF cannot be produced and the
  // session is escalated to manual review.
  // Re-promote to 'active' only after the FULL pipeline pass against a real
  // (sanitized) fixture is committed under artifacts/e2e/marriage_cert/.
  status: 'draft',

  supportedLanguages: ['uk', 'ru'],

  // ── 16 Critical fields ──────────────────────────────────────────────────────
  // Every critical field: reviewRequired=true — user must confirm before PDF.
  // Missing critical field → placeholder row with review_required=true.

  criticalFields: [
    {
      key: 'document_type',
      label: { en: 'Document Type', ru: 'Тип документа', uk: 'Тип документа' },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'СВІДОЦТВО ПРО ШЛЮБ',
        'СВИДЕТЕЛЬСТВО О БРАКЕ',
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
        en: 'Date of Act Record',
        ru: 'Дата актовой записи',
        uk: 'Дата актового запису',
      },
      required: true,
      valueType: 'date',
      sourceLabels: [
        'ДАТА СКЛАДАННЯ АКТОВОГО ЗАПИСУ',
        'ДАТА СОСТАВЛЕНИЯ АКТОВОЙ ЗАПИСИ',
        'ДАТА СКЛАДАННЯ ЗАПИСУ',
      ],
      validators: ['act_record_date_lock'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_1_surname_before_marriage',
      label: {
        en: "Spouse 1 Surname Before Marriage",
        ru: 'Фамилия супруга(и) 1 до брака',
        uk: 'Прізвище чоловіка (дружини) 1 до шлюбу',
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'ПРІЗВИЩЕ ДО ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ',
        'ФАМИЛИЯ ДО ГОСУДАРСТВЕННОЙ РЕГИСТРАЦИИ БРАКА',
        'ПРІЗВИЩЕ ДО ШЛЮБУ',
      ],
      validators: [
        'before_after_surname_not_swapped',
        'nominative_case_required_for_names',
        'name_mixed_script',
        'spouse_order_preserved',
      ],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_1_given_name',
      label: {
        en: "Spouse 1 Given Name",
        ru: 'Имя супруга(и) 1',
        uk: "Ім'я чоловіка (дружини) 1",
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        "ІМ'Я",
        'ИМЯ',
        'ІМЯ',
      ],
      validators: [
        'nominative_case_required_for_names',
        'name_mixed_script',
        'spouse_order_preserved',
      ],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_1_patronymic',
      label: {
        en: "Spouse 1 Patronymic",
        ru: 'Отчество супруга(и) 1',
        uk: 'По батькові чоловіка (дружини) 1',
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'ПО БАТЬКОВІ',
        'ОТЧЕСТВО',
      ],
      validators: [
        'nominative_case_required_for_names',
        'name_mixed_script',
        'forbidden_marriage_mislabels',
      ],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_1_surname_after_marriage',
      label: {
        en: "Spouse 1 Surname After Marriage",
        ru: 'Фамилия супруга(и) 1 после брака',
        uk: 'Прізвище чоловіка (дружини) 1 після шлюбу',
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'ПРІЗВИЩЕ ПІСЛЯ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ',
        'ФАМИЛИЯ ПОСЛЕ ГОСУДАРСТВЕННОЙ РЕГИСТРАЦИИ БРАКА',
        'ПІСЛЯ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ ПРИСВОЄНО ПРІЗВИЩЕ',
        'ПРІЗВИЩЕ ПІСЛЯ ШЛЮБУ',
      ],
      validators: [
        'before_after_surname_not_swapped',
        'nominative_case_required_for_names',
        'name_mixed_script',
      ],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_2_surname_before_marriage',
      label: {
        en: "Spouse 2 Surname Before Marriage",
        ru: 'Фамилия супруга(и) 2 до брака',
        uk: 'Прізвище чоловіка (дружини) 2 до шлюбу',
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'ПРІЗВИЩЕ ДО ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ',
        'ФАМИЛИЯ ДО ГОСУДАРСТВЕННОЙ РЕГИСТРАЦИИ БРАКА',
        'ПРІЗВИЩЕ ДО ШЛЮБУ',
      ],
      validators: [
        'before_after_surname_not_swapped',
        'nominative_case_required_for_names',
        'name_mixed_script',
        'spouse_order_preserved',
      ],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_2_given_name',
      label: {
        en: "Spouse 2 Given Name",
        ru: 'Имя супруга(и) 2',
        uk: "Ім'я чоловіка (дружини) 2",
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        "ІМ'Я",
        'ИМЯ',
        'ІМЯ',
      ],
      validators: [
        'nominative_case_required_for_names',
        'name_mixed_script',
        'spouse_order_preserved',
      ],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_2_patronymic',
      label: {
        en: "Spouse 2 Patronymic",
        ru: 'Отчество супруга(и) 2',
        uk: 'По батькові чоловіка (дружини) 2',
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'ПО БАТЬКОВІ',
        'ОТЧЕСТВО',
      ],
      validators: [
        'nominative_case_required_for_names',
        'name_mixed_script',
        'forbidden_marriage_mislabels',
      ],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_2_surname_after_marriage',
      label: {
        en: "Spouse 2 Surname After Marriage",
        ru: 'Фамилия супруга(и) 2 после брака',
        uk: 'Прізвище чоловіка (дружини) 2 після шлюбу',
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'ПРІЗВИЩЕ ПІСЛЯ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ',
        'ФАМИЛИЯ ПОСЛЕ ГОСУДАРСТВЕННОЙ РЕГИСТРАЦИИ БРАКА',
        'ПІСЛЯ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ ПРИСВОЄНО ПРІЗВИЩЕ',
        'ПРІЗВИЩЕ ПІСЛЯ ШЛЮБУ',
      ],
      validators: [
        'before_after_surname_not_swapped',
        'nominative_case_required_for_names',
        'name_mixed_script',
      ],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'date_of_marriage',
      label: {
        en: 'Date of Marriage',
        ru: 'Дата регистрации брака',
        uk: 'Дата реєстрації шлюбу',
      },
      required: true,
      valueType: 'date',
      sourceLabels: [
        'ДАТА РЕЄСТРАЦІЇ ШЛЮБУ',
        'ШЛЮБ ЗАРЕЄСТРОВАНО',
        'ДАТА РЕГИСТРАЦИИ БРАКА',
      ],
      validators: ['date_of_marriage_lock'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'manual_review',
    },
    {
      key: 'issuing_authority',
      label: {
        en: 'Issuing Authority',
        ru: 'Орган, выдавший документ',
        uk: 'Орган, що видав документ',
      },
      required: true,
      valueType: 'authority',
      sourceLabels: [
        'ОРГАН РЕЄСТРАЦІЇ',
        'ОРГАН РЕЄСТРАЦІЇ ШЛЮБУ',
        'ВІДДІЛ РАЦС',
        'ВІДДІЛ ДРАЦС',
        'ЗАГС',
        'РАЦС',
        'ДРАЦС',
      ],
      validators: ['civil_registry_glossary_required'],
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
      sourceLabels: [
        'ДАТА ВИДАЧІ',
        'ДАТА ВЫДАЧИ',
      ],
      validators: ['date_of_issue_lock'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
  ],

  // ── Optional fields ────────────────────────────────────────────────────────

  optionalFields: [
    {
      key: 'place_of_marriage_registration',
      label: {
        en: 'Place of Marriage Registration',
        ru: 'Место регистрации брака',
        uk: 'Місце реєстрації шлюбу',
      },
      required: false,
      valueType: 'multi_line',
      sourceLabels: ['МІСЦЕ РЕЄСТРАЦІЇ ШЛЮБУ', 'МІСЦЕ'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'citizenship_spouse_1',
      label: {
        en: 'Citizenship — Spouse 1',
        ru: 'Гражданство супруга(и) 1',
        uk: 'Громадянство чоловіка (дружини) 1',
      },
      required: false,
      valueType: 'text',
      sourceLabels: ['ГРОМАДЯНСТВО', 'ГРАЖДАНСТВО'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'citizenship_spouse_2',
      label: {
        en: 'Citizenship — Spouse 2',
        ru: 'Гражданство супруга(и) 2',
        uk: 'Громадянство чоловіка (дружини) 2',
      },
      required: false,
      valueType: 'text',
      sourceLabels: ['ГРОМАДЯНСТВО', 'ГРАЖДАНСТВО'],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'readable_stamp_text',
      label: {
        en: 'Readable Stamp Text',
        ru: 'Текст штампа',
        uk: 'Текст печатки',
      },
      required: false,
      valueType: 'text',
      sourceLabels: [],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'repeated_certificate_marker',
      label: {
        en: 'Repeated Certificate Marker',
        ru: 'Маркер повторного свидетельства',
        uk: 'Маркер повторного свідоцтва',
      },
      required: false,
      valueType: 'boolean',
      sourceLabels: ['ПОВТОРНО'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'document_language_layer',
      label: {
        en: 'Document Language Layer',
        ru: 'Языковой слой документа',
        uk: 'Мовний шар документа',
      },
      required: false,
      valueType: 'text',
      sourceLabels: [],
      validators: [],
      reviewRequired: false,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'archive_or_duplicate_note',
      label: {
        en: 'Archive or Duplicate Note',
        ru: 'Пометка об архиве или дубликате',
        uk: 'Відмітка про архів або дублікат',
      },
      required: false,
      valueType: 'text',
      sourceLabels: ['АРХІВ', 'ДУБЛІКАТ'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'optional',
      fallbackIfMissing: 'skip',
    },
  ],

  // ── Expected label → field key map ─────────────────────────────────────────
  expectedLabels: {
    'СВІДОЦТВО ПРО ШЛЮБ': ['document_type'],
    'СВИДЕТЕЛЬСТВО О БРАКЕ': ['document_type'],
    'СЕРІЯ': ['certificate_series'],
    'АКТОВИЙ ЗАПИС №': ['act_record_number'],
    'ДАТА СКЛАДАННЯ АКТОВОГО ЗАПИСУ': ['act_record_date'],
    'ДАТА РЕЄСТРАЦІЇ ШЛЮБУ': ['date_of_marriage'],
    'ШЛЮБ ЗАРЕЄСТРОВАНО': ['date_of_marriage'],
    'ПРІЗВИЩЕ ДО ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ': [
      'spouse_1_surname_before_marriage',
      'spouse_2_surname_before_marriage',
    ],
    'ПРІЗВИЩЕ ПІСЛЯ ДЕРЖАВНОЇ РЕЄСТРАЦІЇ ШЛЮБУ': [
      'spouse_1_surname_after_marriage',
      'spouse_2_surname_after_marriage',
    ],
    'ОРГАН РЕЄСТРАЦІЇ': ['issuing_authority'],
    'ДАТА ВИДАЧІ': ['date_of_issue'],
  },

  glossaryModules: ['civil_registry_terms', 'ukraine_agency_abbreviations'],

  validators: [
    'certificate_number_not_act_record_number',
    'act_record_number_required',
    'act_record_date_lock',
    'date_of_marriage_lock',
    'date_of_issue_lock',
    'spouse_order_preserved',
    'before_after_surname_not_swapped',
    'spouse_names_not_swapped',
    'nominative_case_required_for_names',
    'civil_registry_glossary_required',
    'source_evidence_required',
    'bilingual_layer_protection',
    'forbidden_marriage_mislabels',
  ],

  extraction: {
    ocrProvider: 'google_vision',
    fieldMapper: 'deepseek_text',
    glossaryFiles: ['civil_registry_terms.json', 'ukraine_agency_abbreviations.json'],
    fieldTargets: [
      'document_type',
      'certificate_series',
      'certificate_number',
      'act_record_number',
      'act_record_date',
      'spouse_1_surname_before_marriage',
      'spouse_1_given_name',
      'spouse_1_patronymic',
      'spouse_1_surname_after_marriage',
      'spouse_2_surname_before_marriage',
      'spouse_2_given_name',
      'spouse_2_patronymic',
      'spouse_2_surname_after_marriage',
      'date_of_marriage',
      'issuing_authority',
      'date_of_issue',
      // optional
      'place_of_marriage_registration',
      'citizenship_spouse_1',
      'citizenship_spouse_2',
      'readable_stamp_text',
      'repeated_certificate_marker',
      'document_language_layer',
      'archive_or_duplicate_note',
    ],
    timeoutMs: 45_000,
  },

  render: {
    templateId: 'marriage_certificate_v1',
    renderFields: [
      'document_type',
      'certificate_series',
      'certificate_number',
      'act_record_number',
      'act_record_date',
      'spouse_1_surname_before_marriage',
      'spouse_1_given_name',
      'spouse_1_patronymic',
      'spouse_1_surname_after_marriage',
      'spouse_2_surname_before_marriage',
      'spouse_2_given_name',
      'spouse_2_patronymic',
      'spouse_2_surname_after_marriage',
      'date_of_marriage',
      'issuing_authority',
      'date_of_issue',
    ],
    certificationTemplate: 'self_cert_marriage_v1',
    twoPageLayout: true,
  },

  reviewPolicy: {
    requireUserConfirmation: true,
    requireEvidenceForCriticalFields: true,
    // Demoted to false on 2026-05-09 — defense-in-depth alongside status:'draft' above.
    allowAutoPdf: false,
    manualReviewIfMissingCritical: true,
    manualReviewIfLowConfidence: true,
    manualReviewIfUnsupportedLayout: true,
    lowConfidenceThreshold: 0.85,
  },

  unsupportedConditions: [
    {
      code: 'low_ocr_confidence',
      description: 'Overall OCR confidence below threshold for safe field extraction.',
      action: 'route_to_manual_review',
    },
    {
      code: 'act_record_number_missing',
      description: 'Civil registry act record number is absent or unreadable.',
      action: 'route_to_manual_review',
    },
    {
      code: 'certificate_number_missing',
      description: 'Certificate number is absent or unreadable.',
      action: 'route_to_manual_review',
    },
    {
      code: 'spouse_name_missing',
      description: 'One or both spouse names are absent or unreadable.',
      action: 'route_to_manual_review',
    },
    {
      code: 'surname_labels_unclear',
      description: 'Before/after marriage surname labels are unclear or overlapping.',
      action: 'route_to_manual_review',
    },
    {
      code: 'spouse_label_ambiguous',
      description: 'Spouse 1 / Spouse 2 labels are ambiguous or missing.',
      action: 'route_to_manual_review',
    },
    {
      code: 'date_of_marriage_unlockable',
      description: 'Marriage registration date cannot be label-locked to correct field.',
      action: 'route_to_manual_review',
    },
    {
      code: 'issuing_authority_unverified',
      description: 'Issuing authority is absent, unrecognized, or not glossary-verified.',
      action: 'route_to_manual_review',
    },
    {
      code: 'image_quality_poor',
      description: 'Document image is cropped, blurred, or has significant glare.',
      action: 'route_to_manual_review',
    },
    {
      code: 'document_type_mismatch',
      description: 'Document does not appear to be a Ukrainian marriage certificate.',
      action: 'route_to_manual_review',
    },
    {
      code: 'unsupported_layout',
      description: 'Certificate layout does not match known Ukrainian marriage certificate formats.',
      action: 'route_to_manual_review',
    },
  ],

  userStatusMessage:
    'This document needs manual review. We can help prepare it, but it cannot be automatically finalized yet.',
}

// ── Convenience exports ─────────────────────────────────────────────────────

export const MARRIAGE_CERT_CRITICAL_FIELD_KEYS: ReadonlyArray<string> =
  marriageCertificateModule.criticalFields.map(f => f.key)

export const MARRIAGE_CERT_ALL_FIELD_TARGETS: ReadonlyArray<string> =
  marriageCertificateModule.extraction.fieldTargets

export const MARRIAGE_CERT_RENDER_FIELDS: ReadonlyArray<string> =
  marriageCertificateModule.render.renderFields
