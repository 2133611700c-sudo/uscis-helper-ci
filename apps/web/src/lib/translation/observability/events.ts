/**
 * translation/observability/events — PII-SAFE typed event emitter for the Phase 2
 * Translation Operator Pipeline V2 (orders / operator / artifact / delivery /
 * payment-boundary).
 *
 * ── DESIGN ───────────────────────────────────────────────────────────────────
 * This is a thin, structured `console.info` wrapper (the project has no central
 * telemetry backend; the existing pattern is `docintel/documentClassMetric.ts`,
 * which emits one structured `console.info` line). Emitting here is:
 *   - ADDITIVE — it never changes caller behavior and never throws into the caller.
 *   - SILENT by default unless PHASE2_EVENTS_ENABLED=1 (so wiring is safe in prod
 *     SHADOW without log noise), EXCEPT that `buildEvent()` is always pure/testable.
 *
 * ── PII GATE (load-bearing) ──────────────────────────────────────────────────
 * The dimension type makes PII *unrepresentable*: only an allowlisted set of
 * dimension keys may be carried, and `assertPiiSafe()` (also run at emit time)
 * rejects any forbidden key and any value that looks like an email or a long
 * free-text blob. ALLOWED dims: product, route, mode, deployment SHA, status code,
 * event code, field count, field keys, truncated hash, synthetic marker, duration
 * bucket, internal UUID, attempt count, error code, boolean verify flags.
 * FORBIDDEN: names/email/DOB/address/doc numbers/OCR text/raw-normalized-final
 * values/full canonical id/evidence text/raw Stripe payload.
 */

// ---------------------------------------------------------------------------
// Event codes (closed enum per domain)
// ---------------------------------------------------------------------------

export const ORDER_EVENTS = [
  'orders_created_total',
  'orders_by_state',
  'order_transition_failures_total',
  'stale_version_conflicts_total',
] as const

export const OPERATOR_EVENTS = [
  'operator_queue_depth',
  'orders_waiting_review_age',
  'operator_override_total',
  'operator_auth_denied_total',
] as const

export const ARTIFACT_EVENTS = [
  'artifact_generation_total',
  'artifact_generation_failures_total',
  'artifact_hash_mismatch_total',
  'artifact_storage_failures_total',
] as const

export const DELIVERY_EVENTS = [
  'outbox_pending_count',
  'outbox_oldest_age',
  'outbox_claim_failures_total',
  'delivery_attempts_total',
  'delivery_success_total',
  'delivery_failure_total',
  'delivery_duplicate_prevented_total',
] as const

export const PAYMENT_BOUNDARY_EVENTS = [
  'webhook_received_total',
  'webhook_signature_failure_total',
  'webhook_duplicate_total',
  'webhook_amount_mismatch_total',
  'webhook_price_mismatch_total',
  'payment_to_order_latency',
  'payment_succeeded_order_missing',
] as const

export const PHASE2_EVENT_CODES = [
  ...ORDER_EVENTS,
  ...OPERATOR_EVENTS,
  ...ARTIFACT_EVENTS,
  ...DELIVERY_EVENTS,
  ...PAYMENT_BOUNDARY_EVENTS,
] as const

export type Phase2EventCode = (typeof PHASE2_EVENT_CODES)[number]

export type Phase2EventDomain =
  | 'orders'
  | 'operator'
  | 'artifact'
  | 'delivery'
  | 'payment_boundary'

const DOMAIN_OF: Record<Phase2EventCode, Phase2EventDomain> = (() => {
  const m = {} as Record<Phase2EventCode, Phase2EventDomain>
  for (const c of ORDER_EVENTS) m[c] = 'orders'
  for (const c of OPERATOR_EVENTS) m[c] = 'operator'
  for (const c of ARTIFACT_EVENTS) m[c] = 'artifact'
  for (const c of DELIVERY_EVENTS) m[c] = 'delivery'
  for (const c of PAYMENT_BOUNDARY_EVENTS) m[c] = 'payment_boundary'
  return m
})()

// ---------------------------------------------------------------------------
// Allowed dimensions (the ONLY keys an event may carry)
// ---------------------------------------------------------------------------

export type DurationBucket = 'lt1s' | 'lt5s' | 'lt30s' | 'lt5m' | 'gte5m'

/**
 * The closed dimension shape. Anything not in this interface is rejected by
 * `assertPiiSafe()`. Every field is OPTIONAL — emit only what is known.
 */
export interface Phase2EventDims {
  /** Product slug. */
  product?: 'translation' | 'tps' | 'reparole' | 'ead'
  /** Route/path label, e.g. 'submit-order' (no query string, no ids). */
  route?: string
  /** Continuity mode. */
  mode?: 'off' | 'shadow' | 'enforce'
  /** Deployment SHA (truncated git sha is fine). */
  deployment_sha?: string
  /** HTTP status code. */
  status_code?: number
  /** Order/outbox state label. */
  state?: string
  /** Count of fields (NOT the field values). */
  field_count?: number
  /** Field KEYS only (e.g. 'given_name') — never field VALUES. */
  field_keys?: string[]
  /** Truncated hash (<= 16 hex chars) — never a full canonical id or full sha. */
  truncated_hash?: string
  /** Synthetic/test marker. */
  synthetic?: boolean
  /** Bucketed duration (never raw ms tied to a person). */
  duration_bucket?: DurationBucket
  /** Internal opaque UUID (order/outbox/artifact id) — allowed (not PII). */
  internal_uuid?: string
  /** Delivery attempt counter. */
  attempt_count?: number
  /** PII-free machine error code (e.g. 'ORDER_VERSION_CONFLICT'). */
  error_code?: string
  /** Boolean hash-verify / precondition flags. */
  hash_verified?: boolean
  /** Generic boolean facts (e.g. has_canonical). */
  has_canonical?: boolean
  /** Age in whole seconds (queue/outbox age) — a duration, not PII. */
  age_seconds?: number
  /** A numeric gauge value (depth/count). */
  value?: number
}

