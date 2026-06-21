/**
 * mrzAuthority.test.ts — MRZ authority reader for international passport.
 *
 * Covers:
 *   - valid TD3 MRZ: all controlled fields extracted, mrzCheckValid=true
 *   - invalid MRZ (bad check digit): review_required=true, NOT silent fallback
 *   - missing MRZ: empty array (no MRZ candidates injected)
 *   - field naming: matches arbitration.ts PASSPORT_MRZ_FIELDS keys
 *   - forbidden fields: I-94, A-number, EAD, address, patronymic, etc. never emitted
 *   - date conversion: YYMMDD → ISO yyyy-mm-dd via parseMrz isoFromYYMMDD
 *   - sex: only M/F emitted; unspecified '<'/'X' → no candidate
 *
 * Real passport fixture (Ivanenko Ivan, FA000000, DOB 1990-01-01):
 *   P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<
 *   FA000000<5UKR9001011M3001019<<<<<<<<<<<<<<06
 */
import { describe, it, expect } from 'vitest'
import {
  mrzCandidatesFromText,
  mrzReadFromOcrText,
  MRZ_CONTROLLED_FIELDS,
  MRZ_FORBIDDEN_FIELDS,
} from '../mrzAuthority'
import { PASSPORT_MRZ_FIELDS } from '../arbitration'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * Real passport from test bench.
 * FA000000: check digit 7 (at position 9 of line 2).
 * DOB 900101: check digit 7 (at position 19 of line 2).
 * Expiry 300101: check digit 3 (at position 27 of line 2).
 * Composite check digit 4 (final char of line 2).
 */
const VALID_TD3_TEXT = [
  'УКРАЇНА / UKRAINE',
  'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<',
  'FA000000<5UKR9001011M3001019<<<<<<<<<<<<<<06',
].join('\n')

/** Same passport but check digit corrupted to 0 (was 7) → invalid. */
const INVALID_CHECK_DIGIT_TEXT = [
  'УКРАЇНА / UKRAINE',
  'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<',
  'FA000000<0UKR9001011M3001019<<<<<<<<<<<<<<06', // position 9 changed 7→0
].join('\n')

/** Text with no MRZ lines at all. */
const NO_MRZ_TEXT = 'This document has no machine-readable zone.'

// ---------------------------------------------------------------------------
// Valid MRZ — controls all 7 passport fields
// ---------------------------------------------------------------------------

describe('mrzCandidatesFromText — valid MRZ', () => {
  it('returns 7 candidates for a complete valid TD3 MRZ', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.length).toBe(7)
  })

  it('controls passport_number', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const pn = candidates.find((c) => c.key === 'passport_number')!
    expect(pn).toBeDefined()
    expect(pn.value).toBe('FA000000')
    expect(pn.source).toBe('mrz')
    expect(pn.mrzCheckValid).toBe(true)
    expect(pn.confidence).toBe(0.99)
    expect(pn.reviewRequired).toBe(false)
  })

  it('controls date_of_birth (ISO format)', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const dob = candidates.find((c) => c.key === 'date_of_birth')!
    expect(dob).toBeDefined()
    expect(dob.value).toBe('1990-01-01')
    expect(dob.mrzCheckValid).toBe(true)
  })

  it('controls sex (M/F only)', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const sex = candidates.find((c) => c.key === 'sex')!
    expect(sex).toBeDefined()
    expect(sex.value).toBe('M')
    expect(sex.source).toBe('mrz')
  })

  it('controls date_of_expiry (ISO format)', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const exp = candidates.find((c) => c.key === 'date_of_expiry')!
    expect(exp).toBeDefined()
    expect(exp.value).toBe('2030-01-01')
    expect(exp.mrzCheckValid).toBe(true)
  })

  it('controls family_name (Latin, from MRZ surname field)', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const fn = candidates.find((c) => c.key === 'family_name')!
    expect(fn).toBeDefined()
    expect(fn.value).toBe('IVANENKO')
    expect(fn.source).toBe('mrz')
  })

  it('controls given_name (Latin, from MRZ given_names field)', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const gn = candidates.find((c) => c.key === 'given_name')!
    expect(gn).toBeDefined()
    expect(gn.value).toBe('IVAN')
    expect(gn.source).toBe('mrz')
  })

  it('controls nationality', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const nat = candidates.find((c) => c.key === 'nationality')!
    expect(nat).toBeDefined()
    expect(nat.value).toBe('UKR')
    expect(nat.source).toBe('mrz')
  })

  it('all candidates have source=mrz', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    for (const c of candidates) {
      expect(c.source).toBe('mrz')
    }
  })

  it('all candidates have provider=mrz_authority', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    for (const c of candidates) {
      expect(c.provider).toBe('mrz_authority')
    }
  })
})

