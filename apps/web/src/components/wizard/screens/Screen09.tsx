'use client'

import { useWizard } from '@/contexts/WizardContext'
import { ScreenGlossary } from '@/components/wizard/ScreenGlossary'
import { SupportBlock } from '@/components/wizard/SupportBlock'

const T = {
  uk: {
    title: 'Перегляньте ваш пакет',
    subtitle: 'Безкоштовний перегляд — подивіться, що входить до пакету. Завантаження після оплати.',
    packetBadge: (i: number) => `Пакет ${i + 1} · I-131 Re-Parole U4U`,
    readyBadge: 'Готово',
    previewTitle: '📋 Безкоштовний перегляд — що ви отримаєте',
    costSummary: (size: number, price: number, filing: string) =>
      `${size} заявник${size === 1 ? '' : 'ів'} · $${price} сервісний внесок · ${filing}`,
    uscisNote: 'Внески USCIS сплачуються окремо та безпосередньо до USCIS. Перевіряйте поточні суми на uscis.gov/feecalculator.',
    stepsTitle: 'Що робити після завантаження',
    steps: [
      { icon: '⬇️', text: 'Завантажте пакет — I-131 DOCX, PDF та покрокова інструкція.' },
      { icon: '🖊️', text: 'Роздрукуйте I-131, уважно заповніть і підпишіть. Або введіть дані в myUSCIS (онлайн).' },
      { icon: '📬', text: 'Відправте пакет до USCIS поштою або подайте онлайн. Збережіть номер відстеження.' },
    ],
    i912Reminder: '💡 Якщо оберете оплату поштою — не забудьте перевірити право на fee waiver (Form I-912). Інструкції є у вашому пакеті.',
    confirmBtn: 'Виглядає добре — підтвердити та оплатити →',
    filingLabels: {
      mail: 'Поштою до USCIS',
      online: 'Онлайн через myUSCIS',
      unsure: 'Спосіб подачі не вибрано',
    },
    files: [
      { icon: '📄', name: 'Форма I-131 (редагований DOCX)', size: '~120 КБ' },
      { icon: '📋', name: 'Форма I-131 (PDF)', size: '~95 КБ' },
      { icon: '✅', name: 'Контрольний список документів', size: '~40 КБ' },
      { icon: '📝', name: 'Покрокова інструкція передачі до USCIS', size: '~60 КБ' },
    ],
  },
  ru: {
    title: 'Просмотрите ваш пакет',
    subtitle: 'Бесплатный просмотр — посмотрите, что входит в пакет. Скачивание после оплаты.',
    packetBadge: (i: number) => `Пакет ${i + 1} · I-131 Re-Parole U4U`,
    readyBadge: 'Готово',
    previewTitle: '📋 Бесплатный просмотр — что вы получите',
    costSummary: (size: number, price: number, filing: string) =>
      `${size} заявитель${size === 1 ? '' : 'ей'} · $${price} сервисный взнос · ${filing}`,
    uscisNote: 'Взносы USCIS оплачиваются отдельно и непосредственно в USCIS. Проверяйте текущие суммы на uscis.gov/feecalculator.',
    stepsTitle: 'Что делать после скачивания',
    steps: [
      { icon: '⬇️', text: 'Скачайте пакет — I-131 DOCX, PDF и пошаговая инструкция.' },
      { icon: '🖊️', text: 'Распечатайте I-131, внимательно заполните и подпишите. Или введите данные в myUSCIS (онлайн).' },
      { icon: '📬', text: 'Отправьте пакет в USCIS почтой или подайте онлайн. Сохраните номер отслеживания.' },
    ],
    i912Reminder: '💡 Если выберете подачу почтой — не забудьте проверить право на fee waiver (Form I-912). Инструкции есть в вашем пакете.',
    confirmBtn: 'Выглядит хорошо — подтвердить и оплатить →',
    filingLabels: {
      mail: 'Почтой в USCIS',
      online: 'Онлайн через myUSCIS',
      unsure: 'Способ подачи не выбран',
    },
    files: [
      { icon: '📄', name: 'Форма I-131 (редактируемый DOCX)', size: '~120 КБ' },
      { icon: '📋', name: 'Форма I-131 (PDF)', size: '~95 КБ' },
      { icon: '✅', name: 'Контрольный список документов', size: '~40 КБ' },
      { icon: '📝', name: 'Пошаговая инструкция передачи в USCIS', size: '~60 КБ' },
    ],
  },
  en: {
    title: 'Review your packet',
    subtitle: 'Free preview — see what\'s in your packet. Download after payment.',
    packetBadge: (i: number) => `Packet ${i + 1} · I-131 Re-Parole U4U`,
    readyBadge: 'Ready',
    previewTitle: '📋 Free Preview — What you get',
    costSummary: (size: number, price: number, filing: string) =>
      `${size} applicant${size !== 1 ? 's' : ''} · $${price} service fee · ${filing}`,
    uscisNote: 'USCIS filing fees are paid separately and directly to USCIS. Verify current amounts at uscis.gov/feecalculator.',
    stepsTitle: 'What to do after downloading',
    steps: [
      { icon: '⬇️', text: 'Download your packet — I-131 DOCX, PDF, and step-by-step instructions.' },
      { icon: '🖊️', text: 'Print I-131, carefully fill it out, and sign. Or enter your data in myUSCIS (online).' },
      { icon: '📬', text: 'Mail your packet to USCIS or submit online. Keep the tracking number.' },
    ],
    i912Reminder: '💡 If filing by mail — check whether you qualify for a fee waiver (Form I-912). Instructions are included in your packet.',
    confirmBtn: 'Looks good — confirm & pay →',
    filingLabels: {
      mail: 'Mail to USCIS lockbox',
      online: 'Online via myUSCIS',
      unsure: 'Filing method not selected',
    },
    files: [
      { icon: '📄', name: 'Form I-131 (editable DOCX)', size: '~120 KB' },
      { icon: '📋', name: 'Form I-131 (PDF)', size: '~95 KB' },
      { icon: '✅', name: 'Document checklist', size: '~40 KB' },
      { icon: '📝', name: 'Field-by-field USCIS transfer guide', size: '~60 KB' },
    ],
  },
  es: {
    title: 'Revise su paquete',
    subtitle: 'Vista previa gratuita — vea qué hay en su paquete. Descarga después del pago.',
    packetBadge: (i: number) => `Paquete ${i + 1} · I-131 Re-Parole U4U`,
    readyBadge: 'Listo',
    previewTitle: '📋 Vista previa gratuita — qué obtendrá',
    costSummary: (size: number, price: number, filing: string) =>
      `${size} solicitante${size !== 1 ? 's' : ''} · $${price} tarifa de servicio · ${filing}`,
    uscisNote: 'Las tarifas de USCIS se pagan por separado y directamente a USCIS. Verifique los montos actuales en uscis.gov/feecalculator.',
    stepsTitle: 'Qué hacer después de descargar',
    steps: [
      { icon: '⬇️', text: 'Descargue el paquete — I-131 DOCX, PDF e instrucciones paso a paso.' },
      { icon: '🖊️', text: 'Imprima el I-131, llénelo con cuidado y fírmelo. O ingrese los datos en myUSCIS (en línea).' },
      { icon: '📬', text: 'Envíe el paquete a USCIS por correo o preséntelo en línea. Guarde el número de seguimiento.' },
    ],
    i912Reminder: '💡 Si presenta por correo — verifique si califica para una exención de tarifa (Form I-912). Las instrucciones están incluidas en su paquete.',
    confirmBtn: 'Todo bien — confirmar y pagar →',
    filingLabels: {
      mail: 'Por correo a USCIS',
      online: 'En línea vía myUSCIS',
      unsure: 'Método de presentación no seleccionado',
    },
    files: [
      { icon: '📄', name: 'Formulario I-131 (DOCX editable)', size: '~120 KB' },
      { icon: '📋', name: 'Formulario I-131 (PDF)', size: '~95 KB' },
      { icon: '✅', name: 'Lista de verificación de documentos', size: '~40 KB' },
      { icon: '📝', name: 'Guía de transferencia de datos a USCIS', size: '~60 KB' },
    ],
  },
} as const

