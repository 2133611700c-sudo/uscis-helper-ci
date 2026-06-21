/**
 * ocrGateway — V1 Phase 7-B/C (P2): the single chokepoint that adds CACHE
 * substitution, in-flight DEDUP (single-flight), and a BUDGET kill-switch around
 * every paid OCR/AI provider call. Directly mitigates Google Vision HTTP 429.
 *
 * SAFETY / OFF-PARITY (the load-bearing invariant):
 *   With ALL flags OFF (the production default), `runOcrGateway(opts, call)` is
 *   BYTE-IDENTICAL to calling `call()` directly: no cache lookup, no dedup, no
 *   budget check — the provider runs exactly as today and its result is returned
 *   verbatim. Tests assert wrapped===unwrapped under all-off. This is why the
 *   gateway is safe to wire at the live call sites before any flag is enabled.
 *
 * FLAGS (all read from the process env, all DEFAULT OFF):
 *   OCR_CACHE_MODE   = off (default) | shadow | enforce
 *     - shadow : compute key, LOOK UP the cache, record hit/miss (would-be-hit
 *                rate), but STILL call the provider and DO NOT substitute. Safe
 *                correctness measurement.
 *     - enforce: on a cache HIT serve the stored (decrypted) value with NO
 *                provider call; on a MISS call the provider and STORE the result.
 *   OCR_DEDUP_ENABLED = 0 (default) | 1
 *     - collapse concurrent identical-key provider calls into ONE shared promise
 *       (single-flight). Directly cuts 429 burst pressure. Safe in isolation but
 *       gated for strict OFF-parity.
 *   OCR_BUDGET_MODE  = off (default) | shadow | enforce
 *     - shadow : count projected spend, log a projected cap breach, NEVER block.
 *     - enforce: block new paid calls once the per-window cap is hit; return a
 *                typed budget_exceeded result (fail-closed — the caller surfaces a
 *                clean "temporarily unavailable / review" state, not a crash).
 *
 * MANUAL KILL-SWITCH (during a 429 incident): set OCR_BUDGET_MODE=enforce and
 *   OCR_BUDGET_DAILY_USD=0 → every paid call is blocked immediately (budget_exceeded),
 *   no code change/deploy needed. (Or flip the provider's own env off.)
 *
 * Cache VALUE = OCR result = PII → the injected store encrypts at rest
 * (ocrCacheStoreEncrypted). Cache KEY = content-addressed hash (no PII).
 * Substitution requires a value codec (serialize/deserialize) because provider
 * results (e.g. a fetch Response) are not directly serializable; when no codec is
 * supplied the gateway runs dedup/budget but SKIPS cache substitution (logged).
 */
import { buildOcrCacheKey, type OcrCacheKeyParts, type OcrCacheStore } from './ocrCache'
import { computeCacheKeySha } from './ocrCostMetrics'
import {
  encodeOcrResult,
  decodeOcrResult,
  isCacheable,
  shadowParityVerdict,
  CodecError,
  type OcrCodecMeta,
} from './ocrResponseCodec'

export type OcrCacheMode = 'off' | 'shadow' | 'enforce'
export type OcrBudgetMode = 'off' | 'shadow' | 'enforce'

export type OcrGatewayFlags = {
  cacheMode: OcrCacheMode
  dedupEnabled: boolean
  budgetMode: OcrBudgetMode
  /** Per-window (daily) USD cap per provider. 0 ⇒ block all paid calls when enforce. */
  budgetDailyUsd: number
}

/** All-OFF default. resolveGatewayFlags(env) returns this when env is unset. */
export const OFF_FLAGS: Readonly<OcrGatewayFlags> = Object.freeze({
  cacheMode: 'off',
  dedupEnabled: false,
  budgetMode: 'off',
  budgetDailyUsd: 0,
})

