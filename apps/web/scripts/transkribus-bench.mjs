#!/usr/bin/env node
/**
 * transkribus-bench.mjs — REAL live test of Transkribus HTR on Cyrillic docs.
 *
 * This is the test the engine never had. It runs the metagrapho Processing API
 * (base64-inline POST /processes → poll → /page PAGE XML) against the real
 * document fixtures with each candidate Ukrainian/Russian HTR model, prints the
 * actual recognized text, and writes a report to docs/reports/.
 *
 * AUTH (one of):
 *   TRANSKRIBUS_USERNAME + TRANSKRIBUS_PASSWORD  → password grant (works once the
 *       owner adds a readcoop password; Google-OAuth-only accounts have none).
 *   TRANSKRIBUS_ACCESS_TOKEN                     → a pasted Bearer token. NOTE: a
 *       browser/"webui" token has audience [TrpServer] and will 401 here — it
 *       must be a processing-audience token.
 *
 * Usage:
 *   source ~/.config/messenginfo/secrets/transkribus.env   # or export creds
 *   node apps/web/scripts/transkribus-bench.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../../..')
const FIXTURES = resolve(REPO, 'test-fixtures/real-docs')
const TOKEN_URL = 'https://account.readcoop.eu/auth/realms/readcoop/protocol/openid-connect/token'
const BASE = process.env.TRANSKRIBUS_BASE || process.env.TRANSKRIBUS_API_BASE_URL || 'https://transkribus.eu/processing/v2'

// Candidate models (from memory transkribus-integration-state). htrId = model id.
const MODELS = [
  { id: 148545, label: 'RU handwritten+typed (CER 5.54%)' },
  { id: 144265, label: 'UK handwritten+typed (CER 4.57%)' },
  { id: 132853, label: 'RU+UK XXI century' },
]

// Real fixtures to test — mix of handwritten + printed Cyrillic.
const DOCS = [
  'birth_cert_handwritten_ivanenko.jpg',
  'marriage_1939_kharkiv_borodavka.jpg',
  'military_id_p1_ivanenko.jpg',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getToken() {
  const pasted = (process.env.TRANSKRIBUS_ACCESS_TOKEN || '').replace(/^["']|["']$/g, '').trim()
  const user = process.env.TRANSKRIBUS_USERNAME
  const pass = process.env.TRANSKRIBUS_PASSWORD
  if (user && pass) {
    const body = new URLSearchParams({ grant_type: 'password', client_id: 'processing-api-client', username: user, password: pass })
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.access_token) throw new Error(`password-grant failed ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
    // sanity: decode audience
    try {
      const aud = JSON.parse(Buffer.from(j.access_token.split('.')[1], 'base64').toString()).aud
      console.log(`  token audience: ${JSON.stringify(aud)}`)
    } catch {}
    return j.access_token
  }
  if (pasted) {
    try {
      const aud = JSON.parse(Buffer.from(pasted.split('.')[1], 'base64').toString()).aud
      console.log(`  pasted token audience: ${JSON.stringify(aud)} (must include a processing aud, NOT just TrpServer)`)
    } catch {}
    return pasted
  }
  throw new Error('No credentials. Set TRANSKRIBUS_USERNAME+PASSWORD or TRANSKRIBUS_ACCESS_TOKEN.')
}

async function transcribe(token, b64, htrId) {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const start = await fetch(`${BASE}/processes`, {
    method: 'POST', headers,
    body: JSON.stringify({ config: { textRecognition: { htrId } }, image: { base64: b64 } }),
  })
  const startText = await start.text()
  if (!start.ok) return { error: `POST /processes ${start.status}: ${startText.slice(0, 240)}` }
  const processId = JSON.parse(startText)?.processId
  if (!processId) return { error: `no processId: ${startText.slice(0, 240)}` }

  const deadline = Date.now() + 180000
  let status = ''
  while (Date.now() < deadline) {
    const s = await (await fetch(`${BASE}/processes/${processId}`, { headers: { authorization: headers.authorization } })).json().catch(() => ({}))
    status = String(s?.status ?? '').toUpperCase()
    if (['FINISHED', 'COMPLETED'].includes(status)) break
    if (['FAILED', 'ERROR'].includes(status)) return { error: `process ${status}`, processId }
    await sleep(5000)
  }
  const xml = await (await fetch(`${BASE}/processes/${processId}/page`, { headers: { authorization: headers.authorization } })).text()
  const lines = Array.from(xml.matchAll(/<Unicode>([\s\S]*?)<\/Unicode>/g))
    .map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim())
    .filter(Boolean)
  return { processId, status, lines, rawLen: xml.length }
}

;(async () => {
  console.log(`Transkribus metagrapho bench → ${BASE}`)
  let token
  try { token = await getToken() } catch (e) { console.error('AUTH FAILED:', e.message); process.exit(2) }
  console.log('  token acquired ✓\n')

  const available = new Set(readdirSync(FIXTURES))
  const report = [`# Transkribus HTR — Live Test Report`, ``, `- API: ${BASE}`, `- Date: (stamp on commit)`, ``]

  for (const doc of DOCS) {
    if (!available.has(doc)) { console.log(`SKIP (missing): ${doc}`); report.push(`## ${doc}\n\nMISSING fixture.\n`); continue }
    const b64 = readFileSync(resolve(FIXTURES, doc)).toString('base64')
    console.log(`\n=== ${doc} (${Math.round(b64.length / 1024)}KB b64) ===`)
    report.push(`## ${doc}\n`)
    for (const m of MODELS) {
      process.stdout.write(`  model ${m.id} (${m.label}) ... `)
      try {
        const r = await transcribe(token, b64, m.id)
        if (r.error) { console.log(`ERR: ${r.error}`); report.push(`### model ${m.id} — ${m.label}\n\n**ERROR:** ${r.error}\n`); continue }
        const preview = r.lines.slice(0, 12).join(' / ')
        console.log(`${r.status} — ${r.lines.length} lines`)
        console.log(`     "${preview.slice(0, 200)}"`)
        report.push(`### model ${m.id} — ${m.label}\n\n- status: ${r.status}, lines: ${r.lines.length}\n\n\`\`\`\n${r.lines.join('\n')}\n\`\`\`\n`)
      } catch (e) {
        console.log(`THROW: ${e.message}`)
        report.push(`### model ${m.id} — ${m.label}\n\n**THROW:** ${e.message}\n`)
      }
    }
  }

  const out = resolve(REPO, 'docs/reports/TRANSKRIBUS_LIVE_TEST.md')
  writeFileSync(out, report.join('\n'))
  console.log(`\nReport → ${out}`)
})()