export function Screen09() {
  const { state, setStep } = useWizard()
  const { members, filingMethod, packageSize, packagePrice } = state
  const t = T[state.locale] ?? T.en

  const filingLabel =
    filingMethod === 'mail'
      ? t.filingLabels.mail
      : filingMethod === 'online'
        ? t.filingLabels.online
        : t.filingLabels.unsure

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

      {/* Member summary */}
      <div className="space-y-2">
        {members.map((member, i) => (
          <div
            key={member.id}
            className="rounded-[12px] p-3.5 flex items-center justify-between"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                {member.alias || `Person ${i + 1}`}
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
                {t.packetBadge(i)}
              </p>
            </div>
            <span
              className="text-sm font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}
            >
              {t.readyBadge}
            </span>
          </div>
        ))}
      </div>

      {/* Free preview */}
      <div>
        <p
          className="text-sm font-semibold uppercase tracking-wide mb-2"
          style={{ color: 'var(--text-3)', letterSpacing: '0.6px' }}
        >
          {t.previewTitle}
        </p>
        <div
          className="rounded-[12px] overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
        >
          {t.files.map((file, idx) => (
            <div
              key={file.name}
              className="flex items-center gap-3 px-3.5 py-3"
              style={{
                borderBottom: idx < t.files.length - 1 ? '1px solid var(--border)' : undefined,
              }}
            >
              <span className="text-[18px] flex-shrink-0">{file.icon}</span>
              <span className="flex-1 text-[14px]" style={{ color: 'var(--text-1)' }}>
                {file.name}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-3)' }}>
                {file.size}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* What to do with packet — 3-step block */}
      <div>
        <p className="text-sm font-semibold mb-2.5" style={{ color: 'var(--text-1)' }}>
          {t.stepsTitle}
        </p>
        <div className="space-y-2">
          {t.steps.map((step, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-[10px] p-3"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <span className="text-[18px] flex-shrink-0 mt-0.5">{step.icon}</span>
              <div className="flex items-start gap-2">
                <span
                  className="flex-shrink-0 w-[20px] h-[20px] rounded-full flex items-center justify-center text-sm font-bold mt-0.5"
                  style={{ background: 'var(--primary)', color: '#fff' }}
                >
                  {idx + 1}
                </span>
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                  {step.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* I-912 reminder — shown when mail or unsure */}
      {(filingMethod === 'mail' || filingMethod === 'unsure' || !filingMethod) && (
        <div
          className="rounded-[12px] p-3.5"
          style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--success-text)' }}>
            {t.i912Reminder}
          </p>
        </div>
      )}

      {/* Cost summary */}
      <div
        className="rounded-[12px] p-3.5"
        style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}
      >
        <p className="text-[14px] font-semibold" style={{ color: 'var(--info-text)' }}>
          {t.costSummary(packageSize, packagePrice, filingLabel)}
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--info-text)' }}>
          {t.uscisNote}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setStep(10)}
        className="w-full rounded-[10px] text-[15px] font-bold transition-all active:scale-[0.98]"
        style={{
          background: 'var(--success)',
          color: '#fff',
          border: 'none',
          padding: '14px',
          minHeight: '52px',
        }}
      >
        {t.confirmBtn}
      </button>

      <ScreenGlossary terms={['I-131', 'Re-Parole', 'U4U', 'I-912']} locale={state.locale} />
      <SupportBlock locale={state.locale} />
    </div>
  )
}
