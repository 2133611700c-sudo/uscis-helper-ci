/**
 * /admin/manual-review/[id]/v2 — V2 operator view (canonical-resolved).
 *
 * Server component. Protected by ADMIN_SECRET middleware (page) AND every action
 * re-checks via requireTranslationOperator() (mutation boundary, ./legacyOperatorAuth).
 *
 * Authority: this view loads the V2 order (translation_orders_v2) + the RESOLVED
 * canonical document (base + confirmed operator overrides) + override history +
 * state/version + Stripe-verified recipient + prior artifacts + events. It does
 * NOT use the mutable manual_review_queue.source_fields as authority.
 *
 * PII: applicant values render in this protected UI only. NEVER logged.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getOrderById,
  listOrderArtifacts,
  resolveOrderCanonical,
} from '@/lib/translation/orders'
import {
  loadCanonicalDocumentById,
  listCanonicalOverrides,
} from '@/lib/canonical/persistence'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  assignOrderForm,
  beginReviewForm,
  requestClarificationForm,
  appendOverrideForm,
  approveForRenderForm,
  retryDeliveryForm,
  cancelOrderForm,
} from '../v2Actions'

export default async function OperatorV2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const order = await getOrderById(id)
  if (!order) notFound()

  // Resolved canonical = base + confirmed operator overrides (the effective view).
  const resolved = await resolveOrderCanonical(order)
  const base = order.canonicalDocumentId
    ? await loadCanonicalDocumentById(order.canonicalDocumentId)
    : null
  const overrides = order.canonicalDocumentId
    ? await listCanonicalOverrides(order.canonicalDocumentId)
    : []
  const artifacts = await listOrderArtifacts(order.id)

  const supabase = createAdminSupabaseClient()
  const { data: eventRows } = await supabase
    .from('translation_order_events')
    .select('event_type, actor, reason, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const overrideVersion = overrides.reduce((mx, o) => Math.max(mx, o.version ?? 0), 0)
  const baseByKey = new Map((base?.fields ?? []).map((f) => [f.key, f]))
  const overrideByKey = new Map(overrides.map((o) => [o.fieldKey, o]))

  // ── effective value per field (base finalValue / normalizedValue, override wins) ─
  const fieldRows = (resolved?.fields ?? []).map((f) => {
    const ov = overrideByKey.get(f.key)
    const baseF = baseByKey.get(f.key)
    const effective = f.finalValue !== undefined ? f.finalValue : f.normalizedValue
    return {
      key: f.key,
      base: baseF ? (baseF.finalValue !== undefined ? baseF.finalValue : baseF.normalizedValue) : null,
      normalized: f.normalizedValue,
      effective,
      reviewRequired: f.reviewRequired,
      reviewReasons: f.reviewReasons ?? [],
      evidenceCount: f.evidence?.length ?? 0,
      hasConfirmedOverride: !!(ov && ov.confirmed),
    }
  })

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '860px', margin: '0 auto', padding: '24px 16px', fontSize: '16px' }}>
      <Link href="/admin/manual-review" style={{ color: '#2563eb', fontSize: '14px', textDecoration: 'none' }}>← Back to queue</Link>

      <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '12px 0 4px' }}>
        Translation Order (V2) · {order.id.slice(0, 8)}
      </h1>
      <div style={{ fontSize: '14px', color: '#64748b' }}>
        {order.documentType ?? 'other'} · {(order.locale ?? 'en').toUpperCase()} ·{' '}
        status <strong>{order.status}</strong> · version <strong>{order.version}</strong>
        {order.legacy && <span style={{ marginLeft: 8, padding: '2px 8px', background: '#fef3c7', borderRadius: 4, fontSize: 12 }}>LEGACY (no canonical binding)</span>}
      </div>

      {/* Recipient (Stripe-verified, not editable here) */}
      <section style={{ marginTop: 16, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <strong>Verified recipient (Stripe): </strong>
        {order.verifiedRecipientEmail ?? <em style={{ color: '#b91c1c' }}>none bound</em>}
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          Editing the recipient is a separate audited action (changeRecipient) — not part of field edits.
        </div>
      </section>

      {order.legacy && (
        <section style={{ marginTop: 16, padding: 12, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 14 }}>
          This is a legacy order with no canonical binding. Use the{' '}
          <Link href={`/admin/manual-review/${order.id}`} style={{ color: '#2563eb' }}>legacy view</Link> to complete it.
        </section>
      )}

      {/* Canonical-resolved fields */}
      {resolved && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Resolved canonical fields (override version {overrideVersion})</h2>
          <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
            {fieldRows.map((r) => (
              <div key={r.key} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#334155' }}>{r.key.replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  base: <code>{r.base ?? '∅'}</code> · normalized: <code>{r.normalized ?? '∅'}</code>
                </div>
                <div style={{ fontSize: 15, marginTop: 4 }}>
                  effective: <strong>{r.effective === null ? 'REJECTED (C3 null)' : (r.effective ?? '—')}</strong>
                  {r.hasConfirmedOverride && <span style={{ marginLeft: 8, padding: '1px 6px', background: '#dcfce7', borderRadius: 4, fontSize: 11 }}>operator override</span>}
                  {r.reviewRequired && <span style={{ marginLeft: 8, padding: '1px 6px', background: '#fee2e2', borderRadius: 4, fontSize: 11 }}>review</span>}
                </div>
                {r.reviewReasons.length > 0 && (
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>reasons: {r.reviewReasons.join(', ')}</div>
                )}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>evidence candidates: {r.evidenceCount}</div>

                {/* Override input — appended via canonical override channel */}
                {order.status === 'in_review' && (
                  <form action={appendOverrideForm} style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="hidden" name="id" value={order.id} />
                    <input type="hidden" name="expectedVersion" value={order.version} />
                    <input type="hidden" name="fieldKey" value={r.key} />
                    <input type="hidden" name="expectedOverrideVersion" value={overrideVersion} />
                    <input type="text" name="value" placeholder="corrected English value (empty = reject)" style={{ flex: 1, padding: '6px 10px', border: '1.5px solid #cbd5e1', borderRadius: 6, fontSize: 14 }} />
                    <button type="submit" style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save override</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* State actions */}
      <section style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {order.status === 'queued' && (
          <form action={assignOrderForm}><input type="hidden" name="id" value={order.id} /><input type="hidden" name="expectedVersion" value={order.version} /><button style={{ background: '#2563eb', padding: '10px 16px', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Assign to me</button></form>
        )}
        {order.status === 'assigned' && (
          <form action={beginReviewForm}><input type="hidden" name="id" value={order.id} /><input type="hidden" name="expectedVersion" value={order.version} /><button style={{ background: '#2563eb', padding: '10px 16px', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Begin review</button></form>
        )}
        {order.status === 'in_review' && (
          <>
            <form action={requestClarificationForm}><input type="hidden" name="id" value={order.id} /><input type="hidden" name="expectedVersion" value={order.version} /><button style={{ background: '#d97706', padding: '10px 16px', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Request clarification</button></form>
            <form action={approveForRenderForm}><input type="hidden" name="id" value={order.id} /><input type="hidden" name="expectedVersion" value={order.version} /><button style={{ background: '#059669', padding: '10px 16px', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Approve &amp; render →</button></form>
          </>
        )}
        {order.status === 'delivery_failed' && (
          <form action={retryDeliveryForm}><input type="hidden" name="id" value={order.id} /><input type="hidden" name="expectedVersion" value={order.version} /><button style={{ background: '#2563eb', padding: '10px 16px', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Retry delivery</button></form>
        )}
        {!['delivered', 'cancelled'].includes(order.status) && (
          <form action={cancelOrderForm}><input type="hidden" name="id" value={order.id} /><input type="hidden" name="expectedVersion" value={order.version} /><button style={{ background: '#64748b', padding: '10px 16px', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Cancel</button></form>
        )}
      </section>

      {/* Prior artifacts */}
      {artifacts.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Artifacts ({artifacts.length})</h2>
          <ul style={{ fontSize: 13, color: '#475569' }}>
            {artifacts.map((a) => (
              <li key={a.id}>v{a.artifactVersion} · sha {a.artifactSha256.slice(0, 12)}… · {a.byteSize}B · {a.mimeType} · {a.deliveryStatus ?? 'pending'}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Event log */}
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Events</h2>
        <ul style={{ fontSize: 13, color: '#475569' }}>
          {(eventRows ?? []).map((e: Record<string, unknown>, i: number) => (
            <li key={i}>{(e.created_at as string)?.slice(0, 19)} · {e.event_type as string} · {(e.actor as string) ?? '—'}{e.reason ? ` · ${e.reason as string}` : ''}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
