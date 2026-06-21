/**
 * /admin/manual-review/[id] — detail view + translate form
 * Server component. Protected by ADMIN_SECRET middleware.
 */

import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sendTranslation, approveAndSendPdfForm } from './actions'
import { maskEmail } from './legacyOperatorAuth'

interface Row {
  id: string
  created_at: string
  doc_type: string
  source_lang: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  source_fields: Record<string, string | null>
  translated_fields: Record<string, string> | null
  status: string
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  expires_at: string
}

const LABEL_STYLE = 'display:block;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px'
const INPUT_STYLE = 'width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:18px;font-family:inherit;box-sizing:border-box;line-height:1.4'
const READONLY_STYLE = 'width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:18px;font-family:inherit;background:#f8fafc;color:#475569;box-sizing:border-box'

export default async function ManualReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('manual_review_queue')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) notFound()

  const row = data as Row
  const isCompleted = row.status === 'completed'

  const sourceEntries = Object.entries(row.source_fields).filter(([, v]) => v !== null && v !== '')
  const created = new Date(row.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })
  const expires = new Date(row.expires_at).toLocaleDateString('en-US')

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '24px 16px', fontSize: '18px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/manual-review" style={{ color: '#2563eb', fontSize: '14px', textDecoration: 'none' }}>
          ← Back to queue
        </Link>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '12px 0 4px' }}>
          {row.doc_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </h1>
        <div style={{ fontSize: '15px', color: '#64748b' }}>
          Case {row.id.slice(0, 8)} · {row.source_lang.toUpperCase()} · Received {created} · Expires {expires}
        </div>
        {isCompleted && (
          <div style={{ marginTop: '8px', padding: '8px 14px', background: '#d1fae5', borderRadius: '6px', color: '#065f46', fontSize: '14px', fontWeight: 600 }}>
            ✅ Completed — sent by {row.reviewed_by ?? 'admin'} on {row.reviewed_at ? new Date(row.reviewed_at).toLocaleDateString('en-US') : '?'}
          </div>
        )}
      </div>

      {/* Contact info */}
      <section style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>Contact Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', fontSize: '14px' }}>
          <div><span style={{ color: '#64748b' }}>Name: </span>{row.contact_name ?? '—'}</div>
          <div><span style={{ color: '#64748b' }}>Email: </span>
            {row.contact_email
              ? <a href={`mailto:${row.contact_email}`} style={{ color: '#2563eb' }}>{row.contact_email}</a>
              : '—'}
          </div>
          <div><span style={{ color: '#64748b' }}>Phone: </span>{row.contact_phone ?? '—'}</div>
        </div>
      </section>

      {/* Source fields (readonly) */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>
          Source Fields ({row.source_lang.toUpperCase()}) — OCR extracted
        </h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          {sourceEntries.map(([key, value]) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>
                {key.replace(/_/g, ' ')}
              </label>
              <div style={{ padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#1e293b', fontSize: '18px', fontFamily: 'monospace' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Translation form */}
      <section>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: '0 0 12px' }}>
          English Translation {isCompleted ? '(sent)' : '— enter below'}
        </h2>

        <form action={sendTranslation}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="docType" value={row.doc_type} />
          <input type="hidden" name="sourceLang" value={row.source_lang} />

          {/* SECURITY (0.5): recipient is server-authoritative (verified Stripe →
              order record). It is NOT an editable/submitted field — the action
              resolves it server-side and ignores any client value. Shown masked,
              read-only, with no `name` so nothing authoritative is posted.
              Changing the recipient is a V2 audited flow (PR #119), not here. */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>
              Send to (verified from payment)
            </span>
            <div
              aria-readonly="true"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#1e293b', fontSize: '18px', fontFamily: 'monospace', boxSizing: 'border-box' }}
            >
              {row.contact_email ? maskEmail(row.contact_email) : '— no verified recipient (sending is blocked) —'}
            </div>
          </div>

          {/* Translated fields */}
          <div style={{ display: 'grid', gap: '14px', marginBottom: '24px' }}>
            {sourceEntries.map(([key]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>
                  {key.replace(/_/g, ' ')} (English)
                </label>
                <input
                  type="text"
                  name={`tf_${key}`}
                  defaultValue={row.translated_fields?.[key] ?? ''}
                  placeholder={`English: ${key.replace(/_/g, ' ')}`}
                  disabled={isCompleted}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #cbd5e1', borderRadius: '6px', fontSize: '18px', fontFamily: 'inherit', boxSizing: 'border-box', background: isCompleted ? '#f8fafc' : '#fff' }}
                />
              </div>
            ))}
          </div>

          {!isCompleted && (
            <div style={{ display: 'grid', gap: '12px' }}>
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '16px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: '56px',
                }}
              >
                Send translation to client →
              </button>
              {/* Operator flow: render a REAL certification PDF and email it as attachment */}
              <button
                type="submit"
                formAction={approveAndSendPdfForm}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: '56px',
                }}
              >
                Approve &amp; Send PDF →
              </button>
            </div>
          )}
        </form>
      </section>

      {row.notes && (
        <section style={{ marginTop: '24px', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '14px' }}>
          <strong>Notes:</strong> {row.notes}
        </section>
      )}
    </main>
  )
}
