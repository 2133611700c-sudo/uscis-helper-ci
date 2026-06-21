import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-health-token')
  if (!token || token !== process.env.HEALTH_TOKEN) {
    return new NextResponse(null, { status: 404 })
  }

  const db = createAdminSupabaseClient()

  // ─── DB + tables ────────────────────────────────────────────────────────────
  let dbOk = false
  let wizardSessionsOk = false
  let translationOrdersOk = false
  let canonicalAnswersCount = 0

  try {
    const { error } = await db.from('audit_log').select('id', { count: 'exact', head: true })
    dbOk = !error
  } catch { dbOk = false }

  try {
    const { error } = await db.from('wizard_sessions').select('id', { count: 'exact', head: true })
    wizardSessionsOk = !error
  } catch { wizardSessionsOk = false }

  try {
    const { count, error } = await db
      .from('canonical_answers')
      .select('*', { count: 'exact', head: true })
    canonicalAnswersCount = error ? -1 : (count ?? 0)
  } catch { canonicalAnswersCount = -1 }

  try {
    const { error } = await db.from('translation_orders').select('order_id', { count: 'exact', head: true })
    translationOrdersOk = !error
  } catch { translationOrdersOk = false }

  // ─── Supabase storage ────────────────────────────────────────────────────────
  let supabaseStorageOk = false
  try {
    const { error } = await db.storage.listBuckets()
    supabaseStorageOk = !error
  } catch { supabaseStorageOk = false }

  // ─── Env checks (no external pings — just presence checks) ──────────────────
  const deepseekConfigured = !!process.env.DEEPSEEK_API_KEY
  const resendConfigured = !!process.env.RESEND_API_KEY
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY

  // ─── Response ────────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    db: dbOk,
    wizard_sessions_ok: wizardSessionsOk,
    translation_orders_ok: translationOrdersOk,
    canonical_answers_count: canonicalAnswersCount,
    supabase_storage: supabaseStorageOk,
    deepseek_configured: deepseekConfigured,
    resend_configured: resendConfigured,
    stripe_configured: stripeConfigured,
  })
}
