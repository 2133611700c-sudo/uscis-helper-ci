#!/usr/bin/env node
/**
 * gemini-model-bench.mjs — REAL accuracy bench of every Gemini vision model on
 * the project's real Cyrillic documents. Re-runnable; raw output only, no spin.
 *
 * Per model × doc:
 *   - run A @ temp 0   → the model's primary read
 *   - run B @ temp 1.0 → variance probe; low similarity to A on a doc = the model
 *                        is GUESSING (fabrication), high similarity = stable read.
 * Plus Google Vision OCR as an independent anchor for printed text.
 *
 * Reads keys from apps/web/.env.local. Never prints keys.
 * Writes docs/reports/GEMINI_MODEL_BENCH.md
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../../..')
const env = readFileSync(resolve(REPO, 'apps/web/.env.local'), 'utf8')
const envGet = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] || '').replace(/^["']|["']$/g, '').trim()
const KEY = envGet('GEMINI_API_KEY')
const GV_KEY = envGet('GOOGLE_CLOUD_VISION_API_KEY') || envGet('GOOGLE_VISION_API_KEY')

// Models the PRODUCTION key can actually call (2.5 family → 200). The 3.x
// previews return "API key not valid" for this project, so they're moot for
// prod and excluded. Re-add if 3.x access is granted on the key's project.
const MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]

const FIX = resolve(REPO, 'test-fixtures/real-docs')
const DOCS = [
  { file: 'birth_cert_handwritten_ivanenko.jpg', kind: 'HANDWRITTEN' },
  { file: 'marriage_1939_kharkiv_borodavka.jpg', kind: 'HANDWRITTEN (1939)' },
  { file: 'military_id_p1_ivanenko.jpg', kind: 'PRINTED+hw' },
]

const PROMPT = `You are an expert transcriber of Ukrainian/Russian official documents.
Transcribe EVERY line of text visible in this image EXACTLY as written, in the original
Cyrillic, line by line, top to bottom. Preserve names, dates, places, and numbers precisely.
If a word or character is illegible, write [?] — do NOT guess or invent anything.
Output ONLY the transcription (one document line per output line), nothing else.`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function gem(model, b64, mime, temp) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 90000)
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { temperature: temp, maxOutputTokens: 8192 },
      }),
    })
    const j = await r.json()
    if (r.status === 503) { await sleep(4000); return gem(model, b64, mime, temp) } // transient high-demand retry
    if (!r.ok) return { error: `${r.status} ${j?.error?.status || ''}: ${(j?.error?.message || '').slice(0, 120)}` }
    const cand = j?.candidates?.[0]
    const txt = cand?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? ''
    return { text: txt.trim(), usage: j?.usageMetadata, finish: cand?.finishReason }
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout(90s)' : e.message }
  } finally { clearTimeout(t) }
}

async function googleVision(b64) {
  if (!GV_KEY) return { error: 'no GV key' }
  try {
    const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GV_KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['uk', 'ru'] } }] }),
    })
    const j = await r.json()
    return { text: (j?.responses?.[0]?.fullTextAnnotation?.text ?? '').trim() }
  } catch (e) { return { error: e.message } }
}

// crude char-level similarity (0..1) on normalized Cyrillic
function similarity(a, b) {
  const norm = (s) => s.toLocaleLowerCase('uk').replace(/[^а-яіїєґё0-9]/gu, '')
  const x = norm(a), y = norm(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  // bigram Dice coefficient — robust, no O(n^2) edit matrix on long text
  const bg = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1) } return m }
  const A = bg(x), B = bg(y)
  let inter = 0
  for (const [g, c] of A) if (B.has(g)) inter += Math.min(c, B.get(g))
  return (2 * inter) / ((x.length - 1) + (y.length - 1))
}

// simple concurrency pool
async function pool(items, limit, fn) {
  const out = []
  let i = 0
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  })
  await Promise.all(workers)
  return out
}

;(async () => {
  console.log('Gemini model bench — real Cyrillic docs\n')
  const report = ['# Gemini Model Accuracy Bench — real Cyrillic documents', '',
    `Models: ${MODELS.join(', ')}`, '',
    'Method: run A @temp0 (primary read), run B @temp1.0 (variance probe). On HANDWRITTEN docs, low A↔B similarity = the model is GUESSING. Google Vision OCR = independent anchor.', '']

  for (const doc of DOCS) {
    const path = resolve(FIX, doc.file)
    if (!existsSync(path)) { console.log('MISSING', doc.file); continue }
    const b64 = readFileSync(path).toString('base64')
    const mime = 'image/jpeg'
    console.log(`\n================ ${doc.file} [${doc.kind}] (${Math.round(b64.length / 1024)}KB b64) ================`)
    report.push(`\n## ${doc.file} — ${doc.kind}\n`)

    const gv = await googleVision(b64)
    report.push(`### Google Vision OCR (anchor)\n\n\`\`\`\n${(gv.text || gv.error || '').slice(0, 1500)}\n\`\`\`\n`)
    console.log('  [Google Vision anchor captured]')

    const results = await pool(MODELS, 3, async (model) => {
      const a = await gem(model, b64, mime, 0)
      await sleep(300)
      const b = await gem(model, b64, mime, 1.0)
      const sim = (a.text && b.text) ? similarity(a.text, b.text) : 0
      const line = `${model}: ${a.error ? 'ERR ' + a.error : `${a.text.split('\n').filter(Boolean).length} lines, A↔B sim ${(sim * 100).toFixed(0)}%${a.finish && a.finish !== 'STOP' ? ' [' + a.finish + ']' : ''}`}`
      console.log('  ' + line)
      return { model, a, b, sim }
    })

    for (const r of results) {
      report.push(`### ${r.model}\n`)
      if (r.a.error) { report.push(`**ERROR (temp0):** ${r.a.error}\n`); continue }
      const flag = doc.kind.startsWith('HANDWRITTEN')
        ? (r.sim >= 0.75 ? '🟢 stable (consistent read)' : r.sim >= 0.5 ? '🟡 partly unstable' : '🔴 UNSTABLE — likely fabricating')
        : (r.sim >= 0.85 ? '🟢 stable' : '🟡 some variance')
      report.push(`- A↔B similarity: **${(r.sim * 100).toFixed(0)}%** ${flag}`)
      report.push(`- finishReason: ${r.a.finish ?? '?'}${r.a.finish === 'MAX_TOKENS' ? ' (output truncated/empty — thinking ate the budget)' : ''}`)
      report.push(`- tokens (A): in ${r.a.usage?.promptTokenCount ?? '?'} / out ${r.a.usage?.candidatesTokenCount ?? '?'} / thoughts ${r.a.usage?.thoughtsTokenCount ?? 0}\n`)
      report.push(`**Read @temp0:**\n\n\`\`\`\n${r.a.text.slice(0, 1800)}\n\`\`\`\n`)
      report.push(`**Read @temp1 (variance probe):**\n\n\`\`\`\n${(r.b.text || r.b.error || '').slice(0, 1800)}\n\`\`\`\n`)
    }
  }

  const out = resolve(REPO, 'docs/reports/GEMINI_MODEL_BENCH.md')
  writeFileSync(out, report.join('\n'))
  console.log(`\n✓ Report → ${out}`)
})()
