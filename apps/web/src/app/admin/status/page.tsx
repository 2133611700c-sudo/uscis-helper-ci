/**
 * /admin/status — read-only live operations dashboard (owner-only).
 *
 * Defense in depth: the /admin middleware already 404s without a valid
 * admin_session cookie; this page ADDITIONALLY verifies the cookie itself and
 * renders a bare 401 if absent — no data is assembled before the check.
 * English-only (staff interface). Auto-refreshes every 30s via meta refresh.
 * PII rule: everything shown comes from buildStatusDashboard, which selects
 * counts/hashes/enum columns only.
 */
export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import Link from 'next/link'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { buildStatusDashboard, type DbLike } from '@/lib/admin/statusDashboardData'

const td: React.CSSProperties = { border: '1px solid #e2e8f0', padding: '6px 10px', fontSize: 13 }

export default async function AdminStatusPage() {
  const cookieStore = await cookies()
  if (!cookieStore.get('admin_session')?.value) {
    // Middleware should have 404'd already; never render data without the cookie.
    return <main style={{ padding: 40, fontFamily: 'monospace' }}>401 Unauthorized</main>
  }

  let dash
  try {
    dash = await buildStatusDashboard(createAdminSupabaseClient() as unknown as DbLike)
  } catch (e) {
    return <main style={{ padding: 40 }}>Dashboard assembly failed: {(e as Error).message}</main>
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px', fontFamily: 'ui-sans-serif, system-ui' }}>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="30" />
      <h1 style={{ fontSize: 24 }}>Live status</h1>
      <p style={{ color: '#64748b', fontSize: 13 }}>
        prod sha <code>{dash.prodSha}</code> · generated {dash.generatedAtUtc} · auto-refresh 30s
      </p>

      <h2 style={{ fontSize: 17, marginTop: 24 }}>Passport schema migration</h2>
      <p style={{ fontSize: 14 }}>
        state: <strong>{dash.passportMigration.state}</strong> · renderer flag: {dash.passportMigration.flag} ·
        dual-render: {dash.passportMigration.dualRender} — runbook: docs/ops/PASSPORT_MIGRATION_RUNBOOK.md
      </p>

      <h2 style={{ fontSize: 17, marginTop: 24 }}>Feature flags</h2>
      <table style={{ borderCollapse: 'collapse' }}><tbody>
        {dash.flags.map((f) => (
          <tr key={f.name}>
            <td style={td}><code>{f.name}</code></td>
            <td style={{ ...td, fontWeight: 600 }}>{f.value}</td>
            <td style={{ ...td, color: '#64748b' }}>{f.note}</td>
          </tr>
        ))}
      </tbody></table>

      <h2 style={{ fontSize: 17, marginTop: 24 }}>Guard blocks (24h)</h2>
      <p style={{ fontSize: 14 }}>
        {dash.guardBlocks24h.error
          ? `unavailable: ${dash.guardBlocks24h.error}`
          : `total ${dash.guardBlocks24h.total} · ≈${dash.guardBlocks24h.perHour}/hour`}
      </p>

      <h2 style={{ fontSize: 17, marginTop: 24 }}>Manual review queue</h2>
      <p style={{ fontSize: 14 }}>
        {dash.reviewQueue.error ? `unavailable: ${dash.reviewQueue.error}` : `pending: ${dash.reviewQueue.pending}`}
        {' '}— <Link href="/admin/manual-review">open queue</Link>
      </p>

      <h2 style={{ fontSize: 17, marginTop: 24 }}>Certifier override audit (last 10, PII-free)</h2>
      {dash.certifierAuditError ? (
        <p style={{ fontSize: 14 }}>unavailable: {dash.certifierAuditError}</p>
      ) : dash.certifierAuditLast10.length === 0 ? (
        <p style={{ fontSize: 14 }}>no events</p>
      ) : (
        <table style={{ borderCollapse: 'collapse' }}><tbody>
          {dash.certifierAuditLast10.map((r, i) => (
            <tr key={i}>
              <td style={td}>{String(r.created_at ?? '')}</td>
              <td style={td}>{String(r.doc_type ?? '')}</td>
              <td style={td}>{String(r.field_name ?? '')}</td>
              <td style={td}>tier {String(r.tier ?? '')}</td>
              <td style={td}>{String(r.reason_code ?? '')}</td>
            </tr>
          ))}
        </tbody></table>
      )}

      <h2 style={{ fontSize: 17, marginTop: 24 }}>CI</h2>
      <p style={{ fontSize: 14 }}>{dash.ci.status}</p>
    </main>
  )
}
