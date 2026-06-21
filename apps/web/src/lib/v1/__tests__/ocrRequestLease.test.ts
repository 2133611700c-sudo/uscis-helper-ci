import { describe, it, expect } from 'vitest'
import {
  resolveDistributedDedupMode,
  InMemoryLeaseStore,
  SupabaseLeaseStore,
  coordinateProviderCall,
  type CoordinateOptions,
  type FailureClass,
  type LeaseDbClient,
  type LeaseRpcResult,
} from '../ocrRequestLease'

type Val = { ok: boolean; text?: string }

const FAIL_429: FailureClass = { errorClass: 'OCR_RATE_LIMITED', retryAfterSeconds: 3, cooldownMs: 5_000 }
const classify = (): FailureClass => FAIL_429
const isCacheable = (v: Val) => v.ok === true && !!v.text

/** Build coordinate options over a shared in-memory cache + store. */
function harness(over: Partial<CoordinateOptions<Val>> = {}) {
  const cache = new Map<string, Val>()
  const KEY = 'k_' + (over.cacheKeyHash ?? 'A')
  let providerCalls = 0
  let sleeps = 0
  let t = 10_000
  const base: CoordinateOptions<Val> = {
    cacheKeyHash: KEY,
    owner: over.owner ?? 'owner-1',
    provider: 'gemini', modelVersion: 'm1', pipelineVersion: 'p1',
    store: over.store ?? new InMemoryLeaseStore(() => t),
    cacheGet: async () => cache.get(KEY) ?? null,
    cachePut: async (v) => { cache.set(KEY, v) },
    providerCall: async () => { providerCalls++; return { ok: true, text: 'СВІДОЦТВО' } },
    isCacheableResult: isCacheable,
    classifyFailure: classify,
    clock: () => t,
    sleep: async (ms) => { sleeps++; t += ms },
    ttlMs: 30_000, maxWaitMs: 8_000, pollIntervalMs: 250, jitterMs: 100,
    jitterFraction: () => 0.5,
    ...over,
  }
  return {
    opts: base, cache,
    counts: () => ({ providerCalls, sleeps }),
    advance: (ms: number) => { t += ms },
    setClock: (v: number) => { t = v },
  }
}

describe('resolveDistributedDedupMode', () => {
  it('off by default / on unknown', () => {
    expect(resolveDistributedDedupMode({})).toBe('off')
    expect(resolveDistributedDedupMode({ OCR_DISTRIBUTED_DEDUP_MODE: 'bogus' })).toBe('off')
  })
  it('parses shadow / enforce (case-insensitive)', () => {
    expect(resolveDistributedDedupMode({ OCR_DISTRIBUTED_DEDUP_MODE: 'shadow' })).toBe('shadow')
    expect(resolveDistributedDedupMode({ OCR_DISTRIBUTED_DEDUP_MODE: 'ENFORCE' })).toBe('enforce')
  })
})

describe('coordinateProviderCall — single caller', () => {
  it('winner makes exactly ONE provider call and caches the result', async () => {
    const h = harness()
    const r = await coordinateProviderCall(h.opts)
    expect(r.outcome).toBe('provider_winner')
    expect(h.counts().providerCalls).toBe(1)
    expect(h.cache.get(h.opts.cacheKeyHash)).toEqual({ ok: true, text: 'СВІДОЦТВО' })
  })
  it('a later caller with a warm cache → cache_hit, NO provider call', async () => {
    const store = new InMemoryLeaseStore(() => 10_000)
    const h = harness({ store })
    await coordinateProviderCall(h.opts) // winner warms cache
    const before = h.counts().providerCalls
    const r2 = await coordinateProviderCall({ ...h.opts, owner: 'owner-2' })
    expect(r2.outcome).toBe('cache_hit')
    expect(h.counts().providerCalls).toBe(before) // unchanged
  })
})

