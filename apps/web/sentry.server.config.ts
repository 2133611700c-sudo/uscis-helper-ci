// sentry.server.config.ts — runs in Node.js (API routes, RSC, server actions)
// Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',

    // Capture all transactions in dev, 10 % in prod
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Strip PII from server events before sending
    beforeSend(event) {
      // Redact email / API key patterns from exception messages
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) {
            ex.value = ex.value
              .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
              .replace(/sk-[A-Za-z0-9]{20,}/g, '[OPENAI_KEY]')
              .replace(/re_[A-Za-z0-9]{20,}/g, '[RESEND_KEY]')
          }
        }
      }
      return event
    },
  })
}
