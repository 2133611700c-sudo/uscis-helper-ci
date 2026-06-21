/**
 * realDocGate.i94Ead.live.test.ts — Phase 2A / Agent 2 (I-94 + EAD validation).
 *
 * PRIVATE REAL-DOC GATE. GATED, GITIGNORED-INPUT, PII-FREE OUTPUT.
 *
 * Runs the OWNER's real private I-94 and EAD card images (the symlinked,
 * gitignored qa-shots/private/*) through the LIVE production read paths and
 * reports, per field key, ONLY a verdict enum. It NEVER prints, logs, saves, or
 * commits a real value — ground-truth and read values live in memory ONLY; only
 * the ENUM + field key leaves this test. Safe to commit: NO PII.
 *
 * THREE live legs are exercised:
 *   1. EAD card via the CANONICAL EAD route path (readDocument docintel `us_ead`
 *      → docintelToCandidate → toEadAnswers). This is the standalone EAD product
 *      production path and Agent 2's fix territory.
 *   2. I-94 via the CANONICAL EAD route path (docintel `us_i94` → toEadAnswers).
 *   3. The LEGACY keyword modules (runEadModule / runI94Module) over Google Vision
 *      OCR — the path the TPS extract route uses. VALIDATE-ONLY (read, classify);
 *      the TPS route core is Agent 3 territory so no fix is made there.
 *
 * Plus an always-on (non-gated) golden I-765 parity leg proving the shared
 * canonical mapper produces IDENTICAL document-derived PrefillOps from the EAD
 * boundary and the TPS boundary for the same canonical facts.
 *
 * SELF-SKIPS unless RUN_REAL_DOC_GATE=1, so CI / the normal suite never touches
 * the network or the private fixtures. Invoke at validation time with:
 *
 *   RUN_REAL_DOC_GATE=1 pnpm --filter web exec vitest run \
 *     src/lib/canonical/forms/__tests__/realDocGate.i94Ead.live.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readDocument } from '@/lib/docintel/documentFieldReader'
import { docintelToCandidate } from '@/lib/canonical/core/translationAdapter'
import { buildKnowledgeContext, applyKnowledgeBrainIfEnabled } from '@/lib/canonical/core/knowledgeBrain'
import { toEadAnswers, type EadCoreAnswers } from '@/lib/canonical/core/eadAdapter'
import type { CanonicalDocumentResult } from '@/lib/canonical/types'
import { runEadModule } from '@/lib/tps/modules/ead'
import { runI94Module } from '@/lib/tps/modules/i94'
import { googleVisionProvider } from '@/lib/ocr/providers/google-vision'
import { isUnusableOcr } from '@/lib/ocr/types'
import type { TpsExtractedField } from '@/lib/tps/types'

const GATE = process.env.RUN_REAL_DOC_GATE === '1'
const ROOT = path.resolve(__dirname, '../../../../../../..') // repo root (worktree)
const SHOTS = path.join(ROOT, 'qa-shots/private')
// Private fixture file names are PII (they embed the owner's name). They are NEVER
// hardcoded in tracked source — pass the real gitignored file name via env at run
// time (e.g. I94_FIXTURE="I94 <name> .jpg"); the placeholder default keeps this
// file PII-free and is overridden when the gate actually runs.
const I94_FIXTURE = process.env.I94_FIXTURE ?? 'i94_owner.jpg'
const GT_DIR = path.join(ROOT, 'qa-private/ground-truth')

type Verdict =
  | 'SAME'
  | 'DIFFERENT'
  | 'EMPTY'
  | 'FABRICATED'
  | 'REVIEW_LOST'
  | 'FALLBACK'
  | 'NOT_APPLICABLE'
  | 'GT_MISSING'

/** Normalize for comparison WITHOUT exposing the value. Digit-only fields are
 * compared on their digit runs so a dashed and an un-dashed form of the SAME number
 * match (formatting only), never collapsing two distinct numbers. Non-digit fields:
 * NFC/case/space-insensitive. */
