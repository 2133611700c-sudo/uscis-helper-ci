/**
 * apps/web/src/lib/supabase/auth.ts
 *
 * Supabase auth helpers — magic link sign-in foundation.
 * SERVER-SIDE ONLY. Do not import in client components.
 *
 * NOTE: The wizard flow is fully anonymous. Auth is an optional enhancement.
 * Users can complete the entire wizard and order process without logging in.
 */

import { createAdminSupabaseClient } from './admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ─── Server client (cookie-based session) ────────────────────────────────────

export function createAuthServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => {
          // @ts-expect-error — Next.js 15 cookies() may be sync or async
          return cookieStore.getAll ? cookieStore.getAll() : []
        },
        setAll: () => {
          // Server components cannot set cookies — handled by middleware
        },
      },
    }
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MagicLinkResult {
  ok: boolean
  error?: string
}

export interface SessionResult {
  session: { user: { id: string; email?: string } } | null
  error?: string
}

// ─── sendMagicLink ────────────────────────────────────────────────────────────

/**
 * Send a magic link to the given email address.
 * Optionally associates the session with a wizard session_id for later linking.
 *
 * Uses admin client to send OTP so it works server-side without browser context.
 *
 * @param email     Recipient email
 * @param sessionId Optional wizard session ID to link after sign-in
 */
export async function sendMagicLink(
  email: string,
  sessionId?: string
): Promise<MagicLinkResult> {
  try {
    const supabase = createAdminSupabaseClient()

    const redirectTo = sessionId
      ? `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://messenginfo.com'}/auth/callback?session_id=${sessionId}`
      : `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://messenginfo.com'}/auth/callback`

    const { error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo,
      },
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

// ─── getSession ───────────────────────────────────────────────────────────────

/**
 * Get the current session from cookies.
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<SessionResult> {
  try {
    const supabase = createAuthServerClient()
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      return { session: null, error: error.message }
    }

    return { session: data.session }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { session: null, error: msg }
  }
}
