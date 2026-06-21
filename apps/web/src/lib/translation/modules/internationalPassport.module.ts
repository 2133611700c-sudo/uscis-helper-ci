/**
 * Ukrainian International Passport Module — Messenginfo v6.0
 *
 * STATUS: draft (identity_anchor only)
 * Document type: ua_international_passport
 *
 * This module defines the field contract for the Ukrainian biometric
 * international passport (travel document, TD3 format).
 *
 * IDENTITY ANCHOR ROLE:
 *   This is the highest-priority identity anchor document. The Latin-script
 *   surname and given names from this passport take precedence over all other
 *   documents (ID card, internal passport booklet, user corrections) when
 *   building the PacketIdentityAnchor.
 *
 * CRITICAL CONSTRAINTS:
 *   - allowAutoPdf = false (NOT for customer PDF — identity anchor only)
 *   - status = 'draft' → routes to manualReview via getDocumentModule()
 *   - Do NOT re-transliterate Latin names. The passport supplies official Latin
 *     spelling from the MRZ/VIZ. Use it verbatim.
 *   - MRZ + VIZ field mismatch → review_required=true on the anchor
 *   - personal_number (RNOKPP): reviewRequired=true always, NOT in customer PDF,
 *     MUST NOT appear in any log, audit trail, or customer-facing output
 *   - mrz_line_1 / mrz_line_2: stored for check digit validation only;
 *     never rendered in customer PDF
 *
 * Field count: 16 critical fields
 *
 * Validators referenced:
 *   mrz_td3_check_digits       → mrzParser.ts / parseTd3 check digit validation
 *   mrz_viz_surname_match      → mrzParser.ts / detectMrzVizMismatches
 *   mrz_viz_dob_match          → mrzParser.ts / detectMrzVizMismatches
 *   mrz_viz_docnum_match       → mrzParser.ts / detectMrzVizMismatches
 *   latin_name_no_retransliteration → internationalPassportValidators.ts
 *   date_of_birth_lock         → date format lock (USCIS: D Month YYYY)
 *   date_of_expiry_not_expired → internationalPassportValidators.ts
 *   issuing_state_is_ukr       → internationalPassportValidators.ts
 *   personal_number_sensitive  → internationalPassportValidators.ts (no-log gate)
 */
import type { DocumentModule } from './types'

