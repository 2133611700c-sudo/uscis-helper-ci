/**
 * ocrCacheStoreEncrypted — the cache VALUE (OCR result = PII) is stored ENCRYPTED
 * at rest (AES-256-GCM, reused wizardDraftCrypto). The content-addressed KEY is a
 * deterministic hash of bytes+pipeline with NO PII.
 */
import { describe, it, expect } from 'vitest'
import { InMemoryOcrCacheStore } from '../ocrCacheStoreEncrypted'
import { buildOcrCacheKey, type OcrCacheKeyParts } from '../ocrCache'

const KEY = Buffer.from('a'.repeat(64), 'hex')
const FILE_SHA = 'b'.repeat(64)

const parts: OcrCacheKeyParts = {
  fileSha256: FILE_SHA,
  provider: 'google_vision',
  modelVersion: 'v1',
  promptVersion: 'p1',
  preprocessingVersion: 'pre1',
}

describe('content-addressed key — deterministic, no PII', () => {
  it('identical bytes+pipeline ⇒ identical key', () => {
    expect(buildOcrCacheKey(parts)).toBe(buildOcrCacheKey({ ...parts }))
  })
  it('any pipeline change ⇒ different key', () => {
    expect(buildOcrCacheKey(parts)).not.toBe(buildOcrCacheKey({ ...parts, promptVersion: 'p2' }))
    expect(buildOcrCacheKey(parts)).not.toBe(buildOcrCacheKey({ ...parts, preprocessingVersion: 'pre2' }))
  })
  it('key contains only the content+pipeline hash, no user/session id', () => {
    const k = buildOcrCacheKey(parts)
    expect(k.startsWith(FILE_SHA)).toBe(true)
    expect(k).not.toMatch(/user|session|token|email/i)
  })
})

describe('encrypted at rest — value is ciphertext, never cleartext PII', () => {
  it('persists AES-GCM ciphertext, not the plaintext result', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const key = buildOcrCacheKey(parts)
    const pii = { name: 'Ivan Petrenko', dob: '1990-01-01', doc: 'AB123456' }

    await store.putIfAbsent({ key, rawResponse: pii, createdAt: new Date().toISOString() })

    const sealed = store.__rawSealed(key)
    expect(sealed).toBeDefined()
    // iv/ciphertext/tag are hex; the cleartext PII must NOT appear anywhere.
    const blob = JSON.stringify(sealed)
    expect(blob).not.toContain('Ivan')
    expect(blob).not.toContain('Petrenko')
    expect(blob).not.toContain('AB123456')
    expect(blob).not.toContain('1990')
    expect(sealed!.iv).toMatch(/^[0-9a-f]+$/)
    expect(sealed!.ciphertext).toMatch(/^[0-9a-f]+$/)
    expect(sealed!.tag).toMatch(/^[0-9a-f]+$/)
  })

  it('get decrypts back to the original value', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const key = buildOcrCacheKey(parts)
    const value = { fields: [{ k: 'surname', v: 'Petrenko' }] }
    await store.putIfAbsent({ key, rawResponse: value, createdAt: new Date().toISOString() })
    const got = await store.get(key)
    expect(got?.rawResponse).toEqual(value)
  })

  it('a wrong key cannot decrypt (auth fails) — fail-closed', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const key = buildOcrCacheKey(parts)
    await store.putIfAbsent({ key, rawResponse: { x: 1 }, createdAt: new Date().toISOString() })
    // Re-create a store pointing at the same map is not possible (private), so
    // assert the value is opaque without the key by checking the sealed envelope.
    const sealed = store.__rawSealed(key)!
    const wrong = Buffer.from('c'.repeat(64), 'hex')
    const { openDraft } = await import('../wizardDraftCrypto')
    expect(() => openDraft(sealed, wrong)).toThrow()
  })
})

describe('immutability + TTL', () => {
  it('putIfAbsent refuses to overwrite an existing live key', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const key = buildOcrCacheKey(parts)
    const a = await store.putIfAbsent({ key, rawResponse: { v: 1 }, createdAt: new Date().toISOString() })
    const b = await store.putIfAbsent({ key, rawResponse: { v: 2 }, createdAt: new Date().toISOString() })
    expect(a.stored).toBe(true)
    expect(b.stored).toBe(false)
    expect((await store.get(key))?.rawResponse).toEqual({ v: 1 })
  })

  it('an expired entry is a miss (and overwritable)', async () => {
    let now = 1_000_000
    const store = new InMemoryOcrCacheStore(KEY, () => now)
    const key = buildOcrCacheKey(parts)
    await store.putIfAbsent({ key, rawResponse: { v: 1 }, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 1000).toISOString() })
    now += 2000 // past expiry
    expect(await store.get(key)).toBeNull()
    const re = await store.putIfAbsent({ key, rawResponse: { v: 2 }, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 1000).toISOString() })
    expect(re.stored).toBe(true)
    expect((await store.get(key))?.rawResponse).toEqual({ v: 2 })
  })
})
