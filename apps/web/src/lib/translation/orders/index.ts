/**
 * translation/orders — typed data-access for the Phase 2 Translation Operator Pipeline V2.
 *
 * This is the ONLY sanctioned TS surface for the durable order aggregate. The underlying table is
 * `translation_orders_v2` (the legacy `translation_orders` table is a separate, untouched entity).
 *
 * ─ STATE MACHINE ────────────────────────────────────────────────────────────────────────────────
 * An order's status/version may change ONLY through transition_translation_order(). A BEFORE UPDATE
 * trigger blocks any direct status/version change (service_role bypasses RLS, so the invariant is a
 * DB trigger, not a policy). Optimistic concurrency: every transition asserts the expected status AND
 * version under an advisory lock; a mismatch raises ORDER_STATE_CONFLICT / ORDER_VERSION_CONFLICT.
 *
 * ─ OPERATOR OVERRIDES (no parallel authority) ───────────────────────────────────────────────────
 * Operator edits are NOT stored in a mutable translated_fields table. They REUSE the canonical
 * override channel: appendCanonicalOverride(..., source='operator_override', confirmed=true,
 * actor=<operator id>). The effective translated value is always obtained by resolving the canonical
 * document (resolveCanonicalDocument), which applies confirmed overrides over the immutable base.
 * Base canonical evidence/rejection reasons are never mutated. See applyOperatorOverride() below.
 *
 * ─ ARTIFACTS + OUTBOX ───────────────────────────────────────────────────────────────────────────
 * createArtifactAndEnqueue() runs ONE DB transaction: insert immutable document_artifacts, transition
 * the order approved_for_render → artifact_generated → delivery_pending, and insert a delivery_outbox
 * row. A failure rolls the whole thing back (no orphan outbox). claimOutboxEvent() claims one due row
 * with FOR UPDATE SKIP LOCKED so duplicate workers cannot double-send. Email send happens OUTSIDE the
 * transaction, after a successful claim.
 *
 * ─ PII ──────────────────────────────────────────────────────────────────────────────────────────
 * Never log field values or raw emails. verified_recipient_email comes from Stripe only and is never
 * client-authoritative. recipient_ref in the outbox is an opaque/hashed reference, never a raw email.
 */

import { createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  appendCanonicalOverride,
  resolveCanonicalDocument,
  type CanonicalOverride,
} from '@/lib/canonical/persistence'
import type { CanonicalDocumentResult } from '@/lib/canonical/types'

// ---------------------------------------------------------------------------
// Status model
// ---------------------------------------------------------------------------

export const TRANSLATION_ORDER_STATUSES = [
  'queued',
  'assigned',
  'in_review',
  'needs_user_clarification',
  'approved_for_render',
  'artifact_generated',
  'delivery_pending',
  'delivered',
  'delivery_failed',
  'cancelled',
] as const

export type TranslationOrderStatus = (typeof TRANSLATION_ORDER_STATUSES)[number]

export interface TranslationOrder {
  id: string
  checkoutSessionId: string
  canonicalDocumentId: string | null
  product: 'translation'
  verifiedRecipientEmail: string | null
  documentType: string | null
  sourceLanguage: string | null
  locale: string | null
  status: TranslationOrderStatus
  version: number
  legacy: boolean
  createdAt: string
  updatedAt: string
  paidAt: string | null
  completedAt: string | null
  expiresAt: string | null
}

export interface DocumentArtifact {
  id: string
  orderId: string
  canonicalDocumentId: string | null
  baseCanonicalHash: string | null
  resolvedCanonicalHash: string | null
  overrideSetHash: string | null
  overrideVersion: number | null
  canonicalSchemaVersion: string | null
  rendererVersion: string | null
  storageBucket: string
  storageKey: string
  artifactSha256: string
  mimeType: string
  byteSize: number
  artifactVersion: number
  generatedBy: string
  generatedAt: string
  deliveryStatus: string | null
}

export interface ClaimedOutboxEvent {
  id: string
  orderId: string
  artifactId: string
  destinationType: string
  recipientRef: string | null
  idempotencyKey: string
  attemptCount: number
}

