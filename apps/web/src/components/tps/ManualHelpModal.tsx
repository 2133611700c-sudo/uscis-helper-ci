'use client'

/**
 * ManualHelpModal — small "I need help" dialog wired to /api/tps/manual-review.
 *
 * Triggered from:
 *   - DocumentUploadScreen, after OCR failure or image-quality reject
 *   - SelfReviewScreen, when the user clicks "I'm not sure"
 *
 * Asks for ONE field — the user's email — so an operator can answer them.
 * Does NOT collect: name, phone, address, document image, document
 * contents, OCR output. The user's stage in the flow is sent as a short
 * label ('upload' | 'review' | 'generate'). Reason is fixed by caller.
 *
 * Locked privacy rules:
 *   - Never display "we will file for you" / "we will contact USCIS"
 *   - Always show "Messenginfo is not a law firm" line
 *   - Email validation is local (regex) — server validates again.
 */

import { useState } from 'react'
import { TPS_A11Y } from '@/lib/tps/a11y'

export type Locale = 'uk' | 'ru' | 'en' | 'es'
export type Stage = 'upload' | 'review' | 'generate'
export type Reason =
  | 'image_quality_failed'
  | 'low_ocr_confidence'
  | 'missing_critical_fields'
  | 'user_requested_human_help'

export interface ManualHelpModalProps {
  open: boolean
  locale: Locale
  stage: Stage
  reason: Reason
  onClose: () => void
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface CopyBundle {
  title: string
  body: string
  emailLabel: string
  emailPlaceholder: string
  submit: string
  cancel: string
  submitting: string
  successTitle: string
  successBody: string
  errorTitle: string
  errorBody: string
  invalidEmail: string
  notLawFirm: string
}

const COPY: Record<Locale, CopyBundle> = {
  uk: {
    title: 'Потрібна допомога',
    body: 'Залиште свій email — оператор Messenginfo зв’яжеться з вами. Ми не зберігаємо вашу фотографію документа і не передаємо ваші дані третім особам.',
    emailLabel: 'Ваш email',
    emailPlaceholder: 'you@example.com',
    submit: 'Надіслати запит',
    cancel: 'Відмінити',
    submitting: 'Надсилаю…',
    successTitle: 'Запит надіслано',
    successBody: 'Ми відповімо на ваш email протягом 1-2 робочих днів.',
    errorTitle: 'Не вдалося відправити',
    errorBody: 'Спробуйте ще раз або напишіть нам напряму на support@messenginfo.com',
    invalidEmail: 'Перевірте email — здається, він введений неправильно.',
    notLawFirm: 'Messenginfo — не юридична фірма і не дає юридичних консультацій.',
  },
  ru: {
    title: 'Нужна помощь',
    body: 'Оставьте свой email — оператор Messenginfo свяжется с вами. Мы не сохраняем фотографию документа и не передаём ваши данные третьим лицам.',
    emailLabel: 'Ваш email',
    emailPlaceholder: 'you@example.com',
    submit: 'Отправить запрос',
    cancel: 'Отмена',
    submitting: 'Отправляю…',
    successTitle: 'Запрос отправлен',
    successBody: 'Мы ответим на ваш email в течение 1-2 рабочих дней.',
    errorTitle: 'Не удалось отправить',
    errorBody: 'Попробуйте ещё раз или напишите напрямую на support@messenginfo.com',
    invalidEmail: 'Проверьте email — кажется, он введён неправильно.',
    notLawFirm: 'Messenginfo — не юридическая фирма и не даёт юридических консультаций.',
  },
  en: {
    title: 'I need help',
    body: 'Leave your email and a Messenginfo operator will get back to you. We do not store your document image and do not share your data with third parties.',
    emailLabel: 'Your email',
    emailPlaceholder: 'you@example.com',
    submit: 'Send request',
    cancel: 'Cancel',
    submitting: 'Sending…',
    successTitle: 'Request sent',
    successBody: 'We will reply to your email within 1-2 business days.',
    errorTitle: 'Could not send',
    errorBody: 'Please try again or write to support@messenginfo.com directly.',
    invalidEmail: 'Please check the email — it looks incorrect.',
    notLawFirm: 'Messenginfo is not a law firm and does not provide legal advice.',
  },
  es: {
    title: 'Necesito ayuda',
    body: 'Deje su email y un operador de Messenginfo le responderá. No guardamos la imagen de su documento ni compartimos sus datos con terceros.',
    emailLabel: 'Su email',
    emailPlaceholder: 'you@example.com',
    submit: 'Enviar solicitud',
    cancel: 'Cancelar',
    submitting: 'Enviando…',
    successTitle: 'Solicitud enviada',
    successBody: 'Le responderemos a su email en 1-2 días hábiles.',
    errorTitle: 'No se pudo enviar',
    errorBody: 'Inténtelo otra vez o escriba directamente a support@messenginfo.com',
    invalidEmail: 'Revise el email — parece incorrecto.',
    notLawFirm: 'Messenginfo no es un bufete de abogados y no ofrece asesoría legal.',
  },
}

type Phase = 'idle' | 'submitting' | 'success' | 'error'

export function ManualHelpModal(props: ManualHelpModalProps) {
  const c = COPY[props.locale]
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)

  if (!props.open) return null

