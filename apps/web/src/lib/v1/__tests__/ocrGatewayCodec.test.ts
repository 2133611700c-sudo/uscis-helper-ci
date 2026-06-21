/**
 * ocrGateway × binding codec (P2 step B). Proves:
 *   - shadow emits an ocr_cache_parity verdict AND still returns the LIVE result
 *     (no substitution), first_seen → match across runs.
 *   - errors / empty are NEVER stored (so they can never be served later).
 *   - enforce serves a decoded cacheable hit; a binding/integrity failure is a
 *     cache MISS (re-reads provider, never serves corrupt).
 *   - parity events are PII-free (no field values).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  runOcrGateway,
  __resetGatewayState,
  __setOcrGatewaySink,
  __setOcrCacheParitySink,
  type OcrGatewayEvent,
  type OcrCacheParityEvent,
} from '../ocrGateway'
import { InMemoryOcrCacheStore } from '../ocrCacheStoreEncrypted'
import { encodeOcrResult, type OcrCodecMeta } from '../ocrResponseCodec'
import type { OcrCacheKeyParts } from '../ocrCache'
import type { OcrResult, OcrProviderErrorResult } from '../../ocr/types'

const KEY = Buffer.from('a'.repeat(64), 'hex')
const FILE_SHA = 'b'.repeat(64)
const CACHE_KEY = `${FILE_SHA}:google_vision:v1:p1:pre1`

const keyParts: OcrCacheKeyParts = {
  fileSha256: FILE_SHA,
  provider: 'google_vision',
  modelVersion: 'v1',
  promptVersion: 'p1',
  preprocessingVersion: 'pre1',
}
const META: OcrCodecMeta = { provider: 'google_vision', model: 'v1', prompt_version: 'p1', preproc_version: 'pre1' }

const bindingCodec = { mode: 'ocr_result' as const }

function goodResult(text = 'Іван Петренко 1990-01-01'): OcrResult {
  return {
    provider: 'google_vision',
    raw_text: text,
    pages: [{ page: 1, width: 1000, height: 700, lines: [], words: [] }],
    lines: [],
    words: [{ id: 'w_0001', text: 'Іван', page: 1, bbox: { x: 0, y: 0, width: 0.2, height: 0.1 }, source: 'google_vision' }],
    processing_ms: 10,
    warnings: [],
    created_at: '2026-06-14T00:00:00.000Z',
  }
}
const rateLimited: OcrProviderErrorResult = {
  provider_error: true,
  error: { ok: false, error_code: 'OCR_RATE_LIMITED', retryable: true, message: 'busy', detail: 'http_429_rate' },
}

let gwEvents: OcrGatewayEvent[] = []
let parityEvents: OcrCacheParityEvent[] = []
beforeEach(() => {
  __resetGatewayState()
  gwEvents = []
  parityEvents = []
  __setOcrGatewaySink((e) => gwEvents.push(e))
  __setOcrCacheParitySink((e) => parityEvents.push(e))
})
afterEach(() => {
  __setOcrGatewaySink(null)
  __setOcrCacheParitySink(null)
  __resetGatewayState()
})

describe('shadow — emits parity + still returns LIVE (no substitution)', () => {
  const env = { OCR_CACHE_MODE: 'shadow' }

  it('first_seen then match across two runs; both return the LIVE value', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }

    const first = await runOcrGateway(opts, async () => goodResult())
    expect(first).toEqual(goodResult()) // LIVE returned
    expect(parityEvents.map((e) => e.parity)).toContain('first_seen')

    // a DIFFERENT cached value would still be returned LIVE — prove no substitution.
    const second = await runOcrGateway(opts, async () => goodResult('LIVE-SECOND-READ'))
    expect(second.raw_text).toBe('LIVE-SECOND-READ') // shadow does NOT substitute
    const last = parityEvents[parityEvents.length - 1]
    expect(last.hit).toBe(true)
    expect(last.parity).toBe('mismatch') // first stored read differs from this live read
  })

  it('match when live equals the prior stored shadow read', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }
    await runOcrGateway(opts, async () => goodResult())
    await runOcrGateway(opts, async () => goodResult())
    expect(parityEvents[parityEvents.length - 1].parity).toBe('match')
  })

  it('NEVER stores a provider error (429) — so it can never be served as success', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }
    const res = await runOcrGateway(opts, async () => rateLimited)
    expect(res).toBe(rateLimited) // error surfaced verbatim
    expect(await store.get(CACHE_KEY)).toBeNull() // nothing stored
    // a later successful read sees first_seen (the error did NOT seed the cache)
    await runOcrGateway(opts, async () => goodResult())
    expect(parityEvents.map((e) => e.parity)).toContain('first_seen')
  })

  it('NEVER stores an empty result', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const empty: OcrResult = { provider: 'google_vision', raw_text: '', pages: [], lines: [], words: [], processing_ms: 1, warnings: [], created_at: 'x' }
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }
    await runOcrGateway(opts, async () => empty)
    expect(await store.get(CACHE_KEY)).toBeNull()
    expect(parityEvents).toHaveLength(0) // not cacheable → no parity emitted
  })

  it('parity events are PII-free (no field values)', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }
    await runOcrGateway(opts, async () => goodResult())
    await runOcrGateway(opts, async () => goodResult())
    const blob = JSON.stringify(parityEvents)
    expect(blob).not.toContain('Іван')
    expect(blob).not.toContain('Петренко')
    expect(blob).not.toContain('1990')
    for (const e of parityEvents) expect(e.key_sha).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('enforce — serves decoded cacheable hits; fail-closed on corrupt/mismatch', () => {
  const env = { OCR_CACHE_MODE: 'enforce' }

  it('miss stores cacheable, hit serves DECODED value with NO provider call', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    let calls = 0
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }
    const first = await runOcrGateway(opts, async () => { calls++; return goodResult() })
    expect(first).toEqual(goodResult())
    const second = await runOcrGateway(opts, async () => { calls++; return goodResult('SHOULD-NOT-RUN') })
    expect(second).toEqual(goodResult()) // decoded from cache
    expect(calls).toBe(1)
    expect(gwEvents.map((e) => e.outcome)).toContain('cache_hit')
  })

  it('a provider error on miss is NOT stored (no poisoned cache)', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }
    await runOcrGateway(opts, async () => rateLimited)
    expect(await store.get(CACHE_KEY)).toBeNull()
  })

  it('binding-mismatched cached entry → cache MISS (re-reads, never serves corrupt)', async () => {
    const store = new InMemoryOcrCacheStore(KEY)
    // seed a record bound to a DIFFERENT model so decode fails closed.
    const wrong = encodeOcrResult(goodResult('STALE'), { ...META, model: 'OLD' })
    await store.putIfAbsent({ key: CACHE_KEY, rawResponse: wrong, createdAt: '2026-06-14T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' })
    let calls = 0
    const opts = { keyParts, provider: 'google_vision', route: 'r', estCostUsdMicros: 1500, store, codec: bindingCodec, env }
    const res = await runOcrGateway(opts, async () => { calls++; return goodResult('FRESH') })
    expect(res.raw_text).toBe('FRESH') // did NOT serve the stale/mismatched value
    expect(calls).toBe(1)
    expect(gwEvents.map((e) => e.outcome)).toContain('cache_miss')
  })
})
