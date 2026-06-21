/**
 * ocrSecureCacheStore — OCR cache stores that use the DEDICATED, versioned key
 * (PR A, ocrCacheCrypto) instead of the wizard-ledger key. This is the production
 * cache store for the cross-instance coordination program.
 *
 * Every value is sealed with AES-256-GCM under OCR_CACHE_ENC_KEY, with the key
 * version bound as AAD (tamper-evident). On read, ANY crypto failure (wrong key,
 * tampered payload, malformed envelope, key-version mismatch) is FAIL-CLOSED: the
 * entry is treated as a cache MISS (returns null), a PII-free `ocr_cache_security`
 * metric is emitted, and the OCR path re-reads the provider. Cleartext is never
 * logged and never persisted.
 *
 * Server-only.
 */
import {
  ocrCacheKeyFromEnv,
  sealOcrValue,
  openOcrValue,
  emitOcrCacheSecurityEvent,
  keyShaOf,
  OcrCacheCryptoError,
  type OcrCacheKeyMaterial,
  type SealedOcrValue,
} from './ocrCacheCrypto'
import type { OcrCacheStore, OcrCacheEntry } from './ocrCache'
import type { OcrCacheDbClient } from './ocrCacheStoreEncrypted'

/** Resolve the dedicated key material from env (fail-closed). Re-exported for callers. */
export function resolveOcrCacheKey(env: Record<string, string | undefined>): OcrCacheKeyMaterial {
  return ocrCacheKeyFromEnv(env)
}

function sealValue(entry: OcrCacheEntry, km: OcrCacheKeyMaterial): SealedOcrValue {
  return sealOcrValue(JSON.stringify(entry.rawResponse ?? null), km)
}

/** Open a sealed value; on ANY crypto failure → null (cache miss) + security metric. */
function openValueOrMiss(
  sealed: unknown, km: OcrCacheKeyMaterial, keyId: string,
): { value: unknown } | null {
  try {
    return { value: JSON.parse(openOcrValue(sealed, km)) }
  } catch (e) {
    if (e instanceof OcrCacheCryptoError) {
      emitOcrCacheSecurityEvent({
        event: 'ocr_cache_security', reason: e.reason, key_version: km.version, key_sha: keyShaOf(keyId),
      })
      return null // FAIL-CLOSED: corrupt/wrong-key/version-mismatch ⇒ cache MISS
    }
    throw e
  }
}

type MemRow = { key: string; sealed: SealedOcrValue; createdAt: string; expiresAt?: string }

/** Process-local secure store (separate key). Sealed even in memory (no heap PII). */
export class InMemorySecureOcrCacheStore implements OcrCacheStore {
  private readonly map = new Map<string, MemRow>()
  constructor(private readonly km: OcrCacheKeyMaterial, private readonly now: () => number = Date.now) {}

  async get(k: string): Promise<OcrCacheEntry | null> {
    const row = this.map.get(k)
    if (!row) return null
    if (row.expiresAt && this.now() > new Date(row.expiresAt).getTime()) {
      this.map.delete(k)
      return null
    }
    const opened = openValueOrMiss(row.sealed, this.km, k)
    if (!opened) return null
    return { key: row.key, rawResponse: opened.value, createdAt: row.createdAt, expiresAt: row.expiresAt }
  }

  async putIfAbsent(entry: OcrCacheEntry): Promise<{ stored: boolean }> {
    const existing = this.map.get(entry.key)
    if (existing && !(existing.expiresAt && this.now() > new Date(existing.expiresAt).getTime())) {
      return { stored: false }
    }
    this.map.set(entry.key, {
      key: entry.key, sealed: sealValue(entry, this.km), createdAt: entry.createdAt, expiresAt: entry.expiresAt,
    })
    return { stored: true }
  }

  /** TEST ONLY — inspect the raw sealed envelope (assert ciphertext, key version). */
  __rawSealed(k: string): SealedOcrValue | undefined {
    return this.map.get(k)?.sealed
  }
}

type SecureRow = {
  key_sha: string
  iv: string
  ciphertext: string
  tag: string
  key_version: string | null
  created_at: string
  expires_at: string
}

const TABLE = 'ocr_cache'

/**
 * Supabase-backed secure store (separate key + version column). Stores ciphertext
 * only; service-role + RLS-locked; immutable (insert conflict = not stored). A
 * NULL/mismatched key_version row decrypts to a cache MISS (fail-closed).
 */
export class SupabaseSecureOcrCacheStore implements OcrCacheStore {
  constructor(
    private readonly db: OcrCacheDbClient,
    private readonly km: OcrCacheKeyMaterial,
    private readonly now: () => number = Date.now,
  ) {}

  async get(k: string): Promise<OcrCacheEntry | null> {
    const { data, error } = await this.db.from(TABLE).select('*').eq('key_sha', k).single()
    if (error || !data) return null
    const row = data as SecureRow
    if (this.now() > new Date(row.expires_at).getTime()) {
      await this.db.from(TABLE).delete().eq('key_sha', k).then?.(() => {}, () => {})
      return null
    }
    const sealed: SealedOcrValue = {
      v: row.key_version ?? '', iv: row.iv, ciphertext: row.ciphertext, tag: row.tag,
    }
    const opened = openValueOrMiss(sealed, this.km, k)
    if (!opened) return null
    return { key: k, rawResponse: opened.value, createdAt: row.created_at, expiresAt: row.expires_at }
  }

  async putIfAbsent(entry: OcrCacheEntry): Promise<{ stored: boolean }> {
    const sealed = sealValue(entry, this.km)
    const row: SecureRow = {
      key_sha: entry.key, iv: sealed.iv, ciphertext: sealed.ciphertext, tag: sealed.tag,
      key_version: sealed.v, created_at: entry.createdAt,
      expires_at: entry.expiresAt ?? new Date(new Date(entry.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    }
    const { error } = await this.db.from(TABLE).insert(row)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') return { stored: false } // unique_violation = immutable
      throw new Error(`ocr_secure_cache_put_failed: ${(error as { message?: string }).message ?? 'unknown'}`)
    }
    return { stored: true }
  }
}
