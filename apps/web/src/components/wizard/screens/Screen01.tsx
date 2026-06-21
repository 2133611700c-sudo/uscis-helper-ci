'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { ScreenGlossary } from '@/components/wizard/ScreenGlossary'

// Legal Gate — 2 blocking questions before the wizard begins
// Expired parole or active RFE/NOID = hard block + legal resources redirect

const T = {
  uk: {
    title: 'Перевірка права',
    subtitle: 'Два запитання перед початком. Це займе 30 секунд.',
    q1label: 'Ваш поточний пароль ще активний?',
    q1hint: 'Термін дії на вашому I-94 ще не закінчився.',
    q1yes: '✓ Так, ще активний',
    q1no: '✗ Ні, термін закінчився',
    q2label: 'Чи отримували ви офіційний запит або попередження від USCIS щодо вашого паролю?',
    q2hint: 'Йдеться про запит додаткових доказів (RFE) або попередження про можливу відмову (NOID)',
    q2no: '✓ Ні, не отримував(ла)',
    q2yes: '✗ Так, отримував(ла)',
    continueBtn: 'Продовжити →',
    notAnswered: 'Будь ласка, дайте відповідь на обидва запитання',
    blockedExpiredTitle: 'Потрібна юридична консультація',
    blockedExpiredText:
      'Схоже, що строк вашого паролю минув. Ви все ще можете подати заявку, але ситуація складніша — радимо спочатку проконсультуватись з імміграційним адвокатом.',
    blockedRFETitle: 'Потрібна юридична консультація',
    blockedRFEText:
      'Ви отримали офіційний запит або попередження від USCIS (RFE/NOID). Подача заявки на повторний пароль у такій ситуації вимагає юридичного супроводу.',
    legalBtn: 'Безкоштовні юридичні ресурси →',
    backBtn: '← Змінити відповіді',
    usaImmigrationLegal: 'USA Immigration Legal',
    note: 'Ця служба не надає юридичні поради. Messenginfo допомагає правильно заповнити форму — не замінює адвоката.',
  },
  ru: {
    title: 'Проверка права на подачу',
    subtitle: 'Два вопроса перед началом. Это займёт 30 секунд.',
    q1label: 'Ваш текущий пароль ещё активен?',
    q1hint: 'Срок действия на вашем I-94 ещё не истёк.',
    q1yes: '✓ Да, ещё активен',
    q1no: '✗ Нет, срок истёк',
    q2label: 'Получали ли вы официальный запрос или предупреждение от USCIS по вашему паролю?',
    q2hint: 'Речь идёт о запросе дополнительных доказательств (RFE) или уведомлении о возможном отказе (NOID)',
    q2no: '✓ Нет, не получал(а)',
    q2yes: '✗ Да, получал(а)',
    continueBtn: 'Продолжить →',
    notAnswered: 'Пожалуйста, ответьте на оба вопроса',
    blockedExpiredTitle: 'Требуется юридическая консультация',
    blockedExpiredText:
      'Похоже, срок вашего пароля истёк. Вы всё ещё можете подать заявление, но ситуация сложнее — рекомендуем сначала проконсультироваться с иммиграционным адвокатом.',
    blockedRFETitle: 'Требуется юридическая консультация',
    blockedRFEText:
      'Вы получили официальный запрос или предупреждение от USCIS (RFE/NOID). Подача заявления на повторный пароль в такой ситуации требует юридического сопровождения.',
    legalBtn: 'Бесплатные юридические ресурсы →',
    backBtn: '← Изменить ответы',
    usaImmigrationLegal: 'США — Иммиграционная помощь',
    note: 'Эта служба не предоставляет юридические консультации. Messenginfo помогает заполнить форму — не заменяет адвоката.',
  },
  en: {
    title: 'Eligibility Check',
    subtitle: 'Two questions before you start. Takes 30 seconds.',
    q1label: 'Is your current parole still active?',
    q1hint: 'The expiration date on your I-94 has not passed yet.',
    q1yes: '✓ Yes, still active',
    q1no: '✗ No, it has expired',
    q2label: 'Have you received a formal request or notice from USCIS regarding your parole?',
    q2hint: 'This includes a Request for Evidence (RFE) or Notice of Intent to Deny (NOID)',
    q2no: '✓ No, I have not',
    q2yes: '✗ Yes, I have',
    continueBtn: 'Continue →',
    notAnswered: 'Please answer both questions',
    blockedExpiredTitle: 'Legal Consultation Recommended',
    blockedExpiredText:
      'Your parole appears to have expired. You may still be able to file, but the situation is more complex — we strongly recommend consulting an immigration attorney first.',
    blockedRFETitle: 'Legal Consultation Required',
    blockedRFEText:
      'You have received an RFE or NOID. Filing for re-parole in this situation requires legal guidance.',
    legalBtn: 'Free Legal Resources →',
    backBtn: '← Change answers',
    usaImmigrationLegal: 'Immigration Legal Resources',
    note: 'This service does not provide legal advice. Messenginfo helps you fill out the form — it does not replace an attorney.',
  },
  es: {
    title: 'Verificación de elegibilidad',
    subtitle: 'Dos preguntas antes de comenzar. Toma 30 segundos.',
    q1label: '¿Su parole actual sigue activo?',
    q1hint: 'La fecha de vencimiento en su I-94 no ha pasado todavía.',
    q1yes: '✓ Sí, sigue activo',
    q1no: '✗ No, ya venció',
    q2label: '¿Ha recibido una solicitud formal o aviso oficial de USCIS sobre su parole?',
    q2hint: 'Esto incluye una solicitud de evidencia (RFE) o un aviso de intención de denegar (NOID)',
    q2no: '✓ No, no he recibido',
    q2yes: '✗ Sí, he recibido',
    continueBtn: 'Continuar →',
    notAnswered: 'Por favor responda ambas preguntas',
    blockedExpiredTitle: 'Se recomienda consulta legal',
    blockedExpiredText:
      'Parece que su parole ha vencido. Aún puede presentar la solicitud, pero la situación es más compleja — recomendamos consultar a un abogado de inmigración primero.',
    blockedRFETitle: 'Se requiere consulta legal',
    blockedRFEText:
      'Ha recibido un RFE o NOID. Presentar una solicitud de re-parole en esta situación requiere orientación legal.',
    legalBtn: 'Recursos legales gratuitos →',
    backBtn: '← Cambiar respuestas',
    usaImmigrationLegal: 'Recursos Legales de Inmigración',
    note: 'Este servicio no brinda asesoramiento legal. Messenginfo le ayuda a llenar el formulario — no reemplaza a un abogado.',
  },
} as const

