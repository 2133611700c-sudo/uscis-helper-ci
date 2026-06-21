/**
 * Document type definitions for the Translation Wizard.
 *
 * Coverage: 20 document types × 10 languages × era variants.
 * Era variants: Modern Ukraine, Soviet Ukraine (УРСР), Modern Russia, Soviet Russia (РСФСР), USA, EU.
 * Sources:
 *   - 8 CFR 103.2(b)(3) — USCIS translation requirements for immigration docs
 *   - DocTranslation.com — USSR document field standards
 *   - Competitor analysis: RushTranslate, Bluente, ImmiTranslate
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type SourceLang = 'uk' | 'ru' | 'es' | 'pl' | 'de' | 'fr' | 'ar' | 'zh' | 'ko' | 'pt' | 'en'

export type DocEra =
  | 'ukraine-modern'   // Ukraine post-1991 (Ukrainian language)
  | 'ukraine-soviet'   // Ukrainian SSR / USSR (Russian or bilingual)
  | 'russia-modern'    // Russia post-1991
  | 'russia-soviet'    // Russian SFSR / USSR
  | 'usa'             // United States
  | 'eu'              // European Union (generic)
  | 'generic'         // No specific era — default

export type DocGroup = 'popular' | 'personal' | 'academic' | 'legal' | 'financial' | 'medical' | 'other'

export type FieldGroup = 'personal' | 'document' | 'authority'

export interface FieldDef {
  key: string
  en: string
  orig: Partial<Record<SourceLang, string>>
  required: boolean
  type?: 'text' | 'date' | 'radio'
  group?: FieldGroup                          // display group in wizard step 3; inferred if absent
  options?: { val: string; label: Partial<Record<SourceLang, string>> }[]
  placeholder?: Partial<Record<SourceLang, string>>
  helpExample?: Partial<Record<SourceLang, string>>
  eraNote?: Partial<Record<DocEra, string>>  // era-specific guidance for this field
}

export interface EraVariant {
  id: DocEra
  label: Partial<Record<SourceLang, string>>
  flag: string
  srcLang: SourceLang       // default source language for this era
  noteForTranslator?: string
  overrideFields?: Partial<Record<string, Partial<FieldDef>>>  // per-key field overrides
  extraFields?: FieldDef[]   // additional fields specific to this era
}

export interface DocDef {
  id: string
  prodId: string            // maps to generateTranslationHTML.ts docType keys
  group: DocGroup
  popular: boolean
  label: Partial<Record<SourceLang, string>>
  icon: string              // inline SVG string
  color: string             // CSS gradient for card
  fields: FieldDef[]
  eraVariants?: EraVariant[]  // optional era/country variants
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHECK_SVG = '<polyline points="20 6 9 17 4 12" />'

// ─── Icons ───────────────────────────────────────────────────────────────────

const ICON_PASSPORT = '<svg viewBox="0 0 30 38" width="30" height="38" fill="none"><rect x="1" y="1" width="28" height="36" rx="2" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.9)" stroke-width="1.5"/><line x1="6" y1="1" x2="6" y2="37" stroke="rgba(255,255,255,.3)" stroke-width="1"/><circle cx="17" cy="13" r="4.5" stroke="rgba(255,255,255,.95)" stroke-width="1.4" fill="rgba(255,255,255,.18)"/><path d="M9 22c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="rgba(255,255,255,.9)" stroke-width="1.4" stroke-linecap="round" fill="none"/><rect x="8" y="25" width="14" height="1.5" rx=".75" fill="rgba(255,255,255,.65)"/><rect x="2" y="28.5" width="26" height="1.5" rx=".75" fill="rgba(255,255,255,.55)"/><rect x="2" y="31.5" width="26" height="1.5" rx=".75" fill="rgba(255,255,255,.55)"/><rect x="2" y="34.5" width="20" height="1.5" rx=".75" fill="rgba(255,255,255,.4)"/></svg>'
const ICON_BIRTH = '<svg viewBox="0 0 28 34" width="28" height="34" fill="none"><rect x="1" y="1" width="26" height="32" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><path d="M14 5l1.9 5.8h6.1l-4.9 3.6 1.9 5.8L14 17l-4.9 3.2 1.9-5.8-4.9-3.6H12z" fill="rgba(255,255,255,.95)"/><rect x="5" y="22" width="18" height="1.6" rx=".8" fill="rgba(255,255,255,.65)"/><rect x="6" y="25" width="16" height="1.3" rx=".65" fill="rgba(255,255,255,.48)"/><rect x="7" y="28" width="14" height="1.3" rx=".65" fill="rgba(255,255,255,.35)"/></svg>'
const ICON_MARRIAGE = '<svg viewBox="0 0 28 34" width="28" height="34" fill="none"><rect x="1" y="1" width="26" height="32" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><circle cx="10.5" cy="13" r="4.5" stroke="rgba(255,255,255,.95)" stroke-width="1.8" fill="none"/><circle cx="17.5" cy="13" r="4.5" stroke="rgba(255,255,255,.95)" stroke-width="1.8" fill="rgba(255,255,255,.14)"/><rect x="5" y="22" width="18" height="1.6" rx=".8" fill="rgba(255,255,255,.65)"/><rect x="6" y="25" width="16" height="1.3" rx=".65" fill="rgba(255,255,255,.48)"/></svg>'
const ICON_DOC = '<svg viewBox="0 0 28 34" width="28" height="34" fill="none"><rect x="1" y="1" width="26" height="32" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><rect x="5" y="8" width="18" height="1.6" rx=".8" fill="rgba(255,255,255,.85)"/><rect x="5" y="12" width="18" height="1.3" rx=".65" fill="rgba(255,255,255,.65)"/><rect x="5" y="16" width="14" height="1.3" rx=".65" fill="rgba(255,255,255,.55)"/><rect x="5" y="20" width="18" height="1.3" rx=".65" fill="rgba(255,255,255,.48)"/><rect x="5" y="24" width="12" height="1.3" rx=".65" fill="rgba(255,255,255,.38)"/><rect x="5" y="28" width="16" height="1.3" rx=".65" fill="rgba(255,255,255,.28)"/></svg>'
const ICON_DIPLOMA = '<svg viewBox="0 0 32 28" width="32" height="28" fill="none"><rect x="1" y="1" width="30" height="26" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><circle cx="16" cy="12" r="5" stroke="rgba(255,255,255,.95)" stroke-width="1.5" fill="none"/><path d="M11 22l2.5-3h5l2.5 3" stroke="rgba(255,255,255,.7)" stroke-width="1.3" fill="none"/><rect x="5" y="6" width="6" height="1" rx=".5" fill="rgba(255,255,255,.5)"/><rect x="5" y="8" width="4" height="1" rx=".5" fill="rgba(255,255,255,.4)"/></svg>'
const ICON_ID = '<svg viewBox="0 0 36 24" width="36" height="24" fill="none"><rect x="1" y="1" width="34" height="22" rx="2" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><circle cx="10" cy="12" r="5" stroke="rgba(255,255,255,.9)" stroke-width="1.4" fill="rgba(255,255,255,.15)"/><rect x="18" y="7" width="12" height="1.5" rx=".75" fill="rgba(255,255,255,.85)"/><rect x="18" y="11" width="10" height="1.3" rx=".65" fill="rgba(255,255,255,.6)"/><rect x="18" y="15" width="8" height="1.3" rx=".65" fill="rgba(255,255,255,.5)"/></svg>'
const ICON_COURT = '<svg viewBox="0 0 28 34" width="28" height="34" fill="none"><rect x="1" y="1" width="26" height="32" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><path d="M14 5v4" stroke="rgba(255,255,255,.9)" stroke-width="1.5" stroke-linecap="round"/><path d="M8 9h16" stroke="rgba(255,255,255,.85)" stroke-width="1.3" stroke-linecap="round"/><rect x="6" y="11" width="3" height="12" rx=".5" fill="rgba(255,255,255,.7)"/><rect x="12.5" y="11" width="3" height="12" rx=".5" fill="rgba(255,255,255,.7)"/><rect x="19" y="11" width="3" height="12" rx=".5" fill="rgba(255,255,255,.7)"/><rect x="5" y="24" width="18" height="1.5" rx=".75" fill="rgba(255,255,255,.9)"/><rect x="4" y="27" width="20" height="1.5" rx=".75" fill="rgba(255,255,255,.6)"/></svg>'
const ICON_MEDICAL = '<svg viewBox="0 0 28 34" width="28" height="34" fill="none"><rect x="1" y="1" width="26" height="32" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><path d="M14 9v12M8 15h12" stroke="rgba(255,255,255,.95)" stroke-width="2" stroke-linecap="round"/></svg>'
const ICON_BANK = '<svg viewBox="0 0 28 34" width="28" height="34" fill="none"><rect x="1" y="1" width="26" height="32" rx="1.5" fill="rgba(255,255,255,.15)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/><path d="M14 6l8 5H6l8-5z" fill="rgba(255,255,255,.85)"/><rect x="7" y="12" width="2" height="10" fill="rgba(255,255,255,.7)"/><rect x="13" y="12" width="2" height="10" fill="rgba(255,255,255,.7)"/><rect x="19" y="12" width="2" height="10" fill="rgba(255,255,255,.7)"/><rect x="5" y="23" width="18" height="1.5" fill="rgba(255,255,255,.9)"/></svg>'

// ─── Era variants (reusable) ──────────────────────────────────────────────────

const ERA_UKRAINE_MODERN: EraVariant = {
  id: 'ukraine-modern',
  flag: '🇺🇦',
  srcLang: 'uk',
  label: { uk: 'Україна (після 1991)', ru: 'Украина (после 1991)', en: 'Ukraine (post-1991)', es: 'Ucrania (post-1991)', de: 'Ukraine (nach 1991)' },
}

const ERA_UKRAINE_SOVIET: EraVariant = {
  id: 'ukraine-soviet',
  flag: '☭',
  srcLang: 'ru',
  label: { uk: 'УРСР / СРСР (до 1991)', ru: 'УССР / СССР (до 1991)', en: 'Ukrainian SSR / USSR (pre-1991)', es: 'RSS Ucraniana / URSS (antes de 1991)' },
  noteForTranslator: 'Document issued in Ukrainian SSR. Place names should include republic: "Kharkiv, Kharkiv Oblast, Ukrainian SSR". Issuing body: "Civil Registry Office (ZAGS)" or "Відділ ЗАГС".',
  extraFields: [
    {
      key: 'nationality_field',
      en: 'Nationality (as on document)',
      orig: { uk: 'Національність', ru: 'Национальность', en: 'Nationality' },
      required: false,
      placeholder: { ru: 'Украинец / Русский / Еврей...', uk: 'Українець / Росіянин...', en: 'Ukrainian / Russian / Jewish...' },
      helpExample: { ru: 'Советские свидетельства содержали графу «Национальность» (этнос), отличную от гражданства.', en: 'Soviet documents included ethnic nationality field, different from citizenship.' },
    },
    {
      key: 'registry_book_number',
      en: 'Registry Book / Act Record Number',
      orig: { uk: 'Номер актового запису', ru: 'Номер актовой записи', en: 'Registry Act Number' },
      required: false,
      placeholder: { ru: '№ 247', uk: '№ 247', en: '247' },
    },
  ],
}

const ERA_RUSSIA_MODERN: EraVariant = {
  id: 'russia-modern',
  flag: '🇷🇺',
  srcLang: 'ru',
  label: { uk: 'Росія (після 1991)', ru: 'Россия (после 1991)', en: 'Russia (post-1991)', es: 'Rusia (post-1991)' },
}

const ERA_RUSSIA_SOVIET: EraVariant = {
  id: 'russia-soviet',
  flag: '☭',
  srcLang: 'ru',
  label: { uk: 'РСФСР / СРСР (до 1991)', ru: 'РСФСР / СССР (до 1991)', en: 'Russian SFSR / USSR (pre-1991)' },
  noteForTranslator: 'Document issued in Russian SFSR. Place names: "Moscow, Russian SFSR". Issuing body: "Civil Registry Office (ZAGS)" / ЗАГС.',
  extraFields: [
    {
      key: 'nationality_field',
      en: 'Nationality (as on document)',
      orig: { ru: 'Национальность', en: 'Nationality' },
      required: false,
      placeholder: { ru: 'Русский / Украинец / Татарин...' },
    },
    {
      key: 'registry_book_number',
      en: 'Registry Book / Act Record Number',
      orig: { ru: 'Номер актовой записи', en: 'Act Record Number' },
      required: false,
    },
  ],
}

const ERA_USA: EraVariant = {
  id: 'usa',
  flag: '🇺🇸',
  srcLang: 'en',
  label: { uk: 'США', ru: 'США', en: 'United States', es: 'Estados Unidos', de: 'USA' },
}

const ERA_EU: EraVariant = {
  id: 'eu',
  flag: '🇪🇺',
  srcLang: 'en',
  label: { uk: 'Євросоюз / Інша країна', ru: 'ЕС / Другая страна', en: 'EU / Other country', es: 'UE / Otro país' },
}

// ─── Document definitions ─────────────────────────────────────────────────────

export const DOCS: DocDef[] = [

  // ── 1. Passport ─────────────────────────────────────────────────────────────
  {
    id: 'passport', prodId: 'passport', group: 'popular', popular: true,
    label: { uk: 'Паспорт', ru: 'Паспорт', en: 'Passport', es: 'Pasaporte', pl: 'Paszport', de: 'Reisepass', fr: 'Passeport', ar: 'جواز سفر', zh: '护照', ko: '여권', pt: 'Passaporte' },
    color: 'linear-gradient(150deg,#1e40af 0%,#3b82f6 100%)',
    icon: ICON_PASSPORT,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'last_name', en: 'Last Name', orig: { uk: 'Прізвище', ru: 'Фамилия', es: 'Apellido', pl: 'Nazwisko', de: 'Nachname', fr: 'Nom de famille', ar: 'اللقب', zh: '姓', ko: '성', pt: 'Sobrenome', en: 'Last Name' }, required: true, placeholder: { uk: 'ШЕВЧЕНКО', ru: 'ШЕВЧЕНКО', en: 'SHEVCHENKO' } },
      { key: 'given_names', en: 'Given Names', orig: { uk: "Ім'я та по батькові", ru: 'Имя и отчество', es: 'Nombres', pl: 'Imię i patronim', de: 'Vornamen', fr: 'Prénoms', ar: 'الاسم الأول', zh: '名', ko: '이름', pt: 'Nomes', en: 'Given Names' }, required: true, placeholder: { uk: 'ТАРАС ГРИГОРОВИЧ', ru: 'ТАРАС ГРИГОРЬЕВИЧ', en: 'TARAS' } },
      { key: 'sex', en: 'Sex', orig: { uk: 'Стать', ru: 'Пол', es: 'Sexo', pl: 'Płeć', de: 'Geschlecht', fr: 'Sexe', ar: 'الجنس', zh: '性别', ko: '성별', pt: 'Sexo', en: 'Sex' }, required: true, type: 'radio', options: [{ val: 'M', label: { uk: 'Чоловіча / M', ru: 'Мужской / M', es: 'Masculino / M', en: 'Male / M', de: 'Männlich / M' } }, { val: 'F', label: { uk: 'Жіноча / F', ru: 'Женский / F', es: 'Femenino / F', en: 'Female / F', de: 'Weiblich / F' } }] },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', es: 'Fecha de nacimiento', pl: 'Data urodzenia', de: 'Geburtsdatum', fr: 'Date de naissance', ar: 'تاريخ الميلاد', zh: '出生日期', ko: '생년월일', pt: 'Data de nascimento', en: 'Date of Birth' }, required: true, type: 'date' },
      { key: 'place_of_birth', en: 'Place of Birth', orig: { uk: 'Місце народження', ru: 'Место рождения', es: 'Lugar de nacimiento', pl: 'Miejsce urodzenia', de: 'Geburtsort', fr: 'Lieu de naissance', ar: 'مكان الولادة', zh: '出生地', ko: '출생지', pt: 'Local de nascimento', en: 'Place of Birth' }, required: true, placeholder: { uk: 'м. Київ, Україна', ru: 'г. Киев, Украина', en: 'Kyiv, Ukraine' } },
      { key: 'nationality', en: 'Nationality / Citizenship', orig: { uk: 'Громадянство', ru: 'Гражданство', es: 'Nacionalidad', pl: 'Obywatelstwo', de: 'Staatsangehörigkeit', fr: 'Nationalité', ar: 'الجنسية', zh: '国籍', ko: '국적', pt: 'Nacionalidade', en: 'Nationality' }, required: true, placeholder: { uk: 'Українець/ка', ru: 'Украинец', en: 'Ukrainian' } },
      { key: 'document_number', en: 'Passport Number', orig: { uk: 'Номер паспорта', ru: 'Номер паспорта', es: 'Número de pasaporte', pl: 'Numer paszportu', de: 'Passnummer', fr: 'Numéro de passeport', ar: 'رقم جواز السفر', zh: '护照号码', ko: '여권 번호', pt: 'Número do passaporte', en: 'Passport Number' }, required: true, placeholder: { uk: 'FN123456', ru: 'FN123456', en: 'FN123456' }, helpExample: { uk: 'Верхній правий кут головної сторінки', en: 'Top right corner of the bio page' } },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', es: 'Fecha de emisión', pl: 'Data wydania', de: 'Ausstellungsdatum', fr: 'Date de délivrance', ar: 'تاريخ الإصدار', zh: '签发日期', ko: '발급일', pt: 'Data de emissão', en: 'Date of Issue' }, required: true, type: 'date' },
      { key: 'expiry_date', en: 'Date of Expiry', orig: { uk: 'Дата закінчення дії', ru: 'Срок действия до', es: 'Fecha de vencimiento', pl: 'Data ważności', de: 'Ablaufdatum', fr: "Date d'expiration", ar: 'تاريخ الانتهاء', zh: '到期日期', ko: '만료일', pt: 'Data de validade', en: 'Date of Expiry' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority', orig: { uk: 'Орган видачі', ru: 'Орган выдачи', es: 'Autoridad emisora', pl: 'Organ wydający', de: 'Ausstellende Behörde', fr: 'Autorité de délivrance', ar: 'جهة الإصدار', zh: '签发机关', ko: '발급기관', pt: 'Autoridade emissora', en: 'Issuing Authority' }, required: true, placeholder: { uk: 'ДМСУ 1234', ru: 'УМВД России по г. Москва', en: 'State Migration Service' } },
    ],
  },

  // ── 2. National ID Card ──────────────────────────────────────────────────────
  {
    id: 'national_id', prodId: 'national-id', group: 'popular', popular: true,
    label: { uk: 'ID-картка / Посвідчення', ru: 'Удостоверение / ID-карта', en: 'National ID Card', es: 'Documento de Identidad', pl: 'Dowód osobisty', de: 'Personalausweis', fr: "Carte d'identité", ko: '신분증', zh: '身份证', ar: 'بطاقة هوية', pt: 'Bilhete de identidade' },
    color: 'linear-gradient(150deg,#065f46 0%,#10b981 100%)',
    icon: ICON_ID,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'last_name', en: 'Last Name', orig: { uk: 'Прізвище', ru: 'Фамилия', en: 'Last Name', es: 'Apellido', de: 'Nachname', pl: 'Nazwisko' }, required: true, placeholder: { uk: 'ШЕВЧЕНКО', ru: 'ШЕВЧЕНКО', en: 'SHEVCHENKO' } },
      { key: 'given_names', en: 'Given Names', orig: { uk: "Ім'я", ru: 'Имя', en: 'Given Names', es: 'Nombre', de: 'Vorname', pl: 'Imię' }, required: true, placeholder: { uk: 'ТАРАС', ru: 'ТАРАС', en: 'TARAS' } },
      { key: 'patronymic', en: 'Patronymic (if shown)', orig: { uk: 'По батькові', ru: 'Отчество', en: 'Patronymic' }, required: false, placeholder: { uk: 'ГРИГОРОВИЧ', ru: 'ГРИГОРЬЕВИЧ', en: 'N/A' } },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', es: 'Fecha de nacimiento', de: 'Geburtsdatum' }, required: true, type: 'date' },
      { key: 'document_number', en: 'ID Number', orig: { uk: 'Номер документа', ru: 'Номер документа', en: 'ID Number', es: 'Número de documento', de: 'Ausweisnummer' }, required: true },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'expiry_date', en: 'Date of Expiry', orig: { uk: 'Дійсний до', ru: 'Действителен до', en: 'Date of Expiry', de: 'Gültig bis' }, required: false, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority', orig: { uk: 'Орган видачі', ru: 'Орган выдачи', en: 'Issuing Authority', de: 'Ausstellende Behörde' }, required: true },
    ],
  },

  // ── 3. Birth Certificate ─────────────────────────────────────────────────────
  {
    id: 'birth_cert', prodId: 'birth-certificate', group: 'popular', popular: true,
    label: { uk: 'Свідоцтво про народження', ru: 'Свидетельство о рождении', en: 'Birth Certificate', es: 'Acta de nacimiento', pl: 'Akt urodzenia', de: 'Geburtsurkunde', fr: 'Acte de naissance', ar: 'شهادة الميلاد', zh: '出生证明', ko: '출생증명서', pt: 'Certidão de nascimento' },
    color: 'linear-gradient(150deg,#92400e 0%,#f59e0b 100%)',
    icon: ICON_BIRTH,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_UKRAINE_SOVIET, ERA_RUSSIA_MODERN, ERA_RUSSIA_SOVIET, ERA_USA, ERA_EU],
    fields: [
      { key: 'last_name', en: "Child's Last Name", orig: { uk: 'Прізвище дитини', ru: 'Фамилия ребёнка', es: 'Apellido del niño/a', en: "Child's Last Name", de: 'Nachname des Kindes', pl: 'Nazwisko dziecka' }, required: true, placeholder: { uk: 'ШЕВЧЕНКО', ru: 'ШЕВЧЕНКО', en: 'SHEVCHENKO' } },
      { key: 'given_names', en: "Child's First Name", orig: { uk: "Ім'я дитини", ru: 'Имя ребёнка', es: 'Nombre del niño/a', en: "Child's First Name", de: 'Vorname des Kindes', pl: 'Imię dziecka' }, required: true, placeholder: { uk: 'ТАРАС', ru: 'ТАРАС', en: 'TARAS' } },
      { key: 'sex', en: "Child's Sex", orig: { uk: 'Стать дитини', ru: 'Пол ребёнка', es: 'Sexo del niño/a', en: "Child's Sex", de: 'Geschlecht des Kindes' }, required: true, type: 'radio', options: [{ val: 'M', label: { uk: 'Чоловіча', ru: 'Мужской', es: 'Masculino', en: 'Male' } }, { val: 'F', label: { uk: 'Жіноча', ru: 'Женский', es: 'Femenino', en: 'Female' } }] },
      { key: 'date_of_birth', en: "Child's Date of Birth", orig: { uk: 'Дата народження дитини', ru: 'Дата рождения ребёнка', es: 'Fecha de nacimiento', en: 'Date of Birth', de: 'Geburtsdatum des Kindes' }, required: true, type: 'date' },
      { key: 'place_of_birth', en: 'Place of Birth', orig: { uk: 'Місце народження', ru: 'Место рождения', es: 'Lugar de nacimiento', en: 'Place of Birth', de: 'Geburtsort' }, required: true, placeholder: { uk: 'м. Київ', ru: 'г. Киев', en: 'Kyiv' }, eraNote: { 'ukraine-soviet': 'Include republic: "Kharkiv, Kharkiv Oblast, Ukrainian SSR"', 'russia-soviet': 'Include republic: "Moscow, Russian SFSR"' } },
      { key: 'father_name', en: "Father's Full Name", orig: { uk: "Ім'я батька (повністю)", ru: 'Полное имя отца', es: 'Nombre completo del padre', en: "Father's Full Name", de: 'Vollständiger Name des Vaters' }, required: false, placeholder: { uk: 'ГРИГОРІЙ ІВАНОВИЧ ШЕВЧЕНКО', ru: 'ГРИГОРИЙ ИВАНОВИЧ ШЕВЧЕНКО', en: 'HRYHORIY IVANOVYCH SHEVCHENKO' } },
      { key: 'mother_name', en: "Mother's Full Name", orig: { uk: "Ім'я матері (повністю)", ru: 'Полное имя матери', es: 'Nombre completo de la madre', en: "Mother's Full Name", de: 'Vollständiger Name der Mutter' }, required: false, placeholder: { uk: 'ГАННА ПЕТРІВНА ШЕВЧЕНКО', ru: 'АННА ПЕТРОВНА ШЕВЧЕНКО', en: 'HANNA PETRIVNA SHEVCHENKO' } },
      { key: 'document_number', en: 'Certificate Number', orig: { uk: 'Номер свідоцтва (серія і номер)', ru: 'Серия и номер свидетельства', es: 'Número de certificado', en: 'Certificate Number', de: 'Urkundennummer' }, required: true, placeholder: { uk: 'І-КВ №123456', ru: 'I-КВ №123456', en: 'I-KV No.123456' } },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', es: 'Fecha de emisión', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Registry Office / Issuing Authority', orig: { uk: 'Орган РАЦС / видачі', ru: 'Орган ЗАГС / выдачи', es: 'Registro Civil', en: 'Registry Office', de: 'Standesamt' }, required: true, placeholder: { uk: 'Шевченківський РАЦС м. Київ', ru: 'Шевченковский ЗАГС г. Киев', en: 'Civil Registry, Kyiv' }, eraNote: { 'ukraine-soviet': 'Soviet issuing body: "Відділ ЗАГС" (Civil Registration Department)', 'russia-soviet': 'Soviet issuing body: "Отдел ЗАГС"' } },
    ],
  },

  // ── 4. Marriage Certificate ──────────────────────────────────────────────────
  {
    id: 'marriage_cert', prodId: 'marriage-certificate', group: 'popular', popular: true,
    label: { uk: 'Свідоцтво про шлюб', ru: 'Свидетельство о браке', en: 'Marriage Certificate', es: 'Acta de matrimonio', pl: 'Akt małżeństwa', de: 'Heiratsurkunde', fr: 'Acte de mariage', ar: 'عقد الزواج', zh: '结婚证', ko: '결혼증명서', pt: 'Certidão de casamento' },
    color: 'linear-gradient(150deg,#881337 0%,#f472b6 100%)',
    icon: ICON_MARRIAGE,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_UKRAINE_SOVIET, ERA_RUSSIA_MODERN, ERA_RUSSIA_SOVIET, ERA_USA, ERA_EU],
    fields: [
      { key: 'spouse1_last_name', en: 'Spouse 1 — Last Name', orig: { uk: 'Прізвище чоловіка/дружини (1)', ru: 'Фамилия мужа/жены (1)', es: 'Apellido cónyuge 1', en: 'Spouse 1 — Last Name', de: 'Nachname Ehegatte 1' }, required: true, placeholder: { uk: 'КОВАЛЕНКО', ru: 'КОВАЛЕНКО', en: 'KOVALENKO' } },
      { key: 'spouse1_given_names', en: 'Spouse 1 — Given Names', orig: { uk: "Ім'я та по батькові (1)", ru: 'Имя и отчество (1)', es: 'Nombres cónyuge 1', en: 'Spouse 1 — Given Names', de: 'Vorname Ehegatte 1' }, required: true, placeholder: { uk: 'ІВАН ПЕТРОВИЧ', ru: 'ИВАН ПЕТРОВИЧ', en: 'IVAN PETROVYCH' } },
      { key: 'spouse1_dob', en: 'Spouse 1 — Date of Birth', orig: { uk: 'Дата народження (1)', ru: 'Дата рождения (1)', en: 'Spouse 1 — Date of Birth', de: 'Geburtsdatum Ehegatte 1' }, required: false, type: 'date' },
      { key: 'spouse2_last_name', en: 'Spouse 2 — Last Name', orig: { uk: 'Прізвище чоловіка/дружини (2)', ru: 'Фамилия мужа/жены (2)', es: 'Apellido cónyuge 2', en: 'Spouse 2 — Last Name', de: 'Nachname Ehegatte 2' }, required: true, placeholder: { uk: 'ШЕВЧЕНКО', ru: 'ШЕВЧЕНКО', en: 'SHEVCHENKO' } },
      { key: 'spouse2_given_names', en: 'Spouse 2 — Given Names', orig: { uk: "Ім'я та по батькові (2)", ru: 'Имя и отчество (2)', es: 'Nombres cónyuge 2', en: 'Spouse 2 — Given Names', de: 'Vorname Ehegatte 2' }, required: true, placeholder: { uk: 'ГАННА ІВАНІВНА', ru: 'АННА ИВАНОВНА', en: 'HANNA IVANIVNA' } },
      { key: 'spouse2_dob', en: 'Spouse 2 — Date of Birth', orig: { uk: 'Дата народження (2)', ru: 'Дата рождения (2)', en: 'Spouse 2 — Date of Birth', de: 'Geburtsdatum Ehegatte 2' }, required: false, type: 'date' },
      { key: 'pre_marriage_name_s1', en: 'Spouse 1 — Pre-marriage surname (if changed)', orig: { uk: 'Прізвище до шлюбу (1)', ru: 'Добрачная фамилия (1)', en: 'Spouse 1 — Pre-marriage surname' }, required: false },
      { key: 'pre_marriage_name_s2', en: 'Spouse 2 — Pre-marriage surname (if changed)', orig: { uk: 'Прізвище до шлюбу (2)', ru: 'Добрачная фамилия (2)', en: 'Spouse 2 — Pre-marriage surname' }, required: false },
      { key: 'date_of_marriage', en: 'Date of Marriage', orig: { uk: 'Дата реєстрації шлюбу', ru: 'Дата регистрации брака', es: 'Fecha de matrimonio', en: 'Date of Marriage', de: 'Heiratsdatum' }, required: true, type: 'date' },
      { key: 'place_of_marriage', en: 'Place of Marriage', orig: { uk: 'Місце реєстрації шлюбу', ru: 'Место регистрации брака', es: 'Lugar de matrimonio', en: 'Place of Marriage', de: 'Heiratsort' }, required: true, placeholder: { uk: 'м. Київ', ru: 'г. Москва', en: 'Kyiv' }, eraNote: { 'ukraine-soviet': 'Include republic: "Kyiv, Ukrainian SSR"' } },
      { key: 'document_number', en: 'Certificate Number', orig: { uk: 'Номер свідоцтва', ru: 'Номер свидетельства', es: 'Número de certificado', en: 'Certificate Number', de: 'Urkundennummer' }, required: true },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', es: 'Fecha de emisión', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Registry Office', orig: { uk: 'Орган РАЦС', ru: 'Орган ЗАГС', es: 'Registro Civil', en: 'Registry Office', de: 'Standesamt' }, required: true, placeholder: { uk: 'Печерський РАЦС м. Київ', ru: 'Чертановский ЗАГС г. Москва', en: 'Civil Registry, Kyiv' } },
    ],
  },

  // ── 5. Divorce Certificate ───────────────────────────────────────────────────
  {
    id: 'divorce_cert', prodId: 'divorce-certificate', group: 'personal', popular: false,
    label: { uk: 'Свідоцтво про розлучення', ru: 'Свидетельство о расторжении брака', en: 'Divorce Certificate', es: 'Acta de divorcio', pl: 'Akt rozwodowy', de: 'Scheidungsurkunde', fr: 'Acte de divorce', ko: '이혼증명서', zh: '离婚证' },
    color: 'linear-gradient(150deg,#7c3aed 0%,#a78bfa 100%)',
    icon: ICON_DOC,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_UKRAINE_SOVIET, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'spouse1_name', en: 'Former Spouse 1 — Full Name', orig: { uk: 'Колишній(я) чоловік/дружина (1)', ru: 'Бывший(ая) муж/жена (1)', en: 'Former Spouse 1', de: 'Ex-Ehegatte 1' }, required: true },
      { key: 'spouse2_name', en: 'Former Spouse 2 — Full Name', orig: { uk: 'Колишній(я) чоловік/дружина (2)', ru: 'Бывший(ая) муж/жена (2)', en: 'Former Spouse 2', de: 'Ex-Ehegatte 2' }, required: true },
      { key: 'date_of_divorce', en: 'Date of Divorce', orig: { uk: 'Дата розлучення', ru: 'Дата расторжения брака', es: 'Fecha de divorcio', en: 'Date of Divorce', de: 'Scheidungsdatum' }, required: true, type: 'date' },
      { key: 'place_of_divorce', en: 'Place / Court', orig: { uk: 'Місце / Суд', ru: 'Место / Суд', es: 'Lugar / Tribunal', en: 'Place / Court', de: 'Ort / Gericht' }, required: true },
      { key: 'document_number', en: 'Certificate / Decision Number', orig: { uk: 'Номер свідоцтва', ru: 'Номер свидетельства', en: 'Certificate Number', de: 'Urkundennummer' }, required: true },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority / Court', orig: { uk: 'Орган / Суд', ru: 'Орган / Суд', en: 'Issuing Authority / Court', de: 'Ausstellende Behörde / Gericht' }, required: true },
    ],
  },

  // ── 6. Death Certificate ─────────────────────────────────────────────────────
  {
    id: 'death_cert', prodId: 'death-certificate', group: 'personal', popular: false,
    label: { uk: 'Свідоцтво про смерть', ru: 'Свидетельство о смерти', en: 'Death Certificate', es: 'Acta de defunción', pl: 'Akt zgonu', de: 'Sterbeurkunde', fr: 'Acte de décès', ko: '사망증명서', zh: '死亡证明' },
    color: 'linear-gradient(150deg,#374151 0%,#6b7280 100%)',
    icon: ICON_DOC,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_UKRAINE_SOVIET, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'full_name', en: "Deceased's Full Name", orig: { uk: 'Прізвище та ім\'я померлого/ої', ru: 'ФИО умершего/умершей', en: "Deceased's Full Name", de: 'Name des Verstorbenen' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', de: 'Geburtsdatum' }, required: false, type: 'date' },
      { key: 'date_of_death', en: 'Date of Death', orig: { uk: 'Дата смерті', ru: 'Дата смерти', es: 'Fecha de fallecimiento', en: 'Date of Death', de: 'Sterbedatum' }, required: true, type: 'date' },
      { key: 'place_of_death', en: 'Place of Death', orig: { uk: 'Місце смерті', ru: 'Место смерти', en: 'Place of Death', de: 'Sterbeort' }, required: true },
      { key: 'cause_of_death', en: 'Cause of Death (if shown)', orig: { uk: 'Причина смерті (якщо вказана)', ru: 'Причина смерти (если указана)', en: 'Cause of Death (if shown)' }, required: false },
      { key: 'document_number', en: 'Certificate Number', orig: { uk: 'Номер свідоцтва', ru: 'Номер свидетельства', en: 'Certificate Number', de: 'Urkundennummer' }, required: true },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Registry Office', orig: { uk: 'Орган РАЦС', ru: 'Орган ЗАГС', en: 'Registry Office', de: 'Standesamt' }, required: true },
    ],
  },

  // ── 7. Diploma / Transcript ──────────────────────────────────────────────────
  {
    id: 'diploma', prodId: 'diploma-transcript', group: 'academic', popular: true,
    label: { uk: 'Диплом / Академічна довідка', ru: 'Диплом / Академическая справка', en: 'Diploma / Academic Transcript', es: 'Título / Expediente académico', pl: 'Dyplom / Transkrypt', de: 'Diplom / Zeugnis', fr: 'Diplôme / Relevé de notes', ko: '졸업장/성적증명서', zh: '文凭/成绩单' },
    color: 'linear-gradient(150deg,#1e3a5f 0%,#60a5fa 100%)',
    icon: ICON_DIPLOMA,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_UKRAINE_SOVIET, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'full_name', en: "Graduate's Full Name", orig: { uk: 'Повне ім\'я випускника/ці', ru: 'ФИО выпускника/выпускницы', en: "Graduate's Full Name", de: 'Name des Absolventen' }, required: true },
      { key: 'degree_title', en: 'Degree / Qualification Title', orig: { uk: 'Назва ступеня / кваліфікації', ru: 'Наименование степени / квалификации', en: 'Degree / Qualification', de: 'Abschlussbezeichnung' }, required: true, placeholder: { uk: 'Бакалавр / Спеціаліст / Магістр', ru: 'Бакалавр / Специалист / Магистр', en: 'Bachelor of Science / Master' } },
      { key: 'field_of_study', en: 'Field of Study / Specialisation', orig: { uk: 'Спеціальність / Напрям підготовки', ru: 'Специальность / Направление подготовки', en: 'Field of Study', de: 'Studiengang / Fachrichtung' }, required: true, placeholder: { uk: 'Інформаційні технології', ru: 'Информационные технологии', en: 'Computer Science' } },
      { key: 'institution', en: 'Name of Institution', orig: { uk: 'Назва навчального закладу', ru: 'Наименование учебного заведения', en: 'Institution', de: 'Name der Bildungseinrichtung' }, required: true, placeholder: { uk: 'Київський національний університет', ru: 'Московский государственный университет', en: 'National University of Kyiv' } },
      { key: 'graduation_date', en: 'Date of Graduation / Award', orig: { uk: 'Дата закінчення / видачі', ru: 'Дата окончания / выдачи', en: 'Date of Graduation', de: 'Abschlussdatum' }, required: true, type: 'date' },
      { key: 'document_number', en: 'Diploma / Certificate Number', orig: { uk: 'Номер диплома', ru: 'Номер диплома', en: 'Diploma Number', de: 'Diplomnummer' }, required: true, placeholder: { uk: 'КВ №123456', ru: 'КВ №123456' } },
      { key: 'issuing_authority', en: 'Issuing Authority / Rector', orig: { uk: 'Орган видачі / Ректор', ru: 'Орган выдачи / Ректор', en: 'Issuing Authority', de: 'Ausstellende Behörde' }, required: false },
    ],
  },

  // ── 8. School Record / Transcript ───────────────────────────────────────────
  {
    id: 'school_record', prodId: 'school-record', group: 'academic', popular: false,
    label: { uk: 'Атестат / Шкільна довідка', ru: 'Аттестат / Школьная справка', en: 'School Certificate / Transcript', es: 'Certificado escolar', pl: 'Świadectwo szkolne', de: 'Schulzeugnis', ko: '학교성적증명서', zh: '学校成绩证明' },
    color: 'linear-gradient(150deg,#1e3a5f 0%,#93c5fd 100%)',
    icon: ICON_DIPLOMA,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_UKRAINE_SOVIET, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'full_name', en: "Student's Full Name", orig: { uk: 'Повне ім\'я учня/учениці', ru: 'ФИО учащегося/учащейся', en: "Student's Full Name", de: 'Name des Schülers' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', de: 'Geburtsdatum' }, required: false, type: 'date' },
      { key: 'school_name', en: 'School Name', orig: { uk: 'Назва школи', ru: 'Наименование школы', en: 'School Name', de: 'Schulname' }, required: true, placeholder: { uk: 'Загальноосвітня школа №5, м. Київ', ru: 'Общеобразовательная школа №5, г. Москва', en: 'School No.5, Kyiv' } },
      { key: 'graduation_year', en: 'Year of Graduation', orig: { uk: 'Рік закінчення', ru: 'Год окончания', en: 'Year of Graduation', de: 'Abschlussjahr' }, required: true, placeholder: { uk: '2005', ru: '2005', en: '2005' } },
      { key: 'document_number', en: 'Certificate / Document Number', orig: { uk: 'Номер атестата', ru: 'Номер аттестата', en: 'Certificate Number', de: 'Zeugnisnummer' }, required: true },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority / School Director', orig: { uk: 'Директор / Орган видачі', ru: 'Директор / Орган выдачи', en: 'Issuing Authority', de: 'Schulleitung' }, required: false },
    ],
  },

  // ── 9. Driver's License ──────────────────────────────────────────────────────
  {
    id: 'driving_license', prodId: 'driver-license', group: 'personal', popular: true,
    label: { uk: 'Водійське посвідчення', ru: 'Водительское удостоверение', en: "Driver's License", es: 'Permiso de conducir', pl: 'Prawo jazdy', de: 'Führerschein', fr: 'Permis de conduire', ko: '운전면허증', zh: '驾驶证' },
    color: 'linear-gradient(150deg,#065f46 0%,#34d399 100%)',
    icon: ICON_ID,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'last_name', en: 'Last Name', orig: { uk: 'Прізвище', ru: 'Фамилия', en: 'Last Name', es: 'Apellido', de: 'Nachname', pl: 'Nazwisko' }, required: true },
      { key: 'given_names', en: 'Given Names', orig: { uk: "Ім'я та по батькові", ru: 'Имя и отчество', en: 'Given Names', es: 'Nombres', de: 'Vornamen' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', de: 'Geburtsdatum' }, required: true, type: 'date' },
      { key: 'address', en: 'Address on Document', orig: { uk: 'Адреса реєстрації', ru: 'Адрес регистрации', en: 'Address on Document', de: 'Anschrift auf Dokument' }, required: false },
      { key: 'document_number', en: 'License Number', orig: { uk: 'Номер посвідчення', ru: 'Номер удостоверения', es: 'Número de licencia', en: 'License Number', de: 'Führerscheinnummer' }, required: true },
      { key: 'categories', en: 'License Categories', orig: { uk: 'Категорії', ru: 'Категории', en: 'Categories', de: 'Klassen' }, required: false, placeholder: { uk: 'A, B', ru: 'A, B', en: 'A, B' } },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'expiry_date', en: 'Date of Expiry', orig: { uk: 'Дійсний до', ru: 'Действителен до', en: 'Date of Expiry', de: 'Gültig bis' }, required: false, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority', orig: { uk: 'Орган видачі', ru: 'Орган выдачи', en: 'Issuing Authority', de: 'Ausstellende Behörde' }, required: true },
    ],
  },

  // ── 10. Military Document ────────────────────────────────────────────────────
  {
    id: 'military_id', prodId: 'military-document', group: 'personal', popular: false,
    label: { uk: 'Військовий квиток / Документ', ru: 'Военный билет / Документ', en: 'Military Document', es: 'Documento militar', pl: 'Dokument wojskowy', de: 'Wehrpass / Militärdokument', ko: '군사 서류', zh: '军事文件' },
    color: 'linear-gradient(150deg,#14532d 0%,#4ade80 100%)',
    icon: ICON_DOC,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA],
    fields: [
      { key: 'full_name', en: "Service Member's Full Name", orig: { uk: 'Повне ім\'я військовослужбовця', ru: 'ФИО военнослужащего', en: "Service Member's Full Name", de: 'Name des Soldaten' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth' }, required: false, type: 'date' },
      { key: 'rank', en: 'Rank / Grade', orig: { uk: 'Військове звання', ru: 'Воинское звание', en: 'Rank / Grade', de: 'Dienstgrad' }, required: false },
      { key: 'service_branch', en: 'Branch of Service', orig: { uk: 'Рід військ / Підрозділ', ru: 'Род войск / Подразделение', en: 'Branch / Unit', de: 'Truppengattung' }, required: false },
      { key: 'document_number', en: 'Document / Military ID Number', orig: { uk: 'Номер документа', ru: 'Номер документа', en: 'Document Number', de: 'Dokumentnummer' }, required: true },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority', orig: { uk: 'Орган видачі', ru: 'Орган выдачи', en: 'Issuing Authority' }, required: true },
    ],
  },

  // ── 11. Medical Record / Certificate ────────────────────────────────────────
  {
    id: 'medical_record', prodId: 'medical-record', group: 'medical', popular: false,
    label: { uk: 'Медична довідка / Документ', ru: 'Медицинская справка / Документ', en: 'Medical Record / Certificate', es: 'Certificado médico', pl: 'Zaświadczenie lekarskie', de: 'Attest / Medizinischer Bericht', ko: '진단서', zh: '医疗记录' },
    color: 'linear-gradient(150deg,#7c3aed 0%,#c4b5fd 100%)',
    icon: ICON_MEDICAL,
    fields: [
      { key: 'full_name', en: "Patient's Full Name", orig: { uk: 'Повне ім\'я пацієнта/пацієнтки', ru: 'ФИО пациента/пациентки', en: "Patient's Full Name", de: 'Name des Patienten' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', de: 'Geburtsdatum' }, required: true, type: 'date' },
      { key: 'diagnosis', en: 'Diagnosis / Medical Condition (if shown)', orig: { uk: 'Діагноз / Стан здоров\'я (якщо вказано)', ru: 'Диагноз / Состояние здоровья (если указано)', en: 'Diagnosis / Condition', de: 'Diagnose / Zustand' }, required: false },
      { key: 'treatment_dates', en: 'Treatment Period', orig: { uk: 'Термін лікування', ru: 'Период лечения', en: 'Treatment Period', de: 'Behandlungszeitraum' }, required: false },
      { key: 'attending_physician', en: 'Attending Physician / Doctor', orig: { uk: 'Лікуючий лікар', ru: 'Лечащий врач', en: 'Attending Physician', de: 'Behandelnder Arzt' }, required: false },
      { key: 'document_number', en: 'Record / Reference Number', orig: { uk: 'Номер документа', ru: 'Номер документа', en: 'Record Number', de: 'Dokumentnummer' }, required: false },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Medical Institution', orig: { uk: 'Медичний заклад', ru: 'Медицинское учреждение', en: 'Medical Institution', de: 'Medizinische Einrichtung' }, required: true },
    ],
  },

  // ── 12. Vaccination Record ───────────────────────────────────────────────────
  {
    id: 'vaccination_record', prodId: 'vaccination-record', group: 'medical', popular: false,
    label: { uk: 'Щеплення / Медична форма', ru: 'Прививки / Медицинская форма', en: 'Vaccination Record / Medical Form', es: 'Registro de vacunas', pl: 'Karta szczepień', de: 'Impfpass / Impfbescheinigung', ko: '예방접종 기록', zh: '疫苗接种记录' },
    color: 'linear-gradient(150deg,#0f766e 0%,#2dd4bf 100%)',
    icon: ICON_MEDICAL,
    fields: [
      { key: 'full_name', en: "Patient's Full Name", orig: { uk: 'Повне ім\'я пацієнта', ru: 'ФИО пациента', en: "Patient's Full Name", de: 'Name des Patienten' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', de: 'Geburtsdatum' }, required: true, type: 'date' },
      { key: 'vaccine_name', en: 'Vaccine Name', orig: { uk: 'Назва вакцини', ru: 'Наименование вакцины', en: 'Vaccine Name', de: 'Impfstoffbezeichnung' }, required: true, placeholder: { uk: 'COVID-19 / ДПТ / MMR', ru: 'COVID-19 / АКДС / MMR', en: 'COVID-19 / DTP / MMR' } },
      { key: 'vaccination_date', en: 'Date(s) of Vaccination', orig: { uk: 'Дата(и) щеплення', ru: 'Дата(ы) вакцинации', en: 'Date(s) of Vaccination', de: 'Impfdatum' }, required: true, type: 'date' },
      { key: 'lot_number', en: 'Lot / Batch Number (if shown)', orig: { uk: 'Номер серії (якщо вказаний)', ru: 'Номер серии (если указан)', en: 'Lot Number', de: 'Chargennummer' }, required: false },
      { key: 'document_number', en: 'Document / Form Number', orig: { uk: 'Номер документа', ru: 'Номер документа', en: 'Document Number', de: 'Dokumentnummer' }, required: false },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: false, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Medical Institution', orig: { uk: 'Медичний заклад', ru: 'Медицинское учреждение', en: 'Issuing Institution', de: 'Medizinische Einrichtung' }, required: true },
    ],
  },

  // ── 13. Police / Criminal Record ─────────────────────────────────────────────
  {
    id: 'police_record', prodId: 'police-record', group: 'legal', popular: false,
    label: { uk: 'Довідка про несудимість / ПКР', ru: 'Справка о несудимости / ПКС', en: 'Police Clearance / Criminal Record', es: 'Certificado de antecedentes penales', pl: 'Zaświadczenie o niekaralności', de: 'Führungszeugnis', ko: '범죄기록 증명서', zh: '无犯罪记录证明' },
    color: 'linear-gradient(150deg,#1f2937 0%,#6b7280 100%)',
    icon: ICON_DOC,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'full_name', en: 'Full Legal Name', orig: { uk: 'Повне ім\'я', ru: 'ФИО', en: 'Full Legal Name', de: 'Vollständiger Name' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', de: 'Geburtsdatum' }, required: true, type: 'date' },
      { key: 'place_of_birth', en: 'Place of Birth', orig: { uk: 'Місце народження', ru: 'Место рождения', en: 'Place of Birth', de: 'Geburtsort' }, required: false },
      { key: 'record_type', en: 'Record Type / Result', orig: { uk: 'Тип документа / Результат', ru: 'Тип документа / Результат', en: 'Record Type / Result', de: 'Dokumentart / Ergebnis' }, required: true, placeholder: { uk: 'Не судимий(а) / No criminal record', ru: 'Не судим(а) / No criminal record', en: 'No criminal record' } },
      { key: 'document_number', en: 'Reference / Document Number', orig: { uk: 'Номер довідки', ru: 'Номер справки', en: 'Document Number', de: 'Dokumentnummer' }, required: false },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'valid_until', en: 'Valid Until (if shown)', orig: { uk: 'Дійсна до', ru: 'Действительна до', en: 'Valid Until', de: 'Gültig bis' }, required: false, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority', orig: { uk: 'Орган видачі (МВС, поліція)', ru: 'Орган выдачи (МВД, полиция)', en: 'Issuing Authority (Police / Ministry)', de: 'Ausstellende Behörde (Polizei / Ministerium)' }, required: true },
    ],
  },

  // ── 14. Court Order / Judgment ───────────────────────────────────────────────
  {
    id: 'court_order', prodId: 'court-order', group: 'legal', popular: false,
    label: { uk: 'Судове рішення / Ухвала', ru: 'Судебное решение / Определение', en: 'Court Order / Judgment', es: 'Orden judicial / Sentencia', pl: 'Postanowienie sądu', de: 'Gerichtsbeschluss / Urteil', ko: '법원 명령', zh: '法院命令' },
    color: 'linear-gradient(150deg,#7c2d12 0%,#fb923c 100%)',
    icon: ICON_COURT,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'case_number', en: 'Case / Docket Number', orig: { uk: 'Номер справи', ru: 'Номер дела', en: 'Case Number', de: 'Aktenzeichen' }, required: true, placeholder: { uk: '№ 2-1234/2023', ru: '№ 2-1234/2023', en: '2-1234/2023' } },
      { key: 'court_name', en: 'Court Name', orig: { uk: 'Назва суду', ru: 'Наименование суда', en: 'Court Name', de: 'Gerichtsbezeichnung' }, required: true, placeholder: { uk: 'Печерський районний суд м. Київ', ru: 'Замоскворецкий районный суд г. Москва', en: 'District Court of Kyiv, Pecherskyi' } },
      { key: 'judge_name', en: 'Judge Name (if shown)', orig: { uk: 'Прізвище судді (якщо вказано)', ru: 'ФИО судьи (если указано)', en: 'Judge Name (if shown)', de: 'Name des Richters' }, required: false },
      { key: 'parties', en: 'Parties Involved', orig: { uk: 'Сторони у справі', ru: 'Стороны по делу', en: 'Parties Involved', de: 'Beteiligte Parteien' }, required: true, placeholder: { uk: 'Позивач: ... Відповідач: ...', ru: 'Истец: ... Ответчик: ...', en: 'Plaintiff: ... Defendant: ...' } },
      { key: 'order_summary', en: 'Order / Ruling Summary', orig: { uk: 'Резолютивна частина', ru: 'Резолютивная часть', en: 'Order / Ruling', de: 'Tenor / Entscheidung' }, required: true },
      { key: 'decision_date', en: 'Date of Decision', orig: { uk: 'Дата рішення', ru: 'Дата решения', en: 'Date of Decision', de: 'Entscheidungsdatum' }, required: true, type: 'date' },
      { key: 'document_number', en: 'Document / Order Number', orig: { uk: 'Номер документа', ru: 'Номер документа', en: 'Document Number', de: 'Dokumentnummer' }, required: false },
    ],
  },

  // ── 15. Power of Attorney ────────────────────────────────────────────────────
  {
    id: 'power_of_attorney', prodId: 'power-of-attorney', group: 'legal', popular: false,
    label: { uk: 'Довіреність', ru: 'Доверенность', en: 'Power of Attorney', es: 'Poder notarial', pl: 'Pełnomocnictwo', de: 'Vollmacht', fr: 'Procuration', ko: '위임장', zh: '授权委托书' },
    color: 'linear-gradient(150deg,#312e81 0%,#818cf8 100%)',
    icon: ICON_DOC,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'grantor_name', en: 'Grantor (Principal) — Full Name', orig: { uk: 'Довіритель — повне ім\'я', ru: 'Доверитель — ФИО', en: 'Grantor — Full Name', de: 'Vollmachtgeber — vollständiger Name' }, required: true },
      { key: 'grantor_dob', en: 'Grantor — Date of Birth', orig: { uk: 'Дата народження довірителя', ru: 'Дата рождения доверителя', en: 'Grantor — Date of Birth', de: 'Geburtsdatum des Vollmachtgebers' }, required: false, type: 'date' },
      { key: 'grantee_name', en: 'Grantee (Attorney-in-Fact) — Full Name', orig: { uk: 'Уповноважений — повне ім\'я', ru: 'Поверенный — ФИО', en: 'Grantee — Full Name', de: 'Bevollmächtigter — vollständiger Name' }, required: true },
      { key: 'powers_granted', en: 'Powers Granted / Scope', orig: { uk: 'Обсяг повноважень', ru: 'Объем полномочий', en: 'Powers Granted', de: 'Erteilte Vollmacht / Umfang' }, required: true },
      { key: 'effective_date', en: 'Effective Date', orig: { uk: 'Дата оформлення', ru: 'Дата оформления', en: 'Effective Date', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'expiry_date', en: 'Expiry Date (if stated)', orig: { uk: 'Строк дії (якщо вказано)', ru: 'Срок действия (если указан)', en: 'Expiry Date', de: 'Ablaufdatum' }, required: false, type: 'date' },
      { key: 'document_number', en: 'Notary / Document Number', orig: { uk: 'Реєстровий номер нотаріуса', ru: 'Реестровый номер нотариуса', en: 'Notary / Document Number', de: 'Notarregister / Dokumentnummer' }, required: true },
      { key: 'issuing_authority', en: 'Notary / Issuing Authority', orig: { uk: 'Нотаріус / Орган видачі', ru: 'Нотариус / Орган выдачи', en: 'Notary / Issuing Authority', de: 'Notar / Ausstellende Behörde' }, required: true },
    ],
  },

  // ── 16. Bank Statement / Financial Document ──────────────────────────────────
  {
    id: 'bank_statement', prodId: 'bank-statement', group: 'financial', popular: false,
    label: { uk: 'Банківська виписка / Фінансовий документ', ru: 'Банковская выписка / Финансовый документ', en: 'Bank Statement / Financial Document', es: 'Extracto bancario', pl: 'Wyciąg bankowy', de: 'Kontoauszug / Finanzdokument', ko: '은행 명세서', zh: '银行账单' },
    color: 'linear-gradient(150deg,#166534 0%,#4ade80 100%)',
    icon: ICON_BANK,
    fields: [
      { key: 'account_holder', en: 'Account Holder Name', orig: { uk: 'Ім\'я власника рахунку', ru: 'ФИО владельца счёта', en: 'Account Holder', de: 'Name des Kontoinhabers' }, required: true },
      { key: 'bank_name', en: 'Bank Name', orig: { uk: 'Назва банку', ru: 'Наименование банка', en: 'Bank Name', de: 'Bankname' }, required: true },
      { key: 'account_number', en: 'Account Number (last 4 digits only)', orig: { uk: 'Номер рахунку (останні 4 цифри)', ru: 'Номер счёта (последние 4 цифры)', en: 'Account Number (last 4)', de: 'Kontonummer (letzte 4 Ziffern)' }, required: false, helpExample: { en: 'Do not enter full account number — last 4 digits only for privacy', uk: 'Не вводьте повний номер рахунку' } },
      { key: 'statement_period', en: 'Statement Period', orig: { uk: 'Період виписки', ru: 'Период выписки', en: 'Statement Period', de: 'Auszugszeitraum' }, required: true, placeholder: { uk: '01.01.2024 – 31.03.2024', ru: '01.01.2024 – 31.03.2024', en: '01/01/2024 – 03/31/2024' } },
      { key: 'opening_balance', en: 'Opening Balance (if shown)', orig: { uk: 'Початковий залишок', ru: 'Начальный остаток', en: 'Opening Balance', de: 'Anfangsbestand' }, required: false },
      { key: 'closing_balance', en: 'Closing Balance (if shown)', orig: { uk: 'Кінцевий залишок', ru: 'Конечный остаток', en: 'Closing Balance', de: 'Endbestand' }, required: false },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Branch / Bank Authority', orig: { uk: 'Відділення банку', ru: 'Отделение банка', en: 'Issuing Bank Branch', de: 'Ausstellende Bankfiliale' }, required: false },
    ],
  },

  // ── 17. Property Document ────────────────────────────────────────────────────
  {
    id: 'property_doc', prodId: 'property-document', group: 'legal', popular: false,
    label: { uk: 'Документ на нерухомість', ru: 'Документ на недвижимость', en: 'Property Document', es: 'Documento de propiedad', pl: 'Dokument własności', de: 'Eigentumsnachweis', ko: '부동산 서류', zh: '房产证明' },
    color: 'linear-gradient(150deg,#78350f 0%,#fbbf24 100%)',
    icon: ICON_DOC,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'owner_name', en: 'Property Owner — Full Name', orig: { uk: 'Власник — повне ім\'я', ru: 'Владелец — ФИО', en: 'Owner — Full Name', de: 'Eigentümer — vollständiger Name' }, required: true },
      { key: 'property_address', en: 'Property Address', orig: { uk: 'Адреса нерухомості', ru: 'Адрес недвижимости', en: 'Property Address', de: 'Immobilienadresse' }, required: true },
      { key: 'property_description', en: 'Property Description (type, area)', orig: { uk: 'Характеристика (тип, площа)', ru: 'Характеристика (тип, площадь)', en: 'Property Description', de: 'Objektbeschreibung' }, required: false, placeholder: { uk: 'Квартира, 65 м²', ru: 'Квартира, 65 кв.м.', en: 'Apartment, 65 sq m' } },
      { key: 'document_type_label', en: 'Document Type', orig: { uk: 'Тип документа', ru: 'Тип документа', en: 'Document Type', de: 'Dokumentart' }, required: true, placeholder: { uk: 'Свідоцтво про право власності / Витяг', ru: 'Свидетельство о праве собственности / Выписка', en: 'Title Deed / Certificate of Ownership' } },
      { key: 'document_number', en: 'Document / Registration Number', orig: { uk: 'Реєстраційний номер', ru: 'Регистрационный номер', en: 'Registration Number', de: 'Registrierungsnummer' }, required: true },
      { key: 'registration_date', en: 'Date of Registration', orig: { uk: 'Дата реєстрації', ru: 'Дата регистрации', en: 'Date of Registration', de: 'Registrierungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority / Registry', orig: { uk: 'Реєстраційна служба / Нотаріус', ru: 'Регистрационная служба / Нотариус', en: 'Registry / Notary', de: 'Registrierungsbehörde / Notar' }, required: true },
    ],
  },

  // ── 18. Employment Record ────────────────────────────────────────────────────
  {
    id: 'employment_record', prodId: 'employment-record', group: 'legal', popular: false,
    label: { uk: 'Трудова книжка / Довідка з роботи', ru: 'Трудовая книжка / Справка с работы', en: 'Employment Record / Work Certificate', es: 'Historial laboral', pl: 'Świadectwo pracy', de: 'Arbeitsbescheinigung / Arbeitsbuch', ko: '고용 기록', zh: '劳动合同/就业证明' },
    color: 'linear-gradient(150deg,#1e3a5f 0%,#38bdf8 100%)',
    icon: ICON_DOC,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_UKRAINE_SOVIET, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'full_name', en: "Employee's Full Name", orig: { uk: 'Повне ім\'я працівника/ці', ru: 'ФИО работника/работницы', en: "Employee's Full Name", de: 'Name des Arbeitnehmers' }, required: true },
      { key: 'date_of_birth', en: 'Date of Birth', orig: { uk: 'Дата народження', ru: 'Дата рождения', en: 'Date of Birth', de: 'Geburtsdatum' }, required: false, type: 'date' },
      { key: 'employer_name', en: 'Employer / Organization Name', orig: { uk: 'Роботодавець / Організація', ru: 'Работодатель / Организация', en: 'Employer / Organization', de: 'Arbeitgeber / Organisation' }, required: true },
      { key: 'position', en: 'Position / Job Title', orig: { uk: 'Посада / Назва роботи', ru: 'Должность / Наименование работы', en: 'Position / Job Title', de: 'Stelle / Berufsbezeichnung' }, required: true },
      { key: 'employment_start', en: 'Employment Start Date', orig: { uk: 'Дата початку роботи', ru: 'Дата начала работы', en: 'Start Date', de: 'Beschäftigungsbeginn' }, required: true, type: 'date' },
      { key: 'employment_end', en: 'Employment End Date (or "Present")', orig: { uk: 'Дата закінчення (або "по теперішній час")', ru: 'Дата окончания (или «по настоящее время»)', en: 'End Date (or "Present")', de: 'Beschäftigungsende (oder "aktuell")' }, required: false },
      { key: 'document_number', en: 'Record / Reference Number', orig: { uk: 'Номер довідки', ru: 'Номер справки', en: 'Reference Number', de: 'Referenznummer' }, required: false },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority (HR / Employer)', orig: { uk: 'Відділ кадрів / Керівник', ru: 'Отдел кадров / Руководитель', en: 'HR / Employer', de: 'Personalabteilung / Arbeitgeber' }, required: true },
    ],
  },

  // ── 19. Adoption Certificate ─────────────────────────────────────────────────
  {
    id: 'adoption_cert', prodId: 'adoption-certificate', group: 'personal', popular: false,
    label: { uk: 'Свідоцтво про усиновлення', ru: 'Свидетельство об усыновлении', en: 'Adoption Certificate', es: 'Certificado de adopción', pl: 'Zaświadczenie o adopcji', de: 'Adoptionsurkunde', ko: '입양증명서', zh: '收养证书' },
    color: 'linear-gradient(150deg,#7c3aed 0%,#c084fc 100%)',
    icon: ICON_BIRTH,
    eraVariants: [ERA_UKRAINE_MODERN, ERA_RUSSIA_MODERN, ERA_USA, ERA_EU],
    fields: [
      { key: 'child_name', en: "Child's Full Name (after adoption)", orig: { uk: 'Ім\'я дитини (після усиновлення)', ru: 'ФИО ребёнка (после усыновления)', en: "Child's Name (after adoption)", de: 'Name des Kindes (nach Adoption)' }, required: true },
      { key: 'child_birth_name', en: "Child's Birth Name (before adoption, if different)", orig: { uk: 'Ім\'я до усиновлення (якщо відрізняється)', ru: 'ФИО до усыновления (если отличается)', en: "Child's Birth Name", de: 'Name des Kindes vor der Adoption' }, required: false },
      { key: 'date_of_birth', en: "Child's Date of Birth", orig: { uk: 'Дата народження дитини', ru: 'Дата рождения ребёнка', en: 'Date of Birth', de: 'Geburtsdatum des Kindes' }, required: true, type: 'date' },
      { key: 'place_of_birth', en: "Child's Place of Birth", orig: { uk: 'Місце народження дитини', ru: 'Место рождения ребёнка', en: 'Place of Birth', de: 'Geburtsort des Kindes' }, required: false },
      { key: 'adoptive_parent1', en: 'Adoptive Parent 1 — Full Name', orig: { uk: 'Усиновитель 1 — повне ім\'я', ru: 'Усыновитель 1 — ФИО', en: 'Adoptive Parent 1', de: 'Adoptivelternteil 1 — vollständiger Name' }, required: true },
      { key: 'adoptive_parent2', en: 'Adoptive Parent 2 — Full Name (if applicable)', orig: { uk: 'Усиновитель 2 (якщо є)', ru: 'Усыновитель 2 (если есть)', en: 'Adoptive Parent 2 (if applicable)', de: 'Adoptivelternteil 2 (falls vorhanden)' }, required: false },
      { key: 'date_of_adoption', en: 'Date of Adoption Decision', orig: { uk: 'Дата рішення про усиновлення', ru: 'Дата решения об усыновлении', en: 'Date of Adoption', de: 'Datum der Adoptionsentscheidung' }, required: true, type: 'date' },
      { key: 'document_number', en: 'Certificate / Court Decision Number', orig: { uk: 'Номер свідоцтва / рішення суду', ru: 'Номер свидетельства / решения суда', en: 'Certificate / Decision Number', de: 'Urkundennnummer / Entscheidungsnummer' }, required: true },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority / Court', orig: { uk: 'Орган / Суд', ru: 'Орган / Суд', en: 'Issuing Authority / Court', de: 'Ausstellende Behörde / Gericht' }, required: true },
    ],
  },

  // ── 20. Other / Generic Document ─────────────────────────────────────────────
  {
    id: 'other_doc', prodId: 'other-document', group: 'other', popular: false,
    label: { uk: 'Інший офіційний документ', ru: 'Другой официальный документ', en: 'Other Official Document', es: 'Otro documento oficial', pl: 'Inny dokument urzędowy', de: 'Sonstiges offizielles Dokument', ko: '기타 공식 문서', zh: '其他官方文件' },
    color: 'linear-gradient(150deg,#374151 0%,#9ca3af 100%)',
    icon: ICON_DOC,
    fields: [
      { key: 'full_name', en: 'Full Name of Subject', orig: { uk: 'Повне ім\'я особи', ru: 'ФИО лица', en: 'Full Name of Subject', de: 'Vollständiger Name der Person' }, required: true },
      { key: 'document_type_label', en: 'Document Title / Type', orig: { uk: 'Назва документа', ru: 'Наименование документа', en: 'Document Title', de: 'Dokumentbezeichnung' }, required: true, placeholder: { uk: 'Вкажіть точну назву документа', ru: 'Укажите точное наименование документа', en: 'Enter exact document title' } },
      { key: 'document_number', en: 'Document Number', orig: { uk: 'Номер документа', ru: 'Номер документа', en: 'Document Number', de: 'Dokumentnummer' }, required: false },
      { key: 'issue_date', en: 'Date of Issue', orig: { uk: 'Дата видачі', ru: 'Дата выдачи', en: 'Date of Issue', de: 'Ausstellungsdatum' }, required: true, type: 'date' },
      { key: 'expiry_date', en: 'Date of Expiry (if applicable)', orig: { uk: 'Термін дії (якщо є)', ru: 'Срок действия (если есть)', en: 'Date of Expiry', de: 'Ablaufdatum' }, required: false, type: 'date' },
      { key: 'issuing_authority', en: 'Issuing Authority', orig: { uk: 'Орган видачі', ru: 'Орган выдачи', en: 'Issuing Authority', de: 'Ausstellende Behörde' }, required: true },
      { key: 'additional_info', en: 'Additional Information (if shown)', orig: { uk: 'Додаткова інформація (якщо є)', ru: 'Дополнительные сведения (если есть)', en: 'Additional Information', de: 'Zusätzliche Informationen' }, required: false },
    ],
  },
]

// ─── Exports ──────────────────────────────────────────────────────────────────

export function getDoc(id: string): DocDef | undefined {
  return DOCS.find((d) => d.id === id)
}

export function getPopularDocs(): DocDef[] {
  return DOCS.filter((d) => d.popular)
}

export function getDocsByGroup(group: DocGroup): DocDef[] {
  return DOCS.filter((d) => d.group === group)
}

export const ALL_LANGS: { id: SourceLang; label: string; flag: string }[] = [
  { id: 'uk', label: 'Українська', flag: '🇺🇦' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'pl', label: 'Polski', flag: '🇵🇱' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
  { id: 'ar', label: 'العربية', flag: '🇸🇦' },
  { id: 'zh', label: '中文', flag: '🇨🇳' },
  { id: 'ko', label: '한국어', flag: '🇰🇷' },
  { id: 'pt', label: 'Português', flag: '🇧🇷' },
]
