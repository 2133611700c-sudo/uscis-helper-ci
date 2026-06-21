/**
 * docintel/documentRegistry — the canonical declaration of every supported
 * Ukrainian document type, its fields, and which product flows consume it.
 *
 * THIS is the permanent config the audit (DOCUMENT_RULE_COVERAGE_AUDIT.md §4.B)
 * said was missing: one place that declares what each document is and which
 * fields it carries. TPS / ReParole / EAD / Translation all read from here —
 * no parallel per-product document maps.
 *
 * Adding a document type or field = editing THIS file. The vision prompt, the
 * transliteration, and the downstream adapters are all driven by it.
 */

import type { DocTypeSpec } from './types'

export const DOCUMENT_TYPES: Record<string, DocTypeSpec> = {
  // ── Ukrainian internal passport booklet (handwritten identity page) ──
  ua_internal_passport_booklet: {
    id: 'ua_internal_passport_booklet',
    title_en: 'Ukrainian Internal Passport (Booklet)',
    script: 'cyrillic',
    consumers: ['tps', 'translation', 'reparole', 'ead'],
    vision_anchor: 'family_name',
    fields: [
      { field: 'family_name', label_uk: 'Прізвище', kind: 'name', handwritten: true, required: true },
      { field: 'given_name', label_uk: "Ім'я", kind: 'name', handwritten: true, required: true },
      // "По батькові" = patronymic (a father-derived name), NOT a Western middle name.
      // CLAUDE.md hard-rule: Patronymic ≠ Middle Name. The downstream USCIS-form field
      // is still "Middle Name" (TPSAnswers.middle_name); the source→form mapping bridges it.
      { field: 'patronymic', label_uk: 'По батькові', kind: 'name', handwritten: true, required: false },
      { field: 'dob', label_uk: 'Дата народження', kind: 'date', handwritten: true, required: true },
      { field: 'city_of_birth', label_uk: 'Місце народження', kind: 'place_city', handwritten: true, required: false },
      { field: 'province_of_birth', label_uk: 'Місце народження (область)', kind: 'place_oblast', handwritten: true, required: false },
      { field: 'sex', label_uk: 'Стать', kind: 'sex', handwritten: true, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі', kind: 'date', handwritten: true, required: false },
    ],
  },

  // ── Ukrainian international passport (printed + MRZ) ──
  ua_international_passport: {
    id: 'ua_international_passport',
    title_en: 'Ukrainian International Passport',
    script: 'mixed',
    consumers: ['tps', 'translation', 'reparole', 'ead'],
    vision_anchor: 'passport_number',
    fields: [
      { field: 'family_name', label_uk: 'Прізвище / Surname', kind: 'name', handwritten: false, required: true },
      { field: 'given_name', label_uk: "Ім'я / Given name", kind: 'name', handwritten: false, required: true },
      { field: 'passport_number', label_uk: 'Номер документа', kind: 'doc_number', handwritten: false, required: true },
      { field: 'dob', label_uk: 'Дата народження', kind: 'date', handwritten: false, required: true },
      { field: 'sex', label_uk: 'Стать / Sex', kind: 'sex', handwritten: false, required: false },
      { field: 'city_of_birth', label_uk: 'Місце народження / Place of birth', kind: 'place_city', handwritten: false, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі / Date of issue', kind: 'date', handwritten: false, required: false },
      { field: 'passport_expiration_date', label_uk: 'Дійсний до', kind: 'date', handwritten: false, required: false },
    ],
  },

  // ── Ukrainian birth certificate (mostly printed; Soviet-era variants exist) ──
  // EVERY value on these certificate blanks is HANDWRITTEN (printed form, hand-filled
  // entries) ⇒ handwritten:true on all fields = always review. Pinned by a REAL
  // silent-wrong: act_record_number read wrong at high confidence with review=false
  // on the owner's actual certificate (first GT bench, 2026-06-11). Identity fields
  // were saved by the anti-fabrication gates; doc_number/agency/date kinds were not.
  ua_birth_certificate: {
    id: 'ua_birth_certificate',
    title_en: 'Ukrainian Birth Certificate',
    script: 'cyrillic',
    consumers: ['translation', 'reparole', 'tps'],
    vision_anchor: 'child_family_name',
    fields: [
      { field: 'child_family_name', label_uk: 'Прізвище', kind: 'name', handwritten: true, required: true },
      { field: 'child_given_name', label_uk: "Ім'я", kind: 'name', handwritten: true, required: true },
      { field: 'child_patronymic', label_uk: 'По батькові', kind: 'name', handwritten: true, required: false },
      { field: 'dob', label_uk: 'Дата народження', kind: 'date', handwritten: true, required: true },
      { field: 'place_of_birth_city', label_uk: 'Місце народження', kind: 'place_city', handwritten: true, required: false },
      // NOTE: no separate `province_of_birth` field for birth certs. Many blanks do
      // not have a standalone oblast line, and asking for it made the model INFER /
      // fabricate an oblast (owner-reported on a real 1986 cert). The oblast, when
      // present, is part of the place-of-birth line or the registration authority.
      { field: 'father_full_name', label_uk: 'Батько', kind: 'name', handwritten: true, required: false },
      { field: 'mother_full_name', label_uk: 'Мати', kind: 'name', handwritten: true, required: false },
      { field: 'act_record_number', label_uk: 'Актовий запис №', kind: 'doc_number', handwritten: true, required: false },
      { field: 'act_record_date', label_uk: 'Дата складання актового запису', kind: 'date', handwritten: true, required: false },
      { field: 'issuing_authority', label_uk: 'Орган реєстрації', kind: 'agency', handwritten: true, required: false },
      { field: 'certificate_series_number', label_uk: 'Серія та номер свідоцтва', kind: 'doc_number', handwritten: true, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі', kind: 'date', handwritten: true, required: false },
    ],
  },

  // ── Ukrainian marriage certificate (Свідоцтво про шлюб, KMU 1025) ──
  // Split per official blank: husband block (Чоловік) + wife block (Дружина),
  // each Прізвище/Ім'я/По батькові/дата народження/місце народження/громадянство,
  // then date of marriage, surnames-after, act record №+date, registration office,
  // series+number, date of issue. spouse_1 = husband, spouse_2 = wife (NEVER swap).
  // All fields handwritten:true ⇒ always review (no silent-wrong on a hand-filled
  // certificate). Composite spouse_*_full_name was replaced by these split fields
  // so the mirror fills the HUSBAND/WIFE sections instead of dumping a full string.
  ua_marriage_certificate: {
    id: 'ua_marriage_certificate',
    title_en: 'Ukrainian Marriage Certificate',
    script: 'cyrillic',
    consumers: ['translation', 'reparole'],
    vision_anchor: 'spouse_1_surname',
    fields: [
      { field: 'spouse_1_surname', label_uk: 'Чоловік — Прізвище', kind: 'name', handwritten: true, required: true },
      { field: 'spouse_1_given_name', label_uk: "Чоловік — Ім'я", kind: 'name', handwritten: true, required: true },
      { field: 'spouse_1_patronymic', label_uk: 'Чоловік — По батькові', kind: 'name', handwritten: true, required: false },
      { field: 'spouse_1_dob', label_uk: 'Чоловік — Дата народження', kind: 'date', handwritten: true, required: false },
      { field: 'spouse_1_place_of_birth', label_uk: 'Чоловік — Місце народження', kind: 'place_city', handwritten: true, required: false },
      { field: 'spouse_2_surname', label_uk: 'Дружина — Прізвище', kind: 'name', handwritten: true, required: true },
      { field: 'spouse_2_given_name', label_uk: "Дружина — Ім'я", kind: 'name', handwritten: true, required: true },
      { field: 'spouse_2_patronymic', label_uk: 'Дружина — По батькові', kind: 'name', handwritten: true, required: false },
      { field: 'spouse_2_dob', label_uk: 'Дружина — Дата народження', kind: 'date', handwritten: true, required: false },
      { field: 'spouse_2_place_of_birth', label_uk: 'Дружина — Місце народження', kind: 'place_city', handwritten: true, required: false },
      { field: 'date_of_marriage', label_uk: 'Дата реєстрації шлюбу', kind: 'date', handwritten: true, required: true },
      { field: 'spouse_1_surname_after', label_uk: 'Прізвище чоловіка після шлюбу', kind: 'name', handwritten: true, required: false },
      { field: 'spouse_2_surname_after', label_uk: 'Прізвище дружини після шлюбу', kind: 'name', handwritten: true, required: false },
      { field: 'act_record_number', label_uk: 'Актовий запис №', kind: 'doc_number', handwritten: true, required: false },
      { field: 'act_record_date', label_uk: 'Дата складання актового запису', kind: 'date', handwritten: true, required: false },
      { field: 'issuing_authority', label_uk: 'Місце державної реєстрації (орган)', kind: 'agency', handwritten: true, required: false },
      { field: 'certificate_series_number', label_uk: 'Серія та номер свідоцтва', kind: 'doc_number', handwritten: true, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі', kind: 'date', handwritten: true, required: false },
    ],
  },

  // ── Ukrainian divorce certificate (Свідоцтво про розірвання шлюбу, KMU 1025) ──
  // spouse_1 = former husband, spouse_2 = former wife (NEVER swap). Split names per
  // official blank. All handwritten:true ⇒ always review.
  ua_divorce_certificate: {
    id: 'ua_divorce_certificate',
    title_en: 'Ukrainian Divorce Certificate',
    script: 'cyrillic',
    consumers: ['translation'],
    vision_anchor: 'spouse_1_surname',
    fields: [
      { field: 'spouse_1_surname', label_uk: 'Чоловік — Прізвище', kind: 'name', handwritten: true, required: true },
      { field: 'spouse_1_given_name', label_uk: "Чоловік — Ім'я", kind: 'name', handwritten: true, required: true },
      { field: 'spouse_1_patronymic', label_uk: 'Чоловік — По батькові', kind: 'name', handwritten: true, required: false },
      { field: 'spouse_2_surname', label_uk: 'Дружина — Прізвище', kind: 'name', handwritten: true, required: true },
      { field: 'spouse_2_given_name', label_uk: "Дружина — Ім'я", kind: 'name', handwritten: true, required: true },
      { field: 'spouse_2_patronymic', label_uk: 'Дружина — По батькові', kind: 'name', handwritten: true, required: false },
      { field: 'date_of_divorce', label_uk: 'Дата розірвання шлюбу', kind: 'date', handwritten: true, required: true },
      { field: 'spouse_1_surname_after', label_uk: 'Прізвище чоловіка після розірвання', kind: 'name', handwritten: true, required: false },
      { field: 'spouse_2_surname_after', label_uk: 'Прізвище дружини після розірвання', kind: 'name', handwritten: true, required: false },
      { field: 'act_record_number', label_uk: 'Актовий запис №', kind: 'doc_number', handwritten: true, required: false },
      { field: 'act_record_date', label_uk: 'Дата складання актового запису', kind: 'date', handwritten: true, required: false },
      { field: 'issuing_authority', label_uk: 'Місце державної реєстрації (орган)', kind: 'agency', handwritten: true, required: false },
      { field: 'certificate_series_number', label_uk: 'Серія та номер свідоцтва', kind: 'doc_number', handwritten: true, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі', kind: 'date', handwritten: true, required: false },
    ],
  },

  // ── Ukrainian death certificate (Свідоцтво про смерть, KMU 1025) ──
  // Schema is already split (deceased_surname/given_name/patronymic). All
  // handwritten:true ⇒ always review.
  ua_death_certificate: {
    id: 'ua_death_certificate',
    title_en: 'Ukrainian Death Certificate',
    script: 'cyrillic',
    consumers: ['translation'],
    vision_anchor: 'deceased_surname',
    fields: [
      { field: 'deceased_surname', label_uk: 'Прізвище померлого', kind: 'name', handwritten: true, required: true },
      { field: 'deceased_given_name', label_uk: "Ім'я померлого", kind: 'name', handwritten: true, required: true },
      { field: 'deceased_patronymic', label_uk: 'По батькові померлого', kind: 'name', handwritten: true, required: false },
      { field: 'date_of_birth', label_uk: 'Дата народження', kind: 'date', handwritten: true, required: false },
      { field: 'date_of_death', label_uk: 'Дата смерті', kind: 'date', handwritten: true, required: true },
      { field: 'place_of_death', label_uk: 'Місце смерті', kind: 'place_city', handwritten: true, required: false },
      { field: 'act_record_number', label_uk: 'Актовий запис №', kind: 'doc_number', handwritten: true, required: false },
      { field: 'act_record_date', label_uk: 'Дата складання актового запису', kind: 'date', handwritten: true, required: false },
      { field: 'issuing_authority', label_uk: 'Місце державної реєстрації (орган)', kind: 'agency', handwritten: true, required: false },
      { field: 'certificate_series_number', label_uk: 'Серія та номер свідоцтва', kind: 'doc_number', handwritten: true, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі', kind: 'date', handwritten: true, required: false },
    ],
  },

  // ── Ukrainian name-change certificate (Свідоцтво про зміну імені, KMU 1025) ──
  // previous_* = name before, new_* = name after. Split per official blank. All
  // handwritten:true ⇒ always review.
  ua_name_change_certificate: {
    id: 'ua_name_change_certificate',
    title_en: 'Ukrainian Name Change Certificate',
    script: 'cyrillic',
    consumers: ['translation'],
    vision_anchor: 'new_surname',
    fields: [
      { field: 'previous_surname', label_uk: 'Прізвище до зміни', kind: 'name', handwritten: true, required: true },
      { field: 'previous_given_name', label_uk: "Ім'я до зміни", kind: 'name', handwritten: true, required: true },
      { field: 'previous_patronymic', label_uk: 'По батькові до зміни', kind: 'name', handwritten: true, required: false },
      { field: 'new_surname', label_uk: 'Прізвище після зміни', kind: 'name', handwritten: true, required: true },
      { field: 'new_given_name', label_uk: "Ім'я після зміни", kind: 'name', handwritten: true, required: true },
      { field: 'new_patronymic', label_uk: 'По батькові після зміни', kind: 'name', handwritten: true, required: false },
      { field: 'date_of_birth', label_uk: 'Дата народження', kind: 'date', handwritten: true, required: false },
      { field: 'act_record_number', label_uk: 'Актовий запис №', kind: 'doc_number', handwritten: true, required: false },
      { field: 'act_record_date', label_uk: 'Дата складання актового запису', kind: 'date', handwritten: true, required: false },
      { field: 'issuing_authority', label_uk: 'Місце державної реєстрації (орган)', kind: 'agency', handwritten: true, required: false },
      { field: 'certificate_series_number', label_uk: 'Серія та номер свідоцтва', kind: 'doc_number', handwritten: true, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі', kind: 'date', handwritten: true, required: false },
    ],
  },

  // ── Ukrainian ID card (credit-card format, printed) ──
  ua_id_card: {
    id: 'ua_id_card',
    title_en: 'Ukrainian ID Card',
    script: 'mixed',
    consumers: ['tps', 'translation'],
    vision_anchor: 'family_name',
    fields: [
      { field: 'family_name', label_uk: 'Прізвище', kind: 'name', handwritten: false, required: true },
      { field: 'given_name', label_uk: "Ім'я", kind: 'name', handwritten: false, required: true },
      // "По батькові" = patronymic, NOT a Western middle name (CLAUDE.md hard-rule).
      { field: 'patronymic', label_uk: 'По батькові', kind: 'name', handwritten: false, required: false },
      { field: 'dob', label_uk: 'Дата народження', kind: 'date', handwritten: false, required: true },
      { field: 'sex', label_uk: 'Стать', kind: 'sex', handwritten: false, required: false },
      { field: 'city_of_birth', label_uk: 'Місце народження', kind: 'place_city', handwritten: false, required: false },
      { field: 'doc_number', label_uk: 'Номер', kind: 'doc_number', handwritten: false, required: false },
      { field: 'date_of_issue', label_uk: 'Дата видачі', kind: 'date', handwritten: false, required: false },
    ],
  },

  // ── Ukrainian military ID (Військовий квиток) — identity page (page 1) ──
  // Civil-identity fields only (name/patronymic/dob/series-number). Rank, unit,
  // and speciality are deliberately NOT extracted — not USCIS form fields and
  // not civil identity. Hard-case class: every field defaults to review_required.
  // No `sex` field: there is no `sex` FieldKind in the reader contract today, so
  // sex stays unscored for this type (documented limitation, not a wrong value).
  ua_military_id: {
    id: 'ua_military_id',
    title_en: 'Ukrainian Military ID (identity page)',
    script: 'cyrillic',
    consumers: ['translation', 'reparole', 'tps'],
    vision_anchor: 'family_name',
    fields: [
      { field: 'family_name', label_uk: 'Прізвище', kind: 'name', handwritten: true, required: true },
      { field: 'given_name', label_uk: "Ім'я", kind: 'name', handwritten: true, required: true },
      { field: 'patronymic', label_uk: 'По батькові', kind: 'name', handwritten: true, required: false },
      { field: 'dob', label_uk: 'Дата народження', kind: 'date', handwritten: true, required: true },
      { field: 'doc_number', label_uk: 'Серія та номер', kind: 'doc_number', handwritten: true, required: false },
    ],
  },
  // ── US Employment Authorization Card (I-766) ────────────────────────────
  // Phase 2.2a: registry proof. All fields printed in Latin script.
  // vision_anchor = card_number (EADXXXXXXXXXXXXXXXXX, always on front).
  us_ead: {
    id: 'us_ead',
    title_en: 'US Employment Authorization Card (I-766)',
    script: 'latin',
    consumers: ['ead'],
    vision_anchor: 'card_number',
    fields: [
      { field: 'family_name',      label_uk: 'Family Name',     kind: 'name',       handwritten: false, required: true },
      { field: 'given_name',       label_uk: 'Given Name',      kind: 'name',       handwritten: false, required: true },
      { field: 'card_number',      label_uk: 'Card #',          kind: 'doc_number', handwritten: false, required: true },
      { field: 'a_number',         label_uk: 'USCIS #',         kind: 'doc_number', handwritten: false, required: false },
      { field: 'ead_category',     label_uk: 'Category',        kind: 'doc_number', handwritten: false, required: false },
      { field: 'ead_validity_from', label_uk: 'Valid From',     kind: 'date',       handwritten: false, required: false },
      { field: 'ead_validity_to',  label_uk: 'Card Expires',    kind: 'date',       handwritten: false, required: false },
      { field: 'country_of_birth', label_uk: 'Country of Birth', kind: 'text',     handwritten: false, required: false },
    ],
  },

  // ── US I-94 Arrival/Departure Record ──────────────────────────────────────
  // Phase 2.2a: registry proof. Online I-94 printout (CBP.DHS.gov).
  us_i94: {
    id: 'us_i94',
    title_en: 'US Form I-94 (Arrival/Departure Record)',
    script: 'latin',
    consumers: ['ead', 'reparole', 'tps'],
    vision_anchor: 'i94_admission_number',
    fields: [
      { field: 'family_name',           label_uk: 'Last/Surname',           kind: 'name',       handwritten: false, required: true },
      { field: 'given_name',            label_uk: 'First (Given) Name',     kind: 'name',       handwritten: false, required: true },
      { field: 'date_of_birth',         label_uk: 'Date of Birth',          kind: 'date',       handwritten: false, required: false },
      { field: 'i94_admission_number',  label_uk: 'Admission (I-94) Number', kind: 'doc_number', handwritten: false, required: true },
      { field: 'i94_class_of_admission', label_uk: 'Class of Admission',    kind: 'doc_number', handwritten: false, required: false },
      { field: 'i94_date_of_entry',     label_uk: 'Last Date of Entry',     kind: 'date',       handwritten: false, required: false },
      { field: 'i94_place_of_entry',    label_uk: 'Port of Entry',          kind: 'text',       handwritten: false, required: false },
      { field: 'country_of_birth',      label_uk: 'Country of Birth',       kind: 'text',       handwritten: false, required: false },
    ],
  },

  // ── US I-797 Notice of Action ─────────────────────────────────────────────
  // Phase 2.2a: registry proof. Covers receipt notices, approval notices.
  // I-797 variants differ — extract only fields present on all variants.
  us_i797: {
    id: 'us_i797',
    title_en: 'US Form I-797 (Notice of Action)',
    script: 'latin',
    consumers: ['ead'],
    vision_anchor: 'a_number',
    fields: [
      { field: 'family_name',   label_uk: 'Applicant Last Name',              kind: 'name',       handwritten: false, required: false },
      { field: 'given_name',    label_uk: 'Applicant First Name',             kind: 'name',       handwritten: false, required: false },
      { field: 'a_number',      label_uk: 'A-Number (Alien Registration #)',  kind: 'doc_number', handwritten: false, required: true },
      { field: 'uscis_number',  label_uk: 'USCIS Online Account Number',      kind: 'doc_number', handwritten: false, required: false },
    ],
  },
}

export function getDocTypeSpec(id: string): DocTypeSpec | null {
  return DOCUMENT_TYPES[id] ?? null
}

/** All document type ids a given product consumes. */
export function docTypesForConsumer(consumer: string): string[] {
  return Object.values(DOCUMENT_TYPES)
    .filter((d) => d.consumers.includes(consumer as any))
    .map((d) => d.id)
}
