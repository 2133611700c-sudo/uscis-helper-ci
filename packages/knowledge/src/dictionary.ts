/**
 * Ukraine Terminology Dictionary v1.3 — TypeScript module
 * Sources: mvs.gov.ua, dmsu.gov.ua, czo.gov.ua, KMU Resolution No.55
 *          MFA #CorrectUA campaign, FamilySearch Ukraine Civil Registration
 *
 * Every entity supports 3 output modes:
 *   official_en        — legal accuracy (certified translations)
 *   normalized_uscis_en — USCIS-friendly (form fills, USCIS correspondence)
 *   plain_en_alias     — human explanation only (UI tooltips, never in docs)
 */

export type OutputMode = 'legal_formal' | 'uscis_normalized' | 'plain';

export interface AuthorityEntry {
  uk: string;
  official_en: string;
  normalized_uscis_en: string;
  plain_en_alias: string;
  historical_mode?: boolean;
  do_not_use?: string[];
  valid_from?: string;
  valid_until?: string;
}

export interface GeoCorrection {
  wrong: string;
  correct: string;
  historical_preserve?: string; // keep this form for old documents
  renamed_year?: number;
}

export interface FieldLabel {
  uk: string;
  en: string;
  do_not_use?: string[];
  critical?: boolean;
}

// ── AUTHORITIES ──────────────────────────────────────────────

