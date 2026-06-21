'use client'
/**
 * Wraps TPSWizardV2 with an ErrorBoundary that catches React render crashes
 * (e.g. from stale localStorage state) and presents a friendly restart screen
 * instead of the Next.js global 500 page.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import TPSWizard from './TPSWizardV2'

const STORAGE_KEY = 'wizard:tps-ukraine:v3:state'

function WizardCrashFallback({ locale }: { locale: string }) {
  useEffect(() => {
    // Clear corrupted state so a page reload starts fresh
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  const msgs: Record<string, { title: string; body: string; cta: string }> = {
    ru: {
      title: 'Что-то пошло не так',
      body: 'Данные сессии повреждены. Нажмите кнопку ниже — мы очистим всё и начнём с начала.',
      cta: '↺ Начать заново',
    },
    uk: {
      title: 'Щось пішло не так',
      body: 'Дані сесії пошкоджено. Натисніть кнопку нижче — ми очистимо всі дані і почнемо спочатку.',
      cta: '↺ Почати знову',
    },
    es: {
      title: 'Algo salió mal',
      body: 'Los datos de la sesión están dañados. Haga clic para limpiar todo y empezar de nuevo.',
      cta: '↺ Empezar de nuevo',
    },
    en: {
      title: 'Something went wrong',
      body: 'Your session data may be corrupted. Click below to clear everything and start fresh.',
      cta: '↺ Start over',
    },
  }
  const m = msgs[locale] ?? msgs.en

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '80px auto',
        padding: '32px 24px',
        background: 'var(--surface, #fff)',
        border: '1.5px solid var(--error-border, #d33)',
        borderRadius: 16,
        textAlign: 'center',
        fontFamily: '-apple-system,"Segoe UI",Roboto,Inter,sans-serif',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1, #111)', marginBottom: 12 }}>
        {m.title}
      </h2>
      <p style={{ fontSize: 15, color: 'var(--text-2, #555)', lineHeight: 1.6, marginBottom: 24 }}>
        {m.body}
      </p>
      <button
        type="button"
        onClick={() => { window.location.reload() }}
        style={{
          display: 'block',
          width: '100%',
          padding: '14px 20px',
          background: '#16a34a',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: 800,
          cursor: 'pointer',
          fontFamily: 'inherit',
          marginBottom: 12,
        }}
      >
        {m.cta}
      </button>
      <Link
        href="/"
        style={{ fontSize: 13, color: 'var(--text-3, #888)', textDecoration: 'underline' }}
      >
        ← {locale === 'ru' ? 'На главную' : locale === 'uk' ? 'На головну' : locale === 'es' ? 'Inicio' : 'Home'}
      </Link>
    </div>
  )
}

interface Props {
  locale: string
}

export default function TPSWizardWithErrorBoundary({ locale }: Props) {
  return (
    <ErrorBoundary
      label="tps-wizard"
      fallback={<WizardCrashFallback locale={locale} />}
    >
      <TPSWizard locale={locale} />
    </ErrorBoundary>
  )
}
