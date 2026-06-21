#!/usr/bin/env node
/**
 * gemini-ensemble-bench.mjs — comprehensive accuracy bench + ensemble study.
 *
 * For each DOC × MODEL: one structured field read @temp0. Plus Google Vision OCR.
 * Scores every read against hand-verified GROUND TRUTH (from the passport MRZ +
 * cross-document confirmation). Then evaluates 5 ensemble (consensus) configs to
 * find the "smart system" that recognises best.
 *
 * Models confirmed callable on the paid key: 2.5-pro, 3.1-pro-preview, 3.5-flash.
 * Reads keys from apps/web/.env.local. Never prints keys.
 * Writes docs/reports/GEMINI_ENSEMBLE_BENCH.md
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../../..')
const env = readFileSync(resolve(REPO, 'apps/web/.env.local'), 'utf8')
const eg = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] || '').replace(/^["']|["']$/g, '').trim()
const KEY = eg('GEMINI_API_KEY')
const GV_KEY = eg('GOOGLE_CLOUD_VISION_API_KEY') || eg('GOOGLE_VISION_API_KEY')

const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-3.1-pro-preview']
const FIX = resolve(REPO, 'test-fixtures/real-docs')

// Ground truth lives in test-fixtures/real-docs/bench-truth.json (gitignored).
// Copy from ground-truth/ JSON files or ask the owner. Never commit truth inline.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function prompt(fields) {
  return `You read official Ukrainian/Russian (Soviet-era) ID documents. The IMAGE is the only ground truth — read EXACTLY what is written, letter by letter; do NOT guess or infer "typical" values.
Return ONLY a JSON object with these keys: ${fields.join(', ')}.
Each value: {"cyrillic":"<exact text as written; for dates also add iso YYYY-MM-DD>","iso":"<YYYY-MM-DD or omit>","can_read":true|false,"confidence":0.0-1.0}.
Rules: read FULL words (never a suffix). For a passport, you MAY use the MRZ to confirm. If illegible set can_read=false, cyrillic="". Do NOT transliterate. Output ONLY JSON.`
}

async function gemRead(model, b64, fields) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 90000)
  const t0 = Date.now()
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt(fields) }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }], generationConfig: { temperature: 0, response_mime_type: 'application/json', maxOutputTokens: 8192 } }),
    })
    const j = await r.json()
    if (r.status === 503) { await sleep(4000); return gemRead(model, b64, fields) }
    if (!r.ok) return { error: `${r.status} ${j?.error?.status || ''}`, ms: Date.now() - t0 }
    const c = j?.candidates?.[0]
    const txt = c?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? ''
    let parsed = {}; try { parsed = JSON.parse(txt) } catch {}
    return { parsed, finish: c?.finishReason, ms: Date.now() - t0 }
  } catch (e) { return { error: e.name === 'AbortError' ? 'timeout' : e.message, ms: Date.now() - t0 } }
  finally { clearTimeout(t) }
}

async function gvText(b64) {
  if (!GV_KEY) return ''
  try {
    const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GV_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['uk', 'ru', 'en'] } }] }) })
    const j = await r.json(); return (j?.responses?.[0]?.fullTextAnnotation?.text ?? '')
  } catch { return '' }
}

const norm = (s) => (s ?? '').toString().toLocaleLowerCase('uk').replace(/['’ʼ`.,;:№\-\s]/g, '').replace(/і/g, 'и').replace(/ї/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г')
function fieldValue(read, key) {
  const v = read?.parsed?.[key]
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.iso || v.cyrillic || ''
}
// correct if normalized equal, or one contains the other (handles "Тростянець"⊂"смт Тростянець")
function isCorrect(got, truth) {
  const g = norm(got), t = norm(truth)
  if (!g) return false
  if (g === t) return true
  if (t.length >= 4 && (g.includes(t) || t.includes(g))) return true
  // date: compare iso digits
  const gd = (got.match(/\d{4}-\d{2}-\d{2}/) || [])[0], td = (truth.match(/\d{4}-\d{2}-\d{2}/) || [])[0]
  if (gd && td) return gd === td
  return false
}
// for ensembles: do two reads agree on a field?
const agree = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length >= 4 && (x.includes(y) || y.includes(x)))) }

;(async () => {
  const report = ['# Gemini Ensemble Bench — 3 models × 3 docs + 5 consensus configs', '',
    `Models: ${MODELS.join(', ')} · scored vs hand-verified ground truth (passport MRZ + cross-doc).`, '']
  const perDoc = []

  for (const doc of DOCS) {
    const path = resolve(FIX, doc.file)
    if (!existsSync(path)) { report.push(`\n## ${doc.label}\n\nMISSING: ${doc.file}\n`); continue }
    const b64 = readFileSync(path).toString('base64')
    console.log(`\n===== ${doc.label} (${Math.round(b64.length / 1024)}KB) =====`)
    const reads = {}
    for (const m of MODELS) { reads[m] = await gemRead(m, b64, doc.fields); console.log(`  ${m}: ${reads[m].error ? 'ERR ' + reads[m].error : reads[m].finish + ' ' + reads[m].ms + 'ms'}`); await sleep(500) }
    const gv = await gvText(b64)

    // per-model scoring
    report.push(`\n## ${doc.label}\n`)
    report.push('| field | ground truth | ' + MODELS.map((m) => m.replace('gemini-', '')).join(' | ') + ' |')
    report.push('|---|---|' + MODELS.map(() => '---').join('|') + '|')
    const score = Object.fromEntries(MODELS.map((m) => [m, 0]))
    for (const f of doc.fields) {
      const row = [f, doc.truth[f] ?? '—']
      for (const m of MODELS) {
        const val = fieldValue(reads[m], f)
        const ok = doc.truth[f] ? isCorrect(val, doc.truth[f]) : null
        if (ok) score[m]++
        row.push(`${ok === true ? '✅' : ok === false ? '❌' : '·'} ${val || '∅'}`)
      }
      report.push('| ' + row.join(' | ') + ' |')
    }
    const nTruth = doc.fields.filter((f) => doc.truth[f]).length
    report.push('')
    report.push('**Per-model score (correct/total): ' + MODELS.map((m) => `${m.replace('gemini-', '')} ${score[m]}/${nTruth}`).join(' · ') + '**')

    // ── 5 ensembles (consensus): accept a field only when ≥2 voters agree ──
    const ensembles = {
      'E1 3.1pro+3.5flash (≥2)': { members: ['gemini-3.1-pro-preview', 'gemini-3.5-flash'], min: 2, gv: false },
      'E2 3.1pro+2.5pro (≥2)': { members: ['gemini-3.1-pro-preview', 'gemini-2.5-pro'], min: 2, gv: false },
      'E3 3.1pro+3.5flash+2.5flash (≥2)': { members: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-2.5-flash'], min: 2, gv: false },
      'E4 all-5 majority (≥3)': { members: MODELS, min: 3, gv: false },
      'E5 3.1pro+3.5flash+GoogleVision (≥2)': { members: ['gemini-3.1-pro-preview', 'gemini-3.5-flash'], min: 2, gv: true },
    }
    const eScore = {}
    for (const [name, cfg] of Object.entries(ensembles)) {
      let correct = 0, accepted = 0
      for (const f of doc.fields) {
        if (!doc.truth[f]) continue
        const vals = cfg.members.map((m) => fieldValue(reads[m], f)).filter(Boolean)
        let bestVal = '', bestCount = 0
        for (const v of vals) { const c = vals.filter((x) => agree(x, v)).length; if (c > bestCount) { bestCount = c; bestVal = v } }
        let votes = bestCount
        if (cfg.gv && bestVal && norm(gv).includes(norm(bestVal))) votes++
        if (votes >= cfg.min) { accepted++; if (isCorrect(bestVal, doc.truth[f])) correct++ }
      }
      eScore[name] = { correct, accepted, total: nTruth }
    }
    report.push('\n**Ensembles (accept field when ≥2 voters agree):**')
    for (const [name, s] of Object.entries(eScore)) report.push(`- ${name}: ${s.correct}/${s.total} correct, ${s.accepted}/${s.total} auto-accepted`)
    perDoc.push({ doc: doc.label, score, nTruth, eScore })

    if (gv) report.push(`\n<details><summary>Google Vision OCR anchor</summary>\n\n\`\`\`\n${gv.slice(0, 1200)}\n\`\`\`\n</details>`)
  }

  // ── overall summary ──
  report.push('\n## OVERALL\n')
  const totT = perDoc.reduce((a, d) => a + d.nTruth, 0)
  report.push('**Individual models (correct across all docs):**')
  for (const m of MODELS) report.push(`- ${m}: ${perDoc.reduce((a, d) => a + d.score[m], 0)}/${totT}`)
  report.push('\n**Ensembles (correct across all docs):**')
  const enames = Object.keys(perDoc[0]?.eScore ?? {})
  for (const n of enames) report.push(`- ${n}: ${perDoc.reduce((a, d) => a + d.eScore[n].correct, 0)}/${totT} correct, ${perDoc.reduce((a, d) => a + d.eScore[n].accepted, 0)}/${totT} accepted`)

  const out = resolve(REPO, 'docs/reports/GEMINI_ENSEMBLE_BENCH.md')
  writeFileSync(out, report.join('\n'))
  console.log('\n=== OVERALL individual ===')
  for (const m of MODELS) console.log(`  ${m}: ${perDoc.reduce((a, d) => a + d.score[m], 0)}/${totT}`)
  console.log('=== OVERALL ensembles ===')
  for (const n of enames) console.log(`  ${n}: ${perDoc.reduce((a, d) => a + d.eScore[n].correct, 0)}/${totT} correct, ${perDoc.reduce((a, d) => a + d.eScore[n].accepted, 0)}/${totT} accepted`)
  console.log(`\nReport → ${out}`)
})()
