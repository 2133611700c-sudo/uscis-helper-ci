/**
 * Ukrainian ID-card (паспорт громадянина України у формі картки, 2016+).
 * Source: Law of Ukraine №1474-VIII (Unified State Demographic Register) + the
 * legacy ukrainianIdCard template contract. SUPPRESSION INVARIANT preserved:
 * rnokpp and MRZ lines are NOT declared. NOT YET REGISTERED — see
 * PASSPORT_SCHEMA_MIGRATION_PLAN. Keys = docintel extraction names.
 */
import type { OfficialFormSchema } from './types'
export const idCardSchema: OfficialFormSchema = {
  docType: 'ua_id_card',
  titleEn: 'IDENTITY CARD',
  officialSource: {
    act: 'Law of Ukraine No. 1474-VIII; ID-card blank per EDDR',
    url: 'https://zakon.rada.gov.ua/laws/show/1474-19',
    authority: 'State Migration Service of Ukraine',
    effectiveDate: '2016-10-01',
  },
  fields: [
    { key: 'family_name', sourceLabelUk: 'Прізвище', sourceLabelEn: 'Surname', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'given_name', sourceLabelUk: "Ім'я", sourceLabelEn: 'Given name', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'patronymic', sourceLabelUk: 'По батькові', sourceLabelEn: 'Patronymic', required: false, fieldGroup: 'holder', expectedScript: 'cyrillic', translationRule: 'transliterate_kmu55', lockedEntity: true, evidenceRequired: true },
    { key: 'dob', sourceLabelUk: 'Дата народження', sourceLabelEn: 'Date of birth', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'sex', sourceLabelUk: 'Стать', sourceLabelEn: 'Sex', required: false, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'city_of_birth', sourceLabelUk: 'Місце народження', sourceLabelEn: 'Place of birth', required: false, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'place_gazetteer', lockedEntity: false, evidenceRequired: true },
    { key: 'doc_number', sourceLabelUk: 'Номер документа', sourceLabelEn: 'Document No.', required: true, fieldGroup: 'document', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'date_of_issue', sourceLabelUk: 'Дата видачі', sourceLabelEn: 'Date of issue', required: false, fieldGroup: 'document', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
  ],
  layoutSections: ['header', 'personFields', 'issuingAuthority', 'seals', 'signatures', 'certification'],
}
