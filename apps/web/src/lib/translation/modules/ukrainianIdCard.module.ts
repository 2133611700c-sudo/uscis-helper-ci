/**
 * Ukrainian ID Card Module — Messenginfo v6.0
 *
 * STATUS: draft (identity_anchor only)
 * Document type: ua_id_card
 *
 * This module defines the field contract for the Ukrainian biometric ID card
 * (Посвідчення особи / Ідентифікаційна картка, TD1 format, issued from 2016).
 *
 * IDENTITY ANCHOR ROLE:
 *   Second-priority identity anchor document. Latin-script name from this card
 *   takes precedence over transliterated names, but is superseded by the
 *   Ukrainian International Passport (ua_international_passport) if present.
 *
 * CRITICAL DISTINCTIONS:
 *   1. document_number ≠ record_number (УНЗР):
 *      - document_number: 9-digit number printed on card face (e.g. "000999999")
 *      - record_number:   УНЗР unique demographic registry entry (e.g. "20010101-00001")
 *        Located in MRZ optional data 1 (line 1, positions 15–29).
 *        These are ENTIRELY DIFFERENT fields. USCIS may request either specifically.
 *
 *   2. rnokpp (Реєстраційний номер облікової картки платника податків):
 *      - SENSITIVE PII — review_required=true always
 *      - MUST NOT appear in customer PDF, logs, or audit trail
 *      - Stored only for internal cross-check against MRZ optional data 2
 *      - Located in MRZ line 2 optional data (positions 18–28)
 *
 * CRITICAL CONSTRAINTS:
 *   - allowAutoPdf = false
 *   - status = 'draft' → routes to manualReview via getDocumentModule()
 *   - TD1 MRZ: 3 lines × 30 characters
 *   - MRZ line 2 composite check covers all three lines
 *   - Do NOT re-transliterate Latin names from card face
 *   - MRZ↔VIZ mismatch → review_required=true on the anchor
 *
 * Field count: 18 critical fields
 *
 * Validators referenced:
 *   mrz_td1_check_digits       → mrzParser.ts / parseTd1 check digit validation
 *   mrz_viz_surname_match      → mrzParser.ts / detectMrzVizMismatches
 *   mrz_viz_dob_match          → mrzParser.ts / detectMrzVizMismatches
 *   mrz_viz_docnum_match       → mrzParser.ts / detectMrzVizMismatches
 *   latin_name_no_retransliteration → ukrainianIdCardValidators.ts
 *   document_number_not_record_number → ukrainianIdCardValidators.ts
 *   rnokpp_sensitive           → ukrainianIdCardValidators.ts (no-log gate)
 *   date_of_birth_lock         → date format lock (USCIS: D Month YYYY)
 *   date_of_expiry_not_expired → ukrainianIdCardValidators.ts
 *   issuing_state_is_ukr       → ukrainianIdCardValidators.ts
 *   nominative_case_required   → name normalizer
 *   name_mixed_script          → mixed Cyrillic/Latin → review_required
 */
import type { DocumentModule } from './types'

