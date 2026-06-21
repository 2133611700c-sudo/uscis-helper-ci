/**
 * retryProvider.test.ts — honest OCR degradation (P1, 2026-06-14).
 *
 * The bounded retry helper retries ONLY transient classes, honors Retry-After,
 * caps total attempts/wait, and NEVER retries hard-quota / billing / invalid.
 */
import { describe, it, expect, vi } from 'vitest'
import { retryOcrProvider, computeBackoffMs } from '../retryProvider'
import type { OcrProviderError } from '../ocrErrors'

const noopSleep = () => Promise.resolve()
const noJitter = () => 0

function err(code: OcrProviderError['error_code'], retryable: boolean, retryAfter?: number): OcrProviderError {
  return { ok: false, error_code: code, retryable, ...(retryAfter !== undefined ? { retry_after_seconds: retryAfter } : {}), message: 'x' }
}

describe('retryOcrProvider', () => {
  it('returns success immediately on a first-attempt success', async () => {
    const attempt = vi.fn(async () => ({ ok: true as const, value: 'fields' }))
    const out = await retryOcrProvider(attempt, { sleep: noopSleep, random: noJitter })
    expect(out.ok).toBe(true)
    expect(out.attempts).toBe(1)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('retries a transient OCR_RATE_LIMITED then succeeds', async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce(err('OCR_RATE_LIMITED', true, 0))
      .mockResolvedValueOnce({ ok: true, value: 'ok' })
    const out = await retryOcrProvider(attempt, { sleep: noopSleep, random: noJitter })
    expect(out.ok).toBe(true)
    expect(out.attempts).toBe(2)
  })

  it('caps at maxAttempts and returns the typed transient error (no infinite retry)', async () => {
    const attempt = vi.fn(async () => err('OCR_RATE_LIMITED', true, 0))
    const out = await retryOcrProvider(attempt, { maxAttempts: 3, sleep: noopSleep, random: noJitter })
    expect(out.ok).toBe(false)
    expect(attempt).toHaveBeenCalledTimes(3)
    if (!out.ok) expect(out.error.error_code).toBe('OCR_RATE_LIMITED')
  })

  it('NEVER retries OCR_QUOTA_EXHAUSTED', async () => {
    const attempt = vi.fn(async () => err('OCR_QUOTA_EXHAUSTED', false))
    const out = await retryOcrProvider(attempt, { sleep: noopSleep })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(out.ok).toBe(false)
  })

  it('NEVER retries OCR_BILLING_DISABLED', async () => {
    const attempt = vi.fn(async () => err('OCR_BILLING_DISABLED', false))
    const out = await retryOcrProvider(attempt, { sleep: noopSleep })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('NEVER retries OCR_INVALID_RESPONSE', async () => {
    const attempt = vi.fn(async () => err('OCR_INVALID_RESPONSE', false))
    const out = await retryOcrProvider(attempt, { sleep: noopSleep })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('honors Retry-After when computing the next sleep', async () => {
    const sleeps: number[] = []
    const sleep = (ms: number) => { sleeps.push(ms); return Promise.resolve() }
    const attempt = vi
      .fn()
      .mockResolvedValueOnce(err('OCR_RATE_LIMITED', true, 2)) // Retry-After 2s
      .mockResolvedValueOnce({ ok: true, value: 'ok' })
    await retryOcrProvider(attempt, { sleep, random: noJitter, maxDelayMs: 10_000, totalBudgetMs: 10_000 })
    expect(sleeps[0]).toBe(2000)
  })

  it('stops before exceeding the total wait budget', async () => {
    // base 5000ms, attempt1 backoff = 5000, budget 4000 → no sleep allowed, returns after attempt 1.
    const attempt = vi.fn(async () => err('OCR_PROVIDER_UNAVAILABLE', true))
    const out = await retryOcrProvider(attempt, {
      sleep: noopSleep, random: noJitter, baseDelayMs: 5000, totalBudgetMs: 4000, maxAttempts: 5,
    })
    expect(out.ok).toBe(false)
    expect(attempt).toHaveBeenCalledTimes(1)
  })
})

describe('computeBackoffMs', () => {
  it('prefers Retry-After (capped to maxDelay)', () => {
    const ms = computeBackoffMs(1, { ok: false, error_code: 'OCR_RATE_LIMITED', retryable: true, retry_after_seconds: 99, message: 'x' }, { baseDelayMs: 400, maxDelayMs: 8000, random: () => 0 })
    expect(ms).toBe(8000)
  })
  it('exponential backoff grows with attempt', () => {
    const o = { baseDelayMs: 400, maxDelayMs: 100_000, random: () => 0 }
    const e: OcrProviderError = { ok: false, error_code: 'OCR_PROVIDER_UNAVAILABLE', retryable: true, message: 'x' }
    expect(computeBackoffMs(1, e, o)).toBe(400)
    expect(computeBackoffMs(2, e, o)).toBe(800)
    expect(computeBackoffMs(3, e, o)).toBe(1600)
  })
})
