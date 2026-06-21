/**
 * mrz.ts — TD3 (passport) Machine-Readable Zone parser.
 *
 * WHY: the MRZ carries the CONTROLLING Latin spelling of the holder's name +
 * passport number + DOB. HARD RULE: controlling Latin (MRZ/I-94/EAD) beats any
 * re-transliteration (KMU-55). So for an international passport we read the name
 * from the MRZ, not by transliterating the Cyrillic — this keeps the translation
 * matching the client's other USCIS documents.
 *
 * Two lines of 44 chars. Tolerant of OCR noise (spaces, stray chars) but validates
 * ICAO 7-3-1 check digits so a misread number/DOB is flagged, never trusted blindly.
 */

const WEIGHTS = [7, 3, 1]
function charVal(c: string): number {
  if (c === '<') return 0
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55 // A=10..Z=35
  return 0
}
export function checkDigit(s: string): number {
  let sum = 0
  for (let i = 0; i < s.length; i++) sum += charVal(s[i]) * WEIGHTS[i % 3]
  return sum % 10
}

export interface MrzResult {
  ok: boolean                 // both lines found & parsed
  format: 'TD3' | 'TD1' | null // TD3 = passport (2×44); TD1 = ID card (3×30)
  surname: string             // Latin, controlling
  given_names: string         // Latin, controlling
  passport_no: string         // document number (passport_no or ID-card doc no.)
  nationality: string
  date_of_birth: string | null // ISO yyyy-mm-dd
  sex: 'M' | 'F' | 'X' | ''
  expiry: string | null        // ISO
  checks: { passport_no: boolean; dob: boolean; expiry: boolean; composite: boolean }
  // review_required is true when ANY validated field failed its check digit
  // (document number, DOB, EXPIRY) or the composite check (when present). A
  // misread number/DOB/expiry can therefore NEVER silently overwrite a canonical
  // value — it is flagged for a human. The name has no check digit (controlling
  // Latin) so it is glanced upstream, not the basis of this flag.
  review_required: boolean
}

function isoFromYYMMDD(s: string, pivot = 30): string | null {
  if (!/^\d{6}$/.test(s)) return null
  const yy = Number(s.slice(0, 2)), mm = s.slice(2, 4), dd = s.slice(4, 6)
  const year = yy <= pivot ? 2000 + yy : 1900 + yy
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null
  return `${year}-${mm}-${dd}`
}

function emptyResult(): MrzResult {
  return {
    ok: false, format: null, surname: '', given_names: '', passport_no: '', nationality: '',
    date_of_birth: null, sex: '', expiry: null,
    checks: { passport_no: false, dob: false, expiry: false, composite: false },
    review_required: true,
  }
}

/** Extract the two TD3 (passport) lines from arbitrary OCR text. */
export function findMrzLines(text: string): [string, string] | null {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, '').toUpperCase()).filter(Boolean)
  // a TD3 line is ~30-44 chars of [A-Z0-9<]; line 1 starts with P< (or P + filler)
  const cand = lines.filter((l) => /^[A-Z0-9<]{28,46}$/.test(l) && l.includes('<'))
  const l1 = cand.find((l) => /^P[<A-Z]/.test(l) && l.includes('<<'))
  if (l1) {
    const i = cand.indexOf(l1)
    const l2 = cand[i + 1] ?? cand.find((l) => l !== l1 && /[0-9]/.test(l))
    if (l2) return [l1.padEnd(44, '<').slice(0, 44), l2.padEnd(44, '<').slice(0, 44)]
  }
  return null
}

/** Extract the three TD1 (ID-card, 3×30) lines from arbitrary OCR text. */
export function findTd1Lines(text: string): [string, string, string] | null {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, '').toUpperCase()).filter(Boolean)
  const cand = lines.filter((l) => /^[A-Z0-9<]{28,32}$/.test(l) && l.includes('<'))
  // Line 1 of a TD1 starts with the document code (I/A/C + filler) and is NOT a
  // passport line (no leading P<). Find a triple of consecutive 30-char lines.
  const i = cand.findIndex((l, idx) =>
    /^[IAC][A-Z0-9<]/.test(l) && cand[idx + 1] != null && cand[idx + 2] != null,
  )
  if (i < 0) return null
  const norm = (l: string) => l.padEnd(30, '<').slice(0, 30)
  return [norm(cand[i]), norm(cand[i + 1]), norm(cand[i + 2])]
}

