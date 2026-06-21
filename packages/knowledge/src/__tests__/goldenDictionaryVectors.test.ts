/**
 * goldenDictionaryVectors.test.ts — DETERMINISTIC golden-vector acceptance test
 * for the @uscis-helper/knowledge dictionary + transliteration + normalization
 * layer. NO Gemini, NO OCR, NO network. Pure functions in, asserted bytes out.
 *
 * This is the #1 proof that the dictionary/transliteration engine produces the
 * CORRECT output for known Ukrainian/Russian Cyrillic inputs. Every vector calls
 * the REAL exported function and asserts the documented-correct value.
 *
 * RULE PROVENANCE: CLAUDE.md HARD RULES + docs/adr/* + KMU-55 (CMU Resolution
 * No.55, 27 Jan 2010) + #CorrectUA (mfa.gov.ua).
 *
 * Runner: plain tsx (same as the other knowledge tests). Asserts and exits 1 on
 * any failure — it can never fake a green.
 *
 * If the ENGINE output ever contradicts a documented rule, the vector below is
 * marked `// RULE VIOLATION:` and the expectation is set to the ACTUAL engine
 * output (so the suite still proves what the engine really does), and the
 * violation is reported to the caller. As of authorship NO violations were found.
 */
import {
  transliterateKMU55,
  transliterateRussian,
  detectNameScript,
  convertDateToUSCIS,
  normalizeName,
  normalizeAuthority,
  normalizePlace,
  normalizeOblastToNominative,
  snapCity,
  settlementDesignatorEn,
  reconcilePatronymic,
  isValidPatronymic,
  FIELD_LABELS,
  CIVIL_STATUS,
  DOCUMENT_TYPES,
  parseMrz,
  type NormalizationContext,
} from '../index';

let pass = 0;
let fail = 0;

function eq(actual: unknown, expected: unknown, desc: string): void {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(
      `FAIL: ${desc}\n  Expected: ${JSON.stringify(expected)}\n  Got:      ${JSON.stringify(actual)}\n`,
    );
  }
}

function truthy(actual: unknown, desc: string): void {
  if (actual) pass++;
  else {
    fail++;
    console.error(`FAIL (expected truthy): ${desc}\n  Got: ${JSON.stringify(actual)}\n`);
  }
}

const ctx: NormalizationContext = { mode: 'uscis_normalized' };

