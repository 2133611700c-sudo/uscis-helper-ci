import { describe, it, expect, afterEach } from 'vitest'
import {
  ocrCacheKeyFromEnv,
  sealOcrValue,
  openOcrValue,
  OcrCacheCryptoError,
  emitOcrCacheSecurityEvent,
  __setOcrCacheSecuritySink,
  keyShaOf,
  type OcrCacheKeyMaterial,
  type SealedOcrValue,
} from '../ocrCacheCrypto'
import { keyFromEnv } from '../wizardDraftCrypto'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

function km(hex: string, version = '1'): OcrCacheKeyMaterial {
  return ocrCacheKeyFromEnv({ OCR_CACHE_ENC_KEY: hex, OCR_CACHE_KEY_VERSION: version })
}

afterEach(() => __setOcrCacheSecuritySink(null))

describe('ocrCacheKeyFromEnv — dedicated key, fail-closed', () => {
  it('resolves a 32-byte key + default version "1"', () => {
    const m = ocrCacheKeyFromEnv({ OCR_CACHE_ENC_KEY: KEY_A })
    expect(m.key.length).toBe(32)
    expect(m.version).toBe('1')
  })
  it('honours an explicit OCR_CACHE_KEY_VERSION', () => {
    expect(km(KEY_A, '2026-06-A').version).toBe('2026-06-A')
  })
  it('throws on a missing key', () => {
    expect(() => ocrCacheKeyFromEnv({})).toThrow(/ocr_cache_enc_key_missing_or_invalid/)
  })
  it('throws on a malformed key (not 64 hex)', () => {
    expect(() => ocrCacheKeyFromEnv({ OCR_CACHE_ENC_KEY: 'deadbeef' })).toThrow(/missing_or_invalid/)
  })
  it('throws on an invalid version token', () => {
    expect(() => ocrCacheKeyFromEnv({ OCR_CACHE_ENC_KEY: KEY_A, OCR_CACHE_KEY_VERSION: 'has space' }))
      .toThrow(/ocr_cache_key_version_invalid/)
  })
  it('is SEPARATE from the wizard ledger key (different env var)', () => {
    // The OCR key must NOT come from WIZARD_DRAFT_ENC_KEY.
    expect(() => ocrCacheKeyFromEnv({ WIZARD_DRAFT_ENC_KEY: KEY_A } as Record<string, string>))
      .toThrow(/ocr_cache_enc_key_missing_or_invalid/)
    // And both resolvers produce independent 32-byte keys from their OWN vars.
    const ocr = ocrCacheKeyFromEnv({ OCR_CACHE_ENC_KEY: KEY_A })
    const ledger = keyFromEnv({ WIZARD_DRAFT_ENC_KEY: KEY_B })
    expect(ocr.key.equals(ledger)).toBe(false)
  })
})

describe('sealOcrValue / openOcrValue — authenticated round-trip', () => {
  it('round-trips ASCII', () => {
    const m = km(KEY_A)
    expect(openOcrValue(sealOcrValue('hello world', m), m)).toBe('hello world')
  })
  it('round-trips Unicode / Cyrillic JSON payloads losslessly', () => {
    const m = km(KEY_A)
    const payload = JSON.stringify({ name: 'Олександр', patronymic: 'Іванович', city: 'Вінниця', n: 3, arr: [1, null, 'смт'] })
    expect(openOcrValue(sealOcrValue(payload, m), m)).toBe(payload)
  })
  it('stores the key version in the envelope', () => {
    const sealed = sealOcrValue('x', km(KEY_A, 'kv7'))
    expect(sealed.v).toBe('kv7')
  })
  it('persisted envelope is ciphertext — no plaintext leak', () => {
    const sealed = sealOcrValue('Олександр Іванович 1990-01-02', km(KEY_A))
    const blob = JSON.stringify(sealed)
    expect(blob).not.toContain('Олександр')
    expect(blob).not.toContain('1990')
  })
})

