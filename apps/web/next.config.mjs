import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@uscis-helper/db', '@uscis-helper/shared'],

  async redirects() {
    return [
      // 301 redirect from old standalone HTML wizard to new Next.js wizard
      {
        source: '/translate-wizard.html',
        destination: '/en/services/translate-document/start',
        permanent: true,
      },
      {
        source: '/translate-wizard',
        destination: '/en/services/translate-document/start',
        permanent: true,
      },
    ]
  },
};

const intlConfig = withNextIntl(nextConfig);

// Sentry webpack plugin (source-map upload + auto-instrumentation) is only
// activated when SENTRY_AUTH_TOKEN is present — i.e. Vercel production builds.
// CI and local builds skip it to avoid @sentry/cli binary requirements.
// The runtime Sentry SDK (sentry.client/server/edge.config.ts) still loads
// in all environments when NEXT_PUBLIC_SENTRY_DSN is set.
const finalConfig = process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(intlConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      disableLogger: true,
      tunnelRoute: '/monitoring',
      hideSourceMaps: true,
      autoInstrumentServerFunctions: true,
      autoInstrumentMiddleware: true,
      autoInstrumentAppDirectory: true,
    })
  : intlConfig;

export default finalConfig;
