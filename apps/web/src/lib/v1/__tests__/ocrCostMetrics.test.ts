import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  emitOcrCostEvent,
  emitOcrUploadCostSummary,
  withOcrCostMetrics,
  runWithUploadCostTally,
  computeCacheKeySha,
  sha256Hex,
  estCostUsdMicros,
  OCR_COST_TABLE_USD_MICROS,
  __setOcrCostMetricsSink,
  type OcrProviderCallEvent,
  type OcrUploadCostSummaryEvent,
} from '../ocrCostMetrics'

type AnyEvent = OcrProviderCallEvent | OcrUploadCostSummaryEvent

const SHA = 'a'.repeat(64)
const keyParts = {
  fileSha256: SHA,
  provider: 'gemini',
  model: 'gemini-3.1-pro-preview',
  promptVersion: 'v1',
  preprocVersion: 'v1',
}

describe('ocrCostMetrics — PII-free emitter', () => {
  let sink: AnyEvent[]
  beforeEach(() => {
    sink = []
    __setOcrCostMetricsSink((e) => sink.push(e))
  })
  afterEach(() => {
    __setOcrCostMetricsSink(null)
    vi.restoreAllMocks()
  })

  // ── PII allow-list ──────────────────────────────────────────────────────────
  const FORBIDDEN_KEYS = [
    'document', 'documentBytes', 'image', 'imageBuffer', 'bytes', 'raw_text',
    'rawText', 'ocr_text', 'text', 'value', 'final_value', 'source_value',
    'name', 'dob', 'address', 'document_number', 'fields', 'field', 'prompt',
    'raw_response', 'response', 'applicant',
  ]

  it('emits only the allowed PII-free dimensions (no document/field/value keys)', () => {
    // a careless caller tries to smuggle PII via extra keys; the allow-list drops them
    const smuggled = {
      event: 'ocr_provider_call',
      product: 'tps',
      route: '/api/tps/ocr/extract',
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      est_cost_usd_micros: 2000,
      cache_key_sha: 'deadbeef',
      duration_ms: 123,
      status: 'ok',
      cached: false,
      source_value: 'SHEVCHENKO TARAS',
      raw_text: 'Цей документ',
    } as unknown as OcrProviderCallEvent
    emitOcrCostEvent(smuggled)
    expect(sink).toHaveLength(1)
    const e = sink[0] as Record<string, unknown>
    const keys = Object.keys(e)
    for (const f of FORBIDDEN_KEYS) expect(keys).not.toContain(f)
    expect(keys.sort()).toEqual([
      'cache_key_sha', 'cached', 'duration_ms', 'est_cost_usd_micros',
      'event', 'model', 'product', 'provider', 'route', 'status',
    ])
    // the smuggled PII never made it through
    expect(JSON.stringify(e)).not.toContain('SHEVCHENKO')
    expect(JSON.stringify(e)).not.toContain('Цей документ')
  })

  it('summary event carries only counts + technical dims', () => {
    emitOcrUploadCostSummary({
      event: 'ocr_upload_cost_summary',
      product: 'tps',
      route: '/api/tps/ocr/extract',
      total_calls: 3,
      total_est_cost_micros: 7500,
      applicant: 'Taras',
    } as unknown as OcrUploadCostSummaryEvent)
    const e = sink[0] as Record<string, unknown>
    expect(Object.keys(e).sort()).toEqual([
      'event', 'product', 'route', 'total_calls', 'total_est_cost_micros',
    ])
    expect(JSON.stringify(e)).not.toContain('Taras')
  })

  it('cached is always false in 7-A (no cache substitution)', () => {
    // even if a caller forces cached:true it is overridden to false
    emitOcrCostEvent({
      event: 'ocr_provider_call', product: 'tps', route: 'r', provider: 'gemini',
      model: 'm', est_cost_usd_micros: 1, cache_key_sha: 'x', duration_ms: 1,
      status: 'ok', cached: true,
    })
    expect((sink[0] as OcrProviderCallEvent).cached).toBe(false)
  })

  // ── Deterministic shadow cache key ──────────────────────────────────────────
  it('cache_key_sha is deterministic for the same inputs', () => {
    expect(computeCacheKeySha(keyParts)).toBe(computeCacheKeySha(keyParts))
  })

  it('cache_key_sha differs when ANY of file_sha/provider/model/prompt/preproc changes', () => {
    const base = computeCacheKeySha(keyParts)
    expect(computeCacheKeySha({ ...keyParts, fileSha256: 'b'.repeat(64) })).not.toBe(base)
    expect(computeCacheKeySha({ ...keyParts, provider: 'deepseek' })).not.toBe(base)
    expect(computeCacheKeySha({ ...keyParts, model: 'gemini-3.5-flash' })).not.toBe(base)
    expect(computeCacheKeySha({ ...keyParts, promptVersion: 'v2' })).not.toBe(base)
    expect(computeCacheKeySha({ ...keyParts, preprocVersion: 'v2' })).not.toBe(base)
  })

  it('cache_key_sha is a 64-hex sha256 (document sha never appears cleartext)', () => {
    const h = computeCacheKeySha(keyParts)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(SHA) // the raw file sha is hashed away
  })

  it('sha256Hex is stable and hashes both Buffer and string the same way', () => {
    expect(sha256Hex(Buffer.from('hello'))).toBe(sha256Hex('hello'))
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'))
  })

  // ── Cost table ──────────────────────────────────────────────────────────────
  it('cost table maps providers to public-list-price micros; deepseek-reasoner > chat', () => {
    expect(estCostUsdMicros('google_vision')).toBe(OCR_COST_TABLE_USD_MICROS.google_vision)
    expect(estCostUsdMicros('deepseek', 'deepseek-chat')).toBe(OCR_COST_TABLE_USD_MICROS.deepseek_chat)
    expect(estCostUsdMicros('deepseek', 'deepseek-reasoner'))
      .toBe(OCR_COST_TABLE_USD_MICROS.deepseek_reasoner)
    expect(estCostUsdMicros('deepseek', 'deepseek-reasoner'))
      .toBeGreaterThan(estCostUsdMicros('deepseek', 'deepseek-chat'))
    expect(estCostUsdMicros('unknown_provider')).toBe(0) // unknown still observed, 0 cost
  })

  // ── Non-invasive wrapper: result byte-identical ─────────────────────────────
  it('withOcrCostMetrics returns the SAME value the unwrapped call returns', async () => {
    const payload = { a: 1, b: 'x', nested: { ok: true } }
    const unwrapped = await Promise.resolve(payload)
    const wrapped = await withOcrCostMetrics(
      { product: 'tps', route: 'r', provider: 'gemini', model: 'm', cacheKeySha: 'k', est_cost_usd_micros: 2000 },
      () => Promise.resolve(payload),
    )
    // identity preserved — the wrapper never reads, copies, or mutates the result
    expect(wrapped).toBe(unwrapped)
    expect(wrapped).toEqual(payload)
  })

  it('wrapper emits status=ok after success', async () => {
    await withOcrCostMetrics(
      { product: 'tps', route: 'r', provider: 'gemini', model: 'm', cacheKeySha: 'k', est_cost_usd_micros: 2000 },
      () => Promise.resolve('ok'),
    )
    const e = sink.find((x) => x.event === 'ocr_provider_call') as OcrProviderCallEvent
    expect(e.status).toBe('ok')
    expect(e.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('error path emits status=error and RE-THROWS the original error (control flow preserved)', async () => {
    const boom = new Error('provider blew up')
    await expect(
      withOcrCostMetrics(
        { product: 'tps', route: 'r', provider: 'deepseek', model: 'deepseek-chat', cacheKeySha: 'k', est_cost_usd_micros: 4000 },
        () => Promise.reject(boom),
      ),
    ).rejects.toBe(boom) // same error object — caller's try/catch behaves identically
    const e = sink.find((x) => x.event === 'ocr_provider_call') as OcrProviderCallEvent
    expect(e.status).toBe('error')
  })

  it('emitter NEVER throws even if console.info throws (observability cannot break OCR)', () => {
    __setOcrCostMetricsSink(null)
    const spy = vi.spyOn(console, 'info').mockImplementation(() => { throw new Error('log down') })
    expect(() =>
      emitOcrCostEvent({
        event: 'ocr_provider_call', product: 'p', route: 'r', provider: 'gemini',
        model: 'm', est_cost_usd_micros: 1, cache_key_sha: 'k', duration_ms: 1,
        status: 'ok', cached: false,
      }),
    ).not.toThrow()
    spy.mockRestore()
  })

  // ── Per-upload roll-up (the "up to N paid calls/upload" measurement) ─────────
  it('runWithUploadCostTally rolls up every provider call into one summary', async () => {
    const result = await runWithUploadCostTally(
      { product: 'tps', route: '/api/tps/ocr/extract' },
      async () => {
        // simulate TPS worst case: Vision + DocAI + DeepSeek crossref = 3 paid calls
        await withOcrCostMetrics(
          { product: 'tps', route: 'provider:google_vision', provider: 'google_vision', model: 'document_text_detection', cacheKeySha: 'k1', est_cost_usd_micros: estCostUsdMicros('google_vision') },
          () => Promise.resolve('v'),
        )
        await withOcrCostMetrics(
          { product: 'tps', route: 'provider:google_docai', provider: 'google_docai', model: 'p', cacheKeySha: 'k2', est_cost_usd_micros: estCostUsdMicros('google_docai') },
          () => Promise.resolve('d'),
        )
        await withOcrCostMetrics(
          { product: 'tps', route: 'provider:deepseek_chat', provider: 'deepseek', model: 'deepseek-chat', cacheKeySha: 'k3', est_cost_usd_micros: estCostUsdMicros('deepseek', 'deepseek-chat') },
          () => Promise.resolve('s'),
        )
        return 'done'
      },
    )
    expect(result).toBe('done')
    const summary = sink.find((x) => x.event === 'ocr_upload_cost_summary') as OcrUploadCostSummaryEvent
    expect(summary.total_calls).toBe(3) // confirms "up to 3 paid calls/upload" is measurable
    expect(summary.total_est_cost_micros).toBe(1500 + 1500 + 4000)
  })

  it('summary is emitted even if the handler throws (failed upload still counted)', async () => {
    await expect(
      runWithUploadCostTally({ product: 'ead', route: '/api/ead/ocr/extract' }, async () => {
        await withOcrCostMetrics(
          { product: 'ead', route: 'provider:gemini', provider: 'gemini', model: 'm', cacheKeySha: 'k', est_cost_usd_micros: 2000 },
          () => Promise.resolve('x'),
        )
        throw new Error('handler failed')
      }),
    ).rejects.toThrow('handler failed')
    const summary = sink.find((x) => x.event === 'ocr_upload_cost_summary') as OcrUploadCostSummaryEvent
    expect(summary.total_calls).toBe(1)
  })

  it('concurrent uploads keep independent tallies (no cross-request bleed)', async () => {
    const summaries: OcrUploadCostSummaryEvent[] = []
    __setOcrCostMetricsSink((e) => { if (e.event === 'ocr_upload_cost_summary') summaries.push(e) })
    const a = runWithUploadCostTally({ product: 'tps', route: 'A' }, async () => {
      await withOcrCostMetrics({ product: 'tps', route: 'p', provider: 'gemini', model: 'm', cacheKeySha: 'k', est_cost_usd_micros: 2000 }, () => new Promise((r) => setTimeout(() => r('a'), 5)))
    })
    const b = runWithUploadCostTally({ product: 'ead', route: 'B' }, async () => {
      await withOcrCostMetrics({ product: 'ead', route: 'p', provider: 'gemini', model: 'm', cacheKeySha: 'k', est_cost_usd_micros: 2000 }, () => Promise.resolve('b'))
      await withOcrCostMetrics({ product: 'ead', route: 'p', provider: 'gemini', model: 'm', cacheKeySha: 'k', est_cost_usd_micros: 2000 }, () => Promise.resolve('b2'))
    })
    await Promise.all([a, b])
    const byRoute = Object.fromEntries(summaries.map((s) => [s.route, s.total_calls]))
    expect(byRoute['A']).toBe(1)
    expect(byRoute['B']).toBe(2)
  })
})
