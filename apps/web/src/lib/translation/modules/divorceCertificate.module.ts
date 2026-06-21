/**
 * Ukrainian Divorce Certificate Module — Messenginfo v6.0
 *
 * STATUS: active
 * Document type: ua_divorce_certificate
 *
 * This module defines the field contract, extraction config, validators,
 * review policy, and PDF render config for Ukrainian divorce certificates
 * (Свідоцтво про розірвання шлюбу).
 *
 * Critical distinctions (USCIS-required):
 *   certificate_number  — printed on certificate face (e.g. І-КВ 123456)
 *   act_record_number   — civil registry act record number (different field)
 *   act_record_date     — date of the act record (≠ date_of_divorce, ≠ date_of_issue)
 *   date_of_divorce     — date marriage was dissolved
 *   basis_of_divorce    — legal basis (court decision, mutual agreement, etc.)
 *
 * Divorce-specific safety rules:
 *   - basis_of_divorce must come from a visible basis label — never inferred
 *   - Long/unclear/legal-text-heavy basis → manual_review_required
 *   - court decision fields must only appear if explicitly present on the document
 *   - Do NOT invent court decision details if not visible
 *
 * Spouse name safety:
 *   - spouse_1 and spouse_2 must NOT be swapped
 *   - patronymic = Patronymic, NEVER "Middle Name"
 *   - name case normalization: genitive/dative → nominative candidate only
 *
 * Validators referenced here:
 *   certificate_number_not_act_record_number → divorceCertificateValidators.ts
 *   act_record_date_lock                     → divorceCertificateValidators.ts
 *   date_of_divorce_lock                     → divorceCertificateValidators.ts
 *   date_of_issue_lock                       → divorceCertificateValidators.ts
 *   spouse_order_preserved                   → divorceCertificateValidators.ts
 *   spouse_names_not_swapped                 → divorceCertificateValidators.ts
 *   basis_of_divorce_required_or_review      → divorceCertificateValidators.ts
 *   court_decision_details_not_invented      → divorceCertificateValidators.ts
 *   nominative_case_required_for_names       → divorceCertificateValidators.ts
 *   civil_registry_glossary_required         → agencyGlossary.ts + civil_registry_terms.json
 *   source_evidence_required                 → BboxStatus not 'missing' for critical fields
 *   bilingual_layer_protection               → Ukrainian primary, Russian → review_required
 *   name_mixed_script                        → mixed Cyrillic/Latin → review_required
 *   forbidden_divorce_mislabels              → divorceCertificateValidators.ts
 */
import type { DocumentModule } from './types'

