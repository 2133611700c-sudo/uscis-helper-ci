/**
 * guardBlockRate.test.ts — L1 rate-alert logic. Window counting, threshold crossing,
 * and the safe uncalibrated default (never alerts until a baseline-measured threshold
 * is set). Deterministic timestamps.
 */
import { describe, it, expect } from 'vitest'
import {
  countInWindow,
  exceedsRate,
  rateAlertSummary,
  UNCALIBRATED_RATE,
} from '../guardBlockRate'

const H = 60 * 60 * 1000
const NOW = 1000 * H // arbitrary fixed "now"

describe('countInWindow', () => {
  it('counts only events inside [now - window, now]', () => {
    const events = [NOW - 0.5 * H, NOW - 0.9 * H, NOW - 2 * H, NOW - 1.5 * H]
    expect(countInWindow(events, NOW, 1 * H)).toBe(2) // the two within the last hour
  })
  it('ignores future timestamps', () => {
    expect(countInWindow([NOW + H], NOW, 1 * H)).toBe(0)
  })
})

describe('exceedsRate', () => {
  it('true when count strictly exceeds threshold', () => {
    const events = [NOW - 1, NOW - 2, NOW - 3, NOW - 4]
    expect(exceedsRate(events, NOW, { windowMs: H, threshold: 3 })).toBe(true)
  })
  it('false at exactly the threshold (strict)', () => {
    const events = [NOW - 1, NOW - 2, NOW - 3]
    expect(exceedsRate(events, NOW, { windowMs: H, threshold: 3 })).toBe(false)
  })
  it('uncalibrated (Infinity) threshold NEVER alerts — safe default', () => {
    const many = Array.from({ length: 1000 }, (_, i) => NOW - i)
    expect(exceedsRate(many, NOW, UNCALIBRATED_RATE)).toBe(false)
  })
})

describe('rateAlertSummary — PII-free', () => {
  it('contains only counts and the threshold, no document content', () => {
    const s = rateAlertSummary(42, { windowMs: H, threshold: 10 })
    expect(s).toContain('42')
    expect(s).toContain('threshold 10')
  })
})