function parseCacheMode(v: string | undefined): OcrCacheMode {
  return v === 'shadow' || v === 'enforce' ? v : 'off'
}
function parseBudgetMode(v: string | undefined): OcrBudgetMode {
  return v === 'shadow' || v === 'enforce' ? v : 'off'
}

/** Resolve gateway flags from env. Anything unrecognized ⇒ OFF (fail-safe). */
export function resolveGatewayFlags(env: Record<string, string | undefined>): OcrGatewayFlags {
  return {
    cacheMode: parseCacheMode(env.OCR_CACHE_MODE),
    dedupEnabled: env.OCR_DEDUP_ENABLED === '1',
    budgetMode: parseBudgetMode(env.OCR_BUDGET_MODE),
    budgetDailyUsd: Number.isFinite(Number(env.OCR_BUDGET_DAILY_USD))
      ? Math.max(0, Number(env.OCR_BUDGET_DAILY_USD))
      : 0,
  }
}

/** True when every flag is at its OFF default ⇒ gateway must be a pure pass-through. */
export function allFlagsOff(f: OcrGatewayFlags): boolean {
  return f.cacheMode === 'off' && !f.dedupEnabled && f.budgetMode === 'off'
}

// ── In-flight single-flight registry (dedup) ──────────────────────────────────
// One in-flight promise per cache key. A burst of identical concurrent calls
// awaits the SAME promise ⇒ exactly ONE provider call. Cleared on settle.
const _inFlight = new Map<string, Promise<unknown>>()

/** TEST ONLY — current number of tracked in-flight keys (should settle to 0). */
export function __inFlightSize(): number {
  return _inFlight.size
}

// ── Budget accounting (per-provider, per-window) ──────────────────────────────
// In-process projected-spend counter per provider for the current window. This is
// the instance-local view; a shared cap can later be backed by providerBudget +
// a persisted counter. For shadow it only logs; for enforce it blocks at the cap.
type BudgetWindow = { windowKey: string; spentMicros: number }
const _budget = new Map<string, BudgetWindow>()

function windowKeyForNow(now: number): string {
  return new Date(now).toISOString().slice(0, 10) // UTC day
}

/** TEST ONLY — reset all in-process gateway state (dedup + budget). */
export function __resetGatewayState(): void {
  _inFlight.clear()
  _budget.clear()
}

export type BudgetCheck =
  | { allowed: true; projectedMicros: number; capMicros: number }
  | { allowed: false; projectedMicros: number; capMicros: number }

function checkAndMaybeRecordBudget(args: {
  provider: string
  estCostMicros: number
  capUsd: number
  mode: OcrBudgetMode
  now: number
  record: boolean
}): BudgetCheck {
  const wk = windowKeyForNow(args.now)
  const cur = _budget.get(args.provider)
  const spent = cur && cur.windowKey === wk ? cur.spentMicros : 0
  const projectedMicros = spent + args.estCostMicros
  const capMicros = Math.round(args.capUsd * 1e6)
  const allowed = projectedMicros <= capMicros
  if (args.record && (allowed || args.mode === 'shadow')) {
    _budget.set(args.provider, { windowKey: wk, spentMicros: projectedMicros })
  }
  return allowed
    ? { allowed: true, projectedMicros, capMicros }
    : { allowed: false, projectedMicros, capMicros }
}

// ── PII-free gateway telemetry ────────────────────────────────────────────────
export type OcrGatewayEvent = {
  event: 'ocr_gateway'
  provider: string
  route: string
  cache_key_sha: string
  cache_mode: OcrCacheMode
  budget_mode: OcrBudgetMode
  dedup: boolean
  /** what the gateway DID: 'passthrough' | 'cache_hit' | 'cache_miss' |
   *  'shadow_hit' | 'shadow_miss' | 'deduped' | 'budget_blocked' */
  outcome: string
}

