/**
 * ocrResponseCodec — V1 Phase 7-B (P2 step B): deterministic encode/decode of a
 * full OCR provider result so the cache built in #143 (currently INERT — no value
 * codec was supplied at the call sites) can actually STORE and SERVE a result.
 *
 * WHAT THIS UNBLOCKS (and what it deliberately does NOT do):
 *   - It makes a provider result serializable to a versioned, binding-checked,
 *     integrity-checked record that the existing AES-256-GCM cache store seals.
 *   - It lets OCR_CACHE_MODE=shadow ENCODE the live result, compute what WOULD be
 *     cached, and (if a prior shadow entry exists) compare cached-vs-live and emit
 *     a PII-free parity event. Shadow STILL returns the LIVE result — NO substitution.
 *   - It does NOT enable any prod flag and does NOT turn on substitution. enforce
 *     mode (still OFF in prod) is the only mode that would decode+serve, and only
 *     for an isCacheable hit.
 *
 * THE OWNER'S CONTRACT (HARD RULES — violations are bugs):
 *   1. NEVER cache an EMPTY result as a success (raw_text='' / no words/lines).
 *   2. NEVER cache a provider ERROR (429 / 5xx / quota / billing / invalid) as a
 *      successful OCR. A rate-limit cached as "success" would serve a permanent
 *      empty read to every future user of that document — strictly forbidden.
 *   3. isCacheable(result) is TRUE only for a genuine successful read with usable
 *      fields. It reuses isUnusableOcr / isProviderError to reject the bad shapes.
 *      The gateway MUST call isCacheable before storing.
 *   4. FAIL-CLOSED on decode: any schema/binding mismatch, corruption, or integrity
 *      failure is treated as a CACHE MISS (CodecError), never served. We would
 *      rather re-pay the provider than serve a stale/corrupt/cross-pipeline value.
 *
 * BINDING (so a pipeline change invalidates the cache): the record binds
 *   provider · model · prompt_version · preproc_version. Decode requires the caller's
 *   expectedMeta to match exactly; a binding violation = CodecError = cache miss.
 *
 * Server-only. No PII in any thrown message or emitted detail (only technical dims).
 */
import { createHash } from 'node:crypto'
import {
  isUnusableOcr,
  isProviderError,
  type OcrResult,
  type OcrBlockedResult,
  type OcrProviderErrorResult,
} from '../ocr/types'

/** Bump when the on-disk record shape OR the canonicalization changes. A mismatch
 *  fails closed (old entries become cache misses), so a format change is safe. */
export const OCR_CODEC_SCHEMA_VERSION = 1 as const

/** Pipeline identity bound into every record. A change to ANY field invalidates a
 *  prior cache entry (decode rejects on mismatch → re-read). */
export type OcrCodecMeta = {
  provider: string
  model: string
  prompt_version: string
  preproc_version: string
}

/** The versioned, serializable record the cache stores (then seals via AES-256-GCM).
 *  `result_json` is a CANONICAL (stable-key-order) JSON string of the result — the
 *  unit of integrity. `content_sha256` is sha256(result_json) so a corrupt/tampered
 *  payload is detected on decode. `encoded_at` is metadata ONLY (never hashed, never
 *  inside result_json) so the encoding stays deterministic. */
export type OcrCodecRecord = {
  schema_version: number
  provider: string
  model: string
  prompt_version: string
  preproc_version: string
  /** Canonical JSON of the result. Deterministic: same result → byte-identical. */
  result_json: string
  /** sha256(result_json) — integrity check; recomputed and compared on decode. */
  content_sha256: string
  /** ISO timestamp, metadata only. NOT hashed, NOT part of result_json. */
  encoded_at: string
}

/** Typed, fail-closed codec failure. The gateway maps this to a CACHE MISS (it
 *  re-reads the provider) — it MUST NOT propagate into the OCR result path. */
