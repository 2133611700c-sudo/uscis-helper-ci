#!/usr/bin/env node
/** gpt-bench.mjs — GPT vision models on the same 3 docs + same ground truth as
 *  gemini-ensemble-bench, for a like-for-like comparison. Reads OPENAI_API_KEY
 *  from apps/web/.env.local. Never prints the key. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../../..')
const env = readFileSync(resolve(REPO, 'apps/web/.env.local'), 'utf8')
const KEY = (env.match(/^OPENAI_API_KEY=(.*)$/m)?.[1] || '').replace(/^["']|["']$/g, '').trim()

const MODELS = ['gpt-5.5-pro', 'gpt-5.5', 'gpt-4o']
const FIX = resolve(REPO, 'test-fixtures/real-docs')

// Ground truth lives in test-fixtures/real-docs/bench-truth.json (gitignored).
const BENCH_TRUTH_FILE = resolve(FIX, 'bench-truth.json')
if (!existsSync(BENCH_TRUTH_FILE)) {
  console.error('[bench] bench-truth.json not found at', BENCH_TRUTH_FILE)
  console.error('[bench] Create it from test-fixtures/real-docs/ground-truth/ — see that directory for field names.')
  process.exit(1)
}
const benchTruth = JSON.parse(readFileSync(BENCH_TRUTH_FILE, 'utf8'))
const DOCS = [
  { file: benchTruth.passport.file, label: benchTruth.passport.label, fields: benchTruth.passport.fields, truth: benchTruth.passport.truth },
  { file: benchTruth.birth_cert.file, label: benchTruth.birth_cert.label, fields: benchTruth.birth_cert.fields, truth: benchTruth.birth_cert.truth },
  { file: benchTruth.military_id.file, label: benchTruth.military_id.label, fields: benchTruth.military_id.fields, truth: benchTruth.military_id.truth },
]
const promptFor = (f) => `You read official Ukrainian/Russian (Soviet-era) ID documents. The IMAGE is the only ground truth — read EXACTLY what is written; do NOT guess. Return ONLY JSON with keys: ${f.join(', ')}. Each value {"cyrillic":"<exact text; for dates add iso YYYY-MM-DD>","iso":"<YYYY-MM-DD or omit>","can_read":true|false}. Read FULL words. Do NOT transliterate.`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isReason = (m) => /gpt-5|^o[0-9]/.test(m)

async function gpt(model, b64, fields) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180000); const t0 = Date.now()
  try {
    const body = { model, messages: [{ role: 'user', content: [{ type: 'text', text: promptFor(fields) }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }] }], response_format: { type: 'json_object' }, max_completion_tokens: 8000 }
    if (!isReason(model)) body.temperature = 0
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: JSON.stringify(body) })
    const j = await r.json()
    if (!r.ok) return { error: `${r.status} ${j?.error?.code || j?.error?.type || ''}: ${(j?.error?.message || '').slice(0, 100)}`, ms: Date.now() - t0 }
    let txt = j?.choices?.[0]?.message?.content || ''
    let parsed = {}; try { parsed = JSON.parse(txt) } catch {}
    return { parsed, finish: j?.choices?.[0]?.finish_reason, ms: Date.now() - t0 }
  } catch (e) { return { error: e.name === 'AbortError' ? 'timeout(180s)' : e.message, ms: Date.now() - t0 } }
  finally { clearTimeout(t) }
}
const norm = (s) => (s ?? '').toString().toLocaleLowerCase('uk').replace(/['’ʼ`.,;:№\-\s]/g, '').replace(/і/g,'и').replace(/ї/g,'и').replace(/є/g,'е').replace(/ґ/g,'г')
const fv = (rd, k) => { const v = rd?.parsed?.[k]; if (!v) return ''; return typeof v === 'string' ? v : (v.iso || v.cyrillic || '') }
function ok(got, truth) { const g = norm(got), t = norm(truth); if (!g) return false; if (g === t) return true; if (t.length >= 4 && (g.includes(t) || t.includes(g))) return true; const gd = (got.match(/\d{4}-\d{2}-\d{2}/)||[])[0], td = (truth.match(/\d{4}-\d{2}-\d{2}/)||[])[0]; return gd && td ? gd === td : false }

;(async () => {
  const report = ['# GPT Vision Bench — same 3 docs / same ground truth as Gemini', '', `Models: ${MODELS.join(', ')}`, '']
  const tot = {}; MODELS.forEach((m) => tot[m] = 0); let totT = 0
  for (const doc of DOCS) {
    const path = resolve(FIX, doc.file); if (!existsSync(path)) continue
    const b64 = readFileSync(path).toString('base64')
    console.log(`\n=== ${doc.label} ===`)
    const reads = {}
    for (const m of MODELS) { reads[m] = await gpt(m, b64, doc.fields); console.log(`  ${m}: ${reads[m].error ? 'ERR ' + reads[m].error : reads[m].finish + ' ' + reads[m].ms + 'ms'}`); await sleep(500) }
    report.push(`\n## ${doc.label}\n`)
    report.push('| field | truth | ' + MODELS.join(' | ') + ' |'); report.push('|---|---|' + MODELS.map(() => '---').join('|') + '|')
    const sc = Object.fromEntries(MODELS.map((m) => [m, 0]))
    for (const f of doc.fields) {
      const row = [f, doc.truth[f] ?? '—']
      for (const m of MODELS) { const val = fv(reads[m], f); const c = doc.truth[f] ? ok(val, doc.truth[f]) : null; if (c) sc[m]++; row.push(`${c===true?'✅':c===false?'❌':'·'} ${val||'∅'}`) }
      report.push('| ' + row.join(' | ') + ' |')
    }
    const n = doc.fields.filter((f) => doc.truth[f]).length; totT += n
    MODELS.forEach((m) => tot[m] += sc[m])
    report.push('\n**Score: ' + MODELS.map((m) => `${m} ${sc[m]}/${n}`).join(' · ') + '**')
  }
  report.push('\n## OVERALL\n' + MODELS.map((m) => `- ${m}: ${tot[m]}/${totT}`).join('\n'))
  writeFileSync(resolve(REPO, 'docs/reports/GPT_BENCH.md'), report.join('\n'))
  console.log('\n=== OVERALL ==='); MODELS.forEach((m) => console.log(`  ${m}: ${tot[m]}/${totT}`))
})()