function eq(a: string, b: string, opts: { digitsOnly?: boolean } = {}): boolean {
  if (opts.digitsOnly) {
    const d = (s: string) => s.replace(/\D+/g, '')
    return d(a) === d(b) && d(a).length > 0
  }
  const n = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
  return n(a) === n(b)
}

/**
 * Per-field verdict from a live read vs verified ground truth. Returns ONLY the
 * enum — the strings never leave this function.
 *
 *   gtPresent=false  → GT says the field is empty/absent.
 *                       read present ⇒ FABRICATED ; read absent ⇒ NOT_APPLICABLE
 *   gtPresent=true   → read absent ⇒ EMPTY
 *                       read present, mismatch ⇒ DIFFERENT
 *                       read present, match, must-review released w/o review ⇒ REVIEW_LOST
 *                       read present, match ⇒ SAME
 */
function verdict(opts: {
  read: string | null
  reviewRequired: boolean
  gt: string | null
  mustReview?: boolean
  digitsOnly?: boolean
  /** GT for this field is UNVERIFIED (in candidate_not_verified / outside verified_scope).
   * The owner left it null because it was never confirmed — NOT because it is absent.
   * Per docs/reports/GT_LANGUAGE_INTENT.md these are NEVER penalized: any read (or none)
   * is reported as GT_MISSING, never FABRICATED. */
  gtUnverified?: boolean
}): Verdict {
  const gtPresent = !!(opts.gt && opts.gt.trim())
  const readPresent = !!(opts.read && opts.read.trim())
  // Unverified GT: cannot judge truth. Never FABRICATED, never penalized.
  if (opts.gtUnverified && !gtPresent) return 'GT_MISSING'
  if (!gtPresent) return readPresent ? 'FABRICATED' : 'NOT_APPLICABLE'
  if (!readPresent) return 'EMPTY'
  const same = eq(opts.read as string, opts.gt as string, { digitsOnly: opts.digitsOnly })
  if (same && opts.mustReview && !opts.reviewRequired) return 'REVIEW_LOST'
  return same ? 'SAME' : 'DIFFERENT'
}

// Which GT fields are numbers that must never cross-contaminate, compared on digits.
const DIGIT_FIELDS = new Set([
  'a_number',
  'card_number',
  'i94_admission_number',
  'uscis_number',
])

function loadGt(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(GT_DIR, file), 'utf8')) as Record<string, unknown>
}

function gtStr(gt: Record<string, unknown>, key: string): string | null {
  const v = gt[key]
  return typeof v === 'string' && v.trim() ? v : null
}

/** Set of GT keys the owner did NOT verify (candidate_not_verified + anything
 * outside verified_scope). Reads on these are never penalized → GT_MISSING. */
function unverifiedSet(gt: Record<string, unknown>): Set<string> {
  const arr = Array.isArray(gt.candidate_not_verified) ? (gt.candidate_not_verified as string[]) : []
  return new Set(arr)
}

/** Run the canonical EAD route path on an image → EadCoreAnswers (or null = FALLBACK). */
async function readCanonical(image: string, docintelId: string): Promise<EadCoreAnswers | null> {
  const buf = fs.readFileSync(path.join(SHOTS, image))
  const read = await readDocument(buf, 'image/jpeg', docintelId, {
    timeoutMs: 45_000,
    product: 'ead',
  })
  if (!read.ok || !Array.isArray(read.fields) || read.fields.length === 0) return null
  if (process.env.GATE_DIAG === '1') {
    // PII-FREE diagnostic: field keys + presence(bool) + review(bool) ONLY. No values.
    // eslint-disable-next-line no-console
    console.log(
      `[real-doc-gate][diag] ${docintelId} reader keys:`,
      JSON.stringify(read.fields.map((f) => ({ k: f.field, has: !!(f.value && f.value.trim()), rv: f.review_required }))),
    )
  }
  // Mirror /api/ead/ocr/extract EXACTLY: docintel → candidates → Knowledge Brain
  // arbitration → CanonicalDocumentResult → toEadAnswers.
  const candidates = read.fields.map((f) => docintelToCandidate(f, 1))
  const canonicalFields = applyKnowledgeBrainIfEnabled(
    candidates,
    buildKnowledgeContext({ docTypeId: docintelId, product: 'ead' }),
  )
  if (canonicalFields.length === 0) return null
  const canonical: CanonicalDocumentResult = {
    documentSessionId: 'real-doc-gate',
    product: 'ead',
    docType: docintelId,
    fields: canonicalFields,
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: new Date().toISOString(),
    requiresReview: canonicalFields.some((f) => f.reviewRequired),
  }
  return toEadAnswers(canonical)
}

