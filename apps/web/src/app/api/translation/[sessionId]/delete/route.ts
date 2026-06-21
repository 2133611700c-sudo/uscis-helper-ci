/**
 * GET /api/translation/[sessionId]/delete?token=<signed-token>
 *
 * On-demand GDPR delete for a specific manual_review_queue case.
 * Called from the delete link in the client confirmation email.
 *
 * Token format: base64url( JSON({ id, exp }) ) + '.' + HMAC-SHA256-hex
 * Signed with ADMIN_SECRET. Valid 90 days. Idempotent (already-deleted = ok).
 *
 * On success: redirects to /delete-confirmed page.
 *
 * Note: the dynamic segment was renamed from [id] to [sessionId] to avoid a
 * Next.js App Router conflict with the [sessionId] folder that hosts the
 * review-state / confirm-field / correct-field routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyDeleteToken } from '@/lib/security/delete-token'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId: pathId } = await params
  const token = req.nextUrl.searchParams.get('token')
  const secret = process.env.ADMIN_SECRET

  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  }

  if (!token) {
    return new NextResponse(null, { status: 404 })
  }

  const verified = verifyDeleteToken(token, secret)
  if (!verified || verified.id !== pathId) {
    return new NextResponse(null, { status: 404 })
  }

  const supabase = createAdminSupabaseClient()

  // Fetch row to get file_url (idempotent — if already gone, return success)
  const { data } = await supabase
    .from('manual_review_queue')
    .select('id, file_url')
    .eq('id', pathId)
    .maybeSingle()

  if (data) {
    const fileUrl = (data as { id: string; file_url: string | null }).file_url
    if (fileUrl) {
      await supabase.storage.from('translation-uploads').remove([fileUrl])
    }
    await supabase.from('manual_review_queue').delete().eq('id', pathId)
  }

  const url = req.nextUrl.clone()
  url.pathname = '/delete-confirmed'
  url.search = ''
  return NextResponse.redirect(url)
}
