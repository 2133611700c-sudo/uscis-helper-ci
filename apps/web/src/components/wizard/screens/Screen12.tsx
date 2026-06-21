'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { SupportBlock } from '@/components/wizard/SupportBlock'

const T = {
  uk: {
    title: 'Передача даних до USCIS',
    subtitle: 'Відкрийте my.uscis.gov у новій вкладці. Копіюйте поля по одному.',
    emailTab: '📧 Посилання на e-mail',
    transferTab: '➤ Режим передачі',
    emailTitle: '📧 Отримати посилання на e-mail',
    emailNote: 'Збережіть посилання — воно буде дійсне 7 днів. Ви зможете завантажити з іншого пристрою.',
    emailPlaceholder: 'ваш@email.com',
    sendBtn: 'Надіслати на e-mail →',
    successTitle: 'Все готово!',
    successNote: (email: string) => `Посилання для завантаження буде надіслано на ${email}. Посилання дійсне 7 днів.`,
    fieldOf: (cur: number, total: number) => `Поле ${cur} з ${total}`,
    uscisAsks: 'USCIS запитує:',
    copyBtn: '📋 Скопіювати та відкрити USCIS',
    copiedBtn: '✓ Скопійовано!',
    backBtn: '← Назад',
    nextBtn: 'Далі →',
    progressLabel: (cur: number, total: number) => `Прогрес: ${cur} з ${total}`,
    iphoneTip: '💡 На iPhone: перемикайтесь між вкладками цього сайту та USCIS — копіюйте тут, вставляйте там. Прогрес зберігається автоматично.',
    backToDownload: '← Назад до завантаження',
  },
  ru: {
    title: 'Передача данных в USCIS',
    subtitle: 'Откройте my.uscis.gov в новой вкладке. Копируйте поля по одному.',
    emailTab: '📧 Ссылка на e-mail',
    transferTab: '➤ Режим передачи',
    emailTitle: '📧 Получить ссылку на e-mail',
    emailNote: 'Сохраните ссылку — она будет действительна 7 дней. Вы сможете скачать с другого устройства.',
    emailPlaceholder: 'ваш@email.com',
    sendBtn: 'Отправить на e-mail →',
    successTitle: 'Всё готово!',
    successNote: (email: string) => `Ссылка для скачивания будет отправлена на ${email}. Ссылка действительна 7 дней.`,
    fieldOf: (cur: number, total: number) => `Поле ${cur} из ${total}`,
    uscisAsks: 'USCIS спрашивает:',
    copyBtn: '📋 Скопировать и открыть USCIS',
    copiedBtn: '✓ Скопировано!',
    backBtn: '← Назад',
    nextBtn: 'Далее →',
    progressLabel: (cur: number, total: number) => `Прогресс: ${cur} из ${total}`,
    iphoneTip: '💡 На iPhone: переключайтесь между вкладками этого сайта и USCIS — копируйте здесь, вставляйте там. Прогресс сохраняется автоматически.',
    backToDownload: '← Назад к скачиванию',
  },
  en: {
    title: 'Transfer data to USCIS',
    subtitle: 'Open my.uscis.gov in a new tab. Copy fields one by one.',
    emailTab: '📧 Email link',
    transferTab: '➤ Transfer mode',
    emailTitle: '📧 Get link on email',
    emailNote: 'Save the link — it will work for 7 days. You can download from another device.',
    emailPlaceholder: 'you@example.com',
    sendBtn: 'Send to email →',
    successTitle: 'All done!',
    successNote: (email: string) => `Download link will be sent to ${email}. Link is valid for 7 days.`,
    fieldOf: (cur: number, total: number) => `Field ${cur} of ${total}`,
    uscisAsks: 'USCIS asks:',
    copyBtn: '📋 Copy & open USCIS',
    copiedBtn: '✓ Copied!',
    backBtn: '← Back',
    nextBtn: 'Next →',
    progressLabel: (cur: number, total: number) => `Progress: ${cur} of ${total}`,
    iphoneTip: '💡 On iPhone: switch tabs between this site and USCIS — copy here, paste there. Progress is saved automatically.',
    backToDownload: '← Back to download',
  },
  es: {
    title: 'Transferir datos a USCIS',
    subtitle: 'Abra my.uscis.gov en una nueva pestaña. Copie los campos uno por uno.',
    emailTab: '📧 Enlace por correo',
    transferTab: '➤ Modo transferencia',
    emailTitle: '📧 Obtener enlace por correo',
    emailNote: 'Guarde el enlace — funcionará por 7 días. Puede descargar desde otro dispositivo.',
    emailPlaceholder: 'usted@ejemplo.com',
    sendBtn: 'Enviar por correo →',
    successTitle: '¡Todo listo!',
    successNote: (email: string) => `El enlace de descarga se enviará a ${email}. El enlace es válido por 7 días.`,
    fieldOf: (cur: number, total: number) => `Campo ${cur} de ${total}`,
    uscisAsks: 'USCIS pregunta:',
    copyBtn: '📋 Copiar y abrir USCIS',
    copiedBtn: '✓ ¡Copiado!',
    backBtn: '← Atrás',
    nextBtn: 'Siguiente →',
    progressLabel: (cur: number, total: number) => `Progreso: ${cur} de ${total}`,
    iphoneTip: '💡 En iPhone: cambie de pestaña entre este sitio y USCIS — copie aquí, pegue allí. El progreso se guarda automáticamente.',
    backToDownload: '← Volver a descarga',
  },
} as const

