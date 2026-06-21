/**
 * Agency Glossary Tests — Phase 2 requirement
 *
 * Verifies militia/police era rules, known abbreviation resolution,
 * unknown abbreviation handling, and text scanning.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveAgencyAbbr,
  scanTextForAgencyAbbr,
  resolveIssuedBy,
} from '../glossary/agencyGlossary'

// ── 1. РВ УМВС never renders as "Police" ─────────────────────────────────────

describe('РВ УМВС — militsiya-era unit', () => {
  it('resolves to District Department (not Police) for pre-2015 doc', () => {
    const result = resolveAgencyAbbr('РВ УМВС', 2003)
    expect(result.review_required).toBe(false)
    expect(result.resolved_en).not.toMatch(/police/i)
    expect(result.resolved_en).toContain('District Department')
  })

  it('resolves to District Department (not Police) for 2014 doc', () => {
    const result = resolveAgencyAbbr('РВ УМВС', 2014)
    expect(result.review_required).toBe(false)
    expect(result.resolved_en).not.toMatch(/police/i)
  })

  it('resolves correctly even without docYear', () => {
    const result = resolveAgencyAbbr('РВ УМВС')
    expect(result.resolved_en).toContain('District Department')
    expect(result.confidence).toBe('high')
  })

  it('is case-insensitive on input', () => {
    const result = resolveAgencyAbbr('рв умвс', 2005)
    expect(result.resolved_en).toContain('District Department')
  })
})

// ── 2. ВМ renders as "Militsiya Department" before 2015 ─────────────────────────

describe('ВМ — відділення міліції', () => {
  it('renders as Militsiya Department for pre-2015 doc', () => {
    const result = resolveAgencyAbbr('ВМ', 2010)
    expect(result.resolved_en).toBe('Militsiya Department')
    expect(result.review_required).toBe(false)
    expect(result.confidence).toBe('high')
  })

  it('renders as Militsiya Department without docYear', () => {
    const result = resolveAgencyAbbr('ВМ')
    expect(result.resolved_en).toBe('Militsiya Department')
  })

  it('never returns Police for ВМ regardless of year', () => {
    for (const year of [1995, 2000, 2010, 2014, 2015, 2020]) {
      const result = resolveAgencyAbbr('ВМ', year)
      expect(result.resolved_en).not.toMatch(/police/i)
    }
  })
})

// ── 3. МРВ is recognized ──────────────────────────────────────────────────────

describe('МРВ — City and District Department', () => {
  it('resolves to City and District Department', () => {
    const result = resolveAgencyAbbr('МРВ', 2008)
    expect(result.resolved_en).toBe('City and District Department')
    expect(result.review_required).toBe(false)
    expect(result.uk_full).toContain('Міськрайонне')
  })
})

// ── 4. ВГІРФО is recognized ───────────────────────────────────────────────────

describe('ВГІРФО — citizenship/immigration dept (2003-2012)', () => {
  it('resolves with high confidence', () => {
    const result = resolveAgencyAbbr('ВГІРФО', 2007)
    expect(result.resolved_en).toContain('Citizenship, Immigration and Registration')
    expect(result.confidence).toBe('high')
    expect(result.review_required).toBe(false)
  })

  it('uk_full is present and references громадянство', () => {
    const result = resolveAgencyAbbr('ВГІРФО')
    expect(result.uk_full).toContain('громадянства')
  })
})

// ── 5. СГІРФО is recognized ───────────────────────────────────────────────────

describe('СГІРФО — Sector of Citizenship/Immigration (2003-2012)', () => {
  it('resolves to Sector (not Department)', () => {
    const result = resolveAgencyAbbr('СГІРФО', 2009)
    expect(result.resolved_en).toContain('Sector')
    expect(result.resolved_en).toContain('Citizenship, Immigration and Registration')
    expect(result.review_required).toBe(false)
  })
})

// ── 6. УДМС / ГУДМС recognized ───────────────────────────────────────────────

describe('УДМС / ГУДМС — State Migration Service', () => {
  it('УДМС resolves to Directorate of the State Migration Service', () => {
    const result = resolveAgencyAbbr('УДМС', 2016)
    expect(result.resolved_en).toContain('State Migration Service')
    expect(result.resolved_en).toContain('Directorate')
    expect(result.confidence).toBe('high')
  })

  it('ГУДМС resolves to Main Directorate of the State Migration Service', () => {
    const result = resolveAgencyAbbr('ГУДМС', 2018)
    expect(result.resolved_en).toContain('Main Directorate')
    expect(result.resolved_en).toContain('State Migration Service')
    expect(result.review_required).toBe(false)
  })
})

// ── 7. Unknown abbreviation → review_required ────────────────────────────────

describe('Unknown abbreviation handling', () => {
  it('returns review_required=true for unknown abbreviation', () => {
    const result = resolveAgencyAbbr('ХXYZ', 2010)
    expect(result.review_required).toBe(true)
    expect(result.confidence).toBe('unknown')
    expect(result.reason).toBe('abbreviation_not_verified')
    expect(result.resolved_en).toBeNull()
    expect(result.uk_full).toBeNull()
  })

  it('preserves original abbreviation in result', () => {
    const result = resolveAgencyAbbr('НЕВІДОМО', 2010)
    expect(result.abbreviation).toBe('НЕВІДОМО')
  })

  it('unknown abbr in resolveIssuedBy triggers review_required', () => {
    // УМКН is not in the glossary — pure Cyrillic uppercase sequence → should flag
    const result = resolveIssuedBy('УМКН відділення', 2010)
    expect(result.review_required).toBe(true)
  })
})

// ── 8. Historical place/agency names are NOT modernized ──────────────────────

describe('Historical name preservation', () => {
  it('МВД stays Ministry of Internal Affairs (Soviet era, not modernized)', () => {
    const result = resolveAgencyAbbr('МВД', 1990)
    // Soviet-era MIA — must not be rendered as modern Ukrainian MIA
    expect(result.resolved_en).toBe('Ministry of Internal Affairs')
    expect(result.resolved_en).not.toContain('Ukraine')
    expect(result.era).toContain('soviet')
  })

  it('УМВД stays historical, not expanded to modern УМВС', () => {
    const result = resolveAgencyAbbr('УМВД', 1989)
    expect(result.resolved_en).toContain('Directorate of the Ministry of Internal Affairs')
    expect(result.resolved_en).not.toContain('Ukraine')
  })

  it('ЗАГС stays Civil Registry Office (ZAGS), not renamed to РАЦС', () => {
    const result = resolveAgencyAbbr('ЗАГС', 1985)
    expect(result.resolved_en).toContain('ZAGS')
    expect(result.review_required).toBe(false)
  })

  it('РАЦС is separate from ЗАГС — not modernized to ДРАЦС', () => {
    const result = resolveAgencyAbbr('РАЦС', 2005)
    expect(result.resolved_en).toBe('Civil Status Registration Office')
    expect(result.resolved_en).not.toContain('ZAGS')
    expect(result.resolved_en).not.toContain('Department of State')
  })
})

// ── 9. Post-2015 National Police abbreviations ───────────────────────────────

describe('НПУ / УНП / ГУНП — post-2015 National Police', () => {
  it('НПУ resolves to National Police of Ukraine for post-2015 doc', () => {
    const result = resolveAgencyAbbr('НПУ', 2018)
    expect(result.resolved_en).toBe('National Police of Ukraine')
    expect(result.review_required).toBe(false)
    expect(result.confidence).toBe('high')
  })

  it('НПУ on pre-2015 doc → review_required (anachronistic)', () => {
    const result = resolveAgencyAbbr('НПУ', 2010)
    expect(result.review_required).toBe(true)
    expect(result.reason).toBe('police_abbr_on_pre2015_doc')
  })

  it('УНП resolves to Directorate of the National Police', () => {
    const result = resolveAgencyAbbr('УНП', 2020)
    expect(result.resolved_en).toContain('National Police')
    expect(result.review_required).toBe(false)
  })

  it('ГУНП resolves to Main Directorate of the National Police', () => {
    const result = resolveAgencyAbbr('ГУНП', 2022)
    expect(result.resolved_en).toContain('Main Directorate')
    expect(result.resolved_en).toContain('National Police')
  })
})

// ── 10. scanTextForAgencyAbbr — multi-abbreviation scanning ──────────────────

describe('scanTextForAgencyAbbr', () => {
  it('finds РВ УМВС before РВ in the same text (longest-first)', () => {
    const results = scanTextForAgencyAbbr('РВ УМВС міста Харкова', 2005)
    // Should match "РВ УМВС", not just "РВ"
    const abbrs = results.map(r => r.abbreviation)
    expect(abbrs).toContain('РВ УМВС')
    // РВ should NOT appear as a separate match since it's consumed by РВ УМВС
    const rvStandalone = results.find(r => r.abbreviation === 'РВ' && !abbrs.includes('РВ УМВС'))
    expect(rvStandalone).toBeUndefined()
  })

  it('finds no matches in plain text', () => {
    const results = scanTextForAgencyAbbr('Kyiv City Department', 2020)
    expect(results).toHaveLength(0)
  })

  it('finds ДМС in issued_by text', () => {
    const results = scanTextForAgencyAbbr('Відділ ДМС України в Одеській обл.', 2015)
    expect(results.some(r => r.abbreviation === 'ДМС')).toBe(true)
  })

  it('handles empty string', () => {
    expect(scanTextForAgencyAbbr('')).toHaveLength(0)
  })
})

// ── 11. resolveIssuedBy — full field resolution ──────────────────────────────

describe('resolveIssuedBy', () => {
  it('replaces УМВС with English in issued_by text', () => {
    const result = resolveIssuedBy('УМВС України в Харківській обл.', 2008)
    expect(result.resolved).toContain('Directorate of the Ministry of Internal Affairs')
    expect(result.review_required).toBe(false)
    expect(result.glossary_confidence).toBe('high')
  })

  it('replaces ДМС with English', () => {
    const result = resolveIssuedBy('Відділ ДМС України', 2016)
    expect(result.resolved).toContain('State Migration Service')
  })

  it('returns review_required for mixed known/unknown abbreviations', () => {
    // УДМС is known; УМКН is not — presence of unknown should still flag review
    const result = resolveIssuedBy('УДМС та УМКН', 2015)
    expect(result.review_required).toBe(true)
  })

  it('passes through plain text with no abbreviations unchanged', () => {
    const result = resolveIssuedBy('Kyiv City Police Department', 2020)
    expect(result.resolved).toBe('Kyiv City Police Department')
    expect(result.review_required).toBe(false)
    expect(result.glossary_confidence).toBe('none')
  })

  it('handles null/empty gracefully', () => {
    const result = resolveIssuedBy('', 2010)
    expect(result.resolved).toBe('')
    expect(result.review_required).toBe(false)
  })
})
