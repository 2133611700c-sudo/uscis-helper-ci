'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { SupportBlock } from '@/components/wizard/SupportBlock'

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const T = {
  uk: {
    title: 'Перегляд та підтвердження',
    subtitle: 'Перевірте зведення вашого пакету, потім підтвердьте та перейдіть до завантаження.',
    summaryTitle: '📋 Зведення пакету',
    applicants: (n: number) => `${n} ${n === 1 ? 'заявник' : n < 5 ? 'заявники' : 'заявників'}`,
    filingLabel: 'Спосіб подачі:',
    filingMail: '✉️ Поштою',
    filingOnline: '🌐 Онлайн (my.uscis.gov)',
    filingUnsure: '❓ Ще не визначено',
    filingNone: '— не обрано',
    docsReady: (n: number, total: number) => `${n}/${total} документів завантажено`,
    infoReady: (n: number, total: number) => `${n}/${total} пунктів інформації готові`,
    editBtn: '← Змінити',
    packetTitle: 'Чернетка пакету документів',
    packetSubtitle: 'Чернетка документів — перевірте перед подачею',
    packetFor: (size: number) => `для ${size} ${size === 1 ? 'заявника' : 'заявників'}`,
    paymentNote: 'Оплата ще не активована — безкоштовно в прототипі',
    features: [
      'Чернетка форми I-131 (редагований DOCX)',
      'Переклади документів на англійську',
      'Покрокова інструкція передачі даних до USCIS',
      'Контрольний список документів',
      'Посилання для завантаження дійсне 7 днів',
    ],
    ackTitle: "Обов'язкові підтвердження",
    checkboxes: [
      "Я перевірив(ла) всі дані вище — вони вірні.",
      "Я розумію, що несу відповідальність за точність даних у формі.",
      "Я розумію, що Messenginfo не подає документи від мого імені — я подаю самостійно на my.uscis.gov або поштою.",
    ],
    privacyNote: 'Ми не зберігаємо ваші документи та особисті дані після формування пакету. Вся інформація видаляється автоматично.',
    payBtn: (price: number, allChecked: boolean) =>
      allChecked ? `Сформувати пакет — $${price} →` : 'Підтвердьте всі пункти вище, щоб продовжити',
    generatingBtn: 'Формуємо пакет…',
    feeNote: 'Внески USCIS сплачуються окремо та безпосередньо до USCIS — перевіряйте поточні суми на',
    feeLink: 'Перевірити внески ↗',
    feeCardTitle: '⚠️ Держмито USCIS — окремо від $',
    feeCardText: 'Більшість учасників U4U не платять держмито ($0*). Перевірте точну суму перед подачею:',
    feeCardLink: 'uscis.gov/feecalculator ↗',
    memberLabel: 'Особа',
  },
  ru: {
    title: 'Просмотр и подтверждение',
    subtitle: 'Проверьте сводку вашего пакета, затем подтвердите и перейдите к скачиванию.',
    summaryTitle: '📋 Сводка пакета',
    applicants: (n: number) => `${n} заявитель${n === 1 ? '' : n < 5 ? 'я' : 'ей'}`,
    filingLabel: 'Способ подачи:',
    filingMail: '✉️ По почте',
    filingOnline: '🌐 Онлайн (my.uscis.gov)',
    filingUnsure: '❓ Ещё не определено',
    filingNone: '— не выбрано',
    docsReady: (n: number, total: number) => `${n}/${total} документов загружено`,
    infoReady: (n: number, total: number) => `${n}/${total} пунктов информации готовы`,
    editBtn: '← Изменить',
    packetTitle: 'Черновик пакета документов',
    packetSubtitle: 'Черновик документов — проверьте перед подачей',
    packetFor: (size: number) => `для ${size} заявитель${size === 1 ? 'я' : 'ей'}`,
    paymentNote: 'Оплата ещё не активирована — бесплатно в прототипе',
    features: [
      'Черновик формы I-131 (редактируемый DOCX)',
      'Переводы документов на английский язык',
      'Пошаговая инструкция передачи данных в USCIS',
      'Контрольный список документов',
      'Ссылка для скачивания действительна 7 дней',
    ],
    ackTitle: 'Обязательные подтверждения',
    checkboxes: [
      'Я проверил(а) все данные выше — они корректны.',
      'Я понимаю, что несу ответственность за точность данных в форме.',
      'Я понимаю, что Messenginfo не подаёт документы за меня — я подаю самостоятельно на my.uscis.gov или по почте.',
    ],
    privacyNote: 'Мы не храним ваши документы и личные данные после формирования пакета. Вся информация удаляется автоматически.',
    payBtn: (price: number, allChecked: boolean) =>
      allChecked ? `Сформировать пакет — $${price} →` : 'Подтвердите все пункты выше, чтобы продолжить',
    generatingBtn: 'Формируем пакет…',
    feeNote: 'Взносы USCIS оплачиваются отдельно и непосредственно в USCIS — проверяйте текущие суммы на',
    feeLink: 'Проверить взносы ↗',
    feeCardTitle: '⚠️ Госпошлина USCIS — отдельно от $',
    feeCardText: 'Большинство участников U4U не платят госпошлину ($0*). Проверьте точную сумму перед подачей:',
    feeCardLink: 'uscis.gov/feecalculator ↗',
    memberLabel: 'Человек',
  },
  en: {
    title: 'Review & Confirm',
    subtitle: 'Review your packet summary below, then acknowledge and proceed to download.',
    summaryTitle: '📋 Packet Summary',
    applicants: (n: number) => `${n} applicant${n !== 1 ? 's' : ''}`,
    filingLabel: 'Filing method:',
    filingMail: '✉️ By mail',
    filingOnline: '🌐 Online (my.uscis.gov)',
    filingUnsure: '❓ Not decided yet',
    filingNone: '— not selected',
    docsReady: (n: number, total: number) => `${n}/${total} documents uploaded`,
    infoReady: (n: number, total: number) => `${n}/${total} info items confirmed`,
    editBtn: '← Edit',
    packetTitle: 'I-131 Draft Packet',
    packetSubtitle: 'Draft documents to review before filing',
    packetFor: (size: number) => `for ${size} packet${size !== 1 ? 's' : ''}`,
    paymentNote: 'Payment not yet enabled — free in prototype',
    features: [
      'I-131 Draft (editable DOCX)',
      'Document translations to English',
      'Step-by-step USCIS data transfer guide',
      'Document checklist',
      'Download link valid 7 days',
    ],
    ackTitle: 'Mandatory acknowledgments',
    checkboxes: [
      'I have reviewed all data above — it is correct.',
      'I understand that I am responsible for the accuracy of the data in the form.',
      'I understand that Messenginfo does not file on my behalf — I file myself at my.uscis.gov or by mail.',
    ],
    privacyNote: 'We do not store your documents and personal data after generating the packet. All information is deleted automatically.',
    payBtn: (price: number, allChecked: boolean) =>
      allChecked ? `Generate packet — $${price} →` : 'Acknowledge all items above to continue',
    generatingBtn: 'Generating packet…',
    feeNote: 'USCIS filing fees are paid separately and directly to USCIS — verify current amounts at',
    feeLink: 'Check current fees ↗',
    feeCardTitle: '⚠️ USCIS govt fee — separate from $',
    feeCardText: 'Most U4U participants pay $0* in USCIS fees. Verify the exact amount before filing:',
    feeCardLink: 'uscis.gov/feecalculator ↗',
    memberLabel: 'Person',
  },
  es: {
    title: 'Revisar y confirmar',
    subtitle: 'Revise el resumen de su paquete, luego confirme y proceda a la descarga.',
    summaryTitle: '📋 Resumen del paquete',
    applicants: (n: number) => `${n} solicitante${n !== 1 ? 's' : ''}`,
    filingLabel: 'Método de presentación:',
    filingMail: '✉️ Por correo',
    filingOnline: '🌐 En línea (my.uscis.gov)',
    filingUnsure: '❓ Aún no decidido',
    filingNone: '— no seleccionado',
    docsReady: (n: number, total: number) => `${n}/${total} documentos cargados`,
    infoReady: (n: number, total: number) => `${n}/${total} elementos de info confirmados`,
    editBtn: '← Editar',
    packetTitle: 'Borrador del paquete I-131',
    packetSubtitle: 'Borrador de documentos — revise antes de presentar',
    packetFor: (size: number) => `para ${size} paquete${size !== 1 ? 's' : ''}`,
    paymentNote: 'Pago aún no habilitado — gratuito en prototipo',
    features: [
      'Borrador del I-131 (DOCX editable)',
      'Traducciones de documentos al inglés',
      'Guía paso a paso de transferencia de datos a USCIS',
      'Lista de verificación de documentos',
      'Enlace de descarga válido 7 días',
    ],
    ackTitle: 'Reconocimientos obligatorios',
    checkboxes: [
      'He revisado todos los datos anteriores — son correctos.',
      'Entiendo que soy responsable de la exactitud de los datos en el formulario.',
      'Entiendo que Messenginfo no presenta solicitudes en mi nombre — yo mismo/a presento en my.uscis.gov o por correo.',
    ],
    privacyNote: 'No almacenamos sus documentos ni datos personales después de generar el paquete. Toda la información se elimina automáticamente.',
    payBtn: (price: number, allChecked: boolean) =>
      allChecked ? `Generar paquete — $${price} →` : 'Confirme todos los elementos anteriores para continuar',
    generatingBtn: 'Generando paquete…',
    feeNote: 'Las tarifas de USCIS se pagan por separado y directamente a USCIS — verifique los montos actuales en',
    feeLink: 'Verificar tarifas ↗',
    feeCardTitle: '⚠️ Tarifa USCIS — separada de $',
    feeCardText: 'La mayoría de participantes U4U pagan $0* en tarifas USCIS. Verifique el monto exacto antes de presentar:',
    feeCardLink: 'uscis.gov/feecalculator ↗',
    memberLabel: 'Persona',
  },
} as const

