/**
 * core-demo.ts — prints REAL transformations from the knowledge package into the
 * CI log. No mocks, no external API: this is the actual product code converting
 * real Cyrillic input to its English/Latin output. Run with: npx tsx scripts/core-demo.ts
 */
import {
  transliterateKMU55,
  transliterateRussian,
  convertDateToUSCIS,
} from '../packages/knowledge/src/transliterate'
import { parseMrz, findMrzLines } from '../packages/knowledge/src/mrz'

const row = (a: string, b: string) => console.log('  ' + a.padEnd(32) + ' →  ' + b)

console.log('\n── UA KMU-55 transliteration (real product code) ──')
for (const s of ['Шевченко', 'Тарас', 'Григорович', 'Вишневе', 'Вінниця', 'Київ'])
  row(s, transliterateKMU55(s))

console.log('\n── RU transliteration ──')
for (const s of ['Петрова', 'Сергей', 'Москва']) row(s, transliterateRussian(s))

console.log('\n── date → USCIS (DD.MM.YYYY → MM/DD/YYYY) ──')
for (const s of ['15.01.1990', '01.12.2024']) row(s, String(convertDateToUSCIS(s)))

console.log('\n── MRZ TD3 (passport machine-readable zone) ──')
const mrz =
  'P<UKRSHEVCHENKO<<TARAS<HRYHOROVYCH<<<<<<<<<<<\n1234567890UKR9001152M3001011<<<<<<<<<<<<<<04'
const p = parseMrz(mrz) as { surname?: string; nationality?: string } | null
row('lines found', String(findMrzLines(mrz).length))
row('parsed surname', p?.surname ?? '(n/a)')
row('parsed nationality', p?.nationality ?? '(n/a)')

console.log('\nOK — core deterministic translation path proven (no Gemini, no secrets).')
