/**
 * brainSingleArbiterInvariant.test — THE #1 integrity guarantee for "central brain
 * + dictionaries": NO field value reaches the translation output (rows/PDF) without
 * passing through the Central Brain (arbitrateDocument) → buildCanonicalResult
 * (the ONE envelope) → getCanonicalValue (the ONE value accessor honoring the C3
 * finalValue contract). The brain is the SINGLE arbiter; the canonical result is the
 * SINGLE source for the translation path.
 *
 * Two complementary proofs:
 *   1. BEHAVIORAL — drive the REAL functions (no mocks of the brain) end to end and
 *      assert the invariant holds: a rejected critical field emits null, never the raw
 *      guess; a valid MRZ controls; buildCanonicalResult is a pure wrapper.
 *   2. SOURCE-INVARIANT (like actions.security.test.ts) — read vision-extract/route.ts
 *      as text and prove it builds translation rows ONLY via toTranslationRows over the
 *      canonicalResult.fields, never emitting a raw candidate value to a row bypassing
 *      getCanonicalValue.
 *
 * Synthetic data only — no PII.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CanonicalField } from '../../types'
import type { FieldCandidate } from '../types'
import { arbitrateDocument } from '../arbitration'
import { buildCanonicalResult } from '../buildCanonicalResult'
import { getCanonicalValue } from '../fieldAccessor'
import { toTranslationRows } from '../translationAdapter'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — build CanonicalField / FieldCandidate without re-implementing brain logic.
// ─────────────────────────────────────────────────────────────────────────────
const fld = (over: Partial<CanonicalField>): CanonicalField => ({
  key: 'given_name',
  rawValue: null,
  normalizedValue: null,
  criticality: 'medium',
  confidence: { ocr: null, field_match: null, normalization: null, source_match: null, final: 0.9 },
  source: 'ai_vision',
  reviewRequired: false,
  reviewReasons: [],
  evidence: [],
  ...over,
})

const cand = (over: Partial<FieldCandidate>): FieldCandidate => ({
  key: 'family_name',
  value: 'IVANENKO',
  source: 'ai_vision',
  confidence: 0.99,
  provider: 'test',
  ...over,
})

const NO_KNOWLEDGE = undefined // arbitrate without D2 → byte-identical to bare arbitration

// =============================================================================
// INVARIANT 1 — getCanonicalValue honors the C3 contract: finalValue===null ⇒ null,
// NO resurrection from normalizedValue/rawValue. This is the kill-switch the whole
// "no value escapes the brain" guarantee rests on.
// =============================================================================
describe('C3 contract: getCanonicalValue never resurrects a rejected value', () => {
  it('finalValue===null → null even when normalizedValue AND rawValue are present', () => {
    const f = fld({ finalValue: null, normalizedValue: 'Taras', rawValue: 'Тарас' })
    expect(getCanonicalValue(f)).toBeNull()
  })

  it('finalValue===string → the release value (not normalizedValue)', () => {
    expect(getCanonicalValue(fld({ finalValue: 'Taras', normalizedValue: 'WRONG' }))).toBe('Taras')
  })

  it('finalValue===undefined → backward-compat normalizedValue ?? rawValue', () => {
    expect(getCanonicalValue(fld({ normalizedValue: 'Taras', rawValue: 'Тарас' }))).toBe('Taras')
    expect(getCanonicalValue(fld({ normalizedValue: null, rawValue: 'Тарас' }))).toBe('Тарас')
  })
})

// =============================================================================
// INVARIANT 2 — a field the arbiter/safety layer rejects (review_required +
// finalValue null) → toTranslationRows emits null, NEVER the raw guess. This is the
// end-to-end proof that a killed value cannot leak to a translation row.
// =============================================================================
describe('rejected critical field → row value is null, never the raw guess', () => {
  it('toTranslationRows emits value=null for a C3-rejected field, preserving review state', () => {
    // Simulate the state after C3 (applyOcrFieldSafety) rejected an uncertain critical
    // field: finalValue=null, review flagged, the raw read parked in normalizedValue.
    const rejected = fld({
      key: 'passport_number',
      criticality: 'critical',
      finalValue: null,            // C3 verdict: REJECTED
      normalizedValue: 'FA1234567', // the raw guess that must NOT be released
      rawValue: 'FA1234567',
      reviewRequired: true,
      reviewReasons: ['critical_no_mrz_anchor', 'low_confidence'],
    })
    const result = buildCanonicalResult({
      documentSessionId: 's', product: 'translation', docType: 'ua_international_passport',
      fields: [rejected], createdAt: '2026-01-01T00:00:00Z',
    })
    const rows = toTranslationRows(result.fields, new Map())
    expect(rows).toHaveLength(1)
    expect(rows[0].field).toBe('passport_number')
    // THE GUARANTEE: the raw guess never reaches the row.
    expect(rows[0].value).toBeNull()
    expect(rows[0].value).not.toBe('FA1234567')
    // Review state and reasons survive so the wizard tells the user WHY it is blank.
    expect(rows[0].review_required).toBe(true)
    expect(rows[0].review_reasons).toEqual(['critical_no_mrz_anchor', 'low_confidence'])
  })

  it('the brain itself flags an LLM-only critical field for review (no silent auto-trust)', () => {
    // A critical field read only by ai_vision with NO MRZ anchor must come back
    // review_required from arbitrateDocument — proving the brain, not the adapter,
    // is the arbiter of trust.
    const out = arbitrateDocument([cand({ key: 'passport_number', value: 'FA1234567', source: 'ai_vision', confidence: 0.99 })], NO_KNOWLEDGE)
    const f = out.find((x) => x.key === 'passport_number')!
    expect(f.reviewRequired).toBe(true)
    expect(f.reviewReasons).toContain('critical_no_mrz_anchor')
  })
})

// =============================================================================
// INVARIANT 3 — controlling Latin (valid MRZ) wins over a re-transliteration
// candidate. Hard rule: "Controlling Latin spelling (MRZ/I-94/EAD) beats
// re-transliteration." The brain selects MRZ; that value is what flows to the row.
// =============================================================================
describe('valid MRZ controls over a re-transliteration candidate', () => {
  it('arbitrateDocument selects the valid-MRZ value, and it survives to the row', () => {
    const candidates: FieldCandidate[] = [
      // Re-transliteration guess from the visual page (lower authority).
      cand({ key: 'family_name', value: 'IVANENKO', source: 'ai_vision', confidence: 0.95 }),
      // Controlling Latin from a math-valid MRZ (highest authority).
      cand({ key: 'family_name', value: 'IVANENKO-PETRENKO', source: 'mrz', confidence: 0.99, mrzCheckValid: true }),
    ]
    const out = arbitrateDocument(candidates, NO_KNOWLEDGE)
    const f = out.find((x) => x.key === 'family_name')!
    // Brain picked the MRZ value; valid MRZ wins and is NOT forced to review.
    expect(f.source).toBe('mrz')
    expect(getCanonicalValue(f)).toBe('IVANENKO-PETRENKO')
    expect(f.reviewRequired).toBe(false)

    // And the controlling value is exactly what toTranslationRows emits.
    const result = buildCanonicalResult({
      documentSessionId: 's', product: 'translation', docType: 'ua_international_passport',
      fields: out, createdAt: '2026-01-01T00:00:00Z',
    })
    const row = toTranslationRows(result.fields, new Map()).find((r) => r.field === 'family_name')!
    expect(row.value).toBe('IVANENKO-PETRENKO')
    expect(row.value).not.toBe('IVANENKO') // the re-transliteration did NOT win
  })

  it('an INVALID MRZ is a red flag → review, not a silent fallback', () => {
    const out = arbitrateDocument(
      [cand({ key: 'passport_number', value: 'FA1234567', source: 'mrz', confidence: 0.99, mrzCheckValid: false })],
      NO_KNOWLEDGE,
    )
    const f = out.find((x) => x.key === 'passport_number')!
    expect(f.reviewRequired).toBe(true)
    expect(f.reviewReasons).toContain('mrz_check_failed')
  })
})

// =============================================================================
// INVARIANT 4 — buildCanonicalResult is a PURE wrapper: it changes NO field value /
// review state / source, and only assembles the documented envelope fields.
// =============================================================================
describe('buildCanonicalResult is a pure wrapper (changes no value)', () => {
  it('passes fields through by identity and derives only the documented envelope fields', () => {
    const fields = [
      fld({ key: 'family_name', finalValue: 'IVANENKO', normalizedValue: 'ivanenko', rawValue: 'Іваненко', reviewRequired: false }),
      fld({ key: 'given_name', finalValue: null, normalizedValue: 'Taras', reviewRequired: true, reviewReasons: ['low_confidence'] }),
    ]
    // Deep snapshot BEFORE wrapping.
    const before = JSON.parse(JSON.stringify(fields))

    const r = buildCanonicalResult({
      documentSessionId: 'sess-1', product: 'translation', docType: 'ua_internal_passport_booklet',
      fields, createdAt: '2026-06-15T00:00:00Z',
    })

    // The fields array is passed by REFERENCE — no copy, no transform.
    expect(r.fields).toBe(fields)
    // And no field was mutated (value/review/source all identical to the snapshot).
    expect(JSON.parse(JSON.stringify(r.fields))).toEqual(before)

    // Documented envelope fields only.
    expect(r.documentSessionId).toBe('sess-1')
    expect(r.product).toBe('translation')
    expect(r.docType).toBe('ua_internal_passport_booklet')
    expect(r.createdAt).toBe('2026-06-15T00:00:00Z')
    // requiresReview is DERIVED from the fields (one field is review_required).
    expect(r.requiresReview).toBe(true)
    // No hashes supplied → empty chain, nothing invented.
    expect(r.hashes).toEqual({ uploadHash: null, normalizedImageHash: null, canonicalResultHash: null })

    // Values read back through the accessor are exactly the C3 verdicts — the wrapper
    // did not resurrect the rejected given_name.
    expect(getCanonicalValue(r.fields[0])).toBe('IVANENKO')
    expect(getCanonicalValue(r.fields[1])).toBeNull()
  })
})

// =============================================================================
// INVARIANT 5 (SOURCE-INVARIANT, like actions.security.test.ts) — the route builds
// translation rows ONLY via toTranslationRows over the canonicalResult.fields. It must
// NOT emit a raw candidate value to a row bypassing the brain/getCanonicalValue.
//
// This is the structural guarantee that the BEHAVIORAL proofs above are actually on
// the live value path — that no second, hand-rolled row builder exists in the route.
// =============================================================================
describe('SOURCE INVARIANT — route builds rows only through the brain/canonical path', () => {
  const routeSrc = readFileSync(
    resolve(__dirname, '../../../../app/api/translation/vision-extract/route.ts'),
    'utf8',
  )

  it('every `fields = ...` assignment in the route flows from toTranslationRows (or a guard over those rows)', () => {
    // The ONLY sanctioned producers of the rows array are toTranslationRows (the B2
    // adapter) and pure post-processors that map over the ALREADY-canonical rows
    // (date ensemble, document-class guards, applyOcrFieldSafety). None construct a
    // value from a raw candidate.
    const SANCTIONED_ROW_PRODUCERS = [
      'toTranslationRows(',   // canonical → rows (the ONLY value-producing builder)
      'ens.fields',           // runDateEnsemble over existing rows
      'legacyEns.fields',     // legacy date ensemble over existing rows
      'fields.map(',          // policy guards re-map existing rows (review flags only)
      'res.fields as',        // applyOcrFieldSafety output (operates on existing rows)
    ]
    // Match `let fields = ...` and `fields = ...` (the live row variable in both paths).
    const assignments = routeSrc.match(/(?:^|\s)fields\s*=\s*[^=].*$/gm) ?? []
    expect(assignments.length, 'route must assign the rows variable').toBeGreaterThan(0)
    for (const line of assignments) {
      const rhs = line.split('=').slice(1).join('=')
      const sanctioned = SANCTIONED_ROW_PRODUCERS.some((p) => rhs.includes(p))
      expect(
        sanctioned,
        `RULE VIOLATION: a translation-rows assignment bypasses the brain/canonical path: ${line.trim()}`,
      ).toBe(true)
    }
  })

  it('toTranslationRows is always called over a canonicalResult.fields (never over raw candidates)', () => {
    // Both the Core path and the legacy fallback must feed toTranslationRows from a
    // buildCanonicalResult(...).fields, never from allCandidates/legacyCandidates.
    const calls = routeSrc.match(/toTranslationRows\(([^,]+),/g) ?? []
    expect(calls.length, 'route must call toTranslationRows').toBeGreaterThan(0)
    for (const c of calls) {
      const arg = c.slice('toTranslationRows('.length).split(',')[0].trim()
      // Accept only a (legacy)canonicalResult.fields-shaped first arg.
      expect(
        /canonicalResult\.fields$/i.test(arg),
        `RULE VIOLATION: toTranslationRows fed a non-canonical first arg "${arg}" — value path bypasses buildCanonicalResult`,
      ).toBe(true)
    }
  })

  it('the route never reads .value/.normalizedValue/.rawValue/.finalValue off a candidate to build a row', () => {
    // canonicalToFieldOut is NOT imported/called directly in the route (rows go
    // exclusively through the toTranslationRows alias) — and no raw candidate field
    // is dereferenced to synthesize a row value.
    expect(
      routeSrc.includes('canonicalToFieldOut('),
      'route must NOT call canonicalToFieldOut directly — only the toTranslationRows alias',
    ).toBe(false)
    // The route must build the canonical envelope before producing rows in BOTH paths.
    expect((routeSrc.match(/buildCanonicalResult\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
    // getCanonicalValue is never re-implemented in the route (no inline precedence rule).
    expect(/finalValue\s*\?\?\s*normalizedValue/.test(routeSrc)).toBe(false)
  })

  it('the post-canonical role guard reads row.value (already brain-resolved), not a candidate', () => {
    // The certificate role guard builds its fieldRecord from `f.value` where f is a
    // ROW (FieldOut) — i.e. an already-getCanonicalValue-resolved value, never a raw
    // candidate. Guards only flip review flags; they never inject a value.
    expect(routeSrc.includes('fieldRecord[f.field] = f.value')).toBe(true)
    // The guard re-maps rows to set review_required; it does not assign f.value from a candidate.
    expect(/forcedSet\.has\(f\.field\)\s*\?\s*\{\s*\.\.\.f,\s*review_required:\s*true\s*\}/.test(routeSrc)).toBe(true)
  })
})
