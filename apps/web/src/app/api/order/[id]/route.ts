/**
 * GET /api/order/[id] — customer-facing order status (PIVOT Phase 2.2).
 *
 * The order id (= manual_review_queue ticket uuid) is the capability token —
 * unguessable, shared only in the customer's own email/redirect. The response
 * is deliberately PII-FREE: status bucket + doc type + timestamps only; never
 * the email, never field values. Unknown/garbage id → 404 with no detail.
 */
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { toCustomerStatus } from '@/lib/translation/manualReview/customerStatus'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const ip = getClientIP(req)
  const rl = await rateLimit(`order-status:${ip}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 })

  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false }, { status: 404 })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('manual_review_queue')
    .select('id, status, doc_type, created_at, reviewed_at')
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404 })

  return NextResponse.json({
    ok: true,
    status: toCustomerStatus(String(data.status ?? '')),
    doc_type: data.doc_type ?? 'other',
    created_at: data.created_at,
    completed_at: data.reviewed_at ?? null,
    estimated_hours: 24,
  })
}
