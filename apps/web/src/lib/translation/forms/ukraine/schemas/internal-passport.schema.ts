/**
 * Internal Passport booklet (Паспорт громадянина України, книжечка).
 * Source: the legacy passportBooklet.template.ts field contract (active customer
 * module) + the official booklet blank, verified against a real booklet.
 * NOT YET REGISTERED in OFFICIAL_SCHEMAS — registration IS the live switch of the
 * customer PDF (generate-pdf: hasOfficialSchema→mirror); see
 * docs/ops/PASSPORT_SCHEMA_MIGRATION_PLAN.md. Field keys = docintel extraction names.
 */
import type { OfficialFormSchema } from './types'
const N = (key: string, uk: string, en: string, required = true) => ({
  key, sourceLabelUk: uk, sourceLabelEn: en, required, fieldGroup: 'holder',
  expectedScript: 'cyrillic' as const, translationRule: 'transliterate_kmu55' as const,
  lockedEntity: true, evidenceRequired: true,
})
export const internalPassportSchema: OfficialFormSchema = {
  docType: 'ua_internal_passport_booklet',
  titleEn: 'INTERNAL PASSPORT',
  officialSource: {
    act: 'Passport of the citizen of Ukraine (booklet form), official blank',
    url: 'https://zakon.rada.gov.ua/laws/show/2503-12',
    authority: 'Verkhovna Rada of Ukraine / Ministry of Internal Affairs',
    effectiveDate: '1994-01-01',
  },
  fields: [
    N('family_name', 'Прізвище', 'Surname'),
    N('given_name', "Ім'я", 'Given name'),
    N('patronymic', 'По батькові', 'Patronymic', false),
    { key: 'dob', sourceLabelUk: 'Дата народження', sourceLabelEn: 'Date of birth', required: true, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
    { key: 'city_of_birth', sourceLabelUk: 'Місце народження', sourceLabelEn: 'Place of birth', required: false, fieldGroup: 'holder', expectedScript: 'cyrillic', translationRule: 'place_gazetteer', lockedEntity: false, evidenceRequired: true },
    { key: 'province_of_birth', sourceLabelUk: 'Область', sourceLabelEn: 'Region (Oblast)', required: false, fieldGroup: 'holder', expectedScript: 'cyrillic', translationRule: 'place_gazetteer', lockedEntity: false, evidenceRequired: true },
    { key: 'sex', sourceLabelUk: 'Стать', sourceLabelEn: 'Sex', required: false, fieldGroup: 'holder', expectedScript: 'mixed', translationRule: 'locked_verbatim', lockedEntity: true, evidenceRequired: true },
    { key: 'date_of_issue', sourceLabelUk: 'Дата видачі', sourceLabelEn: 'Date of issue', required: false, fieldGroup: 'document', expectedScript: 'mixed', translationRule: 'date_normalize', lockedEntity: true, evidenceRequired: true },
  ],
  layoutSections: ['header', 'personFields', 'issuingAuthority', 'seals', 'signatures', 'certification'],
}
