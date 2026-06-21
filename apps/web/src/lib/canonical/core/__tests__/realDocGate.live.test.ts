/**
 * realDocGate.live.test.ts — Phase 1 / Agent 4 (independent final gate).
 *
 * PRIVATE REAL-DOC GATE (Phase B). GATED, GITIGNORED-INPUT, PII-FREE OUTPUT.
 *
 * Runs the OWNER's real private documents (the symlinked, gitignored
 * test-fixtures/real-docs/*) through the LIVE recognition path and reports, for
 * each field key, ONLY a verdict enum:
 *
 *     SAME         — read value equals owner-verified ground truth
 *     DIFFERENT    — read a value, but it disagrees with ground truth
 *     EMPTY        — no value read for a field the ground truth has
 *     FABRICATED   — read a value for a field the ground truth says is empty/absent
 *     REVIEW_LOST  — value released WITHOUT review on a field that must be reviewed
 *     FALLBACK     — the live path could not run the canonical core (used old path)
 *
 * It NEVER prints, logs, saves, or commits a real value. Ground-truth and read
 * values live in memory ONLY; the verdict is computed in-process and only the
 * ENUM + field key leaves this test. This file is therefore safe to commit:
 * it contains NO PII (only fixture FILE NAMES, which are already tracked in the
 * ground-truth READMEs).
 *
 * SELF-SKIPS unless RUN_REAL_DOC_GATE=1, so CI / the normal suite never touches
 * the network or the private fixtures. Invoke at Phase B with:
 *
 *   RUN_REAL_DOC_GATE=1 pnpm --filter web exec vitest run \
 *     src/lib/canonical/core/__tests__/realDocGate.live.test.ts
 *
 * Currently wired against the LIVE booklet vision reader (readBookletViaVision →
 * visionReadsToFields), the same production path the TPS booklet uses, compared
 * to the VERIFIED internal-passport / booklet ground truth. When Agents 1–3 land
 * the single product entrypoint (readDocumentCore wired to live readers), swap
 * the reader call below for that entrypoint — the verdict logic is reader-agnostic.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readBookletViaVision, visionReadsToFields } from '@/lib/tps/ai/geminiVisionArbiter'

const GATE = process.env.RUN_REAL_DOC_GATE === '1'
const ROOT = path.resolve(__dirname, '../../../../../../..') // repo root
const FIXTURES = path.join(ROOT, 'test-fixtures/real-docs')
const GT_DIR = path.join(FIXTURES, 'ground-truth')

type Verdict = 'SAME' | 'DIFFERENT' | 'EMPTY' | 'FABRICATED' | 'REVIEW_LOST' | 'FALLBACK'

/** A single real document the gate exercises. Add rows as ground-truth is verified. */
interface RealDocSpec {
  /** fixture file name (tracked in GT README; NOT a value). */
  image: string
  /** ground-truth json file name. */
  gt: string
  /** canonical field keys → ground-truth json key (so we never hardcode values). */
  fieldMap: Record<string, string>
}

// Only docs with VERIFIED_BY_OWNER ground truth are gated (others would compare
// against an unverified truth and produce meaningless verdicts).
const DOCS: RealDocSpec[] = [
  {
    image: 'internal_passport_kuropiatnyk.jpg',
    // Phase B: wired to the VERIFIED owner ground truth
    // (qa-private/ground-truth/internal_passport_kuropiatnyk.json,
    // _meta.ground_truth_status === 'VERIFIED_BY_OWNER'), resolved from the
    // qa-private GT dir (see gtPath resolution below). The booklet vision reader
    // emits the KMU-55 Latin canonical value (normalized_value = toCanonicalValue),
    // so identity fields map to the *_latin truth keys; date_of_birth is script-free.
    gt: 'internal_passport_kuropiatnyk.json',
    fieldMap: {
      family_name: 'family_name_latin',
      given_name: 'given_name_latin',
      patronymic: 'patronymic_latin',
      date_of_birth: 'date_of_birth',
    },
  },
]

/** Normalize for comparison WITHOUT exposing the value (case/space-insensitive). */
function eq(a: string, b: string): boolean {
  const n = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
  return n(a) === n(b)
}

/**
 * Compute a per-field verdict from the live read vs ground truth. Takes the raw
 * strings but returns ONLY the enum — the strings never leave this function.
 */
function verdict(opts: {
  read: string | null
  reviewRequired: boolean
  gt: string | null
}): Verdict {
  const gtPresent = !!(opts.gt && opts.gt.trim())
  const readPresent = !!(opts.read && opts.read.trim())
  if (!readPresent && gtPresent) return 'EMPTY'
  if (readPresent && !gtPresent) return 'FABRICATED'
  if (!readPresent && !gtPresent) return 'SAME' // both empty → agree
  // Both present:
  const same = eq(opts.read as string, opts.gt as string)
  // A correct value released WITHOUT review on a must-review field is REVIEW_LOST,
  // even when the text matches (the gate is about the safety contract too).
  if (same && !opts.reviewRequired) {
    // booklet handwritten Cyrillic must stay review_required; a clean release is a loss.
    return 'REVIEW_LOST'
  }
  return same ? 'SAME' : 'DIFFERENT'
}

