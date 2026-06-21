import createMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/routing'
import { buildSecurityHeaders } from '@/lib/security/headers'
import { isMaliciousBot } from '@/lib/security/bot'

const intlMiddleware = createMiddleware(routing)

// ── Admin auth constants ───────────────────────────────────────────────────
const ADMIN_COOKIE = 'admin_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days in seconds

function adminGuard(req: NextRequest): NextResponse | null {
  const { pathname, searchParams } = req.nextUrl

  // Only guard /admin/* paths
  if (!pathname.startsWith('/admin')) return null

  const cookie = req.cookies.get(ADMIN_COOKIE)?.value
  const secret = process.env.ADMIN_SECRET

  // If valid cookie present — allow through
  if (cookie && secret && cookie === secret) return null

  // /admin/login?token=xxx — exchange token for cookie
  if (pathname === '/admin/login') {
    const token = searchParams.get('token')
    if (token && secret && token === secret) {
      // Token valid: set httpOnly cookie, redirect to admin without token in URL
      const redirectUrl = req.nextUrl.clone()
      redirectUrl.pathname = '/admin/manual-review'
      redirectUrl.search = ''
      const res = NextResponse.redirect(redirectUrl)
      res.cookies.set(ADMIN_COOKIE, secret, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      })
      return res
    }
  }

  // Not authenticated — return 404 (don't reveal /admin exists)
  return new NextResponse(null, { status: 404 })
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  // ── 1. Bot detection ──────────────────────────────────────────────────────
  // Only runs for page routes — API routes are excluded by the matcher below.
  // Blocks known scraping tools, vuln scanners, and blank-UA requests.
  if (isMaliciousBot(req)) {
    console.warn('[security/bot] blocked:', req.headers.get('user-agent') ?? '(empty)', req.nextUrl.pathname)
    return new NextResponse('Forbidden', { status: 403 })
  }

  // ── 2. Admin auth guard ───────────────────────────────────────────────────
  // Short-circuits before i18n — /admin/* is English-only, no locale routing.
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/admin')) {
    const adminResponse = adminGuard(req)
    if (adminResponse !== null) return adminResponse
    // Cookie valid — serve admin page directly, skip next-intl locale routing
    const res = NextResponse.next()
    const secHeaders = buildSecurityHeaders()
    for (const [key, value] of Object.entries(secHeaders)) {
      res.headers.set(key, value)
    }
    return res
  }

  // ── 3. i18n routing ───────────────────────────────────────────────────────
  const response = await Promise.resolve(intlMiddleware(req))

  // ── 4. Security headers ───────────────────────────────────────────────────
  // Attach to every page response (CSP, HSTS, X-Frame-Options, etc.)
  const secHeaders = buildSecurityHeaders()
  for (const [key, value] of Object.entries(secHeaders)) {
    response.headers.set(key, value)
  }

  return response
}

export const config = {
  matcher: [
    // Exclude: API routes, Next.js internals, static files, images, icons, manifests
    '/((?!api|_next/static|_next/image|favicon\\.ico|favicon\\.png|icon\\.svg|apple-touch-icon\\.png|icons/|og/|uscis/|sitemap\\.xml|robots\\.txt|manifest\\.webmanifest|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.webp|.*\\.gif|.*\\.svg|.*\\.pdf|.*\\.html).*)',
  ],
}