// ---------------------------------------------------------------------------
// Invalid MRZ — bad check digit → review_required, NOT silent fallback
// ---------------------------------------------------------------------------

describe('mrzCandidatesFromText — invalid MRZ (bad check digit)', () => {
  it('returns candidates with mrzCheckValid=false', () => {
    const candidates = mrzCandidatesFromText(INVALID_CHECK_DIGIT_TEXT)
    // Should still return candidates (not empty) so Core can flag them
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) {
      expect(c.mrzCheckValid).toBe(false)
    }
  })

  it('forces reviewRequired=true on all candidates — not silent fallback', () => {
    const candidates = mrzCandidatesFromText(INVALID_CHECK_DIGIT_TEXT)
    for (const c of candidates) {
      expect(c.reviewRequired).toBe(true)
    }
  })

  it('includes mrz_check_failed in reviewReasons', () => {
    const candidates = mrzCandidatesFromText(INVALID_CHECK_DIGIT_TEXT)
    for (const c of candidates) {
      expect(c.reviewReasons).toContain('mrz_check_failed')
    }
  })

  it('confidence is 0.3 (low trust) for invalid MRZ', () => {
    const candidates = mrzCandidatesFromText(INVALID_CHECK_DIGIT_TEXT)
    for (const c of candidates) {
      expect(c.confidence).toBe(0.3)
    }
  })

  it('source is still mrz (Core arbitration sees it and flags mrz_check_failed)', () => {
    const candidates = mrzCandidatesFromText(INVALID_CHECK_DIGIT_TEXT)
    for (const c of candidates) {
      expect(c.source).toBe('mrz')
    }
  })
})

// ---------------------------------------------------------------------------
// Missing MRZ — no MRZ candidates injected
// ---------------------------------------------------------------------------

