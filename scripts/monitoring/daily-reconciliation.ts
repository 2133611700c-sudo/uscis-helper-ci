// L1 daily reconciliation (once/day). Emails the owner a digest of paid-failure
// tickets still open ≥24h, so nothing falls through the escalation cracks. Uses the
// TESTED ticketsForDigest logic; thin glue.
import { supabase } from './lib/supabase-client'
import { sendDigest } from './lib/email'
import { ticketsForDigest, type OpenTicketState } from '../../apps/web/src/lib/documentSafety/ticketEscalation'

const OPEN_STATUSES = ['pending', 'in_review', 'queued', 'assigned', 'needs_user_clarification']
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function main(): Promise<void> {
  const { data: rows, error } = await supabase
    .from('manual_review_queue')
    .select('id,created_at,status,priority')
    .in('status', OPEN_STATUSES)
    .contains('reasons', JSON.stringify(['paid_request_failed'])) // jsonb: supabase-js needs a JSON string (a JS array becomes a {} pg-array literal → 22P02)
  if (error) throw error

  const now = Date.now()
  const states: Array<OpenTicketState & { priority: string }> = ((rows ?? []) as Array<{ id: string; created_at: string; priority: string }>).map((r) => ({
    ticketId: r.id, ageMs: now - new Date(r.created_at).getTime(), lastStage: 'created', priority: r.priority,
  }))
  const overdue = ticketsForDigest(states) as Array<OpenTicketState & { priority: string }>

  if (!overdue.length) {
    console.log('[daily-reconciliation] no tickets ≥24h. Done.')
    return
  }

  const day = new Date(now).toISOString().slice(0, 10)
  const lis = overdue
    .map((t) => `<li>ticket <code>${esc(t.ticketId.slice(0, 8))}</code> — open ${Math.round(t.ageMs / 3_600_000)}h — priority ${esc(t.priority)}</li>`)
    .join('')
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a;">
    <h1 style="font-size:20px;">Paid-failure tickets open &gt; 24h (${overdue.length})</h1>
    <p style="color:#64748b;">${esc(day)} — these paid requests failed and are still unresolved. Refund or resolve.</p>
    <ul>${lis}</ul>
    <p style="color:#64748b;font-size:12px;">Messenginfo L1 reconciliation. PII-free (ticket ids only).</p>
  </body></html>`

  await sendDigest(html, `Messenginfo — ${overdue.length} paid-failure tickets >24h (${day})`)
  console.log(`[daily-reconciliation] overdue=${overdue.length} digest sent`)
}

main().catch((e) => { console.error(e); process.exit(1) })
