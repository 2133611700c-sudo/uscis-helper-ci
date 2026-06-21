/** Birth Certificate (Свідоцтво про народження). Source: KMU No.1025 (10.11.2010). */
import type { OfficialFormSchema } from './types'
const N = (key: string, uk: string, en: string, group: string, required = true) => ({
  key, sourceLabelUk: uk, sourceLabelEn: en, required, fieldGroup: group,
  expectedScript: 'cyrillic' as const, translationRule: 'transliterate_kmu55' as const, lockedEntity: true, evidenceRequired: true,
})
export const birthCertificateSchema: OfficialFormSchema = {
  docType: 'ua_birth_certificate', titleEn: 'BIRTH CERTIFICATE',
  officialSource: { act: 'КМУ Resolution No. 1025, 10.11.2010', url: 'https://zakon.rada.gov.ua/laws/show/1025-2010-%D0%BF', authority: 'Cabinet of Ministers of Ukraine / Ministry of Justice', effectiveDate: '2010-11-10' },
  fields: [
    N('child_surname', 'Прізвище', 'Surname', 'child'),
    N('child_given_name', "Ім'я", 'Given name', 'child'),
    N('child_patronymic', 'По батькові', 'Patronymic', 'child'),
    { key: 'date_of_birth', sourceLabelUk: 'дата народження', sourceLabelEn: 'Date of birth', required: true, fieldGroup: 'child', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'place_of_birth', sourceLabelUk: 'місце народження', sourceLabelEn: 'Place of birth', required: true, fieldGroup: 'child', expectedScript: 'cyrillic', translationRule: 'place_gazetteer', lockedEntity: false, evidenceRequired: true },
    // No separate oblast field: it was being inferred/fabricated (owner-reported).
    // The oblast, when present, is part of the place-of-birth line on the document.
    N('father_full_name', 'Батько', 'Father', 'parents', false),
    N('mother_full_name', 'Мати', 'Mother', 'parents', false),
    { key: 'act_record_number', sourceLabelUk: 'актовий запис №', sourceLabelEn: 'Act record No.', required: true, fieldGroup: 'actRecord', expectedScript: 'numeric', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'act_record_date', sourceLabelUk: 'дата складання актового запису', sourceLabelEn: 'Act record date', required: false, fieldGroup: 'actRecord', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'place_of_registration', sourceLabelUk: 'місце державної реєстрації', sourceLabelEn: 'Place of state registration', required: true, fieldGroup: 'issuing', expectedScript: 'cyrillic', translationRule: 'glossary_authority', lockedEntity: false, evidenceRequired: true },
    { key: 'series_number', sourceLabelUk: 'Серія та номер', sourceLabelEn: 'Series and No.', required: true, fieldGroup: 'issuing', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'date_of_issue', sourceLabelUk: 'Дата видачі', sourceLabelEn: 'Date of issue', required: false, fieldGroup: 'issuing', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
  ],
  layoutSections: ['header', 'personFields', 'actRecord', 'issuingAuthority', 'seals', 'signatures', 'certification'],
}
