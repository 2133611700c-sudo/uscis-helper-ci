#!/usr/bin/env tsx
/**
 * cyrillic-acceptance.ts — HONEST per-field acceptance of the LIVE pipeline on the
 * owner's REAL Ukrainian documents, scored with the corrected scorer
 * (cyrillicAcceptanceMetrics): EMPTY is a first-class failure, fabrication is
 * distinct from empty, raw_cyrillic flow is verified, transliteration is checked.
 *
 * Runs the REAL local pipeline (readDocument → gemini-3.1-pro-preview + KMU-55 +
 * review gates) using the local GEMINI_API_KEY. If the provider is rate-limited it
 * reports BLOCKED_PROVIDER_RATE_QUOTA — the runner is still fully exercised and the
 * SAME command produces real numbers the moment quota is available (no code change).
 *
 * PII: real images live under gitignored test-fixtures/real-docs; the raw per-field
 * dump goes to gitignored qa-private/reports. The committable report carries ONLY
 * opaque ids + field NAMES + counts/booleans — never a personal value.
 *
 * Usage:  pnpm --filter web run benchmark:cyrillic-private
 *   env:  loads apps/web/.env.local (GEMINI_API_KEY)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readDocument } from '@/lib/docintel/documentFieldReader'
import {
  scoreDocumentAcceptance, acceptanceVerdict, rollupByType,
  type AcceptanceProducedField,
} from '@/lib/canonical/core/cyrillicAcceptanceMetrics'
import type { GroundTruth } from '@/lib/canonical/core/benchmark'
import { PRIMARY_READER, acceptanceModelVerdict } from '@/lib/docintel/modelMatrix'

const __dir = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dir, '../../..')

// Zero-dependency .env.local loader (apps/web/.env.local → process.env), so the
// runner needs no extra deps and typechecks cleanly. Existing env wins.
function loadEnvLocal(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvLocal(resolve(__dir, '..', '.env.local'))

// ── Corpus manifest is PRIVATE (gitignored) so the committed script carries NO real
//    filenames (which contain the owner surname). opaque_id keeps the report PII-free.
//    Absent manifest ⇒ INSUFFICIENT_CORPUS (honest), never a fake result. ───────────
type Entry = { opaque_id: string; image: string; gt: string; docTypeId: string }
const MANIFEST_PATH = resolve(REPO, 'qa-private/acceptance-manifest.json')
const MANIFEST: Entry[] = existsSync(MANIFEST_PATH)
  ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).entries as Entry[])
  : []

// route field → { latin: GT key, cyr?: GT key }. Birth cert uses child_* in the registry.
const PERSON = (p = '') => ({
  [`${p}family_name`]: { latin: 'family_name_latin', cyr: 'family_name_cyrillic' },
  [`${p}given_name`]:  { latin: 'given_name_latin',  cyr: 'given_name_cyrillic' },
  [`${p}patronymic`]:  { latin: 'patronymic_latin',  cyr: 'patronymic_cyrillic' },
})
const FIELD_MAP: Record<string, Record<string, { latin: string; cyr?: string }>> = {
  ua_internal_passport_booklet: { ...PERSON(), dob: { latin: 'date_of_birth' }, sex: { latin: 'sex' } },
  ua_military_id:               { ...PERSON(), dob: { latin: 'date_of_birth' }, sex: { latin: 'sex' } },
  ua_birth_certificate:         { ...PERSON('child_'), dob: { latin: 'date_of_birth' }, sex: { latin: 'sex' } },
  ua_international_passport:     { ...PERSON(), passport_number: { latin: 'passport_number' }, dob: { latin: 'date_of_birth' }, sex: { latin: 'sex' }, passport_expiration_date: { latin: 'passport_expiration_date' }, date_of_issue: { latin: 'date_of_issue' }, city_of_birth: { latin: 'place_of_birth_english' } },
}

// FIELD APPLICABILITY per (doc type, field), established by inspecting the REAL
// source images. A field is scored for DOCUMENT-NATIVE OCR accuracy ONLY when it is
// EXPLICIT on the source. NOT_PRESENT / DERIVABLE fields are NOT OCR failures — they
// belong to APPLICATION COMPLETENESS (filled from MRZ / another document / user input)
// and are reported separately, never penalising the OCR number.
//   - ua_military_id.sex     = NOT_PRESENT  (military booklet page has no sex field)
//   - ua_birth_certificate.sex = DERIVABLE  (no explicit field; only grammar народився)
const APPLICABILITY: Record<string, Record<string, 'EXPLICIT' | 'NOT_PRESENT' | 'DERIVABLE'>> = {
  ua_military_id:        { sex: 'NOT_PRESENT' },
  ua_birth_certificate:  { sex: 'DERIVABLE' },
}
const fieldApplicability = (docType: string, field: string): 'EXPLICIT' | 'NOT_PRESENT' | 'DERIVABLE' =>
  APPLICABILITY[docType]?.[field] ?? 'EXPLICIT'

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ADR-018 LAW: a quality/acceptance number is valid ONLY from the PRIMARY_READER.
// A successful read from a FALLBACK model (flash) is availability, NEVER acceptance —
// flash is disqualified on handwritten certificates (read a different person). The
// runner records NON_PRIMARY_MODEL and refuses to score it as quality.
type ProviderStatus =
  | 'ok' | 'BLOCKED_PROVIDER_RATE_QUOTA' | 'PROVIDER_ERROR' | 'NO_KEY' | 'NON_PRIMARY_MODEL'

/** readDocument with bounded retry on transient 429 (honest, spaced). */
async function readWithRetry(buf: Buffer, docTypeId: string): Promise<{ result: Awaited<ReturnType<typeof readDocument>>; providerStatus: ProviderStatus }> {
  if (!process.env.GEMINI_API_KEY) return { result: { ok: false, doc_type_id: docTypeId, fields: [], anchor_read: false, provider: null, model: null, ms: 0, status: 'no_key' } as never, providerStatus: 'NO_KEY' }
  let last!: Awaited<ReturnType<typeof readDocument>>
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await readDocument(buf, 'image/jpeg', docTypeId, { timeoutMs: 120000 })
    if (last.ok) {
      // HARD GATE: a read that succeeded only via a fallback model is NOT acceptance-valid.
      const verdict = acceptanceModelVerdict(last.model)
      return { result: last, providerStatus: verdict.valid ? 'ok' : 'NON_PRIMARY_MODEL' }
    }
    const code = (last as { provider_error?: { error_code?: string } }).provider_error?.error_code
    if (code === 'OCR_RATE_LIMITED' || code === 'OCR_QUOTA_EXHAUSTED') {
      if (attempt < 3) { await sleep(attempt * 4000); continue }
      return { result: last, providerStatus: 'BLOCKED_PROVIDER_RATE_QUOTA' }
    }
    return { result: last, providerStatus: 'PROVIDER_ERROR' }
  }
  return { result: last, providerStatus: 'BLOCKED_PROVIDER_RATE_QUOTA' }
}