// ──────────────────────────────────────────────────────────────────────────
// 1. KMU-55 transliteration — the canonical Ukrainian Cyrillic→Latin engine.
//    Golden values verified against czo.gov.ua / mfa.gov.ua #CorrectUA.
// ──────────────────────────────────────────────────────────────────────────
const kmu55Vectors: [string, string, string][] = [
  ['Шевченко', 'Shevchenko', 'KMU-55: Ш=Sh, classic surname'],
  ['Ющенко', 'Yushchenko', 'KMU-55: Ю initial=Yu, щ=shch'],
  ['Їжакевич', 'Yizhakevych', 'KMU-55: Ї initial=Yi, ж=zh, ич ending'],
  ['Юрій', 'Yurii', 'KMU-55: Ю initial=Yu, й non-initial=i'],
  ['Олексій', 'Oleksii', 'KMU-55: й non-initial = i'],
  ['Згурський', 'Zghurskyi', 'KMU-55 special: ЗГ = Zgh (not Zh)'],
  ['Хмельницький', 'Khmelnytskyi', 'KMU-55: Х=Kh, ь skipped'],
  ['Запоріжжя', 'Zaporizhzhia', 'KMU-55: double ж, я non-initial=ia'],
  ['Київ', 'Kyiv', '#CorrectUA: NOT Kiev'],
  ['Вінниця', 'Vinnytsia', '#CorrectUA: ц=ts, я non-initial=ia'],
  ["Дем'яненко", 'Demianenko', 'KMU-55: apostrophe dropped, я non-initial=ia'],
  ['ШЕВЧЕНКО', 'SHEVCHENKO', 'KMU-55: ALL-CAPS input → ALL-CAPS output (MRZ-like)'],
];
for (const [input, expected, desc] of kmu55Vectors) {
  eq(transliterateKMU55(input), expected, desc);
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Script detection — Russian-script signal (Ы/Э/Ё/Ъ) → 'ru'; Ukrainian-only
//    letters (І/Ї/Є/Ґ) → 'ua'; ambiguous (only shared letters) → 'unknown'.
//    HARD RULE: ambiguity is NOT silently resolved — caller reviews.
// ──────────────────────────────────────────────────────────────────────────
eq(detectNameScript('Эдуард'), 'ru', "Russian-only Э → script 'ru'");
eq(detectNameScript('Ёлкин'), 'ru', "Russian-only Ё → script 'ru'");
eq(detectNameScript('Іжевськ'), 'ua', "Ukrainian-only І → script 'ua'");
eq(detectNameScript('Їжак'), 'ua', "Ukrainian-only Ї → script 'ua'");
// Shared-letters-only names carry NO orthographic signal → 'unknown' (review).
eq(detectNameScript('Шевченко'), 'unknown', 'Shared-letters surname → ambiguous (NOT silent KMU-55)');
eq(detectNameScript('Сергей'), 'unknown', 'RU spelling but shared letters → ambiguous (review, not auto)');
eq(detectNameScript('Александр'), 'unknown', 'Shared-letters given name → ambiguous');

// ──────────────────────────────────────────────────────────────────────────
// 3. Russian as-written romanization (BGN/PCGN simplified, owner-approved).
//    A RUSSIAN-script line must NOT be transliterated with KMU-55 (which would
//    give г→h, и→y). Required: Иван→Ivan, Иванович→Ivanovich, Петрович→Petrovich.
// ──────────────────────────────────────────────────────────────────────────
eq(transliterateRussian('Иван'), 'Ivan', 'BGN/PCGN: и=i (NOT KMU-55 y)');
eq(transliterateRussian('Иванович'), 'Ivanovich', 'BGN/PCGN: patronymic, ич=ich');
eq(transliterateRussian('Петрович'), 'Petrovich', 'BGN/PCGN: Russian patronymic');
eq(transliterateRussian('Эдуард'), 'Eduard', 'BGN/PCGN: э=e');
eq(transliterateRussian('Ёлкин'), 'Yelkin', 'BGN/PCGN: ё word-start=Ye');
// Contrast proof: the SAME letters routed through KMU-55 give the WRONG (UA) form.
eq(transliterateKMU55('Иванович'), 'Yvanovych', 'KMU-55 on Russian gives WRONG form (proves routing matters)');

// ──────────────────────────────────────────────────────────────────────────
// 4. Patronymic — HARD RULE: label is "Patronymic", NEVER "Middle Name".
//    Engine: validate a full read, reconstruct from given+sex, reject fragments.
// ──────────────────────────────────────────────────────────────────────────
eq(FIELD_LABELS.patronymic.en, 'Patronymic', 'Patronymic field label is "Patronymic"');
truthy(
  FIELD_LABELS.patronymic.do_not_use?.includes('Middle Name'),
  'Patronymic do_not_use blocks "Middle Name"',
);
truthy(isValidPatronymic('Петрович', 'M'), 'Full male patronymic is valid');
truthy(!isValidPatronymic('ович', 'M'), 'Bare suffix fragment "ович" is REJECTED (not a patronymic)');
{
  const r = reconcilePatronymic('Петрович', 'Іван', 'M');
  eq(r.value, 'Петрович', 'reconcile: valid read kept verbatim');
  eq(r.source, 'read_valid', 'reconcile: source=read_valid');
  eq(r.review_required, false, 'reconcile: valid read needs no review');
}
{
  // Fragment read → reconstruct from given name + sex (Петро → Петрович).
  const r = reconcilePatronymic('ович', 'Петро', 'M');
  eq(r.value, 'Петрович', 'reconcile: fragment → reconstructed from given name (exception table)');
  truthy(r.source.startsWith('generated'), 'reconcile: source is generated_*');
}
{
  // Unresolvable: no valid read, no usable given name → review, never guess.
  const r = reconcilePatronymic('', '', 'M');
  eq(r.value, '', 'reconcile: unresolved → empty value');
  eq(r.review_required, true, 'reconcile: unresolved → review_required');
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Issuing authority — HARD RULES: Міліція→Militsiya (NEVER Police/Militia);
//    agency abbreviations resolve via the dictionary (ADR-004).
// ──────────────────────────────────────────────────────────────────────────
{
  const a = normalizeAuthority('Міліція м. Київ', 'doc', ctx);
  eq(a.normalized_value, 'Militsiya', 'Міліція → Militsiya (NEVER Police/Militia)');
  truthy(!/police|militia/i.test(a.normalized_value), 'Militsiya output contains no Police/Militia');
  eq(a.review_required, false, 'Known Militsiya authority needs no review');
}
{
  const a = normalizeAuthority('Національна поліція України', 'doc', ctx);
  eq(a.normalized_value, 'National Police of Ukraine', 'НПУ → National Police of Ukraine');
}
{
  // ADR-004: agency abbreviation УМВС → regional MIA department.
  const a = normalizeAuthority('Управління МВС', 'doc', ctx);
  eq(a.normalized_value, 'Regional Department of MIA', 'УМВС → Regional Department of MIA');
}

// ──────────────────────────────────────────────────────────────────────────
// 6. Places — settlement type "смт"→"urban-type settlement"; oblast genitive
//    (Вінницької)→nominative "Vinnytsia Oblast"; gazetteer exact vs fuzzy.
// ──────────────────────────────────────────────────────────────────────────
{
  const p = normalizePlace('смт Вишневе', 'place_of_birth', 'doc', ctx);
  eq(p.normalized_value, 'urban-type settlement Vyshneve', '"смт"→"urban-type settlement" (NEVER city/town)');
  truthy(!/city|town/i.test(p.normalized_value), 'смт output contains no "city"/"town"');
}
// Source-driven designator re-add (the bare-lookup path).
eq(settlementDesignatorEn('смт Вишневе'), 'urban-type settlement', 'settlementDesignatorEn: смт');
eq(settlementDesignatorEn('місто Київ'), null, 'settlementDesignatorEn: місто → null (city stays bare)');
{
  const p = normalizePlace('Вінницької області', 'place_of_birth', 'doc', ctx);
  eq(p.normalized_value, 'Vinnytsia Oblast', 'oblast genitive (Вінницької) → nominative "Vinnytsia Oblast"');
}
{
  const o = normalizeOblastToNominative('Вінницької області');
  eq(o?.transliterated, 'Vinnytsia Oblast', 'normalizeOblastToNominative: English nominative');
  eq(o?.nominative_uk, 'Вінницька область', 'normalizeOblastToNominative: Ukrainian nominative');
}
{
  // Gazetteer EXACT match → matched=true, no review.
  const s = snapCity('Київ');
  eq(s.matched, true, 'snapCity exact: Київ matched');
  eq(s.review_required, false, 'snapCity exact: no review');
}
{
  // Fuzzy near-match → NOT a silent replacement; review_required.
  const s = snapCity('Простянець');
  eq(s.matched, false, 'snapCity fuzzy: NOT auto-matched (no silent correction)');
  eq(s.review_required, true, 'snapCity fuzzy: review_required');
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Controlling Latin — an already-Latin MRZ value is preserved verbatim by
//    normalizeName (controlling_spelling wins, NEVER re-transliterated).
// ──────────────────────────────────────────────────────────────────────────
{
  const n = normalizeName('Шевченко', 'surname', 'doc', {
    mode: 'uscis_normalized',
    controlling_spellings: [{ field: 'surname', latin_value: 'SHEVCHENKO', source: 'passport_mrz' }],
  });
  eq(n.normalized_value, 'SHEVCHENKO', 'Controlling MRZ Latin preserved verbatim (not re-transliterated)');
  truthy(n.rule_applied.startsWith('controlling_spelling'), 'rule = controlling_spelling:*');
}
{
  // Controlling value that DIFFERS from KMU-55 → kept, but flagged for review.
  const n = normalizeName('Олексій', 'given_name', 'doc', {
    mode: 'uscis_normalized',
    controlling_spellings: [{ field: 'given_name', latin_value: 'OLEKSIY', source: 'passport_mrz' }],
  });
  eq(n.normalized_value, 'OLEKSIY', 'Controlling Latin wins over KMU-55 "Oleksii"');
  eq(n.review_required, true, 'Controlling≠KMU-55 conflict → review_required');
}

// ──────────────────────────────────────────────────────────────────────────
// 8. Dates — Ukrainian/Russian month names + dot format → USCIS MM/DD/YYYY.
// ──────────────────────────────────────────────────────────────────────────
eq(convertDateToUSCIS('01.01.1990'), '01/01/1990', 'Date dot format DD.MM.YYYY → MM/DD/YYYY');
eq(convertDateToUSCIS('19 лютого 2003'), '02/19/2003', 'Ukrainian month name → USCIS date');
eq(convertDateToUSCIS('5 грудня 2011'), '12/05/2011', 'Ukrainian December → USCIS date');
// RU months (legacy documents) — same date engine, Russian month names.
eq(convertDateToUSCIS('15 января 1985'), '01/15/1985', 'Russian month name (января) → USCIS date');
eq(convertDateToUSCIS('3 декабря 1999'), '12/03/1999', 'Russian December (декабря) → USCIS date');

// ──────────────────────────────────────────────────────────────────────────
// 9. Civil / marital status — CANONICAL CIVIL_STATUS (dictionary.ts); the
//    glossaryLoader fork now delegates here (audit #195). Gendered UA + RU forms.
// ──────────────────────────────────────────────────────────────────────────
eq(CIVIL_STATUS['одружений'], 'married (male)', 'civil status: одружений → married (male)');
eq(CIVIL_STATUS['одружена'], 'married (female)', 'civil status: одружена → married (female)');
eq(CIVIL_STATUS['розлучена'], 'divorced (female)', 'civil status: розлучена → divorced (female)');
eq(CIVIL_STATUS['вдівець'], 'widower', 'civil status: вдівець → widower');
eq(CIVIL_STATUS['женат'], 'married (male)', 'civil status RU: женат → married (male)');

// ──────────────────────────────────────────────────────────────────────────
// 10. Document types — canonical DOCUMENT_TYPES; смт-style hard rules don't
//     apply but the USCIS phrasing must be stable.
// ──────────────────────────────────────────────────────────────────────────
eq(DOCUMENT_TYPES['свідоцтво про народження'].uscis_en, 'Birth Certificate', 'doc type: birth certificate');
eq(DOCUMENT_TYPES['свідоцтво про шлюб'].uscis_en, 'Marriage Certificate', 'doc type: marriage certificate');
eq(DOCUMENT_TYPES['id-картка'].uscis_en, 'National ID Card', 'doc type: ID card');

// ──────────────────────────────────────────────────────────────────────────
// 11. Civil-registry CANONICAL rendering (audit #195) — registry-sourced
//     "Civil Registry Office" (NOT the old sourceless "ZAHS" typo).
// ──────────────────────────────────────────────────────────────────────────
{
  const a = normalizeAuthority('РАЦС м. Вінниця', 'birth_cert', ctx);
  eq(a.normalized_value, 'Civil Registry Office', 'РАЦС uscis_normalized → "Civil Registry Office" (registry-sourced)');
  truthy(!/zahs/i.test(a.normalized_value), 'civil registry output has no ZAHS typo');
}

// ──────────────────────────────────────────────────────────────────────────
// 12. MRZ authority — TD3 passport + TD1 ID card both yield the CONTROLLING
//     Latin name and validate check digits; a tampered TD1 → review_required
//     so an invalid MRZ can never silently overwrite a canonical value.
// ──────────────────────────────────────────────────────────────────────────
{
  const td3 = parseMrz('P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<\nFA000000<5UKR9001011M3001019<<<<<<<<<<<<<<06');
  eq(td3.format, 'TD3', 'MRZ TD3 detected');
  eq(td3.surname, 'IVANENKO', 'MRZ TD3 controlling surname');
  eq(td3.review_required, false, 'MRZ TD3 valid → no review');
}
{
  const td1Good = ['I<UKRAA12345678<<<<<<<<<<<<<<<', '9001011M3001019UKR<<<<<<<<<<<0', 'IVANENKO<<IVAN<<<<<<<<<<<<<<<<'].join('\n');
  const td1 = parseMrz(td1Good);
  eq(td1.format, 'TD1', 'MRZ TD1 detected');
  eq(td1.surname, 'IVANENKO', 'MRZ TD1 controlling surname');
  eq(td1.date_of_birth, '1990-01-01', 'MRZ TD1 DOB parsed');
  eq(td1.review_required, false, 'MRZ TD1 valid → no review');
  const tampered = parseMrz(td1Good.replace('9001011M', '9101011M'));
  eq(tampered.review_required, true, 'MRZ TD1 tampered DOB → review_required (cannot overwrite canonical)');
}

// ──────────────────────────────────────────────────────────────────────────
console.log(`\n=== Golden Dictionary Vectors: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