/** Storage bucket for generated artifacts (private). */
export const TRANSLATION_ARTIFACTS_BUCKET = 'translation-artifacts'

// ---------------------------------------------------------------------------
// Typed errors (PII-free, machine-parseable)
// ---------------------------------------------------------------------------

export type OrderErrorCode =
  | 'ORDER_STATE_CONFLICT'
  | 'ORDER_VERSION_CONFLICT'
  | 'ORDER_INVALID_TRANSITION'
  | 'ORDER_ACTOR_REQUIRED'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_DUPLICATE_DELIVERY'
  | 'ORDER_STORAGE_UNAVAILABLE'

export class TranslationOrderError extends Error {
  readonly code: OrderErrorCode
  constructor(code: OrderErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'TranslationOrderError'
    this.code = code
  }
}

/** Map a raw Postgres/PostgREST error message to a typed order error code, or null if unknown. */
export function classifyOrderError(message: string | undefined): OrderErrorCode | null {
  if (!message) return null
  if (message.includes('ORDER_STATE_CONFLICT')) return 'ORDER_STATE_CONFLICT'
  if (message.includes('ORDER_VERSION_CONFLICT')) return 'ORDER_VERSION_CONFLICT'
  if (message.includes('ORDER_VERSION_DECREMENT_FORBIDDEN')) return 'ORDER_VERSION_CONFLICT'
  if (message.includes('ORDER_INVALID_TRANSITION')) return 'ORDER_INVALID_TRANSITION'
  if (message.includes('ORDER_ACTOR_REQUIRED')) return 'ORDER_ACTOR_REQUIRED'
  if (message.includes('ORDER_NOT_FOUND')) return 'ORDER_NOT_FOUND'
  // unique_violation on idempotency_key or checkout_session_id
  if (message.includes('idempotency_key') || message.includes('duplicate key')) {
    return 'ORDER_DUPLICATE_DELIVERY'
  }
  return null
}

function throwTyped(message: string | undefined, fallback: OrderErrorCode): never {
  const code = classifyOrderError(message)
  throw new TranslationOrderError(code ?? fallback, message)
}