export const AUTHORITIES: Record<string, AuthorityEntry> = {
  MVS: {
    uk: 'Міністерство внутрішніх справ України',
    official_en: 'Ministry of Internal Affairs of Ukraine',
    normalized_uscis_en: 'Ministry of Internal Affairs of Ukraine',
    plain_en_alias: 'Ukrainian Interior Ministry',
    do_not_use: ['Ministry of Interior of Ukraine', 'Ministry of Interior Affairs'],
  },
  MFA: {
    uk: 'Міністерство закордонних справ України',
    official_en: 'Ministry of Foreign Affairs of Ukraine',
    normalized_uscis_en: 'Ministry of Foreign Affairs of Ukraine',
    plain_en_alias: 'Ukrainian Foreign Ministry',
  },
  MINJUST: {
    uk: 'Міністерство юстиції України',
    official_en: 'Ministry of Justice of Ukraine',
    normalized_uscis_en: 'Ministry of Justice of Ukraine',
    plain_en_alias: 'Ukrainian Justice Ministry',
  },
  DMS: {
    uk: 'Державна міграційна служба України',
    official_en: 'State Migration Service of Ukraine',
    normalized_uscis_en: 'State Migration Service of Ukraine',
    plain_en_alias: 'Ukrainian Migration Service',
  },
  NPU: {
    uk: 'Національна поліція України',
    official_en: 'National Police of Ukraine',
    normalized_uscis_en: 'National Police of Ukraine',
    plain_en_alias: 'Ukrainian National Police',
    valid_from: '2015-07-04',
  },
  MILITSIYA: {
    uk: 'Міліція',
    official_en: 'Militsiya',
    normalized_uscis_en: 'Militsiya',
    plain_en_alias: 'militia police (historical)',
    historical_mode: true,
    valid_until: '2015-11-07',
    do_not_use: ['Police', 'Militia', 'National Police'],
  },
  SBGSU: {
    uk: 'Державна прикордонна служба України',
    official_en: 'State Border Guard Service of Ukraine',
    normalized_uscis_en: 'State Border Guard Service of Ukraine',
    plain_en_alias: 'Ukrainian Border Guard',
  },
  CIVIL_REGISTRY: {
    // CANONICAL RESOLUTION (audit #195): the USCIS-normalized rendering is
    // "Civil Registry Office" — the value carried with REAL provenance in
    // registry/registry.csv (rows ДРАЦС/РАЦС and ЗАГС), source_url
    // https://zakon.rada.gov.ua/laws/show/1025-2010-п (КМУ №1025, 10.11.2010).
    // Previous value "Civil Registry Office (ZAHS)" was sourceless and carried a
    // transliteration typo (ZAHS≠ZAGS); the historical ЗАГS "(ZAGS)" suffix is
    // an era-gated registry concern, not the umbrella default. The competing
    // civil_registry_terms.json "Civil Status Registration Office" is a separate
    // per-abbreviation lookup table (not the brain's normalizeAuthority path).
    uk: 'ЗАГС / РАЦС / ДРАЦС',
    official_en: 'civil status registration authority',
    normalized_uscis_en: 'Civil Registry Office',
    plain_en_alias: 'civil registry',
    historical_mode: true,
  },
  DAI: {
    uk: 'Державна автомобільна інспекція',
    official_en: 'State Automobile Inspectorate',
    normalized_uscis_en: 'State Automobile Inspectorate',
    plain_en_alias: 'traffic police (historical)',
    historical_mode: true,
    do_not_use: ['Traffic Police', 'Road Police'],
  },
  // CANONICAL RESOLUTION (audit #195): УМВС/ГУМВС have NO row in
  // registry/registry.csv, so dictionary.ts is the authoritative copy (registry
  // carries no competing provenance). Kept the dictionary rendering "Regional
  // Department of MIA"; the glossaryLoader.ts fork ("Directorate / Department of
  // the MIA") was the divergence and now DELEGATES here. Source for the MIA
  // self-name on which these compound: МВС → "Ministry of Internal Affairs of
  // Ukraine" (mvs.gov.ua/en, see registry.csv row `authority,мвс`). The
  // golden-vector test asserts "Regional Department of MIA" — do not silently
  // change without updating that source-cited vector.
  UMVS: {
    uk: 'Управління МВС',
    official_en: 'Regional Department of the Ministry of Internal Affairs of Ukraine',
    normalized_uscis_en: 'Regional Department of MIA',
    plain_en_alias: 'regional MIA office',
    historical_mode: true,
  },
  GUMVS: {
    uk: 'Головне управління МВС',
    official_en: 'Main Department of the Ministry of Internal Affairs of Ukraine',
    normalized_uscis_en: 'Main Department of MIA',
    plain_en_alias: 'main MIA directorate',
    historical_mode: true,
  },

  // ── Local government / administrative bodies ────────────────
  VIKONKOM: {
    uk: 'Виконавчий комітет',
    official_en: 'Executive Committee',
    normalized_uscis_en: 'Executive Committee',
    plain_en_alias: 'city or village executive committee',
  },
  RDA: {
    uk: 'Районна державна адміністрація',
    official_en: 'District State Administration',
    normalized_uscis_en: 'District State Administration',
    plain_en_alias: 'district administration',
    do_not_use: ['District State Council', 'District Administration Office'],
  },
  ODA: {
    uk: 'Обласна державна адміністрація',
    official_en: 'Regional State Administration',
    normalized_uscis_en: 'Regional State Administration',
    plain_en_alias: 'regional administration',
    do_not_use: ['Oblast State Administration'],
  },
  SILRADA: {
    uk: 'Сільська рада',
    official_en: 'Village Council',
    normalized_uscis_en: 'Village Council',
    plain_en_alias: 'village council (silrada)',
  },
  MISKRADA: {
    uk: 'Міська рада',
    official_en: 'City Council',
    normalized_uscis_en: 'City Council',
    plain_en_alias: 'city council',
  },

  // ── Notarial / passport services ────────────────────────────
  NOTARY: {
    uk: 'Нотаріус / Державна нотаріальна контора',
    official_en: 'Notary Public',
    normalized_uscis_en: 'Notary Public',
    plain_en_alias: 'notary',
  },
  PASSPORT_OFFICE: {
    uk: 'Паспортний стіл',
    official_en: 'Passport Office',
    normalized_uscis_en: 'Passport Office',
    plain_en_alias: 'passport office (historical pre-DMS)',
    historical_mode: true,
    valid_until: '2012-01-01',
  },

  // ── Historical law enforcement ───────────────────────────────
  DILTNICHNYI: {
    uk: 'Дільничний інспектор',
    official_en: 'District Inspector',
    normalized_uscis_en: 'District Inspector',
    plain_en_alias: 'local beat officer (historical pre-2015)',
    historical_mode: true,
    valid_until: '2015-07-04',
    do_not_use: ['District Police Officer', 'Local Police Inspector'],
  },
};

