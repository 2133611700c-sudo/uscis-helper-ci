/**
 * Ukrainian Death Certificate Module — SKELETON
 *
 * Status: 'draft' / allowAutoPdf: false.
 *
 * Module is registered so that the classifier resolves alias terms
 * ("свідоцтво про смерть", "свидетельство о смерти", "death certificate",
 *  "certificate of death", "смерть") to a known canonical document type
 *  rather than dropping them into the generic "unknown" bucket.
 *
 * Because status='draft', registry.getDocumentModule() routes any request
 * with documentType='ua_death_certificate' to manualReviewModule. There
 * is NO auto-extraction, NO auto-PDF, NO Stripe checkout for this module
 * until a real fixture + real-OCR E2E + PDF QA + privacy QA are in place.
 *
 * Field skeleton matches the 14-field civil-status set called out by
 * the v5 plan (CMU No. 1025 group). cause_of_death is INTENTIONALLY
 * omitted from the skeleton: when it appears on the source document it
 * MUST be operator-handled via manual review (medical/legal text).
 */
import type { DocumentModule, FieldSpec } from './types'

const FIELD: (k: string, en: string, ru: string, uk: string, sourceLabels: string[]) => FieldSpec =
  (key, en, ru, uk, sourceLabels) => ({
    key,
    label: { en, ru, uk },
    required: true,
    valueType: 'text',
    sourceLabels,
    validators: [],
    reviewRequired: true,
    evidenceRequired: 'required',
    fallbackIfMissing: 'manual_review',
  })

export const deathCertificateModule: DocumentModule = {
  documentType: 'ua_death_certificate',

  displayName: {
    en: 'Ukrainian Death Certificate',
    ru: 'Свидетельство о смерти (Украина)',
    uk: 'Свідоцтво про смерть (Україна)',
  },

  // Skeleton: not auto-PDF eligible. Always routes to manual review.
  status: 'draft',

  supportedLanguages: ['uk', 'ru'],

  criticalFields: [
    FIELD('document_type', 'Document Type', 'Тип документа', 'Тип документа',
      ['Свідоцтво про смерть', 'Свидетельство о смерти']),
    FIELD('certificate_series', 'Certificate Series', 'Серия', 'Серія',
      ['Серія', 'Серия']),
    FIELD('certificate_number', 'Certificate Number', 'Номер', 'Номер',
      ['Номер']),
    FIELD('deceased_surname', 'Surname of the Deceased', 'Фамилия умершего', 'Прізвище померлого',
      ['Прізвище', 'Фамилия']),
    FIELD('deceased_given_name', 'Given Name of the Deceased', 'Имя умершего', 'Ім\'я померлого',
      ["Ім'я", 'Имя']),
    FIELD('deceased_patronymic', 'Patronymic of the Deceased', 'Отчество умершего', 'По батькові померлого',
      ['По батькові', 'Отчество']),
    FIELD('date_of_birth', 'Date of Birth', 'Дата рождения', 'Дата народження',
      ['Дата народження', 'Дата рождения']),
    FIELD('place_of_birth', 'Place of Birth', 'Место рождения', 'Місце народження',
      ['Місце народження', 'Место рождения']),
    FIELD('date_of_death', 'Date of Death', 'Дата смерти', 'Дата смерті',
      ['Дата смерті', 'Дата смерти']),
    FIELD('place_of_death', 'Place of Death', 'Место смерти', 'Місце смерті',
      ['Місце смерті', 'Место смерти']),
    FIELD('act_record_number', 'Act Record Number', 'Актовая запись №', 'Актовий запис №',
      ['Актовий запис', 'Актовая запись']),
    FIELD('act_record_date', 'Act Record Date', 'Дата актовой записи', 'Дата актового запису',
      ['Дата актового запису', 'Дата актовой записи']),
    FIELD('issuing_authority', 'Issuing Authority', 'Орган выдачи', 'Орган видачі',
      ['Орган видачі', 'Орган выдачи', 'ДРАЦС', 'РАЦС', 'ЗАГС']),
    FIELD('date_of_issue', 'Date of Issue', 'Дата выдачи', 'Дата видачі',
      ['Дата видачі', 'Дата выдачи']),
  ],

  optionalFields: [],

  // expectedLabels populated from criticalFields.sourceLabels at module load.
  expectedLabels: {
    document_type: ['Свідоцтво про смерть', 'Свидетельство о смерти'],
    deceased_surname: ['Прізвище', 'Фамилия'],
    issuing_authority: ['ДРАЦС', 'РАЦС', 'ЗАГС'],
  },

  glossaryModules: ['civil_registry_terms'],

  validators: [
    // Reserved validator IDs for future activation. None active in skeleton.
    'date_field_lock',
    'cert_vs_act_record_distinct',
    'date_of_birth_before_date_of_death',
  ],

  extraction: {
    // Skeleton: even if a request reaches this module's extraction config,
    // status='draft' routes to manual review BEFORE the OCR provider is hit.
    ocrProvider: 'manual',
    fieldMapper: 'manual',
    glossaryFiles: ['civil_registry_terms.json'],
    fieldTargets: [
      'document_type',
      'certificate_series',
      'certificate_number',
      'deceased_surname',
      'deceased_given_name',
      'deceased_patronymic',
      'date_of_birth',
      'place_of_birth',
      'date_of_death',
      'place_of_death',
      'act_record_number',
      'act_record_date',
      'issuing_authority',
      'date_of_issue',
    ],
    timeoutMs: 0,
  },

  render: {
    // No render template in skeleton — manual review only.
    templateId: 'death_certificate_skeleton',
    renderFields: [],
    certificationTemplate: 'none',
    twoPageLayout: false,
  },

  reviewPolicy: {
    requireUserConfirmation: true,
    requireEvidenceForCriticalFields: true,
    allowAutoPdf: false, // CRITICAL: skeleton — no auto-PDF until real fixture proven
    manualReviewIfMissingCritical: true,
    manualReviewIfLowConfidence: true,
    manualReviewIfUnsupportedLayout: true,
    lowConfidenceThreshold: 1.0, // always manual regardless of confidence (skeleton)
  },

  unsupportedConditions: [
    {
      code: 'no_real_fixture_for_death_certificate',
      description:
        'ua_death_certificate is a draft skeleton. No real-OCR fixture, ' +
        'no E2E, no privacy QA committed yet. All death certificates route ' +
        'to manual review until validation is in place.',
      action: 'route_to_manual_review',
    },
    {
      code: 'cause_of_death_text_must_not_auto_finalize',
      description:
        'cause_of_death may be a long medical/legal text. Even when extracted, ' +
        'it must not be auto-finalized — operator review required.',
      action: 'route_to_manual_review',
    },
    {
      code: 'old_zags_racs_dracs_disambiguation',
      description:
        'Issuing authority (ЗАГС / РАЦС / ДРАЦС) era guards not field-tested ' +
        'against real death certificate fixtures.',
      action: 'route_to_manual_review',
    },
  ],

  userStatusMessage:
    'This document needs manual review by our team. We do not finalize death ' +
    'certificates automatically.',
}