// ---------------------------------------------------------------------------
// Doc keys that Screen04/05 upload
// ---------------------------------------------------------------------------
const DOC_KEYS = ['passport', 'i94', 'parole_notice', 'photo'] as const

// Info keys that Screen06 confirms
const INFO_KEYS = ['hasName', 'hasDob', 'hasI94', 'hasCountry', 'hasPassport', 'hasAddress', 'hasParoleDate'] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Screen10() {
  const { state, setPaymentStatus, setStep } = useWizard()
  const { packageSize, packagePrice, members, filingMethod } = state
  const t = T[state.locale] ?? T.en

  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  const allChecked = t.checkboxes.every((_, i) => checked[i])

  function toggleCheck(i: number) {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }))
  }

  function handlePay() {
    if (!allChecked) return
    setLoading(true)
    setTimeout(() => {
      setPaymentStatus('mock_paid')
      setStep(11)
    }, 1500)
  }

  // Filing method display
  const filingDisplay =
    filingMethod === 'mail'
      ? t.filingMail
      : filingMethod === 'online'
        ? t.filingOnline
        : filingMethod === 'unsure'
          ? t.filingUnsure
          : t.filingNone

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold leading-tight mb-2" style={{ color: 'var(--text-1)' }}>
          {t.title}
        </h1>
        <p className="text-[15px]" style={{ color: 'var(--text-2)' }}>
          {t.subtitle}
        </p>
      </div>

      {/* ── PACKET SUMMARY ────────────────────────────────────────────────── */}
      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Summary header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t.summaryTitle}
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
            {t.applicants(packageSize)} · ${packagePrice}
          </span>
        </div>

        {/* Filing method row */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-2)' }}>
            {t.filingLabel}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              {filingDisplay}
            </span>
            <button
              type="button"
              onClick={() => setStep(5)}
              className="text-sm font-semibold rounded-[6px] px-2 py-0.5 transition-all"
              style={{ background: 'var(--surface-2)', color: 'var(--primary)', border: '1px solid var(--border)' }}
            >
              {t.editBtn}
            </button>
          </div>
        </div>

        {/* Per-member rows */}
        {members.map((member, idx) => {
          const uploadedDocs = DOC_KEYS.filter(
            (k) => member.docs[k]?.status === 'done',
          ).length
          const confirmedInfo = INFO_KEYS.filter(
            (k) => member.fields[k] === 'yes',
          ).length

          const docsOk = uploadedDocs === DOC_KEYS.length
          const infoOk = confirmedInfo === INFO_KEYS.length

          return (
            <div
              key={member.id}
              className="flex items-start gap-3 px-4 py-3"
              style={{
                borderBottom: idx < members.length - 1 ? '1px solid var(--border)' : undefined,
                background: 'var(--surface)',
              }}
            >
              {/* Avatar */}
              <div
                className="flex-shrink-0 w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-bold mt-0.5"
                style={{ background: 'var(--accent)', color: 'var(--primary)' }}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>
                  {member.alias}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span
                    className="text-sm"
                    style={{ color: docsOk ? 'var(--success-text)' : 'var(--warning-text)' }}
                  >
                    {docsOk ? '✓' : '○'} {t.docsReady(uploadedDocs, DOC_KEYS.length)}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: infoOk ? 'var(--success-text)' : 'var(--text-3)' }}
                  >
                    {infoOk ? '✓' : '○'} {t.infoReady(confirmedInfo, INFO_KEYS.length)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex-shrink-0 text-sm font-semibold rounded-[6px] px-2 py-0.5 transition-all self-start mt-0.5"
                style={{ background: 'var(--surface-2)', color: 'var(--primary)', border: '1px solid var(--border)' }}
              >
                {t.editBtn}
              </button>
            </div>
          )
        })}
      </div>

      {/* ── PAYWALL CARD ──────────────────────────────────────────────────── */}
      <div
        className="rounded-[16px] p-5 text-center"
        style={{ border: '2px solid var(--primary)', background: 'var(--surface)' }}
      >
        <p className="text-[40px] mb-2">📄</p>
        <h2 className="text-[18px] font-bold mb-1.5" style={{ color: 'var(--text-1)' }}>
          {t.packetTitle}
        </h2>
        <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {t.packetSubtitle}
        </p>

        {/* Price */}
        <div className="mb-3">
          <span
            className="text-[42px] font-extrabold"
            style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}
          >
            <span className="text-[24px] align-top">$</span>{packagePrice}
          </span>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            {t.packetFor(packageSize)}
          </p>
        </div>

        {/* Feature list */}
        <div className="rounded-[10px] p-3 text-left mb-4" style={{ background: 'var(--surface-2)' }}>
          {t.features.map((f) => (
            <div key={f} className="flex items-start gap-2 py-1">
              <span className="font-bold flex-shrink-0" style={{ color: 'var(--success)' }}>✓</span>
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Payment note badge */}
        <span
          className="inline-block text-sm font-semibold px-3 py-1 rounded-full mb-3"
          style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)' }}
        >
          {t.paymentNote}
        </span>
      </div>

      {/* ── LEGAL ACKNOWLEDGMENTS ─────────────────────────────────────────── */}
      <div
        className="rounded-[12px] p-3.5 space-y-0"
        style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}
      >
        <p
          className="text-sm font-semibold uppercase tracking-wide mb-3"
          style={{ color: 'var(--warning-text)', letterSpacing: '0.6px' }}
        >
          {t.ackTitle}
        </p>
        {t.checkboxes.map((text, i) => (
          <label
            key={i}
            className="flex items-start gap-2.5 py-2.5 cursor-pointer"
            onClick={() => toggleCheck(i)}
          >
            <div
              className="w-[26px] h-[26px] rounded-[6px] flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{
                border: `2px solid ${checked[i] ? 'var(--success)' : 'var(--warning-text)'}`,
                background: checked[i] ? 'var(--success)' : 'var(--surface)',
              }}
            >
              {checked[i] && <span className="text-white font-bold text-[15px]">✓</span>}
            </div>
            <input
              type="checkbox"
              checked={!!checked[i]}
              onChange={() => toggleCheck(i)}
              className="sr-only"
            />
            <span className="text-[14px] leading-relaxed" style={{ color: 'var(--text-1)' }}>
              {text}
            </span>
          </label>
        ))}
      </div>

      {/* Privacy note */}
      <div
        className="rounded-[12px] p-3.5 flex items-start gap-2.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <span className="flex-shrink-0">🔒</span>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
          {t.privacyNote}
        </p>
      </div>

      {/* ⚠️ USCIS fee card */}
      <div
        className="rounded-[12px] p-3.5"
        style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)' }}
      >
        <p className="text-sm font-bold mb-1" style={{ color: 'var(--warning-text)' }}>
          {t.feeCardTitle}{packagePrice}
        </p>
        <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--warning-text)' }}>
          {t.feeCardText}
        </p>
        <a
          href="https://www.uscis.gov/feecalculator"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          {t.feeCardLink}
        </a>
      </div>

      {/* Generate / pay button */}
      <button
        type="button"
        onClick={handlePay}
        disabled={loading || !allChecked}
        className="w-full rounded-[10px] text-[15px] font-bold transition-all active:scale-[0.98]"
        style={{
          background: allChecked && !loading ? 'var(--success)' : 'var(--border-strong)',
          color: allChecked && !loading ? '#fff' : 'var(--text-3)',
          border: 'none',
          padding: '14px',
          minHeight: '52px',
          cursor: allChecked && !loading ? 'pointer' : 'not-allowed',
          opacity: allChecked && !loading ? 1 : 0.6,
        }}
      >
        {loading ? t.generatingBtn : t.payBtn(packagePrice, allChecked)}
      </button>

      <SupportBlock locale={state.locale} />
    </div>
  )
}
