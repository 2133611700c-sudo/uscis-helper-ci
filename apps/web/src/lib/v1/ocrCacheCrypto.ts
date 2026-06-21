/**
 * ocrCacheCrypto — DEDICATED authenticated-encryption for the OCR result cache.
 *
 * OWASP key-separation by purpose: the OCR cache uses its OWN key
 * (`OCR_CACHE_ENC_KEY`), NOT the wizard ledger key (`WIZARD_DRAFT_ENC_KEY`), so a
 * compromise of one never exposes the other and the two rotate independently.
 *
 * The envelope binds a key VERSION (`OCR_CACHE_KEY_VERSION`) as AES-GCM Additional
 * Authenticated Data, so the version is TAMPER-EVIDENT: flipping `v` on a stored
 * row breaks the auth tag → decrypt fails closed. A value sealed under one key
 * version is never silently opened with another.
 *
 * Fail-closed policy (every failure is a CACHE MISS, never a served value, and
 * emits a PII-free security metric — decrypted bytes are NEVER logged):
 *   - missing/malformed key                → throw at resolve time (no cache at all)
 *   - key version mismatch                 → OcrCacheCryptoError('version_mismatch')
 *   - wrong key OR tampered/corrupt payload → OcrCacheCryptoError('auth_failed')
 *     (GCM cannot distinguish a wrong key from a tampered tag — both are auth_failed)
 *   - structurally malformed envelope      → OcrCacheCryptoError('malformed')
 *
 * Server-only. Pure crypto + codec (no DB, no network) so it is fully testable.
 */
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const KEY_VERSION_RE = /^[A-Za-z0-9._-]{1,32}$/

/** Resolved key material: the 32-byte key + its declared version. */
export type OcrCacheKeyMaterial = {
  key: Buffer
  version: string
}

/** A sealed (encrypted) OCR cache value. `v` = key version, bound as GCM AAD. */
export type SealedOcrValue = {
  v: string // key version (also authenticated as AAD)
  iv: string // hex
  ciphertext: string // hex
  tag: string // hex (GCM auth tag)
}

export type OcrCacheCryptoReason =
  | 'version_mismatch'
  | 'auth_failed'
  | 'malformed'

/** Fail-closed crypto error. The store maps ANY of these to a cache MISS. */
export class OcrCacheCryptoError extends Error {
  constructor(public readonly reason: OcrCacheCryptoReason, message: string) {
    super(message)
    this.name = 'OcrCacheCryptoError'
  }
}

/**
 * Resolve the dedicated OCR cache key from env. Fail-closed: a missing/invalid
 * key throws (so the cache simply does not operate — never store PII under a bad
 * key). Separate from `keyFromEnv` (wizard ledger) by design.
 *
 * `OCR_CACHE_ENC_KEY`    — 64 hex chars (32 bytes).
 * `OCR_CACHE_KEY_VERSION` — short token (default "1"); identifies the key for
 *                           rotation, bound into every envelope as AAD.
 */
export function ocrCacheKeyFromEnv(env: Record<string, string | undefined>): OcrCacheKeyMaterial {
  const hex = (env.OCR_CACHE_ENC_KEY ?? '').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ocr_cache_enc_key_missing_or_invalid: expected 64 hex chars (32 bytes)')
  }
  const version = (env.OCR_CACHE_KEY_VERSION ?? '1').trim()
  if (!KEY_VERSION_RE.test(version)) {
    throw new Error('ocr_cache_key_version_invalid: expected [A-Za-z0-9._-]{1,32}')
  }
  return { key: Buffer.from(hex, 'hex'), version }
}

/** AAD that binds the key version to the ciphertext (tamper-evident version). */
function aadFor(version: string): Buffer {
  return Buffer.from(`ocr_cache_v:${version}`, 'utf8')
}

/** Encrypt a UTF-8 plaintext OCR-value snapshot → authenticated SealedOcrValue. */
export function sealOcrValue(plaintext: string, km: OcrCacheKeyMaterial): SealedOcrValue {
  if (km.key.length !== KEY_BYTES) throw new Error('ocr_cache_key_size: key must be 32 bytes')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, km.key, iv)
  cipher.setAAD(aadFor(km.version))
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: km.version,
    iv: iv.toString('hex'),
    ciphertext: ct.toString('hex'),
    tag: tag.toString('hex'),
  }
}

