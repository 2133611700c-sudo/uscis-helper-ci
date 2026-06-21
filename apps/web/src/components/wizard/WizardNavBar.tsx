'use client'

import { useWizard } from '@/contexts/WizardContext'

const TOTAL_STEPS = 12

interface WizardNavBarProps {
  step: number
  onBack: () => void
  onNext: () => void
  onValidate?: () => boolean
  /** When true, the forward button is hidden — used on screens that own their own
   *  navigation (e.g. Screen01 Legal Gate renders its own "Continue" button). */
  hideNext?: boolean
}

const NAV_T = {
  uk: { back: '← Назад', next: 'Далі →', done: 'Готово ✓', step: (s: number, t: number) => `Крок ${s} з ${t}` },
  ru: { back: '← Назад', next: 'Далее →', done: 'Готово ✓', step: (s: number, t: number) => `Шаг ${s} из ${t}` },
  en: { back: '← Back', next: 'Next →', done: 'Done ✓', step: (s: number, t: number) => `Step ${s} of ${t}` },
  es: { back: '← Atrás', next: 'Siguiente →', done: 'Listo ✓', step: (s: number, t: number) => `Paso ${s} de ${t}` },
} as const

/**
 * Bottom navigation bar — matches prototype style:
 *   [← Back] [Step X of 13] [Next →] / [Done]
 * Fixed on mobile, inline on desktop.
 */
export function WizardNavBar({ step, onBack, onNext, onValidate, hideNext }: WizardNavBarProps) {
  const { state } = useWizard()
  const t = NAV_T[state.locale] ?? NAV_T.en
  const isFirst = step === 0
  const isLast = step === TOTAL_STEPS

  function handleNext() {
    if (onValidate && !onValidate()) return
    onNext()
  }

  return (
    <div
      className="flex items-center gap-2 px-4 py-3 fixed bottom-0 left-0 right-0 z-[60] lg:static lg:z-auto lg:mt-6"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* Back */}
      {isFirst ? (
        <div className="w-[56px] flex-shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="flex-shrink-0 rounded-[10px] text-[15px] font-semibold transition-all active:scale-95"
          style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border-strong)',
            color: 'var(--text-1)',
            padding: '14px 18px',
            minHeight: '52px',
          }}
        >
          {t.back}
        </button>
      )}

      {/* Step counter */}
      <span
        className="flex-1 text-center text-[14px] font-medium"
        style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}
      >
        {t.step(step + 1, TOTAL_STEPS + 1)}
      </span>

      {/* Next / Done — hidden on screens that own their own forward navigation */}
      {hideNext ? (
        <div className="flex-1" aria-hidden="true" />
      ) : isLast ? (
        <button
          type="button"
          onClick={onNext}
          className="flex-shrink-0 rounded-[10px] text-[15px] font-bold transition-all active:scale-95"
          style={{
            background: 'var(--success)',
            color: '#fff',
            border: 'none',
            padding: '14px 24px',
            minHeight: '52px',
          }}
        >
          {t.done}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleNext}
          className="flex-1 rounded-[10px] text-[15px] font-bold transition-all active:scale-95"
          style={{
            background: 'var(--success)',
            color: '#fff',
            border: 'none',
            padding: '14px',
            minHeight: '52px',
          }}
        >
          {t.next}
        </button>
      )}
    </div>
  )
}
