/**
 * navPillars — the single source of truth for top-level navigation.
 *
 * Four pillars = the four jobs a user comes for: Translate, Forms, Check Status,
 * Info. Header (desktop) and MobileBottomBar both render from this list so they
 * stay in parity. Pure data (no React/next-intl) so server + client components
 * can both import it. Labels resolve via the `header.nav.pillars.*` i18n keys
 * (present in en/ru/uk/es). hrefs are locale-relative; callers prepend /${locale}.
 */
export type NavPillarId = 'translate' | 'forms' | 'status' | 'info'
export type NavIconName = 'Languages' | 'ClipboardEdit' | 'Search' | 'BookOpen'

export interface NavSubLink {
  /** i18n key under header.nav.pillars.<pillar>. */
  key: string
  /** locale-relative href (no /${locale} prefix). '#sources' is a home anchor. */
  href: string
}

export interface NavPillar {
  id: NavPillarId
  /** i18n key: header.nav.pillars.<id>.label */
  labelKey: string
  /** where the pillar label itself links */
  topHref: string
  /** lucide icon name for the mobile bar */
  icon: NavIconName
  subLinks: NavSubLink[]
}

export const navPillars: NavPillar[] = [
  {
    id: 'translate',
    labelKey: 'pillars.translate.label',
    topHref: '/services/translate-document',
    icon: 'Languages',
    subLinks: [
      { key: 'pillars.translate.translateDoc', href: '/services/translate-document' },
      { key: 'pillars.translate.supportedDocs', href: '/supported-documents' },
      { key: 'pillars.translate.pricing', href: '/pricing' },
    ],
  },
  {
    id: 'forms',
    labelKey: 'pillars.forms.label',
    topHref: '/services',
    icon: 'ClipboardEdit',
    subLinks: [
      { key: 'pillars.forms.ead', href: '/services/ead-work-permit' },
      { key: 'pillars.forms.reparole', href: '/services/re-parole-u4u' },
      { key: 'pillars.forms.tps', href: '/services/tps-ukraine' },
      { key: 'pillars.forms.all', href: '/services' },
    ],
  },
  {
    id: 'status',
    labelKey: 'pillars.status.label',
    topHref: '/services/uscis-case-status',
    icon: 'Search',
    subLinks: [
      { key: 'pillars.status.uscisStatus', href: '/services/uscis-case-status' },
      { key: 'pillars.status.tpsStatus', href: '/services/tps-status' },
      { key: 'pillars.status.i94Guide', href: '/services/i-94-guide' },
    ],
  },
  {
    id: 'info',
    labelKey: 'pillars.info.label',
    topHref: '/faq',
    icon: 'BookOpen',
    subLinks: [
      { key: 'pillars.info.faq', href: '/faq' },
      { key: 'pillars.info.attorneys', href: '/services/attorney-directory' },
      { key: 'pillars.info.sources', href: '/#sources' },
      { key: 'pillars.info.contact', href: '/contact' },
      { key: 'pillars.info.about', href: '/about' },
    ],
  },
]