// ---------------------------------------------------------------------------
// Supabase service-role client (server-side only — never expose to browser)
// ---------------------------------------------------------------------------

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new TranslationOrderError(
      'ORDER_STORAGE_UNAVAILABLE',
      '[translation/orders] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set'
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToOrder(row: Record<string, unknown>): TranslationOrder {
  return {
    id: row.id as string,
    checkoutSessionId: row.checkout_session_id as string,
    canonicalDocumentId: (row.canonical_document_id as string | null) ?? null,
    product: 'translation',
    verifiedRecipientEmail: (row.verified_recipient_email as string | null) ?? null,
    documentType: (row.document_type as string | null) ?? null,
    sourceLanguage: (row.source_language as string | null) ?? null,
    locale: (row.locale as string | null) ?? null,
    status: row.status as TranslationOrderStatus,
    version: row.version as number,
    legacy: (row.legacy as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    paidAt: (row.paid_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
  }
}

function rowToArtifact(row: Record<string, unknown>): DocumentArtifact {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    canonicalDocumentId: (row.canonical_document_id as string | null) ?? null,
    baseCanonicalHash: (row.base_canonical_hash as string | null) ?? null,
    resolvedCanonicalHash: (row.resolved_canonical_hash as string | null) ?? null,
    overrideSetHash: (row.override_set_hash as string | null) ?? null,
    overrideVersion: (row.override_version as number | null) ?? null,
    canonicalSchemaVersion: (row.canonical_schema_version as string | null) ?? null,
    rendererVersion: (row.renderer_version as string | null) ?? null,
    storageBucket: row.storage_bucket as string,
    storageKey: row.storage_key as string,
    artifactSha256: row.artifact_sha256 as string,
    mimeType: row.mime_type as string,
    byteSize: Number(row.byte_size),
    artifactVersion: row.artifact_version as number,
    generatedBy: row.generated_by as string,
    generatedAt: row.generated_at as string,
    deliveryStatus: (row.delivery_status as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// 1. createOrGetOrder — idempotent on checkout_session_id
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  /** Stripe checkout session id — the capability + idempotency key. */
  checkoutSessionId: string
  /** Stripe-verified recipient email (never client-supplied). */
  verifiedRecipientEmail?: string | null
  canonicalDocumentId?: string | null
  documentType?: string | null
  sourceLanguage?: string | null
  locale?: string | null
  /** Orders without a canonical binding are legacy/manual. */
  legacy?: boolean
  expiresAt?: string | null
}

/**
 * Idempotently create the order for a checkout session. Concurrent duplicate submits for the same
 * checkout_session_id collapse to ONE row (UNIQUE constraint): on conflict we re-select the existing
 * row rather than mutating it. Returns the order and whether it already existed.
 */
export async function createOrGetOrder(
  input: CreateOrderInput
): Promise<{ order: TranslationOrder; created: boolean }> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('translation_orders_v2')
    .insert({
      checkout_session_id: input.checkoutSessionId,
      product: 'translation',
      verified_recipient_email: input.verifiedRecipientEmail ?? null,
      canonical_document_id: input.canonicalDocumentId ?? null,
      document_type: input.documentType ?? null,
      source_language: input.sourceLanguage ?? null,
      locale: input.locale ?? null,
      legacy: input.legacy ?? input.canonicalDocumentId == null,
      expires_at: input.expiresAt ?? null,
    })
    .select('*')
    .maybeSingle()

  if (!error && data) {
    return { order: rowToOrder(data as Record<string, unknown>), created: true }
  }

  // Conflict (duplicate checkout_session_id) → re-select the existing row.
  if (error && (error.code === '23505' || error.message?.includes('duplicate key'))) {
    const existing = await getOrderByCheckout(input.checkoutSessionId)
    if (existing) return { order: existing, created: false }
  }
  if (error) {
    throw new TranslationOrderError(
      'ORDER_STORAGE_UNAVAILABLE',
      `[translation/orders] createOrGetOrder failed: ${error.message}`
    )
  }
  // No data, no error → re-select.
  const existing = await getOrderByCheckout(input.checkoutSessionId)
  if (existing) return { order: existing, created: false }
  throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', 'createOrGetOrder: no row after insert')
}

// ---------------------------------------------------------------------------
// 2. Read helpers
// ---------------------------------------------------------------------------

export async function getOrderById(id: string): Promise<TranslationOrder | null> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('translation_orders_v2')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `getOrderById: ${error.message}`)
  }
  return data ? rowToOrder(data as Record<string, unknown>) : null
}

export async function getOrderByCheckout(
  checkoutSessionId: string
): Promise<TranslationOrder | null> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('translation_orders_v2')
    .select('*')
    .eq('checkout_session_id', checkoutSessionId)
    .maybeSingle()
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `getOrderByCheckout: ${error.message}`)
  }
  return data ? rowToOrder(data as Record<string, unknown>) : null
}

// ---------------------------------------------------------------------------
// 3. bindCanonicalDocument — set the canonical binding once (NULL → value)
// ---------------------------------------------------------------------------

/**
 * Bind an order to its canonical document. The DB trigger forbids re-pointing an existing binding
 * (ORDER_CANONICAL_REBIND_FORBIDDEN). This is NOT a status transition, so it does not bump version.
 */
export async function bindCanonicalDocument(
  orderId: string,
  canonicalDocumentId: string
): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase
    .from('translation_orders_v2')
    .update({ canonical_document_id: canonicalDocumentId, legacy: false })
    .eq('id', orderId)
    .is('canonical_document_id', null)
  if (error) {
    throwTyped(error.message, 'ORDER_STORAGE_UNAVAILABLE')
  }
}

// ---------------------------------------------------------------------------
// 4. transitionOrder — the ONLY status/version mutator
// ---------------------------------------------------------------------------

export interface TransitionInput {
  orderId: string
  expectedVersion: number
  expectedStatus: TranslationOrderStatus
  toStatus: TranslationOrderStatus
  /** PII-free actor id, e.g. 'operator:123' or 'system'. Required (non-null/non-empty). */
  actor: string
  reason?: string
  /** PII-free metadata (keys/counts/status only — never field values). */
  metadata?: Record<string, unknown>
}

