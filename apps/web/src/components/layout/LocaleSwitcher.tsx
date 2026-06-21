'use client'

import { useMemo } from 'react'
import { Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { routing } from '@/i18n/routing'

const labels: Record<string, string> = { en: 'EN', ru: 'RU', uk: 'UK', es: 'ES' }
// Production cycle: only fully-translated languages. ES stays in routing (URLs work)
// but is excluded from the switcher rotation until Spanish content is complete.
const SWITCHER_LOCALES: AppLocale[] = ['en', 'ru', 'uk']
type AppLocale = (typeof routing.locales)[number]

export function LocaleSwitcher() {
  const locale = useLocale() as AppLocale
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('header.languageSelector')

  const { currentLabel, nextLocale, nextLabel } = useMemo(() => {
    const locales = SWITCHER_LOCALES
    const currentIndex = Math.max(locales.indexOf(locale), 0)
    const nextIndex = (currentIndex + 1) % locales.length
    return {
      currentLabel: labels[locale],
      nextLocale: locales[nextIndex],
      nextLabel: labels[locales[nextIndex]],
    }
  }, [locale])

  function switchLocale() {
    const segments = pathname.split('/')
    segments[1] = nextLocale
    router.push(segments.join('/'))
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 shadow-sm transition-all duration-200 hover:border-brand-200 hover:bg-slate-50"
      aria-label={`${t('label')}: ${currentLabel} → ${nextLabel}`}
      title={t('label')}
    >
      <Globe className="h-4 w-4 shrink-0 text-ink-700" />
      <span>{currentLabel}</span>
      <span className="text-xs font-semibold text-ink-600">
        → {nextLabel}
      </span>
    </button>
  )
}
