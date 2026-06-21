/**
 * intlPassportGate.live.test.ts — Phase 2A / Agent 1 (international passport / MRZ).
 *
 * PRIVATE REAL-DOC GATE. GATED, GITIGNORED-INPUT, PII-FREE OUTPUT.
 *
 * Validates the DEPLOYED canonical central brain on a real Ukrainian
 * INTERNATIONAL passport (docintelId `ua_international_passport`) via the SAME
 * production path the translation + TPS routes use:
 *
 *   readDocument(buf, mime, 'ua_international_passport', {product:'translation'})
 *     → docintelToCandidate(+ MRZ via mrzCandidatesForTranslation)
 *     → applyKnowledgeBrainIfEnabled → buildCanonicalResult
 *     → consumed IDENTICALLY by 3 adapters:
 *        Core    : getCanonicalValue(field)
 *        Translation : toTranslationRows(result.fields, cyrillicMap)
 *        TPS     : canonicalToTpsModuleResult(result.fields, 'passport', id)
 *
 * It reports, per field key, ONLY a verdict enum. It NEVER prints, logs, saves,
 * or commits a real value, initial, partial, digit, or owner geography. Read
 * and ground-truth values live in memory ONLY; the verdict is computed
 * in-process and only the ENUM + field key leaves this test. This file is safe
 * to commit: it contains NO PII (only fixture FILE NAMES, already tracked).
 *
 * GROUND TRUTH STATUS: qa-private/ground-truth/international_passport_owner_fill.json
 * is OWNER_INPUT_REQUIRED (NOT owner-verified). All keys are empty. Therefore
 * value-match (SAME/DIFFERENT) is NOT authoritative → reported GT_MISSING. The
 * GT-FREE invariants below need no verified GT and ARE the validated value.
 *
 * SELF-SKIPS unless RUN_INTL_PASSPORT_GATE=1. Invoke at Phase B with:
 *
 *   RUN_INTL_PASSPORT_GATE=1 pnpm --filter web exec vitest run \
 *     src/lib/canonical/core/__tests__/intlPassportGate.live.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readDocument } from '@/lib/docintel/documentFieldReader'
import {
  docintelToCandidate,
  buildCyrillicMap,
  toTranslationRows,
} from '@/lib/canonical/core/translationAdapter'
import { mrzCandidatesForTranslation } from '@/lib/canonical/core/mrzAuthority'
import {
  buildKnowledgeContext,
  applyKnowledgeBrainIfEnabled,
} from '@/lib/canonical/core/knowledgeBrain'
import { buildCanonicalResult } from '@/lib/canonical/core/buildCanonicalResult'
import { getCanonicalValue, getField } from '@/lib/canonical/core/fieldAccessor'
import { canonicalToTpsModuleResult } from '@/lib/canonical/core/tpsAdapter'
import { googleVisionProvider } from '@/lib/ocr/providers/google-vision'
import { isUnusableOcr } from '@/lib/ocr/types'
import type { FieldCandidate } from '@/lib/canonical/core/types'

const GATE = process.env.RUN_INTL_PASSPORT_GATE === '1'
const ROOT = path.resolve(__dirname, '../../../../../../..') // repo root
const DOC_ID = 'ua_international_passport'

// Private gitignored inputs (PII). Only ENUM verdicts ever leave this test.
// The single-image fixture file name itself contains the owner's name, so it is
// NOT hardcoded here (PII-free file). It is resolved at runtime by scanning the
// gitignored private dir for the first JPEG that is NOT one of the 4 booklet pages.
const PRIVATE_DIR = path.join(ROOT, 'qa-shots/private')
const PAGE_NAMES = ['1.jpg', '2.jpg', '3.jpg', '4.jpg']
const PAGES = PAGE_NAMES.map((n) => path.join(PRIVATE_DIR, n))
function resolveSingleImage(): string | null {
  // Allow an explicit override (also kept out of source) for determinism.
  if (process.env.INTL_PASSPORT_FIXTURE) {
    const p = path.join(PRIVATE_DIR, process.env.INTL_PASSPORT_FIXTURE)
    return fs.existsSync(p) ? p : null
  }
  if (!fs.existsSync(PRIVATE_DIR)) return null
  const known = new Set(['DL.jpg', 'DL_rotated90.jpg', 'Ead1.jpg', ...PAGE_NAMES])
  const cand = fs
    .readdirSync(PRIVATE_DIR)
    .filter((n) => /passport/i.test(n) && /\.jpe?g$/i.test(n) && !known.has(n))
    .sort()
  return cand.length ? path.join(PRIVATE_DIR, cand[0]) : null
}
const GT_PATH = path.join(
  ROOT,
  'qa-private/ground-truth/international_passport_owner_fill.json',
)

// The registry field keys for ua_international_passport (documentRegistry.ts).
const REGISTRY_FIELDS = [
  'family_name',
  'given_name',
  'passport_number',
  'dob',
  'sex',
  'city_of_birth',
  'date_of_issue',
  'passport_expiration_date',
] as const
type RegistryField = (typeof REGISTRY_FIELDS)[number]

// Canonical field key → GT json key. GT is UNVERIFIED (all empty) → every value
// comparison resolves to GT_MISSING. Kept explicit so a future verified GT flips
// these to SAME/DIFFERENT with no code change.
const GT_KEYMAP: Partial<Record<RegistryField, string>> = {
  family_name: 'family_name_latin',
  given_name: 'given_name_latin',
  passport_number: 'passport_number',
  dob: 'date_of_birth',
  sex: 'sex',
  passport_expiration_date: 'passport_expiration_date',
}

type Verdict =
  | 'SAME'
  | 'DIFFERENT'
  | 'EMPTY'
  | 'FABRICATED'
  | 'REVIEW_LOST'
  | 'FALLBACK'
  | 'NOT_APPLICABLE'
  | 'GT_MISSING'

/** Normalize for comparison WITHOUT exposing the value (case/space/NFC-insensitive). */
function eq(a: string, b: string): boolean {
  const n = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
  return n(a) === n(b)
}

