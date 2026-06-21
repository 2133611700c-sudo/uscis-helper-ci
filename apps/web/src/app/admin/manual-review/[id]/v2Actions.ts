'use server'

/**
 * V2 operator Server Actions for the Translation Operator Pipeline.
 *
 * Every exported action:
 *   1. calls requireTranslationOperator() FIRST (independent auth at the mutation
 *      boundary — never relies on page-render visibility / middleware alone)
 *   2. loads the order and asserts expected version + status (optimistic
 *      concurrency; a stale tab raises ORDER_VERSION_CONFLICT → surfaced to UI)
 *   3. performs exactly one audited transition / override
 *
 * AUTH (audit #195): the guard is main's ./legacyOperatorAuth helper
 *   (requireTranslationOperator / OperatorAuthError). It is STRONGER than #119's
 *   discarded lib/auth helper (it re-verifies the Stripe recipient elsewhere and
 *   fails closed on a missing/invalid admin session). The #119 auth helper is NOT
 *   ported and NOT referenced. requireTranslationOperator() returns { actor } —
 *   a PII-free actor label recorded in every audited transition / override.
 *
 * Authority rules:
 *   - Field edits go through the canonical override channel (source='operator_override',
 *     confirmed=true) — the immutable base canonical is NEVER mutated.
 *   - recipientEmail from editable FormData is NOT authoritative. A recipient change
 *     is a SEPARATE audited action (changeRecipient) requiring actor + reason +
 *     old-recipient hash + new verified recipient + explicit confirm.
 *   - approveForRender renders ONCE from the resolved canonical and persists the
 *     immutable artifact + outbox in one txn. It does NOT email.
 *
 * PII: never log field values or raw emails. Actor is opaque ('translation_operator').
 */

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { requireTranslationOperator, OperatorAuthError } from './legacyOperatorAuth'
import {
  getOrderById,
  transitionOrder,
  applyOperatorOverride,
  createArtifactAndEnqueue,
  TranslationOrderError,
  TRANSLATION_ARTIFACTS_BUCKET,
  type TranslationOrder,
  type TranslationOrderStatus,
} from '@/lib/translation/orders'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { renderFromCanonical } from '@/lib/translation/orders/renderFromCanonical'
import { emitEvent } from '@/lib/translation/observability/events'

export interface ActionResult {
  ok: boolean
  error?: string
  status?: number
  version?: number
}

function fail(e: unknown): ActionResult {
  if (e instanceof OperatorAuthError) {
    emitEvent('operator_auth_denied_total', { route: 'operator-action', status_code: e.httpStatus })
    return { ok: false, error: e.message, status: e.httpStatus }
  }
  if (e instanceof TranslationOrderError) {
    if (e.code === 'ORDER_VERSION_CONFLICT' || e.code === 'ORDER_STATE_CONFLICT') {
      emitEvent('stale_version_conflicts_total', { route: 'operator-action', error_code: e.code })
    } else {
      emitEvent('order_transition_failures_total', { route: 'operator-action', error_code: e.code })
    }
    const status =
      e.code === 'ORDER_VERSION_CONFLICT' || e.code === 'ORDER_STATE_CONFLICT'
        ? 409
        : e.code === 'ORDER_NOT_FOUND'
        ? 404
        : e.code === 'ORDER_INVALID_TRANSITION'
        ? 422
        : e.code === 'ORDER_STORAGE_UNAVAILABLE'
        ? 503
        : 400
    return { ok: false, error: e.code, status }
  }
  return { ok: false, error: 'operator_action_failed', status: 500 }
}

/** Load the order and assert it matches the operator's expected version. */
async function loadAtVersion(orderId: string, expectedVersion: number): Promise<TranslationOrder> {
  const order = await getOrderById(orderId)
  if (!order) throw new TranslationOrderError('ORDER_NOT_FOUND')
  if (order.version !== expectedVersion) {
    throw new TranslationOrderError('ORDER_VERSION_CONFLICT')
  }
  return order
}

