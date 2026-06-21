import { describe, it, expect } from 'vitest'
import { checkBudget, estimateRunCostUsd, DEFAULT_BUDGET, type BudgetConfig } from '../providerBudget'

const enabled: BudgetConfig = {
  paidCallsEnabled: true,
  perRunDocCap: 50,
  perRunCostCapUsd: 5,
  dailyCapUsd: 20,
  monthlyCapUsd: 100,
}
const req = { plannedDocs: 10, estimatedCostUsd: 1, spentTodayUsd: 0, spentMonthUsd: 0 }

describe('checkBudget — fail-closed by default', () => {
  it('DEFAULT_BUDGET denies all paid calls', () => {
    expect(DEFAULT_BUDGET.paidCallsEnabled).toBe(false)
    expect(checkBudget(DEFAULT_BUDGET, req)).toEqual({ allowed: false, reason: 'paid_calls_disabled' })
  })

  it('allows a request within every cap when enabled', () => {
    expect(checkBudget(enabled, req)).toEqual({ allowed: true, reason: 'ok' })
  })

  it('denies when planned docs exceed the per-run cap', () => {
    expect(checkBudget(enabled, { ...req, plannedDocs: 51 }).reason).toBe('per_run_doc_cap_exceeded')
  })

  it('denies when estimated cost exceeds the per-run cost cap', () => {
    expect(checkBudget(enabled, { ...req, estimatedCostUsd: 6 }).reason).toBe('per_run_cost_cap_exceeded')
  })

  it('denies when the run would exceed the daily cap', () => {
    expect(checkBudget(enabled, { ...req, spentTodayUsd: 19.5, estimatedCostUsd: 1 }).reason).toBe('daily_cap_exceeded')
  })

  it('denies when the run would exceed the monthly cap', () => {
    expect(checkBudget(enabled, { ...req, spentMonthUsd: 99.5, estimatedCostUsd: 1 }).reason).toBe('monthly_cap_exceeded')
  })

  it('denies an invalid (negative/NaN) request', () => {
    expect(checkBudget(enabled, { ...req, plannedDocs: -1 }).reason).toBe('invalid_request')
  })
})

describe('estimateRunCostUsd — dry run', () => {
  it('multiplies docs by unit price', () => {
    expect(estimateRunCostUsd(10, 0.02)).toBeCloseTo(0.2, 6)
  })
  it('returns Infinity for invalid input (→ denied downstream)', () => {
    expect(estimateRunCostUsd(-1, 0.02)).toBe(Number.POSITIVE_INFINITY)
  })
})