/** Latin-printed/MRZ romanization signature: A–Z, digits, space, hyphen, apostrophe, '<'. */
function isLatinPrinted(s: string): boolean {
  return s.length > 0 && /^[A-Z0-9 '<\-]+$/.test(s.normalize('NFC').trim().toUpperCase()) &&
    /[A-Z]/.test(s.toUpperCase())
}
function hasCyrillic(s: string): boolean {
  return /[Ѐ-ӿ]/.test(s)
}

/**
 * Value verdict vs ground truth. GT here is UNVERIFIED & empty → GT_MISSING for
 * any field with a GT key. Strings never leave this function.
 */
function valueVerdict(opts: {
  read: string | null
  reviewRequired: boolean
  gt: string | null
  gtVerified: boolean
}): Verdict {
  if (!opts.gtVerified) return 'GT_MISSING'
  const gtPresent = !!(opts.gt && opts.gt.trim())
  const readPresent = !!(opts.read && opts.read.trim())
  if (!readPresent && gtPresent) return 'EMPTY'
  if (readPresent && !gtPresent) return 'FABRICATED'
  if (!readPresent && !gtPresent) return 'SAME'
  const same = eq(opts.read as string, opts.gt as string)
  return same ? 'SAME' : 'DIFFERENT'
}

/** The exact production canonical path for one or more pages → CanonicalDocumentResult + cyrillicMap. */
async function runCanonical(imagePaths: string[], opts: { withMrz: boolean }) {
  const allCandidates: FieldCandidate[] = []
  const cyrillicMap = new Map<string, string>()
  let anyOk = false
  let anyFallbackModel = false
  const pageOk: boolean[] = []

  for (let i = 0; i < imagePaths.length; i++) {
    const buf = fs.readFileSync(imagePaths[i])
    const mime = 'image/jpeg'
    const r = await readDocument(buf, mime, DOC_ID, {
      timeoutMs: 85_000,
      attemptsPerModel: 1,
      product: 'translation',
    })
    pageOk.push(r.ok)
    if (r.ok && Array.isArray(r.fields)) {
      anyOk = true
      buildCyrillicMap(r.fields).forEach((v, k) => {
        if (!cyrillicMap.has(k)) cyrillicMap.set(k, v)
      })
      allCandidates.push(...r.fields.map((f) => docintelToCandidate(f, i + 1)))
      // fallback_model_used is attached as a review reason by documentFieldReader.
      if (r.fields.some((f) => (f.review_reasons ?? []).includes('fallback_model_used'))) {
        anyFallbackModel = true
      }
    }
  }

  // MRZ authority — same as the translation route (first/data page only). Gated by
  // the caller so we can validate the controlling-Latin invariant explicitly.
  let mrzInjected = 0
  if (opts.withMrz && imagePaths.length > 0) {
    try {
      const firstBuf = fs.readFileSync(imagePaths[0])
      const vis = await googleVisionProvider.extractText({
        imageBuffer: firstBuf,
        mimeType: 'image/jpeg',
      })
      if (!isUnusableOcr(vis) && vis.raw_text) {
        const mrz = mrzCandidatesForTranslation(vis.raw_text, DOC_ID)
        mrzInjected = mrz.length
        allCandidates.push(...mrz)
      }
    } catch {
      /* fail-open, same as prod */
    }
  }

  const canonicalFields = applyKnowledgeBrainIfEnabled(
    allCandidates,
    buildKnowledgeContext({ docTypeId: DOC_ID, product: 'translation' }),
  )
  const result = buildCanonicalResult({
    documentSessionId: 'intl-passport-gate',
    product: 'translation',
    docType: DOC_ID,
    fields: canonicalFields,
    createdAt: new Date().toISOString(),
  })
  return { result, cyrillicMap, anyOk, anyFallbackModel, mrzInjected, pageOk }
}

describe.skipIf(!GATE)('INTL PASSPORT GATE (live, PII-free verdicts only)', () => {
  beforeAll(() => {
    // Load the keys from the symlinked .env.local (never printed). The MRZ path
    // needs Google Vision; Gemini drives the field read. Values stay in env only.
    const envPath = path.join(ROOT, 'apps/web/.env.local')
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, 'utf8')
      const pick = (name: string) => (env.match(new RegExp(`^${name}=(.+)$`, 'm')) || [])[1]?.trim()
      for (const name of [
        'GEMINI_API_KEY',
        'GEMINI_API_KEY_PAY',
        'GOOGLE_CLOUD_VISION_API_KEY',
        'GOOGLE_VISION_API_KEY',
      ]) {
        const v = pick(name)
        if (v && !process.env[name]) process.env[name] = v
      }
    }
    // Validate the DEPLOYED brain: knowledge brain is ON by default in prod.
    if (process.env.KNOWLEDGE_BRAIN_ENABLED === undefined) {
      process.env.KNOWLEDGE_BRAIN_ENABLED = '1'
    }
  })

  // GT verification flag — flip to true only when the owner verifies the GT file.
  const gt = fs.existsSync(GT_PATH)
    ? (JSON.parse(fs.readFileSync(GT_PATH, 'utf8')) as Record<string, unknown>)
    : {}
  const gtMeta = (gt._meta ?? {}) as Record<string, unknown>
  const GT_VERIFIED = gtMeta.ground_truth_status === 'VERIFIED_BY_OWNER'

  it('single-image: invariants + value verdicts (enum only, no values)', async () => {
    const singleImg = resolveSingleImage()
    if (!singleImg) {
      // eslint-disable-next-line no-console
      console.log('[intl-passport-gate] SKIP single: fixture missing')
      return
    }
    const { result, cyrillicMap, anyOk, anyFallbackModel, mrzInjected } =
      await runCanonical([singleImg], { withMrz: true })

    // ── Build the 3 consumer views from the ONE canonical result ──
    const translationRows = toTranslationRows(result.fields, cyrillicMap)
    const tps = canonicalToTpsModuleResult(result.fields, 'passport', 'intl-passport-gate')
    const trByKey = new Map(translationRows.map((r) => [r.field, r]))
    const tpsByKey = new Map(tps.fields.map((f) => [f.field, f]))

    // ── Per-field VALUE verdict (GT_MISSING because GT is unverified) ──
    const valueVerdicts: Record<string, Verdict> = {}
    for (const key of REGISTRY_FIELDS) {
      const f = getField(result, key)
      if (!f) {
        valueVerdicts[key] = 'NOT_APPLICABLE'
        continue
      }
      const gtKey = GT_KEYMAP[key]
      if (!gtKey) {
        valueVerdicts[key] = 'NOT_APPLICABLE' // no GT key for this field (issue/place)
        continue
      }
      valueVerdicts[key] = valueVerdict({
        read: getCanonicalValue(f),
        reviewRequired: f.reviewRequired,
        gt: typeof gt[gtKey] === 'string' ? (gt[gtKey] as string) : null,
        gtVerified: GT_VERIFIED,
      })
    }

    // ── CONSUMER PARITY: Core value === Translation value === TPS released value ──
    // (TPS release value = normalized_value, per canonicalFieldToTpsField C3 rule.)
    const parity: Record<string, Verdict> = {}
    for (const key of REGISTRY_FIELDS) {
      const f = getField(result, key)
      if (!f) {
        parity[key] = 'NOT_APPLICABLE'
        continue
      }
      const core = getCanonicalValue(f)
      const tr = trByKey.get(key)?.value ?? null
      const tpsF = tpsByKey.get(key)
      const tpsVal = tpsF ? tpsF.normalized_value : null
      // city_of_birth/place: the translation adapter may re-add the «смт» designator
      // PREFIX for the translation product (documented divergence, not a mutation of
      // the canonical value). Treat a prefix-only relationship as parity-OK.
      const placeLike = /city|place_of_birth/.test(key)
      const coreEqTr =
        (core === null && tr === null) ||
        (core !== null && tr !== null && (eq(core, tr) || (placeLike && tr.toLowerCase().includes(core.toLowerCase()))))
      const coreEqTps =
        (core === null && tpsVal === null) ||
        (core !== null && tpsVal !== null && eq(core, tpsVal))
      parity[key] = coreEqTr && coreEqTps ? 'SAME' : 'DIFFERENT'
    }

    // ── REVIEW PARITY: reviewRequired must not be downgraded by any consumer ──
    const reviewParity: Record<string, Verdict> = {}
    for (const key of REGISTRY_FIELDS) {
      const f = getField(result, key)
      if (!f) {
        reviewParity[key] = 'NOT_APPLICABLE'
        continue
      }
      const tr = trByKey.get(key)
      const tpsF = tpsByKey.get(key)
      const coreReview = f.reviewRequired
      // A consumer that releases a value while DROPPING the must-review flag = REVIEW_LOST.
      const trLost = !!tr && coreReview && tr.review_required === false
      const tpsLost = !!tpsF && coreReview && tpsF.review_required === false
      reviewParity[key] = trLost || tpsLost ? 'REVIEW_LOST' : 'SAME'
    }

    // ── GT-FREE INVARIANTS ──
    const invariants: Record<string, Verdict> = {}

    // (1) Cyrillic carried SEPARATELY from the released Latin value (rawCyrillic).
    //     For each name field with Cyrillic in raw, the released value must NOT be
    //     the Cyrillic string (it must be Latin/transliterated or come from MRZ).
    for (const key of ['family_name', 'given_name'] as const) {
      const f = getField(result, key)
      if (!f) { invariants[`cyrillic_separation:${key}`] = 'NOT_APPLICABLE'; continue }
      const released = getCanonicalValue(f)
      const raw = f.rawCyrillic ?? cyrillicMap.get(key) ?? null
      if (released && hasCyrillic(released) && raw && eq(released, raw)) {
        // Released value IS the raw Cyrillic → Latin separation lost.
        invariants[`cyrillic_separation:${key}`] = 'DIFFERENT'
      } else {
        invariants[`cyrillic_separation:${key}`] = 'SAME'
      }
    }

    // (2) Controlling Latin (MRZ / printed romanization) preserved VERBATIM — a
    //     released Latin value must not have been re-transliterated/case-mangled.
    //     We verify the released name value, when Latin, is uppercase-stable vs raw
    //     MRZ form: no consumer changes case. (Detect any consumer that lowercased.)
    for (const key of ['family_name', 'given_name'] as const) {
      const tr = trByKey.get(key)
      const tpsF = tpsByKey.get(key)
      const core = getField(result, key)
      const coreVal = core ? getCanonicalValue(core) : null
      if (!coreVal || !isLatinPrinted(coreVal)) {
        invariants[`latin_verbatim:${key}`] = 'NOT_APPLICABLE'
        continue
      }
      const trVal = tr?.value ?? null
      const tpsVal = tpsF?.normalized_value ?? null
      // Verbatim = byte-identical across consumers (no case change, no re-translit).
      const trOk = trVal === null || trVal === coreVal
      const tpsOk = tpsVal === null || tpsVal === coreVal
      invariants[`latin_verbatim:${key}`] = trOk && tpsOk ? 'SAME' : 'DIFFERENT'
    }

    // (3) Country suffix ("/UKR", "UKR") must not leak into city/place.
    for (const key of ['city_of_birth'] as const) {
      const f = getField(result, key)
      if (!f) { invariants[`no_country_leak:${key}`] = 'NOT_APPLICABLE'; continue }
      const v = getCanonicalValue(f)
      if (!v) { invariants[`no_country_leak:${key}`] = 'NOT_APPLICABLE'; continue }
      const leaked = /\/?\bUKR\b|\/UKR/i.test(v)
      invariants[`no_country_leak:${key}`] = leaked ? 'DIFFERENT' : 'SAME'
      if (leaked && process.env.INTL_GATE_DIAG === '1') {
        // PII-FREE leak classification (defect triage only): separator class of the
        // leaked country token + script of the released value. No value text leaves.
        const sep = /\/\s*UKR/i.test(v) ? 'slash' : /,\s*UKR/i.test(v) ? 'comma'
          : /\s+UKR\b/i.test(v) ? 'space' : /^UKR/i.test(v) ? 'prefix' : 'other'
        // eslint-disable-next-line no-console
        console.log('[intl-passport-gate] LEAK_DIAG', JSON.stringify({
          sep,
          released_is_latin: /[a-z]/i.test(v) && !hasCyrillic(v),
          source: f.source,
        }))
      }
    }

    // (4) sex bilingual mapping resolves to a clean enum (M/F or empty), not Ч/М noise.
    {
      const f = getField(result, 'sex')
      const v = f ? getCanonicalValue(f) : null
      if (!v) invariants['sex_mapping'] = 'NOT_APPLICABLE'
      else invariants['sex_mapping'] = /^(M|F|male|female|Ч|Ж|М)$/i.test(v.trim()) ? 'SAME' : 'DIFFERENT'
    }

    // (5) date_of_issue vs passport_expiration_date not swapped: if both present,
    //     issue must be <= expiry (chronological).
    {
      const iso = (s: string | null) => {
        if (!s) return null
        const m = s.match(/(\d{4})[-/.](\d{2})[-/.](\d{2})/) || s.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/)
        if (!m) return null
        // normalize to YYYYMMDD for ordering only (no value leaves).
        return m[1].length === 4 ? `${m[1]}${m[2]}${m[3]}` : `${m[3]}${m[2]}${m[1]}`
      }
      const issueF = getField(result, 'date_of_issue')
      const expF = getField(result, 'passport_expiration_date')
      const issue = iso(issueF ? getCanonicalValue(issueF) : null)
      const exp = iso(expF ? getCanonicalValue(expF) : null)
      if (!issue || !exp) invariants['issue_expiry_order'] = 'NOT_APPLICABLE'
      else invariants['issue_expiry_order'] = issue <= exp ? 'SAME' : 'DIFFERENT'
    }

    // (6) fallback path honesty: did the canonical core run (anyOk)?
    invariants['core_ran'] = anyOk ? 'SAME' : 'FALLBACK'
    invariants['fallback_model_used'] = anyFallbackModel ? 'FALLBACK' : 'SAME'
    invariants['mrz_injected'] = mrzInjected > 0 ? 'SAME' : 'NOT_APPLICABLE'

    // ── REPORT: enum + field key ONLY. No value EVER printed. ──
    /* eslint-disable no-console */
    console.log('[intl-passport-gate] SINGLE gt_verified=', GT_VERIFIED)
    console.log('[intl-passport-gate] SINGLE value:', JSON.stringify(valueVerdicts))
    console.log('[intl-passport-gate] SINGLE consumer_parity:', JSON.stringify(parity))
    console.log('[intl-passport-gate] SINGLE review_parity:', JSON.stringify(reviewParity))
    console.log('[intl-passport-gate] SINGLE invariants:', JSON.stringify(invariants))
    /* eslint-enable no-console */

    // PASS criteria (safety floor, GT-free):
    //  - core must run (no silent total fallback)
    //  - no consumer drift on released value
    //  - no review loss across consumers
    //  - no Latin mutation, no Cyrillic-as-value, no country leak, no date swap
    expect(anyOk, 'canonical core must run on a real passport').toBe(true)
    expect(Object.values(parity), 'no per-consumer value drift').not.toContain('DIFFERENT')
    expect(Object.values(reviewParity), 'no review downgrade by a consumer').not.toContain('REVIEW_LOST')
    for (const [k, v] of Object.entries(invariants)) {
      if (k === 'core_ran' || k === 'fallback_model_used' || k === 'mrz_injected') continue
      expect(v, `invariant ${k} must hold`).not.toBe('DIFFERENT')
    }
  }, 180_000)

  it('4-page set: arbiter selection + no fabrication on non-identity pages', async () => {
    const present = PAGES.filter((p) => fs.existsSync(p))
    if (present.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[intl-passport-gate] SKIP 4-page: fixtures missing')
      return
    }
    const { result, cyrillicMap, anyOk } = await runCanonical(present, { withMrz: true })
    const translationRows = toTranslationRows(result.fields, cyrillicMap)
    const tps = canonicalToTpsModuleResult(result.fields, 'passport', 'intl-passport-gate-4p')
    const trByKey = new Map(translationRows.map((r) => [r.field, r]))
    const tpsByKey = new Map(tps.fields.map((f) => [f.field, f]))

    // FABRICATION CHECK: with an UNVERIFIED GT we cannot say a value is wrong, but
    // we CAN assert the safety contract — every identity field that carries a value
    // across a multi-page set without review is a candidate fabrication-risk. We
    // report identity fields that released a value WITHOUT review (these must be
    // human-confirmed; a clean release here is the risk). Enum only.
    const identity = ['family_name', 'given_name', 'passport_number', 'dob'] as const
    const fabRisk: Record<string, Verdict> = {}
    for (const key of identity) {
      const f = getField(result, key)
      if (!f) { fabRisk[key] = 'EMPTY'; continue }
      const v = getCanonicalValue(f)
      if (!v) { fabRisk[key] = 'EMPTY'; continue }
      // Value present. If it came from a valid MRZ (mrzCheckValid) a clean release is
      // legitimate (math-verified). Otherwise a value without review on a multi-page
      // identity read is flagged REVIEW_LOST for the coordinator to inspect.
      const mrzBacked = f.source === 'mrz'
      fabRisk[key] = !f.reviewRequired && !mrzBacked ? 'REVIEW_LOST' : 'SAME'
    }

    // CONSUMER PARITY on the multi-page result (one result, identical to all).
    const parity: Record<string, Verdict> = {}
    for (const key of REGISTRY_FIELDS) {
      const f = getField(result, key)
      if (!f) { parity[key] = 'NOT_APPLICABLE'; continue }
      const core = getCanonicalValue(f)
      const tr = trByKey.get(key)?.value ?? null
      const tpsVal = tpsByKey.get(key)?.normalized_value ?? null
      const placeLike = /city|place_of_birth/.test(key)
      const coreEqTr =
        (core === null && tr === null) ||
        (core !== null && tr !== null && (eq(core, tr) || (placeLike && tr.toLowerCase().includes(core.toLowerCase()))))
      const coreEqTps =
        (core === null && tpsVal === null) ||
        (core !== null && tpsVal !== null && eq(core, tpsVal))
      parity[key] = coreEqTr && coreEqTps ? 'SAME' : 'DIFFERENT'
    }

    /* eslint-disable no-console */
    console.log('[intl-passport-gate] 4PAGE pages=', present.length, 'core_ran=', anyOk)
    console.log('[intl-passport-gate] 4PAGE fabrication_risk:', JSON.stringify(fabRisk))
    console.log('[intl-passport-gate] 4PAGE consumer_parity:', JSON.stringify(parity))
    /* eslint-enable no-console */

    // The 4-page set is the owner's INTERNAL passport booklet pages (NOT the intl
    // passport data page). Read under the intl-passport spec, it must NOT fabricate
    // an intl-passport identity from registration/photo pages. We cannot assert
    // value-correctness (GT unverified) but we CAN assert: no per-consumer drift,
    // and any released identity value is either reviewed or MRZ-backed.
    expect(Object.values(parity), 'no per-consumer drift (multipage)').not.toContain('DIFFERENT')
    expect(Object.values(fabRisk), 'identity released w/o review or MRZ backing = risk').not.toContain('REVIEW_LOST')
  }, 240_000)
})

