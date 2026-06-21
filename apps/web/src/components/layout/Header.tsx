import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { LocaleSwitcher } from './LocaleSwitcher'
import { SiteThemeToggle } from './SiteThemeToggle'
import { navPillars } from '@/data/navPillars'

export function Header() {
  const t = useTranslations('header')
  const locale = useLocale()

  return (
    <header
      data-site-header="true"
      className="sticky top-0 z-50 w-full backdrop-blur-[20px] border-b"
      style={{
        background: 'var(--surface-1)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-header)',
      }}
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 h-14 md:h-[68px] flex items-center justify-between gap-4">
        <Logo locale={locale} />

        {/* Desktop nav — 4 pillars from the shared registry; CSS-only hover
            dropdown exposes the sub-links (no client JS). */}
        <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Main navigation">
          {navPillars.map((p) => (
            <div key={p.id} className="group relative">
              <Link
                href={`/${locale}${p.topHref}`}
                className="inline-flex items-center hover:bg-[var(--surface-3)] transition-[background,color] duration-150 font-medium px-3 py-1.5 rounded-md"
                style={{ color: 'var(--text-1)' }}
              >
                {t(`nav.${p.labelKey}`)}
              </Link>
              <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute left-0 top-full pt-1 z-50">
                <div
                  className="min-w-[210px] rounded-lg border py-1 shadow-lg"
                  style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
                >
                  {p.subLinks.map((s) => (
                    <Link
                      key={s.key}
                      href={`/${locale}${s.href}`}
                      className="block px-4 py-2 text-sm hover:bg-[var(--surface-3)] transition-colors"
                      style={{ color: 'var(--text-1)' }}
                    >
                      {t(`nav.${s.key}`)}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SiteThemeToggle />
          <LocaleSwitcher />
          {/* Check status — filled CTA → our own status helper (plain-language
              decode, then links to egov). */}
          <Link
            href={`/${locale}/services/uscis-case-status`}
            className="hidden sm:inline-flex items-center active:scale-[0.97] text-white text-sm font-semibold px-4 py-2 rounded-[999px] transition-[background,transform] duration-150"
            style={{ background: 'var(--primary)' }}
          >
            {t('ctaStatus')}
          </Link>
        </div>
      </div>
    </header>
  )
}