export async function transitionOrder(
  input: TransitionInput
): Promise<{ status: TranslationOrderStatus; version: number }> {
  const supabase = getClient()
  const { data, error } = await supabase.rpc('transition_translation_order', {
    p_order_id: input.orderId,
    p_expected_version: input.expectedVersion,
    p_expected_status: input.expectedStatus,
    p_to_status: input.toStatus,
    p_actor: input.actor,
    p_reason: input.reason ?? null,
    p_metadata: input.metadata ?? {},
  })
  if (error) {
    throwTyped(error.message, 'ORDER_STORAGE_UNAVAILABLE')
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
  return { status: row.new_status as TranslationOrderStatus, version: row.new_version as number }
}

// ---------------------------------------------------------------------------
// 5. applyOperatorOverride — reuse the canonical override channel (no parallel authority)
// ---------------------------------------------------------------------------

export interface OperatorOverrideInput {
  fieldKey: string
  /** null = explicit reject (INV-11). string = the operator's corrected value. */
  value: string | null
  /** PII-free operator id, e.g. 'operator:123'. */
  operatorId: string
  reason?: string
  /** Audit chain: the override this supersedes, if any. */
  supersedesId?: string | null
  /** Preserved from the base field's rejection reasons (audit chain). */
  originalRejectionReasons?: string[]
}

/**
 * Apply confirmed operator edits to a canonical document via the canonical override channel.
 * source='operator_override', confirmed=true. The base canonical row is never mutated; the effective
 * translated value is obtained by resolveOrderCanonical(). Optimistic concurrency: pass the override
 * version the caller last saw (default 0 = no overrides yet). Throws on OVERRIDE_VERSION_CONFLICT.
 *
 * Returns the new MAX(override version).
 */
export async function applyOperatorOverride(
  canonicalDocumentId: string,
  edits: OperatorOverrideInput[],
  options?: { expectedVersion?: number }
): Promise<number> {
  const overrides: CanonicalOverride[] = edits.map((e) => ({
    fieldKey: e.fieldKey,
    overrideValue: e.value,
    source: 'operator_override' as unknown as CanonicalOverride['source'],
    confirmed: true,
    actor: e.operatorId,
    reason: e.reason,
    supersedesId: e.supersedesId ?? null,
    originalRejectionReasons: e.originalRejectionReasons,
  }))
  return appendCanonicalOverride(canonicalDocumentId, overrides, options)
}

/**
 * The effective translated document for an order: the canonical base with confirmed operator
 * overrides applied. Returns null when the order has no canonical binding or the canonical is missing.
 */
export async function resolveOrderCanonical(
  order: Pick<TranslationOrder, 'canonicalDocumentId'>
): Promise<CanonicalDocumentResult | null> {
  if (!order.canonicalDocumentId) return null
  return resolveCanonicalDocument(order.canonicalDocumentId)
}

// ---------------------------------------------------------------------------
// 6. createArtifactAndEnqueue — atomic artifact + transition + outbox
// ---------------------------------------------------------------------------

export interface CreateArtifactInput {
  orderId: string
  /** Expected order version; the order must currently be 'approved_for_render'. */
  expectedVersion: number
  /** PII-free actor id. */
  actor: string
  canonicalDocumentId?: string | null
  baseCanonicalHash?: string | null
  resolvedCanonicalHash?: string | null
  overrideSetHash?: string | null
  overrideVersion?: number | null
  canonicalSchemaVersion?: string | null
  rendererVersion?: string | null
  storageBucket: string
  storageKey: string
  artifactSha256: string
  mimeType: string
  byteSize: number
  generatedBy: string
  artifactMetadata?: Record<string, unknown> | null
  /** Opaque/hashed recipient reference — never a raw email. */
  recipientRef?: string | null
  /** Globally unique idempotency key for delivery. Duplicate → ORDER_DUPLICATE_DELIVERY. */
  idempotencyKey: string
  destinationType?: string
}

export async function createArtifactAndEnqueue(
  input: CreateArtifactInput
): Promise<{ artifactId: string; outboxId: string; version: number }> {
  const supabase = getClient()
  const { data, error } = await supabase.rpc('create_artifact_and_enqueue', {
    p_order_id: input.orderId,
    p_expected_version: input.expectedVersion,
    p_actor: input.actor,
    p_canonical_document_id: input.canonicalDocumentId ?? null,
    p_base_canonical_hash: input.baseCanonicalHash ?? null,
    p_resolved_canonical_hash: input.resolvedCanonicalHash ?? null,
    p_override_set_hash: input.overrideSetHash ?? null,
    p_override_version: input.overrideVersion ?? null,
    p_canonical_schema_version: input.canonicalSchemaVersion ?? null,
    p_renderer_version: input.rendererVersion ?? null,
    p_storage_bucket: input.storageBucket,
    p_storage_key: input.storageKey,
    p_artifact_sha256: input.artifactSha256,
    p_mime_type: input.mimeType,
    p_byte_size: input.byteSize,
    p_generated_by: input.generatedBy,
    p_artifact_metadata: input.artifactMetadata ?? null,
    p_recipient_ref: input.recipientRef ?? null,
    p_idempotency_key: input.idempotencyKey,
    p_destination_type: input.destinationType ?? 'email',
  })
  if (error) {
    throwTyped(error.message, 'ORDER_STORAGE_UNAVAILABLE')
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
  return {
    artifactId: row.artifact_id as string,
    outboxId: row.outbox_id as string,
    version: row.new_version as number,
  }
}

export async function listOrderArtifacts(orderId: string): Promise<DocumentArtifact[]> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('document_artifacts')
    .select('*')
    .eq('order_id', orderId)
    .order('artifact_version', { ascending: true })
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `listOrderArtifacts: ${error.message}`)
  }
  return (data ?? []).map((r) => rowToArtifact(r as Record<string, unknown>))
}

