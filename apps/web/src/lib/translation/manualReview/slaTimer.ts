/**
 * slaTimer — pure SLA computation for the manual-review operator queue.
 *
 * Contract (admin list view):
 *   - SLA window: 24h from ticket created_at
 *   - color: green when elapsed < 4h, amber when 4h ≤ elapsed ≤ 12h, red when elapsed > 12h
 *   - label: time remaining against the 24h SLA, e.g. "3.2h left"; once the
 *     SLA is blown (elapsed > 24h): "1.0h over"
 *
 * Pure: `now` is an explicit parameter (epoch ms). No Date.now() inside the
 * computation — callers in app code may pass Date.now() at the call site.
 */

export const SLA_WINDOW_HOURS = 24
export const SLA_GREEN_BELOW_HOURS = 4
export const SLA_AMBER_UPTO_HOURS = 12

export type SlaColor = 'green' | 'amber' | 'red'

export interface SlaStatus {
  color: SlaColor
  /** e.g. "20.8h left" or "1.0h over" */
  label: string
  /** hours since created_at (can exceed 24) */
  elapsedHours: number
  /** hours remaining in the 24h window; negative when over */
  remainingHours: number
}

const MS_PER_HOUR = 3_600_000

/**
 * Compute SLA status for a ticket.
 * @param createdAt ISO timestamp (or Date) of ticket creation
 * @param nowMs     current time as epoch milliseconds (inject explicitly)
 */
export function computeSla(createdAt: string | Date, nowMs: number): SlaStatus {
  const createdMs = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime()
  // Clamp negative elapsed (clock skew / future created_at) to 0 — treat as fresh.
  const elapsedHours = Math.max(0, (nowMs - createdMs) / MS_PER_HOUR)
  const remainingHours = SLA_WINDOW_HOURS - elapsedHours

  let color: SlaColor
  if (elapsedHours < SLA_GREEN_BELOW_HOURS) color = 'green'
  else if (elapsedHours <= SLA_AMBER_UPTO_HOURS) color = 'amber'
  else color = 'red'

  const label = remainingHours >= 0
    ? `${remainingHours.toFixed(1)}h left`
    : `${Math.abs(remainingHours).toFixed(1)}h over`

  return { color, label, elapsedHours, remainingHours }
}
