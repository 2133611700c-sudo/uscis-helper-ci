/**
 * placeCountryCodeStrip.test.ts — SYNTHETIC regression (no PII).
 *
 * Phase 2A / Agent 1 (international passport validation) found, on a REAL UA
 * international passport, that the canonical `place_city` value LEAKED the
 * country code "/UKR" into the released place value. The strip in
 * transliterationPolicy.toCanonicalValue('place_city') only handled a country
 * code that was attached with a "/" or "|" separator at the END of the string.
 * Real passport place-of-birth cells (and Gemini reads of them) also use a
 * SPACE or COMMA separator, and sometimes put the country code as a PREFIX —
 * those forms slipped through and surfaced "Vinnytsia Oblast/UKR" to the user.
 *
 * Invariant (mission, GT-free): a country suffix (e.g. "/UKR") must NOT leak
 * into the place/oblast canonical value. These are SYNTHETIC place strings — no
 * real owner geography. Each must normalize to a country-code-free value.
 */
import { describe, it, expect } from 'vitest'
import { toCanonicalValue, stripCountryCode } from '../transliterationPolicy'
import { normalizeCanonicalValue } from '@/lib/canonical/core/knowledgeNormalize'

function place(cyrillic: string): string | null {
  return toCanonicalValue(
    { field: 'city_of_birth', cyrillic, can_read: true, confidence: 0.9 } as never,
    'place_city' as never,
  )
}

describe('place_city — country-code strip (synthetic, no PII)', () => {
  // The pre-fix passing forms (already handled) — kept so the fix does not regress them.
  it('strips a slash/pipe-separated trailing country code (already handled)', () => {
    for (const s of ['ВІННИЦЬКА ОБЛ./UKR', 'ВІННИЦЬКА ОБЛ. / UKR', 'ВІННИЦЬКА ОБЛАСТЬ/UKR']) {
      const v = place(s)
      expect(v, s).not.toBeNull()
      expect(/ukr/i.test(v as string), `${s} → leaked UKR`).toBe(false)
    }
  })

  // The DEFECT forms — these LEAKED "/UKR" before the fix.
  it('strips a SPACE-separated trailing country code', () => {
    const v = place('ВІННИЦЬКА ОБЛ. UKR')
    expect(v).not.toBeNull()
    expect(/ukr/i.test(v as string), 'space-sep leaked UKR').toBe(false)
  })

  it('strips a COMMA-separated trailing country code', () => {
    const v = place('ВІННИЦЬКА ОБЛ.,UKR')
    expect(v).not.toBeNull()
    expect(/ukr/i.test(v as string), 'comma-sep leaked UKR').toBe(false)
  })

  it('strips a LEADING country-code prefix', () => {
    const v = place('UKRAINE/ВІННИЦЯ')
    expect(v).not.toBeNull()
    expect(/ukr/i.test(v as string), 'prefix leaked UKR').toBe(false)
  })

  it('strips a bare-city Latin form with a comma country code', () => {
    const v = place('VINNYTSIA, UKR')
    expect(v).not.toBeNull()
    expect(/ukr/i.test(v as string), 'latin comma-sep leaked UKR').toBe(false)
  })

  // GUARD: must NOT strip a country token that is PART of a real place name.
  // (No Ukrainian settlement legitimately ends in a standalone "UKR" token, but
  // we keep the strip anchored to a separator + standalone token so an embedded
  // substring like "Ukrainka" is preserved.)
  it('does not corrupt a place whose name merely contains the letters u-k-r', () => {
    const v = place('УКРАЇНКА') // a real settlement name; must NOT be emptied
    expect(v, 'Ukrainka must survive').not.toBeNull()
    expect((v as string).length, 'must keep the city name').toBeGreaterThan(2)
  })

  it('stripCountryCode preserves an embedded country-like substring (no separator)', () => {
    // "Українка" / Latin "Ukrainka": the code letters are embedded (no separator),
    // so the whole name must survive untouched.
    expect(stripCountryCode('УКРАЇНКА')).toBe('УКРАЇНКА')
    expect(stripCountryCode('UKRAINKA')).toBe('UKRAINKA')
    // Standalone country token next to a separator IS stripped (suffix/space/prefix).
    expect(stripCountryCode('ВІННИЦЯ/UKR')).not.toMatch(/ukr/i)
    expect(stripCountryCode('ВІННИЦЯ UKR')).not.toMatch(/ukr/i)
    expect(stripCountryCode('UKR/ВІННИЦЯ')).not.toMatch(/ukr/i)
  })
})

// The DEFECT actually surfaced in the D2 knowledge layer, which gazetteers /
// normalizes the ORIGINAL raw Cyrillic (still carrying "/UKR") — neither snapCity
// nor normalizePlace strips a country token. This is the layer the live intl
// passport exercised (KNOWLEDGE_BRAIN_ENABLED default ON in prod).
describe('D2 knowledgeNormalize — place country-code strip (synthetic, no PII)', () => {
  function d2(key: string, raw: string): string | null {
    const d = normalizeCanonicalValue(key, raw, {})
    // Released value is finalValue (accept) or candidateValue (suggest) — check both.
    return d.finalValue ?? d.candidateValue
  }
  it('does not leak a country code into city_of_birth (space/comma/slash/prefix)', () => {
    for (const raw of [
      'ВІННИЦЬКА ОБЛ./UKR',
      'ВІННИЦЬКА ОБЛ. UKR',
      'ВІННИЦЬКА ОБЛ.,UKR',
      'UKRAINE/ВІННИЦЯ',
    ]) {
      const v = d2('city_of_birth', raw)
      if (v !== null) expect(/ukr/i.test(v), `D2 leaked UKR for "${raw}"`).toBe(false)
    }
  })
})
