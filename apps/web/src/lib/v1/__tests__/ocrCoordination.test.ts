import { describe, it, expect } from 'vitest'
import { coordinateOrShadow, OcrCoordinationUnavailable } from '../ocrCoordination'
import { InMemoryLeaseStore } from '../ocrRequestLease'
import { newCoordinationTally } from '../ocrCoordinationMetrics'

type Val = { ok: boolean; text?: string }
const isCacheable = (v: Val) => v.ok && !!v.text
const classify = () => ({ errorClass: 'OCR_RATE_LIMITED', retryAfterSeconds: 3, cooldownMs: 5_000 })

function baseOpts(over: Record<string, unknown> = {}) {
  const cache = new Map<string, Val>()
  const KEY = 'k1'
  let providerCalls = 0
  return {
    cache,
    counts: () => providerCalls,
    opts: {
      cacheKeyHash: KEY, owner: 'o1', provider: 'gemini', modelVersion: 'm', pipelineVersion: 'p',
      store: new InMemoryLeaseStore(() => 1000),
      cacheGet: async () => cache.get(KEY) ?? null,
      cachePut: async (v: Val) => { cache.set(KEY, v) },
      providerCall: async () => { providerCalls++; return { ok: true, text: 'X' } as Val },
      isCacheableResult: isCacheable, classifyFailure: classify,
      estCostMicros: 2000,
      clock: () => 1000, sleep: async () => {},
      ...over,
    },
  }
}

describe('coordinateOrShadow — OFF', () => {
  it('is a pass-through: calls provider once, returns live value, no tally change', async () => {
    const h = baseOpts()
    const tally = newCoordinationTally()
    const { value } = await coordinateOrShadow('off', { ...h.opts, tally })
    expect(value).toEqual({ ok: true, text: 'X' })
    expect(h.counts()).toBe(1)
    expect(tally.requested_calls).toBe(0) // off mode records nothing
  })
})

describe('coordinateOrShadow — SHADOW (model, never block, always live)', () => {
  it('still calls the provider and records a would-be winner', async () => {
    const h = baseOpts()
    const tally = newCoordinationTally()
    const { value } = await coordinateOrShadow('shadow', { ...h.opts, tally })
    expect(value).toEqual({ ok: true, text: 'X' })
    expect(h.counts()).toBe(1) // provider STILL called in shadow
    expect(tally.requested_calls).toBe(1)
    expect(tally.provider_calls).toBe(1) // would-be winner
  })

  it('records a would-be collapse when another holds the lease — but STILL calls provider', async () => {
    const store = new InMemoryLeaseStore(() => 1000)
    // Pre-hold the lease as someone else so the shadow probe sees "would not win".
    await store.acquire({ cacheKeyHash: 'k1', owner: 'other', ttlMs: 9_999_999, provider: 'g', modelVersion: 'm', pipelineVersion: 'p' })
    const h = baseOpts({ store })
    const tally = newCoordinationTally()
    const { value } = await coordinateOrShadow('shadow', { ...h.opts, store, tally })
    expect(value).toEqual({ ok: true, text: 'X' })
    expect(h.counts()).toBe(1) // shadow NEVER blocks — provider still called
    expect(tally.dedup_collapses).toBe(1) // would-be avoided in enforce
    expect(tally.provider_calls).toBe(0)
    expect(tally.avoided_cost_micros).toBe(2000)
  })
})

describe('coordinateOrShadow — ENFORCE', () => {
  it('winner returns its value + records one provider call', async () => {
    const h = baseOpts()
    const tally = newCoordinationTally()
    const { value, result } = await coordinateOrShadow('enforce', { ...h.opts, tally })
    expect(result.outcome).toBe('provider_winner')
    expect(value).toEqual({ ok: true, text: 'X' })
    expect(tally.provider_calls).toBe(1)
  })

  it('throws OcrCoordinationUnavailable when the provider fails (no value)', async () => {
    const h = baseOpts({ providerCall: async () => { throw new Error('429') } })
    await expect(coordinateOrShadow('enforce', h.opts)).rejects.toBeInstanceOf(OcrCoordinationUnavailable)
  })
})
