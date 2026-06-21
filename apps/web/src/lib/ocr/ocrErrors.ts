/**
 * Typed OCR provider errors — honest degradation (P1, 2026-06-14)
 *
 * THE BUG this module exists to kill: a provider rate-limit / outage was being
 * masked as HTTP 200 + fields=[] + status="vision_failed:HTTP 429". The client
 * treated that as a SUCCESSFUL-but-empty read and advanced the user as if their
 * document had been processed. A provider failure must NOT look like a success.
 *
 * Root cause (primary-source, see docs/audit/VISION_429_DIAGNOSIS.md):
 *   The Vision service account lives on Google project gen-lang-client-0450386998
 *   (free AI Studio tier, low per-minute limits). Under load it returns HTTP 429
 *   RATE_QUOTA — TEMPORARY and intermittent, NOT a hard daily cap, NOT
 *   billing-disabled. A retry / honest "try again shortly" is the correct UX, NOT
 *   a silent empty success.
 *
 * This module classifies a provider failure into ONE typed class so the route
 * can fail CLOSED (honest non-2xx + typed body) and the retry helper can decide
 * what is retryable. NO PII, NO secrets, NO raw provider body is surfaced.
 */

/** The closed set of OCR provider error classes. */
export type OcrErrorCode =
  /** 429 RATE_QUOTA / RATE_LIMIT_EXCEEDED — temporary per-minute throttle. Retryable. */
  | 'OCR_RATE_LIMITED'
  /** Hard daily / lifetime quota (RESOURCE_EXHAUSTED, not rate). NOT retryable. */
  | 'OCR_QUOTA_EXHAUSTED'
  /** 5xx / network / timeout — provider is down. Retryable. */
  | 'OCR_PROVIDER_UNAVAILABLE'
  /** Our own budget kill-switch tripped. NOT retryable (would just burn more). */
  | 'OCR_BUDGET_EXCEEDED'
  /** 200 (or any) with no usable fields AND a provider error marker. NOT a success, NOT retryable here. */
  | 'OCR_INVALID_RESPONSE'
  /** 403 BILLING_DISABLED — account-level config problem. NOT retryable. */
  | 'OCR_BILLING_DISABLED'

/** Typed, PII-free description of a provider failure. */
export interface OcrProviderError {
  ok: false
  error_code: OcrErrorCode
  retryable: boolean
  /** Seconds to wait before retry, if the provider supplied Retry-After. */
  retry_after_seconds?: number
  /** Client-safe message. Never contains PII or secrets or raw provider text. */
  message: string
  /** PII-free diagnostic crumb (e.g. 'http_429', 'rpc_RESOURCE_EXHAUSTED', 'timeout'). */
  detail?: string
}

/** Map each code → HTTP status the route returns and a default client-safe message. */
const CODE_META: Record<OcrErrorCode, { http: number; retryable: boolean; message: string }> = {
  OCR_RATE_LIMITED: {
    http: 429,
    retryable: true,
    message: 'Recognition is temporarily busy. Please try again in a few seconds.',
  },
  OCR_QUOTA_EXHAUSTED: {
    http: 429,
    retryable: false,
    message: 'Recognition is temporarily unavailable. Please try again later.',
  },
  OCR_PROVIDER_UNAVAILABLE: {
    http: 503,
    retryable: true,
    message: 'Recognition is temporarily unavailable. Please try again shortly.',
  },
  OCR_BUDGET_EXCEEDED: {
    http: 503,
    retryable: false,
    message: 'Recognition is temporarily unavailable. Please try again later.',
  },
  OCR_INVALID_RESPONSE: {
    http: 502,
    retryable: false,
    message: 'Recognition could not be completed. Please try again shortly.',
  },
  OCR_BILLING_DISABLED: {
    http: 503,
    retryable: false,
    message: 'Recognition is temporarily unavailable. Please try again later.',
  },
}

/** HTTP status code the route should return for a given OCR error class. */
export function httpStatusForOcrError(code: OcrErrorCode): number {
  return CODE_META[code].http
}

/** Whether the retry helper may retry this class at all. */
export function isRetryableOcrError(code: OcrErrorCode): boolean {
  return CODE_META[code].retryable
}

/**
 * Parse the Retry-After header (seconds, or an HTTP-date) into seconds.
 * Returns undefined if absent/unparseable. Capped to a sane ceiling so a hostile
 * header can't make us sleep forever.
 */
export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined
  const trimmed = headerValue.trim()
  // Pure integer seconds form.
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10)
    return Number.isFinite(n) ? Math.min(n, 300) : undefined
  }
  // HTTP-date form.
  const when = Date.parse(trimmed)
  if (Number.isFinite(when)) {
    const secs = Math.ceil((when - Date.now()) / 1000)
    return secs > 0 ? Math.min(secs, 300) : 0
  }
  return undefined
}

