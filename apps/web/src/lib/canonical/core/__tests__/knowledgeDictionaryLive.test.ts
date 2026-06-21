/**
 * knowledgeDictionaryLive — the D2 dictionary is now ON by default. These pin
 * the corrections from the owner's birth-certificate test so they can't regress:
 * oblast genitive→English nominative, ЗАГС→Civil Registry, Міліція→Militsiya.
 * Synthetic Ukrainian inputs only.
 */
import { describe, it, expect } from 'vitest'
import { applyKnowledgeBrainIfEnabled, buildKnowledgeContext } from '../knowledgeBrain'
import { settlementDesignatorEn, normalizeOblastToNominative, normalizePlace } from '@uscis-helper/knowledge'
import type { FieldCandidate } from '../types'

const c = (key: string, value: string): FieldCandidate =>
  ({ key, value, source: 'ai_vision', confidence: 0.9, provider: 'gemini' } as FieldCandidate)
const ctx = buildKnowledgeContext({ docTypeId: 'ua_birth_certificate', product: 'translation' })

describe('knowledge dictionary LIVE (default ON) — owner birth-cert examples', () => {
  it('oblast genitive → English nominative Oblast', () => {
    const out = applyKnowledgeBrainIfEnabled([c('oblast', 'Вінницької області')], ctx)
    const f = out.find((x) => x.key === 'oblast')!
    expect(f.normalizedValue).toContain('Vinnytsia')
    expect(f.normalizedValue).not.toMatch(/Vynnyts?kaia|Винниц/i) // not the Russified genitive
  })

  it('Kirovohrad oblast genitive → nominative', () => {
    const out = applyKnowledgeBrainIfEnabled([c('oblast', 'Кіровоградської області')], ctx)
    const f = out.find((x) => x.key === 'oblast')!
    expect(f.normalizedValue).toContain('Kirovohrad')
  })

  it('ЗАГС agency → Civil Registry (not raw transliteration)', () => {
    const out = applyKnowledgeBrainIfEnabled([c('issuing_authority', 'райвідділ ЗАГСу')], ctx)
    const f = out.find((x) => x.key === 'issuing_authority')!
    expect(f.normalizedValue).toMatch(/Civil Registry/i)
  })

  it('Міліція → Militsiya, never Police', () => {
    const out = applyKnowledgeBrainIfEnabled([c('issuing_authority', 'Міліція')], ctx)
    const f = out.find((x) => x.key === 'issuing_authority')!
    expect(f.normalizedValue).toBe('Militsiya')
    expect(f.normalizedValue).not.toMatch(/Police/i)
  })
})

describe('dictionary refinements (owner follow-ups 2026-06-12)', () => {
  it('смт with a lowercased city → urban-type settlement', () => {
    expect(settlementDesignatorEn('смт вишневе')).toBe('urban-type settlement')
  })
  it('ambiguous «с.» before lowercase stays guarded (no false village)', () => {
    expect(settlementDesignatorEn('с. петренко')).toBeNull()
  })
  it('oblast dative case → English nominative Oblast', () => {
    expect(normalizeOblastToNominative('Вінницькій області')?.transliterated).toBe('Vinnytsia Oblast')
  })
  it('renamed city → REVIEW with modern suggestion, NEVER a silent rename', () => {
    // Preserve the historical read (we cannot know the doc date); surface the
    // modern name as a review suggestion. Silent modernization could be era-wrong.
    const r = normalizePlace('Кіровоград', 'place_of_birth', 'ua_internal_passport_booklet', { is_historical_document: false } as never)
    expect(r.normalized_value).toContain('Kirovohrad')      // historical read kept
    expect(r.review_required).toBe(true)
    expect(r.review_reason).toContain('Kropyvnytskyi')      // modern name suggested
  })
  it('historical document: renamed city preserved (Кіровоград→Kirovohrad)', () => {
    const r = normalizePlace('Кіровоград', 'place_of_birth', 'ua_birth_certificate', { is_historical_document: true } as never)
    expect(r.normalized_value).toContain('Kirovohrad')
  })
})
