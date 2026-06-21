/**
 * ocrRequestLease — CROSS-INSTANCE distributed single-flight for paid OCR/AI calls.
 *
 * The dedup/budget canary proved an in-flight Map cannot collapse a serverless
 * burst (per-instance). A persistent cache alone is ALSO insufficient: five
 * simultaneous cache-misses each call the provider before any of them writes. This
 * module adds a DISTRIBUTED LEASE: exactly one caller (the winner) calls the
 * provider per content key; the others (losers) wait briefly and read the winner's
 * cached result — they NEVER call the provider. A winner failure releases the lease
 * with a negative cooldown so losers get a structured "unavailable" instead of a
 * retry storm.
 *
 * Pure coordination logic with INJECTED store / cache / provider / clock / sleep so
 * it is fully unit-testable without a DB or real provider. The Supabase-backed
 * store calls the SECURITY DEFINER RPCs in migration 20260615010000.
 *
 * Flag-gated (OCR_DISTRIBUTED_DEDUP_MODE, default off). NOT wired into the live OCR
 * path here — that is a later PR.
 *
 * Server-only.
 */

export type OcrDistributedDedupMode = 'off' | 'shadow' | 'enforce'

/** Resolve the runtime mode. Unknown/absent → 'off' (fail-safe). */
export function resolveDistributedDedupMode(
  env: Record<string, string | undefined>,
): OcrDistributedDedupMode {
  const v = (env.OCR_DISTRIBUTED_DEDUP_MODE ?? '').trim().toLowerCase()
  return v === 'shadow' || v === 'enforce' ? v : 'off'
}

export type LeaseStatus = 'in_flight' | 'done' | 'failed'

/** Result of an atomic acquire attempt. */
export type AcquireResult = {
  acquired: boolean
  status: LeaseStatus
  rateLimitedUntilMs?: number | null
  errorClass?: string | null
  retryAfterSeconds?: number | null
}

/** A lease row (technical coordination metadata only — never PII). */
export type LeaseRow = {
  cacheKeyHash: string
  status: LeaseStatus
  leaseOwner: string
  leaseExpiresAtMs: number
  provider: string
  modelVersion: string
  pipelineVersion: string
  rateLimitedUntilMs?: number | null
  errorClass?: string | null
  retryAfterSeconds?: number | null
}

export type AcquireArgs = {
  cacheKeyHash: string
  owner: string
  ttlMs: number
  provider: string
  modelVersion: string
  pipelineVersion: string
}

/** Storage abstraction (in-memory for tests / Supabase RPC for prod). */
export interface LeaseStore {
  acquire(args: AcquireArgs): Promise<AcquireResult>
  complete(cacheKeyHash: string, owner: string): Promise<boolean>
  fail(
    cacheKeyHash: string,
    owner: string,
    errorClass: string,
    retryAfterSeconds: number | null,
    cooldownMs: number,
  ): Promise<boolean>
  get(cacheKeyHash: string): Promise<LeaseRow | null>
}

/**
 * In-memory LeaseStore that FAITHFULLY models the SQL semantics in
 * 20260615010000_ocr_request_leases.sql: atomic winner election, expired-lease
 * steal (crash/stale recovery), owner-checked complete/fail. Used by the algorithm
 * unit tests; also a valid single-instance store. The JS event loop serializes the
 * synchronous body of acquire(), matching the advisory-lock atomicity.
 */
export class InMemoryLeaseStore implements LeaseStore {
  private readonly rows = new Map<string, LeaseRow>()
  constructor(private readonly now: () => number = Date.now) {}

