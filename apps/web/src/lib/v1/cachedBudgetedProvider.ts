/**
 * cachedBudgetedProvider — V1 phase GROUND_TRUTH_CORPUS_AND_CACHE (cache half).
 *
 * The single chokepoint for ANY paid OCR/AI provider call during benchmarks:
 *   1. cache-first: a hit never calls the provider (no spend, no stale-across-
 *      prompt reuse — the key includes prompt/preproc versions);
 *   2. on miss, the provider budget is checked FAIL-CLOSED (default DENY) — a
 *      blocked call returns { blocked } and the provider fn is NEVER invoked;
 *   3. only an explicitly-budgeted, within-caps call runs and is cached immutably.
 *
 * Pure orchestration with injected store + provider fn → fully unit-testable
 * with no real filesystem, no network, and no real money. Caller supplies the
 * timestamp (libraries must not read the clock).
 */
import { buildOcrCacheKey, type OcrCacheKeyParts, type OcrCacheStore } from './ocrCache'
import { checkBudget, DEFAULT_BUDGET, type BudgetConfig, type BudgetRequest } from './providerBudget'

export type CachedCallResult<T> =
  | { status: 'cache_hit'; value: T; key: string }
  | { status: 'fresh'; value: T; key: string; stored: boolean }
  | { status: 'blocked'; reason: string; key: string }

export type CachedCallInput<T> = {
  keyParts: OcrCacheKeyParts
  store: OcrCacheStore
  /** Defaults to DEFAULT_BUDGET (paid calls DISABLED) → a miss is blocked. */
  budget?: BudgetConfig
  budgetRequest: BudgetRequest
  /** The actual paid provider call. Only invoked on a cache miss within budget. */
  call: () => Promise<T>
  /** Caller-supplied timestamp (no clock reads in libs). */
  timestamp: string
}

export async function cachedBudgetedCall<T>(input: CachedCallInput<T>): Promise<CachedCallResult<T>> {
  const key = buildOcrCacheKey(input.keyParts)

  const hit = await input.store.get(key)
  if (hit) return { status: 'cache_hit', value: hit.rawResponse as T, key }

  const budget = input.budget ?? DEFAULT_BUDGET
  const decision = checkBudget(budget, input.budgetRequest)
  if (!decision.allowed) return { status: 'blocked', reason: decision.reason, key }

  const value = await input.call()
  const { stored } = await input.store.putIfAbsent({ key, rawResponse: value, createdAt: input.timestamp })
  return { status: 'fresh', value, key, stored }
}
