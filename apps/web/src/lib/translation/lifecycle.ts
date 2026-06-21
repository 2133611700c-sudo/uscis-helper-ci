/**
 * translation/lifecycle — data lifecycle / retention CONFIG + pure planning helpers
 * for the Phase 2 Translation Operator Pipeline V2.
 *
 * ── SCOPE (load-bearing) ─────────────────────────────────────────────────────
 * This module is ADDITIVE and PURE. It computes retention windows, signed-URL TTLs,
 * and deletion PLANS. It performs NO destructive action and runs NO migration. A
 * future cron/worker may consume these plans; nothing here mutates production data.
 *
 * ── INVARIANTS ───────────────────────────────────────────────────────────────
 * - Artifacts are IMMUTABLE: a deletion plan may remove an EXPIRED artifact's bytes
 *   but a "correction" NEVER overwrites — it is a NEW artifact version (see runbook 8).
 * - Customer deletion must leave NO orphan storage object (every artifact storage key
 *   for the order is included in the plan) and MUST preserve a minimum NON-PII audit
 *   stub (order id + state history hashes) so we can prove what happened.
 * - Legal hold SUSPENDS all deletion for the held order until released.
 * - Signed URLs are SHORT-LIVED and single-use intent: after expiry the URL is not
 *   reusable. Private artifacts are NEVER made public.
 *
 * All durations are configurable via env (parsed once); defaults are conservative.
 */

const DAY_SECONDS = 24 * 60 * 60

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Retention windows (in DAYS) per data class. Configurable; conservative defaults. */
export interface RetentionPolicy {
  /** Order aggregate rows (translation_orders_v2). */
  orderDays: number
  /** Canonical override rows (operator edits — audit-relevant). */
  overrideDays: number
  /** Generated artifact bytes in private storage. */
  artifactDays: number
  /** delivery_outbox rows (terminal: delivered/failed). */
  outboxDays: number
  /** Append-only audit/event log. Kept LONGEST (compliance). */
  auditDays: number
  /** Signed-URL time-to-live for private artifact access (SECONDS). */
  signedUrlTtlSeconds: number
}

export function getRetentionPolicy(): RetentionPolicy {
  return {
    orderDays: envInt('RETENTION_ORDER_DAYS', 365),
    overrideDays: envInt('RETENTION_OVERRIDE_DAYS', 365),
    artifactDays: envInt('RETENTION_ARTIFACT_DAYS', 90),
    outboxDays: envInt('RETENTION_OUTBOX_DAYS', 30),
    // Audit retained longest; non-PII by construction.
    auditDays: envInt('RETENTION_AUDIT_DAYS', 2555 /* ~7y */),
    // Short-lived signed URL; default 10 minutes, hard cap 1 hour.
    signedUrlTtlSeconds: Math.min(envInt('ARTIFACT_SIGNED_URL_TTL_SECONDS', 600), 3600),
  }
}

// ---------------------------------------------------------------------------
// Signed-URL TTL
// ---------------------------------------------------------------------------

export interface SignedUrlPlan {
  ttlSeconds: number
  expiresAt: string
  /** Always private — a public URL is never issued for an artifact. */
  isPublic: false
  /** After expiry the URL must not be reusable (caller mints a fresh one). */
  reusableAfterExpiry: false
}

/**
 * Compute a short-lived signed-URL plan. TTL is clamped to [30s, 3600s]. The plan is
 * explicit that the URL is private and non-reusable after expiry.
 */
export function planSignedUrl(now: Date = new Date(), policy = getRetentionPolicy()): SignedUrlPlan {
  const ttl = Math.min(Math.max(policy.signedUrlTtlSeconds, 30), 3600)
  return {
    ttlSeconds: ttl,
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    isPublic: false,
    reusableAfterExpiry: false,
  }
}

/** A signed URL is valid only strictly before its expiry. */
export function isSignedUrlValid(expiresAt: string, now: Date = new Date()): boolean {
  const exp = Date.parse(expiresAt)
  if (Number.isNaN(exp)) return false
  return now.getTime() < exp
}

// ---------------------------------------------------------------------------
// Expiry checks
// ---------------------------------------------------------------------------

export function isExpired(createdAt: string, retentionDays: number, now: Date = new Date()): boolean {
  const created = Date.parse(createdAt)
  if (Number.isNaN(created)) return false
  return now.getTime() - created >= retentionDays * DAY_SECONDS * 1000
}

// ---------------------------------------------------------------------------
// Customer-deletion plan (no orphan storage; preserve non-PII audit stub)
// ---------------------------------------------------------------------------

export interface ArtifactRef {
  id: string
  storageBucket: string
  storageKey: string
}

export interface DeletionPlanInput {
  orderId: string
  /** All artifacts for the order — EVERY storage key must be removed (no orphans). */
  artifacts: ArtifactRef[]
  /** Legal hold suspends deletion entirely. */
  legalHold?: boolean
}

export interface DeletionPlan {
  orderId: string
  /** When true, NOTHING is deleted (legal hold). */
  blockedByLegalHold: boolean
  /** Storage objects to remove ({bucket, key}) — covers every artifact (no orphans). */
  storageKeysToDelete: Array<{ bucket: string; key: string }>
  /** Order/override rows to purge of PII (the row may be tombstoned, not hard-deleted). */
  purgePiiFromOrder: boolean
  /**
   * The minimum NON-PII audit stub to PRESERVE even after customer deletion:
   * the opaque order id + a marker. No names/emails/values are kept.
   */
  preserveAuditStub: { orderId: string; reason: 'customer_deletion' }
}

/**
 * Compute a customer-deletion plan. Guarantees:
 *   - every artifact storage key is listed (no orphan objects left in the bucket),
 *   - a non-PII audit stub is preserved,
 *   - legal hold blocks the entire plan.
 * Pure — performs no deletion.
 */
export function planCustomerDeletion(input: DeletionPlanInput): DeletionPlan {
  const blocked = !!input.legalHold
  return {
    orderId: input.orderId,
    blockedByLegalHold: blocked,
    storageKeysToDelete: blocked
      ? []
      : input.artifacts.map((a) => ({ bucket: a.storageBucket, key: a.storageKey })),
    purgePiiFromOrder: !blocked,
    preserveAuditStub: { orderId: input.orderId, reason: 'customer_deletion' },
  }
}

// ---------------------------------------------------------------------------
// Expired-artifact access (deny + require re-mint)
// ---------------------------------------------------------------------------

export interface ExpiredAccessDecision {
  allowed: boolean
  reason: 'ok' | 'expired' | 'legal_hold_overrides_expiry'
}

/**
 * Decide whether an expired artifact may still be accessed. Default: an expired
 * artifact is NOT served (access denied). A legal hold KEEPS the artifact accessible
 * to authorized internal review even past the normal expiry (hold overrides expiry).
 */
export function decideExpiredArtifactAccess(
  artifactCreatedAt: string,
  opts: { legalHold?: boolean } = {},
  policy = getRetentionPolicy(),
  now: Date = new Date(),
): ExpiredAccessDecision {
  const expired = isExpired(artifactCreatedAt, policy.artifactDays, now)
  if (!expired) return { allowed: true, reason: 'ok' }
  if (opts.legalHold) return { allowed: true, reason: 'legal_hold_overrides_expiry' }
  return { allowed: false, reason: 'expired' }
}