/** Parse a TD3 (passport) MRZ. */
function parseTd3(text: string): MrzResult {
  const lines = findMrzLines(text)
  if (!lines) return emptyResult()
  const [l1, l2] = lines

  const nameField = l1.slice(5)
  const [surRaw, givRaw = ''] = nameField.split('<<')
  const surname = surRaw.replace(/</g, ' ').trim()
  const given_names = givRaw.replace(/</g, ' ').trim()

  const passport_no = l2.slice(0, 9).replace(/</g, '')
  const passCheck = checkDigit(l2.slice(0, 9)) === charVal(l2[9])
  const nationality = l2.slice(10, 13).replace(/</g, '')
  const dobRaw = l2.slice(13, 19)
  const dobCheck = checkDigit(dobRaw) === charVal(l2[19])
  const date_of_birth = isoFromYYMMDD(dobRaw)
  const sexChar = l2[20]
  const sex = sexChar === 'M' || sexChar === 'F' ? sexChar : sexChar === '<' ? 'X' : ''
  const expRaw = l2.slice(21, 27)
  const expCheck = checkDigit(expRaw) === charVal(l2[27])
  const expiry = isoFromYYMMDD(expRaw, 70)

  // ICAO TD3 composite check digit (line 2 char 44): over doc-no(1-10),
  // DOB(14-20), expiry(22-28) and the personal-number field(29-43)+its check(44).
  const compositeInput = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 28) + l2.slice(28, 43)
  const compositeCheck = checkDigit(compositeInput) === charVal(l2[43])

  const checks = { passport_no: passCheck, dob: dobCheck, expiry: expCheck, composite: compositeCheck }
  return {
    ok: !!surname,
    format: 'TD3',
    surname, given_names, passport_no, nationality, date_of_birth, sex: sex as MrzResult['sex'], expiry,
    checks,
    // Unified: any validated field (doc-no/DOB/EXPIRY) OR the composite failing → review.
    review_required: !(passCheck && dobCheck && expCheck && compositeCheck),
  }
}

/** Parse a TD1 (ID-card, 3×30) MRZ. */
function parseTd1(text: string): MrzResult {
  const lines = findTd1Lines(text)
  if (!lines) return emptyResult()
  const [l1, l2, l3] = lines

  // Line 1: doc code(1-2) issuing state(3-5) doc number(6-14) check(15) optional(16-30)
  const passport_no = l1.slice(5, 14).replace(/</g, '')
  const passCheck = checkDigit(l1.slice(5, 14)) === charVal(l1[14])
  // Line 2: DOB(1-6) check(7) sex(8) expiry(9-14) check(15) nationality(16-18) ... composite(30)
  const dobRaw = l2.slice(0, 6)
  const dobCheck = checkDigit(dobRaw) === charVal(l2[6])
  const date_of_birth = isoFromYYMMDD(dobRaw)
  const sexChar = l2[7]
  const sex = sexChar === 'M' || sexChar === 'F' ? sexChar : sexChar === '<' ? 'X' : ''
  const expRaw = l2.slice(8, 14)
  const expCheck = checkDigit(expRaw) === charVal(l2[14])
  const expiry = isoFromYYMMDD(expRaw, 70)
  const nationality = l2.slice(15, 18).replace(/</g, '')

  // TD1 composite (line 2 char 30): over line1[6-30] + line2[1-7] + line2[9-15] + line2[19-29].
  const compositeInput = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29)
  const compositeCheck = checkDigit(compositeInput) === charVal(l2[29])

  // Line 3: name field (surname<<given).
  const [surRaw, givRaw = ''] = l3.split('<<')
  const surname = surRaw.replace(/</g, ' ').trim()
  const given_names = givRaw.replace(/</g, ' ').trim()

  const checks = { passport_no: passCheck, dob: dobCheck, expiry: expCheck, composite: compositeCheck }
  return {
    ok: !!surname,
    format: 'TD1',
    surname, given_names, passport_no, nationality, date_of_birth, sex: sex as MrzResult['sex'], expiry,
    checks,
    review_required: !(passCheck && dobCheck && expCheck && compositeCheck),
  }
}

/**
 * Parse an MRZ from arbitrary OCR text. Tries TD3 (passport) first, then TD1
 * (ID card). An MRZ that cannot be found or fails any check digit is
 * review_required=true so it can NEVER silently overwrite a canonical value.
 */
export function parseMrz(text: string): MrzResult {
  const td3 = parseTd3(text)
  if (td3.ok) return td3
  const td1 = parseTd1(text)
  if (td1.ok) return td1
  return emptyResult()
}
