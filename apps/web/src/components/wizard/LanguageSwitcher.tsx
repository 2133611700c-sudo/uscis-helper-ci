'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useWizard } from '@/contexts/WizardContext'
import type { WizardState } from '@/contexts/WizardContext'

type Locale = WizardState['locale']

const LOCALES: Locale[] = ['ru', 'uk', 'en', 'es']

const LOCALE_LABELS: Record<Locale, string> = {
  ru: '🇷🇺 RU',
  uk: '🇺🇦 UK',
  en: '🇺🇸 EN',
  es: '🇪🇸 ES',
}

/**
 * Locale switcher for the wizard.
 * Changes the URL locale segment (/[locale]/services/re-parole-u4u/start)
 * AND updates WizardContext so all screens re-render immediately.
 * Preserves the ?session= query parameter.
 */
export function LanguageSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { state, setLocale } = useWizard()

  function switchLocale(newLocale: Locale) {
    if (newLocale === state.locale) return

    // Update context immediately for instant UI feedback
    setLocale(newLocale)

    // Navigate to the same path with the new locale segment
    const segments = pathname.split('/')
    segments[1] = newLocale
    const newPath = segments.join('/')
    const qs = searchParams.toString()
    router.push(qs ? `${newPath}?${qs}` : newPath)
  }

  return (
    <div className="flex items-center gap-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchLocale(l)}
          className={[
            'rounded px-1.5 py-1 text-xs font-medium transition-colors',
            l === state.locale
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
          ].join(' ')}
          aria-label={`Switch to ${LOCALE_LABELS[l]}`}
          aria-pressed={l === state.locale}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  )
}
