import { describe, it, expect, afterEach } from 'vitest'
import { InMemorySecureOcrCacheStore, resolveOcrCacheKey } from '../ocrSecureCacheStore'
import { __setOcrCacheSecuritySink, type SealedOcrValue } from '../ocrCacheCrypto'

const KM = resolveOcrCacheKey({ OCR_CACHE_ENC_KEY: 'd'.repeat(64), OCR_CACHE_KEY_VERSION: '1' })
const KM_OTHER = resolveOcrCacheKey({ OCR_CACHE_ENC_KEY: 'e'.repeat(64), OCR_CACHE_KEY_VERSION: '1' })

afterEach(() => __setOcrCacheSecuritySink(null))

const entry = (key: string, value: unknown, now = 1_000) => ({
  key, rawResponse: value, createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 60_000).toISOString(),
})

describe('InMemorySecureOcrCacheStore — separate key, encrypted at rest', () => {
  it('round-trips a value (Cyrillic) through the dedicated key', async () => {
    const s = new InMemorySecureOcrCacheStore(KM, () => 1_000)
    await s.putIfAbsent(entry('k', { raw_text: 'СВІДОЦТВО', n: 3 }))
    const got = await s.get('k')
    expect(got?.rawResponse).toEqual({ raw_text: 'СВІДОЦТВО', n: 3 })
  })

  it('persists ciphertext + key version — no plaintext PII at rest', async () => {
    const s = new InMemorySecureOcrCacheStore(KM, () => 1_000)
    await s.putIfAbsent(entry('k', { name: 'Олександр' }))
    const sealed = s.__rawSealed('k') as SealedOcrValue
    expect(sealed.v).toBe('1')
    expect(JSON.stringify(sealed)).not.toContain('Олександр')
  })

  it('is immutable: putIfAbsent refuses an existing key', async () => {
    const s = new InMemorySecureOcrCacheStore(KM, () => 1_000)
    expect((await s.putIfAbsent(entry('k', { a: 1 }))).stored).toBe(true)
    expect((await s.putIfAbsent(entry('k', { a: 2 }))).stored).toBe(false)
    expect((await s.get('k'))?.rawResponse).toEqual({ a: 1 })
  })

  it('treats an expired entry as a miss', async () => {
    let t = 1_000
    const s = new InMemorySecureOcrCacheStore(KM, () => t)
    await s.putIfAbsent(entry('k', { a: 1 }, 1_000)) // expires at 61_000
    t = 70_000
    expect(await s.get('k')).toBeNull()
  })

  it('WRONG KEY → cache MISS (null) + PII-free security metric, never throws', async () => {
    const seen: unknown[] = []
    __setOcrCacheSecuritySink((e) => seen.push(e))
    // Seal under KM, then read with a store using a DIFFERENT key.
    const writer = new InMemorySecureOcrCacheStore(KM, () => 1_000)
    await writer.putIfAbsent(entry('k', { secret: 'Олександр' }))
    const sealed = writer.__rawSealed('k') as SealedOcrValue
    // Hand the sealed row to a reader with the wrong key by reconstructing state:
    const reader = new InMemorySecureOcrCacheStore(KM_OTHER, () => 1_000)
    // test seam: inject the foreign-sealed row directly into the private map
    ;(reader as unknown as { map: Map<string, unknown> }).map.set('k', {
      key: 'k', sealed, createdAt: new Date(1_000).toISOString(), expiresAt: new Date(61_000).toISOString(),
    })
    const got = await reader.get('k')
    expect(got).toBeNull() // fail-closed
    expect((seen[0] as { reason: string }).reason).toBe('auth_failed')
    expect(JSON.stringify(seen[0])).not.toContain('Олександр')
  })

  it('CORRUPT payload → cache MISS + security metric', async () => {
    const seen: unknown[] = []
    __setOcrCacheSecuritySink((e) => seen.push(e))
    const s = new InMemorySecureOcrCacheStore(KM, () => 1_000)
    await s.putIfAbsent(entry('k', { a: 1 }))
    const sealed = s.__rawSealed('k') as SealedOcrValue
    sealed.ciphertext = (sealed.ciphertext[0] === '0' ? '1' : '0') + sealed.ciphertext.slice(1)
    expect(await s.get('k')).toBeNull()
    expect((seen[0] as { reason: string }).reason).toBe('auth_failed')
  })
})
