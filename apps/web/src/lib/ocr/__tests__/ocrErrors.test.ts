/**
 * ocrErrors.test.ts — honest OCR degradation (P1, 2026-06-14).
 *
 * Guards the typed-error classifier that replaces the old "mask a provider 429
 * as HTTP 200 + empty fields" behaviour. Each provider failure mode must map to
 * the correct typed class, HTTP status, and retryability.
 */
import { describe, it, expect } from 'vitest'
import {
  classifyProviderError,
  httpStatusForOcrError,
  isRetryableOcrError,
  parseRetryAfter,
  extractGoogleRpcStatus,
} from '../ocrErrors'

describe('classifyProviderError', () => {
  it('HTTP 429 with RATE_LIMIT_EXCEEDED → OCR_RATE_LIMITED, retryable, Retry-After surfaced', () => {
    const err = classifyProviderError(
      429,
      { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RATE_LIMIT_EXCEEDED' }] },
      { retryAfterHeader: '30' },
    )
    expect(err.error_code).toBe('OCR_RATE_LIMITED')
    expect(err.retryable).toBe(true)
    expect(err.retry_after_seconds).toBe(30)
    expect(httpStatusForOcrError(err.error_code)).toBe(429)
    // CRITICAL: this is NOT a success — ok is literal false.
    expect(err.ok).toBe(false)
  })

  it('plain HTTP 429 (no details) defaults to OCR_RATE_LIMITED (retryable)', () => {
    const err = classifyProviderError(429)
    expect(err.error_code).toBe('OCR_RATE_LIMITED')
    expect(err.retryable).toBe(true)
  })

  it('hard quota RESOURCE_EXHAUSTED (no rate reason) → OCR_QUOTA_EXHAUSTED, NOT retryable', () => {
    const err = classifyProviderError(
      429,
      { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RESOURCE_EXHAUSTED' }] },
    )
    expect(err.error_code).toBe('OCR_QUOTA_EXHAUSTED')
    expect(err.retryable).toBe(false)
    expect(isRetryableOcrError(err.error_code)).toBe(false)
  })

  it('403 BILLING_DISABLED → OCR_BILLING_DISABLED, NOT retryable', () => {
    const err = classifyProviderError(
      403,
      { code: 403, status: 'PERMISSION_DENIED', details: [{ reason: 'BILLING_DISABLED' }] },
    )
    expect(err.error_code).toBe('OCR_BILLING_DISABLED')
    expect(err.retryable).toBe(false)
  })

  it('5xx → OCR_PROVIDER_UNAVAILABLE, retryable', () => {
    for (const code of [500, 502, 503, 504]) {
      const err = classifyProviderError(code)
      expect(err.error_code).toBe('OCR_PROVIDER_UNAVAILABLE')
      expect(err.retryable).toBe(true)
      expect(httpStatusForOcrError(err.error_code)).toBe(503)
    }
  })

  it('timeout → OCR_PROVIDER_UNAVAILABLE, retryable', () => {
    const err = classifyProviderError(0, undefined, { timeout: true })
    expect(err.error_code).toBe('OCR_PROVIDER_UNAVAILABLE')
    expect(err.retryable).toBe(true)
    expect(err.detail).toBe('timeout')
  })

  it('network error (status 0, no timeout) → OCR_PROVIDER_UNAVAILABLE', () => {
    const err = classifyProviderError(0)
    expect(err.error_code).toBe('OCR_PROVIDER_UNAVAILABLE')
  })

  it('budget kill-switch → OCR_BUDGET_EXCEEDED, NOT retryable (highest precedence)', () => {
    // Even with a retryable-looking 429, our budget switch wins.
    const err = classifyProviderError(429, { details: [{ reason: 'RATE_LIMIT_EXCEEDED' }] }, { budgetExceeded: true })
    expect(err.error_code).toBe('OCR_BUDGET_EXCEEDED')
    expect(err.retryable).toBe(false)
  })

  it('unexpected 4xx / malformed → OCR_INVALID_RESPONSE, NOT retryable, NOT a success', () => {
    const err = classifyProviderError(418)
    expect(err.error_code).toBe('OCR_INVALID_RESPONSE')
    expect(err.retryable).toBe(false)
    expect(err.ok).toBe(false)
  })

  it('inline RPC RESOURCE_EXHAUSTED message (httpStatus 0) → OCR_QUOTA_EXHAUSTED', () => {
    // Google sometimes returns 200 + responses[0].error with an RPC code; we pass
    // httpStatus 0 and route by the message keyword.
    const err = classifyProviderError(0, { code: 8, message: 'Resource has been exhausted (RESOURCE_EXHAUSTED).' }, { marker: 'Resource has been exhausted (RESOURCE_EXHAUSTED).' })
    expect(err.error_code).toBe('OCR_QUOTA_EXHAUSTED')
  })

  it('retry_after is NOT attached to a non-retryable class', () => {
    const err = classifyProviderError(403, { details: [{ reason: 'BILLING_DISABLED' }] }, { retryAfterHeader: '60' })
    expect(err.retry_after_seconds).toBeUndefined()
  })
})

describe('parseRetryAfter', () => {
  it('parses integer seconds', () => {
    expect(parseRetryAfter('45')).toBe(45)
  })
  it('caps absurd values to 300s', () => {
    expect(parseRetryAfter('99999')).toBe(300)
  })
  it('parses an HTTP-date into a positive delta', () => {
    const future = new Date(Date.now() + 20_000).toUTCString()
    const secs = parseRetryAfter(future)
    expect(secs).toBeGreaterThan(0)
    expect(secs).toBeLessThanOrEqual(21)
  })
  it('returns undefined for missing/garbage', () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})

describe('extractGoogleRpcStatus', () => {
  it('pulls the error envelope', () => {
    const s = extractGoogleRpcStatus({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } })
    expect(s?.code).toBe(429)
  })
  it('returns undefined for a non-error body', () => {
    expect(extractGoogleRpcStatus({ foo: 1 })).toBeUndefined()
    expect(extractGoogleRpcStatus(null)).toBeUndefined()
  })
})
