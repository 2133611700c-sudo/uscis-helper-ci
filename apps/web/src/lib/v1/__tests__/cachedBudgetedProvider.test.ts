import { describe, it, expect, vi } from 'vitest'
import { cachedBudgetedCall } from '../cachedBudgetedProvider'
import type { OcrCacheStore, OcrCacheEntry } from '../ocrCache'
import type { BudgetConfig } from '../providerBudget'

const SHA = 'b'.repeat(64)
const keyParts = { fileSha256: SHA, provider: 'gemini', modelVersion: 'm1', promptVersion: 'p1', preprocessingVersion: 'pre1' }
const budgetReq = { plannedDocs: 1, estimatedCostUsd: 0.01, spentTodayUsd: 0, spentMonthUsd: 0 }
const enabled: BudgetConfig = { paidCallsEnabled: true, perRunDocCap: 10, perRunCostCapUsd: 1, dailyCapUsd: 5, monthlyCapUsd: 50 }

function memStore(seed?: OcrCacheEntry): OcrCacheStore & { map: Map<string, OcrCacheEntry> } {
  const map = new Map<string, OcrCacheEntry>()
  if (seed) map.set(seed.key, seed)
  return {
    map,
    async get(k) { return map.get(k) ?? null },
    async putIfAbsent(e) { if (map.has(e.key)) return { stored: false }; map.set(e.key, e); return { stored: true } },
  }
}

describe('cachedBudgetedCall — cache-first + fail-closed budget', () => {
  it('DEFAULT budget (paid disabled) BLOCKS a miss and never calls the provider', async () => {
    const store = memStore()
    const call = vi.fn(async () => 'PROVIDER')
    const r = await cachedBudgetedCall({ keyParts, store, budgetRequest: budgetReq, call, timestamp: 't' })
    expect(r.status).toBe('blocked')
    expect(call).not.toHaveBeenCalled()
  })

  it('cache HIT returns without calling the provider', async () => {
    const key = `${SHA}:gemini:m1:p1:pre1`
    const store = memStore({ key, rawResponse: 'CACHED', createdAt: 't0' })
    const call = vi.fn(async () => 'PROVIDER')
    const r = await cachedBudgetedCall({ keyParts, store, budget: enabled, budgetRequest: budgetReq, call, timestamp: 't' })
    expect(r).toMatchObject({ status: 'cache_hit', value: 'CACHED' })
    expect(call).not.toHaveBeenCalled()
  })

  it('miss WITHIN budget calls the provider once and stores immutably', async () => {
    const store = memStore()
    const call = vi.fn(async () => 'PROVIDER')
    const r1 = await cachedBudgetedCall({ keyParts, store, budget: enabled, budgetRequest: budgetReq, call, timestamp: 't1' })
    expect(r1).toMatchObject({ status: 'fresh', value: 'PROVIDER', stored: true })
    expect(call).toHaveBeenCalledTimes(1)
    // second call → now a cache hit, provider not called again
    const r2 = await cachedBudgetedCall({ keyParts, store, budget: enabled, budgetRequest: budgetReq, call, timestamp: 't2' })
    expect(r2.status).toBe('cache_hit')
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('miss OVER a cap is blocked and never calls the provider', async () => {
    const store = memStore()
    const call = vi.fn(async () => 'PROVIDER')
    const r = await cachedBudgetedCall({ keyParts, store, budget: enabled, budgetRequest: { ...budgetReq, plannedDocs: 999 }, call, timestamp: 't' })
    expect(r.status).toBe('blocked')
    expect((r as { reason: string }).reason).toBe('per_run_doc_cap_exceeded')
    expect(call).not.toHaveBeenCalled()
  })
})
