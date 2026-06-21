#!/usr/bin/env node
/**
 * real-ocr-e2e.mjs — REAL Gemini OCR proof against a live Vercel preview.
 *
 * For each PII-FREE synthetic fixture it POSTs the image to the LIVE
 *   POST /api/translation/vision-extract        (real docintel → real Gemini)
 * and asserts the canonical rows the route returns. NOTHING is mocked: the OCR
 * value comes only from Gemini's read of the real image. There is no expected-value
 * substitution and no fallback "flash number" — per ADR-018 a 429/quota is a
 * BLOCKED outcome, NEVER a pass.
 *
 * Request contract (apps/web/src/app/api/translation/vision-extract/route.ts):
 *   multipart/form-data, repeated `file` field (≤6 pages), optional `docTypeId`
 *   (default 'ua_internal_passport_booklet'), optional `documentSessionId`.
 *   Response: { ok, doc_type_id, fields: FieldOut[], status, ... }
 *   FieldOut = { field, value, raw_cyrillic, confidence, review_required, kind, ... }
 *
 * Honest failure:
 *   - HTTP 429 / error_code OCR_QUOTA_EXHAUSTED|OCR_RATE_LIMITED|OCR_BILLING_DISABLED
 *     → print OCR_BLOCKED_QUOTA and exit 2 (CI marks the run BLOCKED, not green).
 *   - any assertion failure → exit 1.
 *
 * Usage:  node scripts/real-ocr-e2e.mjs <BASE_URL> [outDir]
 *   BASE_URL   the preview deployment root (e.g. https://xxx.vercel.app)
 *   outDir     where to drop ocr-*.json (default ./translation-ocr-artifacts)
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'translation-synthetic')

const BASE_URL = (process.argv[2] || process.env.E2E_BASE_URL || '').replace(/\/$/, '')
const OUT_DIR = process.argv[3] || join(ROOT, 'translation-ocr-artifacts')
if (!BASE_URL) {
  console.error('ERROR: BASE_URL required: node scripts/real-ocr-e2e.mjs <BASE_URL> [outDir]')
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const CYRILLIC_RE = /[Ѐ-ӿ]/

const BLOCK_CODES = new Set([
  'OCR_QUOTA_EXHAUSTED',
  'OCR_RATE_LIMITED',
  'OCR_BILLING_DISABLED',
  'OCR_BUDGET_EXCEEDED',
])

/** Throw a sentinel so the caller can distinguish a quota-BLOCK from a real fail. */
class BlockedError extends Error {
  constructor(code, detail) {
    super(`OCR_BLOCKED_QUOTA: ${code} — ${detail}`)
    this.code = code
  }
}

// Controlled retry/backoff (ADR-018, owner directive): a TRANSIENT rate-limit (RPM
// window) is retried with increasing backoff (respecting retry-after); a HARD quota/
// billing block is not retried (it will not recover in seconds) and fails honestly.
const HARD_BLOCK = new Set(['OCR_QUOTA_EXHAUSTED', 'OCR_BILLING_DISABLED'])
const BACKOFFS_MS = [12_000, 25_000, 45_000, 70_000]
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

async function visionExtract(fixtureName, docTypeId) {
  const path = join(FIXTURES, fixtureName)
  if (!existsSync(path)) throw new Error(`fixture missing: ${path} (run scripts/synthetic-docs/generate.py)`)
  const buf = readFileSync(path)

  let lastBlock = null
  for (let attempt = 0; attempt <= BACKOFFS_MS.length; attempt++) {
    const fd = new FormData()
    fd.append('file', new Blob([buf], { type: 'image/png' }), fixtureName)
    fd.append('docTypeId', docTypeId)
    fd.append('documentSessionId', `real-ocr-e2e-${fixtureName}-${attempt}`)

    const t0 = Date.now()
    const r = await fetch(`${BASE_URL}/api/translation/vision-extract`, {
      method: 'POST', headers: { 'User-Agent': UA }, body: fd,
    })
    const ms = Date.now() - t0
    const raw = await r.text()
    let body
    try { body = JSON.parse(raw) } catch { body = { _unparsed: raw.slice(0, 400) } }

    const code = body?.error_code
    const blocked = r.status === 429 || (code && BLOCK_CODES.has(code))
    if (!blocked) return { httpStatus: r.status, ms, body }

    lastBlock = new BlockedError(code || `HTTP_${r.status}`, body?.message || raw.slice(0, 200))
    // Hard quota/billing → do not burn time retrying.
    if (code && HARD_BLOCK.has(code)) throw lastBlock
    // Transient rate-limit → backoff (respect retry-after) and retry.
    if (attempt < BACKOFFS_MS.length) {
      const retryAfter = Number(r.headers.get('retry-after')) * 1000
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : BACKOFFS_MS[attempt]
      console.log(`  rate-limited (${code || r.status}); backoff ${Math.round(wait / 1000)}s, retry ${attempt + 1}/${BACKOFFS_MS.length}`)
      await sleep(wait)
    }
  }
  throw lastBlock
}

