import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AnalyticsScripts } from '@/components/analytics/Analytics';
import { routing } from '@/i18n/routing';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileBottomBar } from '@/components/layout/MobileBottomBar';
import { MiaFloatingWidget } from '@/components/widgets/MiaFloatingWidget';
import '../globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' });
// Cyrillic subset required: this is a RU/UK product, headings using --font-display
// would otherwise fall back to a system serif for Ukrainian/Russian text.
const playfair = Playfair_Display({ subsets: ['latin', 'cyrillic'], weight: ['700', '800'], variable: '--font-playfair' });

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const localeMap: Record<string, string> = {
    en: 'en_US',
    ru: 'ru_RU',
    uk: 'uk_UA',
    es: 'es_ES',
  };

  return {
    title: t('title'),
    description: t('description'),
    keywords: t('keywords'),
    metadataBase: new URL('https://messenginfo.com'),
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/icon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icon-48x48.png', sizes: '48x48', type: 'image/png' },
        { url: '/icon.svg', type: 'image/svg+xml' },
      ],
      shortcut: '/favicon.ico',
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    alternates: {
      canonical: `https://messenginfo.com/${locale}`,
      languages: {
        'en': 'https://messenginfo.com/en',
        'ru': 'https://messenginfo.com/ru',
        'uk': 'https://messenginfo.com/uk',
        'es': 'https://messenginfo.com/es',
        'x-default': 'https://messenginfo.com/en',
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `https://messenginfo.com/${locale}`,
      siteName: 'Messenginfo',
      locale: localeMap[locale] ?? 'en_US',
      type: 'website',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Messenginfo' }],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/og-image.png'],
    },
    robots: { index: true, follow: true },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Messenginfo',
  url: 'https://messenginfo.com',
  email: 'contact@messenginfo.com',
  areaServed: 'US',
  knowsLanguage: ['en', 'ru', 'uk', 'es'],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Messenginfo',
  url: 'https://messenginfo.com',
  description: 'Official-source immigration information and self-help tools for Ukrainians in the US. Not a law firm.',
  inLanguage: ['en', 'ru', 'uk', 'es'],
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: 'https://messenginfo.com/en/faq?q={search_term_string}' },
    'query-input': 'required name=search_term_string',
  },
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  // Build/deployment fingerprint for auditors. Not displayed to the user —
  // view-source / DevTools only. Vercel injects VERCEL_GIT_COMMIT_SHA and
  // VERCEL_DEPLOYMENT_ID at build time. Fallback to 'unknown' so local
  // dev (no Vercel env) still renders cleanly.
  const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown';
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? 'unknown';

  return (
    <html lang={locale} translate="no" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        <meta name="google" content="notranslate" />
        <meta name="x-build-sha" content={buildSha} />
        <meta name="x-vercel-deployment" content={deploymentId} />
      </head>
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t===null&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();` }} />
      <body className="min-h-screen antialiased pb-24 md:pb-0">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <MobileBottomBar />
            <MiaFloatingWidget />
          </div>
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
        <AnalyticsScripts />
        <Script
          id="org-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <Script
          id="website-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </body>
    </html>
  );
}
