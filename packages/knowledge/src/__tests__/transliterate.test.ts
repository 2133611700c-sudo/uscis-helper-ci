/**
 * Transliteration engine tests — KMU-55
 * Test cases from real documents + czo.gov.ua examples
 */
import {
  transliterateKMU55,
  transliterateRussian,
  detectNameScript,
  convertDateToUSCIS,
} from '../transliterate';

const cases: [string, string, string][] = [
  // [input, expected, description]
  ['Дем\'яненко', 'Demianenko', 'Surname with apostrophe'],
  ['Іван', 'Ivan', 'Given name — Й non-initial'],
  ['Петрович', 'Petrovych', 'Patronymic — compound'],
  ['Вінниця', 'Vinnytsia', 'City — #CorrectUA'],
  ['Київ', 'Kyiv', 'Capital — #CorrectUA'],
  ['Одеса', 'Odesa', 'City — single s'],
  ['Запоріжжя', 'Zaporizhzhia', 'Double ж + я non-initial'],
  ['Харків', 'Kharkiv', 'Х = Kh'],
  ['Львів', 'Lviv', 'ь skipped'],
  ['Устинівка', 'Ustynivka', 'Birth place — smт'],
  ['Кіровоград', 'Kirovohrad', 'Historical city — Г=H'],
  ['Єнакієве', 'Yenakiieve', 'Є initial + Є non-initial'],
  ['Згурський', 'Zghurskyi', 'Special: ЗГ = Zgh'],
  ['Розгон', 'Rozghon', 'Special: ЗГ mid-word'],
  ['Житомир', 'Zhytomyr', 'Ж + и'],
  ['Олексій', 'Oleksii', 'й non-initial = i'],
  ['Йосипівка', 'Yosypivka', 'Й initial = Y'],
  ['Їжакевич', 'Yizhakevych', 'Ї initial = Yi'],
  ['Юлія', 'Yuliia', 'Ю initial + ї non-initial + я non-initial'],
  ['Миколаїв', 'Mykolaiv', '#CorrectUA — Ї non-initial'],
  ['Чернігів', 'Chernihiv', '#CorrectUA'],
  ['Луганськ', 'Luhansk', 'ь skipped'],
  ['Донецьк', 'Donetsk', 'ь skipped'],
  ['Богдан', 'Bohdan', 'Г = H not G'],
  // Edge cases added in self-check
  ['ДЕМ\'ЯНЕНКО', 'DEMIANENKO', 'ALL-CAPS input'],
  ['ІВАН', 'IVAN', 'ALL-CAPS name'],
  ['Івано-Франківськ', 'Ivano-Frankivsk', 'Hyphenated city name'],
  ['', '', 'Empty string'],
  ['Hello World', 'Hello World', 'Non-Cyrillic passthrough'],
  ['Мар\'їне', 'Marine', 'Apostrophe + Ї non-initial'],
];

let pass = 0;
let fail = 0;

for (const [input, expected, desc] of cases) {
  const result = transliterateKMU55(input);
  if (result === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${desc}\n  Input:    ${input}\n  Expected: ${expected}\n  Got:      ${result}\n`);
  }
}

// ── Russian-script no-Cyrillic-leak regression (real Gemini OCR bug, 2026-06) ──
// A Russian-script document leaked Cyrillic into the English `value`:
//   СОЛОВЬЁВ → SOLOVЁV (leaked Ё) · ЭДУАРД → ЭDUARD (leaked Э)
//   ИЛЬЁВИЧ  → YLЁVYCH (leaked Ё) · город Подъездный → horod Podezdnыi (leaked ы, г→h)
// Two defects: (1) KMU-55 passed the Russian-only letters Ё/Э/Ы through as raw
// Cyrillic; (2) Russian-script content was transliterated with KMU-55 (г→h)
// instead of the Russian table (г→g). Romanization standard for the RU table =
// BGN/PCGN simplified (pinned by russianTransliterate.test.ts: Алексей→Aleksey,
// Алексеевич→Alekseyevich): Э→E, Ы→Y, Ё→Ye (position-dependent), Ъ/Ь→omit.
const NO_CYRILLIC = /[Ѐ-ӿ]/;

// (a) The Russian table produces the correct Latin (BGN/PCGN) for each evidence input.
const ruVectors: [string, string, string][] = [
  ['СОЛОВЬЁВ', 'SOLOVYeV', 'surname — Ь dropped, Ё→Ye, zero Cyrillic'],
  ['ЭДУАРД', 'EDUARD', 'given — Э→E'],
  ['ИЛЬЁВИЧ', 'ILYeVICh', 'patronymic — Ь dropped, Ё→Ye'],
  ['город Подъездный', 'gorod Podyezdnyy', 'Russian word — г→g (NOT h), ъ dropped, ы→y'],
];
for (const [input, expected, desc] of ruVectors) {
  const result = transliterateRussian(input);
  const ok = result === expected && !NO_CYRILLIC.test(result);
  if (ok) { pass++; } else {
    fail++;
    console.error(`FAIL RU: ${desc}\n  Input:    ${input}\n  Expected: ${expected}\n  Got:      ${result}\n  Cyrillic leaked: ${NO_CYRILLIC.test(result)}\n`);
  }
}

// (b) detectNameScript flags every evidence input as Russian (distinctive ё/э/ы/ъ).
for (const [input] of ruVectors) {
  const d = detectNameScript(input);
  if (d === 'ru') { pass++; } else {
    fail++;
    console.error(`FAIL detect: ${input} → expected 'ru', got '${d}'\n`);
  }
}

// (c) HARD CONTRACT: KMU-55 itself must NEVER emit a Cyrillic character, even for
// Russian-only letters it cannot map (defense-in-depth net against routing misses).
for (const [input] of ruVectors) {
  const result = transliterateKMU55(input);
  if (!NO_CYRILLIC.test(result)) { pass++; } else {
    fail++;
    console.error(`FAIL KMU leak: ${input} → KMU-55 leaked Cyrillic: ${result}\n`);
  }
}

// Date tests
const dateCases: [string, string | null, string][] = [
  ['01.01.1990', '01/01/1990', 'Dot format'],
  ['01 січня 1990 року', '01/01/1990', 'Ukrainian long format'],
  ['19 лютого 2003', '02/19/2003', 'February'],
  ['5 грудня 2011', '12/05/2011', 'December'],
  ['01 января 1990 года', '01/01/1990', 'Russian fallback'],
];

for (const [input, expected, desc] of dateCases) {
  const result = convertDateToUSCIS(input);
  if (result === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL DATE: ${desc}\n  Input:    ${input}\n  Expected: ${expected}\n  Got:      ${result}\n`);
  }
}

console.log(`\n=== KMU-55 Tests: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
