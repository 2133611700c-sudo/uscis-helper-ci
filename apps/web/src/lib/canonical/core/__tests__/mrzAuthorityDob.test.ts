/**
 * mrzAuthorityDob.test.ts — KIT 2 proof: the passport MRZ is the authority that
 * resolves a date no handwritten read can.
 *
 * Scenario (synthetic Ivanenko fixture): a handwritten birth certificate's date of
 * birth is illegibly read by every engine (and by a human reading the cursive).
 * The international passport's MRZ encodes it with a CHECK DIGIT, so it decodes to
 * 1990-01-01 (January) with certainty. The cross-document field arbiter already
 * ranks `passport_ocr_mrz` #1 (gold standard) — this pins that the MRZ DOB is
 * decoded correctly and validates its own check digit. All values are synthetic.
 */
import { describe, it, expect } from 'vitest'
import { parseMrzFromText, mrzCandidatesFromText } from '../mrzAuthority'

// TD3 (passport) MRZ — line 2 layout: passport(9)+chk + nat(3) + dob(6=YYMMDD)+chk + sex + expiry(6)+chk + …
// TD3 line 2 = exactly 44 chars. Check digits validated: passport(5), dob(1), expiry(9).
const PASSPORT_MRZ =
  'P<UKRIVANENKO<<IVAN<<<<<<<<<<<<<<<<<<<<<<<<<\n' +
  'FA000000<5UKR9001011M30010190000000000000000'

describe('KIT 2 — passport MRZ is the DOB authority', () => {
  it('decodes the date of birth as 1990-01-01 (JANUARY) with a valid check digit', () => {
    const r = parseMrzFromText(PASSPORT_MRZ)
    expect(r.valid).toBe(true)
    const dob = r.candidates.find((c) => c.key === 'date_of_birth')
    expect(dob?.value).toBe('1990-01-01')
    expect(dob?.value?.slice(5, 7)).toBe('01')      // January — what the handwriting can't give
    expect(r.check_digits_pass.dob).toBe(true)       // the check digit validates the date
  })

  it('emits a high-confidence dob candidate the arbiter can rank above handwriting', () => {
    const cands = mrzCandidatesFromText(PASSPORT_MRZ)
    const dob = cands.find((c) => c.key === 'date_of_birth')
    expect(dob).toBeDefined()
    expect(dob?.value).toBe('1990-01-01')
    expect((dob?.confidence ?? 0)).toBeGreaterThan(0.9)  // controlling source — top confidence
    expect(dob?.mrzCheckValid).toBe(true)
  })
})