// Patterns to match authority text from OCR (checked in order — put more specific first)
export const AUTHORITY_PATTERNS: [RegExp, string][] = [
  // Law enforcement (must precede generic МВС match)
  [/міліці[яії]/i, 'MILITSIYA'],
  [/дільничн.*інспект/i, 'DILTNICHNYI'],
  [/національн[аоіїє]\s*поліці/i, 'NPU'],
  [/поліці[яії]/i, 'NPU'],
  // Civil registry
  [/(загс|рацс|драцс|реєстрац.*цивільн)/i, 'CIVIL_REGISTRY'],
  // MIA hierarchy (most specific first)
  [/даі|автомобільн.*інспекці/i, 'DAI'],
  [/гумвс|головн.*управлінн.*мвс/i, 'GUMVS'],
  [/умвс|управлінн.*мвс/i, 'UMVS'],
  [/мвс|внутрішн.*справ/i, 'MVS'],
  // Migration / border
  [/міграційн.*служб/i, 'DMS'],
  [/прикордонн/i, 'SBGSU'],
  // Local government (виконком before generic рада)
  [/виконав.*комітет|виконком/i, 'VIKONKOM'],
  [/обласн.*держав.*адмін|ода\b/i, 'ODA'],
  [/районн.*держав.*адмін|рда\b/i, 'RDA'],
  [/сільськ.*рад|сільрад/i, 'SILRADA'],
  [/міськ.*рад/i, 'MISKRADA'],
  // Notarial / passport
  [/паспортний стіл|паспортн.*стол/i, 'PASSPORT_OFFICE'],
  [/нотаріальн.*контор|державн.*нотаріальн/i, 'NOTARY'],
  [/нотаріус/i, 'NOTARY'],
  // Ministries (generic, last)
  [/закордонн.*справ/i, 'MFA'],
  [/юстиці/i, 'MINJUST'],
];

// ── GEOGRAPHY CORRECTIONS ────────────────────────────────────

export const GEO_CORRECTIONS: GeoCorrection[] = [
  { wrong: 'Kiev', correct: 'Kyiv' },
  { wrong: 'Kharkov', correct: 'Kharkiv' },
  { wrong: 'Odessa', correct: 'Odesa' },
  { wrong: 'Lvov', correct: 'Lviv' },
  { wrong: 'Zaporozhye', correct: 'Zaporizhzhia' },
  { wrong: 'Vinnitsa', correct: 'Vinnytsia' },
  { wrong: 'Vinnica', correct: 'Vinnytsia' },
  { wrong: 'Zhitomir', correct: 'Zhytomyr' },
  { wrong: 'Nikolaev', correct: 'Mykolaiv' },
  { wrong: 'Chernigov', correct: 'Chernihiv' },
  { wrong: 'Lugansk', correct: 'Luhansk' },
  { wrong: 'Ustinovka', correct: 'Ustynivka' },
  // Renamed cities — preserve historical form for old documents
  { wrong: 'Dnepropetrovsk', correct: 'Dnipro', historical_preserve: 'Dnipropetrovsk', renamed_year: 2016 },
  { wrong: 'Kirovograd', correct: 'Kropyvnytskyi', historical_preserve: 'Kirovohrad', renamed_year: 2016 },
];

// ── SETTLEMENT TYPES ─────────────────────────────────────────

export const SETTLEMENT_TYPES: Record<string, { en: string; warning?: string }> = {
  // Cities
  'м.': { en: 'city' },
  'м': { en: 'city' },
  'місто': { en: 'city' },

  // Urban-type settlements (phased out Jan 24, 2024 — but still on old documents)
  'смт': { en: 'urban-type settlement', warning: 'NEVER translate as city or town. Official category abolished Jan 2024 but appears on pre-2024 documents.' },
  'смт.': { en: 'urban-type settlement', warning: 'NEVER translate as city or town' },
  'селище міського типу': { en: 'urban-type settlement', warning: 'NEVER translate as city or town' },
  'п.г.т.': { en: 'urban-type settlement', warning: 'Russian abbreviation (посёлок городского типа)' },
  'пгт': { en: 'urban-type settlement', warning: 'Russian abbreviation' },

  // Villages and settlements
  'с.': { en: 'village' },
  'село': { en: 'village' },
  'с-ще': { en: 'settlement' },
  'селище': { en: 'settlement' },
  'хут.': { en: 'hamlet' },
  'хутір': { en: 'hamlet' },

  // Administrative divisions
  'р-н': { en: 'district' },
  'район': { en: 'district' },
  'обл.': { en: 'Oblast' },
  'область': { en: 'Oblast' },
  'окр.': { en: 'district' },
  'округ': { en: 'district' },
  'громада': { en: 'hromada', warning: 'Post-2020 decentralization administrative unit' },
};

// ── FIELD LABELS ─────────────────────────────────────────────

