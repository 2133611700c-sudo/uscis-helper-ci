/**
 * ocrCache — V1_COMPLETION OCR cache contract.
 *
 * Deterministic cache key so that re-running a benchmark after a prompt/preproc
 * change does NOT silently reuse a stale response, and unchanged inputs do not
 * re-pay the provider. Contract + key only — NO storage and NO network here.
 *
 * key = file_sha256 · provider · model_version · prompt_version · preprocessing_version
 *       [ · request_sha ]
 *
 * `requestSha` (optional) binds the sha256 of the ACTUAL response-affecting
 * request the call site sends to the provider — the literal prompt text plus any
 * generation config / document-type discriminator. `promptVersion` is a coarse
 * constant per provider and does NOT track a prompt that varies by document type
 * or call site; without requestSha two CONCURRENT same-bytes calls that send
 * DIFFERENT prompts (e.g. two document-type pipelines) would collapse onto one
 * in-flight result. Binding requestSha makes "different params never collapse"
 * true by construction. Omitted by the benchmark lib (back-compat); supplied by
 * the live gateway call sites.
 */

export type OcrCacheKeyParts = {
  fileSha256: string
  provider: string
  modelVersion: string
  promptVersion: string
  preprocessingVersion: string
  /** sha256 of the actual provider request (prompt + gen-config + doc-type). */
  requestSha?: string
}

const SHA256_RE = /^[0-9a-f]{64}$/

/**
 * Build the immutable cache key. Throws if ANY part is missing/blank (a partial
 * key would collide across prompt/preproc versions) or the sha256 is malformed.
 */
export function buildOcrCacheKey(parts: OcrCacheKeyParts): string {
  const order: (keyof OcrCacheKeyParts)[] = [
    'fileSha256',
    'provider',
    'modelVersion',
    'promptVersion',
    'preprocessingVersion',
  ]
  for (const k of order) {
    if (!parts[k] || !String(parts[k]).trim()) {
      throw new Error(`ocr_cache_key_incomplete: missing ${k}`)
    }
  }
  if (!SHA256_RE.test(parts.fileSha256.toLowerCase())) {
    throw new Error('ocr_cache_key_invalid: fileSha256 must be a 64-hex sha256')
  }
  // requestSha is optional, but if present it MUST be a well-formed sha256 — a
  // blank/garbage value would silently weaken the binding it exists to provide.
  if (parts.requestSha !== undefined) {
    if (!parts.requestSha.trim()) {
      throw new Error('ocr_cache_key_incomplete: requestSha present but blank')
    }
    if (!SHA256_RE.test(parts.requestSha.toLowerCase())) {
      throw new Error('ocr_cache_key_invalid: requestSha must be a 64-hex sha256')
    }
  }
  const norm = (s: string) => s.trim().replace(/[^A-Za-z0-9._-]/g, '_')
  const base = [
    parts.fileSha256.toLowerCase(),
    norm(parts.provider),
    norm(parts.modelVersion),
    norm(parts.promptVersion),
    norm(parts.preprocessingVersion),
  ]
  if (parts.requestSha !== undefined) base.push(parts.requestSha.toLowerCase())
  return base.join(':')
}

/** A cached raw provider response. Immutable: writers must never overwrite a key.
 *  `expiresAt` (ISO) is the optional TTL boundary; a store MAY treat an entry past
 *  its expiry as a miss. `rawResponse` is the OCR/AI result and MAY contain PII —
 *  encrypted-at-rest stores wrap it in ciphertext (see EncryptedOcrCacheStore). */
export type OcrCacheEntry = {
  key: string
  rawResponse: unknown
  createdAt: string
  expiresAt?: string
}

/**
 * Storage contract. Documented invariants: immutable (put fails on existing key),
 * no PII in logs, a cache MISS is only filled after budget approval, and any store
 * that persists `rawResponse` MUST do so encrypted-at-rest (the value is PII).
 */
export interface OcrCacheStore {
  get(key: string): Promise<OcrCacheEntry | null>
  /** MUST reject if `key` already exists (immutable). */
  putIfAbsent(entry: OcrCacheEntry): Promise<{ stored: boolean }>
}