  async acquire(a: AcquireArgs): Promise<AcquireResult> {
    const nowMs = this.now()
    const existing = this.rows.get(a.cacheKeyHash)
    const fresh: LeaseRow = {
      cacheKeyHash: a.cacheKeyHash,
      status: 'in_flight',
      leaseOwner: a.owner,
      leaseExpiresAtMs: nowMs + Math.max(a.ttlMs, 1),
      provider: a.provider,
      modelVersion: a.modelVersion,
      pipelineVersion: a.pipelineVersion,
    }
    if (!existing) {
      this.rows.set(a.cacheKeyHash, fresh)
      return { acquired: true, status: 'in_flight' }
    }
    // Expired in_flight lease (crashed/stale winner) is stealable.
    if (existing.status === 'in_flight' && existing.leaseExpiresAtMs < nowMs) {
      this.rows.set(a.cacheKeyHash, fresh)
      return { acquired: true, status: 'in_flight' }
    }
    // Active winner / done / cooling-down: caller does NOT acquire.
    return {
      acquired: false,
      status: existing.status,
      rateLimitedUntilMs: existing.rateLimitedUntilMs ?? null,
      errorClass: existing.errorClass ?? null,
      retryAfterSeconds: existing.retryAfterSeconds ?? null,
    }
  }

  async complete(cacheKeyHash: string, owner: string): Promise<boolean> {
    const row = this.rows.get(cacheKeyHash)
    if (!row || row.leaseOwner !== owner || row.status !== 'in_flight') return false
    this.rows.set(cacheKeyHash, {
      ...row, status: 'done', rateLimitedUntilMs: null, errorClass: null, retryAfterSeconds: null,
    })
    return true
  }

  async fail(
    cacheKeyHash: string, owner: string, errorClass: string,
    retryAfterSeconds: number | null, cooldownMs: number,
  ): Promise<boolean> {
    const row = this.rows.get(cacheKeyHash)
    if (!row || row.leaseOwner !== owner || row.status !== 'in_flight') return false
    this.rows.set(cacheKeyHash, {
      ...row, status: 'failed', errorClass, retryAfterSeconds,
      rateLimitedUntilMs: this.now() + Math.max(cooldownMs, 0),
    })
    return true
  }

  async get(cacheKeyHash: string): Promise<LeaseRow | null> {
    return this.rows.get(cacheKeyHash) ?? null
  }

  /** TEST ONLY — current row count. */
  __size(): number {
    return this.rows.size
  }
}

// ── Supabase-backed store (calls the SECURITY DEFINER RPCs) ───────────────────
// Minimal injected client surface so the store is unit-testable with a mock and
// does not hard-depend on the supabase-js types. Service-role client in prod.

export type LeaseRpcResult = { data: unknown; error: unknown }
export interface LeaseDbClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<LeaseRpcResult>
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): { maybeSingle(): Promise<LeaseRpcResult> }
    }
  }
}

const LEASE_TABLE = 'ocr_request_leases'

/** Row shape returned by acquire_ocr_lease (snake_case from Postgres). */
type AcquireRpcRow = {
  acquired: boolean
  status: LeaseStatus
  rate_limited_until: string | null
  error_class: string | null
  retry_after_seconds: number | null
}

type LeaseTableRow = {
  cache_key_hash: string
  status: LeaseStatus
  lease_owner: string
  lease_expires_at: string
  provider: string
  model_version: string
  pipeline_version: string
  rate_limited_until: string | null
  error_class: string | null
  retry_after_seconds: number | null
}

/**
 * Production LeaseStore backed by Supabase. acquire/complete/fail go through the
 * atomic SECURITY DEFINER RPCs; get() reads the row (service-role, RLS-locked).
 * A DB error fails CLOSED — acquire returns acquired:false so the caller never
 * "wins" a lease it could not actually take (and never makes the single call on a
 * false premise). The coordination layer then falls back to its bounded wait.
 */
export class SupabaseLeaseStore implements LeaseStore {
  constructor(private readonly db: LeaseDbClient, private readonly now: () => number = Date.now) {}

  async acquire(a: AcquireArgs): Promise<AcquireResult> {
    const { data, error } = await this.db.rpc('acquire_ocr_lease', {
      p_cache_key_hash: a.cacheKeyHash,
      p_owner: a.owner,
      p_ttl_seconds: Math.max(Math.ceil(a.ttlMs / 1000), 1),
      p_provider: a.provider,
      p_model_version: a.modelVersion,
      p_pipeline_version: a.pipelineVersion,
    })
    if (error) return { acquired: false, status: 'in_flight' } // fail closed: do NOT win
    const row = (Array.isArray(data) ? data[0] : data) as AcquireRpcRow | undefined
    if (!row) return { acquired: false, status: 'in_flight' }
    return {
      acquired: !!row.acquired,
      status: row.status,
      rateLimitedUntilMs: row.rate_limited_until ? new Date(row.rate_limited_until).getTime() : null,
      errorClass: row.error_class,
      retryAfterSeconds: row.retry_after_seconds,
    }
  }