export const FIELD_LABELS: Record<string, FieldLabel> = {
  surname: { uk: 'Прізвище', en: 'Surname' },
  given_name: { uk: "Ім'я", en: 'Given Name' },
  patronymic: {
    uk: 'По батькові',
    en: 'Patronymic',
    do_not_use: ['Middle Name'],
    critical: true,
  },
  date_of_birth: { uk: 'Дата народження', en: 'Date of Birth' },
  place_of_birth: { uk: 'Місце народження', en: 'Place of Birth' },
  sex: { uk: 'Стать', en: 'Sex' },
  citizenship: { uk: 'Громадянство', en: 'Citizenship' },
  issuing_authority: { uk: 'Орган, що видав', en: 'Issuing Authority' },
  date_of_issue: { uk: 'Дата видачі', en: 'Date of Issue' },
  date_of_expiry: { uk: 'Дійсний до', en: 'Date of Expiry' },
  series: { uk: 'Серія', en: 'Series' },
  number: { uk: 'Номер', en: 'Number' },
};

// ── SEX MAPPING ──────────────────────────────────────────────

export const SEX_MAP: Record<string, string> = {
  'Ч': 'Male', 'ч': 'Male', 'чоловіча': 'Male', 'чол': 'Male', 'чоловік': 'Male',
  'М': 'Male', 'м': 'Male', 'мужской': 'Male', 'муж': 'Male',
  'Ж': 'Female', 'ж': 'Female', 'жіноча': 'Female', 'жін': 'Female', 'жінка': 'Female',
  'F': 'Female', 'f': 'Female', 'женский': 'Female', 'жен': 'Female',
  // Latin MRZ / passport-page forms
  'M': 'Male', 'm': 'Male', 'male': 'Male', 'Male': 'Male', 'female': 'Female', 'Female': 'Female',
};

// ── CIVIL / MARITAL STATUS ───────────────────────────────────
// CANONICAL (audit #195): single source for civil-status renderings. Was forked
// in apps/web/.../glossaryLoader.ts `marital_status`; that loader now delegates
// here. Keys are the Ukrainian (and common Russian) forms as printed on
// passports/certificates; value is the USCIS-friendly English with the sex the
// gendered Ukrainian word encodes. Source: standard Ukrainian civil-status
// vocabulary (Сімейний стан field, ДМС internal passport / КМУ №1025 acts).
export const CIVIL_STATUS: Record<string, string> = {
  'одружений': 'married (male)',
  'одружена': 'married (female)',
  'неодружений': 'single (male)',
  'неодружена': 'single (female)',
  'розлучений': 'divorced (male)',
  'розлучена': 'divorced (female)',
  'вдівець': 'widower',
  'вдова': 'widow',
  // Russian forms on legacy documents
  'женат': 'married (male)',
  'замужем': 'married (female)',
  'холост': 'single (male)',
  'не замужем': 'single (female)',
  'разведён': 'divorced (male)',
  'разведен': 'divorced (male)',
  'разведена': 'divorced (female)',
  'вдовец': 'widower',
};

// ── DO-NOT-USE GLOBAL BLOCKLIST ──────────────────────────────

export const GLOBAL_BLOCKLIST = new Set([
  'Ministry of Interior of Ukraine',
  'Militia',
  'Middle Name',  // for patronymic context
]);


// ── OBLAST GENITIVE → NOMINATIVE MAP ─────────────────────────
// Ukrainian documents use genitive case ("Вінницької області").
// USCIS forms need nominative. Robot must convert automatically.

export const OBLAST_GENITIVE_TO_NOMINATIVE: Record<string, string> = {
  'вінницької': 'Вінницька',
  'волинської': 'Волинська',
  'дніпропетровської': 'Дніпропетровська',
  'донецької': 'Донецька',
  'житомирської': 'Житомирська',
  'закарпатської': 'Закарпатська',
  'запорізької': 'Запорізька',
  'івано-франківської': 'Івано-Франківська',
  'київської': 'Київська',
  'кіровоградської': 'Кіровоградська',
  'луганської': 'Луганська',
  'львівської': 'Львівська',
  'миколаївської': 'Миколаївська',
  'одеської': 'Одеська',
  'полтавської': 'Полтавська',
  'рівненської': 'Рівненська',
  'сумської': 'Сумська',
  'тернопільської': 'Тернопільська',
  'харківської': 'Харківська',
  'херсонської': 'Херсонська',
  'хмельницької': 'Хмельницька',
  'черкаської': 'Черкаська',
  'чернівецької': 'Чернівецька',
  'чернігівської': 'Чернігівська',
};