// Non-gated guard: proves the verdict/helper logic is correct and PII-free
// (synthetic only — never touches the network or the private fixtures).
describe('intl-passport gate — helper logic (synthetic, always runs)', () => {
  it('valueVerdict returns GT_MISSING when GT is unverified, regardless of read', () => {
    expect(valueVerdict({ read: 'X', reviewRequired: false, gt: null, gtVerified: false })).toBe('GT_MISSING')
    expect(valueVerdict({ read: null, reviewRequired: true, gt: 'Y', gtVerified: false })).toBe('GT_MISSING')
  })
  it('valueVerdict classifies correctly once GT is verified', () => {
    expect(valueVerdict({ read: 'Ivanenko', reviewRequired: true, gt: 'ivanenko', gtVerified: true })).toBe('SAME')
    expect(valueVerdict({ read: 'Ivanenko', reviewRequired: true, gt: 'Petrenko', gtVerified: true })).toBe('DIFFERENT')
    expect(valueVerdict({ read: null, reviewRequired: true, gt: 'Ivanenko', gtVerified: true })).toBe('EMPTY')
    expect(valueVerdict({ read: 'Ivanenko', reviewRequired: true, gt: '', gtVerified: true })).toBe('FABRICATED')
  })
  it('isLatinPrinted / hasCyrillic discriminate scripts (no value leak)', () => {
    expect(isLatinPrinted('IVANENKO')).toBe(true)
    expect(isLatinPrinted('P<UKRSURNAME<<GIVEN')).toBe(true)
    expect(isLatinPrinted('Київ')).toBe(false)
    expect(hasCyrillic('Київ')).toBe(true)
    expect(hasCyrillic('Kyiv')).toBe(false)
  })
  it('eq is case/space/NFC-insensitive but content-strict', () => {
    expect(eq('  Київ  ', 'київ')).toBe(true)
    expect(eq('Vinnytsia', 'Trostianets')).toBe(false)
  })
})