/**
 * PII-free SHADOW-PARITY telemetry. In OCR_CACHE_MODE=shadow the gateway encodes
 * the live result and compares it against any prior shadow entry — emitting this
 * verdict so the would-be cache CORRECTNESS is measurable before substitution is
 * ever enabled. Carries ONLY technical dimensions + a key hash (no field values).
 *   - first_seen : no prior entry; this run stored the first shadow record.
 *   - match      : a prior entry decoded and equals the live result.
 *   - mismatch   : a prior entry exists but failed decode (binding/integrity) OR
 *                  differs from the live result.
 */
export type OcrCacheParityEvent = {
  event: 'ocr_cache_parity'
  key_sha: string
  hit: boolean
  parity: 'match' | 'mismatch' | 'first_seen'
  provider: string
  model: string
}

type GwSink = (e: OcrGatewayEvent) => void
type ParitySink = (e: OcrCacheParityEvent) => void
let _gwSink: GwSink | null = null
let _paritySink: ParitySink | null = null
/** TEST ONLY — capture gateway events instead of console. */
export function __setOcrGatewaySink(sink: GwSink | null): void {
  _gwSink = sink
}
/** TEST ONLY — capture shadow-parity events instead of console. */
export function __setOcrCacheParitySink(sink: ParitySink | null): void {
  _paritySink = sink
}
function emitGw(e: OcrGatewayEvent): void {
  try {
    if (_gwSink) _gwSink(e)
    else console.info(JSON.stringify(e))
  } catch {
    /* telemetry must never throw into the OCR path */
  }
}
function emitParity(e: OcrCacheParityEvent): void {
  try {
    if (_paritySink) _paritySink(e)
    else console.info(JSON.stringify(e))
  } catch {
    /* telemetry must never throw into the OCR path */
  }
}

/** Typed result of a budget-blocked call. The route maps this to a clean
 *  "temporarily unavailable / review" state (fail-closed), NOT a crash. */
export class OcrBudgetExceededError extends Error {
  readonly code = 'ocr_budget_exceeded' as const
  constructor(public readonly provider: string) {
    super(`ocr_budget_exceeded: provider=${provider}`)
    this.name = 'OcrBudgetExceededError'
  }
}