  async complete(cacheKeyHash: string, owner: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('complete_ocr_lease', {
      p_cache_key_hash: cacheKeyHash, p_owner: owner,
    })
    return !error && data === true
  }

  async fail(
    cacheKeyHash: string, owner: string, errorClass: string,
    retryAfterSeconds: number | null, cooldownMs: number,
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc('fail_ocr_lease', {
      p_cache_key_hash: cacheKeyHash, p_owner: owner, p_error_class: errorClass,
      p_retry_after_seconds: retryAfterSeconds, p_cooldown_seconds: Math.max(Math.ceil(cooldownMs / 1000), 0),
    })
    return !error && data === true
  }

  async get(cacheKeyHash: string): Promise<LeaseRow | null> {
    const { data, error } = await this.db
      .from(LEASE_TABLE).select('*').eq('cache_key_hash', cacheKeyHash).maybeSingle()
    if (error || !data) return null
    const r = data as LeaseTableRow
    return {
      cacheKeyHash: r.cache_key_hash,
      status: r.status,
      leaseOwner: r.lease_owner,
      leaseExpiresAtMs: new Date(r.lease_expires_at).getTime(),
      provider: r.provider,
      modelVersion: r.model_version,
      pipelineVersion: r.pipeline_version,
      rateLimitedUntilMs: r.rate_limited_until ? new Date(r.rate_limited_until).getTime() : null,
      errorClass: r.error_class,
      retryAfterSeconds: r.retry_after_seconds,
    }
  }
}

// ── Coordination algorithm ────────────────────────────────────────────────────

export type FailureClass = {
  errorClass: string
  retryAfterSeconds: number | null
  cooldownMs: number
}

export type CoordinateOptions<T> = {
  cacheKeyHash: string
  owner: string
  provider: string
  modelVersion: string
  pipelineVersion: string
  store: LeaseStore
  /** Read the cached value (decrypted) for this key, or null on miss. */
  cacheGet: () => Promise<T | null>
  /** Persist a winner's cacheable result. Best-effort; a throw must not break OCR. */
  cachePut: (value: T) => Promise<void>
  /** The single real provider call (only the winner runs it). */
  providerCall: () => Promise<T>
  /** True only for a genuine successful, storable result. */
  isCacheableResult: (value: T) => boolean
  /** Map a thrown error OR a non-cacheable result to a failure class + cooldown. */
  classifyFailure: (errOrResult: unknown) => FailureClass
  // Timing (injected for tests; real callers pass production values).
  clock?: () => number
  sleep?: (ms: number) => Promise<void>
  ttlMs?: number
  maxWaitMs?: number
  pollIntervalMs?: number
  jitterMs?: number
  /** Deterministic jitter source for tests (0..1). Default 0.5 (no Math.random). */
  jitterFraction?: () => number
}

export type CoordinateResult<T> =
  | { outcome: 'cache_hit'; value: T; providerCalled: false }
  | { outcome: 'provider_winner'; value: T; providerCalled: true }
  | { outcome: 'waited_cache_hit'; value: T; providerCalled: false; waitedMs: number }
  | {
      outcome: 'unavailable'
      providerCalled: false
      errorClass: string
      rateLimitedUntilMs?: number | null
      retryAfterSeconds?: number | null
      waitedMs?: number
    }

/**
 * Coordinate a paid provider call across instances. Winner makes the ONE call and
 * writes the cache; losers wait (bounded, jittered, no busy loop) and read it, or
 * get a structured 'unavailable' — losers NEVER call the provider.
 */