const TRANSFER_FIELDS = [
  { question: 'Family Name (Item 1.a)', value: 'PETRENKO' },
  { question: 'Given Name (Item 1.b)', value: 'OLENA' },
  { question: 'Date of Birth (Item 3)', value: '05/15/1985' },
  { question: 'Country of Birth (Item 5)', value: 'Ukraine' },
  { question: 'I-94 Number (Item 10.C)', value: 'I-94 number from your record' },
]

export function Screen12() {
  const { state, setTransferEmail, setStep } = useWizard()
  const t = T[state.locale] ?? T.en
  const [email, setEmail] = useState(state.transferEmail ?? '')
  const [sent, setSent] = useState(Boolean(state.transferEmail))
  const [mode, setMode] = useState<'email' | 'transfer'>('email')
  const [transferIdx, setTransferIdx] = useState(0)
  const [copied, setCopied] = useState(false)

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setTransferEmail(email)
    setSent(true)
  }

  function handleCopy() {
    const field = TRANSFER_FIELDS[transferIdx]
    if (field) {
      void navigator.clipboard.writeText(field.value).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
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

      {/* Mode switcher */}
      <div className="flex gap-2">
        {(['email', 'transfer'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="flex-1 rounded-[8px] text-sm font-semibold py-2 transition-all"
            style={{
              background: mode === m ? 'var(--primary)' : 'var(--surface-2)',
              color: mode === m ? '#fff' : 'var(--text-2)',
              border: mode === m ? 'none' : '1px solid var(--border)',
            }}
          >
            {m === 'email' ? t.emailTab : t.transferTab}
          </button>
        ))}
      </div>

      {mode === 'email' && (
        sent ? (
          <div
            className="rounded-[12px] p-5 text-center"
            style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
          >
            <p className="text-[32px] mb-2">✅</p>
            <p className="text-[16px] font-bold mb-1" style={{ color: 'var(--success-text)' }}>
              {t.successTitle}
            </p>
            <p className="text-sm" style={{ color: 'var(--success-text)' }}>
              {t.successNote(email)}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <h2 className="text-[16px] font-semibold mb-1.5" style={{ color: 'var(--text-1)' }}>
                {t.emailTitle}
              </h2>
              <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>
                {t.emailNote}
              </p>
            </div>
            <input
              id="transfer-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              className="w-full rounded-[8px] text-[16px]"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
                padding: '11px 12px',
                minHeight: '44px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              className="w-full rounded-[10px] text-[15px] font-bold transition-all active:scale-[0.98]"
              style={{
                background: 'var(--success)',
                color: '#fff',
                border: 'none',
                padding: '14px',
                minHeight: '52px',
              }}
            >
              {t.sendBtn}
            </button>
          </form>
        )
      )}

      {mode === 'transfer' && (
        <div className="space-y-3">
          {/* Transfer card */}
          <div
            className="rounded-[12px] p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p
              className="text-sm font-semibold uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}
            >
              {t.fieldOf(transferIdx + 1, TRANSFER_FIELDS.length)}
            </p>
            <p className="text-sm mb-1.5" style={{ color: 'var(--text-2)' }}>
              {t.uscisAsks}{' '}
              <strong style={{ color: 'var(--text-1)' }}>
                {TRANSFER_FIELDS[transferIdx]?.question}
              </strong>
            </p>
            <div
              className="rounded-[10px] p-3.5 mb-3 font-mono text-[18px] font-bold break-words"
              style={{
                // High-contrast surface (text-1 on surface-2) — the value must be
                // legible to copy. Was text-1 on accent green (~3.9:1, WCAG fail).
                background: 'var(--surface-2)',
                border: '2px solid var(--accent)',
                color: 'var(--text-1)',
              }}
            >
              {TRANSFER_FIELDS[transferIdx]?.value}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="w-full rounded-[10px] text-[15px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] mb-2"
              style={{
                background: copied ? 'var(--success)' : 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '14px',
                minHeight: '52px',
              }}
            >
              {copied ? t.copiedBtn : t.copyBtn}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={transferIdx === 0}
                onClick={() => setTransferIdx((i) => i - 1)}
                className="flex-1 rounded-[8px] text-sm font-semibold py-2.5 transition-all"
                style={{
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border-strong)',
                  color: 'var(--text-1)',
                  opacity: transferIdx === 0 ? 0.4 : 1,
                }}
              >
                {t.backBtn}
              </button>
              <button
                type="button"
                disabled={transferIdx === TRANSFER_FIELDS.length - 1}
                onClick={() => setTransferIdx((i) => i + 1)}
                className="flex-1 rounded-[8px] text-sm font-semibold py-2.5 transition-all"
                style={{
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border-strong)',
                  color: 'var(--text-1)',
                  opacity: transferIdx === TRANSFER_FIELDS.length - 1 ? 0.4 : 1,
                }}
              >
                {t.nextBtn}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div
            className="rounded-[8px] p-2.5 text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
          >
            {t.progressLabel(transferIdx + 1, TRANSFER_FIELDS.length)}
            <div
              className="h-[4px] rounded-[2px] mt-1.5 overflow-hidden"
              style={{ background: 'var(--border)' }}
            >
              <div
                className="h-full rounded-[2px] transition-all"
                style={{
                  width: `${((transferIdx + 1) / TRANSFER_FIELDS.length) * 100}%`,
                  background: 'var(--primary)',
                }}
              />
            </div>
          </div>

          {/* iPhone tip */}
          <div
            className="rounded-[12px] p-3 text-sm leading-relaxed"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
          >
            {t.iphoneTip}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setStep(11)}
        className="w-full rounded-[10px] text-sm font-medium transition-all"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-2)',
          padding: '11px',
          minHeight: '44px',
        }}
      >
        {t.backToDownload}
      </button>

      <SupportBlock locale={state.locale} />
    </div>
  )
}
