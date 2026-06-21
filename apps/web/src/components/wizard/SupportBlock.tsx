'use client'

/**
 * SupportBlock — Stage 8N
 * Small contextual help nudge at the bottom of wizard screens 2, 5, 8, 9, 10, 12.
 * Designed to be unobtrusive: single line, muted style, always below main content.
 */

const T = {
  uk: {
    label: 'Потрібна допомога?',
    link: 'support@messenginfo.com',
  },
  ru: {
    label: 'Нужна помощь?',
    link: 'support@messenginfo.com',
  },
  en: {
    label: 'Need help?',
    link: 'support@messenginfo.com',
  },
  es: {
    label: '¿Necesita ayuda?',
    link: 'support@messenginfo.com',
  },
} as const

type Locale = keyof typeof T

interface Props {
  locale: string
}

export function SupportBlock({ locale }: Props) {
  const t = T[(locale as Locale)] ?? T.en

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '10px 0 2px',
        borderTop: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: '15px', color: 'var(--text-3)' }}>{t.label}</span>
      <a
        href={`mailto:${t.link}`}
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--primary)',
          textDecoration: 'none',
        }}
      >
        {t.link}
      </a>
    </div>
  )
}
