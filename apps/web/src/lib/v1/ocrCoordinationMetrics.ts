/**
 * ocrCoordinationMetrics — PII-free counters for the cross-instance OCR
 * coordination layer (cache + distributed lease + budget).
 *
 * Fixes the budget-accounting error the owner flagged: with N waiters and 1
 * winner, the estimated PROVIDER cost is ONE call, not N. We separate:
 *   - requested_calls   — how many callers asked (N)
 *   - provider_calls    — how many actually hit the provider (1, the winner)
 *   - dedup_collapses   — callers that avoided a call via the lease/cache (N-1)
 *   - avoided_cost      — est cost of the calls we did NOT make
 *   - actual_cost       — est cost of the calls we DID make
 * plus cache_hits/cache_misses, rate_limit_events, lease_wait_ms, lease_timeouts.
 *
 * STRICTLY OBSERVABILITY: never blocks, never substitutes, never throws into the
 * OCR path. PII-free by construction (allow-listed keys; only a key hash + ints).
 */
import type { CoordinateResult } from './ocrRequestLease'

export type CoordinationCounters = {
  requested_calls: number
  provider_calls: number
  dedup_collapses: number
  cache_hits: number
  cache_misses: number
  avoided_cost_micros: number
  actual_cost_micros: number
  rate_limit_events: number
  lease_wait_ms: number
  lease_timeouts: number
}

export function newCoordinationTally(): CoordinationCounters {
  return {
    requested_calls: 0, provider_calls: 0, dedup_collapses: 0,
    cache_hits: 0, cache_misses: 0,
    avoided_cost_micros: 0, actual_cost_micros: 0,
    rate_limit_events: 0, lease_wait_ms: 0, lease_timeouts: 0,
  }
}

/**
 * Fold one coordination outcome into the tally with CORRECT cost accounting.
 * - cache_hit / waited_cache_hit → no provider call: cache hit (or dedup collapse)
 *   + avoided_cost. (waited_cache_hit is the loser that the winner served.)
 * - provider_winner            → exactly one provider call: cache_miss + actual_cost.
 * - unavailable                → no provider call; classify rate-limit vs lease timeout.
 */
export function recordCoordinationOutcome<T>(
  tally: CoordinationCounters,
  result: CoordinateResult<T>,
  estCostMicros: number,
): void {
  tally.requested_calls += 1
  switch (result.outcome) {
    case 'cache_hit':
      tally.cache_hits += 1
      tally.avoided_cost_micros += estCostMicros
      break
    case 'waited_cache_hit':
      tally.cache_hits += 1
      tally.dedup_collapses += 1
      tally.avoided_cost_micros += estCostMicros
      tally.lease_wait_ms += result.waitedMs
      break
    case 'provider_winner':
      tally.provider_calls += 1
      tally.cache_misses += 1
      tally.actual_cost_micros += estCostMicros
      break
    case 'unavailable':
      // The loser/winner-failure path: no EXTRA provider call was made here.
      if (typeof result.waitedMs === 'number') tally.lease_wait_ms += result.waitedMs
      if (result.errorClass === 'lease_wait_timeout' || result.errorClass === 'lease_expired') {
        tally.lease_timeouts += 1
      } else {
        tally.rate_limit_events += 1
      }
      break
  }
}

export type OcrCoordinationMetricsEvent = {
  event: 'ocr_coordination_metrics'
  product: string
  route: string
  dedup_mode: string
  cache_mode: string
  budget_mode: string
} & CoordinationCounters

const ALLOWED_KEYS = new Set<keyof OcrCoordinationMetricsEvent>([
  'event', 'product', 'route', 'dedup_mode', 'cache_mode', 'budget_mode',
  'requested_calls', 'provider_calls', 'dedup_collapses', 'cache_hits', 'cache_misses',
  'avoided_cost_micros', 'actual_cost_micros', 'rate_limit_events', 'lease_wait_ms', 'lease_timeouts',
])

type Sink = (e: OcrCoordinationMetricsEvent) => void
let _sink: Sink | null = null
/** TEST ONLY — capture metrics instead of logging. */
export function __setCoordinationMetricsSink(sink: Sink | null): void {
  _sink = sink
}

/** Emit the PII-free coordination metrics (allow-listed keys only; never throws). */
export function emitCoordinationMetrics(e: OcrCoordinationMetricsEvent): void {
  const safe = {} as Record<string, unknown>
  for (const k of Object.keys(e) as (keyof OcrCoordinationMetricsEvent)[]) {
    if (ALLOWED_KEYS.has(k)) safe[k] = e[k]
  }
  try {
    if (_sink) _sink(safe as unknown as OcrCoordinationMetricsEvent)
    else console.info(JSON.stringify(safe))
  } catch {
    /* observability must never throw */
  }
}
