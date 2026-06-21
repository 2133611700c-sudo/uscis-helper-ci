import type { MetadataRoute } from 'next';

const BASE_URL = 'https://messenginfo.com';
const LOCALES = ['en', 'ru', 'uk', 'es'] as const;

const BASE_PAGES = [
  '',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/about',
  '/contact',
  '/faq',
  '/services',
] as const;

// Service slug → final URL slug. `translate-document` is a 307-redirect
// to `/translate-document/start` (the wizard); sitemap emits the canonical
// destination directly so crawlers don't waste a hop and the indexed URL
// is the one our metadata's `canonical` actually points at.
const SERVICE_SLUGS = [
  'parole-expires-soon',
  're-parole-u4u',
  'tps-ukraine',
  'tps-status',
  'ead-work-permit',
  'i-94',
  'i-94-guide',
  'uscis-case-status',
  'payment-problem',
  'biometrics',
  'rfe-denial',
  'translate-document/start',
  'form-draft-helper',
  'official-sources',
  'attorney-directory',
] as const;

function hreflangAlternates(path: string) {
  return Object.fromEntries([
    ...LOCALES.map((l) => [l, `${BASE_URL}/${l}${path}`]),
    ['x-default', `${BASE_URL}/en${path}`],
  ]);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-05-06');
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    // Base pages (8 per locale)
    for (const page of BASE_PAGES) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified,
        changeFrequency: page === '' ? 'weekly' : 'monthly',
        priority: page === '' ? 1.0 : page === '/services' ? 0.9 : 0.7,
        alternates: { languages: hreflangAlternates(page) },
      });
    }

    // Service pages (12 per locale)
    for (const slug of SERVICE_SLUGS) {
      const path = `/services/${slug}`;
      entries.push({
        url: `${BASE_URL}/${locale}${path}`,
        lastModified,
        changeFrequency: 'monthly',
        priority: 0.8,
        alternates: { languages: hreflangAlternates(path) },
      });
    }
  }

  // Total: 4 × (8 + 12) = 80 entries
  return entries;
}