// ---------------------------------------------------------------------------
// 7. claimOutboxEvent + delivery state updates
// ---------------------------------------------------------------------------

/**
 * Claim one due delivery_outbox row (FOR UPDATE SKIP LOCKED) for exactly-once delivery. Returns null
 * when nothing is due. The claimed row is marked 'claimed' and attempt_count incremented; the worker
 * must then send (outside any DB transaction) and call markDelivered / markDeliveryFailed.
 */
export async function claimOutboxEvent(worker: string): Promise<ClaimedOutboxEvent | null> {
  const supabase = getClient()
  const { data, error } = await supabase.rpc('claim_outbox_event', { p_worker: worker })
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `claimOutboxEvent: ${error.message}`)
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row || !row.id) return null
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    artifactId: row.artifact_id as string,
    destinationType: row.destination_type as string,
    recipientRef: (row.recipient_ref as string | null) ?? null,
    idempotencyKey: row.idempotency_key as string,
    attemptCount: row.attempt_count as number,
  }
}

/** Mark a claimed outbox row delivered. Does NOT transition the order — the worker does that. */
export async function markOutboxDelivered(outboxId: string): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase
    .from('delivery_outbox')
    .update({ state: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', outboxId)
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `markOutboxDelivered: ${error.message}`)
  }
}

/**
 * Mark a claimed outbox row failed and schedule a retry. PII-free error code only.
 */
export async function markOutboxFailed(
  outboxId: string,
  errorCode: string,
  nextAttemptAt: Date
): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase
    .from('delivery_outbox')
    .update({ state: 'retry', last_error_code: errorCode, next_attempt_at: nextAttemptAt.toISOString() })
    .eq('id', outboxId)
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `markOutboxFailed: ${error.message}`)
  }
}

/** Mark a claimed outbox row permanently failed (no further retries). PII-free code only. */
export async function markOutboxPermanentlyFailed(
  outboxId: string,
  errorCode: string
): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase
    .from('delivery_outbox')
    .update({ state: 'failed', last_error_code: errorCode, next_attempt_at: null })
    .eq('id', outboxId)
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `markOutboxPermanentlyFailed: ${error.message}`)
  }
}

