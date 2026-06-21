'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { MemberTabs } from '@/components/wizard/MemberTabs'
import { ScreenGlossary } from '@/components/wizard/ScreenGlossary'
import { HelpTip } from '@/components/wizard/HelpTip'

// PII POLICY: We do NOT collect or store names, dates of birth, passport numbers,
// I-94 numbers, or other identifying information. Users enter these directly on
// the official USCIS form. This checklist only tracks which items are ready.

const T = {
  uk: {
    title: 'Підготуйте цю інформацію',
    subtitle: 'Позначте кожен пункт ✓, коли він у вас під рукою.',
    privacyNote: 'Ми не зберігаємо ваші особисті дані (ім\'я, дата народження, I-94, номер паспорту). Вводьте їх безпосередньо в офіційну форму.',
    items: [
      'Повне юридичне ім\'я (як у паспорті)',
      'Дата народження',
      'Номер I-94 (знайдіть на i94.cbp.dhs.gov)',
      'Країна народження',
      'Номер паспорту та дата закінчення дії',
      'Поточна поштова адреса в США',
      'Дата закінчення поточного паролю (на I-94)',
    ],
    helpTips: [
      null,
      null,
      'I-94 — це офіційний електронний запис про ваш в\'їзд до США. Знайдіть його безкоштовно на сайті i94.cbp.dhs.gov → "Get Most Recent I-94". Потрібен 11-значний номер у верхньому правому куті.',
      null,
      null,
      null,
      'Знайдіть дату закінчення паролю у вашому I-94 у рядку "Admit Until Date". Зазвичай це дата приблизно через рік після останнього в\'їзду до США.',
    ] as (string | null)[],
    checkedCount: (n: number, total: number) => `✓ ${n} з ${total} пунктів підтверджено`,
    i94Link: 'Перевірте свій запис I-94 на i94.cbp.dhs.gov →',
    continueBtn: 'Продовжити →',
  },
  ru: {
    title: 'Подготовьте эту информацию',
    subtitle: 'Отметьте каждый пункт ✓, когда он у вас под рукой.',
    privacyNote: 'Мы не храним ваши личные данные (имя, дата рождения, I-94, номер паспорта). Вводите их непосредственно в официальную форму.',
    items: [
      'Полное юридическое имя (как в паспорте)',
      'Дата рождения',
      'Номер I-94 (найдите на i94.cbp.dhs.gov)',
      'Страна рождения',
      'Номер паспорта и дата окончания действия',
      'Текущий почтовый адрес в США',
      'Дата окончания текущего пароля (на I-94)',
    ],
    helpTips: [
      null,
      null,
      'I-94 — это официальная электронная запись о вашем въезде в США. Найдите её бесплатно на i94.cbp.dhs.gov → "Get Most Recent I-94". Нужен 11-значный номер в правом верхнем углу.',
      null,
      null,
      null,
      'Дату окончания пароля ищите в вашем I-94 в строке "Admit Until Date". Обычно это дата примерно через год после последнего въезда в США.',
    ] as (string | null)[],
    checkedCount: (n: number, total: number) => `✓ ${n} из ${total} пунктов подтверждено`,
    i94Link: 'Проверьте свою запись I-94 на i94.cbp.dhs.gov →',
    continueBtn: 'Продолжить →',
  },
  en: {
    title: 'Have this information ready',
    subtitle: 'Check off each item ✓ when you have it at hand.',
    privacyNote: 'We do not store your personal identifiers (name, date of birth, I-94, passport number). Enter them directly on the official form.',
    items: [
      'Full legal name (as on passport)',
      'Date of birth',
      'I-94 number (find at i94.cbp.dhs.gov)',
      'Country of birth',
      'Passport number and expiration date',
      'Current U.S. mailing address',
      'Current parole expiration date (on I-94)',
    ],
    helpTips: [
      null,
      null,
      'Your I-94 is the official electronic record of your US entry. Find it free at i94.cbp.dhs.gov → "Get Most Recent I-94". You need the 11-digit number shown in the top-right corner.',
      null,
      null,
      null,
      'Find your parole expiration date in your I-94 under "Admit Until Date". It is typically about one year after your last entry into the US.',
    ] as (string | null)[],
    checkedCount: (n: number, total: number) => `✓ ${n} of ${total} items confirmed`,
    i94Link: 'Look up your I-94 record at i94.cbp.dhs.gov →',
    continueBtn: 'Continue →',
  },
  es: {
    title: 'Tenga lista esta información',
    subtitle: 'Marque cada elemento ✓ cuando lo tenga a mano.',
    privacyNote: 'No almacenamos sus datos personales (nombre, fecha de nacimiento, I-94, número de pasaporte). Ingréselos directamente en el formulario oficial.',
    items: [
      'Nombre legal completo (como en el pasaporte)',
      'Fecha de nacimiento',
      'Número I-94 (búsquelo en i94.cbp.dhs.gov)',
      'País de nacimiento',
      'Número de pasaporte y fecha de vencimiento',
      'Dirección postal actual en EE.UU.',
      'Fecha de vencimiento del parole actual (en I-94)',
    ],
    helpTips: [
      null,
      null,
      'Su I-94 es el registro electrónico oficial de su entrada a EE.UU. Encuéntrelo gratis en i94.cbp.dhs.gov → "Get Most Recent I-94". Necesita el número de 11 dígitos que aparece en la esquina superior derecha.',
      null,
      null,
      null,
      'Busque la fecha de vencimiento del parole en su I-94 en el campo "Admit Until Date". Generalmente es aproximadamente un año después de su última entrada a EE.UU.',
    ] as (string | null)[],
    checkedCount: (n: number, total: number) => `✓ ${n} de ${total} elementos confirmados`,
    i94Link: 'Consulte su registro I-94 en i94.cbp.dhs.gov →',
    continueBtn: 'Continuar →',
  },
} as const

