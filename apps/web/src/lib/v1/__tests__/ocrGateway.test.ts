/**
 * ocrGateway — cache substitution + in-flight dedup + budget kill-switch, all
 * flag-gated default OFF, with strict OFF-PARITY (all-off ⇒ byte-identical call).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  runOcrGateway,
  resolveGatewayFlags,
  allFlagsOff,
  OFF_FLAGS,
  OcrBudgetExceededError,
  __resetGatewayState,
  __inFlightSize,
  __setOcrGatewaySink,
  type OcrGatewayEvent,
} from '../ocrGateway'
import { InMemoryOcrCacheStore } from '../ocrCacheStoreEncrypted'
import type { OcrCacheKeyParts } from '../ocrCache'

const KEY = Buffer.from('a'.repeat(64), 'hex')
const FILE_SHA = 'b'.repeat(64)

const keyParts: OcrCacheKeyParts = {
  fileSha256: FILE_SHA,
  provider: 'google_vision',
  modelVersion: 'v1',
  promptVersion: 'p1',
  preprocessingVersion: 'pre1',
}

const stringCodec = {
  serialize: (v: string) => v,
  deserialize: (raw: unknown) => String(raw),
}

let events: OcrGatewayEvent[] = []
beforeEach(() => {
  __resetGatewayState()
  events = []
  __setOcrGatewaySink((e) => events.push(e))
})
afterEach(() => {
  __setOcrGatewaySink(null)
  __resetGatewayState()
})

describe('flag resolution — default OFF', () => {
  it('empty env ⇒ all flags off', () => {
    const f = resolveGatewayFlags({})
    expect(f).toEqual(OFF_FLAGS)
    expect(allFlagsOff(f)).toBe(true)
  })
  it('unrecognized values fall back to off (fail-safe)', () => {
    const f = resolveGatewayFlags({ OCR_CACHE_MODE: 'maybe', OCR_BUDGET_MODE: 'sometimes', OCR_DEDUP_ENABLED: 'yes' })
    expect(allFlagsOff(f)).toBe(true)
  })
})

describe('OFF-PARITY — all flags off ⇒ byte-identical pass-through', () => {
  it('returns the exact call result, no cache/dedup/budget, no events', async () => {
    const sentinel = { ok: true, n: 42 }
    let calls = 0
    const wrapped = await runOcrGateway(
      { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, env: {} },
      async () => { calls++; return sentinel },
    )
    const direct = await (async () => sentinel)()
    expect(wrapped).toBe(direct) // same reference — unwrapped===wrapped
    expect(calls).toBe(1)
    expect(events).toHaveLength(0) // no gateway telemetry on the off path
    expect(__inFlightSize()).toBe(0)
  })
})

describe('cache — enforce', () => {
  const env = { OCR_CACHE_MODE: 'enforce' }
  it('miss calls provider + stores; hit serves stored value with NO provider call', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    let calls = 0
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: stringCodec, env }

    const first = await runOcrGateway(opts, async () => { calls++; return 'RESULT-PII' })
    expect(first).toBe('RESULT-PII')
    expect(calls).toBe(1)

    const second = await runOcrGateway(opts, async () => { calls++; return 'SHOULD-NOT-RUN' })
    expect(second).toBe('RESULT-PII') // served from cache
    expect(calls).toBe(1) // provider NOT called again
    expect(events.map((e) => e.outcome)).toContain('cache_hit')
  })
})

describe('cache — shadow still calls provider (no substitution) + records hit/miss', () => {
  const env = { OCR_CACHE_MODE: 'shadow' }
  it('always calls provider; reports shadow_miss then shadow_hit', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    let calls = 0
    // pre-store a value so the 2nd lookup is a hit, but shadow must NOT substitute it.
    await store.putIfAbsent({ key: `${FILE_SHA}:google_vision:v1:p1:pre1`, rawResponse: 'CACHED', createdAt: new Date().toISOString() })
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: stringCodec, env }

    const res = await runOcrGateway(opts, async () => { calls++; return 'LIVE' })
    expect(res).toBe('LIVE') // shadow does NOT substitute the cached value
    expect(calls).toBe(1)
    expect(events.map((e) => e.outcome)).toContain('shadow_hit')
  })
})

describe('in-flight dedup — collapses N concurrent identical calls to 1', () => {
  const env = { OCR_DEDUP_ENABLED: '1' }
  it('one provider call for a burst of identical-key calls', async () => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, env }
    const make = () => runOcrGateway(opts, async () => { calls++; await gate; return 'X' })

    const burst = [make(), make(), make(), make(), make()]
    release()
    const results = await Promise.all(burst)

    expect(calls).toBe(1) // ONE provider call for 5 identical concurrent requests
    expect(results).toEqual(['X', 'X', 'X', 'X', 'X'])
    expect(__inFlightSize()).toBe(0) // cleaned up after settle
    expect(events.map((e) => e.outcome)).toContain('deduped')
  })

  it('different keys are NOT deduped', async () => {
    let calls = 0
    const env2 = { OCR_DEDUP_ENABLED: '1' }
    const a = runOcrGateway({ keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1, env: env2 }, async () => { calls++; return 'A' })
    const b = runOcrGateway({ keyParts: { ...keyParts, fileSha256: 'c'.repeat(64) }, provider: 'google_vision', route: 'r', estCostUsdMicros: 1, env: env2 }, async () => { calls++; return 'B' })
    await Promise.all([a, b])
    expect(calls).toBe(2)
  })
})

describe('budget kill-switch', () => {
  it('enforce blocks at cap with a typed budget_exceeded result', async () => {
    const env = { OCR_BUDGET_MODE: 'enforce', OCR_BUDGET_DAILY_USD: '0' } // manual kill-switch: cap 0
    await expect(
      runOcrGateway({ keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, env }, async () => 'X'),
    ).rejects.toBeInstanceOf(OcrBudgetExceededError)
    expect(events.map((e) => e.outcome)).toContain('budget_blocked')
  })

  it('enforce allows calls under the cap, blocks once exceeded', async () => {
    const env = { OCR_BUDGET_MODE: 'enforce', OCR_BUDGET_DAILY_USD: '0.003' } // 3000 micros
    let calls = 0
    const run = () => runOcrGateway({ keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, env }, async () => { calls++; return 'X' })
    await run() // 1500 ≤ 3000
    await run() // 3000 ≤ 3000
    await expect(run()).rejects.toBeInstanceOf(OcrBudgetExceededError) // 4500 > 3000
    expect(calls).toBe(2)
  })

  it('shadow never blocks (only counts)', async () => {
    const env = { OCR_BUDGET_MODE: 'shadow', OCR_BUDGET_DAILY_USD: '0' }
    let calls = 0
    for (let i = 0; i < 5; i++) {
      await runOcrGateway({ keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, env }, async () => { calls++; return 'X' })
    }
    expect(calls).toBe(5) // shadow never blocks even past a zero cap
  })
})

describe('PII safety — gateway events carry only technical dimensions + key hash', () => {
  it('no cleartext PII in any emitted event', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const env = { OCR_CACHE_MODE: 'enforce' }
    await runOcrGateway(
      { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: stringCodec, env },
      async () => 'Ivan Petrenko 1990-01-01',
    )
    const blob = JSON.stringify(events)
    expect(blob).not.toContain('Ivan')
    expect(blob).not.toContain('Petrenko')
    expect(blob).not.toContain('1990')
    // cache_key_sha present and is a 64-hex hash (no raw file sha / content)
    for (const e of events) expect(e.cache_key_sha).toMatch(/^[0-9a-f]{64}$/)
  })
})