export class CodecError extends Error {
  readonly code = 'ocr_codec_error' as const
  constructor(
    public readonly reason:
      | 'schema_version_mismatch'
      | 'binding_mismatch'
      | 'corrupt'
      | 'integrity_failure'
      | 'not_cacheable',
    message: string,
  ) {
    super(message)
    this.name = 'CodecError'
  }
}

// ── Deterministic canonical JSON ──────────────────────────────────────────────
// Stable, recursive key sorting so the SAME logical result always serializes to a
// byte-identical string (required for: deterministic encoding, integrity hashing,
// and shadow parity comparison). Arrays preserve order (semantically meaningful for
// OCR words/lines); object keys are sorted. undefined values are dropped (JSON-like).
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k]
    if (v === undefined) continue
    out[k] = canonicalize(v)
  }
  return out
}

/** Deterministic JSON of any value (stable key order). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

// ── isCacheable — the storage gate (HARD RULE) ────────────────────────────────

/** True when an OcrResult is EMPTY (no usable extraction): no text AND no tokens.
 *  An empty result is a non-answer, NOT a successful read — never cache it. */
function isEmptyOcrResult(r: OcrResult): boolean {
  const noText = !r.raw_text || r.raw_text.trim().length === 0
  const noWords = !Array.isArray(r.words) || r.words.length === 0
  const noLines = !Array.isArray(r.lines) || r.lines.length === 0
  return noText && noWords && noLines
}

/**
 * isCacheable — the SINGLE gate the gateway calls before storing. TRUE only for a
 * genuine successful read with usable fields. Rejects (returns false) for:
 *   - a provider ERROR result (429 / 5xx / quota / billing / invalid) — via isProviderError
 *   - a BLOCKED (missing-creds) result — via isUnusableOcr
 *   - any non-OcrResult / malformed shape
 *   - an EMPTY OcrResult (no raw_text AND no words AND no lines)
 *
 * Generic input on purpose: call sites store heterogeneous values, but ONLY values
 * structurally matching a successful OcrResult are cacheable. Anything else → false
 * (fail-safe: when in doubt, do not cache).
 */
export function isCacheable(result: unknown): result is OcrResult {
  if (!result || typeof result !== 'object') return false
  // Reject the typed non-success sentinels explicitly (provider error / blocked).
  const sentinel = result as OcrResult | OcrBlockedResult | OcrProviderErrorResult
  if (isProviderError(sentinel)) return false
  if (isUnusableOcr(sentinel)) return false
  // Must structurally look like a successful OcrResult.
  const r = result as Partial<OcrResult>
  if (typeof r.provider !== 'string' || r.provider.length === 0) return false
  if (typeof r.raw_text !== 'string') return false
  if (!Array.isArray(r.pages) || !Array.isArray(r.words) || !Array.isArray(r.lines)) return false
  // Reject empty (non-answer) reads.
  if (isEmptyOcrResult(result as OcrResult)) return false
  return true
}

// ── encode / decode ───────────────────────────────────────────────────────────

/**
 * Encode a SUCCESSFUL OCR result into a versioned, binding-bound, integrity-checked
 * record. Deterministic: identical (result, meta) → byte-identical `result_json` and
 * `content_sha256` (encoded_at is metadata only and never affects them).
 *
 * THROWS CodecError('not_cacheable') if the result is empty or a provider error —
 * so a caller cannot accidentally encode (and then store) a forbidden value. The
 * gateway should still gate on isCacheable first, but this is the belt-and-braces.
 */
export function encodeOcrResult(result: unknown, meta: OcrCodecMeta, nowIso?: string): OcrCodecRecord {
  if (!isCacheable(result)) {
    throw new CodecError('not_cacheable', 'ocr_codec: refusing to encode a non-cacheable (empty/error) result')
  }
  const result_json = canonicalJson(result)
  return {
    schema_version: OCR_CODEC_SCHEMA_VERSION,
    provider: meta.provider,
    model: meta.model,
    prompt_version: meta.prompt_version,
    preproc_version: meta.preproc_version,
    result_json,
    content_sha256: sha256Hex(result_json),
    encoded_at: nowIso ?? new Date().toISOString(),
  }
}

