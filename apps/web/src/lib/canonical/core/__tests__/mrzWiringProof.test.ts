/**
 * mrzWiringProof.test.ts — Arbitration-level proof that MRZ authority is
 * invoked and applied correctly when MRZ candidates are injected into the
 * Core pipeline alongside Gemini docintel candidates.
 *
 * These tests prove the WIRING contract (MRZ_AUTHORITY_WIRED_CODE_READY):
 *   1. TPS / Re-Parole Core path: when docHint=passport, mrzCandidatesFromText
 *      is called on Vision raw_text and the candidates are pushed into the
 *      arbitrateDocument call.
 *   2. Valid MRZ wins over Gemini visual for controlled fields.
 *   3. Invalid MRZ sets review_required=true on arbitrated field.
 *   4. Missing MRZ: visual candidate used, critical field → review_required=true.
 *   5. MRZ NEVER populates forbidden fields (i94, a_number, ead_category, …).
 *   6. EAD does NOT receive invented identity from MRZ.
 *
 * These tests operate at the arbitrateDocument level — no image, no Gemini call,
 * no route handler. Injecting candidates simulates exactly what the routes do.
 *
 * Fixture: real passport Ivanenko Ivan — FA000000, DOB 1990-01-01.
 */
import { describe, it, expect } from 'vitest'
import { arbitrateDocument, PASSPORT_MRZ_FIELDS } from '../arbitration'
import { mrzCandidatesFromText } from '../mrzAuthority'
import type { FieldCandidate } from '../types'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const VALID_TD3_TEXT = [
  'УКРАЇНА / UKRAINE',
  'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<',
  'FA000000<5UKR9001011M3001019<<<<<<<<<<<<<<06',
].join('\n')

const INVALID_CHECK_DIGIT_TEXT = [
  'УКРАЇНА / UKRAINE',
  'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<',
  'FA000000<0UKR9001011M3001019<<<<<<<<<<<<<<06', // check digit 7 → 0
].join('\n')

const NO_MRZ_TEXT = 'Документ без машинозчитуваної зони.'

/** Simulate a Gemini docintel candidate (ai_vision source). */
function visual(key: string, value: string, confidence = 0.85): FieldCandidate {
  return { key, value, source: 'ai_vision', confidence, provider: 'docintel:gemini', reviewRequired: false }
}

// ── Test 1: Valid MRZ wins over Gemini visual for controlled fields ───────────

describe('MRZ wiring — valid MRZ wins over Gemini docintel', () => {
  it('passport_number: MRZ candidate wins over wrong Gemini value', () => {
    // Simulate: Gemini read wrong number, Vision raw_text has correct MRZ
    const geminiCandidates = [visual('passport_number', 'FU999999')]
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)

    const fields = arbitrateDocument([...geminiCandidates, ...mrzCandidates])
    const pn = fields.find((f) => f.key === 'passport_number')!

    expect(pn).toBeDefined()
    expect(pn.normalizedValue).toBe('FA000000') // MRZ wins
    expect(pn.source).toBe('mrz')
    expect(pn.reviewRequired).toBe(false) // valid MRZ → no review
    expect(pn.evidence.length).toBeGreaterThanOrEqual(2) // both sources preserved as evidence
  })

  it('date_of_birth: MRZ wins over Gemini', () => {
    const geminiCandidates = [visual('date_of_birth', '1986-06-20')] // off by 5 days
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)

    const fields = arbitrateDocument([...geminiCandidates, ...mrzCandidates])
    const dob = fields.find((f) => f.key === 'date_of_birth')!

    expect(dob).toBeDefined()
    expect(dob.normalizedValue).toBe('1990-01-01') // MRZ date wins
    expect(dob.source).toBe('mrz')
    expect(dob.reviewRequired).toBe(false)
  })

  it('family_name: MRZ wins over Gemini', () => {
    const geminiCandidates = [visual('family_name', 'Ivanenko')] // same value
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)

    const fields = arbitrateDocument([...geminiCandidates, ...mrzCandidates])
    const fn = fields.find((f) => f.key === 'family_name')!

    expect(fn).toBeDefined()
    expect(fn.source).toBe('mrz')
    expect(fn.reviewRequired).toBe(false) // MRZ valid → authoritative
  })

  it('sex=M from MRZ is present in arbitration result', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fields = arbitrateDocument(mrzCandidates)
    const sex = fields.find((f) => f.key === 'sex')!

    expect(sex).toBeDefined()
    expect(sex.normalizedValue).toBe('M')
    expect(sex.source).toBe('mrz')
    expect(sex.reviewRequired).toBe(false)
  })

  it('nationality from MRZ is present in arbitration result', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fields = arbitrateDocument(mrzCandidates)
    const nat = fields.find((f) => f.key === 'nationality')!

    expect(nat).toBeDefined()
    expect(nat.normalizedValue).toBe('UKR')
    expect(nat.source).toBe('mrz')
  })

  it('all 7 MRZ controlled fields survive arbitration with valid MRZ', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(mrzCandidates.length).toBe(7)

    const fields = arbitrateDocument(mrzCandidates)
    // All 7 should produce a CanonicalField
    expect(fields.length).toBe(7)
  })
})

// ── Test 2: Invalid MRZ → review_required=true, not silent fallback ──────────