const ITEM_KEYS = [
  'hasName', 'hasDob', 'hasI94', 'hasCountry', 'hasPassport', 'hasAddress', 'hasParoleDate',
] as const

export function Screen06() {
  const { state, setMember, setStep } = useWizard()
  const { members } = state
  const t = T[state.locale] ?? T.en
  const [activeIndex, setActiveIndex] = useState(0)

  const activeMember = members[activeIndex]

  function handleCheck(key: string, checked: boolean) {
    if (!activeMember) return
    setMember(activeMember.id, {
      fields: { ...activeMember.fields, [key]: checked ? 'yes' : '' },
    })
  }

  if (!activeMember) return null

  const checkedCount = ITEM_KEYS.filter(
    (k) => activeMember.fields[k] === 'yes',
  ).length

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

      {/* Privacy notice */}
      <div
        className="rounded-[12px] p-3.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', gap: '10px' }}
      >
        <span className="text-[16px] flex-shrink-0">🔒</span>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {t.privacyNote}
        </p>
      </div>

      <MemberTabs activeIndex={activeIndex} onChange={setActiveIndex} />

      <div
        id={`member-panel-${activeIndex}`}
        role="tabpanel"
        aria-label={`Checklist for ${activeMember.alias}`}
        className="space-y-2"
      >
        {ITEM_KEYS.map((key, idx) => {
          const isChecked = activeMember.fields[key] === 'yes'
          const label = t.items[idx]
          const tip = t.helpTips[idx] ?? null
          return (
            <label
              key={key}
              className="flex items-start gap-3 rounded-[12px] cursor-pointer transition-all"
              style={{
                background: isChecked ? 'var(--success-bg)' : 'var(--surface)',
                border: `1px solid ${isChecked ? 'var(--success-border)' : 'var(--border)'}`,
                padding: '14px',
              }}
            >
              {/* Custom checkbox */}
              <div
                className="w-[24px] h-[24px] rounded-[6px] flex-shrink-0 flex items-center justify-center mt-0.5"
                style={{
                  border: `2px solid ${isChecked ? 'var(--success)' : 'var(--border-strong)'}`,
                  background: isChecked ? 'var(--success)' : 'var(--surface)',
                }}
              >
                {isChecked && (
                  <span className="text-white font-bold text-[15px]">✓</span>
                )}
              </div>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => handleCheck(key, e.target.checked)}
                className="sr-only"
              />
              <span className="text-[14px] flex-1" style={{ color: 'var(--text-1)' }}>
                {label}
                {tip && (
                  <HelpTip
                    id={`tip-${key}`}
                    content={tip}
                  />
                )}
              </span>
            </label>
          )
        })}
      </div>

      {checkedCount > 0 && (
        <p className="text-sm font-medium" style={{ color: 'var(--success-text)' }}>
          {t.checkedCount(checkedCount, ITEM_KEYS.length)}
        </p>
      )}

      <a
        href="https://i94.cbp.dhs.gov/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[14px] font-semibold no-underline transition-all"
        style={{ color: 'var(--primary)' }}
      >
        {t.i94Link}
      </a>

      <button
        type="button"
        onClick={() => setStep(7)}
        className="w-full rounded-[10px] text-[15px] font-bold transition-all active:scale-[0.98]"
        style={{
          background: 'var(--success)',
          color: '#fff',
          border: 'none',
          padding: '14px',
          minHeight: '52px',
        }}
      >
        {t.continueBtn}
      </button>

      <ScreenGlossary terms={['I-94', 'USCIS', 'Parole']} locale={state.locale} />
    </div>
  )
}
