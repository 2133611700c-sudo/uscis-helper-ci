#!/usr/bin/env node
/**
 * Pilot Readiness E2E Proof — Phase 1
 *
 * Part A: 11-field matrix from real OCR session (Google Vision + DeepSeek Text)
 * Part B: Fresh session — confirm all fields → certify → payment → render → PDF inspect
 * Part C: Audit log PII check
 *
 * SYNTHETIC TEST DATA — all names/numbers are fake, clearly labelled as test fixtures.
 * Real OCR session used for field matrix evidence only (not re-running OCR).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ARTIFACTS = join(ROOT, 'artifacts', 'e2e')

function loadEnv (f) {
  if (!existsSync(f)) return {}
  const env = {}
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 0) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv(join(ROOT, 'apps/web/.env.local'))
const PROD         = 'https://uscis-helper-sergiis-projects-8a97ee0f.vercel.app'
const SUPABASE_URL = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

// Real OCR session from previous live proof (Google Vision + DeepSeek Text run)
const LIVE_OCR_SESSION = process.argv[2] ?? '92567d4f-e950-417c-88d7-271615eb9714'

// 11 critical fields required for the field matrix
const ALL_11_CRITICAL = [
  'document_type','series','number','surname','given_names','patronymic',
  'date_of_birth','place_of_birth','sex','issued_by','date_of_issue',
]

// 8 fields that gate certification
const CERT_GATE_FIELDS = ['surname','given_names','date_of_birth','place_of_birth','series','number','issued_by','date_of_issue']

// Synthetic test fixture fields — clearly fake data, labelled as TEST
const SYNTHETIC_FIELDS = [
  { field:'document_type',   source_label:'НАЗВА ДОКУМЕНТА',   raw_value:'ПАСПОРТ',          normalized_value:'PASSPORT',           source_zone:'header_block',      confidence:0.98, review_required:false, ocr_ids:['w_0001'], bbox:[0.05,0.02,0.45,0.07] },
  { field:'series',          source_label:'СЕРІЯ',              raw_value:'АВ',                normalized_value:'AB',                 source_zone:'id_block',          confidence:0.85, review_required:false, ocr_ids:['w_0010'], bbox:[0.05,0.08,0.15,0.12] },
  { field:'number',          source_label:'НОМЕР',              raw_value:'123456',            normalized_value:'123456',             source_zone:'id_block',          confidence:0.92, review_required:false, ocr_ids:['w_0011'], bbox:[0.16,0.08,0.35,0.12] },
  { field:'surname',         source_label:'ПРІЗВИЩЕ',           raw_value:'ТЕСТОВИЙ',         normalized_value:'TESTOVYI',           source_zone:'personal_data',     confidence:0.96, review_required:false, ocr_ids:['w_0020'], bbox:[0.05,0.15,0.55,0.20] },
  { field:'given_names',     source_label:'ІМ\'Я',              raw_value:'ТЕСТ ТЕСТОВИЧ',    normalized_value:'TEST TESTOVYCH',     source_zone:'personal_data',     confidence:0.94, review_required:false, ocr_ids:['w_0021','w_0022'], bbox:[0.05,0.21,0.65,0.26] },
  { field:'patronymic',      source_label:'ПО БАТЬКОВІ',        raw_value:'ТЕСТОВИЧ',         normalized_value:'TESTOVYCH',          source_zone:'personal_data',     confidence:0.93, review_required:false, ocr_ids:['w_0023'], bbox:[0.05,0.27,0.55,0.31] },
  { field:'date_of_birth',   source_label:'ДАТА НАРОДЖЕННЯ',   raw_value:'01 січня 1990',    normalized_value:'01 January 1990',    source_zone:'birth_block',       confidence:0.97, review_required:false, ocr_ids:['w_0030','w_0031','w_0032'], bbox:[0.05,0.35,0.55,0.40] },
  { field:'place_of_birth',  source_label:'МІСЦЕ НАРОДЖЕННЯ',  raw_value:'М. ТЕСТКИЇВ',      normalized_value:'TESTKYIV CITY',      source_zone:'birth_block',       confidence:0.91, review_required:false, ocr_ids:['w_0033'], bbox:[0.05,0.41,0.65,0.46] },
  { field:'sex',             source_label:'СТАТЬ',              raw_value:'Ч',                 normalized_value:'M',                  source_zone:'personal_data',     confidence:0.99, review_required:false, ocr_ids:['w_0040'], bbox:[0.70,0.35,0.80,0.40] },
  { field:'issued_by',       source_label:'ОРГАН ВИДАЧІ',       raw_value:'ТМВ ГУДП МВС ТЕСТ',normalized_value:'TMV HUDP MVS TEST', source_zone:'administrative_block',confidence:0.88,review_required:false, ocr_ids:['w_0050','w_0051'], bbox:[0.05,0.55,0.80,0.62] },
  { field:'date_of_issue',   source_label:'ДАТА ВИДАЧІ',        raw_value:'15 березня 2020',  normalized_value:'15 March 2020',      source_zone:'issuance_block',    confidence:0.96, review_required:false, ocr_ids:['w_0060','w_0061','w_0062'], bbox:[0.05,0.63,0.55,0.68] },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sbQuery (table, select, filters = {}, extra = '') {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${extra}`
  for (const [k, v] of Object.entries(filters)) url += `&${k}=eq.${encodeURIComponent(v)}`
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
  if (!r.ok) throw new Error(`SB ${table}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function sbInsert (table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  })
  if (!r.ok) throw new Error(`SB insert ${table}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function sbPatch (table, filters, data) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?`
  for (const [k, v] of Object.entries(filters)) url += `${k}=eq.${encodeURIComponent(v)}&`
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!r.ok) throw new Error(`SB patch ${table}: ${r.status} ${await r.text()}`)
}

async function apiPost (path, body) {
  const r = await fetch(`${PROD}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null), headers: r.headers }
}

async function apiGet (path) {
  const r = await fetch(`${PROD}${path}`)
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) }
}

const banner  = t => console.log(`\n${'═'.repeat(66)}\n  ${t}\n${'═'.repeat(66)}`)
const section = t => console.log(`\n── ${t}`)
const pass    = m => console.log(`  ✅  ${m}`)
const warn    = m => console.log(`  ⚠️   ${m}`)
const fail    = (m, d) => { console.error(`  ❌  FAIL: ${m}`); if (d) console.error(JSON.stringify(d, null, 2)); process.exit(1) }

mkdirSync(ARTIFACTS, { recursive: true })

// ════════════════════════════════════════════════════════════════════════════════
banner('PART A — 11-Field Matrix from Real OCR Session')
// ════════════════════════════════════════════════════════════════════════════════
console.log(`  Live OCR session: ${LIVE_OCR_SESSION}`)
console.log(`  Source: Google Cloud Vision + DeepSeek Text (v6.0 pipeline)`)

const liveFields = await sbQuery('extracted_fields',
  'field,raw_value,normalized_value,ocr_ids,evidence_type,bbox_status,confidence,review_required',
  { session_id: LIVE_OCR_SESSION }
)

section('11-Field Matrix')
const liveByField = Object.fromEntries(liveFields.map(f => [f.field, f]))

console.log('\n  field              │ status  │ raw_value            │ normalized_value     │ conf  │ review  │ evidence')
console.log('  ───────────────────┼─────────┼──────────────────────┼──────────────────────┼───────┼─────────┼──────────')

let missingCount = 0
for (const f of ALL_11_CRITICAL) {
  const row = liveByField[f]
  if (!row) {
    console.log(`  ${f.padEnd(19)}│ MISSING │ —                    │ —                    │ —     │ —       │ —`)
    missingCount++
  } else {
    const raw = (row.raw_value ?? '').slice(0, 20).padEnd(20)
    const norm = (row.normalized_value ?? '').slice(0, 20).padEnd(20)
    const conf = (row.confidence ?? 0).toFixed(2).padStart(5)
    const rev  = row.review_required ? 'YES' : 'no '
    const ev   = row.evidence_type ?? '—'
    const status = row.review_required ? 'REVIEW ' : 'OK     '
    console.log(`  ${f.padEnd(19)}│ ${status}│ ${raw} │ ${norm} │ ${conf} │ ${rev}     │ ${ev}`)
  }
}

if (missingCount > 0) {
  warn(`${missingCount} critical field(s) missing from real OCR session — completeness guard should catch this`)
} else {
  pass('All 11 critical fields present in real OCR session')
}

// Save field matrix to artifact
const matrixJson = JSON.stringify({ session_id: LIVE_OCR_SESSION, fields: liveFields, all_11_present: missingCount === 0 }, null, 2)
writeFileSync(join(ARTIFACTS, 'field_matrix.json'), matrixJson)
pass(`Field matrix saved to artifacts/e2e/field_matrix.json`)

// ════════════════════════════════════════════════════════════════════════════════
banner('PART B — Full Pipeline: Synthetic Session (confirm → certify → render → PDF)')
// ════════════════════════════════════════════════════════════════════════════════
console.log('  Using synthetic test fixture data — clearly labelled, not real PII')

// Step 1: Create session
section('Step 1 — Create translation session')
const sessionResp = await apiPost('/api/translation/session', { document_type: 'ua_passport_booklet', page_count: 1 })
if (!sessionResp.ok) fail('create session', sessionResp.body)
const sessionId = sessionResp.body.session_id
pass(`Session created: ${sessionId}`)

// Step 2: Seed extracted fields via Supabase admin (simulates completed OCR pipeline)
section('Step 2 — Seed extracted fields (synthetic test fixture)')
const fieldRows = SYNTHETIC_FIELDS.map(f => ({
  session_id: sessionId,
  field: f.field,
  source_label: f.source_label,
  source_zone: f.source_zone,
  raw_value: f.raw_value,
  normalized_value: f.normalized_value,
  language_layer: 'uk',
  confidence: f.confidence,
  review_required: f.review_required,
  confirmed: false,
  ocr_ids: f.ocr_ids,
  combined_bbox: f.bbox,   // DB column is combined_bbox
  evidence_type: f.ocr_ids.length > 1 ? 'combined_ocr_bbox' : 'ocr_bbox',
  bbox_status: f.ocr_ids.length > 1 ? 'combined' : 'exact',
}))
await sbInsert('extracted_fields', fieldRows)
pass(`${fieldRows.length} synthetic fields inserted`)

// Step 3: Confirm all 8 cert-gate fields
section('Step 3 — Confirm all 8 critical fields')
let confirmCount = 0
for (const field of CERT_GATE_FIELDS) {
  const r = await apiPost(`/api/translation/${sessionId}/confirm-field`, { field })
  if (!r.ok) fail(`confirm-field ${field}`, r.body)
  confirmCount++
  console.log(`    ${field}: confirmed (${r.body?.gates?.critical_confirmed}/${r.body?.gates?.critical_total})`)
}
pass(`All ${confirmCount} critical fields confirmed`)

// Step 4: Correct one field (test the correction flow)
section('Step 4 — Correct one field (test correction flow)')
const corrResp = await apiPost(`/api/translation/${sessionId}/correct-field`, {
  field: 'issued_by',
  new_value: 'TEST MUNICIPAL AUTHORITY',
  reason: 'controlling_spelling',
})
if (!corrResp.ok) fail('correct-field', corrResp.body)
pass(`Correction applied: issued_by → "TEST MUNICIPAL AUTHORITY" (type: ${corrResp.body?.correction_type})`)

// Step 5: Verify review-state → can_certify
section('Step 5 — Verify review-state.gates.can_certify = true')
const reviewState = await apiGet(`/api/translation/${sessionId}/review-state`)
if (!reviewState.ok) fail('review-state', reviewState.body)
const gates = reviewState.body?.gates ?? {}
console.log(`    gates:`, JSON.stringify(gates))
if (!gates.can_certify) fail('can_certify is false — not all critical fields confirmed')
pass('can_certify = true')

// Step 6: Certify
section('Step 6 — POST /api/translation/certify')
const certResp = await apiPost('/api/translation/certify', {
  session_id: sessionId,
  signer_name: 'Test Translator',
  signature_typed_name: 'Test Translator',
  source_language: 'Ukrainian',
})
if (!certResp.ok) fail('certify', certResp.body)
const certId = certResp.body?.certification_id ?? certResp.body?.id
pass(`Certified. certification_id: ${certId}`)
console.log(`    version: ${certResp.body?.certification_version}`)

// Verify certification_records row
const certRows = await sbQuery('certification_records', 'id,signer_full_name,signed_at,certification_version', { session_id: sessionId })
if (!certRows.length) fail('certification_records row missing after certify')
pass(`certification_records row: signer="${certRows[0].signer_full_name}", signed_at="${certRows[0].signed_at}", version="${certRows[0].certification_version}"`)

// Step 7: Confirm payment (mock — no real charge)
section('Step 7 — Confirm payment (mock/test mode)')
await sbPatch('translation_sessions', { session_id: sessionId }, { payment_confirmed: true })
pass('payment_confirmed = true (mock — no real charge)')

// Step 8: Render PDF
section('Step 8 — POST /api/translation/render')
const renderResp = await fetch(`${PROD}/api/translation/render`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: sessionId }),
})
const contentType = renderResp.headers.get('content-type') ?? ''
let pdfBytes = null
if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) {
  pdfBytes = Buffer.from(await renderResp.arrayBuffer())
  pass(`PDF rendered: ${pdfBytes.length} bytes, content-type: ${contentType.split(';')[0]}`)
  if (pdfBytes.length < 1000) fail('PDF too small — likely empty or error', { bytes: pdfBytes.length })
  if (!pdfBytes.slice(0, 8).toString('ascii').includes('%PDF')) fail('Not a valid PDF header')
  pass('PDF starts with %PDF (valid PDF magic bytes)')
  writeFileSync(join(ARTIFACTS, 'smoke_test_output.pdf'), pdfBytes)
  pass('PDF saved to artifacts/e2e/smoke_test_output.pdf')
} else {
  const body = await renderResp.json().catch(() => ({}))
  fail(`Render returned non-PDF: status=${renderResp.status}`, body)
}

// Step 9: Verify final_renders row
section('Step 9 — Verify final_renders DB row')
const renderRows = await sbQuery('final_renders', 'storage_key,content_type,file_size_bytes', { session_id: sessionId })
if (!renderRows.length) {
  warn('final_renders row not found — may be stored under a different column')
} else {
  pass(`final_renders row: storage_key="${renderRows[0].storage_key}", size=${renderRows[0].file_size_bytes}B`)
}

// ════════════════════════════════════════════════════════════════════════════════
banner('PART C — Audit Log PII Check')
// ════════════════════════════════════════════════════════════════════════════════
section('Query audit_logs for synthetic session — check for raw PII')

const auditRows = await sbQuery('audit_logs', 'event_type,metadata,created_at', { session_id: sessionId })
console.log(`  Audit events: ${auditRows.length}`)

let piiViolations = 0
const PII_PATTERNS = [
  /тест/i, /testovyi/i, /123456/i, /01 січня/i, /01 january/i,
  /testkyiv/i, /03 march/i, /test translator/i
]

for (const row of auditRows) {
  const metaStr = JSON.stringify(row.metadata ?? {})
  for (const pat of PII_PATTERNS) {
    if (pat.test(metaStr)) {
      piiViolations++
      console.error(`  ❌  PII FOUND in audit_log event "${row.event_type}": pattern ${pat} matched in metadata: ${metaStr.slice(0, 200)}`)
    }
  }
  const safe = JSON.stringify({ event: row.event_type, meta: row.metadata })
  console.log(`    event: ${row.event_type.padEnd(25)} meta keys: ${Object.keys(row.metadata ?? {}).join(', ')}`)
}

if (piiViolations === 0) {
  pass(`No raw PII found in ${auditRows.length} audit log entries`)
} else {
  fail(`${piiViolations} audit log PII violation(s) found`)
}

// ════════════════════════════════════════════════════════════════════════════════
banner('SUMMARY')
// ════════════════════════════════════════════════════════════════════════════════
const summary = {
  generated_at: new Date().toISOString(),
  live_ocr_session: LIVE_OCR_SESSION,
  live_ocr_fields_count: liveFields.length,
  all_11_critical_present: missingCount === 0,
  synthetic_session_id: sessionId,
  fields_seeded: fieldRows.length,
  fields_confirmed: confirmCount,
  correction_applied: true,
  certification_id: certId,
  payment_confirmed_mock: true,
  pdf_bytes: pdfBytes?.length ?? 0,
  audit_log_count: auditRows.length,
  pii_violations: piiViolations,
  verdict: (missingCount === 0 && pdfBytes && pdfBytes.length > 1000 && piiViolations === 0) ? 'PASS' : 'FAIL',
}
console.log('\n', JSON.stringify(summary, null, 2))
writeFileSync(join(ARTIFACTS, 'phase1_summary.json'), JSON.stringify(summary, null, 2))
pass(`Summary saved to artifacts/e2e/phase1_summary.json`)

if (summary.verdict === 'PASS') {
  console.log('\n  ✅  PHASE 1 — PILOT E2E SMOKE TEST: PASS\n')
} else {
  console.error('\n  ❌  PHASE 1 — SOME CHECKS FAILED\n')
  process.exit(1)
}
