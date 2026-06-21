/**
 * ticketEscalation.test.ts — L1 escalation timer + reconciliation logic.
 * Pins the owner cadence (4h → 12h → daily 24h), monotonicity (never re-fire a done
 * stage), and the 12h jump. Deterministic ages; no Date.now.
 */
import { describe, it, expect } from 'vitest'
import {
  nextEscalationStage,
  ticketsForDigest,
  pendingEscalations,
  type OpenTicketState,
} from '../ticketEscalation'

const H = 60 * 60 * 1000
const t = (ageH: number, lastStage: OpenTicketState['lastStage'] = 'created', id = 'k'): OpenTicketState =>
  ({ ticketId: id, ageMs: ageH * H, lastStage })

describe('nextEscalationStage — owner cadence 4h → 12h', () => {
  it('young ticket (<4h) → no new escalation', () => {
    expect(nextEscalationStage(t(1))).toBeNull()
    expect(nextEscalationStage(t(3.9))).toBeNull()
  })
  it('≥4h, only first alert done → second_alert', () => {
    expect(nextEscalationStage(t(5, 'created'))).toBe('second_alert')
  })
  it('≥4h but second_alert already done → null (no re-fire)', () => {
    expect(nextEscalationStage(t(5, 'second_alert'))).toBeNull()
  })
  it('≥12h → third_channel (jumps even if second was never sent)', () => {
    expect(nextEscalationStage(t(13, 'created'))).toBe('third_channel')
    expect(nextEscalationStage(t(13, 'second_alert'))).toBe('third_channel')
  })
  it('≥12h and third_channel already done → null', () => {
    expect(nextEscalationStage(t(13, 'third_channel'))).toBeNull()
  })
})

describe('ticketsForDigest — daily reconciliation (≥24h)', () => {
  it('includes only tickets aged ≥ 24h', () => {
    const list = [t(2, 'created', 'a'), t(25, 'third_channel', 'b'), t(48, 'third_channel', 'c')]
    expect(ticketsForDigest(list).map((x) => x.ticketId)).toEqual(['b', 'c'])
  })
})

describe('pendingEscalations — batch', () => {
  it('returns each ticket needing a new action with its stage', () => {
    const list = [t(1, 'created', 'young'), t(6, 'created', 'mid'), t(20, 'second_alert', 'old')]
    expect(pendingEscalations(list)).toEqual([
      { ticketId: 'mid', stage: 'second_alert' },
      { ticketId: 'old', stage: 'third_channel' },
    ])
  })
})
