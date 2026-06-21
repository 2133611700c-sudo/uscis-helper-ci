/**
 * POST /api/auth/magic-link
 *
 * Send a Supabase magic link to the given email.
 * The wizard flow does NOT require this — auth is optional.
 *
 * Request body:
 *   email       string  Required
 *   session_id? string  Optional — wizard session ID to link after sign-in
 *
 * Response:
 *   { ok: true }  — link sent (or would be sent if configured)
 *   { ok: false, error: string, code: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendMagicLink } from '@/lib/supabase/auth'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  session_id: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 magic links per hour per IP (prevent email spam)
    const ip = getClientIP(req)
    const rl = await rateLimit(`magic-link:${ip}`, 5, 60 * 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait before requesting another link.', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) },
        }
      )
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION' },
        { status: 400 }
      )
    }

    const { email, session_id } = parsed.data

    const result = await sendMagicLink(email, session_id)

    if (!result.ok) {
      // Don't expose internal error details
      console.error('[magic-link] send error:', result.error)
      return NextResponse.json(
        { ok: false, error: 'Unable to send magic link. Please try again.', code: 'SEND_FAILED' },
        { status: 503 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[magic-link] error:', msg)
    return NextResponse.json({ ok: false, error: 'Internal error', code: 'INTERNAL' }, { status: 500 })
  }
}