describe('openOcrValue — FAIL CLOSED', () => {
  it('wrong key → auth_failed', () => {
    const sealed = sealOcrValue('secret', km(KEY_A))
    try {
      openOcrValue(sealed, km(KEY_B))
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(OcrCacheCryptoError)
      expect((e as OcrCacheCryptoError).reason).toBe('auth_failed')
    }
  })
  it('tampered ciphertext → auth_failed', () => {
    const m = km(KEY_A)
    const sealed = sealOcrValue('secret', m)
    const tampered: SealedOcrValue = { ...sealed, ciphertext: flipHex(sealed.ciphertext) }
    expect(() => openOcrValue(tampered, m)).toThrow(OcrCacheCryptoError)
    expect(reasonOf(() => openOcrValue(tampered, m))).toBe('auth_failed')
  })
  it('tampered auth tag → auth_failed', () => {
    const m = km(KEY_A)
    const sealed = sealOcrValue('secret', m)
    const tampered: SealedOcrValue = { ...sealed, tag: flipHex(sealed.tag) }
    expect(reasonOf(() => openOcrValue(tampered, m))).toBe('auth_failed')
  })
  it('version swapped to a NON-current value → version_mismatch', () => {
    const sealed = sealOcrValue('secret', km(KEY_A, '1'))
    const evil: SealedOcrValue = { ...sealed, v: '2' }
    expect(reasonOf(() => openOcrValue(evil, km(KEY_A, '1')))).toBe('version_mismatch')
  })
  it('version swapped to MATCH current key version but AAD differs → auth_failed (version is authenticated)', () => {
    // Sealed under version '1'. Attacker relabels v->'2' and we open with a key
    // whose version is '2': the version check passes, but the AAD bound at seal
    // time was for '1', so GCM authentication fails — version is tamper-evident.
    const sealed = sealOcrValue('secret', km(KEY_A, '1'))
    const relabelled: SealedOcrValue = { ...sealed, v: '2' }
    expect(reasonOf(() => openOcrValue(relabelled, km(KEY_A, '2')))).toBe('auth_failed')
  })
  it('key-version mismatch (seal v1, open with v2 material) → version_mismatch', () => {
    const sealed = sealOcrValue('secret', km(KEY_A, '1'))
    expect(reasonOf(() => openOcrValue(sealed, km(KEY_A, '2')))).toBe('version_mismatch')
  })
  it('malformed envelope → malformed', () => {
    const m = km(KEY_A)
    expect(reasonOf(() => openOcrValue({ nope: true }, m))).toBe('malformed')
    expect(reasonOf(() => openOcrValue(null, m))).toBe('malformed')
    expect(reasonOf(() => openOcrValue({ v: '1', iv: 'zz', ciphertext: 'qq', tag: '!!' }, m))).toBe('malformed')
  })
})

describe('emitOcrCacheSecurityEvent — PII-free, allow-listed', () => {
  it('captures only allow-listed keys (drops any smuggled field)', () => {
    const seen: unknown[] = []
    __setOcrCacheSecuritySink((e) => seen.push(e))
    emitOcrCacheSecurityEvent({
      event: 'ocr_cache_security',
      reason: 'auth_failed',
      key_version: '1',
      key_sha: keyShaOf('cachekey-abc'),
      // @ts-expect-error — a careless caller must not be able to smuggle PII
      document_name: 'Олександр.png',
      plaintext: 'secret',
    })
    const e = seen[0] as Record<string, unknown>
    expect(Object.keys(e).sort()).toEqual(['event', 'key_sha', 'key_version', 'reason'])
    expect(JSON.stringify(e)).not.toContain('Олександр')
    expect(JSON.stringify(e)).not.toContain('secret')
  })
  it('never throws', () => {
    __setOcrCacheSecuritySink(() => { throw new Error('sink boom') })
    expect(() => emitOcrCacheSecurityEvent({ event: 'ocr_cache_security', reason: 'malformed', key_version: '1' }))
      .not.toThrow()
  })
})

// ── helpers ──────────────────────────────────────────────────────────────────
function flipHex(hex: string): string {
  const c = hex[0] === '0' ? '1' : '0'
  return c + hex.slice(1)
}
function reasonOf(fn: () => unknown): string {
  try { fn() } catch (e) { return e instanceof OcrCacheCryptoError ? e.reason : `other:${(e as Error).message}` }
  return 'no_throw'
}
