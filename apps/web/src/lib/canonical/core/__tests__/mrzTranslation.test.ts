/**
 * mrzTranslation.test.ts — 1A: MRZ wired into the translation path.
 * A valid MRZ for the international passport must auto-resolve the date/number/
 * name fields (no critical_no_mrz_anchor), with MRZ keys remapped to the
 * translation registry's field names (date_of_birth→dob, date_of_expiry→
 * passport_expiration_date). Synthetic MRZ only (Ivanenko / FA000000).
 */
import { describe, it, expect } from 'vitest'
import { mrzCandidatesForTranslation } from '../mrzAuthority'
import { arbitrateDocument } from '../arbitration'
import type { FieldCandidate } from '../types'

// Valid synthetic TD3 (matches mrzAuthority.test.ts fixture).
const VALID_TD3 = [
  'УКРАЇНА / UKRAINE',
  'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<',
  'FA000000<5UKR9001011M3001019<<<<<<<<<<<<<<06',
].join('\n')

describe('mrzCandidatesForTranslation — key remap + filter', () => {
  it('remaps date_of_birth→dob and date_of_expiry→passport_expiration_date', () => {
    const keys = mrzCandidatesForTranslation(VALID_TD3, 'ua_international_passport').map((c) => c.key).sort()
    expect(keys).toContain('dob')
    expect(keys).toContain('passport_expiration_date')
    expect(keys).not.toContain('date_of_birth')
    expect(keys).not.toContain('date_of_expiry')
  })

  it('keeps only the 5 registry fields (drops nationality/sex)', () => {
    const keys = new Set(mrzCandidatesForTranslation(VALID_TD3, 'ua_international_passport').map((c) => c.key))
    expect(keys).toEqual(new Set(['family_name', 'given_name', 'passport_number', 'dob', 'passport_expiration_date']))
  })

  it('all candidates are valid MRZ', () => {
    const cands = mrzCandidatesForTranslation(VALID_TD3, 'ua_international_passport')
    expect(cands.length).toBe(5)
    expect(cands.every((c) => c.source === 'mrz' && c.mrzCheckValid === true)).toBe(true)
  })

  it('returns [] for a docType with no MRZ mapping (no behavior change)', () => {
    expect(mrzCandidatesForTranslation(VALID_TD3, 'ua_birth_certificate')).toEqual([])
  })

  it('returns [] when there is no MRZ in the text', () => {
    expect(mrzCandidatesForTranslation('no machine-readable zone here', 'ua_international_passport')).toEqual([])
  })
})

describe('arbitration with a valid MRZ — no critical_no_mrz_anchor', () => {
  const vision = (key: string, value: string): FieldCandidate => ({
    key, value, source: 'ai_vision', confidence: 0.9, provider: 'gemini',
  } as FieldCandidate)

  it('valid MRZ resolves dob (math authority) — not flagged for review', () => {
    const candidates = [
      vision('dob', '02/01/1990'), // Gemini read (may differ in format)
      ...mrzCandidatesForTranslation(VALID_TD3, 'ua_international_passport'),
    ]
    const fields = arbitrateDocument(candidates)
    const dob = fields.find((f) => f.key === 'dob')!
    expect(dob).toBeDefined()
    expect(dob.reviewReasons).not.toContain('critical_no_mrz_anchor')
    expect(dob.reviewRequired).toBe(false)
  })

  it('without MRZ, the same dob DOES fall to critical_no_mrz_anchor (proves the fix matters)', () => {
    const fields = arbitrateDocument([{ key: 'dob', value: '02/01/1990', source: 'ai_vision', confidence: 0.9, provider: 'gemini' } as FieldCandidate])
    const dob = fields.find((f) => f.key === 'dob')!
    expect(dob.reviewReasons).toContain('critical_no_mrz_anchor')
  })
})