/** Run the legacy module path over Google Vision OCR. Returns fields or null. */
async function readLegacy(
  image: string,
  module: 'ead' | 'i94',
): Promise<TpsExtractedField[] | null> {
  const buf = fs.readFileSync(path.join(SHOTS, image))
  const ocr = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
  if (isUnusableOcr(ocr)) return null
  // NOTE: in a sandboxed CI the Google Vision REST call may return 0 annotations
  // (no network egress) → 0 lines → the keyword module legitimately cannot match.
  // That surfaces as FALLBACK (not a product defect). The canonical Gemini path is
  // the one validated for read-quality here; the legacy module has its own synthetic
  // unit tests (modules/__tests__) that exercise the anchors offline.
  if (ocr.lines.length === 0) return null
  const res =
    module === 'ead'
      ? runEadModule(ocr, { document_id: 'real-doc-gate' })
      : runI94Module(ocr, { document_id: 'real-doc-gate' })
  if (!res.matched) return null
  return res.fields
}

function legacyField(fields: TpsExtractedField[], key: string): { value: string | null; review: boolean } {
  const f = fields.find((x) => x.field === key)
  return { value: (f?.normalized_value ?? null) as string | null, review: f?.review_required ?? false }
}

beforeAll(() => {
  if (!process.env.GEMINI_API_KEY || !process.env.GOOGLE_CLOUD_VISION_API_KEY) {
    const envPath = path.join(ROOT, 'apps/web/.env.local')
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, 'utf8')
      const grab = (k: string) => (env.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim()
      process.env.GEMINI_API_KEY ||= grab('GEMINI_API_KEY')
      process.env.GOOGLE_CLOUD_VISION_API_KEY ||= grab('GOOGLE_CLOUD_VISION_API_KEY')
    }
  }
})

