#!/usr/bin/env node
/**
 * gt-pipeline-bench.mjs — measure the LIVE production pipeline's per-field
 * accuracy on the owner's real Cyrillic documents vs owner-verified ground truth.
 *
 * Faithful by construction: it POSTs each image to the PROD endpoint
 * /api/translation/vision-extract, which runs the exact production read
 * (gemini-3.1-pro-preview + paid prod key + KMU-55 + review gates). No imports,
 * no local key handling — the production brain measures itself.
 *
 * PII: images + raw results stay under gitignored paths. The committable summary
 * (docs/reports/) carries ONLY field names + match booleans + review flags —
 * never a personal value.
 *
 * Usage: node apps/web/scripts/gt-pipeline-bench.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../../..')
const PROD = 'https://messenginfo.com/api/translation/vision-extract'
const EDGE_BODY_LIMIT = 4_000_000 // Vercel serverless request-body cap (~4.5MB); downscale above this

// Core Cyrillic set (cost control: 3 docs). Named fixtures pair 1:1 with GT.
const DOCS = [
  { fixture: 'test-fixtures/real-docs/internal_passport_ivanenko.jpg', gt: 'qa-private/ground-truth/internal_passport_ivanenko.json', docTypeId: 'ua_internal_passport_booklet', label: 'internal_passport_booklet (handwritten)' },
  { fixture: 'test-fixtures/real-docs/birth_cert_handwritten_ivanenko.jpg', gt: 'qa-private/ground-truth/birth_cert_handwritten_ivanenko.json', docTypeId: 'ua_birth_certificate', label: 'birth_certificate (handwritten)' },
  { fixture: 'test-fixtures/real-docs/birth_cert_soviet_ivanenko.jpg', gt: 'qa-private/ground-truth/birth_cert_soviet_ivanenko.json', docTypeId: 'ua_birth_certificate', label: 'birth_certificate (Soviet bilingual)' },
  { fixture: 'test-fixtures/real-docs/military_id_p1_ivanenko.jpg', gt: 'qa-private/ground-truth/military_id_p1_ivanenko.json', docTypeId: 'ua_military_id', label: 'military_id_p1 (printed+hw)' },
]

// Per-doc-class map: route field name → { latin: GT key, cyr?: GT key }.
// Birth cert uses child_* field names in the registry — a generic map mis-scores it.
const PERSON = (prefix = '') => ({
  [`${prefix}family_name`]: { latin: 'family_name_latin', cyr: 'family_name_cyrillic' },
  [`${prefix}given_name`]:  { latin: 'given_name_latin',  cyr: 'given_name_cyrillic' },
  [`${prefix}patronymic`]:  { latin: 'patronymic_latin',  cyr: 'patronymic_cyrillic' },
})
const FIELD_MAP_BY_DOC = {
  ua_internal_passport_booklet: { ...PERSON(), dob: { latin: 'date_of_birth' }, sex: { latin: 'sex' } },
  ua_military_id:               { ...PERSON(), dob: { latin: 'date_of_birth' }, sex: { latin: 'sex' } },
  ua_birth_certificate:         { ...PERSON('child_'), dob: { latin: 'date_of_birth' }, sex: { latin: 'sex' } },
}

function bodyBuffer(absPath) {
  const buf = readFileSync(absPath)
  if (buf.length <= EDGE_BODY_LIMIT) return buf
  // Downscale to mimic a client-side resize (real wizard compresses before upload).
  const out = resolve(tmpdir(), 'gtbench_' + absPath.split('/').pop())
  try {
    execSync(`sips -Z 2400 -s formatOptions 75 "${absPath}" --out "${out}"`, { stdio: 'ignore' })
    return readFileSync(out)
  } catch {
    return buf // sips unavailable → send as-is (will 413 at the edge, recorded as a finding)
  }
}

const norm = (s) => (s ?? '').toString().trim().toLowerCase().replace(/['’ʼ`]/g, "'").replace(/\s+/g, ' ')

async function runDoc(d) {
  const absImg = resolve(REPO, d.fixture)
  const origSize = readFileSync(absImg).length
  const buf = bodyBuffer(absImg)
  const downscaled = buf.length !== origSize
  const gt = JSON.parse(readFileSync(resolve(REPO, d.gt), 'utf8'))
  const FIELD_MAP = FIELD_MAP_BY_DOC[d.docTypeId] ?? {}
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: 'image/jpeg' }), 'doc.jpg')
  fd.append('docTypeId', d.docTypeId)

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 90000)
  let resp
  try {
    const r = await fetch(PROD, { method: 'POST', body: fd, signal: ctrl.signal })
    resp = await r.json()
    resp._http = r.status
  } catch (e) {
    return { label: d.label, error: e.name === 'AbortError' ? 'timeout(90s)' : e.message }
  } finally { clearTimeout(t) }

  const got = {}
  for (const f of resp.fields ?? []) got[f.field] = f

  const verified = new Set(gt._meta?.owner_verified_fields ?? [])
  const rows = []
  for (const [routeField, map] of Object.entries(FIELD_MAP)) {
    // only score fields the owner actually verified (latin or cyrillic counted as verified)
    const isVerified = verified.has(map.latin) || (map.cyr && verified.has(map.cyr)) ||
      (routeField === 'dob' && verified.has('date_of_birth')) || (routeField === 'sex' && verified.has('sex'))
    if (!isVerified) continue
    const g = got[routeField]
    const expLatin = gt[map.latin]
    const expCyr = map.cyr ? gt[map.cyr] : null
    const latinMatch = expLatin != null && expLatin !== '' ? norm(g?.value) === norm(expLatin) : null
    const cyrMatch = expCyr != null && expCyr !== '' ? norm(g?.raw_cyrillic) === norm(expCyr) : null
    rows.push({
      field: routeField,
      present: Boolean(g),
      latin_match: latinMatch,
      cyrillic_match: cyrMatch,
      review_required: g?.review_required ?? null,
      // raw values only in the gitignored raw dump (added below), never in summary
      _exp_latin: expLatin, _got_latin: g?.value ?? null, _exp_cyr: expCyr, _got_cyr: g?.raw_cyrillic ?? null,
    })
  }
  return { label: d.label, docTypeId: d.docTypeId, http: resp._http, status: resp.status ?? null,
    model: resp.model ?? null, fields_returned: (resp.fields ?? []).length, downscaled,
    orig_mb: +(origSize / 1e6).toFixed(1), rows }
}

const results = []
for (const d of DOCS) {
  process.stderr.write(`▶ ${d.label} …\n`)
  results.push(await runDoc(d))
}

// ── raw dump (WITH values) → gitignored qa-private ──────────────────────────
writeFileSync(resolve(REPO, 'qa-private/reports/gt-pipeline-bench-2026-06-10.json'),
  JSON.stringify(results, null, 2))

// ── sanitized summary (NO personal values) → committable ────────────────────
let md = `# GT Pipeline Bench — ${new Date().toISOString().slice(0, 10)} (live prod, gemini-3.1-pro-preview)\n\n`
md += `Measures the LIVE prod /api/translation/vision-extract per-field accuracy vs owner-verified GT.\n`
md += `Field names + match booleans only — NO personal values (those stay in gitignored qa-private).\n`
md += `Sample = 1 doc/class → **EXPLORATORY ONLY** per GT_BENCHMARK_EXIT_CRITERIA (<30/class). Direction, not canary approval.\n\n`
for (const r of results) {
  md += `## ${r.label}\n`
  if (r.error) { md += `- ERROR: ${r.error}\n\n`; continue }
  md += `- http ${r.http} · status \`${r.status}\` · model \`${r.model}\` · fields_returned ${r.fields_returned}`
  md += r.downscaled ? ` · downscaled from ${r.orig_mb}MB (>4MB edge limit)\n\n` : ` · ${r.orig_mb}MB sent as-is\n\n`
  md += `| field | present | latin✓ | cyrillic✓ | review |\n|---|---|---|---|---|\n`
  let lat = 0, latT = 0
  for (const x of r.rows) {
    if (x.latin_match !== null) { latT++; if (x.latin_match) lat++ }
    const b = (v) => v === null ? '—' : v ? '✓' : '✗'
    md += `| ${x.field} | ${x.present ? '✓' : '✗'} | ${b(x.latin_match)} | ${b(x.cyrillic_match)} | ${x.review_required === null ? '—' : x.review_required ? 'review' : 'ok'} |\n`
  }
  md += `\n**Latin accuracy: ${lat}/${latT} verified fields exact.**\n\n`
}
writeFileSync(resolve(REPO, 'docs/reports/GT_PIPELINE_BENCH_2026-06-10.md'), md)
process.stderr.write('✓ wrote docs/reports/GT_PIPELINE_BENCH_2026-06-10.md (sanitized) + qa-private raw dump\n')
console.log(md)
