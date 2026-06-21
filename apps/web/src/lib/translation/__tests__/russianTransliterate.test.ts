/**
 * russianTransliterate.test.ts — source-script controls transliteration.
 *
 * A Soviet/bilingual document line in RUSSIAN must use a Russian system, NOT
 * KMU-55 (Ukrainian), and the same name in different source scripts must NOT be
 * harmonized. Synthetic example surnames only (privacy rule); Алексей/Олексій are
 * standalone words pinning the linguistic rule, not tied to any person.
 */
import { describe, it, expect } from 'vitest'
import { transliterateKMU55, transliterateRussian, detectNameScript } from '@uscis-helper/knowledge'

describe('transliterateRussian — BGN/PCGN simplified (owner-approved 2026-06-10)', () => {
  it('Алексей → Aleksey (not Oleksii)', () => {
    expect(transliterateRussian('Алексей')).toBe('Aleksey')
  })
  it('Алексеевич → Alekseyevich (BGN/PCGN: е after a vowel → ye)', () => {
    expect(transliterateRussian('Алексеевич')).toBe('Alekseyevich')
  })
  it('Леонидович → Leonidovich (not Leonidovych)', () => {
    expect(transliterateRussian('Леонидович')).toBe('Leonidovich')
  })
  it('Наталья → Natalya (BGN/PCGN: я → ya, ь omitted)', () => {
    expect(transliterateRussian('Наталья')).toBe('Natalya')
  })
  it('Степановна → Stepanovna', () => {
    expect(transliterateRussian('Степановна')).toBe('Stepanovna')
  })
  it('Иваненко → Ivanenko (synthetic surname)', () => {
    expect(transliterateRussian('Иваненко')).toBe('Ivanenko')
  })
})

describe('Ukrainian source still uses KMU-55 (no harmonization)', () => {
  it('Іван → Ivan', () => {
    expect(transliterateKMU55('Іван')).toBe('Ivan')
  })
  it('Петрович → Petrovych', () => {
    expect(transliterateKMU55('Петрович')).toBe('Petrovych')
  })
  it('Леонідович → Leonidovych (not Leonidovich)', () => {
    expect(transliterateKMU55('Леонідович')).toBe('Leonidovych')
  })
})

describe('mixed child/father lines — transliterate each as written, NEVER harmonize', () => {
  it('Ukrainian child + Russian father → two systems, no unification (synthetic)', () => {
    // Child line is Ukrainian, father line is Russian — a real Soviet-doc pattern.
    const childGiven = transliterateKMU55('Олексій')     // applicant per UA doc
    const childPatr = transliterateKMU55('Петрович')
    const fatherGiven = transliterateRussian('Алексей')   // parent line, as written (RU)
    const fatherPatr = transliterateRussian('Леонидович')
    expect(childGiven).toBe('Oleksii')
    expect(childPatr).toBe('Petrovych')
    expect(fatherGiven).toBe('Aleksey')
    expect(fatherPatr).toBe('Leonidovich')
    // the same given-name root must NOT be harmonized across the two lines
    expect(fatherGiven).not.toBe(childGiven)
  })
})

describe('the two systems must NOT cross (no silent normalization)', () => {
  it('Russian Алексей does not become the Ukrainian Oleksii', () => {
    expect(transliterateRussian('Алексей')).not.toBe('Oleksii')
  })
  it('Ukrainian Олексій does not become the Russian Aleksey', () => {
    expect(transliterateKMU55('Олексій')).not.toBe('Aleksey')
  })
})

describe('detectNameScript — by distinctive letters; ambiguous → review, not guess', () => {
  it('Ukrainian-only letters (і/ї/є/ґ) → ua', () => {
    expect(detectNameScript('Іван')).toBe('ua')
    expect(detectNameScript('Наталія')).toBe('ua')
  })
  it('Russian-only letters (ы/э/ё/ъ) → ru', () => {
    expect(detectNameScript('Эдуард')).toBe('ru')
  })
  it('no distinctive letter → unknown (caller reviews, never guesses)', () => {
    expect(detectNameScript('Наталья')).toBe('unknown')   // ь/я are shared
    expect(detectNameScript('Алексеевна')).toBe('unknown')
  })
})
