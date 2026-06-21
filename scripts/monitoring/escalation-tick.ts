// L1 escalation tick (every ~30min). Re-alerts the owner on open paid-failure
// tickets per the cadence (4h → 2nd alert, 12h → 3rd channel). Uses the TESTED pure
// logic in apps/web; this script is thin glue (query → logic → alert → mark).
import { supabase } from './lib/supabase-client'
import { sendOwnerAlert } from './lib/owner-alert'
import {
  nextEscalationStage,
  type OpenTicketState,
  type EscalationStage,
} from '../../apps/web/src/lib/documentSafety/ticketEscalation'

const OPEN_STATUSES = ['pending', 'in_review', 'queued', 'assigned', 'needs_user_clarification']

// Reasons that escalate: classic paid-failure tickets AND paid operator-review
// orders (operator flow). Each reason is a separate query (PostgREST `contains`
// is AND semantics — one query per reason gives OR), then union + dedupe by id.
const ESCALATING_REASONS = ['paid_request_failed', 'operator_review_paid']

interface TickRow { id: string; created_at: string; status: string; last_alert_stage: string | null }

async function fetchEscalatingTickets(): Promise<TickRow[]> {
  const byId = new Map<string, TickRow>()
  for (const reason of ESCALATING_REASONS) {
    const { data, error } = await supabase
      .from('manual_review_queue')
      .select('id,created_at,status,last_alert_stage')
      .in('status', OPEN_STATUSES)
      .contains('reasons', JSON.stringify([reason])) // jsonb: supabase-js needs a JSON string (a JS array becomes a {} pg-array literal → 22P02)
    if (error) throw error
    for (const r of (data ?? []) as TickRow[]) byId.set(r.id, r)
  }
  return Array.from(byId.values())
}

async function main(): Promise<void> {
  const rows = await fetchEscalatingTickets()

  const now = Date.now()
  let acted = 0
  for (const r of rows) {
    const ticket: OpenTicketState = {
      ticketId: r.id,
      ageMs: now - new Date(r.created_at).getTime(),
      lastStage: (r.last_alert_stage as EscalationStage) ?? 'created', // first alert fired at creation
    }
    const stage = nextEscalationStage(ticket)
    if (!stage) continue

    await sendOwnerAlert(`[escalation] ${stage} ticket=${r.id.slice(0, 8)}`, {
      ticket_id: r.id, stage, age_h: Math.round(ticket.ageMs / 3_600_000),
    })
    const { error: upErr } = await supabase
      .from('manual_review_queue')
      .update({ last_alert_stage: stage, last_alerted_at: new Date().toISOString() })
      .eq('id', r.id)
    if (upErr) throw upErr
    acted += 1
  }
  console.log(`[escalation-tick] open=${rows.length} escalated=${acted}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
