/**
 * coordinatedDocumentRead — wires the CROSS-INSTANCE OCR coordination layer
 * (distributed lease + secure cache, lib/v1/ocrCoordination) around the ONE real
 * Gemini-Vision provider call that readDocument() makes. This is the live-path
 * wiring deferred by ocrRequestLease ("NOT wired into the live OCR path here —
 * that is a later PR"). Issue #161.
 *
 * SAFETY — OFF-PARITY (load-bearing invariant):
 *   OCR_DISTRIBUTED_DEDUP_MODE is read once. `off` (the production default) is a
 *   BYTE-IDENTICAL pass-through: it returns `provider.readFields(...)` directly with
 *   NO sha256, NO lease, NO cache lookup, NO Supabase client, NO extra failure mode.
 *   Only `shadow`/`enforce` (staging canary) construct the coordination machinery.
 *
 *   shadow  → coordination is probed + metrics recorded, but EVERY caller still gets
 *             its OWN live provider result (no substitution, response never mutated).
 *   enforce → cross-instance single-flight: one winner calls the provider, losers
 *             wait + read the winner's cached result; a failure/empty read is NEVER
 *             cached as success; an exhausted lease surfaces OcrCoordinationUnavailable
 *             (the caller maps it to an honest "temporarily unavailable", never a crash).
 *
 * Tenant isolation: the cache key binds a tenant/session scope (via requestSha) so a
 * cached value is NEVER shared across tenants — different scope ⇒ different key ⇒
 * independent provider call.
 *
 * Fail-safe: if shadow/enforce is requested but the dedicated cache key
 * (OCR_CACHE_ENC_KEY) is absent, or any coordination setup throws, we degrade to a
 * direct provider call (logged, PII-free) — coordination must never break OCR.
 *
 * Server-only.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { computeCacheKeySha } from '@/lib/v1/ocrCostMetrics'
import {
  resolveDistributedDedupMode,
  SupabaseLeaseStore,
  type LeaseStore,
  type LeaseDbClient,
  type FailureClass,
} from '@/lib/v1/ocrRequestLease'
import { coordinateOrShadow } from '@/lib/v1/ocrCoordination'
import { SupabaseSecureOcrCacheStore, resolveOcrCacheKey } from '@/lib/v1/ocrSecureCacheStore'
import type { OcrCacheStore } from '@/lib/v1/ocrCache'
import type { OcrCacheDbClient } from '@/lib/v1/ocrCacheStoreEncrypted'
import {
  newCoordinationTally,
  emitCoordinationMetrics,
} from '@/lib/v1/ocrCoordinationMetrics'
import { primaryGeminiModel } from './providers/geminiVisionProvider'
import type { DocTypeSpec, VisionProvider, VisionReadResult } from './types'

/** Coarse version tags bound into the cache key. Bump on a prompt/preproc change so
 *  a stale cached read can never collide with a new pipeline. */
const PROMPT_VERSION = 'v1'
const PREPROC_VERSION = 'v1'
const PIPELINE_VERSION = 'v1'

/** Rough per-read cost estimate (micros-USD) for budget/avoided-cost accounting. */
const DEFAULT_EST_COST_MICROS = 2_000

const sha256Hex = (b: Buffer | string): string =>
  createHash('sha256').update(b).digest('hex')

/**
 * Derive the content-addressed coordination cache key. Binds the file bytes, the
 * provider+model, the prompt/preproc versions, AND a tenant/session scope so a
 * cached value is NEVER shared across tenants. Exported so tests can assert key
 * composition (isolation / different-bytes) deterministically.
 */
export function deriveCoordinationCacheKey(args: {
  imageBuffer: Buffer
  providerName: string
  tenantScope?: string
  docTypeId: string
}): string {
  const fileSha256 = sha256Hex(args.imageBuffer)
  const requestSha = sha256Hex(`${args.tenantScope ?? 'global'}\n${args.docTypeId}`)
  return computeCacheKeySha({
    fileSha256,
    provider: args.providerName,
    model: primaryGeminiModel(),
    promptVersion: PROMPT_VERSION,
    preprocVersion: PREPROC_VERSION,
    requestSha,
  })
}

export type CoordinatedReadOpts = {
  timeoutMs?: number
  attemptsPerModel?: number
  /** Tenant/session discriminator bound into the cache key for isolation. */
  tenantScope?: string
  product?: string
  route?: string
  estCostMicros?: number
  ttlMs?: number
  maxWaitMs?: number
  // ── injected for tests (prod builds Supabase-backed stores) ────────────────
  env?: Record<string, string | undefined>
  leaseStore?: LeaseStore
  cacheStore?: OcrCacheStore
  owner?: string
  clock?: () => number
  now?: () => number
}

