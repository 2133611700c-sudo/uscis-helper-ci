/**
 * Admin auth check for /api/admin/* routes.
 *
 * IMPORTANT: the project's middleware (apps/web/src/middleware.ts) excludes
 * `/api` routes from the matcher, which means ADMIN cookie protection is NOT
 * automatically applied to API endpoints under /api/admin. This helper closes
 * that gap by explicitly checking the same cookie inside each /api/admin
 * handler.
 *
 * Returns null if authenticated. Returns a NextResponse 404 (intentionally
 * not 401/403 — never reveal that /api/admin exists to unauthenticated
 * callers) if not.
 */

import { NextRequest, NextResponse } from 'next/server'

const ADMIN_COOKIE = 'admin_session'

/**
 * Check that the request has a valid admin session cookie.
 * Returns null on success, or a 404 response on failure (do not reveal endpoint).
 */
export function requireAdminAuth(req: NextRequest): NextResponse | null {
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value
  const secret = process.env.ADMIN_SECRET

  if (!secret) {
    // No admin secret configured — fail closed.
    return new NextResponse(null, { status: 404 })
  }
  if (!cookie || cookie !== secret) {
    return new NextResponse(null, { status: 404 })
  }
  return null
}
