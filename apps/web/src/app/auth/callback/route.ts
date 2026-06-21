/**
 * GET /auth/callback
 *
 * Handles Supabase auth callback after magic link click.
 * Exchanges the code for a session and redirects the user.
 *
 * Query params:
 *   code        — Supabase auth code (required)
 *   session_id  — Optional wizard session ID to link after sign-in
 *   next        — Optional redirect URL after sign-in (default: /en)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const sessionId = searchParams.get('session_id')
  const next = searchParams.get('next') ?? '/en'

  if (!code) {
    // No code — redirect to home with error
    return NextResponse.redirect(new URL('/en?auth=error', req.nextUrl.origin))
  }

  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[auth/callback] exchange error:', error.message)
      return NextResponse.redirect(new URL('/en?auth=error', req.nextUrl.origin))
    }

    // Build redirect URL
    let redirectPath = next
    if (sessionId) {
      // Append session_id as query param so the page can link the auth user
      const separator = redirectPath.includes('?') ? '&' : '?'
      redirectPath = `${redirectPath}${separator}linked_session=${sessionId}`
    }

    return NextResponse.redirect(new URL(redirectPath, req.nextUrl.origin))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[auth/callback] error:', msg)
    return NextResponse.redirect(new URL('/en?auth=error', req.nextUrl.origin))
  }
}
