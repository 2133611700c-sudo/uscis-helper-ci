/**
 * Bounded retry helper for transient OCR provider failures (P1, 2026-06-14).
 *
 * Retries ONLY transient classes — OCR_RATE_LIMITED and OCR_PROVIDER_UNAVAILABLE —
 * and NEVER OCR_QUOTA_EXHAUSTED / OCR_BILLING_DISABLED / OCR_BUDGET_EXCEEDED /
 * OCR_INVALID_RESPONSE (retrying those just burns more quota or loops forever).
 *
 * Honors Retry-After when the provider supplies it, otherwise exponential
 * backoff + jitter. Total wait is CAPPED so there is no retry storm and the
 * request still fits the route's maxDuration budget.
 *
 * Idempotency note: this helper retries WITHIN a single server request, so it is
 * inherently idempotent (same image buffer, no client round-trip). A CLIENT
 * reload that re-POSTs the whole document is a SEPARATE re-run — the caller
 * should send an `Idempotency-Key` header (see vision-extract route) so the
 * server can dedupe a reload against an in-flight/just-finished extract. This
 * helper does not own that key; it only bounds the in-request retries.
 */
import { isRetryableOcrError, type OcrErrorCode, type OcrProviderError } from './ocrErrors'

export interface RetryOptions {
  /** Max total attempts (initial + retries). Default 3. */
  maxAttempts?: number
  /** Base backoff in ms for attempt n: base * 2^(n-1). Default 400ms. */
  baseDelayMs?: number
  /** Hard ceiling on a single sleep. Default 8000ms. */
  maxDelayMs?: number
  /** Hard ceiling on cumulative sleeping across all retries. Default 12000ms. */
  totalBudgetMs?: number
  /** Injectable sleep (tests pass a no-op). Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Injectable jitter in [0,1) (tests pass () => 0). Default Math.random. */
  random?: () => number
}

/** Discriminated result: a success value, or a typed terminal provider error. */
export type RetryOutcome<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: OcrProviderError; attempts: number }

/**
 * The work fn returns either a success value or a typed OcrProviderError.
 * It is called up to maxAttempts times for transient errors only.
 */
export type OcrAttempt<T> = (attempt: number) => Promise<{ ok: true; value: T } | OcrProviderError>

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Decide the next sleep: prefer provider Retry-After, else exp backoff + jitter. */
export function computeBackoffMs(
  attempt: number,
  err: OcrProviderError,
  opts: Required<Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs'>> & { random: () => number },
): number {
  if (typeof err.retry_after_seconds === 'number' && err.retry_after_seconds >= 0) {
    return Math.min(err.retry_after_seconds * 1000, opts.maxDelayMs)
  }
  const exp = opts.baseDelayMs * Math.pow(2, attempt - 1)
  const jitter = exp * 0.25 * opts.random()
  return Math.min(exp + jitter, opts.maxDelayMs)
}

export async function retryOcrProvider<T>(
  attempt: OcrAttempt<T>,
  options: RetryOptions = {},
): Promise<RetryOutcome<T>> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const baseDelayMs = options.baseDelayMs ?? 400
  const maxDelayMs = options.maxDelayMs ?? 8_000
  const totalBudgetMs = options.totalBudgetMs ?? 12_000
  const sleep = options.sleep ?? defaultSleep
  const random = options.random ?? Math.random

  let spentMs = 0
  let lastError: OcrProviderError | null = null

  for (let n = 1; n <= maxAttempts; n++) {
    const r = await attempt(n)
    if (r.ok) return { ok: true, value: r.value, attempts: n }

    lastError = r
    // Terminal class → stop immediately, never retry.
    if (!isRetryableOcrError(r.error_code as OcrErrorCode)) {
      return { ok: false, error: r, attempts: n }
    }
    // Last allowed attempt already used → return the typed error.
    if (n >= maxAttempts) return { ok: false, error: r, attempts: n }

    const delay = computeBackoffMs(n, r, { baseDelayMs, maxDelayMs, random })
    // Respect the total budget — if the next sleep would blow it, stop now.
    if (spentMs + delay > totalBudgetMs) return { ok: false, error: r, attempts: n }
    spentMs += delay
    await sleep(delay)
  }

  // Unreachable in practice (loop returns), but keep the type honest.
  return {
    ok: false,
    error: lastError ?? {
      ok: false,
      error_code: 'OCR_PROVIDER_UNAVAILABLE',
      retryable: true,
      message: 'Recognition is temporarily unavailable. Please try again shortly.',
      detail: 'no_attempt',
    },
    attempts: maxAttempts,
  }
}
