/**
 * withOcrCostMetrics × gateway integration: supplying `meta.gateway` must be
 * byte-identical to today when the gateway is a pass-through (all flags OFF), and
 * must route the call through the gateway hook when opted in.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { withOcrCostMetrics, __setOcrCostMetricsSink } from '../ocrCostMetrics'

afterEach(() => __setOcrCostMetricsSink(null))

const FILE_SHA = 'b'.repeat(64)
const gateway = { fileSha256: FILE_SHA, promptVersion: 'p1', preprocVersion: 'pre1' }

describe('OFF-parity — gateway field present but flags off ⇒ wrapped===unwrapped', () => {
  it('returns the exact provider result; no gateway hook side effects', async () => {
    __setOcrCostMetricsSink(() => {}) // silence cost events
    const sentinel = { ok: true }
    const result = await withOcrCostMetrics(
      {
        product: 'ocr', route: 'r', provider: 'google_vision', model: 'v1',
        cacheKeySha: 'd'.repeat(64), est_cost_usd_micros: 1500,
        // default hook = live runOcrGateway with empty env → all flags OFF → pass-through
        gateway: { ...gateway, hook: undefined },
      },
      async () => sentinel,
    )
    expect(result).toBe(sentinel)
  })
})

describe('opt-in routing — the gateway hook receives the call + key parts', () => {
  it('call is routed through the injected hook', async () => {
    __setOcrCostMetricsSink(() => {})
    let seen: { provider: string; cacheKeySha: string } | null = null
    const result = await withOcrCostMetrics(
      {
        product: 'ocr', route: 'r', provider: 'google_vision', model: 'v1',
        cacheKeySha: 'e'.repeat(64), est_cost_usd_micros: 1500,
        gateway: {
          ...gateway,
          hook: (gw, call) => { seen = { provider: gw.provider, cacheKeySha: gw.cacheKeySha }; return call() },
        },
      },
      async () => 'OK',
    )
    expect(result).toBe('OK')
    expect(seen).toEqual({ provider: 'google_vision', cacheKeySha: 'e'.repeat(64) })
  })
})

describe('no gateway field ⇒ identical legacy behaviour', () => {
  it('still returns the provider result unchanged', async () => {
    __setOcrCostMetricsSink(() => {})
    const out = await withOcrCostMetrics(
      { product: 'ocr', route: 'r', provider: 'deepseek', model: 'deepseek-chat', cacheKeySha: 'f'.repeat(64), est_cost_usd_micros: 4000 },
      async () => 123,
    )
    expect(out).toBe(123)
  })
})
