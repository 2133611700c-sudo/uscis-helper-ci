/**
 * Transliteration engine tests — KMU-55
 * Test cases from real documents + czo.gov.ua examples
 */
import { transliterateKMU55, convertDateToUSCIS } from '../transliterate';

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
