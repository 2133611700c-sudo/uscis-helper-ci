/**
 * slaTimer.test.ts — boundary pins for the 24h operator SLA.
 * Spec: green <4h, amber 4–12h, red >12h; label = remaining vs 24h window.
 */
import { describe, it, expect } from 'vitest'
import { computeSla, SLA_WINDOW_HOURS } from '../slaTimer'

const T0 = Date.UTC(2026, 5, 11, 0, 0, 0) // fixed base time
const h = (n: number) => n * 3_600_000
const createdAt = new Date(T0).toISOString()

describe('computeSla boundaries (now injected explicitly)', () => {
  it('0h elapsed → green, "24.0h left"', () => {
    const s = computeSla(createdAt, T0 + h(0))
    expect(s.color).toBe('green')
    expect(s.label).toBe('24.0h left')
    expect(s.elapsedHours).toBe(0)
  })

  it('just under 4h → still green', () => {
    const s = computeSla(createdAt, T0 + h(4) - 1)
    expect(s.color).toBe('green')
  })

  it('exactly 4h → amber, "20.0h left"', () => {
    const s = computeSla(createdAt, T0 + h(4))
    expect(s.color).toBe('amber')
    expect(s.label).toBe('20.0h left')
  })

  it('exactly 12h → amber (4–12h band is inclusive), "12.0h left"', () => {
    const s = computeSla(createdAt, T0 + h(12))
    expect(s.color).toBe('amber')
    expect(s.label).toBe('12.0h left')
  })

  it('just over 12h → red', () => {
    const s = computeSla(createdAt, T0 + h(12) + 1)
    expect(s.color).toBe('red')
  })

  it('exactly 24h → red, "0.0h left" (window edge, not yet over)', () => {
    const s = computeSla(createdAt, T0 + h(24))
    expect(s.color).toBe('red')
    expect(s.label).toBe('0.0h left')
    expect(s.remainingHours).toBe(0)
  })

  it('25h → red, "1.0h over"', () => {
    const s = computeSla(createdAt, T0 + h(25))
    expect(s.color).toBe('red')
    expect(s.label).toBe('1.0h over')
    expect(s.remainingHours).toBe(-1)
  })

  it('fractional: 20.8h elapsed → "3.2h left"', () => {
    const s = computeSla(createdAt, T0 + h(20.8))
    expect(s.color).toBe('red')
    expect(s.label).toBe('3.2h left')
  })

  it('accepts Date input and clamps future created_at to fresh/green', () => {
    const s = computeSla(new Date(T0 + h(1)), T0) // created "in the future"
    expect(s.color).toBe('green')
    expect(s.elapsedHours).toBe(0)
    expect(s.label).toBe(`${SLA_WINDOW_HOURS.toFixed(1)}h left`)
  })
})