function isRecordShape(raw: unknown): raw is OcrCodecRecord {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return (
    typeof r.schema_version === 'number' &&
    typeof r.provider === 'string' &&
    typeof r.model === 'string' &&
    typeof r.prompt_version === 'string' &&
    typeof r.preproc_version === 'string' &&
    typeof r.result_json === 'string' &&
    typeof r.content_sha256 === 'string'
  )
}

/**
 * Decode a stored record back into the OCR result — FAIL-CLOSED. Throws a typed
 * CodecError (which the gateway treats as a CACHE MISS, never a served value) when:
 *   - the record shape is corrupt/unparseable                      → 'corrupt'
 *   - schema_version != OCR_CODEC_SCHEMA_VERSION                   → 'schema_version_mismatch'
 *   - any binding field (provider/model/prompt/preproc) mismatches → 'binding_mismatch'
 *   - content_sha256 != sha256(result_json) (tamper/corruption)   → 'integrity_failure'
 *   - result_json is unparseable                                   → 'corrupt'
 *   - the decoded value is somehow not cacheable (defense in depth)→ 'not_cacheable'
 */
export function decodeOcrResult(raw: unknown, expectedMeta: OcrCodecMeta): OcrResult {
  if (!isRecordShape(raw)) {
    throw new CodecError('corrupt', 'ocr_codec: record is missing required fields')
  }
  const record = raw
  if (record.schema_version !== OCR_CODEC_SCHEMA_VERSION) {
    throw new CodecError(
      'schema_version_mismatch',
      `ocr_codec: schema_version ${record.schema_version} != ${OCR_CODEC_SCHEMA_VERSION}`,
    )
  }
  if (
    record.provider !== expectedMeta.provider ||
    record.model !== expectedMeta.model ||
    record.prompt_version !== expectedMeta.prompt_version ||
    record.preproc_version !== expectedMeta.preproc_version
  ) {
    // PII-free: only the technical pipeline identity is named, never any value.
    throw new CodecError('binding_mismatch', 'ocr_codec: provider/model/prompt/preproc binding mismatch')
  }
  if (sha256Hex(record.result_json) !== record.content_sha256) {
    throw new CodecError('integrity_failure', 'ocr_codec: content hash mismatch (corrupt/tampered)')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(record.result_json)
  } catch {
    throw new CodecError('corrupt', 'ocr_codec: result_json is not valid JSON')
  }
  if (!isCacheable(parsed)) {
    // A stored value should always be cacheable; if not, refuse it (fail-closed).
    throw new CodecError('not_cacheable', 'ocr_codec: decoded value is not a cacheable OcrResult')
  }
  return parsed
}

/**
 * Compare a cached record against the live result for SHADOW parity, fail-closed:
 *   - 'match'    : the cached record decodes (binding OK, integrity OK) AND its
 *                  canonical result_json equals the live result's canonical JSON.
 *   - 'mismatch' : a prior record exists but decode fails (binding/integrity/corrupt)
 *                  OR the canonical bodies differ.
 * Returns the verdict only; NEVER returns the values themselves (PII-free).
 */
export function shadowParityVerdict(
  cachedRaw: unknown,
  liveResult: unknown,
  expectedMeta: OcrCodecMeta,
): 'match' | 'mismatch' {
  try {
    const decoded = decodeOcrResult(cachedRaw, expectedMeta)
    const liveJson = isCacheable(liveResult) ? canonicalJson(liveResult) : canonicalJson(null)
    return canonicalJson(decoded) === liveJson ? 'match' : 'mismatch'
  } catch {
    // Any decode failure (binding/integrity/corrupt/schema) → not a parity match.
    return 'mismatch'
  }
}
