'use client'

/**
 * TranslationReviewGate — 8 CFR §103.2(b)(3) certification boundary.
 *
 * Shows the translation draft HTML and requires explicit user confirmation
 * before the translation is included in the ZIP packet.
 *
 * Legal principle: the user self-certifies as the translator. Messenginfo
 * prepares the draft; the user reviews, accepts responsibility, and signs.
 *
 * This component MUST be shown before reviewConfirmed is set to true.
 * packetBuilder.ts requires reviewConfirmed: true before ZIP inclusion.
 */

import { useState } from 'react'

export type ReviewLocale = 'uk' | 'ru' | 'en' | 'es'

export interface TranslationReviewGateProps {
  /** Translation HTML to display in the preview iframe/div */
  translationHtml: string
  /** Certification HTML to display below translation */
  certificationHtml: string
  /** Document label shown in the header */
  documentLabel?: string
  /** Locale for UI strings */
  locale?: ReviewLocale
  /** Called when the user confirms — parent should set reviewConfirmed: true */
  onConfirm: () => void
  /** Called when the user goes back to edit */
  onBack: () => void
}

const STRINGS: Record<ReviewLocale, {
  heading: string
  subheading: string
  translationLabel: string
  certificationLabel: string
  certWarning: string
  checkboxLabel: string
  confirmButton: string
  backButton: string
  notConfirmed: string
}> = {
  en: {
    heading: 'Review Your Translation',
    subheading: 'Read the translation below carefully before certifying.',
    translationLabel: 'Translation Draft',
    certificationLabel: 'Certification Block',
    certWarning: 'By clicking "Confirm & Certify", you certify under 8 CFR §103.2(b)(3) that you are competent to translate from Ukrainian to English, and that this translation is complete and accurate to the best of your knowledge.',
    checkboxLabel: 'I have read this translation and I certify it is complete and accurate.',
    confirmButton: 'Confirm & Certify Translation',
    backButton: 'Back to Edit',
    notConfirmed: 'You must check the box above before confirming.',
  },
  ru: {
    heading: 'Проверьте перевод',
    subheading: 'Внимательно прочитайте перевод перед подписанием.',
    translationLabel: 'Черновик перевода',
    certificationLabel: 'Блок сертификации',
    certWarning: 'Нажимая «Подтвердить и заверить», вы подтверждаете по 8 CFR §103.2(b)(3), что компетентны переводить с украинского на английский, и что этот перевод полный и точный.',
    checkboxLabel: 'Я прочитал(а) этот перевод и подтверждаю, что он полный и точный.',
    confirmButton: 'Подтвердить и заверить перевод',
    backButton: 'Назад к редактированию',
    notConfirmed: 'Вы должны отметить чекбокс выше перед подтверждением.',
  },
  uk: {
    heading: 'Перевірте переклад',
    subheading: 'Уважно прочитайте переклад перед підписанням.',
    translationLabel: 'Чернетка перекладу',
    certificationLabel: 'Блок сертифікації',
    certWarning: 'Натискаючи «Підтвердити та засвідчити», ви підтверджуєте відповідно до 8 CFR §103.2(b)(3), що компетентні перекладати з української на англійську, і що цей переклад повний та точний.',
    checkboxLabel: 'Я прочитав(ла) цей переклад і підтверджую, що він повний та точний.',
    confirmButton: 'Підтвердити та засвідчити переклад',
    backButton: 'Назад до редагування',
    notConfirmed: 'Ви повинні відмітити прапорець вище перед підтвердженням.',
  },
  es: {
    heading: 'Revise su traducción',
    subheading: 'Lea la traducción cuidadosamente antes de certificar.',
    translationLabel: 'Borrador de traducción',
    certificationLabel: 'Bloque de certificación',
    certWarning: 'Al hacer clic en «Confirmar y certificar», certifica conforme al 8 CFR §103.2(b)(3) que es competente para traducir del ucraniano al inglés y que esta traducción es completa y precisa.',
    checkboxLabel: 'He leído esta traducción y certifico que es completa y precisa.',
    confirmButton: 'Confirmar y certificar traducción',
    backButton: 'Volver a editar',
    notConfirmed: 'Debe marcar la casilla anterior antes de confirmar.',
  },
}

