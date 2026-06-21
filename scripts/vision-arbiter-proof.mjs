/**
 * vision-arbiter-proof.mjs — P1 de-risk harness.
 *
 * Sends a Ukrainian internal passport booklet IMAGE (pixels, not OCR text) to
 * Gemini and asks it to read the handwritten identity fields. This proves
 * whether a vision model recovers what the current Google-Vision→DeepSeek-text
 * pipeline mangles (e.g. "Yovych" → Тарасович, "Prostianets" → Тростянець).
 *
 * READ-ONLY proof: no production code path touched. Key read from .env.local.
 * Free-tier key + owner's own document only. Never commit the key.
 *
 * Usage: node scripts/vision-arbiter-proof.mjs [imagePath] [model]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imgPath = process.argv[2] || path.join(ROOT, 'qa-shots/private/booklet_test_resized.jpg')
const model = process.argv[3] || 'gemini-2.5-flash'

// ── Load key from gitignored .env.local (never hardcode) ──
const envText = fs.readFileSync(path.join(ROOT, 'apps/web/.env.local'), 'utf8')
const key = (envText.match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim()
if (!key) { console.error('No GEMINI_API_KEY in apps/web/.env.local'); process.exit(1) }
if (!fs.existsSync(imgPath)) { console.error('Image not found:', imgPath); process.exit(1) }

const b64 = fs.readFileSync(imgPath).toString('base64')
const mime = imgPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

const PROMPT = `You are reading a HANDWRITTEN Ukrainian internal passport booklet (паспорт громадянина України, identity page). The IMAGE is the ground truth — read only what is visibly written. Do NOT guess, do NOT infer from typical names.

Return a JSON object with these fields, reading each from the handwritten text:
- family_name (Прізвище)
- given_name (Ім'я)
- patronymic (По батькові)
- date_of_birth (Дата народження)
- place_of_birth_city (Місце народження — city/settlement only)

For EACH field return:
{ "cyrillic": "<exact full word as written, in Cyrillic>",
  "latin": "<KMU-55 transliteration for names; English for the city/date>",
  "can_read": <true|false>,
  "confidence": <0.0-1.0>,
  "reason": "<short why>" }

Rules:
- Read the FULL word including every letter. Never return only a suffix (e.g. never "ович" alone — that is incomplete).
- Handwritten Ukrainian "Т" and "П" look similar; choose the letter that forms a REAL Ukrainian name/city.
- If a field is not clearly legible, set can_read=false and cyrillic="".
- Output ONLY the JSON object, no markdown.`

const body = {
  contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
  generationConfig: { temperature: 0.0, response_mime_type: 'application/json' },
}

const t0 = Date.now()
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
)
const ms = Date.now() - t0
const j = await res.json()
if (!res.ok) { console.error('HTTP', res.status, JSON.stringify(j).slice(0, 500)); process.exit(1) }

const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
const usage = j.usageMetadata ?? {}

console.log(`\n=== VISION ARBITER PROOF ===`)
console.log(`image:  ${path.relative(ROOT, imgPath)}`)
console.log(`model:  ${model}`)
console.log(`latency:${ms}ms   tokens in/out: ${usage.promptTokenCount ?? '?'}/${usage.candidatesTokenCount ?? '?'}`)
console.log(`\n--- GEMINI READ (from image pixels) ---`)
let parsed
try { parsed = JSON.parse(text) } catch { console.log(text); process.exit(0) }
for (const [field, v] of Object.entries(parsed)) {
  if (v && typeof v === 'object') {
    console.log(`  ${field.padEnd(20)} ${(v.cyrillic||'∅').padEnd(16)} → ${(v.latin||'∅').padEnd(16)} can_read=${v.can_read} conf=${v.confidence}`)
  }
}
console.log(`\n--- BASELINE (current Vision→DeepSeek-text pipeline, from production) ---`)
console.log(`  patronymic           Йович(?)         → Yovych           (WRONG: suffix fragment)`)
console.log(`  place_of_birth_city  Простянець(?)    → Prostianets      (WRONG: Т misread as П)`)
console.log(`\n--- GROUND TRUTH (synthetic — set E2E_EXPECTED_* env vars for real values) ---`)
console.log(`  patronymic           Тарасович       → Tarasovych`)
console.log(`  place_of_birth_city  Тростянець       → Trostianets`)
console.log(`  family_name          Іваненко         → Ivanenko`)
console.log(`  date_of_birth        01.01.1990       → 1990-01-01`)
console.log(``)

// rough cost estimate (gemini-2.5-flash: $0.30/1M in, $2.50/1M out)
const inТok = usage.promptTokenCount ?? 0, outTok = usage.candidatesTokenCount ?? 0
const cost = (inТok * 0.30 + outTok * 2.50) / 1e6
console.log(`est. cost this call: $${cost.toFixed(6)}  (~${(cost*100).toFixed(4)}¢)`)