export type OcrGatewayOptions<T> = {
  /** Content-addressed key parts (same 5-tuple as the cost metric / cache key). */
  keyParts: OcrCacheKeyParts
  provider: string
  route: string
  estCostUsdMicros: number
  /** Encrypted-at-rest store; required to actually substitute/store in enforce. */
  store?: OcrCacheStore
  /** Value codec — provider results (e.g. Response) are not directly serializable;
   *  supply this to enable cache substitution. Without it, cache is skipped.
   *
   *  Two forms are supported:
   *   - OPAQUE codec (legacy): { serialize, deserialize } — caller owns the bytes.
   *   - BINDING codec (P2 step B): { mode:'ocr_result' } — the gateway uses the
   *     versioned ocrResponseCodec to encode/decode + binding/integrity check, and
   *     in shadow mode emits an ocr_cache_parity verdict (cached-vs-live). It also
   *     refuses to STORE a non-cacheable (empty/error) value (HARD RULE). */
  codec?:
    | { serialize: (v: T) => unknown; deserialize: (raw: unknown) => T }
    | { mode: 'ocr_result' }
  /** TTL for stored entries (ms). Default 24h. */
  ttlMs?: number
  /** Injected env (default process.env) + clock (default Date.now) for testability. */
  env?: Record<string, string | undefined>
  now?: () => number
  /** Cache key sha (precomputed by caller); computed if absent. */
  cacheKeySha?: string
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/** Narrow the codec union to the binding (ocr_result) form. */
function isBindingCodec<T>(
  codec: OcrGatewayOptions<T>['codec'],
): codec is { mode: 'ocr_result' } {
  return Boolean(codec && (codec as { mode?: string }).mode === 'ocr_result')
}

/** Derive the codec binding meta from the content-addressed key parts. */
function metaFromKeyParts(parts: OcrCacheKeyParts): OcrCodecMeta {
  return {
    provider: parts.provider,
    model: parts.modelVersion,
    prompt_version: parts.promptVersion,
    preproc_version: parts.preprocessingVersion,
  }
}

/**
 * Run a paid OCR/AI provider call through the gateway.
 *
 * ALL FLAGS OFF ⇒ returns `await call()` directly (no lookup/dedup/budget),
 * byte-identical to the un-wrapped call. Otherwise applies, in order:
 *   1. BUDGET (enforce: block at cap → throw OcrBudgetExceededError; shadow: log).
 *   2. CACHE enforce HIT → return decrypted value, NO provider call.
 *      CACHE shadow → look up + record hit/miss, still call (no substitution).
 *   3. DEDUP → collapse concurrent identical-key calls into one shared promise.
 *   4. Provider call; on cache enforce MISS, store the (encrypted) result.
 */
export async function runOcrGateway<T>(opts: OcrGatewayOptions<T>, call: () => Promise<T>): Promise<T> {
  const env = opts.env ?? process.env
  const flags = resolveGatewayFlags(env)

  // ── OFF-PARITY FAST PATH: pure pass-through, byte-identical to today. ────────
  if (allFlagsOff(flags)) {
    return call()
  }

  const now = opts.now ?? Date.now
  const keySha = opts.cacheKeySha ?? computeCacheKeySha({
    fileSha256: opts.keyParts.fileSha256,
    provider: opts.keyParts.provider,
    model: opts.keyParts.modelVersion,
    promptVersion: opts.keyParts.promptVersion,
    preprocVersion: opts.keyParts.preprocessingVersion,
  })
  const cacheKey = buildOcrCacheKey(opts.keyParts)

  const baseEvt = {
    event: 'ocr_gateway' as const,
    provider: opts.provider,
    route: opts.route,
    cache_key_sha: keySha,
    cache_mode: flags.cacheMode,
    budget_mode: flags.budgetMode,
    dedup: flags.dedupEnabled,
  }

  // ── 1. BUDGET ────────────────────────────────────────────────────────────────
  if (flags.budgetMode !== 'off') {
    const decision = checkAndMaybeRecordBudget({
      provider: opts.provider,
      estCostMicros: opts.estCostUsdMicros,
      capUsd: flags.budgetDailyUsd,
      mode: flags.budgetMode,
      now: now(),
      record: true,
    })
    if (flags.budgetMode === 'enforce' && !decision.allowed) {
      emitGw({ ...baseEvt, outcome: 'budget_blocked' })
      throw new OcrBudgetExceededError(opts.provider)
    }
    // shadow: recorded above; just observed (never blocks).
  }

  const codec = opts.codec
  const bindingCodec = isBindingCodec(codec)
  const codecMeta = metaFromKeyParts(opts.keyParts)
  const canSubstitute = Boolean(opts.store && codec)

  // The cached raw record we looked up (binding-codec shadow parity uses it after
  // the live call resolves so we can compare cached-vs-live deterministically).
  let cachedRaw: unknown = undefined
  let cachedHit = false

  // ── 2. CACHE lookup ───────────────────────────────────────────────────────────
  if (flags.cacheMode !== 'off' && opts.store) {
    const hit = await opts.store.get(cacheKey).catch(() => null)
    cachedHit = Boolean(hit)
    cachedRaw = hit?.rawResponse

    if (flags.cacheMode === 'enforce' && hit && canSubstitute) {
      if (bindingCodec) {
        // FAIL-CLOSED: decode + binding/integrity check. Any failure → treat as a
        // cache MISS (re-read the provider), NEVER serve a corrupt/mismatched value.
        try {
          const decoded = decodeOcrResult(hit.rawResponse, codecMeta)
          emitGw({ ...baseEvt, outcome: 'cache_hit' })
          return decoded as unknown as T
        } catch (err) {
          if (!(err instanceof CodecError)) throw err
          // fall through to cache_miss + provider call (do NOT serve).
          emitGw({ ...baseEvt, outcome: 'cache_miss' })
        }
      } else {
        emitGw({ ...baseEvt, outcome: 'cache_hit' })
        return (codec as { deserialize: (raw: unknown) => T }).deserialize(hit.rawResponse)
      }
    } else if (flags.cacheMode === 'shadow') {
      // measure correctness safely: record hit/miss but ALWAYS call the provider.
      emitGw({ ...baseEvt, outcome: hit ? 'shadow_hit' : 'shadow_miss' })
    } else if (flags.cacheMode === 'enforce') {
      emitGw({ ...baseEvt, outcome: 'cache_miss' })
    }
  }

  // The "do the real call (and store on enforce-miss)" thunk.
  const doCall = async (): Promise<T> => {
    const value = await call()

    // ── SHADOW PARITY (binding codec): encode the LIVE result, compute what WOULD
    //    be cached, compare against any prior shadow entry, emit a PII-free verdict.
    //    STILL returns the LIVE value below — NO substitution in shadow.
    if (flags.cacheMode === 'shadow' && bindingCodec && opts.store) {
      try {
        if (isCacheable(value)) {
          if (cachedHit) {
            const parity = shadowParityVerdict(cachedRaw, value, codecMeta)
            emitParity({ event: 'ocr_cache_parity', key_sha: keySha, hit: true, parity, provider: opts.provider, model: codecMeta.model })
          } else {
            // First time we see this key in shadow → store the encoded record so a
            // LATER run can compare. Storing in shadow is safe: it is never served.
            const record = encodeOcrResult(value, codecMeta, new Date(now()).toISOString())
            const createdAt = new Date(now()).toISOString()
            const expiresAt = new Date(now() + (opts.ttlMs ?? DEFAULT_TTL_MS)).toISOString()
            await opts.store.putIfAbsent({ key: cacheKey, rawResponse: record, createdAt, expiresAt })
              .catch(() => {/* shadow store failure must not break the OCR path */})
            emitParity({ event: 'ocr_cache_parity', key_sha: keySha, hit: false, parity: 'first_seen', provider: opts.provider, model: codecMeta.model })
          }
        }
        // NOT cacheable (empty/error) → emit nothing; never store an error/empty.
      } catch {
        /* parity is observability only — never throw into the OCR path */
      }
    }

    // ── ENFORCE store-on-miss. HARD RULE: only store a genuinely cacheable result. ──
    if (flags.cacheMode === 'enforce' && canSubstitute) {
      const createdAt = new Date(now()).toISOString()
      const expiresAt = new Date(now() + (opts.ttlMs ?? DEFAULT_TTL_MS)).toISOString()
      let rawResponse: unknown
      let storeIt = true
      if (bindingCodec) {
        // NEVER cache an empty/error result as a success.
        if (isCacheable(value)) {
          rawResponse = encodeOcrResult(value, codecMeta, createdAt)
        } else {
          storeIt = false
        }
      } else {
        rawResponse = (codec as { serialize: (v: T) => unknown }).serialize(value)
      }
      if (storeIt) {
        await opts
          .store!.putIfAbsent({ key: cacheKey, rawResponse, createdAt, expiresAt })
          .catch(() => {/* store failure must not break the OCR path */})
      }
    }
    return value
  }

  // ── 3. DEDUP (single-flight) ──────────────────────────────────────────────────
  if (flags.dedupEnabled) {
    const existing = _inFlight.get(cacheKey) as Promise<T> | undefined
    if (existing) {
      emitGw({ ...baseEvt, outcome: 'deduped' })
      return existing
    }
    const p = doCall()
    _inFlight.set(cacheKey, p as Promise<unknown>)
    try {
      return await p
    } finally {
      _inFlight.delete(cacheKey)
    }
  }

  // ── 4. Plain provider call (cache/budget already applied above) ───────────────
  emitGw({ ...baseEvt, outcome: 'passthrough' })
  return doCall()
}
