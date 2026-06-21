// sentry.client.config.ts — runs in the browser
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',

    // Capture 10 % of sessions for performance profiling
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replays on errors only (0 % ambient replay to save quota)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text and inputs — translation pages render real passport data
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    // Breadcrumb filtering — skip noisy analytics pings
    beforeBreadcrumb(breadcrumb) {
      const url = breadcrumb.data?.url ?? ''
      if (
        typeof url === 'string' &&
        (url.includes('posthog') ||
          url.includes('google-analytics') ||
          url.includes('gtag'))
      ) {
        return null
      }
      return breadcrumb
    },

    // Strip email / token query params before reporting
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url)
          u.searchParams.delete('token')
          u.searchParams.delete('email')
          event.request.url = u.toString()
        } catch {
          // non-parseable URL — leave as-is
        }
      }
      return event
    },
  })
}