describe('coordinateProviderCall — 5 concurrent identical → 1 winner, 4 waiters, 1 provider call', () => {
  it('exactly one provider call; all five get the identical result; losers never call provider', async () => {
    const cache = new Map<string, Val>()
    const KEY = 'k_burst'
    const store = new InMemoryLeaseStore() // real Date.now
    let providerCalls = 0
    // Controllable winner provider call: gate it so losers are forced to wait.
    let release!: () => void
    const gate = new Promise<void>((res) => { release = res })
    const mk = (owner: string): CoordinateOptions<Val> => ({
      cacheKeyHash: KEY, owner, provider: 'gemini', modelVersion: 'm1', pipelineVersion: 'p1',
      store,
      cacheGet: async () => cache.get(KEY) ?? null,
      cachePut: async (v) => { cache.set(KEY, v) },
      providerCall: async () => { providerCalls++; await gate; return { ok: true, text: 'ONE' } },
      isCacheableResult: isCacheable, classifyFailure: classify,
      maxWaitMs: 2_000, pollIntervalMs: 5, jitterMs: 4, jitterFraction: () => 0.5,
    })
    const all = Promise.all([1, 2, 3, 4, 5].map((i) => coordinateProviderCall(mk(`owner-${i}`))))
    // Let the winner acquire + the 4 losers enter their wait loop, then release.
    await new Promise((r) => setTimeout(r, 20))
    release()
    const results = await all
    const winners = results.filter((r) => r.outcome === 'provider_winner')
    const waiters = results.filter((r) => r.outcome === 'waited_cache_hit')
    expect(providerCalls).toBe(1)
    expect(winners).toHaveLength(1)
    expect(waiters).toHaveLength(4)
    for (const r of results) {
      expect((r as { value: Val }).value).toEqual({ ok: true, text: 'ONE' })
      if (r.outcome !== 'provider_winner') expect(r.providerCalled).toBe(false)
    }
  })
})

