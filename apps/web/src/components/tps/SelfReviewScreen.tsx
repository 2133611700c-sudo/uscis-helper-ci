'use client'

/**
 * SelfReviewScreen — locked UX pattern from docs/ux/SELF_REVIEW_PATTERN.md.
 *
 * Each field is shown as a single row with ONE action button:
 *    «Изменить» when there is a value
 *    «Ввести»   when the value is missing or empty
 *
 * Bottom bar: «Назад» + «Дальше». Pressing «Дальше» means the user
 * accepts every value shown right now. There is no per-field confirm.
 *
 * Critical missing fields block «Дальше». The component computes
 * nextDisabledReason on its own based on `rows[i].critical && !value`.
 *
 * No "Верно / Неверно". No checklist. No exam vibe.
 */

import { useState } from 'react'
import { ManualHelpModal } from '@/components/tps/ManualHelpModal'
import { TPS_A11Y } from '@/lib/tps/a11y'

export type Locale = 'uk' | 'ru' | 'en' | 'es'

export interface ReviewRow {
  /** Internal key, e.g. 'family_name'. Used by onEdit callbacks. */
  key: string

  /** Plain-language label, e.g. "Фамилия". */
  label: string

  /** Current value. Empty string or null/undefined → render «Ввести». */
  value: string | null | undefined

  /** Mark this row as critical — if value is empty/null, «Дальше» is
   *  disabled with an explanation. */
  critical?: boolean

  /** Set when OCR confidence was low. Shows a subtle hint but does NOT
   *  block forward navigation on its own. */
  confidenceLow?: boolean

  /** Optional plain-text reason for the low-confidence hint, e.g.
   *  "плохо видно". Shown next to the value. */
  confidenceHint?: string

  /** Optional source document tag, e.g. "из паспорта". Shown small. */
  source?: string

  /** Optional Latin-transliterated preview of the value, shown when the
   *  value is in Cyrillic and will be written into a USCIS form as
   *  Latin. Pattern: "Шевченко → Shevchenko". When undefined or equal to
   *  the value, no preview chip is rendered (Latin source). Helps the
   *  60+ Ukrainian user trust that we did the right transliteration
   *  before they accept the row. */
  latinPreview?: string
}

export interface SelfReviewProps {
  locale: Locale

  /** Section title above the row list, e.g.
   *  "Важные данные для формы". */
  groupTitle?: string

  /** Rows to display. Order matters — critical fields first. */
  rows: ReviewRow[]

  /** Called when user taps the per-row edit button. */
  onEdit: (rowKey: string) => void

  /** Bottom-bar handlers. */
  onBack?: () => void
  onNext: () => void

  /** Optional secondary content rendered below the rows but above the
   *  bottom bar (e.g. "Дополнительные данные" toggle). */
  children?: React.ReactNode
}

const COPY = {
  uk: {
    pageTitle: 'Перевірте дані',
    helpText: 'Якщо все правильно — натисніть «Далі». Якщо потрібно щось поправити — натисніть «Змінити» поруч із потрібним рядком.',
    actionEdit: 'Змінити',
    actionEnter: 'Ввести',
    valueMissing: 'не знайдено',
    back: '← Назад',
    next: 'Далі →',
    blockedMissing: (n: number) => `Заповніть обов’язкові поля: ${n}`,
    latinFormLabel: 'так буде записано у формі USCIS',
    needHelp: 'Я не впевнений — потрібна допомога',
  },
  ru: {
    pageTitle: 'Проверьте данные',
    helpText: 'Если всё правильно — нажмите «Дальше». Если нужно что-то поправить — нажмите «Изменить» рядом с нужной строкой.',
    actionEdit: 'Изменить',
    actionEnter: 'Ввести',
    valueMissing: 'не найдено',
    back: '← Назад',
    next: 'Дальше →',
    blockedMissing: (n: number) => `Заполните обязательные поля: ${n}`,
    latinFormLabel: 'так будет записано в форме USCIS',
    needHelp: 'Я не уверен — нужна помощь',
  },
  en: {
    pageTitle: 'Check the details',
    helpText: 'If everything looks right, press «Next». If anything needs fixing, press «Edit» next to that row.',
    actionEdit: 'Edit',
    actionEnter: 'Enter',
    valueMissing: 'not found',
    back: '← Back',
    next: 'Next →',
    blockedMissing: (n: number) => `Fill ${n} required field${n === 1 ? '' : 's'}`,
    latinFormLabel: 'this is how it will appear on the USCIS form',
    needHelp: "I'm not sure — I need help",
  },
  es: {
    pageTitle: 'Revise los datos',
    helpText: 'Si todo está correcto, presione «Siguiente». Si necesita corregir algo, presione «Cambiar» junto a la fila.',
    actionEdit: 'Cambiar',
    actionEnter: 'Ingresar',
    valueMissing: 'no encontrado',
    back: '← Atrás',
    next: 'Siguiente →',
    blockedMissing: (n: number) => `Complete ${n} campo${n === 1 ? '' : 's'} obligatorio${n === 1 ? '' : 's'}`,
    latinFormLabel: 'así aparecerá en el formulario USCIS',
    needHelp: 'No estoy seguro — necesito ayuda',
  },
} as const