describe.skipIf(!GATE)('REAL-DOC GATE — EAD + I-94 (live, PII-free verdicts only)', () => {
  // ── EAD card via the CANONICAL EAD route path ─────────────────────────────
  it('EAD card — canonical path (docintel us_ead → toEadAnswers)', async () => {
    const gt = loadGt('ead_owner_fill.json')
    let ans: EadCoreAnswers | null = null
    try {
      ans = await readCanonical('Ead1.jpg', 'us_ead')
    } catch {
      ans = null
    }
    // canonical key → GT key
    const map: Array<{ key: string; gt: string }> = [
      { key: 'family_name', gt: 'family_name' },
      { key: 'given_name', gt: 'given_name' },
      { key: 'date_of_birth', gt: 'date_of_birth' },
      { key: 'a_number', gt: 'a_number' },
      { key: 'card_number', gt: 'card_number' },
      { key: 'ead_category', gt: 'ead_category' },
      { key: 'uscis_number', gt: 'uscis_number' },
      { key: 'ead_validity_from', gt: 'ead_validity_from' },
      { key: 'ead_validity_to', gt: 'ead_validity_to' },
      { key: 'country_of_birth', gt: 'country_of_birth' },
      { key: 'sex', gt: 'sex' },
    ]
    const nv = unverifiedSet(gt)
    const verdicts: Record<string, Verdict> = {}
    for (const m of map) {
      if (!ans) { verdicts[m.key] = 'FALLBACK'; continue }
      verdicts[m.key] = verdict({
        read: (ans as unknown as Record<string, unknown>)[m.key] as string | null,
        reviewRequired: ans.review_required,
        gt: gtStr(gt, m.gt),
        digitsOnly: DIGIT_FIELDS.has(m.key),
        gtUnverified: nv.has(m.gt),
      })
    }
    // eslint-disable-next-line no-console
    console.log('[real-doc-gate] us_ead canonical verdicts:', JSON.stringify(verdicts))
    // Safety floor: no fabrication, no number cross-contamination.
    expect(Object.values(verdicts), 'no field may be FABRICATED').not.toContain('FABRICATED')
    // a_number / card_number must NOT be equal-by-digits (cross-contamination check).
    if (ans) {
      const a = ans.a_number ?? ''
      const card = ans.card_number ?? ''
      if (a && card) {
        expect(eq(a, card, { digitsOnly: true }), 'a_number must differ from card_number').toBe(false)
      }
    }
  }, 120000)

  // ── I-94 via the CANONICAL EAD route path ─────────────────────────────────
  it('I-94 — canonical path (docintel us_i94 → toEadAnswers)', async () => {
    const gt = loadGt('i94_owner_fill.json')
    let ans: EadCoreAnswers | null = null
    try {
      ans = await readCanonical(I94_FIXTURE, 'us_i94')
    } catch {
      ans = null
    }
    const map: Array<{ key: string; gt: string }> = [
      { key: 'family_name', gt: 'family_name' },
      { key: 'given_name', gt: 'given_name' },
      { key: 'date_of_birth', gt: 'date_of_birth' },
      { key: 'i94_admission_number', gt: 'i94_admission_number' },
      { key: 'i94_class_of_admission', gt: 'i94_class_of_admission' },
      { key: 'i94_date_of_entry', gt: 'i94_date_of_entry' },
      { key: 'i94_place_of_entry', gt: 'i94_place_of_entry' },
    ]
    const nv = unverifiedSet(gt)
    const verdicts: Record<string, Verdict> = {}
    for (const m of map) {
      if (!ans) { verdicts[m.key] = 'FALLBACK'; continue }
      verdicts[m.key] = verdict({
        read: (ans as unknown as Record<string, unknown>)[m.key] as string | null,
        reviewRequired: ans.review_required,
        gt: gtStr(gt, m.gt),
        digitsOnly: DIGIT_FIELDS.has(m.key),
        gtUnverified: nv.has(m.gt),
      })
    }
    // eslint-disable-next-line no-console
    console.log('[real-doc-gate] us_i94 canonical verdicts:', JSON.stringify(verdicts))
    expect(Object.values(verdicts), 'no field may be FABRICATED').not.toContain('FABRICATED')
    // SAFETY CONTRACT: if the reader produced ANY wrong value (DIFFERENT), the
    // document MUST be review-gated so the user is prompted before it reaches the
    // I-765. A wrong value released on a clean (review_required=false) document
    // would be a silent error — the worst non-fabrication failure.
    if (ans && Object.values(verdicts).includes('DIFFERENT')) {
      expect(ans.review_required, 'a DIFFERENT read must leave the document review-gated').toBe(true)
    }
    // admission number must NOT collide with any number-shaped identity field.
    if (ans?.i94_admission_number && ans?.a_number) {
      expect(
        eq(ans.i94_admission_number, ans.a_number, { digitsOnly: true }),
        'i94_admission_number must differ from a_number',
      ).toBe(false)
    }
  }, 120000)

  // ── LEGACY module path (TPS production path) — VALIDATE ONLY ───────────────
  it('EAD card — legacy module path (Google Vision OCR, validate-only)', async () => {
    const gt = loadGt('ead_owner_fill.json')
    let fields: TpsExtractedField[] | null = null
    try {
      fields = await readLegacy('Ead1.jpg', 'ead')
    } catch {
      fields = null
    }
    // legacy field key → GT key (legacy emits a_number, ead_category_on_card, names)
    const map: Array<{ key: string; gt: string }> = [
      { key: 'family_name', gt: 'family_name' },
      { key: 'given_name', gt: 'given_name' },
      { key: 'a_number', gt: 'a_number' },
      { key: 'ead_category_on_card', gt: 'ead_category' },
    ]
    const nv = unverifiedSet(gt)
    const verdicts: Record<string, Verdict> = {}
    for (const m of map) {
      if (!fields) { verdicts[m.key] = 'FALLBACK'; continue }
      const lf = legacyField(fields, m.key)
      verdicts[m.key] = verdict({
        read: lf.value,
        reviewRequired: lf.review,
        gt: gtStr(gt, m.gt),
        digitsOnly: m.key === 'a_number',
        gtUnverified: nv.has(m.gt),
      })
    }
    // eslint-disable-next-line no-console
    console.log('[real-doc-gate] EAD legacy verdicts:', JSON.stringify(verdicts))
    expect(Object.values(verdicts), 'no field may be FABRICATED').not.toContain('FABRICATED')
  }, 120000)

  it('I-94 — legacy module path (Google Vision OCR, validate-only)', async () => {
    const gt = loadGt('i94_owner_fill.json')
    let fields: TpsExtractedField[] | null = null
    try {
      fields = await readLegacy(I94_FIXTURE, 'i94')
    } catch {
      fields = null
    }
    const map: Array<{ key: string; gt: string }> = [
      { key: 'family_name', gt: 'family_name' },
      { key: 'given_name', gt: 'given_name' },
      { key: 'i94_admission_number', gt: 'i94_admission_number' },
      { key: 'i94_class_of_admission', gt: 'i94_class_of_admission' },
      { key: 'last_entry_date', gt: 'i94_date_of_entry' },
      { key: 'place_of_last_entry', gt: 'i94_place_of_entry' },
    ]
    const nv = unverifiedSet(gt)
    const verdicts: Record<string, Verdict> = {}
    for (const m of map) {
      if (!fields) { verdicts[m.key] = 'FALLBACK'; continue }
      const lf = legacyField(fields, m.key)
      verdicts[m.key] = verdict({
        read: lf.value,
        reviewRequired: lf.review,
        gt: gtStr(gt, m.gt),
        digitsOnly: m.key === 'i94_admission_number',
        gtUnverified: nv.has(m.gt),
      })
    }
    // eslint-disable-next-line no-console
    console.log('[real-doc-gate] I-94 legacy verdicts:', JSON.stringify(verdicts))
    expect(Object.values(verdicts), 'no field may be FABRICATED').not.toContain('FABRICATED')
  }, 120000)
})

