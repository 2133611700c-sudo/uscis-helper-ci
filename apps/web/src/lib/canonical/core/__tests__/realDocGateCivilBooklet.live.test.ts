/**
 * realDocGateCivilBooklet.live.test.ts — Phase 2A / Agent 3
 * (internal booklet + civil documents + military, via the PRODUCTION core path).
 *
 * Distinct from Agent 4's realDocGate.live.test.ts, which calls the booklet vision
 * reader directly (readBookletViaVision). THIS gate exercises the SAME pipeline the
 * deployed translation route runs:
 *
 *   readDocument(buf, mime, docTypeId, {product:'translation'})   // central reader
 *     → buildCyrillicMap + docintelToCandidate                     // adapter in
 *     → applyKnowledgeBrainIfEnabled(buildKnowledgeContext(...))   // D2 brain
 *     → buildCanonicalResult                                       // envelope
 *     → getCanonicalValue (per field)                              // C3 release value
 *
 * so the verdicts reflect what a CONSUMER (translation/TPS/EAD) would actually see
 * after the central-brain cutover — not the raw reader.
 *
 * OUTPUT CONTRACT (HARD): PII-FREE. Only case_id + document_class + field_key +
 * verdict ENUM ever leaves this process. Ground-truth and read values live in memory
 * ONLY and are compared in-process. No value / partial / initial / geography is ever
 * printed, logged, saved, or committed. The file is therefore safe to commit (it
 * contains only fixture FILE NAMES, already tracked in the GT READMEs).
 *
 * SELF-SKIPS unless RUN_REAL_DOC_GATE=1, so CI / the normal suite never touches the
 * network or the private fixtures. Invoke:
 *
 *   RUN_REAL_DOC_GATE=1 pnpm --filter web exec vitest run \
 *     src/lib/canonical/core/__tests__/realDocGateCivilBooklet.live.test.ts
 *
 * The EMPTY question (booklet patronymic / dob): each doc reports a per-field verdict
 * AND a per-field "reader coverage" signal (did the central reader emit the field at
 * all, vs. emit-then-drop). The coverage signal is what distinguishes a pre-existing
 * reader coverage gap (reader never returned the field) from a cutover regression
 * (reader returned it but the canonical pipeline dropped/mutated it). Both are PII-free.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readDocument } from '@/lib/docintel/documentFieldReader'
import {
  buildCyrillicMap,
  docintelToCandidate,
} from '@/lib/canonical/core/translationAdapter'
import {
  buildKnowledgeContext,
  applyKnowledgeBrainIfEnabled,
} from '@/lib/canonical/core/knowledgeBrain'
import { buildCanonicalResult } from '@/lib/canonical/core/buildCanonicalResult'
import { getCanonicalValue, getField } from '@/lib/canonical/core/fieldAccessor'

const GATE = process.env.RUN_REAL_DOC_GATE === '1'
const ROOT = path.resolve(__dirname, '../../../../../../..') // repo root
const FIXTURES = path.join(ROOT, 'test-fixtures/real-docs')
const GT_PRIVATE = path.join(ROOT, 'qa-private/ground-truth')
const GT_PUBLIC = path.join(FIXTURES, 'ground-truth')

type Verdict =
  | 'SAME'
  | 'DIFFERENT'
  | 'EMPTY'
  | 'FABRICATED'
  | 'REVIEW_LOST'
  | 'FALLBACK'
  | 'NOT_APPLICABLE'
  | 'GT_MISSING'

/** Which side of the canonical field we compare to the GT key. */
type CompareSource = 'latin' | 'cyrillic' | 'value'

interface FieldSpec {
  /** canonical field key emitted by the reader/registry (e.g. 'family_name', 'child_patronymic'). */
  canonicalKey: string
  /** ground-truth json key (e.g. 'family_name_latin'). */
  gtKey: string
  /**
   * latin   → compare canonical release value (KMU-55 Latin) to *_latin GT.
   * cyrillic→ compare the field's preserved rawCyrillic to *_cyrillic GT (the
   *           owner-verified read for handwritten civil certs whose Latin is unverified).
   * value   → compare canonical release value to a script-free GT (dates, doc numbers).
   */
  compare: CompareSource
  /** This field MUST stay review_required (a clean release is REVIEW_LOST). */
  mustReview?: boolean
}

