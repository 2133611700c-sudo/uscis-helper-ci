import { describe, it, expect } from 'vitest'
import { buildVerdict, allGatesPass, isPiiFree, type VerdictInput } from '../evidence'

const base: VerdictInput = {
  phase: 'STAGING_CONTROL_PLANE',
  commit: 'abc1234',
  timestamp: '2026-06-14T07:00:00Z',
  environment: 'ci',
  gates: { tsc: 'PASS', unit: 'PASS', build: 'PASS' },
  testCounts: { passed: 100, failed: 0, skipped: 1 },
  estimatedCostUsd: 0,
  actualCostUsd: 0,
}

describe('buildVerdict / allGatesPass', () => {
  it('copies the input into a verdict', () => {
    const v = buildVerdict(base)
    expect(v.phase).toBe('STAGING_CONTROL_PLANE')
    expect(v.gates).toEqual({ tsc: 'PASS', unit: 'PASS', build: 'PASS' })
  })

  it('allGatesPass is true only when every gate is PASS', () => {
    expect(allGatesPass(buildVerdict(base))).toBe(true)
    expect(allGatesPass(buildVerdict({ ...base, gates: { tsc: 'PASS', unit: 'FAIL' } }))).toBe(false)
    expect(allGatesPass(buildVerdict({ ...base, gates: { tsc: 'PASS', unit: 'SKIP' } }))).toBe(false)
    expect(allGatesPass(buildVerdict({ ...base, gates: {} }))).toBe(false)
  })
})

describe('isPiiFree — verdicts must carry no document/recipient PII', () => {
  it('passes a clean verdict', () => {
    expect(isPiiFree(buildVerdict(base))).toBe(true)
  })
  it('catches an A-number, SSN, email, or Cyrillic run if one leaks in', () => {
    expect(isPiiFree(buildVerdict({ ...base, phase: 'A123456789' }))).toBe(false)
    expect(isPiiFree(buildVerdict({ ...base, phase: '123-45-6789' }))).toBe(false)
    expect(isPiiFree(buildVerdict({ ...base, phase: 'x@example.com' }))).toBe(false)
    expect(isPiiFree(buildVerdict({ ...base, phase: 'Прізвище' }))).toBe(false)
  })
})
