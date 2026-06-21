#!/usr/bin/env node
/**
 * Phase 5 — Confirm/Correct field operations + DB proof
 *
 * Uses the most recent Phase 1 session (session_id passed as arg).
 * Proves:
 *   1. POST /api/translation/[sessionId]/confirm-field  → DB updated
 *   2. POST /api/translation/[sessionId]/correct-field  → DB updated + user_corrections row
 *   3. GET  /api/translation/[sessionId]/review-state   → gates reflect confirmed fields
 *
 * Usage:
 *   node scripts/phase5-confirm-correct-proof.mjs <sessionId>
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnv(f) {
  if (!existsSync(f)) return {}
  const env = {}
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv(join(ROOT, 'apps/web/.env.local'))
const PROD = 'https://uscis-helper-sergiis-projects-8a97ee0f.vercel.app'
const SUPABASE_URL = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

const sessionId = process.argv[2]
if (!sessionId) { console.error('Usage: node phase5-confirm-correct-proof.mjs <sessionId>'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Missing Supabase env vars'); process.exit(1) }

async function sbQuery(table, select, filters = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`
  for (const [k, v] of Object.entries(filters)) url += `&${k}=eq.${encodeURIComponent(v)}`
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
  return r.json()
}

const banner  = t => console.log(`\n${'═'.repeat(66)}\n  ${t}\n${'═'.repeat(66)}`)
const section = t => console.log(`\n${'─'.repeat(66)}\n  ${t}\n${'─'.repeat(66)}`)
const ok      = (msg, data) => { console.log(`✅  ${msg}`); if (data != null) console.log(JSON.stringify(data, null, 2)) }
const fail    = (msg, d)    => { console.error(`❌  FAIL: ${msg}`); if (d) console.error(d); process.exit(1) }

banner('Phase 5 — Confirm / Correct Field Operations')
console.log(`  Session  : ${sessionId}`)
console.log(`  Endpoint : ${PROD}`)

// ── Step 1: GET review-state (baseline) ───────────────────────────────────────
section('Step 1 — GET review-state (baseline before any confirm/correct)')
let baseline
{
  const t0 = Date.now()
  const r = await fetch(`${PROD}/api/translation/${sessionId}/review-state`)
  const ms = Date.now() - t0
  const body = await r.json()
  if (!r.ok) fail(`review-state HTTP ${r.status}`, body)
  baseline = body
  ok(`review-state [${ms}ms] HTTP ${r.status}`, {
    session_id:           body.session_id,
    status:               body.status,
    total_fields:         body.fields?.length ?? 0,
    confirmed_count:      body.fields?.filter(f => f.confirmed).length ?? 0,
    gates: body.gates,
  })
}

// ── Step 2: Confirm 'patronymic' ──────────────────────────────────────────────
section('Step 2 — POST confirm-field  (field: patronymic)')
{
  const t0 = Date.now()
  const r = await fetch(`${PROD}/api/translation/${sessionId}/confirm-field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'patronymic' }),
  })
  const ms = Date.now() - t0
  const body = await r.json()
  if (!r.ok) fail(`confirm-field HTTP ${r.status}`, body)
  ok(`confirm-field [${ms}ms] HTTP ${r.status}`, body)
}

// Verify in DB
{
  const rows = await sbQuery(
    'extracted_fields',
    'field,normalized_value,confirmed,confirmed_at',
    { session_id: sessionId }
  )
  const patronymic = rows.find(r => r.field === 'patronymic')
  if (!patronymic?.confirmed) fail('patronymic.confirmed not set in DB', patronymic)
  ok('DB: patronymic.confirmed = true', patronymic)
}

// ── Step 3: Correct 'given_names' (TAPAC → Taras) ────────────────────────────
section('Step 3 — POST correct-field  (field: given_names, TAPAC → Taras)')
{
  const t0 = Date.now()
  const r = await fetch(`${PROD}/api/translation/${sessionId}/correct-field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      field:     'given_names',
      new_value: 'Taras',
      reason:    'ocr_error',
    }),
  })
  const ms = Date.now() - t0
  const body = await r.json()
  if (!r.ok) fail(`correct-field HTTP ${r.status}`, body)
  ok(`correct-field [${ms}ms] HTTP ${r.status}`, body)
}

// Verify DB: extracted_fields.confirmed = true + normalized_value updated
{
  const rows = await sbQuery(
    'extracted_fields',
    'field,raw_value,normalized_value,confirmed,confirmed_at',
    { session_id: sessionId }
  )
  const gn = rows.find(r => r.field === 'given_names')
  if (!gn?.confirmed)                  fail('given_names.confirmed not set in DB after correct-field', gn)
  if (gn.normalized_value !== 'Taras') fail(`given_names.normalized_value = "${gn.normalized_value}", expected "Taras"`, gn)
  ok('DB: given_names corrected + confirmed', gn)
}

// Verify DB: user_corrections row inserted
{
  const rows = await sbQuery(
    'user_corrections',
    'field,old_value,new_value,reason,correction_type,version',
    { session_id: sessionId }
  )
  const corr = rows.find(r => r.field === 'given_names')
  if (!corr) fail('No user_corrections row for given_names', rows)
  ok(`user_corrections row (version ${corr.version})`, corr)
}

// ── Step 4: Confirm 'surname' ─────────────────────────────────────────────────
section('Step 4 — POST confirm-field  (field: surname)')
{
  const r = await fetch(`${PROD}/api/translation/${sessionId}/confirm-field`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: 'surname' }),
  })
  const body = await r.json()
  if (!r.ok) fail(`confirm-field surname HTTP ${r.status}`, body)
  ok('confirm-field surname', body)
}

// ── Step 5: GET review-state after operations ─────────────────────────────────
section('Step 5 — GET review-state (after confirm/correct)')
let afterState
{
  const r = await fetch(`${PROD}/api/translation/${sessionId}/review-state`)
  const body = await r.json()
  if (!r.ok) fail(`review-state HTTP ${r.status}`, body)
  afterState = body
  const confirmedFields = body.fields?.filter(f => f.confirmed).map(f => f.field) ?? []
  const correctedFields = body.fields?.filter(f => f.user_corrected).map(f => f.field) ?? []
  ok('review-state after operations', {
    total_fields:    body.fields?.length ?? 0,
    confirmed:       confirmedFields,
    user_corrected:  correctedFields,
    gates:           body.gates,
  })
}

// ── Step 6: Full DB snapshot ──────────────────────────────────────────────────
section('Step 6 — Full DB snapshot: extracted_fields + user_corrections')
{
  const rows = await sbQuery(
    'extracted_fields',
    'field,normalized_value,confirmed',
    { session_id: sessionId }
  )
  const confirmed  = rows.filter(r => r.confirmed).map(r => r.field)
  const untouched  = rows.filter(r => !r.confirmed).map(r => r.field)
  console.log(`  Total rows:    ${rows.length}`)
  console.log(`  confirmed:     [${confirmed.join(', ')}]`)
  console.log(`  untouched:     [${untouched.join(', ')}]`)

  // Show user_corrections
  const corrections = await sbQuery(
    'user_corrections',
    'field,old_value,new_value,reason,correction_type,version',
    { session_id: sessionId }
  )
  console.log(`\n  user_corrections rows: ${corrections.length}`)
  for (const c of corrections) {
    console.log(`    field=${c.field}  "${c.old_value}" → "${c.new_value}"  reason=${c.reason}  v${c.version}`)
  }
}

// ── Verdict ───────────────────────────────────────────────────────────────────
banner('Phase 5 — VERDICT')
{
  const fields     = afterState.fields ?? []
  const patronymic = fields.find(f => f.field === 'patronymic')
  const givenNames = fields.find(f => f.field === 'given_names')
  const surname    = fields.find(f => f.field === 'surname')

  const confirmOk  = patronymic?.confirmed && surname?.confirmed
  const correctOk  = givenNames?.confirmed && givenNames?.normalized_value === 'Taras'

  const pass = confirmOk && correctOk

  console.log(`  confirm-field works : ${confirmOk ? '✅' : '❌'}  (patronymic.confirmed=${patronymic?.confirmed}, surname.confirmed=${surname?.confirmed})`)
  console.log(`  correct-field works : ${correctOk ? '✅' : '❌'}  (given_names → "Taras", confirmed=${givenNames?.confirmed}, value="${givenNames?.normalized_value}")`)
  console.log(`  user_corrections row: ✅  (verified in DB)`)
  console.log(`\n  PHASE 5: ${pass ? '✅  PASSED' : '❌  FAILED'}\n`)

  process.exit(pass ? 0 : 1)
}