/** Map a failed VisionReadResult (or thrown error) to a lease failure class. */
function classifyVisionFailure(errOrResult: unknown): FailureClass {
  const r = errOrResult as Partial<VisionReadResult> | undefined
  const status = r && typeof r.errorStatus === 'number' ? r.errorStatus : undefined
  if (status === 429) {
    return { errorClass: 'rate_limited', retryAfterSeconds: 30, cooldownMs: 30_000 }
  }
  if (status && status >= 500) {
    return { errorClass: 'provider_5xx', retryAfterSeconds: null, cooldownMs: 10_000 }
  }
  if (r && r.errorTimeout) {
    return { errorClass: 'timeout', retryAfterSeconds: null, cooldownMs: 5_000 }
  }
  return { errorClass: 'ocr_failed', retryAfterSeconds: null, cooldownMs: 5_000 }
}

/** A genuinely cacheable read: a successful read that actually produced fields.
 *  A 429/5xx/timeout (ok:false) OR an empty read (0 fields) is NEVER cached. */
function isCacheableRead(r: VisionReadResult): boolean {
  return r.ok === true && Array.isArray(r.fields) && r.fields.length > 0
}

/**
 * Run readDocument's single provider call under the configured coordination mode.
 * Returns the SAME VisionReadResult the provider would return. May throw
 * OcrCoordinationUnavailable in enforce mode (caller maps to honest unavailable).
 */
export async function coordinatedDocumentRead(
  imageBuffer: Buffer,
  mimeType: string,
  spec: DocTypeSpec,
  docTypeId: string,
  provider: VisionProvider,
  opts: CoordinatedReadOpts = {},
): Promise<VisionReadResult> {
  const env = opts.env ?? process.env
  const providerCall = (): Promise<VisionReadResult> =>
    provider.readFields(imageBuffer, mimeType, spec, {
      timeoutMs: opts.timeoutMs,
      attemptsPerModel: opts.attemptsPerModel,
    })

  const mode = resolveDistributedDedupMode(env)

  // ── OFF (prod default): byte-identical pass-through. Nothing else runs. ───────
  if (mode === 'off') return providerCall()

  // ── shadow/enforce: build the coordination machinery (fail-safe on any gap). ──
  const now = opts.now ?? Date.now
  const clock = opts.clock ?? Date.now
  const modelVersion = primaryGeminiModel()
  const estCostMicros = opts.estCostMicros ?? DEFAULT_EST_COST_MICROS

  let leaseStore: LeaseStore
  let cacheStore: OcrCacheStore
  let cacheKeyHash: string
  try {
    // Tenant/session scope + doc type bound into the key → cross-tenant isolation
    // (a different scope yields a different key, so values are never shared).
    cacheKeyHash = deriveCoordinationCacheKey({
      imageBuffer,
      providerName: provider.name,
      tenantScope: opts.tenantScope,
      docTypeId,
    })

    if (opts.leaseStore && opts.cacheStore) {
      leaseStore = opts.leaseStore
      cacheStore = opts.cacheStore
    } else {
      // Production stores require the dedicated cache key; absent ⇒ fail-safe.
      const keyMaterial = resolveOcrCacheKey(env)
      const db = createAdminSupabaseClient()
      leaseStore = opts.leaseStore ?? new SupabaseLeaseStore(db as unknown as LeaseDbClient)
      cacheStore =
        opts.cacheStore ??
        new SupabaseSecureOcrCacheStore(db as unknown as OcrCacheDbClient, keyMaterial)
    }
  } catch (err) {
    // No enc key / no admin client / bad key parts → degrade to a direct call.
    console.warn(
      '[ocr_coordination] disabled_fail_safe',
      JSON.stringify({
        doc_type_id: docTypeId,
        mode,
        reason: err instanceof Error ? err.message : 'setup_failed',
      }),
    )
    return providerCall()
  }

  const owner = opts.owner ?? randomUUID()
  const tally = newCoordinationTally()
  const ttlMs = opts.ttlMs ?? 30_000
  const cacheTtlMs = 24 * 60 * 60 * 1000

  const { value } = await coordinateOrShadow<VisionReadResult>(mode, {
    cacheKeyHash,
    owner,
    provider: provider.name,
    modelVersion,
    pipelineVersion: PIPELINE_VERSION,
    store: leaseStore,
    cacheGet: async () => {
      const e = await cacheStore.get(cacheKeyHash).catch(() => null)
      return e ? (e.rawResponse as VisionReadResult) : null
    },
    cachePut: async (v) => {
      const ts = now()
      await cacheStore.putIfAbsent({
        key: cacheKeyHash,
        rawResponse: v,
        createdAt: new Date(ts).toISOString(),
        expiresAt: new Date(ts + cacheTtlMs).toISOString(),
      })
    },
    providerCall,
    isCacheableResult: isCacheableRead,
    classifyFailure: classifyVisionFailure,
    estCostMicros,
    tally,
    clock,
    ttlMs,
    maxWaitMs: opts.maxWaitMs ?? 8_000,
  })

  // PII-free coordination metrics (allow-listed keys only; never throws).
  emitCoordinationMetrics({
    event: 'ocr_coordination_metrics',
    product: opts.product ?? 'unknown',
    route: opts.route ?? 'readDocument',
    dedup_mode: mode,
    cache_mode: mode === 'enforce' ? 'enforce' : 'shadow',
    budget_mode: 'off',
    ...tally,
  })

  return value
}
