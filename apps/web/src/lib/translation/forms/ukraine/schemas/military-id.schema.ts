/**
 * Military ID (Військовий квиток). Source: the standard Armed Forces of Ukraine
 * military ID booklet blank (Ministry of Defence form) — the printed bilingual
 * field labels of the official blank itself are the structure authority; verified
 * against a real booklet on 2026-06-11. (No public KMU/zakon URL exists for the
 * blank layout — recorded honestly per the "no template without source" rule.)
 * Field keys MATCH the docintel reader names (no aliases needed in buildMirrorValues).
 */
import type { OfficialFormSchema } from './types'

export const militaryIdSchema: OfficialFormSchema = {
  docType: 'ua_military_id',
  titleEn: 'MILITARY ID',
  officialSource: {
    act: 'Armed Forces of Ukraine military ID booklet (військовий квиток), standard blank',
    url: 'https://www.mil.gov.ua/',
    authority: 'Ministry of Defence of Ukraine',
    effectiveDate: '2016-01-01',
  },
  fields: [
    { key: 'family_name', sourceLabelUk: 'Прізвище', sourceLabelEn: 'Surname', required: true, fieldGroup: 'holder', expectedScript: 'cyrillic', translationRule: 'transliterate_kmu55', lockedEntity: true, evidenceRequired: true },
    { key: 'given_name', sourceLabelUk: "Ім'я", sourceLabelEn: 'Given name', required: true, fieldGroup: 'holder', expectedScript: 'cyrillic', translationRule: 'transliterate_kmu55', lockedEntity: true, evidenceRequired: true },
    { key: 'patronymic', sourceLabelUk: 'По батькові', sourceLabelEn: 'Patronymic', required: false, fieldGroup: 'holder', expectedScript: 'cyrillic', translationRule: 'transliterate_kmu55', lockedEntity: true, evidenceRequired: true },
    { key: 'dob', sourceLabelUk: 'Дата народження', sourceLabelEn: 'Date of birth', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'doc_number', sourceLabelUk: 'Серія та номер', sourceLabelEn: 'Series and No.', required: true, fieldGroup: 'issuing', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'issuing_authority', sourceLabelUk: 'Виданий (військовий комісаріат)', sourceLabelEn: 'Issued by (military commissariat)', required: false, fieldGroup: 'issuing', expectedScript: 'cyrillic', translationRule: 'glossary_authority', lockedEntity: false, evidenceRequired: true },
  ],
  layoutSections: ['header', 'personFields', 'issuingAuthority', 'seals', 'signatures', 'certification'],
}
