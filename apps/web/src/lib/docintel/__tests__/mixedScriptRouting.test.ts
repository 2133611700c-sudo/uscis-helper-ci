/**
 * mixedScriptRouting — a name line printed in clearly-RUSSIAN script (distinctive
 * ы/э/ё/ъ, no Ukrainian і/ї/є/ґ) must transliterate with the RUSSIAN system, NOT
 * KMU-55 (which has no mapping for those letters) — always on, no flag, because
 * the routing is unambiguous. Clearly-Ukrainian names stay on KMU-55. The
 * 'unknown'-script REVIEW escalation remains flag-gated (owner decision).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { toCanonicalValue, isNameSourceScriptAmbiguous } from '../transliterationPolicy'
import { transliterateRussian, transliterateKMU55 } from '@uscis-helper/knowledge'

const nameRead = (cyrillic: string) => ({ cyrillic, can_read: true, confidence: 0.9 }) as any

describe('mixed-script name routing (flag-gated, default OFF)', () => {
  const orig = process.env.RU_TRANSLIT_ENABLED
  afterEach(() => { if (orig === undefined) delete process.env.RU_TRANSLIT_ENABLED; else process.env.RU_TRANSLIT_ENABLED = orig })

  it('default (flag OFF): even a clearly-Russian name goes through KMU-55', () => {
    delete process.env.RU_TRANSLIT_ENABLED
    const cy = 'Объёмный'
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateKMU55(cy))
  })

  it('flag ON: a clearly-Russian name (ъ/ы/э/ё) routes through the Russian table', () => {
    process.env.RU_TRANSLIT_ENABLED = '1'
    const cy = 'Объёмный'
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateRussian(cy))
  })

  it('keeps a clearly-Ukrainian name (і/ї/є/ґ) on KMU-55 even with the flag ON', () => {
    process.env.RU_TRANSLIT_ENABLED = '1'
    const cy = 'Тарас'
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateKMU55(cy))
  })
})

describe('unknown-script review escalation (DECOUPLED 2026-06-20: default ON)', () => {
  // The review gate was decoupled from RU_TRANSLIT_ENABLED (audit #195). It now
  // defaults ON via SOURCE_SCRIPT_REVIEW_ENABLED, so an ambiguous name reviews even
  // when RU routing is off — the SAFE half ships without the risky OUTPUT half.
  it('flags ambiguous by DEFAULT now (no flag set) — never silently romanized', () => {
    expect(isNameSourceScriptAmbiguous('Петренко', {})).toBe(true)
  })
  it('still flags ambiguous when RU routing is on', () => {
    expect(isNameSourceScriptAmbiguous('Петренко', { RU_TRANSLIT_ENABLED: '1' })).toBe(true)
  })
  it('can be turned off explicitly via SOURCE_SCRIPT_REVIEW_ENABLED=0 (escape hatch)', () => {
    expect(isNameSourceScriptAmbiguous('Петренко', { SOURCE_SCRIPT_REVIEW_ENABLED: '0' })).toBe(false)
  })
})
