'use client'

/**
 * ReviewPrompt — post-download star rating + optional comment.
 *
 * Shows in Screen11 after the packet is generated.
 * POST /api/review → Supabase `reviews` table (gracefully silent if table missing).
 * States: idle → (rated / skipped) → submitted
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const T = {
  uk: {
    heading: '⭐ Ваш відгук',
    subheading: 'Наскільки зручним був наш сервіс?',
    commentPlaceholder: 'Поділіться враженнями (необов\'язково)…',
    submitBtn: 'Надіслати відгук →',
    skipBtn: 'Пропустити',
    submittingBtn: 'Надсилаємо…',
    thanks: 'Дякуємо! Ваш відгук дуже важливий для нас.',
    stars: ['Жахливо', 'Погано', 'Нормально', 'Добре', 'Чудово!'],
  },
  ru: {
    heading: '⭐ Ваш отзыв',
    subheading: 'Насколько удобным был наш сервис?',
    commentPlaceholder: 'Поделитесь впечатлениями (необязательно)…',
    submitBtn: 'Отправить отзыв →',
    skipBtn: 'Пропустить',
    submittingBtn: 'Отправляем…',
    thanks: 'Спасибо! Ваш отзыв очень важен для нас.',
    stars: ['Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично!'],
  },
  en: {
    heading: '⭐ Your feedback',
    subheading: 'How easy was it to use our service?',
    commentPlaceholder: 'Share your thoughts (optional)…',
    submitBtn: 'Submit feedback →',
    skipBtn: 'Skip',
    submittingBtn: 'Sending…',
    thanks: 'Thank you! Your feedback helps us improve.',
    stars: ['Terrible', 'Poor', 'OK', 'Good', 'Excellent!'],
  },
  es: {
    heading: '⭐ Su opinión',
    subheading: '¿Qué tan fácil fue usar nuestro servicio?',
    commentPlaceholder: 'Comparta sus impresiones (opcional)…',
    submitBtn: 'Enviar opinión →',
    skipBtn: 'Omitir',
    submittingBtn: 'Enviando…',
    thanks: 'Gracias! Sus comentarios nos ayudan a mejorar.',
    stars: ['Terrible', 'Malo', 'Regular', 'Bueno', '¡Excelente!'],
  },
} as const

type Locale = keyof typeof T

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReviewPromptProps {
  locale: Locale
  sessionId: string | null
  serviceSlug?: string
}

export function ReviewPrompt({ locale, sessionId, serviceSlug = 're-parole-u4u' }: ReviewPromptProps) {
  const t = T[locale] ?? T.en

  const [hovered, setHovered] = useState(0)   // 1–5
  const [selected, setSelected] = useState(0) // 1–5
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'skipped'>('idle')

  if (status === 'skipped') return null

  if (status === 'done') {
    return (
      <div
        className="rounded-[14px] p-4 text-center"
        style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
      >
        <p className="text-[28px] mb-1">🙏</p>
        <p className="text-[14px] font-semibold" style={{ color: 'var(--success-text)' }}>
          {t.thanks}
        </p>
      </div>
    )
  }

  async function handleSubmit() {
    if (selected === 0) return
    setStatus('submitting')
    try {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          service_slug: serviceSlug,
          locale,
          stars: selected,
          comment: comment.trim() || null,
        }),
      })
    } catch {
      // silent — never block the user over a review
    }
    setStatus('done')
  }

  const displayRating = hovered || selected

  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3"
        style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          {t.heading}
        </p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
          {t.subheading}
        </p>
      </div>

      <div className="px-4 py-4 space-y-3" style={{ background: 'var(--surface)' }}>
        {/* Stars */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setSelected(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="text-[32px] transition-all duration-100 focus:outline-none"
              style={{
                transform: displayRating >= star ? 'scale(1.15)' : 'scale(1)',
                filter: displayRating >= star ? 'none' : 'grayscale(1) opacity(0.35)',
              }}
              aria-label={t.stars[star - 1]}
            >
              ⭐
            </button>
          ))}
        </div>

        {/* Star label */}
        {displayRating > 0 && (
          <p
            className="text-center text-sm font-semibold"
            style={{ color: 'var(--primary)', minHeight: '18px' }}
          >
            {t.stars[displayRating - 1]}
          </p>
        )}

        {/* Comment textarea — shown once a star is selected */}
        {selected > 0 && (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t.commentPlaceholder}
            rows={3}
            maxLength={500}
            className="w-full rounded-[10px] text-sm resize-none"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
              padding: '10px 12px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatus('skipped')}
            className="flex-1 rounded-[8px] text-sm font-medium py-2 transition-all"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-3)',
            }}
          >
            {t.skipBtn}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected === 0 || status === 'submitting'}
            className="flex-1 rounded-[8px] text-sm font-bold py-2 transition-all"
            style={{
              background: selected > 0 ? 'var(--primary)' : 'var(--border-strong)',
              color: selected > 0 ? '#fff' : 'var(--text-3)',
              border: 'none',
              cursor: selected > 0 ? 'pointer' : 'not-allowed',
              opacity: selected > 0 ? 1 : 0.55,
            }}
          >
            {status === 'submitting' ? t.submittingBtn : t.submitBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