function parseVersion(formData: FormData): number {
  const raw = formData.get('expectedVersion')
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) throw new TranslationOrderError('ORDER_VERSION_CONFLICT')
  return n
}

async function doTransition(
  order: TranslationOrder,
  to: TranslationOrderStatus,
  actor: string,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  const res = await transitionOrder({
    orderId: order.id,
    expectedVersion: order.version,
    expectedStatus: order.status,
    toStatus: to,
    actor,
    reason,
    metadata,
  })
  return res.version
}

// ── assignOrder: queued → assigned ────────────────────────────────────────────
export async function assignOrder(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    const order = await loadAtVersion(id, expectedVersion)
    const version = await doTransition(order, 'assigned', actor, 'operator_assign')
    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version }
  } catch (e) {
    return fail(e)
  }
}

// ── beginReview: assigned → in_review ─────────────────────────────────────────
export async function beginReview(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    const order = await loadAtVersion(id, expectedVersion)
    const version = await doTransition(order, 'in_review', actor, 'operator_begin_review')
    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version }
  } catch (e) {
    return fail(e)
  }
}

// ── requestClarification: in_review → needs_user_clarification ─────────────────
export async function requestClarification(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    // reason is operator-authored prose; keep it PII-free at the call site.
    const reason = (formData.get('reason') as string | null)?.slice(0, 200) ?? 'clarification_requested'
    const order = await loadAtVersion(id, expectedVersion)
    const version = await doTransition(order, 'needs_user_clarification', actor, 'operator_request_clarification', {
      has_canonical: !!reason,
    })
    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version }
  } catch (e) {
    return fail(e)
  }
}

// ── appendOverride: canonical override channel (no status change) ──────────────
// Per-field provenance: applyOperatorOverride appends a confirmed operator_override
// row carrying { fieldKey, value (old→new resolved by version), operatorId (actor),
// reason } — the immutable base canonical is NEVER overwritten in place.
export async function appendOverride(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    const order = await loadAtVersion(id, expectedVersion)
    if (!order.canonicalDocumentId) {
      return { ok: false, error: 'order_has_no_canonical', status: 409 }
    }

    const fieldKey = (formData.get('fieldKey') as string | null)?.trim()
    if (!fieldKey) return { ok: false, error: 'missing_field_key', status: 422 }
    const rawValue = formData.get('value')
    // Empty submission = explicit reject (null). Non-empty string = corrected value.
    const value =
      rawValue === null || (typeof rawValue === 'string' && rawValue.trim() === '')
        ? null
        : (rawValue as string).trim()
    const expectedOverrideVersion = Number(formData.get('expectedOverrideVersion') ?? 0)

    await applyOperatorOverride(
      order.canonicalDocumentId,
      [{ fieldKey, value, operatorId: actor, reason: 'operator_override' }],
      { expectedVersion: Number.isInteger(expectedOverrideVersion) ? expectedOverrideVersion : 0 },
    )
    emitEvent('operator_override_total', {
      route: 'operator-action',
      internal_uuid: order.id,
      field_keys: [fieldKey],
      field_count: 1,
    })
    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version: order.version }
  } catch (e) {
    // OVERRIDE_VERSION_CONFLICT from the canonical layer → 409
    if (e instanceof Error && e.message?.includes('OVERRIDE_VERSION_CONFLICT')) {
      return { ok: false, error: 'OVERRIDE_VERSION_CONFLICT', status: 409 }
    }
    return fail(e)
  }
}