export function Screen01() {
  const { state, setStep } = useWizard()
  const t = T[state.locale] ?? T.en

  const [paroleActive, setParoleActive] = useState<boolean | null>(null)
  const [hasRFE, setHasRFE] = useState<boolean | null>(null)
  const [attempted, setAttempted] = useState(false)

  const isBlocked =
    paroleActive === false || hasRFE === true

  const blockReason =
    paroleActive === false ? 'expired' : hasRFE === true ? 'rfe' : null

  function handleContinue() {
    setAttempted(true)
    if (paroleActive === null || hasRFE === null) return
    if (isBlocked) return
    setStep(2)
  }

  if (isBlocked && blockReason) {
    return (
      <div className="space-y-4">
        {/* Block card */}
        <div
          className="rounded-[16px] p-5 text-center"
          style={{ background: 'var(--warning-bg)', border: '2px solid var(--warning-border)' }}
        >
          <div className="text-[48px] mb-3">⚠️</div>
          <h1 className="text-[20px] font-bold mb-3" style={{ color: 'var(--text-1)' }}>
            {blockReason === 'expired' ? t.blockedExpiredTitle : t.blockedRFETitle}
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {blockReason === 'expired' ? t.blockedExpiredText : t.blockedRFEText}
          </p>
        </div>

        {/* Legal resources */}
        <div
          className="rounded-[12px] p-3.5 space-y-2.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            {t.usaImmigrationLegal}
          </p>
          <a
            href="https://www.immigrationadvocates.org/nonprofit/legaldirectory/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-[10px] p-3 no-underline transition-all active:scale-[0.99]"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            <span className="text-[14px] font-semibold">National Immigration Legal Services Directory</span>
            <span>↗</span>
          </a>
          <a
            href="https://www.uscis.gov/about-us/find-legal-services"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-[10px] p-3 no-underline transition-all active:scale-[0.99]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          >
            <span className="text-[14px] font-semibold">USCIS — Find Legal Services ↗</span>
          </a>
        </div>

        {/* Note */}
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {t.note}
        </p>

        {/* Back button */}
        <button
          type="button"
          onClick={() => {
            setParoleActive(null)
            setHasRFE(null)
            setAttempted(false)
          }}
          className="w-full rounded-[10px] text-[14px] font-medium transition-all"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-2)',
            padding: '12px',
            minHeight: '44px',
          }}
        >
          {t.backBtn}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold leading-tight mb-2" style={{ color: 'var(--text-1)' }}>
          {t.title}
        </h1>
        <p className="text-[15px]" style={{ color: 'var(--text-2)' }}>
          {t.subtitle}
        </p>
      </div>

      {/* Q1 */}
      <div
        className="rounded-[12px] p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
          1. {t.q1label}
        </p>
        <p className="text-sm mb-3" style={{ color: 'var(--text-3)' }}>{t.q1hint}</p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setParoleActive(true)}
            className="flex-1 rounded-[10px] text-[14px] font-semibold transition-all py-3"
            style={{
              background: paroleActive === true ? 'var(--success)' : 'var(--surface-2)',
              color: paroleActive === true ? '#fff' : 'var(--text-1)',
              border: `1.5px solid ${paroleActive === true ? 'var(--success)' : 'var(--border-strong)'}`,
            }}
          >
            {t.q1yes}
          </button>
          <button
            type="button"
            onClick={() => setParoleActive(false)}
            className="flex-1 rounded-[10px] text-[14px] font-semibold transition-all py-3"
            style={{
              background: paroleActive === false ? 'var(--error-bg)' : 'var(--surface-2)',
              color: paroleActive === false ? 'var(--error-text)' : 'var(--text-1)',
              border: `1.5px solid ${paroleActive === false ? 'var(--error-border)' : 'var(--border-strong)'}`,
            }}
          >
            {t.q1no}
          </button>
        </div>
      </div>

      {/* Q2 */}
      <div
        className="rounded-[12px] p-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
          2. {t.q2label}
        </p>
        <p className="text-sm mb-3" style={{ color: 'var(--text-3)' }}>{t.q2hint}</p>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setHasRFE(false)}
            className="flex-1 rounded-[10px] text-[14px] font-semibold transition-all py-3"
            style={{
              background: hasRFE === false ? 'var(--success)' : 'var(--surface-2)',
              color: hasRFE === false ? '#fff' : 'var(--text-1)',
              border: `1.5px solid ${hasRFE === false ? 'var(--success)' : 'var(--border-strong)'}`,
            }}
          >
            {t.q2no}
          </button>
          <button
            type="button"
            onClick={() => setHasRFE(true)}
            className="flex-1 rounded-[10px] text-[14px] font-semibold transition-all py-3"
            style={{
              background: hasRFE === true ? 'var(--error-bg)' : 'var(--surface-2)',
              color: hasRFE === true ? 'var(--error-text)' : 'var(--text-1)',
              border: `1.5px solid ${hasRFE === true ? 'var(--error-border)' : 'var(--border-strong)'}`,
            }}
          >
            {t.q2yes}
          </button>
        </div>
      </div>

      {/* Validation error */}
      {attempted && (paroleActive === null || hasRFE === null) && (
        <p className="text-sm font-medium" style={{ color: 'var(--error-text)' }}>
          {t.notAnswered}
        </p>
      )}

      {/* Disclaimer */}
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
        {t.note}
      </p>

      <button
        type="button"
        onClick={handleContinue}
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

      <ScreenGlossary terms={['Parole', 'Re-Parole', 'I-94']} locale={state.locale} />
    </div>
  )
}
