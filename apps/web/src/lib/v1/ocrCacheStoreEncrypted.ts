/**
 * ocrCacheStoreEncrypted — encrypted-at-rest OCR cache stores (V1 Phase 7-B, P2).
 *
 * The OCR cache VALUE is the provider result, which contains applicant PII
 * (names/DOB/document numbers). It therefore MUST be stored as ciphertext. These
 * stores reuse the EXACT AES-256-GCM crypto already shipped for the wizard ledger
 * (wizardDraftCrypto.ts) so a cached value is never persisted or logged in clear.
 *
 * The KEY (sha256 of file_sha256·provider·model·prompt_version·preproc_version) is
 * content-addressed and PII-free — see ocrCache.ts / the ocr_cache migration.
 *
 * Two stores:
 *   - InMemoryOcrCacheStore: process-local, TTL-aware, immutable. Used in tests and
 *     as a cheap single-instance dedup/cache; values are sealed too (PII-safe).
 *   - SupabaseOcrCacheStore: persists ciphertext to the RLS-locked `ocr_cache`
 *     table (service-role only). Multi-instance shared cache.
 *
 * Both wrap the value in a SealedDraft via sealDraft/openDraft. A test asserts the
 * persisted bytes are ciphertext (no cleartext PII).
 *
 * Server-only.
 */
import { sealDraft, openDraft, type SealedDraft } from './wizardDraftCrypto'
import type { OcrCacheStore, OcrCacheEntry } from './ocrCache'

/** Serialize an entry's value to a sealed (encrypted) envelope. */
function sealEntryValue(entry: OcrCacheEntry, key: Buffer): SealedDraft {
  // JSON is a deterministic, lossless container for the provider result snapshot.
  return sealDraft(JSON.stringify(entry.rawResponse ?? null), key)
}

/** Open a sealed envelope back into the original value. */
function openEntryValue(sealed: SealedDraft, key: Buffer): unknown {
  return JSON.parse(openDraft(sealed, key))
}

type MemRow = { key: string; sealed: SealedDraft; createdAt: string; expiresAt?: string }

/**
 * Process-local, TTL-aware, immutable, ENCRYPTED OCR cache store. The value is
 * sealed (AES-256-GCM) even in memory so a heap dump never reveals cleartext PII.
 * Expired entries are treated as a miss (and lazily evicted on read).
 */
export class InMemoryOcrCacheStore implements OcrCacheStore {
  private readonly map = new Map<string, MemRow>()

  /** @param key 32-byte AES key (from keyFromEnv). @param now clock (testable). */
  constructor(private readonly key: Buffer, private readonly now: () => number = Date.now) {}

  async get(k: string): Promise<OcrCacheEntry | null> {
    const row = this.map.get(k)
    if (!row) return null
    if (row.expiresAt && this.now() > new Date(row.expiresAt).getTime()) {
      this.map.delete(k)
      return null
    }
    return {
      key: row.key,
      rawResponse: openEntryValue(row.sealed, this.key),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }
  }

  async putIfAbsent(entry: OcrCacheEntry): Promise<{ stored: boolean }> {
    const existing = this.map.get(entry.key)
    // Immutable, but an EXPIRED existing entry is overwritable (logically a miss).
    if (existing && !(existing.expiresAt && this.now() > new Date(existing.expiresAt).getTime())) {
      return { stored: false }
    }
    this.map.set(entry.key, {
      key: entry.key,
      sealed: sealEntryValue(entry, this.key),
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    })
    return { stored: true }
  }

  /** TEST ONLY — inspect the raw persisted envelope to assert it is ciphertext. */
  __rawSealed(k: string): SealedDraft | undefined {
    return this.map.get(k)?.sealed
  }
}

/** Minimal structural Supabase client (loose on purpose — mirrors wizardDraftStore). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OcrCacheDbClient = { from: (table: string) => any }

type OcrCacheRow = {
  key_sha: string
  iv: string
  ciphertext: string
  tag: string
  created_at: string
  expires_at: string
}

const TABLE = 'ocr_cache'

/**
 * Supabase-backed, RLS-locked, ENCRYPTED OCR cache store. The value is sealed
 * (AES-256-GCM) before it ever leaves the process; the `ocr_cache` table holds
 * ciphertext columns only (iv/ciphertext/tag). Service-role only. Immutable:
 * putIfAbsent relies on the primary-key conflict to refuse overwrites.
 */
export class SupabaseOcrCacheStore implements OcrCacheStore {
  constructor(
    private readonly db: OcrCacheDbClient,
    private readonly key: Buffer,
    private readonly now: () => number = Date.now,
  ) {}

  async get(k: string): Promise<OcrCacheEntry | null> {
    const { data, error } = await this.db.from(TABLE).select('*').eq('key_sha', k).single()
    if (error || !data) return null
    const row = data as OcrCacheRow
    if (this.now() > new Date(row.expires_at).getTime()) {
      // Expired → best-effort delete, treat as miss.
      await this.db.from(TABLE).delete().eq('key_sha', k).then?.(() => {}, () => {})
      return null
    }
    const sealed: SealedDraft = { iv: row.iv, ciphertext: row.ciphertext, tag: row.tag }
    return {
      key: k,
      rawResponse: openEntryValue(sealed, this.key),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }
  }

  async putIfAbsent(entry: OcrCacheEntry): Promise<{ stored: boolean }> {
    const sealed = sealEntryValue(entry, this.key)
    const row: OcrCacheRow = {
      key_sha: entry.key,
      iv: sealed.iv,
      ciphertext: sealed.ciphertext,
      tag: sealed.tag,
      created_at: entry.createdAt,
      expires_at:
        entry.expiresAt ?? new Date(new Date(entry.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
    }
    // insert (NOT upsert) → a duplicate key_sha conflicts and is refused (immutable).
    const { error } = await this.db.from(TABLE).insert(row)
    if (error) {
      const code = (error as { code?: string }).code
      // 23505 = unique_violation (key already present) → not stored, not an error.
      if (code === '23505') return { stored: false }
      throw new Error(`ocr_cache_put_failed: ${(error as { message?: string }).message ?? 'unknown'}`)
    }
    return { stored: true }
  }
}
