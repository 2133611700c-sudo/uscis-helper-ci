'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { MessageCircle, X, Search, Grid3X3, Library, Mail } from 'lucide-react'

/**
 * Routes where the floating widget MUST be hidden — they have their own
 * focused step-by-step UX where a generic 72×72 AI bubble in the bottom-
 * right corner steals attention and (on 390px viewports) physically
 * overlaps choice cards. Test reported overlap of the "Продлеваю" card
 * on Step 1 of the TPS wizard, confirmed by browser audit.
 *
 * Match policy: substring match on the locale-stripped path so any
 * sub-route inside these flows stays clean too.
 */
const HIDE_ON_PATH_SUBSTRINGS: readonly string[] = [
  '/services/tps-ukraine/start',
  '/services/re-parole-u4u/start',
  '/services/translate-document/start',
]

function shouldHideOnPath(pathname: string | null): boolean {
  if (!pathname) return false
  return HIDE_ON_PATH_SUBSTRINGS.some((s) => pathname.includes(s))
}

export function MiaFloatingWidget() {
  const [open, setOpen] = useState(false)
  const t = useTranslations('miaWidget')
  const locale = useLocale()
  const pathname = usePathname()
  const hidden = shouldHideOnPath(pathname)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const links: Array<{ href: string; label: string; icon: typeof Search; external?: boolean }> = [
    // Case Status — opens the official USCIS portal DIRECTLY in a new tab.
    { href: 'https://egov.uscis.gov/', label: t('links.caseStatus'), icon: Search, external: true },
    { href: `/${locale}/#services`, label: t('links.services'), icon: Grid3X3 },
    { href: `/${locale}/#sources`, label: t('links.sources'), icon: Library },
    { href: `/${locale}/contact`, label: t('links.contact'), icon: Mail },
  ]

  useEffect(() => {
    const savedState = sessionStorage.getItem('mia-widget-open')
    if (savedState === 'true') {
      setOpen(true)
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem('mia-widget-open', String(open))
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [open])

  if (hidden) {
    return null
  }

  return (
    <div data-mia-widget className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <div
          ref={panelRef}
          className="pointer-events-auto w-[min(calc(100vw-1.5rem),26rem)] md:w-[26rem] max-h-[460px] rounded-card bg-white text-slate-900 shadow-card-hover border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-2 duration-200"
        >
          {/* Header */}
          <div className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Mia</span>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Close Mia widget"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body — explicit slate colors, bg-white panel must never inherit dark text */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-sm text-slate-700 mb-4">{t('greeting')}</p>
            <nav className="flex flex-col gap-2">
              {links.map(({ href, label, icon: Icon, external }) => {
                const className = 'flex items-center gap-3 rounded-btn border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors'
                if (external) {
                  return (
                    <a
                      key={href}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                      className={className}
                    >
                      <Icon className="w-4 h-4 text-blue-600 shrink-0" />
                      {label}
                    </a>
                  )
                }
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={className}
                  >
                    <Icon className="w-4 h-4 text-blue-600 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2">
            <p className="text-xs text-slate-500 leading-relaxed">{t('disclaimer')}</p>
          </div>
        </div>
      )}

      {/* Trigger button — pointer-events-auto restores clickability within pointer-events-none container.
           Idle opacity lets content underneath remain partially visible (WCAG overlap). */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto w-14 h-14 md:w-[72px] md:h-[72px] rounded-full bg-brand-600 hover:bg-brand-700 hover:opacity-100 text-white shadow-card-hover flex items-center justify-center transition-all opacity-80"
        aria-label={open ? 'Close Mia' : 'Open Mia'}
        aria-expanded={open}
      >
        {open ? <X className="w-6 h-6 md:w-7 md:h-7" /> : <MessageCircle className="w-6 h-6 md:w-7 md:h-7" />}
      </button>
    </div>
  )
}