export function TranslationReviewGate({
  translationHtml,
  certificationHtml,
  documentLabel = 'Ukrainian Internal Passport',
  locale = 'en',
  onConfirm,
  onBack,
}: TranslationReviewGateProps) {
  const [checked, setChecked] = useState(false)
  const [attemptedWithoutCheck, setAttemptedWithoutCheck] = useState(false)
  const s = STRINGS[locale] ?? STRINGS.en

  function handleConfirm() {
    if (!checked) {
      setAttemptedWithoutCheck(true)
      return
    }
    onConfirm()
  }

  return (
    <div data-testid="translation-review-gate" style={{ maxWidth: 740, margin: '0 auto', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontSize: 22, fontWeight: 700, margin: '0 0 6px',
          color: 'var(--text-1)',
        }}>
          {s.heading}
        </h2>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>
          {s.subheading}
        </p>
        <div style={{
          display: 'inline-block', marginTop: 8,
          padding: '2px 10px', borderRadius: 4,
          background: 'var(--surface-2)', color: 'var(--text-2)',
          fontSize: 12, border: '1px solid var(--border)',
        }}>
          {documentLabel}
        </div>
      </div>

      {/* Translation preview */}
      <section style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
          color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 8,
        }}>
          {s.translationLabel}
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: '#fff',
            maxHeight: 420,
            overflowY: 'auto',
            padding: 0,
          }}
          dangerouslySetInnerHTML={{ __html: translationHtml }}
        />
      </section>

      {/* Certification preview */}
      <section style={{ marginBottom: 28 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
          color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 8,
        }}>
          {s.certificationLabel}
        </div>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: '#fff',
            maxHeight: 280,
            overflowY: 'auto',
            padding: 0,
          }}
          dangerouslySetInnerHTML={{ __html: certificationHtml }}
        />
      </section>

      {/* Legal warning box */}
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderLeft: '4px solid var(--warning, #f59e0b)',
        borderRadius: 6,
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13,
        color: 'var(--text-1)',
        lineHeight: 1.6,
      }}>
        {s.certWarning}
      </div>

      {/* Checkbox */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        cursor: 'pointer', marginBottom: 8,
        padding: '10px 14px',
        border: attemptedWithoutCheck && !checked
          ? '1px solid var(--danger, #f87171)'
          : '1px solid var(--border)',
        borderRadius: 6,
        background: checked ? 'var(--surface-2)' : 'transparent',
      }}>
        <input
          type="checkbox"
          data-testid="translation-review-checkbox"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked)
            if (e.target.checked) setAttemptedWithoutCheck(false)
          }}
          style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.5 }}>
          {s.checkboxLabel}
        </span>
      </label>

      {/* Validation error */}
      {attemptedWithoutCheck && !checked && (
        <p style={{
          margin: '4px 0 12px', fontSize: 13,
          color: 'var(--danger-text, #dc2626)',
        }}>
          {s.notConfirmed}
        </p>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, paddingBottom: 32 }}>
        <button
          type="button"
          data-testid="translation-review-back-btn"
          onClick={onBack}
          style={{
            padding: '10px 20px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--surface-2)',
            color: 'var(--text-1)',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {s.backButton}
        </button>
        <button
          type="button"
          data-testid="translation-review-confirm-btn"
          onClick={handleConfirm}
          style={{
            padding: '10px 24px',
            border: 'none',
            borderRadius: 6,
            background: checked ? 'var(--success, #16a34a)' : 'var(--surface-3, #d1d5db)',
            color: checked ? '#fff' : 'var(--text-3, #9ca3af)',
            fontSize: 14,
            fontWeight: 600,
            cursor: checked ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
          }}
        >
          {s.confirmButton}
        </button>
      </div>
    </div>
  )
}
