/**
 * coordinatedDocumentRead — wiring invariants for issue #161 (cross-instance OCR
 * coordination on the live readDocument path). The lease ALGORITHM itself (winner
 * election, bounded loser wait, fail-closed) is proven in ocrRequestLease.test.ts;
 * THESE tests prove the WIRING: off-parity, shadow no-substitution, tenant
 * isolation, "never cache a failure/empty as success", and enforce → structured
 * unavailable. Mapping to the 13 mandatory proofs is noted per test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  coordinatedDocumentRead,
  deriveCoordinationCacheKey,
} from '../coordinatedDocumentRead'
import { InMemoryLeaseStore } from '@/lib/v1/ocrRequestLease'
import { OcrCoordinationUnavailable } from '@/lib/v1/ocrCoordination'
import { primaryGeminiModel } from '../providers/geminiVisionProvider'
import type { OcrCacheStore, OcrCacheEntry } from '@/lib/v1/ocrCache'
import type { DocTypeSpec, VisionProvider, VisionReadResult } from '../types'

// ── Minimal in-memory OcrCacheStore (no crypto; wrong-key fail-closed is proven
//    separately in ocrSecureCacheStore.test.ts). ──────────────────────────────
function memCache(): OcrCacheStore & { size: () => number } {
  const m = new Map<string, OcrCacheEntry>()
  return {
    async get(k) {
      return m.get(k) ?? null
    },
    async putIfAbsent(e) {
      if (m.has(e.key)) return { stored: false }
      m.set(e.key, e)
      return { stored: true }
    },
    size: () => m.size,
  }
}

const SPEC = { id: 'ua_birth_certificate', fields: [], vision_anchor: 'x' } as unknown as DocTypeSpec
const IMG = Buffer.from('image-bytes-A')
const IMG_B = Buffer.from('image-bytes-B-different')

function okRead(tag = 'A'): VisionReadResult {
  return {
    ok: true,
    fields: [{ field: 'family_name', cyrillic: tag, can_read: true, confidence: 0.9, reason: '' }],
    model: primaryGeminiModel(),
    ms: 5,
  }
}
function failRead(status: number): VisionReadResult {
  return { ok: false, fields: [], model: null, ms: 1, error: 'boom', errorStatus: status }
}
function emptyRead(): VisionReadResult {
  return { ok: true, fields: [], model: primaryGeminiModel(), ms: 2 }
}

/** A provider whose readFields returns queued results and counts calls. */
function provider(results: VisionReadResult[] | (() => Promise<VisionReadResult>)): VisionProvider & { calls: () => number } {
  let n = 0
  const impl = Array.isArray(results)
    ? async () => results[Math.min(n, results.length - 1)]
    : results
  return {
    name: 'gemini',
    async readFields() {
      n++
      return impl()
    },
    calls: () => n,
  }
}

const ENFORCE = { OCR_DISTRIBUTED_DEDUP_MODE: 'enforce' }
const SHADOW = { OCR_DISTRIBUTED_DEDUP_MODE: 'shadow' }
const OFF = {} as Record<string, string | undefined>

describe('coordinatedDocumentRead — off-parity (proof 11)', () => {
  it('off mode is a byte-identical pass-through; stores never touched', async () => {
    const p = provider([okRead('LIVE')])
    const lease = new InMemoryLeaseStore()
    const cache = memCache()
    const out = await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'ua_birth_certificate', p, {
      env: OFF,
      leaseStore: lease,
      cacheStore: cache,
      owner: 'o',
    })
    expect(out).toEqual(okRead('LIVE'))
    expect(p.calls()).toBe(1)
    expect(lease.__size()).toBe(0) // no lease acquired
    expect(cache.size()).toBe(0) // no cache write
  })

  it('absent OCR_DISTRIBUTED_DEDUP_MODE resolves to off', async () => {
    const p = provider([okRead()])
    await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { env: { FOO: '1' } })
    expect(p.calls()).toBe(1)
  })
})

describe('coordinatedDocumentRead — shadow never substitutes (proof 12)', () => {
  it('shadow returns the LIVE result even when a different value is cached', async () => {
    const lease = new InMemoryLeaseStore()
    const cache = memCache()
    // Pre-seed the cache with a DIFFERENT value at the would-be key.
    const key = deriveCoordinationCacheKey({ imageBuffer: IMG, providerName: 'gemini', docTypeId: 'd' })
    await cache.putIfAbsent({ key, rawResponse: okRead('STALE'), createdAt: new Date(0).toISOString() })

    const p = provider([okRead('LIVE')])
    const out = await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, {
      env: SHADOW,
      leaseStore: lease,
      cacheStore: cache,
      owner: 'o',
    })
    expect(out).toEqual(okRead('LIVE')) // live, NOT the stale cached value
    expect(p.calls()).toBe(1) // shadow ALWAYS calls the provider
  })
})

