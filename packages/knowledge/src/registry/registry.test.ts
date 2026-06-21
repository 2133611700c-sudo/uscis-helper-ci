/**
 * registry.test.ts — G1 mandatory tests for the Glossary Registry.
 * Run: npx vitest run packages/knowledge/src/registry/registry.test.ts
 */
import { describe, it, expect } from 'vitest'
import { loadRegistry, validateRegistry } from './registryLoader'
import { REGISTRY_ROWS } from './registry.generated'
import {
  lookupRegistry, lookupAuthority, lookupSettlement, normalizeSettlementType,
  resolveAbbreviation, registryCatalog,
} from './registryLookup'

describe('G1 Glossary Registry', () => {
  it('loads registry.csv into typed rows', () => {
    const rows = loadRegistry()
    expect(rows.length).toBeGreaterThan(15)
  })

  // generated runtime module must match the CSV source (run gen-registry.mjs after edits)
  it('registry.generated.ts is in sync with registry.csv', () => {
    expect(REGISTRY_ROWS).toEqual(loadRegistry())
  })

  // Test 1 — смт must stay "urban-type settlement", NEVER city
  it('"смт Вінниця" → urban-type settlement + Vinnytsia, NOT city', () => {
    const r = lookupSettlement('смт Вінниця')
    expect(r.matched).toBe(true)
    expect(r.official_en).toBe('Vinnytsia')
    expect(r.settlementType).toBe('urban-type settlement')
    expect(r.warning.toLowerCase()).toContain('never')
    expect(r.official_en.toLowerCase()).not.toContain('city')
    expect(r.settlementType?.toLowerCase()).not.toBe('city')
  })

  // Test 2 — misspelled place fuzzy-matches but is NEVER silent
  it('"Бінниця" → Vinnytsia with review_required (fuzzy, not silent)', () => {
    const r = lookupSettlement('Бінниця')
    expect(r.matched).toBe(true)
    expect(r.official_en).toBe('Vinnytsia')
    expect(r.review_required).toBe(true)
    expect(r.candidates).toContain('Vinnytsia')
  })

  // Test 3 — a 1986 document must NOT be modernised
  it('1986 document keeps historical authority (Militsiya, not National Police)', () => {
    const r = lookupAuthority('міліція', '1986')
    expect(r.official_en).toBe('Militsiya')
    expect(r.official_en).not.toMatch(/police/i)
    expect(r.source_url).toBeTruthy()
    // a 2020 doc reading "міліція" is an era mismatch → must be flagged, never silently kept
    const r2 = lookupAuthority('міліція', '2020')
    expect(r2.review_required).toBe(true)
    expect(r2.warning.toLowerCase()).toContain('era')
  })

  // Test 4 — unknown authority → review, never a silent guess
  it('unknown authority → matched=false + review_required', () => {
    const r = lookupAuthority('міністерство магії')
    expect(r.matched).toBe(false)
    expect(r.review_required).toBe(true)
    expect(r.official_en).toBe('')
  })

  // Test 5 — every row has official_en OR an explicit review_rule
  // Test 6 — every row has source_url (CI gate)
  it('integrity: every row has source_url and (official_en or explicit review_rule)', () => {
    const problems = validateRegistry(loadRegistry())
    expect(problems).toEqual([])
  })

  // Test 7 — a matched value ALWAYS carries source_url (no PDF/translation without provenance)
  it('no matched value is returned without source_url', () => {
    for (const probe of [
      lookupAuthority('національна поліція', '2020'),
      lookupSettlement('смт Вінниця'),
      lookupRegistry('oblast', 'Вінницької'),
      resolveAbbreviation('обл.'),
    ]) {
      if (probe.matched) expect(probe.source_url).toBeTruthy()
    }
  })

  // live-E2E found: recognition dumps the whole place line into one field
  it('place line with city + oblast still resolves to the city + type', () => {
    const r = lookupSettlement('смт. Вінниця Вінницької обл.')
    expect(r.official_en).toBe('Vinnytsia')
    expect(r.settlementType).toBe('urban-type settlement')
  })

  it('settlement type alone resolves with keep_type warning', () => {
    const t = normalizeSettlementType('смт')
    expect(t.matched).toBe(true)
    expect(t.official_en).toBe('urban-type settlement')
  })

  it('oblast genitive resolves to nominative English', () => {
    const r = lookupRegistry('oblast', 'Вінницької')
    expect(r.matched).toBe(true)
    expect(r.official_en).toBe('Vinnytsia Oblast')
  })

  // KOATUU/КАТОТТГ machine layer
  it('КАТОТТГ city layer: 400+ cities, every row has source_url', async () => {
    const { SETTLEMENT_ROWS } = await import('./settlements.generated')
    expect(SETTLEMENT_ROWS.length).toBeGreaterThan(400)
    expect(SETTLEMENT_ROWS.every((r) => !!r.source_url && !!r.official_en)).toBe(true)
    expect(validateRegistry(SETTLEMENT_ROWS as any)).toEqual([])
  })
  it('a КАТОТТГ city resolves through the registry (Бахчисарай → Bakhchysarai)', () => {
    expect(lookupSettlement('Бахчисарай').official_en).toBe('Bakhchysarai')
    expect(lookupSettlement('м. Біла Церква').official_en).toBe('Bila Tserkva')
  })

  it('catalog reports categories with full source coverage', () => {
    const cat = registryCatalog()
    expect(cat.length).toBeGreaterThan(5)
    for (const c of cat) expect(c.withSource).toBe(c.count) // 100% provenance
  })
})