async function main() {
  if (MANIFEST.length === 0) {
    console.log(JSON.stringify({
      title: 'CYRILLIC_PILOT_ACCEPTANCE_COMPLETE', runner_status: 'READY',
      provider_status: 'NO_KEY', pilot_result: 'INSUFFICIENT_CORPUS',
      note: 'No qa-private/acceptance-manifest.json — drop real images + verified GT there and re-run.',
    }, null, 2))
    return
  }
  const seenSha = new Map<string, string>()
  const privateDetail: unknown[] = []
  const perDocMetrics = []
  const inventory: Record<string, unknown>[] = []
  let anyProviderOk = false
  let anyQuotaBlock = false
  let anyNonPrimary = false

  for (const e of MANIFEST) {
    const absImg = resolve(REPO, e.image)
    if (!existsSync(absImg)) { inventory.push({ opaque_id: e.opaque_id, image_present: false, doc_type: e.docTypeId }); continue }
    const buf = readFileSync(absImg)
    const sha = sha256(buf)
    const dupOf = seenSha.get(sha)
    if (!dupOf) seenSha.set(sha, e.opaque_id)
    const gt = JSON.parse(readFileSync(resolve(REPO, e.gt), 'utf8'))
    const verified: string[] = gt._meta?.owner_verified_fields ?? []
    const map = FIELD_MAP[e.docTypeId] ?? {}

    process.stderr.write(`▶ ${e.opaque_id} ${e.docTypeId} (sha ${sha.slice(0, 8)}${dupOf ? ` DUP_OF:${dupOf}` : ''}) …\n`)
    const { result, providerStatus } = await readWithRetry(buf, e.docTypeId)
    if (providerStatus === 'ok') anyProviderOk = true
    if (providerStatus === 'BLOCKED_PROVIDER_RATE_QUOTA') anyQuotaBlock = true
    if (providerStatus === 'NON_PRIMARY_MODEL') anyNonPrimary = true

    const got: Record<string, { value?: string | null; raw_cyrillic?: string | null; review_required?: boolean; finalValue?: string | null }> = {}
    for (const f of result.fields ?? []) got[f.field] = f as never

    // Build GT (scored fields ONLY = owner-verified) + produced fields for the corrected scorer.
    const gtFields: GroundTruth['fields'] = {}
    const produced: AcceptanceProducedField[] = []
    const applicationRequired: { field: string; applicability: string }[] = []
    let rawCyrillicReached = 0, rawCyrillicExpected = 0
    for (const [routeField, m] of Object.entries(map)) {
      const isVerified = verified.includes(m.latin) || (m.cyr && verified.includes(m.cyr)) ||
        (routeField === 'dob' && verified.includes('date_of_birth')) || (routeField === 'sex' && verified.includes('sex'))
      if (!isVerified) continue
      // APPLICABILITY: a field NOT_PRESENT or only DERIVABLE on the source is NOT a
      // document-native OCR field — exclude it from OCR accuracy and record it for
      // application completeness (must come from MRZ / another document / user input).
      const applic = fieldApplicability(e.docTypeId, routeField)
      if (applic !== 'EXPLICIT') { applicationRequired.push({ field: routeField, applicability: applic }); continue }
      const expLatin = gt[m.latin]
      if (expLatin == null || expLatin === '') continue
      gtFields[routeField] = { value: String(expLatin), critical: true }
      const g = got[routeField]
      produced.push({
        key: routeField, value: g?.value ?? null,
        rawCyrillic: g?.raw_cyrillic ?? null, reviewRequired: g?.review_required ?? false,
        finalValue: (g as { finalValue?: string | null })?.finalValue,
      })
      if (m.cyr && gt[m.cyr]) { rawCyrillicExpected++; if (g?.raw_cyrillic && g.raw_cyrillic.trim()) rawCyrillicReached++ }
    }

    const gtDoc: GroundTruth = { document_id: e.opaque_id, doc_type: e.docTypeId, fields: gtFields }
    const { metrics, verdicts } = scoreDocumentAcceptance(produced, gtDoc)
    // ADR-018 LAW: ONLY a primary-reader read contributes a quality/acceptance number.
    // A fallback (flash) read is recorded but NEVER aggregated as quality.
    // SHA dedup: a byte-identical image (same document under two labels) is ONE
    // quality sample — never double-count it in the accuracy denominator.
    if (providerStatus === 'ok' && !dupOf) perDocMetrics.push(metrics)

    inventory.push({
      opaque_id: e.opaque_id, doc_type: e.docTypeId, image_present: true,
      image_sha256_prefix: sha.slice(0, 12), bytes: buf.length, duplicate_of: dupOf ?? null,
      verified_critical_fields: Object.keys(gtFields).length, provider_status: providerStatus,
      model_used: result.model ?? null, primary_reader_required: PRIMARY_READER,
      acceptance_scored: providerStatus === 'ok',
      read_status: result.status, fields_returned: (result.fields ?? []).length,
      raw_cyrillic_reached: `${rawCyrillicReached}/${rawCyrillicExpected}`,
      application_required_not_document_sourced: applicationRequired,
      counted_in_accuracy: providerStatus === 'ok' && !dupOf,
    })
    // private detail (WITH no values — only field-level verdicts + flags) → gitignored
    privateDetail.push({ opaque_id: e.opaque_id, providerStatus, metrics, verdicts })
  }

  const rollup = rollupByType(perDocMetrics)

  // ── PII-free aggregate ────────────────────────────────────────────────────────
  // Precedence: a primary read ⇒ ok. Else if anything 429'd ⇒ quota-blocked. Else if a
  // fallback model read (but no primary) ⇒ NON_PRIMARY_MODEL (NOT a quality result —
  // ADR-018: acceptance is measured ONLY on the primary reader).
  const provider_status: ProviderStatus = anyProviderOk
    ? 'ok'
    : anyQuotaBlock ? 'BLOCKED_PROVIDER_RATE_QUOTA'
    : anyNonPrimary ? 'NON_PRIMARY_MODEL'
    : 'PROVIDER_ERROR'
  const matchedPairs = inventory.filter((i) => i.image_present).length
  const distinctImages = seenSha.size
  const totalCrit = perDocMetrics.reduce((a, m) => a + m.critical_total, 0)
  const sumExact = perDocMetrics.reduce((a, m) => a + Math.round(m.critical_field_exact_match * m.critical_total), 0)
  const sumEmpty = perDocMetrics.reduce((a, m) => a + m.empty_critical_fields, 0)
  const sumFab = perDocMetrics.reduce((a, m) => a + m.fabricated_critical_fields, 0)
  const sumFalseFinal = perDocMetrics.reduce((a, m) => a + m.false_final_critical, 0)

  const runner_status = 'READY' // it loaded the corpus, verified SHA, ran the real pipeline, scored
  const pilot_result =
    provider_status === 'ok'
      ? (sumFab === 0 && sumFalseFinal === 0 && totalCrit > 0 && sumExact / totalCrit >= 0.95 ? 'READY' : 'NOT_READY')
      : provider_status === 'BLOCKED_PROVIDER_RATE_QUOTA' ? 'BLOCKED_PROVIDER_RATE_QUOTA'
      : provider_status === 'NON_PRIMARY_MODEL' ? 'BLOCKED_PRIMARY_MODEL_UNAVAILABLE'
      : matchedPairs === 0 ? 'INSUFFICIENT_CORPUS' : 'NOT_READY'

  const report = {
    title: 'CYRILLIC_PILOT_ACCEPTANCE_COMPLETE',
    note: 'Apparatus + small-sample pilot. EMPTY/review/null are NEVER counted as success.',
    runner_status, provider_status, pilot_result,
    private_images_found: distinctImages, verified_gt_found: MANIFEST.length,
    matched_image_gt_pairs: matchedPairs,
    duplicate_images: inventory.filter((i) => i.duplicate_of).map((i) => ({ opaque_id: i.opaque_id, duplicate_of: i.duplicate_of })),
    document_types_tested: [...new Set(MANIFEST.map((m) => m.docTypeId))],
    critical_fields_expected: totalCrit,
    critical_exact_matches: provider_status === 'ok' ? sumExact : null,
    critical_empty: provider_status === 'ok' ? sumEmpty : null,
    fabricated_critical: provider_status === 'ok' ? sumFab : null,
    false_final_critical: provider_status === 'ok' ? sumFalseFinal : null,
    inventory, per_type: rollup,
  }

  // Detailed per-field verdicts (still PII-free — no values) → gitignored qa-private.
  writeFileSync(resolve(REPO, 'qa-private/reports/cyrillic-pilot-detail.json'), JSON.stringify(privateDetail, null, 2))
  // PII-free committable artifact (clean file, not polluted stdout) → docs/reports.
  writeFileSync(resolve(REPO, 'docs/reports/CYRILLIC_PILOT_ACCEPTANCE.json'), JSON.stringify(report, null, 2))
  process.stderr.write(`\n✓ CYRILLIC_PILOT_ACCEPTANCE_COMPLETE — runner=${runner_status} provider=${provider_status} pilot=${pilot_result} pairs=${matchedPairs} → docs/reports/CYRILLIC_PILOT_ACCEPTANCE.json\n`)
}

main().catch((e) => { console.error('RUNNER_ERROR', e?.message || e); process.exit(3) })
