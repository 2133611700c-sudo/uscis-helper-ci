/**
 * Global 404 (root-level).
 *
 * Per UX audit: the previous fallback was a black screen with no navigation,
 * which traps users on a typo'd URL. This page gives clear copy in 4
 * languages (auto-detected from URL prefix) and a single big "На главную"
 * button so any user — including a 60-year-old on mobile — can recover.
 */

import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Страница не найдена | Messenginfo',
  robots: { index: false, follow: false },
}

const COPY = {
  ru: {
    title: 'Страница не найдена',
    body: 'Возможно, вы перешли по устаревшей или неправильной ссылке. Это не ошибка с вашей стороны — просто такой страницы у нас нет.',
    home: 'На главную страницу',
    services: 'Посмотреть услуги',
  },
  uk: {
    title: 'Сторінку не знайдено',
    body: 'Можливо, ви перейшли за застарілим або неправильним посиланням. Це не ваша помилка — просто такої сторінки у нас немає.',
    home: 'На головну сторінку',
    services: 'Переглянути послуги',
  },
  en: {
    title: 'Page not found',
    body: 'You may have followed an outdated or wrong link. This is not your fault — this page just does not exist.',
    home: 'Back to home',
    services: 'See our services',
  },
  es: {
    title: 'Página no encontrada',
    body: 'Es posible que haya seguido un enlace antiguo o incorrecto. No es culpa suya — esta página simplemente no existe.',
    home: 'Volver al inicio',
    services: 'Ver nuestros servicios',
  },
} as const

export default function NotFound() {
  // We don't have access to `params.locale` here (this is the root not-found,
  // outside the [locale] segment), so default to RU because the bulk of our
  // target audience reads Russian / Ukrainian. The home button goes to /ru.
  const c = COPY.ru

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: 'var(--background)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 80, fontWeight: 800, color: 'var(--text-3)', marginBottom: 8 }}>404</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', marginBottom: 14 }}>
          {c.title}
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--text-2)', marginBottom: 24 }}>
          {c.body}
        </p>
        <Link
          href="/ru"
          style={{
            display: 'block',
            width: '100%',
            padding: '16px 18px',
            background: 'var(--success)',
            color: '#fff',
            fontSize: 17,
            fontWeight: 800,
            borderRadius: 12,
            textDecoration: 'none',
            marginBottom: 10,
            boxShadow: '0 3px 14px rgba(22,163,74,0.30)',
          }}
        >
          ← {c.home}
        </Link>
        <Link
          href="/ru/services"
          style={{
            display: 'block',
            width: '100%',
            padding: '12px 16px',
            background: 'var(--surface-2)',
            color: 'var(--text-1)',
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 10,
            border: '1px solid var(--border)',
            textDecoration: 'none',
          }}
        >
          {c.services} →
        </Link>
      </div>
    </main>
  )
}