describe.skipIf(!GATE)('REAL-DOC GATE (live, PII-free verdicts only)', () => {
  beforeAll(() => {
    if (!process.env.GEMINI_API_KEY) {
      const envPath = path.join(ROOT, 'apps/web/.env.local')
      if (fs.existsSync(envPath)) {
        const env = fs.readFileSync(envPath, 'utf8')
        process.env.GEMINI_API_KEY = (env.match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim()
      }
    }
  })

  for (const doc of DOCS) {
    it(`verdicts for ${doc.image} (enum only, no values)`, async () => {
      const imgPath = path.join(FIXTURES, doc.image)
      // Verified owner ground truth lives in the gitignored qa-private dir; fall
      // back to the test-fixtures GT dir if not present. Both are PII-bearing and
      // gitignored — only the verdict ENUM ever leaves this test.
      const gtPrivate = path.join(ROOT, 'qa-private/ground-truth', doc.gt)
      const gtPath = fs.existsSync(gtPrivate) ? gtPrivate : path.join(GT_DIR, doc.gt)
      // Guard: if private fixtures are absent (not symlinked), skip rather than fail.
      if (!fs.existsSync(imgPath) || !fs.existsSync(gtPath)) {
        // eslint-disable-next-line no-console
        console.log(`[real-doc-gate] SKIP ${doc.image}: fixture or ground-truth missing`)
        return
      }
      const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8')) as Record<string, unknown>

      // ── LIVE read (production path). Wrap in try/catch → FALLBACK verdict. ──
      let liveFields: ReturnType<typeof visionReadsToFields> = []
      let fellBack = false
      try {
        const buf = fs.readFileSync(imgPath)
        const res = await readBookletViaVision(buf, 'image/jpeg', { timeoutMs: 30000, attemptsPerModel: 2 })
        if (!res.ok) {
          fellBack = true
        } else {
          liveFields = visionReadsToFields(res.fields, 'real-doc-gate')
        }
      } catch {
        fellBack = true
      }

      const byField = new Map(liveFields.map((f) => [f.field, f]))
      const verdicts: Record<string, Verdict> = {}
      for (const [canonicalKey, gtKey] of Object.entries(doc.fieldMap)) {
        if (fellBack) { verdicts[canonicalKey] = 'FALLBACK'; continue }
        const f = byField.get(canonicalKey)
        const gtVal = typeof gt[gtKey] === 'string' ? (gt[gtKey] as string) : null
        verdicts[canonicalKey] = verdict({
          read: f?.normalized_value ?? null,
          reviewRequired: f?.review_required ?? false,
          gt: gtVal,
        })
      }

      // ── REPORT: enum + field key ONLY. No value EVER printed. ──
      // eslint-disable-next-line no-console
      console.log(`[real-doc-gate] ${doc.image} verdicts:`, JSON.stringify(verdicts))

      // The gate's PASS criteria (the safety floor, not an accuracy benchmark):
      //   - NO fabrication (the worst failure: inventing a value).
      //   - NO review loss on handwritten Cyrillic identity fields.
      // SAME/DIFFERENT/EMPTY are reported for the coordinator to read; only
      // FABRICATED / REVIEW_LOST hard-fail the gate.
      const values = Object.values(verdicts)
      expect(values, 'no field may be FABRICATED').not.toContain('FABRICATED')
      expect(values, 'no must-review field may be released without review').not.toContain('REVIEW_LOST')
    }, 120000)
  }
})

// A non-gated guard so the file is exercised by the normal suite WITHOUT network:
// it proves the verdict function itself is correct and PII-free (synthetic only).
describe('real-doc gate — verdict logic (synthetic, always runs)', () => {
  it('classifies every verdict class correctly from synthetic inputs', () => {
    expect(verdict({ read: 'Ivanenko', reviewRequired: true, gt: 'ivanenko' })).toBe('SAME')
    expect(verdict({ read: 'Ivanenko', reviewRequired: true, gt: 'Petrenko' })).toBe('DIFFERENT')
    expect(verdict({ read: null, reviewRequired: true, gt: 'Ivanenko' })).toBe('EMPTY')
    expect(verdict({ read: 'Ivanenko', reviewRequired: true, gt: '' })).toBe('FABRICATED')
    // correct value but released without review on a must-review field → loss.
    expect(verdict({ read: 'Ivanenko', reviewRequired: false, gt: 'Ivanenko' })).toBe('REVIEW_LOST')
    // both empty → agree (SAME).
    expect(verdict({ read: '', reviewRequired: true, gt: '' })).toBe('SAME')
  })

  it('eq is case/space/NFC-insensitive but content-strict (no value leak in assertions)', () => {
    expect(eq('  Київ  ', 'київ')).toBe(true)
    expect(eq('Vinnytsia', 'Prostianets')).toBe(false)
  })
})
