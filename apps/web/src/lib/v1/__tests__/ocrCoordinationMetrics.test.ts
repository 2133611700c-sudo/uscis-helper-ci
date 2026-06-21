import { describe, it, expect, afterEach } from 'vitest'
import {
  newCoordinationTally,
  recordCoordinationOutcome,
  emitCoordinationMetrics,
  __setCoordinationMetricsSink,
} from '../ocrCoordinationMetrics'
import type { CoordinateResult } from '../ocrRequestLease'

const EST = 2_000 // est cost micros per call

afterEach(() => __setCoordinationMetricsSink(null))

type R = CoordinateResult<unknown>

describe('recordCoordinationOutcome — correct cost accounting', () => {
  it('1 winner + 4 waiters → provider_calls=1, dedup_collapses=4, avoided=4×est, actual=1×est', () => {
    const t = newCoordinationTally()
    recordCoordinationOutcome(t, { outcome: 'provider_winner', value: {}, providerCalled: true } as R, EST)
    for (let i = 0; i < 4; i++) {
      recordCoordinationOutcome(
        t, { outcome: 'waited_cache_hit', value: {}, providerCalled: false, waitedMs: 120 } as R, EST,
      )
    }
    expect(t.requested_calls).toBe(5)
    expect(t.provider_calls).toBe(1)        // NOT 5 — the budget-accounting fix
    expect(t.dedup_collapses).toBe(4)
    expect(t.cache_hits).toBe(4)
    expect(t.cache_misses).toBe(1)
    expect(t.actual_cost_micros).toBe(EST)      // one real call
    expect(t.avoided_cost_micros).toBe(4 * EST) // four calls avoided
    expect(t.lease_wait_ms).toBe(480)
  })

  it('cache_hit → avoided cost, no provider call', () => {
    const t = newCoordinationTally()
    recordCoordinationOutcome(t, { outcome: 'cache_hit', value: {}, providerCalled: false } as R, EST)
    expect(t.cache_hits).toBe(1)
    expect(t.provider_calls).toBe(0)
    expect(t.avoided_cost_micros).toBe(EST)
  })

  it('unavailable rate-limit → rate_limit_events; lease timeout → lease_timeouts', () => {
    const t = newCoordinationTally()
    recordCoordinationOutcome(t, { outcome: 'unavailable', providerCalled: false, errorClass: 'OCR_RATE_LIMITED' } as R, EST)
    recordCoordinationOutcome(t, { outcome: 'unavailable', providerCalled: false, errorClass: 'lease_wait_timeout', waitedMs: 2000 } as R, EST)
    expect(t.rate_limit_events).toBe(1)
    expect(t.lease_timeouts).toBe(1)
    expect(t.lease_wait_ms).toBe(2000)
    expect(t.provider_calls).toBe(0) // never a provider call on the unavailable path
  })
})

describe('emitCoordinationMetrics — PII-free, allow-listed', () => {
  it('emits only allow-listed keys (drops smuggled fields)', () => {
    const seen: unknown[] = []
    __setCoordinationMetricsSink((e) => seen.push(e))
    emitCoordinationMetrics({
      event: 'ocr_coordination_metrics', product: 'ocr', route: 'r',
      dedup_mode: 'shadow', cache_mode: 'shadow', budget_mode: 'shadow',
      ...newCoordinationTally(),
      // @ts-expect-error — must not be emitted
      document_name: 'Олександр.png',
    })
    const e = seen[0] as Record<string, unknown>
    expect('document_name' in e).toBe(false)
    expect(JSON.stringify(e)).not.toContain('Олександр')
    expect(e.event).toBe('ocr_coordination_metrics')
  })
  it('never throws', () => {
    __setCoordinationMetricsSink(() => { throw new Error('boom') })
    expect(() => emitCoordinationMetrics({
      event: 'ocr_coordination_metrics', product: 'ocr', route: 'r',
      dedup_mode: 'off', cache_mode: 'off', budget_mode: 'off', ...newCoordinationTally(),
    })).not.toThrow()
  })
})
