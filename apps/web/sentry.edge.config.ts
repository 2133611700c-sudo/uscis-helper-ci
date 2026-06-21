// sentry.edge.config.ts — runs in Edge runtime (middleware)
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    // Edge runtime has tight CPU budget — keep sample rate very low
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.5,
  })
}