// ── DOCUMENT TYPES ───────────────────────────────────────────
// Maps Ukrainian document names (lowercase) to English equivalents.
// Used for translation headers and document-type detection.

export interface DocumentTypeEntry {
  en: string;           // for translations and display
  uscis_en: string;     // preferred phrasing in USCIS submissions
  abbrev?: string;      // common Ukrainian abbreviation
}

export const DOCUMENT_TYPES: Record<string, DocumentTypeEntry> = {
  'закордонний паспорт': {
    en: 'International Passport',
    uscis_en: 'International Passport (Travel Document)',
    abbrev: 'закордонний паспорт',
  },
  'внутрішній паспорт': {
    en: 'Internal Passport',
    uscis_en: 'Internal (Domestic) Passport',
    abbrev: 'внутрішній паспорт',
  },
  'паспорт громадянина україни': {
    en: 'Passport of a Citizen of Ukraine',
    uscis_en: 'Internal (Domestic) Passport',
  },
  'id-картка': {
    en: 'National ID Card',
    uscis_en: 'National ID Card',
  },
  'свідоцтво про народження': {
    en: 'Birth Certificate',
    uscis_en: 'Birth Certificate',
  },
  'свідоцтво про шлюб': {
    en: 'Marriage Certificate',
    uscis_en: 'Marriage Certificate',
  },
  'свідоцтво про розірвання шлюбу': {
    en: 'Divorce Certificate',
    uscis_en: 'Certificate of Dissolution of Marriage',
  },
  'свідоцтво про смерть': {
    en: 'Death Certificate',
    uscis_en: 'Death Certificate',
  },
  'свідоцтво про зміну імені': {
    en: 'Name Change Certificate',
    uscis_en: 'Name Change Certificate',
  },
  'довідка про несудимість': {
    en: 'Criminal Record Certificate',
    uscis_en: 'Criminal Record Certificate / Police Clearance',
  },
  'військовий квиток': {
    en: 'Military Service Record',
    uscis_en: 'Military Service Record',
  },
  'атестат': {
    en: 'Secondary School Diploma',
    uscis_en: 'Secondary School Diploma',
  },
  'диплом': {
    en: 'Diploma',
    uscis_en: 'Diploma / Degree Certificate',
  },
  'трудова книжка': {
    en: 'Employment Record Book',
    uscis_en: 'Employment Record Book',
  },
};

/**
 * Convert a genitive-case oblast phrase to nominative + DMS-verified English.
 * "Вінницької області" → "Vinnytsia Oblast"
 * "Кіровоградській обл." → "Kirovohrad Oblast"
 * Robot calls this automatically — no human intervention needed.
 */
export function normalizeOblastToNominative(raw: string): { nominative_uk: string; transliterated: string } | null {
  if (!raw || typeof raw !== 'string') return null; // defense-in-depth: never throw on bad input
  // Strip oblast/obl suffix before lookup. Must match full words:
  // "область", "обл.", "обл" — but NOT strip "обл" as a prefix of "область".
  // Pattern: обл(?:асть|асті|\.?) covers all three forms safely.
  const lower = raw.toLowerCase().replace(/\s*(областей?|обл(?:асть|асті|\.?))\s*/gi, '').trim();

  // DMS-verified English names for oblasts (from dmsu.gov.ua/en-home/contacts.html)
  const DMS_ENGLISH: Record<string, string> = {
    'вінницької': 'Vinnytsia', 'вінницька': 'Vinnytsia',
    'волинської': 'Volyn', 'волинська': 'Volyn',
    'дніпропетровської': 'Dnipropetrovsk', 'дніпропетровська': 'Dnipropetrovsk',
    'донецької': 'Donetsk', 'донецька': 'Donetsk',
    'житомирської': 'Zhytomyr', 'житомирська': 'Zhytomyr',
    'закарпатської': 'Zakarpattia', 'закарпатська': 'Zakarpattia',
    'запорізької': 'Zaporizhzhia', 'запорізька': 'Zaporizhzhia',
    'івано-франківської': 'Ivano-Frankivsk', 'івано-франківська': 'Ivano-Frankivsk',
    'київської': 'Kyiv', 'київська': 'Kyiv',
    'кіровоградської': 'Kirovohrad', 'кіровоградська': 'Kirovohrad',
    'кіровоградській': 'Kirovohrad',
    'луганської': 'Luhansk', 'луганська': 'Luhansk',
    'львівської': 'Lviv', 'львівська': 'Lviv',
    'миколаївської': 'Mykolaiv', 'миколаївська': 'Mykolaiv',
    'одеської': 'Odesa', 'одеська': 'Odesa',
    'полтавської': 'Poltava', 'полтавська': 'Poltava',
    'рівненської': 'Rivne', 'рівненська': 'Rivne',
    'сумської': 'Sumy', 'сумська': 'Sumy',
    'тернопільської': 'Ternopil', 'тернопільська': 'Ternopil',
    'харківської': 'Kharkiv', 'харківська': 'Kharkiv',
    'херсонської': 'Kherson', 'херсонська': 'Kherson',
    'хмельницької': 'Khmelnytskyi', 'хмельницька': 'Khmelnytskyi',
    'черкаської': 'Cherkasy', 'черкаська': 'Cherkasy',
    'чернівецької': 'Chernivtsi', 'чернівецька': 'Chernivtsi',
    'чернігівської': 'Chernihiv', 'чернігівська': 'Chernihiv',
  };

  // Normalize ANY oblast adjective case to the nominative -ка form so every
  // case resolves without listing each: -ка/-кої/-кій/-кою/-ку → -ка
  // (вінницької / вінницькій / вінницькою / вінницьку → вінницька).
  const lowerNom = lower.replace(/к(а|ої|ій|ою|у)$/u, 'ка');
  const englishName = DMS_ENGLISH[lower] ?? DMS_ENGLISH[lowerNom];
  if (englishName) {
    const nom = OBLAST_GENITIVE_TO_NOMINATIVE[lower] ?? lowerNom;
    return { nominative_uk: `${nom} область`, transliterated: `${englishName} Oblast` };
  }
  return null;
}