// ── approveForRender: render ONCE from resolved canonical, persist artifact+outbox ─
export async function approveForRender(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    let order = await loadAtVersion(id, expectedVersion)

    if (!order.canonicalDocumentId) {
      return { ok: false, error: 'order_has_no_canonical', status: 409 }
    }
    if (!order.verifiedRecipientEmail) {
      // The recipient is bound at submit-order from Stripe; without it we cannot deliver.
      return { ok: false, error: 'no_verified_recipient', status: 409 }
    }
    const canonicalDocumentId = order.canonicalDocumentId
    const recipientEmail = order.verifiedRecipientEmail

    // 1. Move to approved_for_render (the state create_artifact_and_enqueue requires).
    if (order.status !== 'approved_for_render') {
      const v = await doTransition(order, 'approved_for_render', actor, 'operator_approve')
      order = { ...order, status: 'approved_for_render', version: v }
    }

    // 2. Render ONCE from the resolved canonical (base + confirmed overrides).
    const render = await renderFromCanonical({
      canonicalDocumentId,
      docType: order.documentType ?? 'other',
      sourceLang: order.sourceLanguage ?? 'uk',
      sessionRef: order.id,
    })

    // 3. Upload the immutable bytes to the private bucket (path includes the sha,
    //    so identical bytes are content-addressed and a retry is a no-op overwrite).
    const supabase = createAdminSupabaseClient()
    const storageKey = `${order.id}/${render.artifactSha256}.pdf`
    const upload = await supabase.storage
      .from(TRANSLATION_ARTIFACTS_BUCKET)
      .upload(storageKey, render.pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (upload.error) {
      emitEvent('artifact_storage_failures_total', {
        route: 'operator-action',
        internal_uuid: order.id,
        error_code: 'artifact_upload_failed',
      })
      return { ok: false, error: 'artifact_upload_failed', status: 503 }
    }

    // 4. Idempotency key binds order + artifact bytes — duplicate approve → same key.
    const idempotencyKey = createHash('sha256')
      .update(`${order.id}:${render.artifactSha256}`)
      .digest('hex')

    // Opaque recipient ref — never the raw email.
    const recipientRef = createHash('sha256')
      .update(recipientEmail.trim().toLowerCase())
      .digest('hex')

    // 5. One txn: artifact row + transition(delivery_pending) + outbox.
    const { version } = await createArtifactAndEnqueue({
      orderId: order.id,
      expectedVersion: order.version,
      actor,
      canonicalDocumentId: render.certification.canonicalDocumentId,
      baseCanonicalHash: render.certification.baseCanonicalHash,
      resolvedCanonicalHash: render.certification.resolvedCanonicalHash,
      overrideSetHash: render.certification.overrideSetHash,
      overrideVersion: render.certification.overrideVersion,
      canonicalSchemaVersion: render.certification.canonicalSchemaVersion,
      rendererVersion: render.certification.rendererVersion,
      storageBucket: TRANSLATION_ARTIFACTS_BUCKET,
      storageKey,
      artifactSha256: render.artifactSha256,
      mimeType: 'application/pdf',
      byteSize: render.byteSize,
      generatedBy: actor,
      artifactMetadata: {
        rendered_keys: render.renderedKeys,
        omitted_null_count: render.omittedNullCount,
      },
      recipientRef,
      idempotencyKey,
      destinationType: 'email',
    })

    emitEvent('artifact_generation_total', {
      route: 'operator-action',
      product: 'translation',
      internal_uuid: order.id,
      truncated_hash: render.artifactSha256.slice(0, 16),
      field_count: render.renderedKeys.length,
      hash_verified: true,
    })
    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version }
  } catch (e) {
    // A render config problem (missing signer) is a precondition, not infra.
    if (e instanceof Error && e.name === 'CanonicalRenderError') {
      const code = (e as { code?: string }).code
      emitEvent('artifact_generation_failures_total', {
        route: 'operator-action',
        error_code: code ?? 'canonical_render_error',
      })
      if (code === 'SIGNER_NOT_CONFIGURED') return { ok: false, error: 'operator_signer_not_configured', status: 409 }
      if (code === 'CANONICAL_NOT_FOUND') return { ok: false, error: 'canonical_not_found', status: 404 }
      return { ok: false, error: 'canonical_storage_unavailable', status: 503 }
    }
    emitEvent('artifact_generation_failures_total', {
      route: 'operator-action',
      error_code: 'artifact_generation_failed',
    })
    return fail(e)
  }
}