describe('coordinatedDocumentRead — enforce single-flight + reuse (proofs 1,2)', () => {
  it('a second caller with the same key reuses the cached winner result (1 provider call)', async () => {
    const lease = new InMemoryLeaseStore()
    const cache = memCache()
    const p = provider([okRead('WINNER')])
    const common = { env: ENFORCE, leaseStore: lease, cacheStore: cache }

    const a = await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { ...common, owner: 'a' })
    const b = await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { ...common, owner: 'b' })

    expect(a).toEqual(okRead('WINNER'))
    expect(b).toEqual(okRead('WINNER')) // waiter receives identical winner result
    expect(p.calls()).toBe(1) // exactly ONE provider call
    expect(cache.size()).toBe(1)
  })
})

describe('coordinatedDocumentRead — key isolation (proofs 3,4)', () => {
  it('different tenant scope ⇒ different key ⇒ independent provider call', async () => {
    const ka = deriveCoordinationCacheKey({ imageBuffer: IMG, providerName: 'gemini', tenantScope: 't1', docTypeId: 'd' })
    const kb = deriveCoordinationCacheKey({ imageBuffer: IMG, providerName: 'gemini', tenantScope: 't2', docTypeId: 'd' })
    expect(ka).not.toBe(kb)

    const lease = new InMemoryLeaseStore()
    const cache = memCache()
    const p = provider([okRead()])
    await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { env: ENFORCE, leaseStore: lease, cacheStore: cache, tenantScope: 't1', owner: 'a' })
    await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { env: ENFORCE, leaseStore: lease, cacheStore: cache, tenantScope: 't2', owner: 'b' })
    expect(p.calls()).toBe(2) // no cross-tenant sharing
  })

  it('different image bytes ⇒ different key', () => {
    const ka = deriveCoordinationCacheKey({ imageBuffer: IMG, providerName: 'gemini', docTypeId: 'd' })
    const kb = deriveCoordinationCacheKey({ imageBuffer: IMG_B, providerName: 'gemini', docTypeId: 'd' })
    expect(ka).not.toBe(kb)
  })
})

describe('coordinatedDocumentRead — never cache a failure/empty as success (proofs 5,6,7,8)', () => {
  it('a 429 winner read is returned live but NOT cached; the cooldown then shields followers', async () => {
    const lease = new InMemoryLeaseStore()
    const cache = memCache()
    const p = provider([failRead(429)])
    const common = { env: ENFORCE, leaseStore: lease, cacheStore: cache }

    // Winner: gets its own live 429 result; nothing is cached as success.
    const first = await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { ...common, owner: 'a' })
    expect(first.ok).toBe(false)
    expect(cache.size()).toBe(0) // 429 NOT cached as success

    // A follower within the cooldown gets a structured unavailable (no retry storm,
    // and crucially never a cached "success") — NOT another provider call.
    await expect(
      coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { ...common, owner: 'b' }),
    ).rejects.toBeInstanceOf(OcrCoordinationUnavailable)
    expect(p.calls()).toBe(1)
  })

  it('an empty (0-field) read is NOT cached', async () => {
    const lease = new InMemoryLeaseStore()
    const cache = memCache()
    const p = provider([emptyRead()])
    await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { env: ENFORCE, leaseStore: lease, cacheStore: cache, owner: 'a' })
    expect(cache.size()).toBe(0)
  })
})

describe('coordinatedDocumentRead — enforce unavailable is structured (proof 13)', () => {
  it('a loser facing a cooling-down lease throws OcrCoordinationUnavailable (never a crash)', async () => {
    const lease = new InMemoryLeaseStore()
    const cache = memCache()
    const key = deriveCoordinationCacheKey({ imageBuffer: IMG, providerName: 'gemini', docTypeId: 'd' })
    // Another owner already failed this key → cooldown active.
    await lease.acquire({ cacheKeyHash: key, owner: 'other', ttlMs: 30_000, provider: 'gemini', modelVersion: primaryGeminiModel(), pipelineVersion: 'v1' })
    await lease.fail(key, 'other', 'rate_limited', 30, 60_000)

    const p = provider([okRead()])
    await expect(
      coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, { env: ENFORCE, leaseStore: lease, cacheStore: cache, owner: 'me' }),
    ).rejects.toBeInstanceOf(OcrCoordinationUnavailable)
    expect(p.calls()).toBe(0) // loser NEVER calls the provider
  })
})

describe('coordinatedDocumentRead — fail-safe when coordination cannot be built', () => {
  it('shadow/enforce with no enc key and no injected stores degrades to a direct call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = provider([okRead('DIRECT')])
    // No leaseStore/cacheStore injected and no OCR_CACHE_ENC_KEY ⇒ fail-safe direct call.
    const out = await coordinatedDocumentRead(IMG, 'image/jpeg', SPEC, 'd', p, {
      env: { OCR_DISTRIBUTED_DEDUP_MODE: 'enforce' },
    })
    expect(out).toEqual(okRead('DIRECT'))
    expect(p.calls()).toBe(1)
    warn.mockRestore()
  })
})