// ── SETTLEMENT DESIGNATOR (source-driven re-add) ─────────────────────────────
// The extraction layer deliberately STRIPS the settlement-type prefix from the
// canonical city value (USCIS form fields want the bare name) with the promise
// that "the settlement type stays in raw_cyrillic for the translation layer to
// re-add". This is that re-add, as a pure source-driven lookup: given the RAW
// Cyrillic the model actually read, return the English designator — or null.
// HARD RULES: «смт» = "urban-type settlement", NEVER "city"/"town"; the
// designator comes ONLY from the source text (смт abolished 2024 — never added
// because a place "is" one, never removed because the category is gone).
// «м.»/«місто» returns null: cities stay bare (matches the TPS convention).
// Bare «с.» is ambiguous (село vs an initial) — require a following Cyrillic
// capital; «с.м.т.» is matched before «с.».
// guardCase: only the AMBIGUOUS single-letter dotted prefixes («с.», «м.») need
// the uppercase-next-letter guard (село vs an initial like «С. Петренко»). The
// unambiguous full forms (смт, село, селище, хутір, місто) fire even when the OCR
// lowercased the city name (e.g. «смт вишневе» → urban-type settlement).
const DESIGNATOR_PREFIXES: Array<{ re: RegExp; en: string | null; guardCase?: boolean }> = [
  { re: /^\s*(?:смт\.?|с\.\s*м\.\s*т\.?|селище міського типу|пгт\.?|п\.\s*г\.\s*т\.?)\s+/iu, en: 'urban-type settlement' },
  { re: /^\s*село\s+/iu, en: 'village' },
  { re: /^\s*с\.\s+/iu, en: 'village', guardCase: true },
  { re: /^\s*(?:селище|с-ще)\s+/iu, en: 'settlement' },
  { re: /^\s*(?:хутір|хут\.)\s+/iu, en: 'khutor' },
  { re: /^\s*місто\s+/iu, en: null }, // city stays bare
  { re: /^\s*м\.\s+/iu, en: null, guardCase: true },
];

export function settlementDesignatorEn(rawCyrillic: string | null | undefined): string | null {
  if (!rawCyrillic || typeof rawCyrillic !== 'string') return null; // defense-in-depth: never throw on bad input
  for (const { re, en, guardCase } of DESIGNATOR_PREFIXES) {
    const m = rawCyrillic.match(re);
    if (!m) continue;
    // Ambiguous «с.»/«м.» only: require an uppercase next letter so an initial
    // («С. Петренко») isn't misread as «село». Unambiguous prefixes skip the guard.
    if (guardCase && !/^[А-ЯҐЄІЇ]/u.test(rawCyrillic.slice(m[0].length))) continue;
    return en;
  }
  return null;
}
