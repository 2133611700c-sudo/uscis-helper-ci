/**
 * guardBlockRate — L1 item-2 rate-alert LOGIC (pure). Given the timestamps of
 * guard-block events, decide whether the rate over a rolling window exceeds a
 * threshold. `now` and `threshold` are injected — `threshold` is CALIBRATED from the
 * Phase-1 baseline (do NOT hardcode a blind number); the cron passes the measured value.
 *
 * The persistence of guard-block events (a small table) + the scheduled checker that
 * calls notifyOwnerAlert are the infra wiring around this pure decision.
 */

export interface RateWindow {
  /** rolling window length in ms (e.g. 1h) */
  windowMs: number
  /** max events allowed in the window before alerting (calibrated from baseline) */
  threshold: number
}

const H = 60 * 60 * 1000
/** Default window is 1h; threshold is intentionally Infinity until calibrated (never alerts). */
export const UNCALIBRATED_RATE: RateWindow = { windowMs: H, threshold: Infinity }

/** Count events whose timestamp falls within [now - windowMs, now]. */
export function countInWindow(eventTimesMs: number[], nowMs: number, windowMs: number): number {
  const from = nowMs - windowMs
  let n = 0
  for (const ts of eventTimesMs) {
    if (ts >= from && ts <= nowMs) n++
  }
  return n
}

/**
 * True when the count in the rolling window strictly exceeds the threshold. With an
 * uncalibrated (Infinity) threshold this is always false — safe until baseline is set.
 */
export function exceedsRate(eventTimesMs: number[], nowMs: number, w: RateWindow): boolean {
  if (!Number.isFinite(w.threshold)) return false
  return countInWindow(eventTimesMs, nowMs, w.windowMs) > w.threshold
}

/** A PII-free alert summary for the owner when the rate is exceeded. */
export function rateAlertSummary(count: number, w: RateWindow): string {
  return `guard_block_rate_exceeded: ${count} blocks in ${Math.round(w.windowMs / H)}h (threshold ${w.threshold})`
}
