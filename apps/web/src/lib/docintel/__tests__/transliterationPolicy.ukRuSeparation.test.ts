/**
 * transliterationPolicy.ukRuSeparation.test.ts — C3, audit #195 / Agent B finding.
 *
 * Hard rule under test: Ukrainian and Russian are SEPARATE scripts.
 *   - clearly UA (distinctive і/ї/є/ґ) → KMU-55, ALWAYS.
 *   - clearly RU (distinctive ы/э/ё/ъ) → Russian (BGN/PCGN) table — ONLY behind
 *     RU_TRANSLIT_ENABLED (output change is deferred / risk-gated). Default OFF ⇒
 *     KMU-55 candidate (safe baseline) but the read is not a UA/RU mix.
 *   - AMBIGUOUS (no distinctive letter, OR both present) → REVIEW, never a silent
 *     guessed romanization. The review gate is now ON by default (decoupled).
 *   - NEVER mixed transliteration (one name line uses exactly one system).
 *
 * Includes the explicit REGRESSION GUARD for the documented "Russification
 * amplification" case (transliterationPolicy.ts ~line 97-110): turning the review
 * gate ON must NOT change the romanization OUTPUT of a name, and a clearly-UA read
 * must STAY Ukrainian (KMU-55) regardless of any RU flag. Synthetic names only.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { toCanonicalValue, isNameSourceScriptAmbiguous } from '../transliterationPolicy'
import { transliterateKMU55, transliterateRussian, detectNameScript } from '@uscis-helper/knowledge'

const nameRead = (cyrillic: string) => ({ cyrillic, can_read: true, confidence: 0.9 }) as any

// only Latin letters → no Cyrillic remains → exactly one alphabet (no mixed translit)
const isPureLatin = (s: string | null) => !!s && /[A-Za-z]/.test(s) && !/[Ѐ-ӿ]/.test(s)

describe('UK/RU separation — clearly-Ukrainian → KMU-55', () => {
  const orig = process.env.RU_TRANSLIT_ENABLED
  afterEach(() => { if (orig === undefined) delete process.env.RU_TRANSLIT_ENABLED; else process.env.RU_TRANSLIT_ENABLED = orig })

  it('Тарас (no distinctive letter? has а/р/с — actually ambiguous) — use a UA-distinctive name', () => {
    // Іларіон has і (distinctive UA) → clearly UA.
    const cy = 'Іларіон'
    expect(detectNameScript(cy)).toBe('ua')
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateKMU55(cy))
    expect(isPureLatin(toCanonicalValue(nameRead(cy), 'name'))).toBe(true)
  })

  it('clearly-UA stays KMU-55 even with RU_TRANSLIT_ENABLED=1 (no cross-contamination)', () => {
    process.env.RU_TRANSLIT_ENABLED = '1'
    const cy = 'Євген' // Є distinctive UA
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateKMU55(cy))
  })
})

describe('UK/RU separation — clearly-Russian routes to the Russian system (flag-gated)', () => {
  const orig = process.env.RU_TRANSLIT_ENABLED
  afterEach(() => { if (orig === undefined) delete process.env.RU_TRANSLIT_ENABLED; else process.env.RU_TRANSLIT_ENABLED = orig })

  it('flag ON: clearly-RU (ы/э/ё/ъ) → Russian table, NOT KMU-55', () => {
    process.env.RU_TRANSLIT_ENABLED = '1'
    const cy = 'Эдуард' // э distinctive RU
    expect(detectNameScript(cy)).toBe('ru')
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateRussian(cy))
    expect(isPureLatin(toCanonicalValue(nameRead(cy), 'name'))).toBe(true)
  })

  it('flag OFF (default): RU OUTPUT routing deferred → KMU-55 baseline (safe, single system)', () => {
    delete process.env.RU_TRANSLIT_ENABLED
    const cy = 'Эдуард'
    // Deferred: we do NOT silently emit a Russian romanization with the flag off.
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateKMU55(cy))
  })
})

describe('UK/RU separation — AMBIGUOUS bilingual name → REVIEW, never silently romanized', () => {
  it('shared-letters-only name → ambiguous by default (gate decoupled, ON)', () => {
    // Петро/Петренко use only letters shared by UA+RU → cannot tell the source.
    expect(detectNameScript('Петренко')).toBe('unknown')
    expect(isNameSourceScriptAmbiguous('Петренко', {})).toBe(true)
  })

  it('a line carrying BOTH a UA-only and an RU-only letter → ambiguous (do not guess)', () => {
    // e.g. a bilingual mix "Їжак-эхо": ї is UA-only, э is RU-only → unknown → review.
    const cy = 'Їжакэ'
    expect(detectNameScript(cy)).toBe('unknown')
    expect(isNameSourceScriptAmbiguous(cy, {})).toBe(true)
  })
})

describe('REGRESSION GUARD — no Russification amplification (transliterationPolicy.ts ~L97-110)', () => {
  const orig = process.env.RU_TRANSLIT_ENABLED
  const origReview = process.env.SOURCE_SCRIPT_REVIEW_ENABLED
  afterEach(() => {
    if (orig === undefined) delete process.env.RU_TRANSLIT_ENABLED; else process.env.RU_TRANSLIT_ENABLED = orig
    if (origReview === undefined) delete process.env.SOURCE_SCRIPT_REVIEW_ENABLED; else process.env.SOURCE_SCRIPT_REVIEW_ENABLED = origReview
  })

  it('arming the REVIEW gate must NOT change a name romanization OUTPUT (gate is review-only)', () => {
    // The prior regression came from CHANGING output (forcing the RU table on reads
    // that were actually Ukrainian). The decoupled review gate changes NO output.
    const cy = 'Петренко' // ambiguous → will be flagged for review
    delete process.env.RU_TRANSLIT_ENABLED // RU output routing OFF
    delete process.env.SOURCE_SCRIPT_REVIEW_ENABLED // review default ON
    const withGate = toCanonicalValue(nameRead(cy), 'name')
    process.env.SOURCE_SCRIPT_REVIEW_ENABLED = '0' // gate OFF
    const withoutGate = toCanonicalValue(nameRead(cy), 'name')
    expect(withGate).toBe(withoutGate) // identical KMU-55 string; review is orthogonal
    expect(withGate).toBe(transliterateKMU55(cy))
  })

  it('a clearly-Ukrainian read is NEVER Russified, with the review gate on AND RU off', () => {
    delete process.env.RU_TRANSLIT_ENABLED
    delete process.env.SOURCE_SCRIPT_REVIEW_ENABLED
    const cy = 'Ґанджа' // Ґ distinctive UA
    const out = toCanonicalValue(nameRead(cy), 'name')
    expect(out).toBe(transliterateKMU55(cy))
    expect(out).not.toBe(transliterateRussian(cy))
    expect(isNameSourceScriptAmbiguous(cy)).toBe(false) // clearly UA → no review noise
  })

  it('a clearly-Ukrainian read stays KMU-55 even when RU routing is ON (no amplification)', () => {
    process.env.RU_TRANSLIT_ENABLED = '1'
    const cy = 'Соломія' // і distinctive UA
    expect(toCanonicalValue(nameRead(cy), 'name')).toBe(transliterateKMU55(cy))
  })
})
