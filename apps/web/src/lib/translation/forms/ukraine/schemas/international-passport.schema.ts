/**
 * International Passport (закордонний паспорт, ICAO 9303 TD3 data page).
 * Source: ICAO Doc 9303 data-page structure + the legacy internationalPassport
 * template contract. SUPPRESSION INVARIANT preserved: personal_number and the MRZ
 * lines are deliberately NOT declared (never render). NOT YET REGISTERED — see
 * PASSPORT_SCHEMA_MIGRATION_PLAN. Keys = docintel extraction names.
 */
import type { OfficialFormSchema } from './types'
export const internationalPassportSchema: OfficialFormSchema = {
  docType: 'ua_international_passport',
  titleEn: 'INTERNATIONAL PASSPORT',
  officialSource: {
    act: 'ICAO Doc 9303 (machine-readable travel documents), Ukrainian biometric passport data page',
    url: 'https://www.icao.int/publications/pages/publication.aspx?docnum=9303',
    authority: 'ICAO / State Migration Service of Ukraine',
    effectiveDate: '2015-01-01',
  },
  fields: [
    { key: 'family_name', sourceLabelUk: 'Прізвище / Surname', sourceLabelEn: 'Surname', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'given_name', sourceLabelUk: "Ім'я / Given names", sourceLabelEn: 'Given names', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'passport_number', sourceLabelUk: 'Номер паспорта', sourceLabelEn: 'Passport No.', required: true, fieldGroup: 'document', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'dob', sourceLabelUk: 'Дата народження', sourceLabelEn: 'Date of birth', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'sex', sourceLabelUk: 'Стать / Sex', sourceLabelEn: 'Sex', required: false, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'city_of_birth', sourceLabelUk: 'Місце народження / Place of birth', sourceLabelEn: 'Place of birth', required: false, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'place_gazetteer', lockedEntity: false, evidenceRequired: true },
    { key: 'date_of_issue', sourceLabelUk: 'Дата видачі / Date of issue', sourceLabelEn: 'Date of issue', required: false, fieldGroup: 'document', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'passport_expiration_date', sourceLabelUk: 'Дата закінчення строку дії', sourceLabelEn: 'Date of expiry', required: true, fieldGroup: 'document', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
  ],
  layoutSections: ['header', 'personFields', 'issuingAuthority', 'seals', 'signatures', 'certification'],
}
