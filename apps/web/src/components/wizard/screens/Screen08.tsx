'use client'

import { useWizard } from '@/contexts/WizardContext'
import type { WizardState } from '@/contexts/WizardContext'
import { ScreenGlossary } from '@/components/wizard/ScreenGlossary'
import { SupportBlock } from '@/components/wizard/SupportBlock'

const T = {
  uk: {
    title: 'Як будете подавати?',
    subtitle: 'Виберіть спосіб подачі, який вам підходить.',
    options: [
      {
        value: 'online' as WizardState['filingMethod'],
        title: 'Онлайн через myUSCIS',
        description: 'Подача в електронному вигляді на my.uscis.gov. Потрібен акаунт myUSCIS. Перевірте поточний розмір внеску на uscis.gov/feecalculator.',
        icon: '🌐',
      },
      {
        value: 'mail' as WizardState['filingMethod'],
        title: 'Поштою до USCIS',
        description: 'Надрукуйте та відправте I-131 разом із фотографіями та підтверджуючими документами. Перевірте внесок на uscis.gov/feecalculator. Перевірте адресу на uscis.gov/i-131-addresses.',
        icon: '📬',
      },
      {
        value: 'unsure' as WizardState['filingMethod'],
        title: 'Ще не вирішив(ла)',
        description: 'Ми включимо інструкції для обох способів у ваш пакет. Вирішити можна пізніше.',
        icon: '🤔',
      },
    ],
    calloutTitle: 'Форма I-131 (редакція 01/20/25) — ключові пункти:',
    calloutItems: [
      '· <strong>Частина 2, Item 1.e</strong> — Виберіть «Re-Parole» як підставу для заявки.',
      '· <strong>Поле 10.C</strong> — Вкажіть дату закінчення поточного паролю (з I-94 або повідомлення про схвалення).',
    ],
    mailingWarning: 'Поштові адреси можуть змінюватись. Завжди перевіряйте на',
    mailingLink: 'uscis.gov/i-131-addresses ↗',
    mailingEnd: 'перед відправкою.',
    i912Title: '💡 Немає доходу або низький дохід?',
    i912Text: 'Ви можете запросити звільнення від сплати внеску (fee waiver) через Form I-912. Ми включимо бланк та інструкції у ваш пакет.',
    continueBtn: 'Продовжити →',
    errorMsg: 'Будь ласка, виберіть спосіб подачі.',
  },
  ru: {
    title: 'Как будете подавать?',
    subtitle: 'Выберите способ подачи, который вам подходит.',
    options: [
      {
        value: 'online' as WizardState['filingMethod'],
        title: 'Онлайн через myUSCIS',
        description: 'Подача в электронном виде на my.uscis.gov. Нужен аккаунт myUSCIS. Проверьте текущий размер взноса на uscis.gov/feecalculator.',
        icon: '🌐',
      },
      {
        value: 'mail' as WizardState['filingMethod'],
        title: 'Почтой в USCIS',
        description: 'Распечатайте и отправьте I-131 с фотографиями и подтверждающими документами. Проверьте взнос на uscis.gov/feecalculator. Проверьте адрес на uscis.gov/i-131-addresses.',
        icon: '📬',
      },
      {
        value: 'unsure' as WizardState['filingMethod'],
        title: 'Ещё не решил(а)',
        description: 'Мы включим инструкции для обоих способов в ваш пакет. Решить можно позже.',
        icon: '🤔',
      },
    ],
    calloutTitle: 'Форма I-131 (редакция 01/20/25) — ключевые пункты:',
    calloutItems: [
      '· <strong>Часть 2, Item 1.e</strong> — Выберите «Re-Parole» как основание для заявки.',
      '· <strong>Поле 10.C</strong> — Укажите дату окончания текущего пароля (из I-94 или уведомления об одобрении).',
    ],
    mailingWarning: 'Почтовые адреса могут меняться. Всегда проверяйте на',
    mailingLink: 'uscis.gov/i-131-addresses ↗',
    mailingEnd: 'перед отправкой.',
    i912Title: '💡 Нет дохода или низкий доход?',
    i912Text: 'Вы можете запросить освобождение от уплаты взноса (fee waiver) через Form I-912. Мы включим бланк и инструкции в ваш пакет.',
    continueBtn: 'Продолжить →',
    errorMsg: 'Пожалуйста, выберите способ подачи.',
  },
  en: {
    title: 'How will you file?',
    subtitle: 'Choose the submission method that works best for you.',
    options: [
      {
        value: 'online' as WizardState['filingMethod'],
        title: 'Online via myUSCIS',
        description: 'File electronically at my.uscis.gov. Requires a myUSCIS account. Verify current fee at uscis.gov/feecalculator.',
        icon: '🌐',
      },
      {
        value: 'mail' as WizardState['filingMethod'],
        title: 'Mail to USCIS lockbox',
        description: 'Print and mail I-131 with photos and supporting documents. Verify current fee at uscis.gov/feecalculator. Check uscis.gov/i-131-addresses for current mailing address.',
        icon: '📬',
      },
      {
        value: 'unsure' as WizardState['filingMethod'],
        title: 'I am not sure yet',
        description: 'We will include instructions for both methods in your packet. You can decide later.',
        icon: '🤔',
      },
    ],
    calloutTitle: 'Form I-131 (edition 01/20/25) — key items:',
    calloutItems: [
      '· <strong>Part 2, Item 1.e</strong> — Select "Re-Parole" as the basis for your application.',
      '· <strong>Box 10.C</strong> — Enter your current parole expiration date (from your I-94 or approval notice).',
    ],
    mailingWarning: 'Mailing addresses can change. Always verify at',
    mailingLink: 'uscis.gov/i-131-addresses ↗',
    mailingEnd: 'before sending.',
    i912Title: '💡 Low or no income?',
    i912Text: 'You may qualify for a fee waiver using Form I-912. We will include the form and instructions in your packet.',
    continueBtn: 'Continue →',
    errorMsg: 'Please select a filing method.',
  },
  es: {
    title: '¿Cómo presentará la solicitud?',
    subtitle: 'Elija el método de presentación que mejor le funcione.',
    options: [
      {
        value: 'online' as WizardState['filingMethod'],
        title: 'En línea vía myUSCIS',
        description: 'Presente electrónicamente en my.uscis.gov. Requiere cuenta myUSCIS. Verifique la tarifa actual en uscis.gov/feecalculator.',
        icon: '🌐',
      },
      {
        value: 'mail' as WizardState['filingMethod'],
        title: 'Por correo a USCIS',
        description: 'Imprima y envíe I-131 con fotos y documentos de apoyo. Verifique la tarifa en uscis.gov/feecalculator. Verifique la dirección en uscis.gov/i-131-addresses.',
        icon: '📬',
      },
      {
        value: 'unsure' as WizardState['filingMethod'],
        title: 'Aún no estoy seguro/a',
        description: 'Incluiremos instrucciones para ambos métodos en su paquete. Puede decidir más tarde.',
        icon: '🤔',
      },
    ],
    calloutTitle: 'Formulario I-131 (edición 01/20/25) — puntos clave:',
    calloutItems: [
      '· <strong>Parte 2, Elemento 1.e</strong> — Seleccione "Re-Parole" como base para su solicitud.',
      '· <strong>Casilla 10.C</strong> — Ingrese la fecha de vencimiento actual de su parole (de su I-94 o aviso de aprobación).',
    ],
    mailingWarning: 'Las direcciones postales pueden cambiar. Siempre verifique en',
    mailingLink: 'uscis.gov/i-131-addresses ↗',
    mailingEnd: 'antes de enviar.',
    i912Title: '💡 ¿Ingresos bajos o nulos?',
    i912Text: 'Puede calificar para una exención de tarifa usando el Formulario I-912. Incluiremos el formulario e instrucciones en su paquete.',
    continueBtn: 'Continuar →',
    errorMsg: 'Por favor seleccione un método de presentación.',
  },
} as const