// ── assertion helpers ────────────────────────────────────────────────────────
const results = []
function record(name, ok, detail) {
  results.push({ check: name, ok, detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fieldByKindOrName(fields, ...needles) {
  const ns = needles.map((n) => n.toLowerCase())
  return (fields || []).find((f) => {
    const hay = `${f.field || ''} ${f.kind || ''}`.toLowerCase()
    return ns.some((n) => hay.includes(n))
  })
}
function anyValueMatches(fields, re) {
  return (fields || []).some((f) => typeof f.value === 'string' && re.test(f.value))
}
function anyReview(fields) {
  return (fields || []).some((f) => f.review_required === true)
}
function noCyrillicLeakInValues(fields) {
  // raw_cyrillic legitimately holds Cyrillic; only `value` (the English/Latin
  // output) must be Cyrillic-free.
  return (fields || []).every((f) => !(typeof f.value === 'string' && CYRILLIC_RE.test(f.value)))
}

// ── scenario runners ─────────────────────────────────────────────────────────
async function run() {
  let blocked = null
  const scenarios = [
    {
      file: 'ua_birth_printed.png',
      docTypeId: 'ua_birth_certificate',
      assert: (fields) => {
        record('ua_birth: surname → Shevchenko (KMU-55)',
          anyValueMatches(fields, /shevchenko/i),
          'surname value')
        record('ua_birth: given name → Taras (KMU-55)',
          anyValueMatches(fields, /taras/i), 'given value')
        const place = fieldByKindOrName(fields, 'place_of_birth', 'birth_place', 'place')
        record('ua_birth: смт → "urban-type settlement" (never city/town)',
          !!place && /urban-type settlement/i.test(place.value || '') &&
            !/\b(city|town)\b/i.test(place.value || ''),
          place ? `place="${place.value}"` : 'no place field read')
        record('ua_birth: no Cyrillic leak in English values',
          noCyrillicLeakInValues(fields))
      },
    },
    {
      file: 'ru_printed.png',
      docTypeId: 'ua_birth_certificate', // ru-script content forces ru handling/review
      assert: (fields) => {
        record('ru_printed: extracted some fields', (fields || []).length > 0,
          `${(fields || []).length} fields`)
        record('ru_printed: review flagged (ru handling)', anyReview(fields))
        record('ru_printed: no Cyrillic leak in English values',
          noCyrillicLeakInValues(fields))
      },
    },
    {
      file: 'ua_passport_mrz.png',
      docTypeId: 'ua_international_passport',
      assert: (fields) => {
        // MRZ authority value is Latin (controlling Latin spelling beats re-translit).
        record('passport: surname Latin from MRZ/bio (Shevchenko)',
          anyValueMatches(fields, /shevchenko/i))
        record('passport: no Cyrillic leak in English values',
          noCyrillicLeakInValues(fields))
      },
    },
    {
      file: 'ambiguous_script.png',
      docTypeId: 'ua_birth_certificate',
      assert: (fields) => {
        record('ambiguous: review_required (uk/ru shared letters)', anyReview(fields),
          'shared-script name must not be silently resolved')
      },
    },
    {
      file: 'handwritten_critical.png',
      docTypeId: 'ua_birth_certificate',
      assert: (fields) => {
        // Critical field uncertain → finalValue null + review_required (C3 discipline).
        const date = fieldByKindOrName(fields, 'date_of_birth', 'birth_date', 'date', 'dob')
        const reviewed = anyReview(fields)
        record('handwritten: review_required raised', reviewed)
        if (date) {
          record('handwritten critical date: null final OR review_required',
            date.value === null || date.value === '' || date.review_required === true,
            `date value=${JSON.stringify(date.value)} review=${date.review_required}`)
        } else {
          record('handwritten critical date: field surfaced for review',
            reviewed, 'no explicit date field; document-level review must hold')
        }
      },
    },
  ]

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i]
    if (i > 0) await sleep(8_000) // space requests so 5 docs don't burst the per-minute limit
    console.log(`\n── ${s.file}  (docTypeId=${s.docTypeId}) ─────────────────────────`)
    try {
      const { httpStatus, ms, body } = await visionExtract(s.file, s.docTypeId)
      writeFileSync(
        join(OUT_DIR, `ocr-${s.file.replace(/\.png$/, '')}.json`),
        JSON.stringify({ httpStatus, ms, body }, null, 2),
      )
      console.log(`  http=${httpStatus} ms=${ms} ok=${body?.ok} status=${body?.status} ` +
        `provider=${body?.provider || ''} model=${body?.model || ''} fields=${(body?.fields || []).length}`)
      if (body?.ok !== true) {
        record(`${s.file}: route ok:true`, false, `status=${body?.status} error=${body?.error || ''}`)
        continue
      }
      s.assert(body.fields || [])
    } catch (e) {
      if (e instanceof BlockedError) {
        blocked = e
        break
      }
      record(`${s.file}: request`, false, e.message)
    }
  }

  // Aggregate
  const summary = {
    base_url: BASE_URL,
    generated_at: new Date().toISOString(),
    blocked: blocked ? { code: blocked.code, message: blocked.message } : null,
    checks: results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  }
  writeFileSync(join(OUT_DIR, 'ocr-summary.json'), JSON.stringify(summary, null, 2))

  if (blocked) {
    console.error(`\nOCR_BLOCKED_QUOTA  ${blocked.code}: ${blocked.message}`)
    console.error('Per ADR-018 this is a BLOCKED outcome, not a pass. Failing honestly.')
    process.exit(2)
  }
  console.log(`\n=== real OCR E2E: ${summary.passed} passed, ${summary.failed} failed ===`)
  process.exit(summary.failed === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