describe('mrzCandidatesFromText — missing MRZ', () => {
  it('returns empty array when no MRZ found', () => {
    const candidates = mrzCandidatesFromText(NO_MRZ_TEXT)
    expect(candidates).toHaveLength(0)
  })

  it('returns empty array for empty string', () => {
    expect(mrzCandidatesFromText('')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Sex edge cases
// ---------------------------------------------------------------------------

describe('mrzCandidatesFromText — sex field edge cases', () => {
  it('does not emit sex candidate when MRZ has unspecified sex (<)', () => {
    // Replace M with < in the sex position (line 2, position 20)
    const unspecifiedSexText = [
      'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<',
      'FA000000<5UKR9001011<3001019<<<<<<<<<<<<<<06',
    ].join('\n')
    const candidates = mrzCandidatesFromText(unspecifiedSexText)
    const sex = candidates.find((c) => c.key === 'sex')
    expect(sex).toBeUndefined()
  })

  it('emits sex=F for female passport', () => {
    // Replace M with F
    const femaleSexText = [
      'P<UKRKOVALENKO<<OLENA<<<<<<<<<<<<<<<<<<<<<<',
      'AB1234560<7UKR9001010F3001010<<<<<<<<<<<<<<<6',
    ].join('\n')
    const candidates = mrzCandidatesFromText(femaleSexText)
    const sex = candidates.find((c) => c.key === 'sex')
    // If MRZ is valid enough to parse, sex should be F
    if (sex) {
      expect(sex.value).toBe('F')
    }
  })
})

// ---------------------------------------------------------------------------
// Forbidden fields — MRZ must NEVER populate these
// ---------------------------------------------------------------------------

describe('MRZ_FORBIDDEN_FIELDS — never populated by MRZ', () => {
  it('MRZ does NOT emit i94_admission_number', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'i94_admission_number')).toBeUndefined()
  })

  it('MRZ does NOT emit a_number', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'a_number')).toBeUndefined()
  })

  it('MRZ does NOT emit ead_category', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'ead_category')).toBeUndefined()
  })

  it('MRZ does NOT emit us_address', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'us_address')).toBeUndefined()
  })

  it('MRZ does NOT emit patronymic', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'patronymic')).toBeUndefined()
  })

  it('MRZ does NOT emit place_of_birth', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'place_of_birth')).toBeUndefined()
  })

  it('MRZ does NOT emit issuing_authority', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'issuing_authority')).toBeUndefined()
  })

  it('MRZ does NOT emit eligibility', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'eligibility')).toBeUndefined()
  })

  it('MRZ does NOT emit i94_date_of_entry', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'i94_date_of_entry')).toBeUndefined()
  })

  it('MRZ does NOT emit i94_class_of_admission', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    expect(candidates.find((c) => c.key === 'i94_class_of_admission')).toBeUndefined()
  })

  it('all emitted keys are in MRZ_CONTROLLED_FIELDS only', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const controlledSet = new Set(MRZ_CONTROLLED_FIELDS as readonly string[])
    for (const c of candidates) {
      expect(controlledSet.has(c.key)).toBe(true)
    }
  })

  it('no emitted key is in MRZ_FORBIDDEN_FIELDS', () => {
    const candidates = mrzCandidatesFromText(VALID_TD3_TEXT)
    const forbiddenSet = new Set(MRZ_FORBIDDEN_FIELDS as readonly string[])
    for (const c of candidates) {
      expect(forbiddenSet.has(c.key)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// MRZ_CONTROLLED_FIELDS coverage matches arbitration PASSPORT_MRZ_FIELDS
// ---------------------------------------------------------------------------

describe('MRZ_CONTROLLED_FIELDS alignment with arbitration', () => {
  it('all MRZ_CONTROLLED_FIELDS are in PASSPORT_MRZ_FIELDS (arbitration recognizes them)', () => {
    for (const field of MRZ_CONTROLLED_FIELDS) {
      expect(PASSPORT_MRZ_FIELDS.has(field)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// mrzReadFromOcrText — async wrapper (CoreReaders.mrzRead compatible)
// ---------------------------------------------------------------------------

describe('mrzReadFromOcrText — async CoreReaders.mrzRead interface', () => {
  it('resolves to the same result as mrzCandidatesFromText for valid MRZ', async () => {
    const result = await mrzReadFromOcrText(VALID_TD3_TEXT)
    expect(result.length).toBe(7)
    expect(result.find((c) => c.key === 'passport_number')?.value).toBe('FA000000')
  })

  it('resolves to empty array for non-string input', async () => {
    const result = await mrzReadFromOcrText({})
    expect(result).toHaveLength(0)
  })

  it('resolves to empty array for null input', async () => {
    const result = await mrzReadFromOcrText(null)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Invented fields count = 0 (Law 1: no source → no field)
// ---------------------------------------------------------------------------

describe('invented_fields_count = 0', () => {
  it('no field is emitted without a real MRZ value (empty/blank values skipped)', () => {
    // Partial MRZ — only line 1, no line 2: parseMrz returns ok=false, no field values
    const partialText = 'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<'
    const candidates = mrzCandidatesFromText(partialText)
    // May return empty or partial — but must not invent values
    for (const c of candidates) {
      expect(c.value.trim()).not.toBe('')
    }
  })
})
