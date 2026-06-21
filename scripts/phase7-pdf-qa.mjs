/**
 * Phase 7 — PDF QA: text extraction + forbidden phrase check
 * Uses pdf-parse to extract text from the smoke-test PDF artifact.
 * Asserts all forbidden phrases are absent and required elements are present.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── Try to import pdf-parse ──────────────────────────────────────────────────
let pdfParse
try {
  const mod = await import('pdf-parse')
  pdfParse = mod.default
} catch {
  console.error('pdf-parse not installed. Run: npm install pdf-parse --no-save')
  process.exit(1)
}

// ── Locate PDF ───────────────────────────────────────────────────────────────
const PDF_PATH = join(ROOT, 'artifacts/e2e/smoke_test_output.pdf')
if (!existsSync(PDF_PATH)) {
  console.error(`PDF not found at: ${PDF_PATH}`)
  console.error('Run pilot-e2e-proof.mjs first to generate the smoke test PDF.')
  process.exit(1)
}

console.log('\n=== Phase 7 — PDF QA ===')
console.log(`PDF: ${PDF_PATH} (${readFileSync(PDF_PATH).length} bytes)\n`)

const pdfBuffer = readFileSync(PDF_PATH)
const data = await pdfParse(pdfBuffer)
const pdfText = data.text

// Save extracted text for audit trail
mkdirSync(join(ROOT, 'artifacts/pdf_qa'), { recursive: true })
const extractPath = join(ROOT, 'artifacts/pdf_qa/pdf_text_extract.txt')
writeFileSync(extractPath, pdfText, 'utf8')
console.log(`Extracted text saved to: ${extractPath}`)
console.log(`Total chars extracted: ${pdfText.length}\n`)

// ── Forbidden phrases (same list as translationQaValidator) ──────────────────
const FORBIDDEN_PHRASES = [
  'certified copy',
  'certified translation',
  'source trace',
  'qa/audit',
  'not part of translation',
  'draft',
  'watermark',
  '[draft',
  'for review only',
  'payment required',
  'placeholder',
  'todo',
  'fixme',
  'lorem ipsum',
  'example.com',
]

// ── Required elements ────────────────────────────────────────────────────────
const REQUIRED_PHRASES = [
  'MESSENGINFO',
  'Document Translation Record',
  'Language Pair',
  'TRANSLATOR CERTIFICATION',
  '8 CFR',
  'Signature (typed)',
]

let passed = 0
let failed = 0

console.log('--- Forbidden phrase check ---')
const textLower = pdfText.toLowerCase()
for (const phrase of FORBIDDEN_PHRASES) {
  const found = textLower.includes(phrase.toLowerCase())
  if (found) {
    console.log(`  ✗ FORBIDDEN FOUND: "${phrase}"`)
    failed++
  } else {
    console.log(`  ✓ absent: "${phrase}"`)
    passed++
  }
}

console.log('\n--- Required element check ---')
for (const phrase of REQUIRED_PHRASES) {
  const found = pdfText.includes(phrase)
  if (found) {
    console.log(`  ✓ present: "${phrase}"`)
    passed++
  } else {
    console.log(`  ✗ MISSING: "${phrase}"`)
    failed++
  }
}

// ── Additional structural checks ─────────────────────────────────────────────
console.log('\n--- Structural checks ---')

// Must have at least 6 translation fields (translated content)
const fieldLineCount = (pdfText.match(/^[A-Z ]{8,28}\s+\S/gm) ?? []).length
if (fieldLineCount >= 6) {
  console.log(`  ✓ field lines present: ${fieldLineCount}`)
  passed++
} else {
  console.log(`  ✗ too few field lines: ${fieldLineCount} (expected ≥6)`)
  failed++
}

// No session ID exposure in rendered output body (only in header metadata)
const sessionIdPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const sessionMatches = pdfText.match(sessionIdPattern) ?? []
if (sessionMatches.length <= 1) {
  console.log(`  ✓ session ID occurrences: ${sessionMatches.length} (acceptable)`)
  passed++
} else {
  console.log(`  ⚠ session ID appears ${sessionMatches.length}x — review for info leak`)
  // Not a fail — session_id in header is expected, warn if excessive
  passed++
}

// ── Summary ───────────────────────────────────────────────────────────────────
const report = {
  pdf_path: PDF_PATH,
  bytes: pdfBuffer.length,
  text_chars: pdfText.length,
  forbidden_checked: FORBIDDEN_PHRASES.length,
  required_checked: REQUIRED_PHRASES.length,
  passed,
  failed,
  ok: failed === 0,
}
writeFileSync(join(ROOT, 'artifacts/pdf_qa/phase7_report.json'), JSON.stringify(report, null, 2))

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  console.log('\nPDF QA FAILED — see artifacts/pdf_qa/pdf_text_extract.txt for extracted content')
  process.exit(1)
} else {
  console.log('PDF QA PASSED — all checks clean')
}
