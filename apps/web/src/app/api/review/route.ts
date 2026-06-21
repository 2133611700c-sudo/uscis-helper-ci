import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * POST /api/review
 *
 * Stores a user review (star rating + optional comment) in the `reviews` table.
 * Gracefully silent if the table doesn't exist yet — never blocks the UI.
 *
 * Body: { session_id, service_slug, locale, stars, comment }
 * Response: { ok: true } always (errors are logged server-side only)
 */

interface ReviewBody {
  session_id?: string | null
  service_slug?: string
  locale?: string
  stars: number
  comment?: string | null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ReviewBody

    // Basic validation
    const stars = Number(body.stars)
    if (!stars || stars < 1 || stars > 5) {
      return NextResponse.json({ ok: false, error: 'stars must be 1–5' }, { status: 400 })
    }

    const row = {
      session_id:   body.session_id   ?? null,
      service_slug: body.service_slug ?? 're-parole-u4u',
      locale:       body.locale       ?? 'en',
      stars,
      comment:      body.comment?.trim() ?? null,
    }

    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.from('reviews').insert(row)

    if (error) {
      // Table might not exist yet — log but don't surface to client
      console.warn('[review] insert error:', error.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[review] unexpected error:', err)
    // Always return 200 — the review failing must never break the user flow
    return NextResponse.json({ ok: true })
  }
}