export const ukrainianIdCardModule: DocumentModule = {
  documentType: 'ua_id_card',

  displayName: {
    en: 'Ukrainian ID Card',
    ru: 'Украинская ID-карта',
    uk: 'Посвідчення особи (ID-картка)',
  },

  // draft: identity anchor only. NOT available for auto-PDF.
  // Routes to manualReview via getDocumentModule().
  status: 'draft',

  supportedLanguages: ['uk'],

  // ── 18 Critical fields ───────────────────────────────────────────────────
  // All reviewRequired=true — operator must confirm every field before anchor lock.
  // rnokpp, mrz_line_1, mrz_line_2 are critical for internal validation
  // but are suppressed from customer PDF (enforced at render layer).

  criticalFields: [
    // ── Document header ─────────────────────────────────────────────────────
    {
      key: 'document_type',
      label: { en: 'Document Type', ru: 'Тип документа', uk: 'Тип документа' },
      required: true,
      valueType: 'text',
      sourceLabels: ['УКРАЇНА', 'UKRAINE', 'ID', 'ПОСВІДЧЕННЯ ОСОБИ'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },

    // ── Latin-script name (front of card — official, do not re-transliterate) ─
    {
      key: 'surname_latin',
      label: { en: 'Surname (Latin)', ru: 'Фамилия (латиница)', uk: 'Прізвище (латиниця)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['Surname', 'SURNAME'],
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
      sourceLabels: ['Given names', 'GIVEN NAMES', 'Name'],
      validators: ['latin_name_no_retransliteration', 'name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },

    // ── Cyrillic name (front of card) ───────────────────────────────────────
    {
      key: 'surname_cyrillic',
      label: { en: 'Surname (Cyrillic)', ru: 'Фамилия (кириллица)', uk: 'Прізвище (кирилиця)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['Прізвище'],
      validators: ['nominative_case_required', 'name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'given_names_cyrillic',
      label: { en: 'Given Names (Cyrillic)', ru: 'Имена (кириллица)', uk: 'Ім\'я (кирилиця)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['Ім\'я'],
      validators: ['nominative_case_required', 'name_mixed_script'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'patronymic_cyrillic',
      label: { en: 'Patronymic (Cyrillic)', ru: 'Отчество (кириллица)', uk: 'По батькові (кирилиця)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['По батькові'],
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
      sourceLabels: ['Дата народження', 'Date of birth'],
      validators: ['date_of_birth_lock', 'mrz_viz_dob_match'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'sex',
      label: { en: 'Sex', ru: 'Стать', uk: 'Стать' },
      required: true,
      valueType: 'sex',
      sourceLabels: ['Стать'],
      validators: [],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'nationality',
      label: { en: 'Nationality', ru: 'Громадянство', uk: 'Громадянство' },
      required: true,
      valueType: 'text',
      sourceLabels: ['Громадянство'],
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
      sourceLabels: ['Місце народження'],
      validators: ['nominative_case_required'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── Document identifiers — THESE ARE DIFFERENT FIELDS ──────────────────
    // document_number: printed series+number on card face
    // record_number:   УНЗР from MRZ optional data 1 (TD1 line 1, positions 15–29)
    // NEVER conflate these two fields.
    {
      key: 'document_number',
      label: { en: 'Document Number', ru: 'Номер документа', uk: 'Номер документа' },
      required: true,
      valueType: 'number',
      sourceLabels: ['Номер', 'Document No.'],
      validators: [
        'mrz_td1_check_digits',
        'mrz_viz_docnum_match',
        'document_number_not_record_number',
      ],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'record_number',
      label: { en: 'Record Number (УНЗР)', ru: 'Номер запису (УНЗР)', uk: 'Номер запису (УНЗР)' },
      required: true,
      valueType: 'text',
      sourceLabels: ['УНЗР', 'Унікальний номер запису'],
      validators: ['document_number_not_record_number'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── Validity dates ──────────────────────────────────────────────────────
    {
      key: 'date_of_issue',
      label: { en: 'Date of Issue', ru: 'Дата видачі', uk: 'Дата видачі' },
      required: true,
      valueType: 'date',
      sourceLabels: ['Дата видачі'],
      validators: ['date_of_birth_lock'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },
    {
      key: 'date_of_expiry',
      label: { en: 'Date of Expiry', ru: 'Строк дії', uk: 'Строк дії' },
      required: true,
      valueType: 'date',
      sourceLabels: ['Строк дії'],
      validators: ['mrz_td1_check_digits', 'date_of_expiry_not_expired'],
      reviewRequired: true,
      evidenceRequired: 'required',
      fallbackIfMissing: 'block',
    },

    // ── Issuing authority ───────────────────────────────────────────────────
    {
      key: 'issuing_authority',
      label: { en: 'Issuing Authority', ru: 'Орган, що видав', uk: 'Орган, що видав' },
      required: true,
      valueType: 'authority',
      sourceLabels: ['Орган, що видав'],
      validators: ['agency_glossary'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── MRZ raw lines (internal validation only — NOT in customer PDF) ──────
    {
      key: 'mrz_line_1',
      label: { en: 'MRZ Line 1 (internal)', ru: 'МРЗ рядок 1', uk: 'МРЗ рядок 1' },
      required: true,
      valueType: 'text',
      sourceLabels: ['MRZ'],
      validators: ['mrz_td1_check_digits'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
    {
      key: 'mrz_line_2',
      label: { en: 'MRZ Line 2 (internal)', ru: 'МРЗ рядок 2', uk: 'МРЗ рядок 2' },
      required: true,
      valueType: 'text',
      sourceLabels: ['MRZ'],
      validators: ['mrz_td1_check_digits'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },

    // ── RNOKPP — SENSITIVE PII ───────────────────────────────────────────────
    // РНОКПП (Реєстраційний номер облікової картки платника податків)
    // review_required=true ALWAYS.
    // NOT in customer PDF. NOT in logs. NOT in audit trail.
    // Used only for internal MRZ cross-check.
    {
      key: 'rnokpp',
      label: { en: 'Tax ID Number (internal)', ru: 'РНОКПП', uk: 'РНОКПП' },
      required: true,
      valueType: 'number',
      sourceLabels: ['РНОКПП', 'Реєстраційний номер'],
      validators: ['rnokpp_sensitive'],
      reviewRequired: true,
      evidenceRequired: 'preferred',
      fallbackIfMissing: 'review_required',
    },
  ],

  // ── Optional fields ──────────────────────────────────────────────────────
  optionalFields: [],

  // ── Expected label map ───────────────────────────────────────────────────
  expectedLabels: {
    'Прізвище': ['surname_cyrillic'],
    'Surname': ['surname_latin'],
    'SURNAME': ['surname_latin'],
    'Ім\'я': ['given_names_cyrillic'],
    'Given names': ['given_names_latin'],
    'GIVEN NAMES': ['given_names_latin'],
    'По батькові': ['patronymic_cyrillic'],
    'Дата народження': ['date_of_birth'],
    'Стать': ['sex'],
    'Громадянство': ['nationality'],
    'Місце народження': ['place_of_birth'],
    'Номер': ['document_number'],
    'УНЗР': ['record_number'],
    'Дата видачі': ['date_of_issue'],
    'Строк дії': ['date_of_expiry'],
    'Орган, що видав': ['issuing_authority'],
    'РНОКПП': ['rnokpp'],
    'MRZ': ['mrz_line_1', 'mrz_line_2'],
    'УКРАЇНА': ['document_type'],
    'UKRAINE': ['document_type'],
  },

  glossaryModules: ['civil_registry_terms', 'ukraine_agency_abbreviations'],

  validators: [
    'mrz_td1_check_digits',
    'mrz_viz_surname_match',
    'mrz_viz_dob_match',
    'mrz_viz_docnum_match',
    'latin_name_no_retransliteration',
    'document_number_not_record_number',
    'rnokpp_sensitive',
    'date_of_birth_lock',
    'date_of_expiry_not_expired',
    'issuing_state_is_ukr',
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
      'surname_cyrillic',
      'given_names_cyrillic',
      'patronymic_cyrillic',
      'date_of_birth',
      'sex',
      'nationality',
      'place_of_birth',
      'document_number',
      'record_number',
      'date_of_issue',
      'date_of_expiry',
      'issuing_authority',
      'mrz_line_1',
      'mrz_line_2',
      'rnokpp',
    ],
    timeoutMs: 30_000,
  },

  render: {
    // identity_anchor_id_card: suppresses rnokpp and MRZ lines from PDF
    templateId: 'identity_anchor_id_card',
    renderFields: [
      'document_type',
      'surname_latin',
      'given_names_latin',
      'surname_cyrillic',
      'given_names_cyrillic',
      'patronymic_cyrillic',
      'date_of_birth',
      'sex',
      'nationality',
      'place_of_birth',
      'document_number',
      'record_number',
      'date_of_issue',
      'date_of_expiry',
      'issuing_authority',
      // rnokpp, mrz_line_1, mrz_line_2 intentionally excluded from render
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
      description: 'MRZ data does not match the card face. Requires human verification.',
      action: 'route_to_manual_review',
    },
    {
      code: 'document_number_record_number_conflict',
      description: 'Document number and record number appear to be swapped or conflated.',
      action: 'route_to_manual_review',
    },
    {
      code: 'latin_name_conflict',
      description: 'Latin-script name differs between documents in the packet.',
      action: 'route_to_manual_review',
    },
    {
      code: 'expired_id_card',
      description: 'ID card expiry date is in the past.',
      action: 'warn',
    },
    {
      code: 'image_quality_failed',
      description: 'Document image quality is too low to extract MRZ reliably.',
      action: 'route_to_manual_review',
    },
    {
      code: 'unknown_document_type',
      description: 'Document does not appear to be a Ukrainian ID card.',
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
    {
      code: 'td1_composite_check_failure',
      description: 'TD1 composite check digit (line 2 position 29) does not match.',
      action: 'route_to_manual_review',
    },
  ],

  userStatusMessage:
    'This ID card is being used to establish your official identity information for the packet. ' +
    'A specialist will review the extracted details before they are applied.',
}