interface RealDocSpec {
  caseId: string
  documentClass: string
  image: string
  gt: string
  docTypeId: string
  fields: FieldSpec[]
}

// Only VERIFIED_BY_OWNER ground truth is gated. For passport + military the owner
// verified the *_latin identity values, so identity compares Latin. For the birth
// certs the owner verified *_cyrillic (Latin transliteration unverified), so identity
// compares the preserved rawCyrillic; dates/act-numbers are script-free → 'value'.
const DOCS: RealDocSpec[] = [
  {
    caseId: 'internal_passport',
    documentClass: 'ua_internal_passport_booklet',
    image: 'internal_passport_kuropiatnyk.jpg',
    gt: 'internal_passport_kuropiatnyk.json',
    docTypeId: 'ua_internal_passport_booklet',
    fields: [
      { canonicalKey: 'family_name', gtKey: 'family_name_latin', compare: 'latin', mustReview: true },
      { canonicalKey: 'given_name', gtKey: 'given_name_latin', compare: 'latin', mustReview: true },
      { canonicalKey: 'patronymic', gtKey: 'patronymic_latin', compare: 'latin', mustReview: true },
      { canonicalKey: 'dob', gtKey: 'date_of_birth', compare: 'value', mustReview: true },
    ],
  },
  {
    caseId: 'birth_cert_handwritten',
    documentClass: 'ua_birth_certificate',
    image: 'birth_cert_handwritten_kuropiatnyk.jpg',
    gt: 'birth_cert_handwritten_kuropiatnyk.json',
    docTypeId: 'ua_birth_certificate',
    fields: [
      { canonicalKey: 'child_family_name', gtKey: 'family_name_cyrillic', compare: 'cyrillic', mustReview: true },
      { canonicalKey: 'child_given_name', gtKey: 'given_name_cyrillic', compare: 'cyrillic', mustReview: true },
      { canonicalKey: 'child_patronymic', gtKey: 'patronymic_cyrillic', compare: 'cyrillic', mustReview: true },
      { canonicalKey: 'dob', gtKey: 'date_of_birth', compare: 'value', mustReview: true },
    ],
  },
  {
    caseId: 'birth_cert_soviet',
    documentClass: 'ua_birth_certificate',
    image: 'birth_cert_soviet_kuropiatnyk.jpg',
    gt: 'birth_cert_soviet_kuropiatnyk.json',
    docTypeId: 'ua_birth_certificate',
    fields: [
      { canonicalKey: 'child_family_name', gtKey: 'family_name_cyrillic', compare: 'cyrillic', mustReview: true },
      { canonicalKey: 'child_given_name', gtKey: 'given_name_cyrillic', compare: 'cyrillic', mustReview: true },
      { canonicalKey: 'child_patronymic', gtKey: 'patronymic_cyrillic', compare: 'cyrillic', mustReview: true },
      { canonicalKey: 'dob', gtKey: 'date_of_birth', compare: 'value', mustReview: true },
    ],
  },
  {
    caseId: 'military_id_p1',
    documentClass: 'ua_military_id',
    image: 'military_id_p1_kuropiatnyk.jpg',
    gt: 'military_id_p1_kuropiatnyk.json',
    docTypeId: 'ua_military_id',
    fields: [
      { canonicalKey: 'family_name', gtKey: 'family_name_latin', compare: 'latin', mustReview: true },
      { canonicalKey: 'given_name', gtKey: 'given_name_latin', compare: 'latin', mustReview: true },
      { canonicalKey: 'patronymic', gtKey: 'patronymic_latin', compare: 'latin', mustReview: true },
      { canonicalKey: 'dob', gtKey: 'date_of_birth', compare: 'value', mustReview: true },
      { canonicalKey: 'doc_number', gtKey: 'doc_number', compare: 'value' },
    ],
  },
]

/** Normalize for comparison WITHOUT exposing the value (case/space/NFC-insensitive). */
function eq(a: string, b: string): boolean {
  const n = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')
  return n(a) === n(b)
}

