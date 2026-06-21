import { describe, it, expect, afterEach } from 'vitest'
import { primaryGeminiModel } from '../providers/geminiVisionProvider'
import { resolveAuthorityFields } from '../authorityResolve'
import { resolveAuthority } from '@/lib/tps/dictionaryBridge'
import { readDocument } from '../documentFieldReader'
import type { ExtractedDocField, VisionProvider, VisionReadResult } from '../types'

// P2.3 — authority/issued_by resolved via the sourced registry, behind
// SMART_NORMALIZE_ENABLED. Civil-registry terms (РАЦС/ЗАГС/ДРАЦС) + authority
// registry (міліція). Carries the registry review flag; passthrough on no match.

describe('resolveAuthority (dictionaryBridge, pure)', () => {
  it('РАЦС → Civil Registry Office, no review', () => {
    const r = resolveAuthority('РАЦС')
    expect(r.value).toBe('Civil Registry Office')
    expect(r.source).toBe('knowledge')
    expect(r.review_required).toBe(false)
  })

  it('ДРАЦС → Civil Registry Office, no review', () => {
    const r = resolveAuthority('ДРАЦС')
    expect(r.value).toBe('Civil Registry Office')
    expect(r.review_required).toBe(false)
  })

  it('ЗАГС → ZAGS form, REVIEW required (Soviet/pre-2013)', () => {
    const r = resolveAuthority('ЗАГС')
    expect(r.value).toContain('ZAGS')
    expect(r.review_required).toBe(true)
  })

  it('Міліція → Militsiya (NEVER Police), REVIEW required', () => {
    const r = resolveAuthority('Міліція')
    expect(r.value).toBe('Militsiya')
    expect(r.review_required).toBe(true)
  })

  it('unknown authority → passthrough (value = input, no match)', () => {
    const r = resolveAuthority('Якесь невідоме відомство XYZ')
    expect(r.source).toBe('passthrough')
    expect(r.value).toBe('Якесь невідоме відомство XYZ')
  })

  it('empty → null passthrough', () => {
    const r = resolveAuthority('   ')
    expect(r.value).toBeNull()
    expect(r.source).toBe('passthrough')
  })
})

function field(partial: Partial<ExtractedDocField> & Pick<ExtractedDocField, 'field'>): ExtractedDocField {
  return {
    kind: 'agency',
    raw_cyrillic: null,
    value: null,
    confidence: 0.99,
    review_required: false,
    source: 'vision',
    provider: 'stub',
    ...partial,
  }
}

describe('resolveAuthorityFields (pure post-pass)', () => {
  it('resolves an agency field on a registry match', () => {
    const out = resolveAuthorityFields([
      field({ field: 'issuing_authority', raw_cyrillic: 'РАЦС', value: 'RATsS' }),
    ])
    expect(out[0].value).toBe('Civil Registry Office')
    expect(out[0].review_required).toBe(false)
  })

  it('carries the registry review flag (ЗАГС → review)', () => {
    const out = resolveAuthorityFields([
      field({ field: 'issuing_authority', raw_cyrillic: 'ЗАГС', value: 'ZAHS' }),
    ])
    expect(out[0].value).toContain('ZAGS')
    expect(out[0].review_required).toBe(true)
  })

  it('never lowers an existing review flag', () => {
    const out = resolveAuthorityFields([
      field({ field: 'issuing_authority', raw_cyrillic: 'РАЦС', value: 'RATsS', review_required: true }),
    ])
    expect(out[0].review_required).toBe(true)
  })

  it('leaves a non-matching agency field untouched (keeps transliteration)', () => {
    const f = field({ field: 'issuing_authority', raw_cyrillic: 'Невідоме XYZ', value: 'Nevidome XYZ' })
    const out = resolveAuthorityFields([f])
    expect(out[0]).toEqual(f)
  })

  it('leaves non-agency fields untouched', () => {
    const f = field({ field: 'family_name', kind: 'name', raw_cyrillic: 'РАЦС', value: 'RATsS' })
    const out = resolveAuthorityFields([f])
    expect(out[0]).toEqual(f)
  })
})

function stubProvider(authorityCyrillic: string): VisionProvider {
  return {
    name: 'stub',
    async readFields(): Promise<VisionReadResult> {
      return {
        ok: true,
        model: primaryGeminiModel(),
        ms: 1,
        fields: [
          { field: 'issuing_authority', cyrillic: authorityCyrillic, can_read: true, confidence: 0.99, reason: '' },
        ],
      }
    },
  }
}

describe('readDocument — SMART_NORMALIZE_ENABLED gating for authority', () => {
  afterEach(() => {
    delete process.env.SMART_NORMALIZE_ENABLED
  })

  it('flag OFF: authority is transliterated, NOT registry-resolved (unchanged)', async () => {
    delete process.env.SMART_NORMALIZE_ENABLED
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', {
      provider: stubProvider('ЗАГС'),
    })
    const a = res.fields.find((f) => f.field === 'issuing_authority')!
    expect(a.value).not.toContain('ZAGS') // not resolved
    expect(a.review_required).toBe(true) // handwritten-filled blank ⇒ always review (2026-06-11 fix)
  })

  it('flag ON: ЗАГС resolved to English + review raised', async () => {
    process.env.SMART_NORMALIZE_ENABLED = '1'
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', {
      provider: stubProvider('ЗАГС'),
    })
    const a = res.fields.find((f) => f.field === 'issuing_authority')!
    expect(a.value).toContain('ZAGS')
    expect(a.review_required).toBe(true)
  })
})
