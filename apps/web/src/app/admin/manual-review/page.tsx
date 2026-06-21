/**
 * /admin/manual-review — pending translation review queue
 * Server component. Protected by ADMIN_SECRET middleware.
 * English-only (staff interface).
 */

// Must be dynamic — requires SUPABASE_SERVICE_ROLE_KEY at runtime (not available during CI build)
export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { computeSla, type SlaColor } from '@/lib/translation/manualReview/slaTimer'

interface QueueRow {
  id: string
  created_at: string
  doc_type: string
  source_lang: string
  status: string
  expires_at: string
  // v1 columns (Path B hardening — may be null on legacy v0 rows)
  priority: string | null
  module_type: string | null
  detected_document_type: string | null
  safe_summary: string | null
  reasons: string[] | null
}

// PRIVACY RULE (mission spec, Phase 8):
// Queue list view MUST NOT show contact_name / contact_email / contact_phone /
// raw OCR / source_fields. Those are accessible only via the detail view
// (which is itself protected by ADMIN_SECRET cookie via /admin middleware).

const STATUS_COLORS: Record<string, string> = {
  // v0
  pending:    'background:#fef3c7;color:#92400e',
  in_review:  'background:#dbeafe;color:#1e40af',
  completed:  'background:#d1fae5;color:#065f46',
  cancelled:  'background:#f1f5f9;color:#64748b',
  // v1
  queued:                   'background:#fef3c7;color:#92400e',
  assigned:                 'background:#e0e7ff;color:#3730a3',
  needs_user_clarification: 'background:#fee2e2;color:#991b1b',
  operator_completed:       'background:#dcfce7;color:#166534',
  approved_for_render:      'background:#d1fae5;color:#065f46',
  rejected:                 'background:#f1f5f9;color:#64748b',
}

const SLA_COLORS: Record<SlaColor, string> = {
  green: 'background:#d1fae5;color:#065f46',
  amber: 'background:#fef3c7;color:#92400e',
  red:   'background:#fee2e2;color:#991b1b',
}

const PRIORITY_COLORS: Record<string, string> = {
  low:    'background:#f1f5f9;color:#475569',
  normal: 'background:#e2e8f0;color:#334155',
  high:   'background:#fee2e2;color:#991b1b',
}

export default async function ManualReviewListPage() {
  const supabase = createAdminSupabaseClient()

  const { data: rows, error } = await supabase
    .from('manual_review_queue')
    // PRIVACY: queue list intentionally excludes contact_name / contact_email /
    // contact_phone / source_fields / translated_fields / notes.
    // Those fields are visible only on the protected detail page.
    .select('id,created_at,doc_type,source_lang,status,expires_at,priority,module_type,detected_document_type,safe_summary,reasons')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: '24px', color: '#dc2626' }}>
        <h1>Error loading queue</h1>
        <pre>{error.message}</pre>
      </main>
    )
  }

  // v0/v1 status grouping. v0 'pending' and v1 'queued' both bucket as Open.
  const open      = rows?.filter(r => ['pending', 'queued', 'assigned'].includes(r.status)) ?? []
  const inReview  = rows?.filter(r => ['in_review', 'needs_user_clarification'].includes(r.status)) ?? []
  const ready     = rows?.filter(r => ['operator_completed', 'approved_for_render'].includes(r.status)) ?? []
  const closed    = rows?.filter(r => ['completed', 'rejected', 'cancelled'].includes(r.status)) ?? []

  function styleFromCss(css: string): CSSProperties {
    const out: Record<string, string> = {}
    for (const part of css.split(';')) {
      const [k, v] = part.split(':').map(x => x.trim())
      if (k && v) out[k] = v
    }
    return out as CSSProperties
  }

  const nowMs = Date.now() // server-render snapshot; SLA is computed once per page load

  function Row({ r }: { r: QueueRow }) {
    const created = new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })
    const expires = new Date(r.expires_at).toLocaleDateString('en-US')
    const sla = computeSla(r.created_at, nowMs)
    const statusStyle = STATUS_COLORS[r.status] ?? ''
    const priorityKey = r.priority ?? 'normal'
    const priorityStyle = PRIORITY_COLORS[priorityKey] ?? PRIORITY_COLORS.normal
    const reasonsLabel = (r.reasons ?? []).slice(0, 2).join(', ')
    return (
      <tr>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0' }}>
          <Link
            href={`/admin/manual-review/${r.id}`}
            style={{ color: '#2563eb', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}
          >
            {r.module_type ?? r.doc_type}
          </Link>
          <div style={{ fontSize: '15px', color: '#64748b', marginTop: '2px' }}>{r.id.slice(0, 8)}</div>
          {r.safe_summary && (
            <div style={{ fontSize: '15px', color: '#94a3b8', marginTop: '2px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.safe_summary}
            </div>
          )}
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
          {r.source_lang.toUpperCase()}
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '15px', fontWeight: 600, ...styleFromCss(priorityStyle) }}>
            {priorityKey}
          </span>
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '15px', color: '#64748b' }}>
          {reasonsLabel || '—'}
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '15px', fontWeight: 600, whiteSpace: 'nowrap', ...styleFromCss(SLA_COLORS[sla.color]) }}>
            {sla.label}
          </span>
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '15px', color: '#64748b' }}>
          {created}
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '15px', color: '#64748b' }}>
          {expires}
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '15px', fontWeight: 600, ...styleFromCss(statusStyle) }}>
            {r.status}
          </span>
        </td>
        <td style={{ padding: '12px 8px', borderBottom: '1px solid #e2e8f0' }}>
          <Link
            href={`/admin/manual-review/${r.id}`}
            style={{ display: 'inline-block', padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: '6px', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }}
          >
            Review →
          </Link>
        </td>
      </tr>
    )
  }

  const sections: { label: string; items: QueueRow[]; accent: string }[] = [
    { label: `Open (${open.length})`,         items: open,     accent: '#dc2626' },
    { label: `In Review (${inReview.length})`, items: inReview, accent: '#2563eb' },
    { label: `Ready (${ready.length})`,       items: ready,    accent: '#059669' },
    { label: `Closed (${closed.length})`,     items: closed,   accent: '#64748b' },
  ]

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Translation Review Queue
        </h1>
        <span style={{ fontSize: '15px', color: '#94a3b8' }}>
          {rows?.length ?? 0} total · Messenginfo Staff
        </span>
      </div>

      {sections.map(({ label, items, accent }) =>
        items.length === 0 ? null : (
          <section key={label} style={{ marginBottom: '36px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: accent, marginBottom: '12px', borderBottom: `2px solid ${accent}`, paddingBottom: '6px' }}>
              {label}
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Document', 'Lang', 'Priority', 'Reasons', 'SLA', 'Received', 'Expires', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '8px', textAlign: 'left', fontSize: '15px', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => <Row key={r.id} r={r} />)}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {(rows?.length ?? 0) === 0 && (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '48px 0' }}>
          No cases in queue. 🎉
        </p>
      )}
    </main>
  )
}
