/**
 * GET /api/admin/manual-review/queue
 *
 * Operator queue listing API. Returns rows redacted to the same level as the
 * /admin/manual-review HTML list (no contact_*, no source_fields).
 *
 * Auth: ADMIN_SECRET cookie required (checked explicitly because /api/* is
 * excluded from the global middleware matcher).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { requireAdminAuth } from '@/lib/translation/manualReview/adminAuth'

export const dynamic = 'force-dynamic'

interface QueueRowSafe {
  id: string
  created_at: string
  updated_at: string
  expires_at: string
  doc_type: string
  source_lang: string
  status: string
  priority: string | null
  module_type: string | null
  detected_document_type: string | null
  safe_summary: string | null
  reasons: string[] | null
  assigned_to: string | null
  due_at: string | null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireAdminAuth(req)
  if (denied) return denied

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const priority = url.searchParams.get('priority')
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('manual_review_queue')
    // Privacy-preserving select — see Phase 8 of mission spec.
    .select(
      'id,created_at,updated_at,expires_at,doc_type,source_lang,status,priority,module_type,detected_document_type,safe_summary,reasons,assigned_to,due_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: 'queue_load_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, items: (data ?? []) as QueueRowSafe[] })
}
