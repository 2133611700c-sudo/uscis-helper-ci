'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { Languages, ClipboardEdit, Search, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navPillars, type NavIconName } from '@/data/navPillars'

const ICONS: Record<NavIconName, typeof Languages> = {
  Languages,
  ClipboardEdit,
  Search,
  BookOpen,
}

export function MobileBottomBar() {
  const t = useTranslations('header')
  const locale = useLocale()
  const pathname = usePathname()

  // Active pillar = the one whose topHref is the LONGEST matching prefix, so
  // /services/translate-document highlights Translate, not Forms (/services).
  const activeId = navPillars
    .map((p) => ({ id: p.id, full: `/${locale}${p.topHref}` }))
    .filter((x) => pathname === x.full || pathname.startsWith(`${x.full}/`))
    .sort((a, b) => b.full.length - a.full.length)[0]?.id

  return (
    <nav
      data-mobile-bar="true"
      className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white border-t border-slate-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-4 h-14">
        {navPillars.map((p) => {
          const Icon = ICONS[p.icon]
          const isActive = p.id === activeId
          return (
            <Link
              key={p.id}
              href={`/${locale}${p.topHref}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-1 min-w-0 text-sm leading-tight font-medium transition-colors text-center',
                isActive ? 'text-brand-600 dark:text-brand-300' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="block w-full break-words">{t(`nav.${p.labelKey}`)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
