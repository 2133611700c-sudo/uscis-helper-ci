/**
 * ticketEscalation — L1 escalation-timer + daily-reconciliation LOGIC (owner-ruled
 * A-full, 2026-06-10). PURE: given open-ticket ages it decides which need a NEW
 * escalation action; `now` is injected so it is deterministic + unit-testable. The
 * cron scripts bind this to manual_review_queue + notifyOwnerAlert / the digest email.
 *
 * Stages (a paid-failure ticket already got its first owner alert at creation = 'created'):
 *   created → second_alert (>4h, no action) → third_channel (>12h)
 *   plus a recurring daily reconciliation digest for anything still open >24h.
 */

export type EscalationStage = 'created' | 'second_alert' | 'third_channel'

export interface OpenTicketState {
  ticketId: string
  /** age = now - createdAt, in ms */
  ageMs: number
  /** the most advanced escalation already performed for this ticket */
  lastStage: EscalationStage
}

export interface EscalationThresholds {
  secondAlertMs: number
  thirdChannelMs: number
  digestMs: number
}

const H = 60 * 60 * 1000
/** Owner-ruled cadence: 2nd alert at 4h, 3rd channel at 12h, daily digest at 24h. */
export const DEFAULT_ESCALATION: EscalationThresholds = {
  secondAlertMs: 4 * H,
  thirdChannelMs: 12 * H,
  digestMs: 24 * H,
}

const RANK: Record<EscalationStage, number> = { created: 0, second_alert: 1, third_channel: 2 }

/**
 * The single NEW escalation stage a ticket has crossed but not yet been actioned for,
 * or null if nothing new. Monotonic — never re-fires a stage already done, and jumps
 * straight to third_channel if the ticket is already past 12h.
 */
export function nextEscalationStage(
  t: OpenTicketState,
  th: EscalationThresholds = DEFAULT_ESCALATION,
): EscalationStage | null {
  const done = RANK[t.lastStage]
  if (t.ageMs >= th.thirdChannelMs && done < RANK.third_channel) return 'third_channel'
  if (t.ageMs >= th.secondAlertMs && done < RANK.second_alert) return 'second_alert'
  return null
}

/** All tickets to include in the daily reconciliation digest (still open and aged ≥ 24h). */
export function ticketsForDigest(
  tickets: OpenTicketState[],
  th: EscalationThresholds = DEFAULT_ESCALATION,
): OpenTicketState[] {
  return tickets.filter((t) => t.ageMs >= th.digestMs)
}

/** Convenience: every ticket needing a new escalation action this tick, with its stage. */
export function pendingEscalations(
  tickets: OpenTicketState[],
  th: EscalationThresholds = DEFAULT_ESCALATION,
): Array<{ ticketId: string; stage: EscalationStage }> {
  const out: Array<{ ticketId: string; stage: EscalationStage }> = []
  for (const t of tickets) {
    const stage = nextEscalationStage(t, th)
    if (stage) out.push({ ticketId: t.ticketId, stage })
  }
  return out
}
