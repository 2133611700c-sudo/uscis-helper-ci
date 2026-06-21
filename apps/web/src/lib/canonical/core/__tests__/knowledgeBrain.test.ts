/**
 * knowledgeBrain — the ONE shared wiring helper (Phase 1.3).
 * Proves: flag OFF ⇒ byte-identical to bare arbitrateDocument; flag ON ⇒ D2 authority applied
 * (conflict → review + suggestedValue, never silent). Context derived centrally (no route logic).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { arbitrateDocument } from '../arbitration'
import { buildKnowledgeContext, applyKnowledgeBrainIfEnabled, isKnowledgeBrainEnabled } from '../knowledgeBrain'
import type { FieldCandidate } from '../types'

function c(p: Partial<FieldCandidate> & { key: string; value: string }): FieldCandidate {
  return { source: 'ai_vision', confidence: 0.9, provider: 'gemini', ...p }
}

afterEach(() => vi.unstubAllEnvs())

describe('knowledgeBrain.buildKnowledgeContext — central derivation, no route logic', () => {
  it('UA identity doc → ukrainianDoc true', () => {
    const ctx = buildKnowledgeContext({ docTypeId: 'ua_internal_passport_booklet', product: 'tps' })
    expect(ctx.ukrainianDoc).toBe(true)
    expect(ctx.documentClass).toBeTruthy()
  })
  it('US doc (EAD) → ukrainianDoc false', () => {
    const ctx = buildKnowledgeContext({ docTypeId: 'us_ead', product: 'ead' })
    expect(ctx.ukrainianDoc).toBe(false)
  })
  it('empty docTypeId → safe defaults', () => {
    const ctx = buildKnowledgeContext({})
    expect(ctx).toEqual({ documentClass: null, ukrainianDoc: false, isHistorical: false })
  })
})

describe('knowledgeBrain default — ON (owner-activated 2026-06-12)', () => {
  it('flag absent ⇒ enabled (the dictionary is the production default)', () => {
    expect(isKnowledgeBrainEnabled()).toBe(true)
  })
  it('KNOWLEDGE_BRAIN_ENABLED=0 ⇒ disabled, byte-identical to bare arbitration', () => {
    vi.stubEnv('KNOWLEDGE_BRAIN_ENABLED', '0')
    expect(isKnowledgeBrainEnabled()).toBe(false)
    const cands = [c({ key: 'given_name', value: 'Андрей' }), c({ key: 'place_of_birth_city', value: 'Простянець' })]
    const ctx = buildKnowledgeContext({ docTypeId: 'ua_birth_certificate', product: 'translation' })
    const viaHelper = applyKnowledgeBrainIfEnabled(cands, ctx)
    const bare = arbitrateDocument(cands)
    expect(viaHelper).toEqual(bare) // deep-equal: no D2 applied when explicitly disabled
  })
})

describe('knowledgeBrain ON — D2 authority applied, conflict never silent', () => {
  it('Russian spelling on UA doc → review + suggestedValue, read value KEPT', () => {
    vi.stubEnv('KNOWLEDGE_BRAIN_ENABLED', '1')
    expect(isKnowledgeBrainEnabled()).toBe(true)
    const out = applyKnowledgeBrainIfEnabled(
      [c({ key: 'given_name', value: 'Андрей' })],
      buildKnowledgeContext({ docTypeId: 'ua_birth_certificate', product: 'translation' }),
    )
    expect(out[0].normalizedValue).toBe('Андрей')      // NOT silently rewritten
    expect(out[0].reviewRequired).toBe(true)
    expect(out[0].suggestedValue).toBeTruthy()
    expect(out[0].knowledgeProvenance).toBeTruthy()    // provenance recorded
  })

  it('clean UA spelling → accepted transliteration as final', () => {
    vi.stubEnv('KNOWLEDGE_BRAIN_ENABLED', '1')
    const out = applyKnowledgeBrainIfEnabled(
      [c({ key: 'given_name', value: 'Іван' })],
      buildKnowledgeContext({ docTypeId: 'ua_birth_certificate', product: 'translation' }),
    )
    expect(out[0].normalizedValue).not.toMatch(/[Ѐ-ӿ]/)
  })
})