/** Structural guard: is this a well-formed SealedOcrValue (hex fields present)? */
function isSealed(x: unknown): x is SealedOcrValue {
  const s = x as Partial<SealedOcrValue> | null
  return (
    !!s &&
    typeof s.v === 'string' &&
    typeof s.iv === 'string' &&
    typeof s.ciphertext === 'string' &&
    typeof s.tag === 'string' &&
    /^[0-9a-f]+$/i.test(s.iv) &&
    /^[0-9a-f]*$/i.test(s.ciphertext) &&
    /^[0-9a-f]+$/i.test(s.tag)
  )
}

/**
 * Decrypt a SealedOcrValue → plaintext. FAIL-CLOSED:
 *   - not a well-formed envelope          → OcrCacheCryptoError('malformed')
 *   - key version != envelope version     → OcrCacheCryptoError('version_mismatch')
 *   - wrong key OR tampered ciphertext/tag/AAD → OcrCacheCryptoError('auth_failed')
 * NEVER logs plaintext.
 */
export function openOcrValue(sealed: unknown, km: OcrCacheKeyMaterial): string {
  if (km.key.length !== KEY_BYTES) throw new Error('ocr_cache_key_size: key must be 32 bytes')
  if (!isSealed(sealed)) {
    throw new OcrCacheCryptoError('malformed', 'ocr_cache_crypto: malformed sealed envelope')
  }
  if (sealed.v !== km.version) {
    throw new OcrCacheCryptoError(
      'version_mismatch',
      `ocr_cache_crypto: key version mismatch (envelope v != current key version)`,
    )
  }
  try {
    const decipher = createDecipheriv(ALGO, km.key, Buffer.from(sealed.iv, 'hex'))
    decipher.setAAD(aadFor(km.version))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'hex'))
    const pt = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'hex')),
      decipher.final(),
    ])
    return pt.toString('utf8')
  } catch {
    // GCM auth failure: wrong key OR tampered ciphertext/tag/AAD — indistinguishable.
    throw new OcrCacheCryptoError('auth_failed', 'ocr_cache_crypto: authentication failed')
  }
}

// ── PII-free security metric ──────────────────────────────────────────────────
// A decrypt failure is a potential integrity/tamper signal. We surface it as a
// structured, allow-listed event (no plaintext, no ciphertext, no PII) so it can
// be alerted on. `key_sha` is a hash of the CACHE key id (never the document).

export type OcrCacheSecurityEvent = {
  event: 'ocr_cache_security'
  reason: OcrCacheCryptoReason
  key_version: string
  /** sha256 hash of the cache key id (opaque, no PII). Optional. */
  key_sha?: string
}

type SecSink = (e: OcrCacheSecurityEvent) => void
let _secSink: SecSink | null = null
/** TEST ONLY — capture security events instead of logging. Returns nothing. */
export function __setOcrCacheSecuritySink(sink: SecSink | null): void {
  _secSink = sink
}

const ALLOWED_SEC_KEYS = new Set<keyof OcrCacheSecurityEvent>([
  'event', 'reason', 'key_version', 'key_sha',
])

/** Emit a PII-free cache-security event (never throws; allow-listed keys only). */
export function emitOcrCacheSecurityEvent(e: OcrCacheSecurityEvent): void {
  const safe = {} as Record<string, unknown>
  for (const k of Object.keys(e) as (keyof OcrCacheSecurityEvent)[]) {
    if (ALLOWED_SEC_KEYS.has(k)) safe[k] = e[k]
  }
  try {
    if (_secSink) _secSink(safe as unknown as OcrCacheSecurityEvent)
    else console.warn(JSON.stringify(safe))
  } catch {
    /* observability must never throw */
  }
}

/** sha256 hex of an opaque id (e.g. the cache key) for PII-free correlation. */
export function keyShaOf(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}
