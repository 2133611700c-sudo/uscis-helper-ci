/**
 * providerBudget — V1_COMPLETION provider cost guard.
 *
 * Hard, fail-closed budget gate for PAID provider calls (Vision/Gemini/DeepSeek)
 * during benchmarks. DEFAULT = paid calls DISABLED. A run must pass an explicit
 * dry-run estimate AND every cap before any uncached provider call.
 *
 * Pure + dependency-free. It decides allow/deny; it makes no provider calls.
 */

export type BudgetConfig = {
  /** Master switch. Default false → all paid calls denied. */
  paidCallsEnabled: boolean
  perRunDocCap: number
  perRunCostCapUsd: number
  dailyCapUsd: number
  monthlyCapUsd: number
}

/** Safe default: paid calls disabled, zero caps. */
export const DEFAULT_BUDGET: BudgetConfig = {
  paidCallsEnabled: false,
  perRunDocCap: 0,
  perRunCostCapUsd: 0,
  dailyCapUsd: 0,
  monthlyCapUsd: 0,
}

export type BudgetRequest = {
  plannedDocs: number
  estimatedCostUsd: number
  spentTodayUsd: number
  spentMonthUsd: number
}

export type BudgetDecision = {
  allowed: boolean
  /** machine reason when denied */
  reason:
    | 'ok'
    | 'paid_calls_disabled'
    | 'per_run_doc_cap_exceeded'
    | 'per_run_cost_cap_exceeded'
    | 'daily_cap_exceeded'
    | 'monthly_cap_exceeded'
    | 'invalid_request'
}

/** Estimate a run cost (dry-run) from a per-document unit price. */
export function estimateRunCostUsd(plannedDocs: number, perDocUsd: number): number {
  if (!Number.isFinite(plannedDocs) || !Number.isFinite(perDocUsd) || plannedDocs < 0 || perDocUsd < 0) {
    return Number.POSITIVE_INFINITY // unusable estimate → will be denied downstream
  }
  return Math.round(plannedDocs * perDocUsd * 1e6) / 1e6
}

/**
 * Fail-closed budget decision. Denies unless paid calls are explicitly enabled
 * AND the request fits every cap.
 */
export function checkBudget(config: BudgetConfig, req: BudgetRequest): BudgetDecision {
  if (!config.paidCallsEnabled) return { allowed: false, reason: 'paid_calls_disabled' }

  const nums = [req.plannedDocs, req.estimatedCostUsd, req.spentTodayUsd, req.spentMonthUsd]
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
    return { allowed: false, reason: 'invalid_request' }
  }

  if (req.plannedDocs > config.perRunDocCap) return { allowed: false, reason: 'per_run_doc_cap_exceeded' }
  if (req.estimatedCostUsd > config.perRunCostCapUsd) return { allowed: false, reason: 'per_run_cost_cap_exceeded' }
  if (req.spentTodayUsd + req.estimatedCostUsd > config.dailyCapUsd) return { allowed: false, reason: 'daily_cap_exceeded' }
  if (req.spentMonthUsd + req.estimatedCostUsd > config.monthlyCapUsd) return { allowed: false, reason: 'monthly_cap_exceeded' }

  return { allowed: true, reason: 'ok' }
}