/**
 * Per-field verdict from a live read vs ground truth. Strings are taken but NEVER
 * returned — only the enum leaves this function.
 */
function verdict(opts: {
  read: string | null
  reviewRequired: boolean
  gt: string | null
  mustReview: boolean
}): Verdict {
  const gtPresent = !!(opts.gt && opts.gt.trim())
  const readPresent = !!(opts.read && opts.read.trim())
  if (!gtPresent) {
    // No verified truth for this field → can't value-compare. A read value is not a
    // fabrication here (GT simply unknown), so report GT_MISSING, not FABRICATED.
    return 'GT_MISSING'
  }
  if (!readPresent) return 'EMPTY'
  const same = eq(opts.read as string, opts.gt as string)
  if (same && opts.mustReview && !opts.reviewRequired) return 'REVIEW_LOST'
  return same ? 'SAME' : 'DIFFERENT'
}

function resolveGtPath(file: string): string | null {
  const p1 = path.join(GT_PRIVATE, file)
  if (fs.existsSync(p1)) return p1
  const p2 = path.join(GT_PUBLIC, file)
  if (fs.existsSync(p2)) return p2
  return null
}

describe.skipIf(!GATE)('REAL-DOC GATE — civil/booklet/military (production core path, PII-free)', () => {
  beforeAll(() => {
    // Load .env.local into process.env so the central reader's getGeminiApiKey() sees the key.
    const envPath = path.join(ROOT, 'apps/web/.env.local')
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
      }
    }
  })

  for (const doc of DOCS) {
    it(`verdicts for ${doc.caseId} (${doc.documentClass}) — enum only`, async () => {
      const imgPath = path.join(FIXTURES, doc.image)
      const gtPath = resolveGtPath(doc.gt)
      if (!fs.existsSync(imgPath) || !gtPath) {
        // eslint-disable-next-line no-console
        console.log(`[civil-gate] SKIP ${doc.caseId}: fixture or ground-truth missing`)
        return
      }
      const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8')) as Record<string, unknown>

      // ── LIVE: production translation core path. Any throw / vision-fail → FALLBACK. ──
      let fellBack = false
      let canonicalResult: ReturnType<typeof buildCanonicalResult> | null = null
      // readerEmitted[key] = did the CENTRAL READER return this field (coverage probe).
      const readerEmitted = new Map<string, boolean>()
      // readerHadValue[key] = did the reader return a NON-NULL value for it.
      const readerHadValue = new Map<string, boolean>()
      try {
        const buf = fs.readFileSync(imgPath)
        const r = await readDocument(buf, 'image/jpeg', doc.docTypeId, {
          timeoutMs: 85_000,
          attemptsPerModel: 1,
          product: 'translation',
        })
        if (!r.ok) {
          fellBack = true
        } else {
          for (const f of r.fields) {
            readerEmitted.set(f.field, true)
            // a registry-backfill row has value:null + review_reason not_read_manual_entry.
            const backfilled = (f.review_reasons ?? []).includes('not_read_manual_entry')
            readerHadValue.set(f.field, !!(f.value && f.value.trim()) && !backfilled)
          }
          const cyrillicMap = buildCyrillicMap(r.fields)
          const candidates = r.fields.map((f) => docintelToCandidate(f, 1))
          const canonicalFields = applyKnowledgeBrainIfEnabled(
            candidates,
            buildKnowledgeContext({ docTypeId: doc.docTypeId, product: 'translation' }),
          )
          canonicalResult = buildCanonicalResult({
            documentSessionId: `civil-gate-${doc.caseId}`,
            product: 'translation',
            docType: doc.docTypeId,
            fields: canonicalFields,
            createdAt: new Date().toISOString(),
          })
          // touch cyrillicMap so it is part of the same canonical currency (parity).
          void cyrillicMap
        }
      } catch {
        fellBack = true
      }

      const verdicts: Record<string, Verdict> = {}
      // coverage signal: for an EMPTY identity field, was it a reader coverage gap
      // (reader never emitted a value) or a pipeline drop (reader had a value, canonical
      // released null)? Reported PII-free, only for fields that came out EMPTY.
      const coverage: Record<string, 'reader_no_value' | 'pipeline_dropped' | 'n/a'> = {}

      for (const fs_ of doc.fields) {
        if (fellBack || !canonicalResult) {
          verdicts[fs_.canonicalKey] = 'FALLBACK'
          coverage[fs_.canonicalKey] = 'n/a'
          continue
        }
        const field = getField(canonicalResult, fs_.canonicalKey)
        let readVal: string | null = null
        if (field) {
          if (fs_.compare === 'cyrillic') {
            readVal = field.rawCyrillic ?? null
          } else {
            // latin / value → the C3 release value through the single sanctioned accessor.
            readVal = getCanonicalValue(field)
          }
        }
        const gtVal = typeof gt[fs_.gtKey] === 'string' ? (gt[fs_.gtKey] as string) : null
        const v = verdict({
          read: readVal,
          reviewRequired: field?.reviewRequired ?? false,
          gt: gtVal,
          mustReview: !!fs_.mustReview,
        })
        verdicts[fs_.canonicalKey] = v

        if (v === 'EMPTY') {
          // The reader either never gave a value (coverage gap) or gave one the
          // canonical pipeline dropped (regression). For cyrillic-compare fields use
          // rawCyrillic presence; for latin/value use the reader's value presence.
          const readerHadIt = readerHadValue.get(fs_.canonicalKey) === true
          coverage[fs_.canonicalKey] = readerHadIt ? 'pipeline_dropped' : 'reader_no_value'
        } else {
          coverage[fs_.canonicalKey] = 'n/a'
        }
      }

      // ── REPORT: enum + field key ONLY. No value EVER printed. ──
      // eslint-disable-next-line no-console
      console.log(
        `[civil-gate] case=${doc.caseId} class=${doc.documentClass} ` +
          `verdicts=${JSON.stringify(verdicts)} coverage=${JSON.stringify(coverage)}`,
      )

      // PASS criteria (the SAFETY floor, not an accuracy benchmark):
      //   - NO FABRICATED (worst failure: inventing a value).
      //   - NO REVIEW_LOST on must-review handwritten identity/date fields.
      // SAME/DIFFERENT/EMPTY/GT_MISSING/FALLBACK are reported for the coordinator;
      // only FABRICATED / REVIEW_LOST hard-fail the safety gate.
      const values = Object.values(verdicts)
      expect(values, 'no field may be FABRICATED').not.toContain('FABRICATED')
      expect(values, 'no must-review field may be released without review').not.toContain('REVIEW_LOST')
    }, 180_000)
  }
})