describe('stale / crash recovery', () => {
  it('an EXPIRED in_flight lease is stolen by the next caller (winner crashed)', async () => {
    let t = 1_000
    const store = new InMemoryLeaseStore(() => t)
    // Owner-1 acquires but "crashes" (never completes).
    const a1 = await store.acquire({ cacheKeyHash: 'k', owner: 'o1', ttlMs: 1_000, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    expect(a1.acquired).toBe(true)
    // Before TTL: another caller cannot acquire.
    t = 1_500
    const a2 = await store.acquire({ cacheKeyHash: 'k', owner: 'o2', ttlMs: 1_000, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    expect(a2.acquired).toBe(false)
    // Past TTL: the stale lease is stealable.
    t = 2_500
    const a3 = await store.acquire({ cacheKeyHash: 'k', owner: 'o3', ttlMs: 1_000, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    expect(a3.acquired).toBe(true)
  })
  it('coordinate: loser times out as unavailable when the winner crashed past TTL (NO provider call)', async () => {
    let t = 1_000
    const store = new InMemoryLeaseStore(() => t)
    // Pre-existing in_flight lease owned by someone else, already expired.
    await store.acquire({ cacheKeyHash: 'k_x', owner: 'ghost', ttlMs: 10, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    t = 5_000 // ghost lease is now far past TTL
    let providerCalls = 0
    const cache = new Map<string, Val>()
    // This caller will STEAL the expired lease and become the winner.
    const r = await coordinateProviderCall<Val>({
      cacheKeyHash: 'k_x', owner: 'o2', provider: 'g', modelVersion: 'm', pipelineVersion: 'p',
      store, cacheGet: async () => cache.get('k_x') ?? null, cachePut: async (v) => { cache.set('k_x', v) },
      providerCall: async () => { providerCalls++; return { ok: true, text: 'recovered' } },
      isCacheableResult: isCacheable, classifyFailure: classify,
      clock: () => t, sleep: async (ms) => { t += ms },
    })
    expect(r.outcome).toBe('provider_winner') // stole the dead lease
    expect(providerCalls).toBe(1)
  })
})

describe('owner-checked complete / fail', () => {
  it('a non-owner cannot complete or fail a lease', async () => {
    const store = new InMemoryLeaseStore(() => 1_000)
    await store.acquire({ cacheKeyHash: 'k', owner: 'o1', ttlMs: 9_999, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    expect(await store.complete('k', 'intruder')).toBe(false)
    expect(await store.fail('k', 'intruder', 'X', null, 1000)).toBe(false)
    expect(await store.complete('k', 'o1')).toBe(true)
  })
})

describe('provider failure → cooldown, losers get unavailable, NO provider call', () => {
  it('winner THROWS → lease failed; a later loser gets unavailable without calling provider', async () => {
    let t = 1_000
    const store = new InMemoryLeaseStore(() => t)
    const cache = new Map<string, Val>()
    let providerCalls = 0
    // Winner throws.
    const w = await coordinateProviderCall<Val>({
      cacheKeyHash: 'k_f', owner: 'o1', provider: 'g', modelVersion: 'm', pipelineVersion: 'p',
      store, cacheGet: async () => cache.get('k_f') ?? null, cachePut: async (v) => { cache.set('k_f', v) },
      providerCall: async () => { providerCalls++; throw new Error('429') },
      isCacheableResult: isCacheable, classifyFailure: classify, clock: () => t, sleep: async (ms) => { t += ms },
    })
    expect(w.outcome).toBe('unavailable')
    expect((w as { errorClass: string }).errorClass).toBe('OCR_RATE_LIMITED')
    expect(providerCalls).toBe(1)
    expect(cache.has('k_f')).toBe(false) // failure NEVER cached

    // A second caller in the cooldown window → unavailable, provider NOT called again.
    const l = await coordinateProviderCall<Val>({
      cacheKeyHash: 'k_f', owner: 'o2', provider: 'g', modelVersion: 'm', pipelineVersion: 'p',
      store, cacheGet: async () => cache.get('k_f') ?? null, cachePut: async (v) => { cache.set('k_f', v) },
      providerCall: async () => { providerCalls++; return { ok: true, text: 'x' } },
      isCacheableResult: isCacheable, classifyFailure: classify, clock: () => t, sleep: async (ms) => { t += ms },
    })
    expect(l.outcome).toBe('unavailable')
    expect(providerCalls).toBe(1) // unchanged — loser did NOT call provider
  })

  it('winner gets a NON-cacheable result (429-shaped) → returns own result, NOT cached', async () => {
    const h = harness({
      providerCall: async () => ({ ok: false }), // non-cacheable
    })
    const r = await coordinateProviderCall(h.opts)
    expect(r.outcome).toBe('provider_winner')
    expect((r as { value: Val }).value).toEqual({ ok: false })
    expect(h.cache.has(h.opts.cacheKeyHash)).toBe(false) // error NOT cached as success
  })
})

describe('SupabaseLeaseStore — RPC contract mapping', () => {
  function mockDb(over: {
    rpc?: (fn: string, args: Record<string, unknown>) => LeaseRpcResult
    row?: unknown
    rowErr?: unknown
  } = {}) {
    const calls: { fn: string; args: Record<string, unknown> }[] = []
    const db: LeaseDbClient = {
      rpc: async (fn, args) => { calls.push({ fn, args }); return over.rpc ? over.rpc(fn, args) : { data: null, error: null } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: over.row ?? null, error: over.rowErr ?? null }) }) }) }),
    }
    return { db, calls }
  }

  it('acquire maps args→p_* and parses the returned row (array form)', async () => {
    const { db, calls } = mockDb({
      rpc: () => ({ data: [{ acquired: true, status: 'in_flight', rate_limited_until: null, error_class: null, retry_after_seconds: null }], error: null }),
    })
    const store = new SupabaseLeaseStore(db)
    const r = await store.acquire({ cacheKeyHash: 'h', owner: 'o', ttlMs: 30_000, provider: 'gemini', modelVersion: 'm', pipelineVersion: 'p' })
    expect(r).toEqual({ acquired: true, status: 'in_flight', rateLimitedUntilMs: null, errorClass: null, retryAfterSeconds: null })
    expect(calls[0].fn).toBe('acquire_ocr_lease')
    expect(calls[0].args).toMatchObject({ p_cache_key_hash: 'h', p_owner: 'o', p_ttl_seconds: 30, p_provider: 'gemini' })
  })
  it('acquire FAILS CLOSED on a DB error (never wins)', async () => {
    const { db } = mockDb({ rpc: () => ({ data: null, error: { message: 'boom' } }) })
    const r = await new SupabaseLeaseStore(db).acquire({ cacheKeyHash: 'h', owner: 'o', ttlMs: 1000, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    expect(r.acquired).toBe(false)
  })
  it('complete / fail return the RPC boolean; error → false', async () => {
    const ok = mockDb({ rpc: () => ({ data: true, error: null }) })
    expect(await new SupabaseLeaseStore(ok.db).complete('h', 'o')).toBe(true)
    const err = mockDb({ rpc: () => ({ data: null, error: { message: 'x' } }) })
    expect(await new SupabaseLeaseStore(err.db).fail('h', 'o', 'OCR_RATE_LIMITED', 3, 5000)).toBe(false)
    expect(ok.calls[0].fn).toBe('complete_ocr_lease')
  })
  it('fail maps cooldownMs→p_cooldown_seconds (ceil)', async () => {
    const { db, calls } = mockDb({ rpc: () => ({ data: true, error: null }) })
    await new SupabaseLeaseStore(db).fail('h', 'o', 'OCR_RATE_LIMITED', 3, 4500)
    expect(calls[0].args).toMatchObject({ p_cooldown_seconds: 5, p_error_class: 'OCR_RATE_LIMITED', p_retry_after_seconds: 3 })
  })
  it('get maps the snake_case row → LeaseRow', async () => {
    const { db } = mockDb({
      row: {
        cache_key_hash: 'h', status: 'in_flight', lease_owner: 'o',
        lease_expires_at: '2026-06-15T00:00:30.000Z', provider: 'g', model_version: 'm', pipeline_version: 'p',
        rate_limited_until: null, error_class: null, retry_after_seconds: null,
      },
    })
    const row = await new SupabaseLeaseStore(db).get('h')
    expect(row?.cacheKeyHash).toBe('h')
    expect(row?.leaseExpiresAtMs).toBe(new Date('2026-06-15T00:00:30.000Z').getTime())
  })
})

describe('bounded wait — no busy loop, no provider call by losers', () => {
  it('loser waiting on an in_flight lease that never resolves → timeout unavailable, bounded sleeps', async () => {
    let t = 1_000
    const store = new InMemoryLeaseStore(() => t)
    // A live in_flight lease owned by someone else, well within TTL the whole time.
    await store.acquire({ cacheKeyHash: 'k_w', owner: 'busy', ttlMs: 10_000_000, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    let providerCalls = 0
    let sleeps = 0
    const cache = new Map<string, Val>()
    const r = await coordinateProviderCall<Val>({
      cacheKeyHash: 'k_w', owner: 'o2', provider: 'g', modelVersion: 'm', pipelineVersion: 'p',
      store, cacheGet: async () => cache.get('k_w') ?? null, cachePut: async (v) => { cache.set('k_w', v) },
      providerCall: async () => { providerCalls++; return { ok: true, text: 'x' } },
      isCacheableResult: isCacheable, classifyFailure: classify,
      clock: () => t, sleep: async (ms) => { sleeps++; t += ms },
      maxWaitMs: 2_000, pollIntervalMs: 250, jitterMs: 0,
    })
    expect(r.outcome).toBe('unavailable')
    expect((r as { errorClass: string }).errorClass).toBe('lease_wait_timeout')
    expect(providerCalls).toBe(0) // loser NEVER calls provider
    // Bounded: ~2000/250 = 8 iterations, definitely not a busy loop.
    expect(sleeps).toBeGreaterThan(0)
    expect(sleeps).toBeLessThanOrEqual(10)
  })
})