/** The exact allowed dimension keys (kept in sync with Phase2EventDims). */
export const ALLOWED_DIM_KEYS = new Set<string>([
  'product',
  'route',
  'mode',
  'deployment_sha',
  'status_code',
  'state',
  'field_count',
  'field_keys',
  'truncated_hash',
  'synthetic',
  'duration_bucket',
  'internal_uuid',
  'attempt_count',
  'error_code',
  'hash_verified',
  'has_canonical',
  'age_seconds',
  'value',
])

/**
 * Keys that are NEVER allowed — a defense-in-depth denylist. Even if someone widens
 * the interface, these substrings trip the PII gate.
 */
const FORBIDDEN_KEY_SUBSTRINGS = [
  'email',
  'name',
  'dob',
  'birth',
  'address',
  'passport',
  'a_number',
  'anumber',
  'a-number',
  'i94',
  'i-94',
  'phone',
  'recipient', // recipientRef/recipient_email — use truncated_hash instead
  'ocr',
  'raw',
  'text',
  'value_text',
  'evidence',
  'payload',
  'stripe_payload',
  'full_canonical',
  'canonical_id',
]

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
const MAX_STRING_LEN = 64

export interface Phase2Event {
  kind: 'phase2_event'
  domain: Phase2EventDomain
  code: Phase2EventCode
  dims: Phase2EventDims
  /** UTC ISO timestamp (timezone-aware). */
  ts: string
}

export class PiiSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PiiSafetyError'
  }
}

/**
 * Reject any forbidden dimension key, any unknown key, any email-looking value, and
 * any over-long free-text value. Throws PiiSafetyError on violation. Pure/testable.
 */
export function assertPiiSafe(dims: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(dims)) {
    const lk = key.toLowerCase()
    if (!ALLOWED_DIM_KEYS.has(key)) {
      throw new PiiSafetyError(`forbidden/unknown dim key: ${key}`)
    }
    for (const bad of FORBIDDEN_KEY_SUBSTRINGS) {
      if (lk.includes(bad)) {
        throw new PiiSafetyError(`forbidden dim key (matches "${bad}"): ${key}`)
      }
    }
    if (val == null) continue
    const checkString = (s: string, ctx: string) => {
      if (EMAIL_RE.test(s)) throw new PiiSafetyError(`email-like value in ${ctx}`)
      // field_keys are short identifiers; truncated_hash <= 16; other strings <= 64.
      const limit = key === 'truncated_hash' ? 16 : MAX_STRING_LEN
      if (s.length > limit) throw new PiiSafetyError(`over-long value in ${ctx} (>${limit})`)
    }
    if (typeof val === 'string') {
      checkString(val, key)
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === 'string') checkString(item, `${key}[]`)
      }
    }
  }
}

/** Build the PII-safe event record (pure; testable without emitting). */
export function buildEvent(code: Phase2EventCode, dims: Phase2EventDims = {}): Phase2Event {
  // Strip undefined keys so JSON is compact and the PII gate sees only real keys.
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(dims)) {
    if (v !== undefined) clean[k] = v
  }
  assertPiiSafe(clean)
  return {
    kind: 'phase2_event',
    domain: DOMAIN_OF[code],
    code,
    dims: clean as Phase2EventDims,
    ts: new Date().toISOString(),
  }
}

/** Map a raw duration in ms to a coarse bucket (never carries exact timing per user). */
export function durationBucket(ms: number): DurationBucket {
  if (ms < 1_000) return 'lt1s'
  if (ms < 5_000) return 'lt5s'
  if (ms < 30_000) return 'lt30s'
  if (ms < 300_000) return 'lt5m'
  return 'gte5m'
}

/** Truncate a hash/sha to <=16 hex chars (PII-safe correlation handle). */
export function truncateHash(hash: string | null | undefined): string | undefined {
  if (!hash) return undefined
  return hash.replace(/[^a-f0-9]/gi, '').slice(0, 16) || undefined
}

/**
 * Emit a PII-safe event. NEVER throws into the caller: a PII violation is logged as
 * a safety error WITHOUT the offending payload, and emission is otherwise silent
 * unless PHASE2_EVENTS_ENABLED=1. The deployment SHA is auto-attached when present.
 */
export function emitEvent(code: Phase2EventCode, dims: Phase2EventDims = {}): void {
  try {
    const withSha: Phase2EventDims = {
      deployment_sha:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
        process.env.DEPLOYMENT_SHA?.slice(0, 8),
      ...dims,
    }
    const event = buildEvent(code, withSha)
    if (process.env.PHASE2_EVENTS_ENABLED !== '1') return
    // eslint-disable-next-line no-console
    console.info('[phase2_event]', JSON.stringify(event))
  } catch (e) {
    // Defense in depth: a PII violation must fail closed (drop the event) and never
    // leak the payload into logs.
    // eslint-disable-next-line no-console
    console.error('[phase2_event] dropped (pii_gate)', e instanceof Error ? e.name : 'error', code)
  }
}