// ── retryDelivery: delivery_failed → delivery_pending (re-enqueue, NO re-render) ─
export async function retryDelivery(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    const order = await loadAtVersion(id, expectedVersion)
    if (order.status !== 'delivery_failed') {
      return { ok: false, error: 'order_not_in_failed_state', status: 422 }
    }
    // Re-arm the existing outbox row (no new artifact — the bytes are immutable).
    const supabase = createAdminSupabaseClient()
    const { error } = await supabase
      .from('delivery_outbox')
      .update({ state: 'pending', next_attempt_at: new Date().toISOString() })
      .eq('order_id', order.id)
      .in('state', ['failed', 'retry'])
    if (error) return { ok: false, error: 'outbox_rearm_failed', status: 503 }

    const version = await doTransition(order, 'delivery_pending', actor, 'operator_retry_delivery')
    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version }
  } catch (e) {
    return fail(e)
  }
}

// ── cancelOrder: → cancelled ──────────────────────────────────────────────────
export async function cancelOrder(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    const reason = (formData.get('reason') as string | null)?.slice(0, 200) ?? 'operator_cancel'
    const order = await loadAtVersion(id, expectedVersion)
    const version = await doTransition(order, 'cancelled', actor, 'operator_cancel', { has_canonical: !!reason })
    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version }
  } catch (e) {
    return fail(e)
  }
}

// ── changeRecipient: SEPARATE audited recipient change (NOT from edit fields) ───
/**
 * A recipient change is privileged and audited: it requires an explicit confirm,
 * a reason, and records the old-recipient hash + the new recipient. It does NOT
 * read the recipient from the general edit form. The new recipient should itself
 * be Stripe-verified upstream; here we record the audited change and require the
 * explicit confirm flag so it can never happen as a silent side effect.
 */
export async function changeRecipient(formData: FormData): Promise<ActionResult> {
  try {
    const { actor } = await requireTranslationOperator()
    const id = formData.get('id') as string
    const expectedVersion = parseVersion(formData)
    const confirm = formData.get('confirm') === 'true'
    const reason = (formData.get('reason') as string | null)?.trim()
    const newRecipient = (formData.get('newRecipient') as string | null)?.trim().toLowerCase()
    if (!confirm) return { ok: false, error: 'recipient_change_requires_confirm', status: 422 }
    if (!reason) return { ok: false, error: 'recipient_change_requires_reason', status: 422 }
    if (!newRecipient || !newRecipient.includes('@')) {
      return { ok: false, error: 'invalid_recipient', status: 422 }
    }

    const order = await loadAtVersion(id, expectedVersion)
    const oldHash = order.verifiedRecipientEmail
      ? createHash('sha256').update(order.verifiedRecipientEmail.trim().toLowerCase()).digest('hex')
      : null

    const supabase = createAdminSupabaseClient()
    const { error } = await supabase
      .from('translation_orders_v2')
      .update({ verified_recipient_email: newRecipient })
      .eq('id', order.id)
    if (error) return { ok: false, error: 'recipient_update_failed', status: 503 }

    // Audit trail via the append-only event log (PII-free: hashes + actor + reason).
    await supabase.from('translation_order_events').insert({
      order_id: order.id,
      event_type: 'recipient_changed',
      actor,
      reason,
      metadata: {
        old_recipient_hash: oldHash,
        new_recipient_hash: createHash('sha256').update(newRecipient).digest('hex'),
      },
    })

    revalidatePath(`/admin/manual-review/${id}`)
    return { ok: true, version: order.version }
  } catch (e) {
    return fail(e)
  }
}

// ── Form adapters (React formAction requires Promise<void>; surface errors) ─────
function adapter(fn: (fd: FormData) => Promise<ActionResult>) {
  return async (formData: FormData): Promise<void> => {
    const r = await fn(formData)
    if (!r.ok) throw new Error(`${r.error} (${r.status})`)
  }
}

export const assignOrderForm = adapter(assignOrder)
export const beginReviewForm = adapter(beginReview)
export const requestClarificationForm = adapter(requestClarification)
export const appendOverrideForm = adapter(appendOverride)
export const approveForRenderForm = adapter(approveForRender)
export const retryDeliveryForm = adapter(retryDelivery)
export const cancelOrderForm = adapter(cancelOrder)
export const changeRecipientForm = adapter(changeRecipient)