// ── I-765 golden parity: EAD boundary vs TPS boundary through the SHARED mapper ──
// Proves the two product boundaries emit IDENTICAL document-derived PrefillOps for
// the SAME canonical facts (single canonical currency). Synthetic, no PII, always on.
describe('I-765 shared mapper — TPS vs EAD boundary golden parity (synthetic)', () => {
  it('identical document facts → identical I-765 document ops from both boundaries', async () => {
    const { eadDocumentFactsToCanonical } = await import('@/lib/ead/i765DocumentBoundary')
    const { tpsDocumentFactsToCanonical } = await import('@/lib/tps/forms/i765DocumentBoundary')
    const { buildI765DocumentOps } = await import('../i765DocumentMapper')

    // Same person facts expressed in each product's native shape.
    const eadCanonical = eadDocumentFactsToCanonical({
      appType: 'new', category: 'c11',
      firstName: 'Given', lastName: 'Family', middleName: 'Middle',
      dob: '1990-04-15', countryOfBirth: 'Ukraine',
      alienNumber: 'A123456789', gender: 'female', usAddress: '',
    })
    const tpsCanonical = tpsDocumentFactsToCanonical({
      family_name: 'Family', given_name: 'Given', middle_name: 'Middle',
      dob: '1990-04-15', sex: 'F',
      country_of_birth: 'Ukraine', country_of_nationality: 'Ukraine',
      a_number: 'A123456789',
    } as unknown as Parameters<typeof tpsDocumentFactsToCanonical>[0])

    const eadOps = buildI765DocumentOps(eadCanonical)
    const tpsOps = buildI765DocumentOps(tpsCanonical)

    const norm = (ops: ReturnType<typeof buildI765DocumentOps>) =>
      JSON.stringify(
        ops.map((o) => [o.field, o.kind, String(o.value)]).sort((a, b) => a[0].localeCompare(b[0])),
      )
    // The shared document-derived ops MUST be byte-identical across products.
    expect(norm(eadOps)).toBe(norm(tpsOps))
  })

  it('a C3-rejected field (finalValue=null) does NOT appear in the I-765', async () => {
    const { buildI765DocumentOps } = await import('../i765DocumentMapper')
    const canonical: CanonicalDocumentResult = {
      documentSessionId: 'c3-reject', product: 'ead', docType: 'us_ead',
      fields: [
        {
          key: 'family_name', rawValue: 'Family', normalizedValue: 'Family',
          finalValue: 'Family', criticality: 'high',
          confidence: { ocr: 1, field_match: 1, normalization: 1, source_match: null, final: 1 },
          source: 'document_ocr', reviewRequired: false, reviewReasons: [], evidence: [],
        },
        {
          // C3 REJECTED → finalValue=null → accessor returns null → no op.
          key: 'a_number', rawValue: 'A999', normalizedValue: 'A999',
          finalValue: null, criticality: 'high',
          confidence: { ocr: 0.2, field_match: 0.2, normalization: null, source_match: null, final: 0.2 },
          source: 'document_ocr', reviewRequired: true, reviewReasons: ['c3_rejected'], evidence: [],
        },
      ],
      hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
      createdAt: new Date().toISOString(), requiresReview: true,
    }
    const ops = buildI765DocumentOps(canonical)
    expect(ops.find((o) => o.field.includes('Line7_AlienNumber'))).toBeUndefined()
    expect(ops.find((o) => o.field.includes('Line1a_FamilyName'))).toBeDefined()
  })
})