export function Screen08() {
  const { state, setFilingMethod, setStep } = useWizard()
  const { filingMethod } = state
  const t = T[state.locale] ?? T.en

  function handleSelect(value: WizardState['filingMethod']) {
    setFilingMethod(value)
    // No auto-advance — user must read the callout and press Continue
  }

  function handleContinue() {
    if (!filingMethod) return
    setStep(9)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold leading-tight mb-2" style={{ color: 'var(--text-1)' }}>
          {t.title}
        </h1>
        <p className="text-[15px]" style={{ color: 'var(--text-2)' }}>
          {t.subtitle}
        </p>
      </div>

      <div className="space-y-2.5">
        {t.options.map((opt) => {
          const isSelected = filingMethod === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className="w-full text-left rounded-[12px] transition-all active:scale-[0.99]"
              style={{
                background: isSelected ? 'var(--accent)' : 'var(--surface)',
                border: isSelected ? '2px solid var(--primary)' : '1.5px solid var(--border-strong)',
                padding: isSelected ? '13px' : '14px',
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-[20px] flex-shrink-0">{opt.icon}</span>
                <div>
                  <p className="text-[14px] font-semibold mb-1" style={{ color: isSelected ? 'var(--primary)' : 'var(--text-1)' }}>
                    {opt.title}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>{opt.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Regulatory callout */}
      <div
        className="rounded-[12px] p-3.5 space-y-2"
        style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--info-text)' }}>
          {t.calloutTitle}
        </p>
        <div className="text-sm space-y-1" style={{ color: 'var(--info-text)' }}>
          {t.calloutItems.map((item, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </div>
      </div>

      {/* Mailing address warning */}
      <div
        className="rounded-[12px] p-3.5"
        style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--warning-text)' }}>
          {t.mailingWarning}{' '}
          <a
            href="https://www.uscis.gov/i-131-addresses"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--warning-text)', fontWeight: 600 }}
          >
            {t.mailingLink}
          </a>
          {' '}{t.mailingEnd}
        </p>
      </div>

      {/* I-912 fee waiver callout — shown only when mail is selected */}
      {filingMethod === 'mail' && (
        <div
          className="rounded-[12px] p-3.5"
          style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--success-text)' }}>
            {t.i912Title}
          </p>
          <p className="text-sm" style={{ color: 'var(--success-text)' }}>
            {t.i912Text}
          </p>
        </div>
      )}

      {/* Explicit continue button — only active when a choice is made */}
      <button
        type="button"
        onClick={handleContinue}
        disabled={!filingMethod}
        className="w-full rounded-[10px] text-[15px] font-bold transition-all active:scale-[0.98]"
        style={{
          background: filingMethod ? 'var(--success)' : 'var(--surface-2)',
          color: filingMethod ? '#fff' : 'var(--text-3)',
          border: 'none',
          padding: '14px',
          minHeight: '52px',
          cursor: filingMethod ? 'pointer' : 'not-allowed',
        }}
      >
        {t.continueBtn}
      </button>

      <ScreenGlossary terms={['I-131', 'Re-Parole', 'I-912', 'Lockbox']} locale={state.locale} />
      <SupportBlock locale={state.locale} />
    </div>
  )
}
