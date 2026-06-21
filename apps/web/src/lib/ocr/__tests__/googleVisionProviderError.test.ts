/**
 * googleVisionProviderError.test.ts — honest OCR degradation (P1, 2026-06-14).
 *
 * THE BUG this guards: the google-vision provider used to flatten EVERY failure
 * (429 / 5xx / 403 billing / timeout / inline error) into an empty OcrResult
 * (raw_text='', words=[]). The route then returned HTTP 200 + fields:[] and the
 * client treated a rate-limit as a successful empty read.
 *
 * Now the provider returns a typed OcrProviderErrorResult so the route can fail
 * closed. We mock credentials (API-key path → no GoogleAuth) + global fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// API-key auth path avoids the GoogleAuth token round-trip entirely.
vi.mock('@/lib/canonical/vision/visionCredentials', () => ({
  loadVisionCredentials: () => ({
    credentials: null,
    apiKey: 'test-key',
    status: { present: true, source: 'GOOGLE_CLOUD_VISION_API_KEY', project_id: 'p', client_email_masked: null, error: null, auth_method: 'api_key' },
  }),
}))

import { googleVisionProvider } from '../providers/google-vision'
import { isProviderError, isBlocked, type OcrResult } from '../types'

const buf = Buffer.from('fake-image-bytes')

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  global.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('googleVisionProvider — typed provider errors (no masked empty success)', () => {
  const orig = global.fetch
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => { global.fetch = orig })

  it('HTTP 429 RATE_LIMIT_EXCEEDED → OCR_RATE_LIMITED (NOT an empty OcrResult)', async () => {
    mockFetch(
      429,
      { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RATE_LIMIT_EXCEEDED' }] } },
      { 'retry-after': '15' },
    )
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    expect(isProviderError(r)).toBe(true)
    expect(isBlocked(r)).toBe(false)
    if (isProviderError(r)) {
      expect(r.error.error_code).toBe('OCR_RATE_LIMITED')
      expect(r.error.retryable).toBe(true)
      expect(r.error.retry_after_seconds).toBe(15)
    }
    // It must NOT look like a successful read.
    expect((r as Partial<OcrResult>).raw_text).toBeUndefined()
  })

  it('HTTP 503 → OCR_PROVIDER_UNAVAILABLE (retryable)', async () => {
    mockFetch(503, { error: { code: 503, message: 'backend unavailable' } })
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    expect(isProviderError(r)).toBe(true)
    if (isProviderError(r)) expect(r.error.error_code).toBe('OCR_PROVIDER_UNAVAILABLE')
  })

  it('HTTP 403 BILLING_DISABLED → OCR_BILLING_DISABLED (not retryable)', async () => {
    mockFetch(403, { error: { code: 403, status: 'PERMISSION_DENIED', details: [{ reason: 'BILLING_DISABLED' }] } })
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    expect(isProviderError(r)).toBe(true)
    if (isProviderError(r)) {
      expect(r.error.error_code).toBe('OCR_BILLING_DISABLED')
      expect(r.error.retryable).toBe(false)
    }
  })

  it('hard quota RESOURCE_EXHAUSTED (HTTP 429, no rate reason) → OCR_QUOTA_EXHAUSTED', async () => {
    mockFetch(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RESOURCE_EXHAUSTED' }] } })
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    expect(isProviderError(r)).toBe(true)
    if (isProviderError(r)) expect(r.error.error_code).toBe('OCR_QUOTA_EXHAUSTED')
  })

  it('fetch timeout → OCR_PROVIDER_UNAVAILABLE (retryable)', async () => {
    global.fetch = vi.fn(async () => {
      const e = new Error('The operation was aborted'); e.name = 'TimeoutError'; throw e
    }) as unknown as typeof fetch
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    expect(isProviderError(r)).toBe(true)
    if (isProviderError(r)) {
      expect(r.error.error_code).toBe('OCR_PROVIDER_UNAVAILABLE')
      expect(r.error.retryable).toBe(true)
    }
  })

  it('inline 200 + responses[0].error (RESOURCE_EXHAUSTED) → typed error, NOT a success', async () => {
    mockFetch(200, { responses: [{ error: { code: 8, message: 'Resource exhausted (RESOURCE_EXHAUSTED)' } }] })
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    expect(isProviderError(r)).toBe(true)
    if (isProviderError(r)) expect(r.error.error_code).toBe('OCR_QUOTA_EXHAUSTED')
  })

  it('genuine 200 with text → a real OcrResult (success path preserved)', async () => {
    mockFetch(200, {
      responses: [{
        fullTextAnnotation: {
          text: 'HELLO',
          pages: [{ width: 100, height: 100, blocks: [{ paragraphs: [{ words: [{ symbols: [{ text: 'HELLO' }] }] }] }] }],
        },
      }],
    })
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    expect(isProviderError(r)).toBe(false)
    expect(isBlocked(r)).toBe(false)
    if (!isProviderError(r) && !isBlocked(r)) {
      expect(r.raw_text).toBe('HELLO')
      expect(r.words.length).toBe(1)
    }
  })

  it('genuine 200 with NO text → empty OcrResult (rare honest empty read, NOT an error)', async () => {
    mockFetch(200, { responses: [{}] })
    const r = await googleVisionProvider.extractText({ imageBuffer: buf, mimeType: 'image/jpeg' })
    // No fullTextAnnotation but no error envelope → empty-but-successful read.
    expect(isProviderError(r)).toBe(false)
    if (!isProviderError(r) && !isBlocked(r)) expect(r.raw_text).toBe('')
  })
})
