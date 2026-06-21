/**
 * ServiceBackBar — sticky "← Все услуги" / "← All services" pill at the
 * top of every service landing page.
 *
 * Per UX audit (2026-05-10): mobile users on /services/<slug> had no clear
 * way to go back. The browser back button works but a 60-year-old user on
 * a phone rarely uses it — they look for a visible UI button.
 *
 * Single shared component → identical placement and label on every service.
 * Mount this at the very top of each landing page <main>.
 */

import Link from 'next/link'

const LABELS = {
  ru: { back: '← Все услуги' },
  uk: { back: '← Усі послуги' },
  en: { back: '← All services' },
  es: { back: '← Todos los servicios' },
} as const

type Locale = keyof typeof LABELS

export function ServiceBackBar({ locale }: { locale: string }) {
  const code = (['ru', 'uk', 'en', 'es'].includes(locale) ? locale : 'en') as Locale
  return (
    <div
      style={{
        padding: '10px 20px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <Link
        href={`/${code}/services`}
        style={{
          display: 'inline-block',
          padding: '8px 12px',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--text-1)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          textDecoration: 'none',
        }}
        data-testid="service-back"
      >
        {LABELS[code].back}
      </Link>
    </div>
  )
}