/** A normalised view of a Google JSON error envelope (`{ error: { code, status, details } }`). */
interface GoogleRpcStatus {
  code?: number
  status?: string
  message?: string
  details?: Array<{ reason?: string; '@type'?: string; [k: string]: unknown }>
}

/** Extract a Google RPC status object from a parsed body if present. */
export function extractGoogleRpcStatus(body: unknown): GoogleRpcStatus | undefined {
  if (!body || typeof body !== 'object') return undefined
  const maybe = (body as { error?: unknown }).error
  if (maybe && typeof maybe === 'object') return maybe as GoogleRpcStatus
  return undefined
}

/**
 * Classify a provider failure into ONE typed OCR error.
 *
 * @param httpStatus      The HTTP status the provider returned (or 0 for a
 *                        network/timeout error with no response).
 * @param googleRpcStatus Optional parsed Google `error` envelope (code/status/details).
 * @param opts            Extra signals: Retry-After header, timeout flag, budget flag.
 *
 * Precedence (most specific first): budget kill-switch → billing disabled →
 * hard quota (RESOURCE_EXHAUSTED) → rate limit (429 / RATE_LIMIT_EXCEEDED) →
 * provider unavailable (5xx / timeout / network) → invalid response (fallback).
 */
export function classifyProviderError(
  httpStatus: number,
  googleRpcStatus?: GoogleRpcStatus | null,
  opts?: {
    retryAfterHeader?: string | null
    timeout?: boolean
    budgetExceeded?: boolean
    /** raw provider message/marker string for keyword sniffing (PII-free expected). */
    marker?: string | null
  },
): OcrProviderError {
  const retryAfter = parseRetryAfter(opts?.retryAfterHeader)
  const reason = (googleRpcStatus?.details ?? [])
    .map((d) => (d?.reason ?? '').toUpperCase())
    .find(Boolean)
  const rpcStatus = (googleRpcStatus?.status ?? '').toUpperCase()
  const marker = (opts?.marker ?? '').toUpperCase()
  const haystack = `${reason ?? ''} ${rpcStatus} ${marker}`

  const make = (code: OcrErrorCode, detail: string): OcrProviderError => {
    const meta = CODE_META[code]
    return {
      ok: false,
      error_code: code,
      retryable: meta.retryable,
      ...(meta.retryable && retryAfter !== undefined ? { retry_after_seconds: retryAfter } : {}),
      message: meta.message,
      detail,
    }
  }

  // 1) Our own budget kill-switch — highest precedence (don't even talk to provider).
  if (opts?.budgetExceeded) return make('OCR_BUDGET_EXCEEDED', 'budget_kill_switch')

  // 2) Billing disabled (403 + BILLING_DISABLED). Account-level, not retryable.
  if (httpStatus === 403 && /BILLING_DISABLED|BILLING_NOT_ACTIVE/.test(haystack)) {
    return make('OCR_BILLING_DISABLED', 'billing_disabled')
  }
  if (/BILLING_DISABLED|BILLING_NOT_ACTIVE/.test(haystack)) {
    return make('OCR_BILLING_DISABLED', 'billing_disabled')
  }

  // 3) Hard quota: RESOURCE_EXHAUSTED *without* a rate-limit reason → daily cap.
  //    Google sends 429 for BOTH rate limits and resource exhaustion; the
  //    details[].reason distinguishes them. RATE_LIMIT_EXCEEDED = transient,
  //    RESOURCE_EXHAUSTED / *_QUOTA = hard cap.
  const isRateReason = /RATE_LIMIT_EXCEEDED|RATE_QUOTA|USER_RATE_LIMIT/.test(haystack)
  const isHardQuota = /RESOURCE_EXHAUSTED|DAILY_LIMIT|QUOTA_EXCEEDED|QUOTA_EXHAUSTED/.test(haystack)
  if (isHardQuota && !isRateReason) {
    return make('OCR_QUOTA_EXHAUSTED', 'resource_exhausted')
  }

  // 4) Rate limited: HTTP 429 (default class) or an explicit rate reason.
  if (httpStatus === 429 || isRateReason) {
    return make('OCR_RATE_LIMITED', `http_${httpStatus || 'rpc'}_rate`)
  }

  // 5) Provider unavailable: timeout, network (status 0), or any 5xx.
  if (opts?.timeout) return make('OCR_PROVIDER_UNAVAILABLE', 'timeout')
  if (httpStatus === 0) return make('OCR_PROVIDER_UNAVAILABLE', 'network')
  if (httpStatus >= 500 && httpStatus <= 599) {
    return make('OCR_PROVIDER_UNAVAILABLE', `http_${httpStatus}`)
  }

  // 6) Anything else (malformed/empty 200 with an error marker, unexpected 4xx)
  //    → invalid response. NOT a success, NOT auto-retried.
  return make('OCR_INVALID_RESPONSE', `http_${httpStatus || 'unknown'}`)
}
