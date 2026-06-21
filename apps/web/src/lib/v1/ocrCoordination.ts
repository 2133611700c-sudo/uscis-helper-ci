/**
 * ocrCoordination — the mode-aware entry point that ties the distributed lease
 * (ocrRequestLease) + the coordination metrics together. This is what a live OCR
 * call site (or the gateway) invokes; PR D wires it into the real path and runs the
 * enforce canary.
 *
 *   off     → pure pass-through: just await the provider call. Byte-identical to
 *             today. No lease, no metrics, no extra I/O.
 *   shadow  → MODEL who would win (a non-blocking lease probe) + record the would-be
 *             collapse/cost metrics, but EVERY caller STILL calls the provider and
 *             gets its OWN live result. No blocking, no substitution.
 *   enforce → real cross-instance single-flight via coordinateProviderCall: one
 *             winner calls the provider, losers wait + read the cache.
 *
 * Never throws coordination errors into the OCR path (shadow/metrics are best-effort).
 *
 * Server-only.
 */
import {
  coordinateProviderCall,
  type CoordinateOptions,
  type CoordinateResult,
  type OcrDistributedDedupMode,
} from './ocrRequestLease'
import {
  recordCoordinationOutcome,
  type CoordinationCounters,
} from './ocrCoordinationMetrics'

export type CoordinateOrShadowOptions<T> = CoordinateOptions<T> & {
  /** Cost estimate for accounting (avoided vs actual). */
  estCostMicros: number
  /** Optional tally to fold this call's outcome into (for a per-request roll-up). */
  tally?: CoordinationCounters
}

/**
 * Run a provider call under the given coordination mode. Returns the LIVE result in
 * off/shadow (no substitution); in enforce, returns the winner's result or the
 * cache (losers). In shadow, the lease is probed (to measure would-be collapses)
 * then immediately released so it never blocks a real caller.
 */
export async function coordinateOrShadow<T>(
  mode: OcrDistributedDedupMode,
  opts: CoordinateOrShadowOptions<T>,
): Promise<{ value: T; result: CoordinateResult<T> }> {
  // ── OFF — byte-identical pass-through. ──────────────────────────────────────
  if (mode === 'off') {
    const value = await opts.providerCall()
    return { value, result: { outcome: 'provider_winner', value, providerCalled: true } }
  }

  // ── ENFORCE — real cross-instance single-flight. ────────────────────────────
  if (mode === 'enforce') {
    const result = await coordinateProviderCall(opts)
    if (opts.tally) recordCoordinationOutcome(opts.tally, result, opts.estCostMicros)
    if (result.outcome === 'unavailable') {
      // Caller must map this to a structured "temporarily unavailable" — there is
      // no value. We surface the typed result so the caller decides (never a crash).
      throw new OcrCoordinationUnavailable(result.errorClass, result.retryAfterSeconds ?? null)
    }
    return { value: (result as { value: T }).value, result }
  }

  // ── SHADOW — model the would-be winner; ALWAYS call the provider live. ───────
  // Non-blocking: probe acquire to see if THIS caller would win, record the would-be
  // outcome, then release the lease so a real caller is never held up. The actual
  // result returned is ALWAYS the live provider call (no substitution).
  let wouldWin = true
  try {
    const acq = await opts.store.acquire({
      cacheKeyHash: opts.cacheKeyHash, owner: opts.owner, ttlMs: opts.ttlMs ?? 30_000,
      provider: opts.provider, modelVersion: opts.modelVersion, pipelineVersion: opts.pipelineVersion,
    })
    wouldWin = acq.acquired
    // Release immediately so the probe never blocks anyone.
    if (acq.acquired) await opts.store.complete(opts.cacheKeyHash, opts.owner).catch(() => {})
  } catch {
    wouldWin = true // probe failure → assume own call (fail-safe, still calls provider)
  }

  const value = await opts.providerCall()
  // Record the would-be effect: winner ⇒ a real provider call; non-winner ⇒ a
  // collapse we WOULD have avoided in enforce.
  const modelled: CoordinateResult<T> = wouldWin
    ? { outcome: 'provider_winner', value, providerCalled: true }
    : { outcome: 'waited_cache_hit', value, providerCalled: false, waitedMs: 0 }
  if (opts.tally) recordCoordinationOutcome(opts.tally, modelled, opts.estCostMicros)
  return { value, result: modelled }
}

/** Thrown by enforce mode when the lease path yields no value (winner failure or a
 *  loser timeout). The caller maps this to an honest "temporarily unavailable". */
export class OcrCoordinationUnavailable extends Error {
  readonly code = 'ocr_coordination_unavailable' as const
  constructor(public readonly errorClass: string, public readonly retryAfterSeconds: number | null) {
    super(`ocr_coordination_unavailable: ${errorClass}`)
    this.name = 'OcrCoordinationUnavailable'
  }
}
