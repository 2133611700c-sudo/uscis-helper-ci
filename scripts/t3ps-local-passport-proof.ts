import { runPassportModule } from '../apps/web/src/lib/tps/modules/passport'
import { computeCheckDigit } from '../apps/web/src/lib/translation/identity/mrzParser'

const surname = 'TESTSURNAME'
const given = 'TESTGIVEN'
const docNumber = 'AB1234567'
const nationality = 'UKR'
const dob = '850712'
const sex = 'M'
const expiry = '290630'
const personal = '0000000000000'

const line1 = (`P<UKR${(surname + '<<' + given).padEnd(39, '<')}`)
  .padEnd(44, '<')
  .slice(0, 44)

const dn = docNumber.padEnd(9, '<')
const dnc = computeCheckDigit(dn)!
const dbc = computeCheckDigit(dob)!
const exc = computeCheckDigit(expiry)!
const pp = personal.padEnd(14, '<')
const ppc = computeCheckDigit(pp)!
const before = dn + dnc + nationality + dob + dbc + sex + expiry + exc + pp + ppc
const cc = computeCheckDigit(before)!
const line2 = (before + cc).padEnd(44, '<').slice(0, 44)

const mkLine = (id: string, text: string, y: number) => ({
  id,
  text,
  page: 1,
  bbox: { x: 0.05, y, width: 0.9, height: 0.04 },
  words: [],
  confidence: 0.95,
  source: 'google_vision' as const,
})

const l1 = mkLine('l1', line1, 0.85)
const l2 = mkLine('l2', line2, 0.9)

const ocr = {
  provider: 'google_vision' as const,
  raw_text: `${line1}\n${line2}`,
  pages: [{ page: 1, width: 1000, height: 700, lines: [l1, l2], words: [] }],
  lines: [l1, l2],
  words: [],
  processing_ms: 100,
  warnings: [],
  created_at: new Date().toISOString(),
}

const result = runPassportModule(ocr, { document_id: 'doc_local' })
const fieldKeys = Array.from(new Set((result.fields ?? []).map((f) => f.field))).sort()
const reviewCount = (result.fields ?? []).filter((f) => f.review_required).length

console.log('field_count:', fieldKeys.length)
console.log('field_keys:', fieldKeys.join(','))
console.log('requires_review:', reviewCount)
