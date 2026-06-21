/**
 * Security response headers for all page routes.
 * Applied in middleware.ts after i18n processing.
 *
 * CSP notes:
 *  - 'unsafe-inline' + 'unsafe-eval' for scripts: required by Next.js 15 App Router
 *    hydration and Tailwind v4 CSS-in-JS. Tighten with per-request nonces in Wave 2.
 *  - connect-src covers:
 *      Supabase REST + realtime (wss)
 *      Vercel Analytics vitals
 *      GA4 (google-analytics.com)
 *      PostHog (us.i.posthog.com + eu.i.posthog.com)
 *      Sentry ingest (tunneled via /monitoring)
 *      DeepSeek API (server-side, but script-src safe for any client pings)
 *  - frame-ancestors 'none' blocks clickjacking (mirrors X-Frame-Options: DENY).
 *  - upgrade-insecure-requests: redirect HTTP sub-resources to HTTPS automatically.
 */
export function buildSecurityHeaders(): Record<string, string> {
  const csp = [
    "default-src 'self'",
    // Scripts: Next.js hydration, Vercel, GA4 gtag, PostHog
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://va.vercel-scripts.com",
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://cdn.us.i.posthog.com",
      "https://cdn.eu.i.posthog.com",
    ].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google-analytics.com",
    "font-src 'self'",
    // Network connections from browser
    [
      "connect-src",
      "'self'",
      // Supabase
      "https://*.supabase.co",
      "wss://*.supabase.co",
      // Vercel
      "https://vitals.vercel-insights.com",
      // Google Analytics 4
      "https://www.google-analytics.com",
      "https://analytics.google.com",
      "https://www.googletagmanager.com",
      "https://stats.g.doubleclick.net",
      "https://region1.google-analytics.com",
      // PostHog (US + EU)
      "https://us.i.posthog.com",
      "https://eu.i.posthog.com",
      "https://app.posthog.com",
      // Sentry — tunneled via /monitoring (self), but also direct ingest
      "https://*.sentry.io",
      "https://*.ingest.sentry.io",
      // DeepSeek API (server-side only, but keep for transparency)
      "https://api.deepseek.com",
    ].join(' '),
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ')

  return {
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-DNS-Prefetch-Control': 'off',
  }
}