/** Load a single artifact row by id (worker delivers the EXACT stored bytes — never re-renders). */
export async function getArtifactById(artifactId: string): Promise<DocumentArtifact | null> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('document_artifacts')
    .select('*')
    .eq('id', artifactId)
    .maybeSingle()
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `getArtifactById: ${error.message}`)
  }
  return data ? rowToArtifact(data as Record<string, unknown>) : null
}

/**
 * Download the exact stored artifact bytes from the private bucket and verify the
 * SHA-256 matches the stored hash. Throws on mismatch (tamper / corruption) — the
 * worker MUST NOT deliver bytes that don't match the certification hash.
 */
export async function downloadArtifactBytes(
  artifact: Pick<DocumentArtifact, 'storageBucket' | 'storageKey' | 'artifactSha256'>
): Promise<Buffer> {
  const supabase = getClient()
  const { data, error } = await supabase.storage
    .from(artifact.storageBucket)
    .download(artifact.storageKey)
  if (error || !data) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `downloadArtifactBytes: ${error?.message ?? 'no data'}`)
  }
  const bytes = Buffer.from(await data.arrayBuffer())
  const sha = createHash('sha256').update(bytes).digest('hex')
  if (sha !== artifact.artifactSha256) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', 'downloadArtifactBytes: artifact hash mismatch')
  }
  return bytes
}

// ---------------------------------------------------------------------------
// 7b. Stripe webhook processed-events dedupe ledger
// ---------------------------------------------------------------------------

export interface RecordProcessedEventInput {
  /** Stripe event id (evt_...) — the webhook idempotency key. Never PII. */
  stripeEventId: string
  eventType: string
  /** Opaque Stripe checkout session id (cs_...) when applicable. */
  checkoutSessionId?: string | null
  /** Internal V2 order uuid this event resolved to (if any). */
  orderId?: string | null
  /** PII-free machine result code. */
  resultCode?: string | null
}

/**
 * Idempotently record a processed Stripe webhook event. Returns inserted=true when THIS caller is
 * the first to record the event id (it should process the event) or inserted=false on a duplicate
 * (already recorded → skip re-processing: no second audit transition, no second outbox event).
 */
export async function recordStripeProcessedEvent(
  input: RecordProcessedEventInput
): Promise<{ inserted: boolean }> {
  const supabase = getClient()
  const { data, error } = await supabase.rpc('record_stripe_processed_event', {
    p_stripe_event_id: input.stripeEventId,
    p_event_type: input.eventType,
    p_checkout_session_id: input.checkoutSessionId ?? null,
    p_order_id: input.orderId ?? null,
    p_result_code: input.resultCode ?? null,
  })
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `recordStripeProcessedEvent: ${error.message}`)
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return { inserted: (row?.inserted as boolean) ?? false }
}

/** True if a Stripe event id has already been processed (PII-free existence check). */
export async function isStripeEventProcessed(stripeEventId: string): Promise<boolean> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('stripe_processed_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle()
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `isStripeEventProcessed: ${error.message}`)
  }
  return !!data
}

// ---------------------------------------------------------------------------
// 8. Admin cleanup (synthetic sentinel rows only)
// ---------------------------------------------------------------------------

/**
 * Delete synthetic PHASE2_TEST_ rows past the immutability triggers. Refuses any non-PHASE2_TEST_
 * prefix at the DB layer. Service-role only. Returns the number of orders deleted.
 */
export async function phase2AdminCleanup(prefix: string): Promise<number> {
  if (!prefix.startsWith('PHASE2_TEST_')) {
    throw new TranslationOrderError(
      'ORDER_STORAGE_UNAVAILABLE',
      'phase2AdminCleanup: prefix must start with PHASE2_TEST_'
    )
  }
  const supabase = getClient()
  const { data, error } = await supabase.rpc('phase2_admin_cleanup', { p_prefix: prefix })
  if (error) {
    throw new TranslationOrderError('ORDER_STORAGE_UNAVAILABLE', `phase2AdminCleanup: ${error.message}`)
  }
  return (data as number) ?? 0
}