export async function coordinateProviderCall<T>(
  opts: CoordinateOptions<T>,
): Promise<CoordinateResult<T>> {
  const clock = opts.clock ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const ttlMs = opts.ttlMs ?? 30_000
  const maxWaitMs = opts.maxWaitMs ?? 8_000
  const pollIntervalMs = opts.pollIntervalMs ?? 250
  const jitterMs = opts.jitterMs ?? 100
  const jitterFraction = opts.jitterFraction ?? (() => 0.5)

  // 1. Cache first.
  const hit = await opts.cacheGet()
  if (hit != null) return { outcome: 'cache_hit', value: hit, providerCalled: false }

  // 2. Try to win the lease.
  const acq = await opts.store.acquire({
    cacheKeyHash: opts.cacheKeyHash,
    owner: opts.owner,
    ttlMs,
    provider: opts.provider,
    modelVersion: opts.modelVersion,
    pipelineVersion: opts.pipelineVersion,
  })

  // 3. WINNER — the single provider call.
  if (acq.acquired) {
    let result: T
    try {
      result = await opts.providerCall()
    } catch (err) {
      const f = opts.classifyFailure(err)
      await opts.store.fail(opts.cacheKeyHash, opts.owner, f.errorClass, f.retryAfterSeconds, f.cooldownMs)
      return {
        outcome: 'unavailable', providerCalled: false, errorClass: f.errorClass,
        retryAfterSeconds: f.retryAfterSeconds,
      }
      // NOTE providerCalled:false here means "no EXTRA provider call beyond the one
      // that just failed"; the winner's own call already happened and threw.
    }
    if (opts.isCacheableResult(result)) {
      try {
        await opts.cachePut(result)
      } catch {
        /* cache write failure must NEVER break the OCR result path */
      }
      await opts.store.complete(opts.cacheKeyHash, opts.owner)
      return { outcome: 'provider_winner', value: result, providerCalled: true }
    }
    // Provider returned a non-cacheable (error/empty) result: release with cooldown,
    // but the winner still returns its OWN live result (never cache it as success).
    const f = opts.classifyFailure(result)
    await opts.store.fail(opts.cacheKeyHash, opts.owner, f.errorClass, f.retryAfterSeconds, f.cooldownMs)
    return { outcome: 'provider_winner', value: result, providerCalled: true }
  }

  // 4. LOSER — never calls the provider.
  // Already cooling down or completed-without-cache → bail immediately.
  if (acq.status === 'failed') {
    return {
      outcome: 'unavailable', providerCalled: false, errorClass: acq.errorClass ?? 'rate_limited',
      rateLimitedUntilMs: acq.rateLimitedUntilMs, retryAfterSeconds: acq.retryAfterSeconds,
    }
  }

  // Wait (bounded, jittered) for the winner's cache. No busy loop: each iteration
  // sleeps pollIntervalMs + jitter, and we early-exit on failed/expired lease.
  const started = clock()
  while (clock() - started < maxWaitMs) {
    await sleep(pollIntervalMs + Math.floor(jitterMs * jitterFraction()))
    const v = await opts.cacheGet()
    if (v != null) {
      return { outcome: 'waited_cache_hit', value: v, providerCalled: false, waitedMs: clock() - started }
    }
    const row = await opts.store.get(opts.cacheKeyHash)
    if (!row) {
      return { outcome: 'unavailable', providerCalled: false, errorClass: 'lease_vanished', waitedMs: clock() - started }
    }
    if (row.status === 'failed') {
      return {
        outcome: 'unavailable', providerCalled: false, errorClass: row.errorClass ?? 'rate_limited',
        rateLimitedUntilMs: row.rateLimitedUntilMs, retryAfterSeconds: row.retryAfterSeconds,
        waitedMs: clock() - started,
      }
    }
    if (row.status === 'in_flight' && row.leaseExpiresAtMs < clock()) {
      // Winner crashed past TTL and no cache was written → give up (caller may retry).
      return { outcome: 'unavailable', providerCalled: false, errorClass: 'lease_expired', waitedMs: clock() - started }
    }
    // status 'done' but cache not yet readable, or still 'in_flight' → loop.
  }
  return { outcome: 'unavailable', providerCalled: false, errorClass: 'lease_wait_timeout', waitedMs: clock() - started }
}
