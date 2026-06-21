/**
 * POST /api/diag/ocr-coordination — CROSS-INSTANCE coordination canary (synthetic).
 *
 * NOTE: a plain `diag` segment (NOT `_diag`) — Next.js App Router treats an
 * underscore-prefixed folder as a PRIVATE (non-routable) folder, so an `/api/_diag/*`
 * route 404s. This lives under `/api/diag/` so it is actually reachable.
 *
 * Proves the distributed lease (PR B) + secure cache (PR C) elect exactly ONE
 * winner per content key ACROSS Vercel lambda instances — the thing the per-instance
 * in-flight Map could not do. Uses a Postgres-backed lease (shared by all instances)
 * + a SYNTHETIC provider call (a short delay, NO real OCR, NO PII). Inert (501)
 * unless OCR_CACHE_ENC_KEY is configured.
 *
 * Auth: X-Internal-Diag-Token must equal INTERNAL_DIAG_TOKEN OR OCR_CANARY_TOKEN (a
 * short-lived canary-only token so the run does not require the global diag secret).
 *
 * Protocol:
 *   - Fire N concurrent POSTs with the SAME ?key=<hash> → expect exactly 1 role=winner
 *     (one provider_called=true) and N-1 role=waiter, ALL returning the identical value.
 *   - A POST with a DIFFERENT ?key → a separate winner (separate synthetic call).
 *
 * NO PII: the synthetic value is a fixed token; the only stored data is technical.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  SupabaseLeaseStore,
  coordinateProviderCall,
  type LeaseDbClient,
} from '@/lib/v1/ocrRequestLease'
import { SupabaseSecureOcrCacheStore, resolveOcrCacheKey } from '@/lib/v1/ocrSecureCacheStore'
import type { OcrCacheDbClient } from '@/lib/v1/ocrCacheStoreEncrypted'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type CanaryVal = { ok: true; text: 'CANARY'; key: string }

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth: accept the global diag token OR a canary-only token ────────────────
  const token = req.headers.get('x-internal-diag-token')
  const accepted = [process.env.INTERNAL_DIAG_TOKEN, process.env.OCR_CANARY_TOKEN].filter(Boolean)
  if (!token || !accepted.includes(token)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Config guard: needs the dedicated cache key (fail-closed, never crash) ────
  let keyMaterial
  try {
    keyMaterial = resolveOcrCacheKey(process.env as Record<string, string | undefined>)
  } catch {
    return NextResponse.json(
      { error: 'not_configured', detail: 'OCR_CACHE_ENC_KEY absent/invalid' },
      { status: 501 },
    )
  }

  const url = new URL(req.url)
  const cacheKey = (url.searchParams.get('key') ?? '').trim()
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(cacheKey)) {
    return NextResponse.json({ error: 'bad_key', detail: 'key must be [A-Za-z0-9._:-]{8,128}' }, { status: 400 })
  }
  const delayMs = Math.min(Math.max(Number(url.searchParams.get('delayMs') ?? '1500'), 0), 10_000)

  const owner = randomUUID()
  const db = createAdminSupabaseClient()
  const leaseStore = new SupabaseLeaseStore(db as unknown as LeaseDbClient)
  const cacheStore = new SupabaseSecureOcrCacheStore(db as unknown as OcrCacheDbClient, keyMaterial)

  let providerCalls = 0
  const startedAt = Date.now()
  try {
    const result = await coordinateProviderCall<CanaryVal>({
      cacheKeyHash: cacheKey,
      owner,
      provider: 'canary', modelVersion: 'synthetic', pipelineVersion: 'v1',
      store: leaseStore,
      cacheGet: async () => {
        const e = await cacheStore.get(cacheKey)
        return e ? (e.rawResponse as CanaryVal) : null
      },
      cachePut: async (v) => {
        const now = Date.now()
        await cacheStore.putIfAbsent({
          key: cacheKey, rawResponse: v,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 120_000).toISOString(),
        })
      },
      providerCall: async () => {
        providerCalls++
        await new Promise((r) => setTimeout(r, delayMs)) // SYNTHETIC work (no OCR, no PII)
        return { ok: true, text: 'CANARY', key: cacheKey }
      },
      isCacheableResult: (v) => v.ok === true,
      classifyFailure: () => ({ errorClass: 'CANARY_FAIL', retryAfterSeconds: null, cooldownMs: 5_000 }),
      // Bound the loser wait so the canary returns promptly.
      ttlMs: 30_000, maxWaitMs: 8_000, pollIntervalMs: 200, jitterMs: 80,
    })

    const role =
      result.outcome === 'provider_winner' ? 'winner'
      : result.outcome === 'cache_hit' || result.outcome === 'waited_cache_hit' ? 'waiter'
      : 'unavailable'

    return NextResponse.json({
      ok: true,
      role,
      outcome: result.outcome,
      provider_called_here: providerCalls, // 1 only for the winner; 0 for waiters
      value: (result as { value?: CanaryVal }).value ?? null,
      waited_ms: (result as { waitedMs?: number }).waitedMs ?? 0,
      elapsed_ms: Date.now() - startedAt,
      // A per-process nonce: distinct values across responses ⇒ multiple instances
      // served the burst, making the single-winner result a genuine CROSS-INSTANCE proof.
      instance_nonce: INSTANCE_NONCE,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: 'coordination_error', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    )
  }
}

// Stable for the lifetime of a warm lambda instance; differs across instances.
const INSTANCE_NONCE = randomUUID()