export const divorceCertificateModule: DocumentModule = {
  documentType: 'ua_divorce_certificate',

  displayName: {
    en: 'Ukrainian Divorce Certificate',
    ru: 'Свидетельство о расторжении брака (Украина)',
    uk: 'Свідоцтво про розірвання шлюбу (Україна)',
  },

  // Demoted from 'active' to 'draft' on 2026-05-09 per
  // DEMOTE_UNPROVEN_MODULES_AND_LOCK_PRODUCTION_SCOPE.
  // No real fixture / no E2E smoke / no PDF QA / no privacy QA committed.
  // Higher risk than birth/marriage: court-decision text >30 words must
  // route to manual review (complex_legal_basis path) — not yet smoke-verified
  // on a real divorce certificate.
  // While 'draft', registry.getDocumentModule() returns manualReviewModule
  // for ua_divorce_certificate, so customer PDF cannot be produced and the
  // session is escalated to manual review.
  // Re-promote to 'active' only after the FULL pipeline pass against a real
  // (sanitized) fixture is committed under artifacts/e2e/divorce_cert/.
  status: 'draft',

  supportedLanguages: ['uk', 'ru'],

  // ── 15 Critical fields ──────────────────────────────────────────────────────
  // Every critical field: reviewRequired=true — user must confirm before PDF.
  // Missing critical field → placeholder row with review_required=true.

  criticalFields: [
    {
      key: 'document_type',
      label: { en: 'Document Type', ru: 'Тип документа', uk: 'Тип документа' },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'СВІДОЦТВО ПРО РОЗІРВАННЯ ШЛЮБУ',
        'СВИДЕТЕЛЬСТВО О РАСТОРЖЕНИИ БРАКА',
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
      key: 'spouse_1_surname',
      label: {
        en: 'Spouse 1 Surname',
        ru: 'Фамилия супруга(и) 1',
        uk: 'Прізвище чоловіка (дружини) 1',
      },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПРІЗВИЩЕ', 'ФАМИЛИЯ'],
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
      key: 'spouse_1_given_name',
      label: {
        en: 'Spouse 1 Given Name',
        ru: 'Имя супруга(и) 1',
        uk: "Ім'я чоловіка (дружини) 1",
      },
      required: true,
      valueType: 'text',
      sourceLabels: ["ІМ'Я", 'ИМЯ', 'ІМЯ'],
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
        en: 'Spouse 1 Patronymic',
        ru: 'Отчество супруга(и) 1',
        uk: 'По батькові чоловіка (дружини) 1',
      },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПО БАТЬКОВІ', 'ОТЧЕСТВО'],
      validators: [
        'nominative_case_required_for_names',
        'name_mixed_script',
        'forbidden_divorce_mislabels',
      ],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'spouse_2_surname',
      label: {
        en: 'Spouse 2 Surname',
        ru: 'Фамилия супруга(и) 2',
        uk: 'Прізвище чоловіка (дружини) 2',
      },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПРІЗВИЩЕ', 'ФАМИЛИЯ'],
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
      key: 'spouse_2_given_name',
      label: {
        en: 'Spouse 2 Given Name',
        ru: 'Имя супруга(и) 2',
        uk: "Ім'я чоловіка (дружини) 2",
      },
      required: true,
      valueType: 'text',
      sourceLabels: ["ІМ'Я", 'ИМЯ', 'ІМЯ'],
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
        en: 'Spouse 2 Patronymic',
        ru: 'Отчество супруга(и) 2',
        uk: 'По батькові чоловіка (дружини) 2',
      },
      required: true,
      valueType: 'text',
      sourceLabels: ['ПО БАТЬКОВІ', 'ОТЧЕСТВО'],
      validators: [
        'nominative_case_required_for_names',
        'name_mixed_script',
        'forbidden_divorce_mislabels',
      ],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'date_of_divorce',
      label: {
        en: 'Date of Divorce',
        ru: 'Дата расторжения брака',
        uk: 'Дата розірвання шлюбу',
      },
      required: true,
      valueType: 'date',
      sourceLabels: [
        'ДАТА РОЗІРВАННЯ ШЛЮБУ',
        'ШЛЮБ РОЗІРВАНО',
        'ДАТА РАСТОРЖЕНИЯ БРАКА',
      ],
      validators: ['date_of_divorce_lock'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'manual_review',
    },
    {
      key: 'basis_of_divorce',
      label: {
        en: 'Basis of Divorce',
        ru: 'Основание расторжения брака',
        uk: 'Підстава розірвання шлюбу',
      },
      required: true,
      valueType: 'text',
      sourceLabels: [
        'ПІДСТАВА РОЗІРВАННЯ ШЛЮБУ',
        'ПІДСТАВА',
        'ОСНОВАНИЕ РАСТОРЖЕНИЯ БРАКА',
        'РІШЕННЯ СУДУ',
        'РЕШЕНИЕ СУДА',
      ],
      validators: [
        'basis_of_divorce_required_or_review',
        'court_decision_details_not_invented',
      ],
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
      sourceLabels: ['ДАТА ВИДАЧІ', 'ДАТА ВЫДАЧИ'],
      validators: ['date_of_issue_lock'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
  ],

  // ── Optional fields ────────────────────────────────────────────────────────

  optionalFields: [
    {
      key: 'court_decision_number',
      label: {
        en: 'Court Decision Number',
        ru: 'Номер решения суда',
        uk: 'Номер рішення суду',
      },
      required: false,
      valueType: 'text',
      sourceLabels: ['РІШЕННЯ СУДУ №', 'РЕШЕНИЕ СУДА №'],
      validators: ['court_decision_details_not_invented'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'court_decision_date',
      label: {
        en: 'Court Decision Date',
        ru: 'Дата решения суда',
        uk: 'Дата рішення суду',
      },
      required: false,
      valueType: 'date',
      sourceLabels: ['ДАТА РІШЕННЯ СУДУ', 'ДАТА РЕШЕНИЯ СУДА'],
      validators: ['court_decision_details_not_invented'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'court_name',
      label: {
        en: 'Court Name',
        ru: 'Наименование суда',
        uk: 'Назва суду',
      },
      required: false,
      valueType: 'text',
      sourceLabels: ['СУД', 'СУДУ'],
      validators: ['court_decision_details_not_invented'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'skip',
    },
    {
      key: 'place_of_divorce_registration',
      label: {
        en: 'Place of Divorce Registration',
        ru: 'Место регистрации расторжения брака',
        uk: 'Місце реєстрації розірвання шлюбу',
      },
      required: false,
      valueType: 'multi_line',
      sourceLabels: ['МІСЦЕ РЕЄСТРАЦІЇ'],
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
    'СВІДОЦТВО ПРО РОЗІРВАННЯ ШЛЮБУ': ['document_type'],
    'СВИДЕТЕЛЬСТВО О РАСТОРЖЕНИИ БРАКА': ['document_type'],
    'СЕРІЯ': ['certificate_series'],
    'АКТОВИЙ ЗАПИС №': ['act_record_number'],
    'ДАТА СКЛАДАННЯ АКТОВОГО ЗАПИСУ': ['act_record_date'],
    'ДАТА РОЗІРВАННЯ ШЛЮБУ': ['date_of_divorce'],
    'ШЛЮБ РОЗІРВАНО': ['date_of_divorce'],
    'ПІДСТАВА РОЗІРВАННЯ ШЛЮБУ': ['basis_of_divorce'],
    'РІШЕННЯ СУДУ': ['basis_of_divorce'],
    'ОРГАН РЕЄСТРАЦІЇ': ['issuing_authority'],
    'ДАТА ВИДАЧІ': ['date_of_issue'],
  },

  glossaryModules: ['civil_registry_terms', 'ukraine_agency_abbreviations'],

  validators: [
    'certificate_number_not_act_record_number',
    'act_record_number_required',
    'act_record_date_lock',
    'date_of_divorce_lock',
    'date_of_issue_lock',
    'spouse_order_preserved',
    'spouse_names_not_swapped',
    'basis_of_divorce_required_or_review',
    'court_decision_details_not_invented',
    'nominative_case_required_for_names',
    'civil_registry_glossary_required',
    'source_evidence_required',
    'bilingual_layer_protection',
    'forbidden_divorce_mislabels',
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
      'spouse_1_surname',
      'spouse_1_given_name',
      'spouse_1_patronymic',
      'spouse_2_surname',
      'spouse_2_given_name',
      'spouse_2_patronymic',
      'date_of_divorce',
      'basis_of_divorce',
      'issuing_authority',
      'date_of_issue',
      // optional
      'court_decision_number',
      'court_decision_date',
      'court_name',
      'place_of_divorce_registration',
      'readable_stamp_text',
      'repeated_certificate_marker',
      'document_language_layer',
      'archive_or_duplicate_note',
    ],
    timeoutMs: 45_000,
  },

  render: {
    templateId: 'divorce_certificate_v1',
    renderFields: [
      'document_type',
      'certificate_series',
      'certificate_number',
      'act_record_number',
      'act_record_date',
      'spouse_1_surname',
      'spouse_1_given_name',
      'spouse_1_patronymic',
      'spouse_2_surname',
      'spouse_2_given_name',
      'spouse_2_patronymic',
      'date_of_divorce',
      'basis_of_divorce',
      'issuing_authority',
      'date_of_issue',
    ],
    certificationTemplate: 'self_cert_divorce_v1',
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
      code: 'basis_of_divorce_unclear',
      description: 'Basis of divorce text is absent, unclear, or too complex for auto-extraction.',
      action: 'route_to_manual_review',
    },
    {
      code: 'court_decision_text_complex',
      description: 'Court decision text is long, unclear, or legal-text-heavy.',
      action: 'route_to_manual_review',
    },
    {
      code: 'date_of_divorce_unlockable',
      description: 'Divorce date cannot be label-locked to the correct field.',
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
      description: 'Document does not appear to be a Ukrainian divorce certificate.',
      action: 'route_to_manual_review',
    },
    {
      code: 'unsupported_layout',
      description: 'Certificate layout does not match known Ukrainian divorce certificate formats.',
      action: 'route_to_manual_review',
    },
  ],

  userStatusMessage:
    'This document needs manual review. We can help prepare it, but it cannot be automatically finalized yet.',
}

// ── Convenience exports ─────────────────────────────────────────────────────

export const DIVORCE_CERT_CRITICAL_FIELD_KEYS: ReadonlyArray<string> =
  divorceCertificateModule.criticalFields.map(f => f.key)

export const DIVORCE_CERT_ALL_FIELD_TARGETS: ReadonlyArray<string> =
  divorceCertificateModule.extraction.fieldTargets

export const DIVORCE_CERT_RENDER_FIELDS: ReadonlyArray<string> =
  divorceCertificateModule.render.renderFields
