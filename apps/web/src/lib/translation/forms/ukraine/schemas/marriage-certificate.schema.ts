/**
 * Marriage Certificate (Свідоцтво про шлюб) — official field schema.
 * Source: KMU Resolution No. 1025, 10.11.2010 (see source-ledger.json).
 * Field order/groups mirror the official state blank.
 */
import type { OfficialFormSchema } from './types'

const name = (key: string, uk: string, en: string, group: string, required = true) => ({
  key, sourceLabelUk: uk, sourceLabelEn: en, required, fieldGroup: group,
  expectedScript: 'cyrillic' as const, translationRule: 'transliterate_kmu55' as const,
  lockedEntity: true, evidenceRequired: true,
})

export const marriageCertificateSchema: OfficialFormSchema = {
  docType: 'ua_marriage_certificate',
  titleEn: 'MARRIAGE CERTIFICATE',
  officialSource: {
    act: 'КМУ Resolution No. 1025, 10.11.2010',
    url: 'https://zakon.rada.gov.ua/laws/show/1025-2010-%D0%BF',
    authority: 'Cabinet of Ministers of Ukraine / Ministry of Justice',
    effectiveDate: '2010-11-10',
  },
  fields: [
    // ── groom ──
    name('groom_surname', 'Прізвище', 'Surname', 'groom'),
    name('groom_given_name', "Ім'я", 'Given name', 'groom'),
    name('groom_patronymic', 'По батькові', 'Patronymic', 'groom'),
    { key: 'groom_dob', sourceLabelUk: 'який народився', sourceLabelEn: 'Date of birth', required: true, fieldGroup: 'groom', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'groom_place_of_birth', sourceLabelUk: 'місце народження', sourceLabelEn: 'Place of birth', required: false, fieldGroup: 'groom', expectedScript: 'cyrillic', translationRule: 'place_gazetteer', lockedEntity: false, evidenceRequired: true },
    // ── bride ──
    name('bride_surname', 'Прізвище', 'Surname', 'bride'),
    name('bride_given_name', "Ім'я", 'Given name', 'bride'),
    name('bride_patronymic', 'По батькові', 'Patronymic', 'bride'),
    { key: 'bride_dob', sourceLabelUk: 'яка народилася', sourceLabelEn: 'Date of birth', required: true, fieldGroup: 'bride', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'bride_place_of_birth', sourceLabelUk: 'місце народження', sourceLabelEn: 'Place of birth', required: false, fieldGroup: 'bride', expectedScript: 'cyrillic', translationRule: 'place_gazetteer', lockedEntity: false, evidenceRequired: true },
    // ── marriage / act record ──
    { key: 'date_of_marriage', sourceLabelUk: 'зареєстрували шлюб', sourceLabelEn: 'Date of marriage', required: true, fieldGroup: 'marriage', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'act_record_number', sourceLabelUk: 'актовий запис №', sourceLabelEn: 'Act record No.', required: true, fieldGroup: 'actRecord', expectedScript: 'numeric', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'act_record_date', sourceLabelUk: 'дата складання актового запису', sourceLabelEn: 'Act record date', required: false, fieldGroup: 'actRecord', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'groom_surname_after', sourceLabelUk: 'прізвище чоловіка після шлюбу', sourceLabelEn: 'Husband’s surname after marriage', required: false, fieldGroup: 'marriage', expectedScript: 'cyrillic', translationRule: 'transliterate_kmu55', lockedEntity: true, evidenceRequired: true },
    { key: 'bride_surname_after', sourceLabelUk: 'прізвище дружини після шлюбу', sourceLabelEn: 'Wife’s surname after marriage', required: false, fieldGroup: 'marriage', expectedScript: 'cyrillic', translationRule: 'transliterate_kmu55', lockedEntity: true, evidenceRequired: true },
    // ── issuing ──
    { key: 'place_of_registration', sourceLabelUk: 'місце державної реєстрації', sourceLabelEn: 'Place of state registration', required: true, fieldGroup: 'issuing', expectedScript: 'cyrillic', translationRule: 'glossary_authority', lockedEntity: false, evidenceRequired: true },
    { key: 'series_number', sourceLabelUk: 'Серія та номер', sourceLabelEn: 'Series and No.', required: true, fieldGroup: 'issuing', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'date_of_issue', sourceLabelUk: 'Дата видачі', sourceLabelEn: 'Date of issue', required: false, fieldGroup: 'issuing', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
  ],
  layoutSections: ['header', 'personFields', 'actRecord', 'issuingAuthority', 'seals', 'signatures', 'certification'],
}