export function SelfReviewScreen(props: SelfReviewProps) {
  const c = COPY[props.locale]
  const [pressed, setPressed] = useState<string | null>(null)
  // CB.3 — Manual fallback. Surfaces ManualHelpModal which POSTs to
  // /api/tps/manual-review. Reason = user_requested_human_help.
  const [helpOpen, setHelpOpen] = useState(false)

  const missingCritical = props.rows.filter(
    (r) => r.critical && (!r.value || r.value.toString().trim() === ''),
  )
  const canProceed = missingCritical.length === 0

  return (
    <section
      data-testid="tps-self-review"
      style={{
        padding: '18px 20px 24px',
        maxWidth: 640,
        margin: '0 auto',
      }}
    >
      <h2
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--text-1)',
          marginBottom: 8,
        }}
      >
        {c.pageTitle}
      </h2>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: 'var(--text-2)',
          marginBottom: 18,
        }}
      >
        {c.helpText}
      </p>

      {props.groupTitle && (
        <p
          style={{
            // A11Y: section header — bumped from 12 to TEXT_LABEL (14) so
            // older users can scan section boundaries without zooming.
            fontSize: TPS_A11Y.TEXT_LABEL,
            fontWeight: TPS_A11Y.WEIGHT_BOLD,
            color: 'var(--text-2)', // text-3 fails AA at 14px — use text-2
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 8,
          }}
        >
          {props.groupTitle}
        </p>
      )}

      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {props.rows.map((row) => {
          const isEmpty = !row.value || row.value.toString().trim() === ''
          const buttonLabel = isEmpty ? c.actionEnter : c.actionEdit
          const isHotPress = pressed === row.key
          return (
            <div
              key={row.key}
              role="listitem"
              data-testid={`review-row-${row.key}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                background: 'var(--surface)',
                border:
                  isEmpty && row.critical
                    ? '1px solid var(--danger, #fca5a5)'
                    : row.confidenceLow
                    ? '1px solid var(--warning, #fcd34d)'
                    : '1px solid var(--border)',
                borderRadius: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    // A11Y: row label bumped 12→14, color text-3→text-2
                    fontSize: TPS_A11Y.TEXT_LABEL,
                    fontWeight: TPS_A11Y.WEIGHT_BOLD,
                    color: 'var(--text-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    marginBottom: 4,
                  }}
                >
                  {row.label}
                </p>
                <p
                  style={{
                    // A11Y: primary value bumped 16→18 for older readers
                    fontSize: TPS_A11Y.TEXT_PRIMARY_VALUE,
                    fontWeight: TPS_A11Y.WEIGHT_SEMIBOLD,
                    color: isEmpty ? 'var(--text-2)' : 'var(--text-1)',
                    fontStyle: isEmpty ? 'italic' : 'normal',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isEmpty ? c.valueMissing : row.value}
                </p>
                {!isEmpty && row.latinPreview && row.latinPreview !== row.value && (
                  <p
                    data-testid={`review-latin-${row.key}`}
                    style={{
                      // A11Y: Latin preview is core trust signal —
                      // bumped 13→15, label inside bumped 11→13 + medium weight
                      fontSize: 15,
                      fontWeight: TPS_A11Y.WEIGHT_BOLD,
                      color: 'var(--success, #16a34a)',
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    → {row.latinPreview}{' '}
                    <span
                      style={{
                        fontSize: TPS_A11Y.TEXT_TINY_FLOOR,
                        fontWeight: TPS_A11Y.WEIGHT_MEDIUM,
                        color: 'var(--text-2)',
                      }}
                    >
                      · {c.latinFormLabel}
                    </span>
                  </p>
                )}
                {(row.confidenceHint || row.source) && (
                  <p
                    style={{
                      // A11Y: confidence/source 11→13, color readable on amber
                      fontSize: TPS_A11Y.TEXT_TINY_FLOOR,
                      fontWeight: TPS_A11Y.WEIGHT_MEDIUM,
                      color: row.confidenceLow ? 'var(--warning-text, #92400e)' : 'var(--text-2)',
                      marginTop: 4,
                    }}
                  >
                    {row.confidenceHint && <span>{row.confidenceHint}</span>}
                    {row.confidenceHint && row.source && <span> · </span>}
                    {row.source && <span>{row.source}</span>}
                  </p>
                )}
              </div>
              <button
                type="button"
                data-testid={`review-edit-${row.key}`}
                onMouseDown={() => setPressed(row.key)}
                onMouseUp={() => setPressed(null)}
                onMouseLeave={() => setPressed(null)}
                onClick={() => props.onEdit(row.key)}
                style={{
                  flexShrink: 0,
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: '1px solid var(--border)',
                  background: isHotPress ? 'var(--surface-3)' : 'var(--surface-2)',
                  color: 'var(--text-1)',
                  cursor: 'pointer',
                  transform: isHotPress ? 'scale(0.97)' : 'scale(1)',
                  transition: 'transform 100ms, background 100ms',
                }}
              >
                {buttonLabel}
              </button>
            </div>
          )
        })}
      </div>

      {props.children}

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 18,
        }}
      >
        {props.onBack && (
          <button
            type="button"
            onClick={props.onBack}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: 15,
              fontWeight: 700,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              cursor: 'pointer',
            }}
          >
            {c.back}
          </button>
        )}
        <button
          type="button"
          disabled={!canProceed}
          aria-disabled={!canProceed}
          onClick={canProceed ? props.onNext : undefined}
          data-testid="review-next"
          style={{
            flex: props.onBack ? 2 : 1,
            padding: '14px 18px',
            fontSize: 16,
            fontWeight: 800,
            borderRadius: 12,
            border: 'none',
            background: canProceed ? 'var(--success)' : 'var(--surface-2)',
            color: canProceed ? '#fff' : 'var(--text-3)',
            cursor: canProceed ? 'pointer' : 'not-allowed',
            opacity: canProceed ? 1 : 0.55,
            boxShadow: canProceed ? '0 3px 14px rgba(22,163,74,0.30)' : 'none',
          }}
        >
          {c.next}
        </button>
      </div>

      {!canProceed && (
        <p
          style={{
            // A11Y: missing-fields footer is critical — bumped 12→14
            // and weight 700 so an older user immediately knows what's
            // blocking the Next button.
            fontSize: TPS_A11Y.TEXT_LABEL,
            fontWeight: TPS_A11Y.WEIGHT_BOLD,
            color: 'var(--danger-text, #991b1b)',
            marginTop: 10,
            textAlign: 'center',
          }}
          aria-live="polite"
        >
          {c.blockedMissing(missingCritical.length)}
        </p>
      )}

      {/* CB.3 — Manual fallback. Always available; visible under bottom bar.
          A11Y: text bumped 13→14, color text-3→text-2, touch target 44px. */}
      <button
        type="button"
        data-testid="tps-review-need-help"
        onClick={() => setHelpOpen(true)}
        style={{
          display: 'block',
          margin: '14px auto 0',
          padding: '12px 16px',
          minHeight: TPS_A11Y.TOUCH_MIN,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-2)',
          fontSize: TPS_A11Y.TEXT_LABEL,
          fontWeight: TPS_A11Y.WEIGHT_MEDIUM,
          textDecoration: 'underline',
          cursor: 'pointer',
        }}
      >
        {c.needHelp}
      </button>

      <ManualHelpModal
        open={helpOpen}
        locale={props.locale}
        stage="review"
        reason="user_requested_human_help"
        onClose={() => setHelpOpen(false)}
      />
    </section>
  )
}