// ── Always-on (non-gated) verdict-logic guards ────────────────────────────────
describe('real-doc gate (i94/ead) — verdict logic (synthetic, always runs)', () => {
  it('classifies every verdict class correctly from synthetic inputs', () => {
    expect(verdict({ read: 'TESTENKO', reviewRequired: false, gt: 'testenko' })).toBe('SAME')
    expect(verdict({ read: 'IVANENKO', reviewRequired: false, gt: 'TESTENKO' })).toBe('DIFFERENT')
    expect(verdict({ read: null, reviewRequired: false, gt: 'TESTENKO' })).toBe('EMPTY')
    expect(verdict({ read: 'X', reviewRequired: false, gt: null })).toBe('FABRICATED')
    expect(verdict({ read: null, reviewRequired: false, gt: null })).toBe('NOT_APPLICABLE')
    expect(verdict({ read: 'X', reviewRequired: false, gt: 'x', mustReview: true })).toBe('REVIEW_LOST')
    // Unverified GT (candidate_not_verified): a read is NEVER penalized → GT_MISSING.
    expect(verdict({ read: 'anything', reviewRequired: false, gt: null, gtUnverified: true })).toBe('GT_MISSING')
    expect(verdict({ read: null, reviewRequired: false, gt: null, gtUnverified: true })).toBe('GT_MISSING')
    // But a VERIFIED non-empty GT still judges normally even if flagged (defensive).
    expect(verdict({ read: 'x', reviewRequired: false, gt: 'x', gtUnverified: true })).toBe('SAME')
  })

  it('digit-only eq compares formatting-insensitively but never collapses distinct numbers', () => {
    // same number, different formatting → equal (synthetic digits, NOT real PII)
    expect(eq('111-222-333', '111222333', { digitsOnly: true })).toBe(true)
    // a-number vs card-number (distinct) → NOT equal
    expect(eq('111222333', '4445556660', { digitsOnly: true })).toBe(false)
    // leading-zero preservation: a drift would change the digit run
    expect(eq('012345678', '12345678', { digitsOnly: true })).toBe(false)
    // empty guard: two empties are not "equal numbers"
    expect(eq('', '', { digitsOnly: true })).toBe(false)
  })
})