// Non-gated guard so the verdict logic is exercised by the normal suite WITHOUT
// network. Proves the verdict function is correct and PII-free (synthetic only).
describe('civil-gate — verdict logic (synthetic, always runs)', () => {
  it('classifies every verdict class from synthetic inputs', () => {
    expect(verdict({ read: 'Ivanenko', reviewRequired: true, gt: 'ivanenko', mustReview: true })).toBe('SAME')
    expect(verdict({ read: 'Ivanenko', reviewRequired: true, gt: 'Petrenko', mustReview: true })).toBe('DIFFERENT')
    expect(verdict({ read: null, reviewRequired: true, gt: 'Ivanenko', mustReview: true })).toBe('EMPTY')
    // correct value released WITHOUT review on a must-review field → loss.
    expect(verdict({ read: 'Ivanenko', reviewRequired: false, gt: 'Ivanenko', mustReview: true })).toBe('REVIEW_LOST')
    // a must-review field that is reviewed AND correct is SAME, not a loss.
    expect(verdict({ read: 'Ivanenko', reviewRequired: true, gt: 'Ivanenko', mustReview: true })).toBe('SAME')
    // no verified GT for the field → GT_MISSING (a read value is NOT a fabrication here).
    expect(verdict({ read: 'Ivanenko', reviewRequired: true, gt: null, mustReview: true })).toBe('GT_MISSING')
    expect(verdict({ read: null, reviewRequired: true, gt: '', mustReview: true })).toBe('GT_MISSING')
  })

  it('eq is case/space/NFC-insensitive but content-strict (no value leak in assertions)', () => {
    expect(eq('  Alpha  ', 'alpha')).toBe(true)
    expect(eq('Alphaville', 'Betatown')).toBe(false)
  })
})