export const internationalPassportModule: DocumentModule = {
  documentType: 'ua_international_passport',

  displayName: {
    en: 'Ukrainian International Passport',
    ru: 'Загранпаспорт Украины',
    uk: 'Закордонний паспорт України',
  },

  // draft: identity anchor only. NOT available for auto-PDF.
  // Routes to manualReview via getDocumentModule().
  status: 'draft',

  supportedLanguages: ['uk'],

  // ── 16 Critical fields ───────────────────────────────────────────────────
  // All reviewRequired=true — operator must confirm every field before anchor lock.
  // MRZ lines and personal number are critical for cross-check but suppressed
  // from customer PDF (enforced at render layer, not here).

  criticalFields: [
    // ── Identity / document header ──────────────────────────────────────────
    {
      key: 'document_type',
      label: { en: 'Document Type', ru: 'Тип документа', uk: 'Тип документа' },
      required: true,
      valueType: 'text',
      sourceLabels: ['UKRAINE', 'УКРАЇНА', 'ПАСПОРТ', 'PASSPORT'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },

    // ── Latin-script name (from MRZ / VIZ) ─────────────────────────────────
    // Do NOT re-transliterate. Use official Latin spelling verbatim.
    {
      key: 'surname_latin',
      label: { en: 'Surname (Latin)', ru: 'Фамилия (латиница)', uk: 'Прізвище (латиниця)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['Surname', 'SURNAME', 'Прізвище'],
      validators: ['latin_name_no_retransliteration', 'name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'given_names_latin',
      label: { en: 'Given Names (Latin)', ru: 'Имена (латиница)', uk: 'Ім\'я (латиниця)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['Given names', 'GIVEN NAMES', 'Ім\'я'],
      validators: ['latin_name_no_retransliteration', 'name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },

    // ── Cyrillic name (from VIZ — not in MRZ) ──────────────────────────────
    {
      key: 'patronymic_cyrillic',
      label: { en: 'Patronymic (Cyrillic)', ru: 'Отчество (кириллица)', uk: 'По батькові (кирилиця)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['По батькові', 'Patronymic'],
      validators: ['nominative_case_required'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── Biographical ────────────────────────────────────────────────────────
    {
      key: 'date_of_birth',
      label: { en: 'Date of Birth', ru: 'Дата рождения', uk: 'Дата народження' },
      required: true,
      valueType: 'date',
      sourceLabels: ['Date of birth', 'Дата народження'],
      validators: ['date_of_birth_lock', 'mrz_viz_dob_match'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'sex',
      label: { en: 'Sex', ru: 'Пол', uk: 'Стать' },
      required: true,
      valueType: 'sex',
      sourceLabels: ['Sex', 'Стать'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'nationality',
      label: { en: 'Nationality', ru: 'Гражданство', uk: 'Громадянство' },
      required: true,
      valueType: 'text',
      sourceLabels: ['Nationality', 'Громадянство'],
      validators: ['issuing_state_is_ukr'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'place_of_birth',
      label: { en: 'Place of Birth', ru: 'Место рождения', uk: 'Місце народження' },
      required: true,
      valueType: 'multi_line',
      sourceLabels: ['Place of birth', 'Місце народження'],
      validators: ['nominative_case_required'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── Issuing state code (from MRZ line 1, positions 2–4) ────────────────
    // 'UKR' for Ukrainian passports. Distinct from the VIZ nationality label.
    // Cross-checked against MRZ line 1 during TD3 validation.
    {
      key: 'issuing_state_code',
      label: { en: 'Issuing State Code', ru: 'Код государства', uk: 'Код держави' },
      required: true,
      valueType: 'text',
      sourceLabels: ['UKR', 'UKRAINE'],
      validators: ['issuing_state_is_ukr'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── Document identifiers ────────────────────────────────────────────────
    {
      key: 'document_number',
      label: { en: 'Document Number', ru: 'Номер документа', uk: 'Номер документа' },
      required: true,
      valueType: 'number',
      sourceLabels: ['Document No.', 'Номер'],
      validators: ['mrz_td3_check_digits', 'mrz_viz_docnum_match'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },

    // ── Validity dates ──────────────────────────────────────────────────────
    {
      key: 'date_of_issue',
      label: { en: 'Date of Issue', ru: 'Дата выдачи', uk: 'Дата видачі' },
      required: true,
      valueType: 'date',
      sourceLabels: ['Date of issue', 'Дата видачі'],
      validators: ['date_of_birth_lock'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'date_of_expiry',
      label: { en: 'Date of Expiry', ru: 'Срок действия', uk: 'Строк дії' },
      required: true,
      valueType: 'date',
      sourceLabels: ['Date of expiry', 'Строк дії'],
      validators: ['mrz_td3_check_digits', 'date_of_expiry_not_expired'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },

    // ── Issuing authority ───────────────────────────────────────────────────
    {
      key: 'issuing_authority',
      label: { en: 'Issuing Authority', ru: 'Орган, выдавший документ', uk: 'Орган, що видав' },
      required: true,
      valueType: 'authority',
      sourceLabels: ['Authority', 'Орган, що видав'],
      validators: ['agency_glossary'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── MRZ raw lines (for check digit validation — NOT in customer PDF) ────
    // These are extracted and stored for internal validation only.
    // The render layer must suppress these fields from customer-facing output.
    {
      key: 'mrz_line_1',
      label: { en: 'MRZ Line 1 (internal)', ru: 'МРЗ строка 1', uk: 'МРЗ рядок 1' },
      required: true,
      valueType: 'text',
      sourceLabels: ['MRZ', 'МРЗ'],
      validators: ['mrz_td3_check_digits'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'mrz_line_2',
      label: { en: 'MRZ Line 2 (internal)', ru: 'МРЗ строка 2', uk: 'МРЗ рядок 2' },
      required: true,
      valueType: 'text',
      sourceLabels: ['MRZ', 'МРЗ'],
      validators: ['mrz_td3_check_digits'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── Personal number (RNOKPP) — SENSITIVE ────────────────────────────────
    // review_required=true always.
    // MUST NOT appear in customer PDF, logs, or audit trail.
    // Stored only for cross-check against MRZ personal number field.
    {
      key: 'personal_number',
      label: { en: 'Personal Number (internal)', ru: 'Персональный номер', uk: 'Особистий номер' },
      required: true,
      valueType: 'number',
      sourceLabels: ['Personal No.', 'Особистий номер', 'РНОКПП'],
      validators: ['personal_number_sensitive'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
  ],

  // ── Optional fields ──────────────────────────────────────────────────────
  // None for this module in current draft.
  optionalFields: [],

  // ── Expected label map ───────────────────────────────────────────────────
  expectedLabels: {
    'Surname': ['surname_latin'],
    'SURNAME': ['surname_latin'],
    'Прізвище': ['surname_latin'],
    'Given names': ['given_names_latin'],
    'GIVEN NAMES': ['given_names_latin'],
    'Ім\'я': ['given_names_latin'],
    'По батькові': ['patronymic_cyrillic'],
    'Date of birth': ['date_of_birth'],
    'Дата народження': ['date_of_birth'],
    'Sex': ['sex'],
    'Стать': ['sex'],
    'Nationality': ['nationality'],
    'Громадянство': ['nationality'],
    'Place of birth': ['place_of_birth'],
    'Місце народження': ['place_of_birth'],
    'Document No.': ['document_number'],
    'Date of issue': ['date_of_issue'],
    'Дата видачі': ['date_of_issue'],
    'Date of expiry': ['date_of_expiry'],
    'Строк дії': ['date_of_expiry'],
    'Authority': ['issuing_authority'],
    'Орган, що видав': ['issuing_authority'],
    'Personal No.': ['personal_number'],
    'РНОКПП': ['personal_number'],
    'UKRAINE': ['document_type', 'issuing_state_code'],
    'УКРАЇНА': ['document_type', 'issuing_state_code'],
  },

  glossaryModules: ['civil_registry_terms', 'ukraine_agency_abbreviations'],

  validators: [
    'mrz_td3_check_digits',
    'mrz_viz_surname_match',
    'mrz_viz_dob_match',
    'mrz_viz_docnum_match',
    'latin_name_no_retransliteration',
    'date_of_birth_lock',
    'date_of_expiry_not_expired',
    'issuing_state_is_ukr',
    'personal_number_sensitive',
    'nominative_case_required',
    'name_mixed_script',
    'agency_glossary',
  ],

  extraction: {
    ocrProvider: 'google_vision',
    fieldMapper: 'deepseek_text',
    glossaryFiles: ['civil_registry_terms.json', 'ukraine_agency_abbreviations.json'],
    fieldTargets: [
      'document_type',
      'surname_latin',
      'given_names_latin',
      'patronymic_cyrillic',
      'date_of_birth',
      'sex',
      'nationality',
      'place_of_birth',
      'issuing_state_code',
      'document_number',
      'date_of_issue',
      'date_of_expiry',
      'issuing_authority',
      'mrz_line_1',
      'mrz_line_2',
      'personal_number',
    ],
    timeoutMs: 30_000,
  },

  render: {
    // identity_anchor_intl_passport: suppresses personal_number and MRZ lines from PDF
    templateId: 'identity_anchor_intl_passport',
    renderFields: [
      'document_type',
      'surname_latin',
      'given_names_latin',
      'patronymic_cyrillic',
      'date_of_birth',
      'sex',
      'nationality',
      'place_of_birth',
      'document_number',
      'date_of_issue',
      'date_of_expiry',
      'issuing_authority',
      // personal_number, mrz_line_1, mrz_line_2 intentionally excluded from render
    ],
    certificationTemplate: 'none',
    twoPageLayout: false,
  },

  reviewPolicy: {
    requireUserConfirmation: true,
    requireEvidenceForCriticalFields: true,
    allowAutoPdf: false,        // CRITICAL: never auto-generate PDF for this module
    manualReviewIfMissingCritical: true,
    manualReviewIfLowConfidence: true,
    manualReviewIfUnsupportedLayout: true,
    lowConfidenceThreshold: 0.70,
  },

  unsupportedConditions: [
    {
      code: 'mrz_check_digit_failure',
      description: 'One or more MRZ check digits do not match — document may be altered or misread.',
      action: 'route_to_manual_review',
    },
    {
      code: 'mrz_viz_mismatch',
      description: 'MRZ data does not match the Visual Inspection Zone. Requires human verification.',
      action: 'route_to_manual_review',
    },
    {
      code: 'latin_name_conflict',
      description: 'Latin-script name differs between documents in the packet. Requires resolution.',
      action: 'route_to_manual_review',
    },
    {
      code: 'expired_passport',
      description: 'Passport expiry date is in the past.',
      action: 'warn',
    },
    {
      code: 'image_quality_failed',
      description: 'Document image quality is too low to extract MRZ reliably.',
      action: 'route_to_manual_review',
    },
    {
      code: 'unknown_document_type',
      description: 'Document does not appear to be a Ukrainian international passport.',
      action: 'route_to_manual_review',
    },
    {
      code: 'low_classification_confidence',
      description: 'Classification confidence is below required threshold.',
      action: 'route_to_manual_review',
    },
    {
      code: 'missing_critical_fields',
      description: 'One or more critical fields could not be extracted.',
      action: 'route_to_manual_review',
    },
  ],

  userStatusMessage:
    'This document is being used to establish your official Latin-script name for the packet. ' +
    'A specialist will review your international passport details before they are applied.',
}