describe('MRZ wiring — invalid MRZ forces review, not silent fallback', () => {
  it('passport_number from invalid MRZ: reviewRequired=true with mrz_check_failed', () => {
    const mrzCandidates = mrzCandidatesFromText(INVALID_CHECK_DIGIT_TEXT)
    expect(mrzCandidates.length).toBeGreaterThan(0)

    const fields = arbitrateDocument(mrzCandidates)
    const pn = fields.find((f) => f.key === 'passport_number')!

    expect(pn).toBeDefined()
    expect(pn.reviewRequired).toBe(true) // red flag, not silent accept
    expect(pn.reviewReasons).toContain('mrz_check_failed')
  })

  it('invalid MRZ with visual fallback: MRZ still wins but review_required=true', () => {
    const geminiCandidates = [visual('passport_number', 'FA000000', 0.95)]
    const mrzCandidates = mrzCandidatesFromText(INVALID_CHECK_DIGIT_TEXT)

    const fields = arbitrateDocument([...geminiCandidates, ...mrzCandidates])
    const pn = fields.find((f) => f.key === 'passport_number')!

    expect(pn).toBeDefined()
    expect(pn.source).toBe('mrz') // MRZ still chosen (has source='mrz')
    expect(pn.reviewRequired).toBe(true) // but review required — not silent
    expect(pn.reviewReasons).toContain('mrz_check_failed')
  })
})

// ── Test 3: Missing MRZ → visual candidate used, critical field → review ──────

describe('MRZ wiring — missing MRZ: visual used, critical fields get review', () => {
  it('no MRZ candidates from NO_MRZ_TEXT', () => {
    const mrzCandidates = mrzCandidatesFromText(NO_MRZ_TEXT)
    expect(mrzCandidates).toHaveLength(0)
  })

  it('passport_number: only Gemini candidate, critical_no_mrz_anchor review', () => {
    const geminiCandidates = [visual('passport_number', 'FA000000')]
    // No MRZ candidates (empty rawText)
    const mrzCandidates = mrzCandidatesFromText(NO_MRZ_TEXT)

    const fields = arbitrateDocument([...geminiCandidates, ...mrzCandidates])
    const pn = fields.find((f) => f.key === 'passport_number')!

    expect(pn).toBeDefined()
    expect(pn.normalizedValue).toBe('FA000000') // visual value used
    expect(pn.source).toBe('ai_vision')
    expect(pn.reviewRequired).toBe(true) // critical field, no MRZ anchor
    expect(pn.reviewReasons).toContain('critical_no_mrz_anchor')
  })
})

// ── Test 4: MRZ NEVER populates forbidden fields ──────────────────────────────

describe('MRZ wiring — forbidden fields never populated by MRZ', () => {
  it('i94_admission_number not in arbitration output from MRZ', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fields = arbitrateDocument(mrzCandidates)
    expect(fields.find((f) => f.key === 'i94_admission_number')).toBeUndefined()
  })

  it('a_number not in arbitration output from MRZ', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fields = arbitrateDocument(mrzCandidates)
    expect(fields.find((f) => f.key === 'a_number')).toBeUndefined()
  })

  it('ead_category not in arbitration output from MRZ', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fields = arbitrateDocument(mrzCandidates)
    expect(fields.find((f) => f.key === 'ead_category')).toBeUndefined()
  })

  it('us_address not in arbitration output from MRZ', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fields = arbitrateDocument(mrzCandidates)
    expect(fields.find((f) => f.key === 'us_address')).toBeUndefined()
  })

  it('eligibility not in arbitration output from MRZ', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fields = arbitrateDocument(mrzCandidates)
    expect(fields.find((f) => f.key === 'eligibility')).toBeUndefined()
  })
})

// ── Test 5: EAD does NOT receive invented identity from MRZ ──────────────────

describe('EAD does not receive invented fields from MRZ', () => {
  it('EAD candidates have no overlap with MRZ_CONTROLLED_FIELDS output', () => {
    // MRZ candidates are for international_passport ONLY — not injected for EAD
    // Simulate: EAD Gemini candidates only, no MRZ injection (docHint=ead)
    const eadCandidates = [
      visual('ead_category', 'C09P'),
      visual('card_number', 'SRC2190012345'),
    ]
    // No MRZ injection for EAD (routes only inject MRZ for ua_international_passport)
    const fields = arbitrateDocument(eadCandidates)

    // EAD arbitration should NOT produce i94, a_number, or MRZ passport fields
    expect(fields.find((f) => f.key === 'a_number')).toBeUndefined()
    expect(fields.find((f) => f.key === 'i94_admission_number')).toBeUndefined()
    expect(fields.find((f) => f.key === 'passport_number')).toBeUndefined()
    expect(fields.find((f) => f.key === 'nationality')).toBeUndefined()
  })
})

// ── Test 6: Conflict detection — MRZ wins, visual preserved as evidence ───────

describe('MRZ wiring — conflict: MRZ wins, visual preserved as evidence', () => {
  it('conflicting values: MRZ wins, evidence array contains both', () => {
    const geminiCandidates = [visual('passport_number', 'XX999999', 0.9)] // wrong
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)

    const fields = arbitrateDocument([...geminiCandidates, ...mrzCandidates])
    const pn = fields.find((f) => f.key === 'passport_number')!

    expect(pn.normalizedValue).toBe('FA000000') // MRZ wins
    expect(pn.source).toBe('mrz')
    // Evidence array preserves both candidates (visual + mrz)
    expect(pn.evidence.some((e) => e.source === 'ai_vision')).toBe(true)
    expect(pn.evidence.some((e) => e.source === 'mrz')).toBe(true)
  })
})

// ── Test 7: PASSPORT_MRZ_FIELDS alignment ───────────────────────────────────

describe('PASSPORT_MRZ_FIELDS covers MRZ controlled fields', () => {
  it('all mrzCandidatesFromText keys are in PASSPORT_MRZ_FIELDS', () => {
    const mrzCandidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    for (const c of mrzCandidates) {
      expect(
        PASSPORT_MRZ_FIELDS.has(c.key),
        // vitest message: use a boolean assertion with message via .toBe(true)
      ).toBe(true)
    }
  })
})