  async function handleSubmit() {
    setErrorText(null)
    if (!EMAIL_RX.test(email)) {
      setErrorText(c.invalidEmail)
      return
    }
    setPhase('submitting')
    try {
      const res = await fetch('/api/tps/manual-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: props.reason,
          contact_email: email,
          locale: props.locale,
          stage: props.stage,
        }),
      })
      if (!res.ok) {
        setPhase('error')
        return
      }
      setPhase('success')
    } catch {
      setPhase('error')
    }
  }

  function handleClose() {
    setEmail('')
    setPhase('idle')
    setErrorText(null)
    props.onClose()
  }

  return (
    <div
      data-testid="tps-manual-help-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tps-manual-help-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          color: 'var(--text-1)',
          borderRadius: 14,
          padding: '20px 22px',
          width: '100%',
          maxWidth: 460,
          boxShadow: '0 20px 60px rgba(0,0,0,0.30)',
        }}
      >
        <h3
          id="tps-manual-help-title"
          style={{ fontSize: 20, fontWeight: TPS_A11Y.WEIGHT_HEAVY, marginBottom: 12 }}
        >
          {c.title}
        </h3>

        {phase === 'success' ? (
          <>
            <p
              data-testid="tps-manual-help-success"
              style={{
                // A11Y: success body 14→16
                fontSize: TPS_A11Y.TEXT_BODY,
                lineHeight: TPS_A11Y.LINE_HEIGHT_BODY,
                marginBottom: 10,
              }}
            >
              <strong>{c.successTitle}</strong>
              <br />
              {c.successBody}
            </p>
            <button
              type="button"
              onClick={handleClose}
              style={primaryBtn}
              data-testid="tps-manual-help-close"
            >
              OK
            </button>
          </>
        ) : (
          <>
            <p style={{
              // A11Y: body explanation 14→16 — explains data flow
              fontSize: TPS_A11Y.TEXT_BODY,
              lineHeight: TPS_A11Y.LINE_HEIGHT_BODY,
              marginBottom: 14,
              color: 'var(--text-1)',
            }}>
              {c.body}
            </p>

            <label
              style={{
                // A11Y: email label 12→14
                display: 'block',
                fontSize: TPS_A11Y.TEXT_LABEL,
                fontWeight: TPS_A11Y.WEIGHT_BOLD,
                marginBottom: 6,
                color: 'var(--text-1)',
              }}
            >
              {c.emailLabel}
            </label>
            <input
              type="email"
              data-testid="tps-manual-help-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={c.emailPlaceholder}
              disabled={phase === 'submitting'}
              style={{
                width: '100%',
                height: 44,
                padding: '0 12px',
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 15,
                marginBottom: 8,
              }}
            />

            {errorText && (
              <p
                data-testid="tps-manual-help-email-error"
                style={{
                  // A11Y: invalid-email error 12→14, weight 600
                  fontSize: TPS_A11Y.TEXT_LABEL,
                  fontWeight: TPS_A11Y.WEIGHT_SEMIBOLD,
                  color: 'var(--danger-text, #991b1b)',
                  marginBottom: 10,
                }}
              >
                {errorText}
              </p>
            )}

            {phase === 'error' && (
              <div
                data-testid="tps-manual-help-error"
                style={{
                  // A11Y: error block 12→14
                  fontSize: TPS_A11Y.TEXT_LABEL,
                  color: 'var(--danger-text, #991b1b)',
                  background: 'var(--danger-bg, #fee2e2)',
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 10,
                }}
              >
                <strong>{c.errorTitle}</strong> {c.errorBody}
              </div>
            )}

            <p style={{
              // A11Y: 'not a law firm' 11→14, color text-3→text-2,
              // medium weight so italic stays readable for elder users.
              fontSize: TPS_A11Y.TEXT_DISCLAIMER,
              fontWeight: TPS_A11Y.WEIGHT_MEDIUM,
              color: 'var(--text-2)',
              fontStyle: 'italic',
              marginBottom: 14,
            }}>
              {c.notLawFirm}
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={phase === 'submitting'}
                style={secondaryBtn}
                data-testid="tps-manual-help-cancel"
              >
                {c.cancel}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={phase === 'submitting' || !email}
                style={{
                  ...primaryBtn,
                  opacity: phase === 'submitting' || !email ? 0.5 : 1,
                  cursor: phase === 'submitting' || !email ? 'not-allowed' : 'pointer',
                }}
                data-testid="tps-manual-help-submit"
              >
                {phase === 'submitting' ? c.submitting : c.submit}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// A11Y: primary CTA 48px tall, 17px label — readable on small phones
const primaryBtn: React.CSSProperties = {
  flex: 2,
  minHeight: TPS_A11Y.TOUCH_PRIMARY,
  padding: '14px 20px',
  background: 'var(--success)',
  color: '#fff',
  fontSize: 17,
  fontWeight: TPS_A11Y.WEIGHT_HEAVY,
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  flex: 1,
  minHeight: TPS_A11Y.TOUCH_PRIMARY,
  padding: '14px 16px',
  background: 'var(--surface-2)',
  color: 'var(--text-1)',
  fontSize: TPS_A11Y.TEXT_BODY_COMPACT,
  fontWeight: TPS_A11Y.WEIGHT_BOLD,
  borderRadius: 10,
  border: '1px solid var(--border)',
  cursor: 'pointer',
}
