#!/usr/bin/env node
/**
 * Phase 2-3 — Critical Field Completeness Matrix + bbox Evidence Proof
 *
 * Queries the DB for the most recent successful session and produces:
 *   Phase 2 — Full 11-field completeness matrix with confidence, normalized values
 *   Phase 3 — Evidence type breakdown: exact / combined / zone_fallback
 *             with actual coordinate values for each bbox type
 *
 * Usage:
 *   node scripts/phase2-3-bbox-proof.mjs [sessionId]
 *   (defaults to most recent session in extracted_fields table)
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {}
  const lines = readFileSync(filePath, 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx < 0) continue
    env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv(join(ROOT, 'apps/web/.env.local'))
const SUPABASE_URL = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase env vars'); process.exit(1)
}

async function sb(table, select, filters = {}, opts = '') {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${opts}`
  for (const [k, v] of Object.entries(filters)) url += `&${k}=eq.${encodeURIComponent(v)}`
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
  return r.json()
}

const banner  = t => console.log(`\n${'═'.repeat(70)}\n  ${t}\n${'═'.repeat(70)}`)
const section = t => console.log(`\n${'─'.repeat(70)}\n  ${t}\n${'─'.repeat(70)}`)

// ── All 11 critical fields ────────────────────────────────────────────────────
const CRITICAL_FIELDS = [
  'document_type', 'series', 'number',
  'surname', 'given_names', 'patronymic',
  'date_of_birth', 'place_of_birth', 'sex',
  'issued_by', 'date_of_issue',
]

const EXTENDED = ['nationality', 'date_of_expiry', 'record_number']

// ── Get session ───────────────────────────────────────────────────────────────
let sessionId = process.argv[2]

if (!sessionId) {
  // Find most recent successful session (has ≥11 extracted_fields rows)
  const rows = await sb(
    'extracted_fields',
    'session_id',
    {},
    '&order=created_at.desc&limit=200'
  )
  // Group by session_id and pick the one with the most rows
  const counts = {}
  for (const r of rows) counts[r.session_id] = (counts[r.session_id] ?? 0) + 1
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (!best) { console.error('❌ No extracted_fields rows found'); process.exit(1) }
  sessionId = best[0]
  console.log(`\n[auto] Using most recent session: ${sessionId} (${best[1]} fields)`)
}

// ── Fetch all fields for this session ─────────────────────────────────────────
const fields = await sb(
  'extracted_fields',
  'field,raw_value,normalized_value,ocr_ids,combined_bbox,bbox_status,evidence_type,confidence,review_required,source_label,source_zone',
  { session_id: sessionId }
)

if (fields.length === 0) {
  console.error(`❌ No extracted_fields rows for session ${sessionId}`); process.exit(1)
}

const byField = Object.fromEntries(fields.map(f => [f.field, f]))

// ── Phase 2: Critical Field Completeness Matrix ───────────────────────────────
banner('Phase 2 — Critical Field Completeness Matrix')
console.log(`\nSession: ${sessionId}`)
console.log(`Total fields extracted: ${fields.length} (11 critical + ${fields.length - 11} extended)\n`)

const CONF_W = 6, RAW_W = 30, NORM_W = 30, STAT_W = 8

console.log(
  '  ' +
  'FIELD'.padEnd(22) + '  ' +
  'STATUS'.padEnd(STAT_W) + '  ' +
  'CONF'.padEnd(CONF_W) + '  ' +
  'RAW VALUE'.padEnd(RAW_W) + '  ' +
  'NORMALIZED'.padEnd(NORM_W) + '  ' +
  'OCR_IDs (first 3)'
)
console.log('  ' + '─'.repeat(130))

let found = 0, missing = 0
for (const field of CRITICAL_FIELDS) {
  const f = byField[field]
  if (f) {
    found++
    const conf  = (f.confidence ?? 0).toFixed(2)
    const raw   = String(f.raw_value ?? '').slice(0, RAW_W - 2)
    const norm  = String(f.normalized_value ?? '').slice(0, NORM_W - 2)
    const ids   = (f.ocr_ids ?? []).slice(0, 3).join(', ')
    const rev   = f.review_required ? ' ⚠' : ''
    console.log(
      `  ✅  ${field.padEnd(20)}  ${'FOUND'.padEnd(STAT_W)}  ${conf.padEnd(CONF_W)}  ${raw.padEnd(RAW_W)}  ${norm.padEnd(NORM_W)}  ${ids}${rev}`
    )
  } else {
    missing++
    console.log(`  ❌  ${field.padEnd(20)}  MISSING`)
  }
}

console.log('\n  ' + '─'.repeat(130))
console.log(`\n  CRITICAL FIELDS: ${found}/11  ${found === 11 ? '✅ ALL FOUND' : `❌ ${missing} MISSING`}`)

// Extended fields
console.log('\n  Extended fields:')
for (const field of EXTENDED) {
  const f = byField[field]
  if (f) {
    const conf = (f.confidence ?? 0).toFixed(2)
    const norm = String(f.normalized_value ?? '').slice(0, 30)
    console.log(`  ✅  ${field.padEnd(20)}  conf=${conf}  normalized="${norm}"`)
  } else {
    console.log(`  ─   ${field.padEnd(20)}  not extracted`)
  }
}

// ── Phase 3: Evidence / bbox proof ────────────────────────────────────────────
banner('Phase 3 — Evidence & bbox Proof')

const exact    = fields.filter(f => f.bbox_status === 'exact')
const combined = fields.filter(f => f.bbox_status === 'combined')
const fallback = fields.filter(f => f.bbox_status === 'missing' || f.evidence_type === 'zone_fallback')

section(`bbox_status breakdown: exact=${exact.length}  combined=${combined.length}  fallback/missing=${fallback.length}`)

// ── Exact bbox examples ───────────────────────────────────────────────────────
section('Exact bbox examples (single-word fields, evidence_type=ocr_bbox)')
console.log(`  ${exact.length} fields with exact single-word bbox:\n`)
for (const f of exact.slice(0, 6)) {
  console.log(`  field: ${f.field}`)
  console.log(`    raw_value:       "${f.raw_value}"`)
  console.log(`    normalized:      "${f.normalized_value}"`)
  console.log(`    ocr_ids:         ${JSON.stringify(f.ocr_ids)}`)
  console.log(`    evidence_type:   ${f.evidence_type}`)
  console.log(`    bbox_status:     ${f.bbox_status}`)
  console.log(`    combined_bbox:   null  (single word — bbox comes directly from OCR word)`)
  console.log()
}

// ── Combined bbox examples ────────────────────────────────────────────────────
section('Combined bbox examples (multi-word fields, evidence_type=combined_ocr_bbox)')
console.log(`  ${combined.length} fields with union-computed combined bbox:\n`)
for (const f of combined) {
  const bb = f.combined_bbox
  let boxStr = 'null'
  if (Array.isArray(bb)) {
    const [x0, y0, x1, y1] = bb
    boxStr = `[x0=${x0.toFixed(4)}, y0=${y0.toFixed(4)}, x1=${x1.toFixed(4)}, y1=${y1.toFixed(4)}]  (normalized 0–1)`
    const w = (x1 - x0).toFixed(4), h = (y1 - y0).toFixed(4)
    boxStr += `\n                 width=${w}  height=${h}`
  }
  console.log(`  field: ${f.field}`)
  console.log(`    raw_value:       "${f.raw_value}"`)
  console.log(`    normalized:      "${f.normalized_value}"`)
  console.log(`    ocr_ids:         ${JSON.stringify(f.ocr_ids)}  (${(f.ocr_ids ?? []).length} tokens)`)
  console.log(`    evidence_type:   ${f.evidence_type}`)
  console.log(`    bbox_status:     ${f.bbox_status}`)
  console.log(`    combined_bbox:   ${boxStr}`)
  console.log()
}

// ── Zone fallback (if any) ────────────────────────────────────────────────────
section(`Zone fallback / missing bbox fields: ${fallback.length}`)
if (fallback.length === 0) {
  console.log('  ✅ Zero zone_fallback fields — all extracted with real OCR token IDs')
} else {
  for (const f of fallback) {
    console.log(`  ⚠️  ${f.field}: evidence_type=${f.evidence_type}  bbox_status=${f.bbox_status}`)
  }
}

// ── Critical field bbox coverage ─────────────────────────────────────────────
section('Critical field bbox coverage (all 11 must have ocr_ids)')
{
  const critRows = CRITICAL_FIELDS.map(f => byField[f]).filter(Boolean)
  const withIds  = critRows.filter(f => Array.isArray(f.ocr_ids) && f.ocr_ids.length > 0)
  const withBbox = critRows.filter(f => f.combined_bbox != null || (Array.isArray(f.ocr_ids) && f.ocr_ids.length > 0))
  const noFallback = critRows.filter(f => f.evidence_type !== 'zone_fallback')

  console.log(`  Critical fields with ocr_ids:  ${withIds.length}/11  ${withIds.length === 11 ? '✅' : '❌'}`)
  console.log(`  Critical fields with bbox:     ${withBbox.length}/11  ${withBbox.length === 11 ? '✅' : '❌'}`)
  console.log(`  Critical fields no fallback:   ${noFallback.length}/11  ${noFallback.length === 11 ? '✅' : '❌'}`)
}

// ── Final verdict ─────────────────────────────────────────────────────────────
banner('Phase 2-3 — VERDICT')
{
  const critFound     = CRITICAL_FIELDS.filter(f => byField[f]).length
  const allHaveIds    = CRITICAL_FIELDS.every(f => byField[f] && Array.isArray(byField[f].ocr_ids) && byField[f].ocr_ids.length > 0)
  const noZoneFall    = CRITICAL_FIELDS.every(f => !byField[f] || byField[f].evidence_type !== 'zone_fallback')
  const hasCombined   = combined.length > 0
  const hasExact      = exact.length > 0

  const pass = critFound === 11 && allHaveIds && noZoneFall && hasCombined && hasExact

  console.log(`  Session         : ${sessionId}`)
  console.log(`  Critical fields : ${critFound}/11  ${critFound === 11 ? '✅' : '❌'}`)
  console.log(`  All have OCR IDs: ${allHaveIds ? '✅' : '❌'}`)
  console.log(`  No zone_fallback: ${noZoneFall ? '✅' : '❌'}`)
  console.log(`  exact bboxes    : ${exact.length}  ${hasExact ? '✅' : '❌'}`)
  console.log(`  combined bboxes : ${combined.length}  ${hasCombined ? '✅' : '❌'}`)
  console.log(`  fallback bboxes : ${fallback.length}  ${fallback.length === 0 ? '✅' : '⚠️'}`)
  console.log(`\n  PHASE 2-3: ${pass ? '✅  PASSED' : '❌  FAILED'}\n`)

  process.exit(pass ? 0 : 1)
}
