'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { ReviewPrompt } from '@/components/wizard/ReviewPrompt'

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

const T = {
  uk: {
    title: 'Пакет готовий',
    subtitle: 'Завантажте зараз або отримайте посилання на e-mail.',
    downloadBtn: '📦 Завантажити пакет документів',
    downloadingBtn: 'Готуємо ваш пакет…',
    whatToDo: '💡 Що робити з пакетом',
    whatToDoText: 'Відкрийте файли з пакету та перенесіть дані до форми USCIS. Використовуйте режим «Передача даних до USCIS» — він показує кожне поле по одному.',
    emailBtn: '📧 Надіслати на e-mail →',
    checklistTitle: (method: string | null) =>
      `📌 Контрольний список перед подачею${method === 'online' ? ' (онлайн)' : method === 'mail' ? ' (поштою)' : ''}`,
    checklistNote: 'Відмічайте кожен пункт по мірі виконання. Прогрес зберігається в сесії.',
    checklistDone: (n: number, total: number) => `${n} з ${total} виконано`,
    checklistAllDone: '✅ Всі пункти виконано — готово до подачі!',
    feesTitle: '📌 Внески USCIS (для вашої довідки)',
    feesNote: 'Ця інформація тільки для довідки. Внески сплачуються безпосередньо до USCIS — не нам.',
    fee1: '· Внесок за подачу I-131 — перевіряйте на uscis.gov/feecalculator',
    fee2: '· Внесок за схвалення паролю (якщо схвалено) — перевіряйте на uscis.gov/feecalculator',
    feeLink: 'Перевірити поточні внески на калькуляторі USCIS ↗',
    openUscis: 'Відкрити my.uscis.gov ↗',
    checklistMail: [
      'Роздрукуйте всі сторінки I-131 (підпишіть вручну — не цифровий підпис)',
      'Напишіть «Ukraine RE-PAROLE» вгорі форми від руки',
      'Прикладіть 2 паспортних фото на кожного заявника (5×5 см)',
      'Включіть копію попереднього документа про пароль (I-94 або повідомлення про схвалення)',
      'Включіть копію поточного I-94 (завантажте на i94.cbp.dhs.gov)',
      'Перевірте поточну поштову адресу на uscis.gov/i-131-addresses',
      'Оплатіть держмито USCIS (перевіряйте на uscis.gov/feecalculator)',
    ],
    checklistOnline: [
      'Створіть або увійдіть до вашого акаунту myUSCIS на my.uscis.gov',
      'Напишіть «Ukraine RE-PAROLE» у полі додаткової інформації',
      'Завантажте скановані копії всіх підтверджуючих документів',
      'Включіть копію поточного I-94 (завантажте на i94.cbp.dhs.gov)',
      'Перевірте держмито USCIS на uscis.gov/feecalculator перед оплатою',
      'Оплатіть держмито онлайн через портал myUSCIS',
    ],
    checklistUnsure: [
      'Перегляньте обидва способи подачі на uscis.gov/i-131',
      'Напишіть «Ukraine RE-PAROLE» вгорі форми (або у полі додаткової інформації)',
      'Підготуйте: I-94, попереднє схвалення паролю, підтвердження громадянства України',
      'Перевірте держмито USCIS на uscis.gov/feecalculator',
      'Для пошти: перевірте адресу на uscis.gov/i-131-addresses',
      'Для онлайн: створіть акаунт myUSCIS на my.uscis.gov',
    ],
  },
  ru: {
    title: 'Пакет готов',
    subtitle: 'Скачайте сейчас или получите ссылку на e-mail.',
    downloadBtn: '📦 Скачать пакет документов',
    downloadingBtn: 'Готовим ваш пакет…',
    whatToDo: '💡 Что делать с пакетом',
    whatToDoText: 'Откройте файлы из пакета и перенесите данные в форму USCIS. Используйте режим «Передача данных в USCIS» — он показывает каждое поле по одному.',
    emailBtn: '📧 Отправить на e-mail →',
    checklistTitle: (method: string | null) =>
      `📌 Контрольный список перед подачей${method === 'online' ? ' (онлайн)' : method === 'mail' ? ' (по почте)' : ''}`,
    checklistNote: 'Отмечайте каждый пункт по мере выполнения. Прогресс сохраняется в сессии.',
    checklistDone: (n: number, total: number) => `${n} из ${total} выполнено`,
    checklistAllDone: '✅ Все пункты выполнены — готово к подаче!',
    feesTitle: '📌 Взносы USCIS (для вашей справки)',
    feesNote: 'Эта информация только для справки. Взносы оплачиваются непосредственно в USCIS — не нам.',
    fee1: '· Взнос за подачу I-131 — проверяйте на uscis.gov/feecalculator',
    fee2: '· Взнос за одобрение пароля (если одобрено) — проверяйте на uscis.gov/feecalculator',
    feeLink: 'Проверить текущие взносы на калькуляторе USCIS ↗',
    openUscis: 'Открыть my.uscis.gov ↗',
    checklistMail: [
      'Распечатайте все страницы I-131 (подпишите вручную — не цифровая подпись)',
      'Напишите «Ukraine RE-PAROLE» вверху формы от руки',
      'Приложите 2 паспортных фото на каждого заявителя (5×5 см)',
      'Включите копию предыдущего документа о пароле (I-94 или уведомление об одобрении)',
      'Включите копию текущего I-94 (скачайте на i94.cbp.dhs.gov)',
      'Проверьте текущий почтовый адрес на uscis.gov/i-131-addresses',
      'Оплатите госпошлину USCIS (проверяйте на uscis.gov/feecalculator)',
    ],
    checklistOnline: [
      'Создайте или войдите в ваш аккаунт myUSCIS на my.uscis.gov',
      'Напишите «Ukraine RE-PAROLE» в поле дополнительной информации',
      'Загрузите сканированные копии всех подтверждающих документов',
      'Включите копию текущего I-94 (скачайте на i94.cbp.dhs.gov)',
      'Проверьте госпошлину USCIS на uscis.gov/feecalculator перед оплатой',
      'Оплатите госпошлину онлайн через портал myUSCIS',
    ],
    checklistUnsure: [
      'Просмотрите оба способа подачи на uscis.gov/i-131',
      'Напишите «Ukraine RE-PAROLE» вверху формы (или в поле дополнительной информации)',
      'Подготовьте: I-94, предыдущее одобрение пароля, подтверждение гражданства Украины',
      'Проверьте госпошлину USCIS на uscis.gov/feecalculator',
      'Для почты: проверьте адрес на uscis.gov/i-131-addresses',
      'Для онлайн: создайте аккаунт myUSCIS на my.uscis.gov',
    ],
  },
  en: {
    title: 'Packet ready',
    subtitle: 'Download now or get a link to your email.',
    downloadBtn: '📦 Download packet',
    downloadingBtn: 'Preparing your packet…',
    whatToDo: '💡 What to do with your packet',
    whatToDoText: 'Open the files from the packet and copy the data into the USCIS form. Use the "Data Transfer to USCIS" mode — it shows each field one by one.',
    emailBtn: '📧 Also send to email →',
    checklistTitle: (method: string | null) =>
      `📌 Pre-filing checklist${method === 'online' ? ' (online)' : method === 'mail' ? ' (by mail)' : ''}`,
    checklistNote: 'Check off each item as you complete it. Progress is saved in your session.',
    checklistDone: (n: number, total: number) => `${n} of ${total} done`,
    checklistAllDone: '✅ All items complete — ready to file!',
    feesTitle: '📌 USCIS fees (for your reference)',
    feesNote: 'This information is for your reference only. Fees are paid directly to USCIS — not to us.',
    fee1: '· I-131 filing fee — verify at uscis.gov/feecalculator',
    fee2: '· Parole grant fee (if approved) — verify at uscis.gov/feecalculator',
    feeLink: 'Check current fees on USCIS Fee Calculator ↗',
    openUscis: 'Open my.uscis.gov ↗',
    checklistMail: [
      'Print all pages of I-131 (sign in ink — do not use digital signature)',
      'Write "Ukraine RE-PAROLE" at the top of the form in pen',
      'Attach 2 passport-style photos per applicant (2"×2")',
      'Include copy of previous parole document (I-94 or approval notice)',
      'Include copy of current I-94 (download at i94.cbp.dhs.gov)',
      'Check current mailing address at uscis.gov/i-131-addresses',
      'Pay USCIS filing fee (verify amount at uscis.gov/feecalculator)',
    ],
    checklistOnline: [
      'Create or log in to your myUSCIS account at my.uscis.gov',
      'Write "Ukraine RE-PAROLE" in the additional information field',
      'Upload scanned copies of all supporting documents',
      'Include copy of current I-94 (download at i94.cbp.dhs.gov)',
      'Check USCIS filing fee at uscis.gov/feecalculator before paying',
      'Pay USCIS fee online through the myUSCIS portal',
    ],
    checklistUnsure: [
      'Review both filing options at uscis.gov/i-131',
      'Write "Ukraine RE-PAROLE" at top of form (or in additional info field)',
      'Gather: I-94, previous parole approval, proof of Ukrainian citizenship',
      'Check USCIS filing fee at uscis.gov/feecalculator',
      'For mail: check address at uscis.gov/i-131-addresses',
      'For online: create a myUSCIS account at my.uscis.gov',
    ],
  },
  es: {
    title: 'Paquete listo',
    subtitle: 'Descargue ahora u obtenga un enlace en su correo.',
    downloadBtn: '📦 Descargar paquete de documentos',
    downloadingBtn: 'Preparando su paquete…',
    whatToDo: '💡 Qué hacer con su paquete',
    whatToDoText: 'Abra los archivos del paquete y copie los datos en el formulario de USCIS. Use el modo "Transferencia de datos a USCIS" — muestra cada campo uno por uno.',
    emailBtn: '📧 También enviar al correo →',
    checklistTitle: (method: string | null) =>
      `📌 Lista de verificación previa${method === 'online' ? ' (en línea)' : method === 'mail' ? ' (por correo)' : ''}`,
    checklistNote: 'Marque cada elemento a medida que lo complete. El progreso se guarda en su sesión.',
    checklistDone: (n: number, total: number) => `${n} de ${total} completados`,
    checklistAllDone: '✅ ¡Todos los elementos completados — listo para presentar!',
    feesTitle: '📌 Tarifas de USCIS (para su referencia)',
    feesNote: 'Esta información es solo de referencia. Las tarifas se pagan directamente a USCIS — no a nosotros.',
    fee1: '· Tarifa de presentación I-131 — verifique en uscis.gov/feecalculator',
    fee2: '· Tarifa de aprobación de parole (si se aprueba) — verifique en uscis.gov/feecalculator',
    feeLink: 'Verificar tarifas actuales en la Calculadora de USCIS ↗',
    openUscis: 'Abrir my.uscis.gov ↗',
    checklistMail: [
      'Imprima todas las páginas del I-131 (firme con tinta — no firma digital)',
      'Escriba "Ukraine RE-PAROLE" en la parte superior del formulario con bolígrafo',
      'Adjunte 2 fotos tipo pasaporte por solicitante (5×5 cm)',
      'Incluya copia del documento de parole anterior (I-94 o aviso de aprobación)',
      'Incluya copia del I-94 actual (descargue en i94.cbp.dhs.gov)',
      'Verifique la dirección postal actual en uscis.gov/i-131-addresses',
      'Pague la tarifa de USCIS (verifique el monto en uscis.gov/feecalculator)',
    ],
    checklistOnline: [
      'Cree o inicie sesión en su cuenta myUSCIS en my.uscis.gov',
      'Escriba "Ukraine RE-PAROLE" en el campo de información adicional',
      'Suba copias escaneadas de todos los documentos de apoyo',
      'Incluya copia del I-94 actual (descargue en i94.cbp.dhs.gov)',
      'Verifique la tarifa de USCIS en uscis.gov/feecalculator antes de pagar',
      'Pague la tarifa de USCIS en línea a través del portal myUSCIS',
    ],
    checklistUnsure: [
      'Revise ambas opciones de presentación en uscis.gov/i-131',
      'Escriba "Ukraine RE-PAROLE" en la parte superior del formulario (o en el campo de información adicional)',
      'Reúna: I-94, aprobación de parole anterior, prueba de ciudadanía ucraniana',
      'Verifique la tarifa de USCIS en uscis.gov/feecalculator',
      'Para correo: verifique la dirección en uscis.gov/i-131-addresses',
      'Para en línea: cree una cuenta myUSCIS en my.uscis.gov',
    ],
  },
} as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Screen11() {
  const { state, setDownloadUrl, setStep } = useWizard()
  const { sessionId, filingMethod, downloadUrl } = state
  const t = T[state.locale] ?? T.en
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({})

  const checklist =
    filingMethod === 'online'
      ? t.checklistOnline
      : filingMethod === 'mail'
        ? t.checklistMail
        : t.checklistUnsure

  const doneCount = checklist.filter((_, i) => checkedItems[i]).length
  const allDone = doneCount === checklist.length

  function toggleItem(i: number) {
    setCheckedItems((prev) => ({ ...prev, [i]: !prev[i] }))
  }

  async function handleDownload() {
    setError('')

    if (downloadUrl && !downloadUrl.startsWith('mock://')) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
      return
    }

    if (!sessionId) {
      setError('Session not found. Please refresh and try again.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/packet/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      const data = await res.json() as { ok?: boolean; signed_url?: string; error?: string }
      if (data.ok && data.signed_url) {
        setDownloadUrl(data.signed_url)
        window.open(data.signed_url, '_blank', 'noopener,noreferrer')
      } else {
        setError(data.error ?? 'Packet generation failed. Please try again.')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Success header */}
      <div className="text-center py-4">
        <div
          className="w-[64px] h-[64px] rounded-full flex items-center justify-center text-[32px] mx-auto mb-3"
          style={{ background: 'var(--success-bg)' }}
        >
          ✓
        </div>
        <h1 className="text-[22px] font-bold mb-1" style={{ color: 'var(--text-1)' }}>
          {t.title}
        </h1>
        <p className="text-[15px]" style={{ color: 'var(--text-2)' }}>
          {t.subtitle}
        </p>
      </div>

      {error && (
        <div
          className="rounded-[12px] p-3.5"
          style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--error-text)' }}>{error}</p>
        </div>
      )}

      {/* Download button */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="w-full rounded-[10px] text-[16px] font-bold transition-all active:scale-[0.98]"
        style={{
          background: 'var(--success)',
          color: '#fff',
          border: 'none',
          padding: '16px',
          minHeight: '56px',
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? t.downloadingBtn : t.downloadBtn}
      </button>

      {/* What to do next */}
      <div
        className="rounded-[12px] p-3.5"
        style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}
      >
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--info-text)' }}>
          {t.whatToDo}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--info-text)' }}>
          {t.whatToDoText}
        </p>
      </div>

      {/* ── INTERACTIVE FILING CHECKLIST ──────────────────────────────────── */}
      <div>
        {/* Checklist header */}
        <div className="flex items-center justify-between mb-2">
          <p
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)', letterSpacing: '0.6px' }}
          >
            {t.checklistTitle(filingMethod)}
          </p>
          <span
            className="text-sm font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: allDone ? 'var(--success-bg)' : 'var(--surface-2)',
              color: allDone ? 'var(--success-text)' : 'var(--text-3)',
              border: `1px solid ${allDone ? 'var(--success-border)' : 'var(--border)'}`,
            }}
          >
            {t.checklistDone(doneCount, checklist.length)}
          </span>
        </div>

        {/* Checklist note */}
        <p className="text-sm mb-2" style={{ color: 'var(--text-3)' }}>
          {t.checklistNote}
        </p>

        {/* All-done banner */}
        {allDone && (
          <div
            className="rounded-[10px] p-3 mb-2 text-center text-sm font-semibold"
            style={{ background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)' }}
          >
            {t.checklistAllDone}
          </div>
        )}

        {/* Progress bar */}
        <div
          className="h-[4px] rounded-[2px] mb-3 overflow-hidden"
          style={{ background: 'var(--border)' }}
        >
          <div
            className="h-full rounded-[2px] transition-all duration-300"
            style={{
              width: `${checklist.length > 0 ? (doneCount / checklist.length) * 100 : 0}%`,
              background: allDone ? 'var(--success)' : 'var(--primary)',
            }}
          />
        </div>

        {/* Interactive checklist items */}
        <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {checklist.map((item, idx) => {
            const done = !!checkedItems[idx]
            return (
              <label
                key={item}
                className="flex items-start gap-3 px-3.5 py-3 cursor-pointer transition-colors"
                style={{
                  borderBottom: idx < checklist.length - 1 ? '1px solid var(--border)' : undefined,
                  background: done ? 'var(--success-bg)' : 'var(--surface)',
                }}
                onClick={() => toggleItem(idx)}
              >
                {/* Custom checkbox */}
                <div
                  className="flex-shrink-0 w-[22px] h-[22px] rounded-[5px] flex items-center justify-center mt-0.5"
                  style={{
                    border: `2px solid ${done ? 'var(--success)' : 'var(--border-strong)'}`,
                    background: done ? 'var(--success)' : 'var(--surface)',
                  }}
                >
                  {done && <span className="text-white font-bold text-sm">✓</span>}
                </div>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggleItem(idx)}
                  className="sr-only"
                />
                <span
                  className="text-sm leading-snug"
                  style={{
                    color: done ? 'var(--success-text)' : 'var(--text-1)',
                    textDecoration: done ? 'line-through' : 'none',
                    opacity: done ? 0.75 : 1,
                  }}
                >
                  {item}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* USCIS fees reminder */}
      <div
        className="rounded-[12px] p-3.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
          {t.feesTitle}
        </p>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          {t.feesNote}
        </p>
        <div className="mt-2 text-sm space-y-1" style={{ color: 'var(--text-2)' }}>
          <p>{t.fee1}</p>
          <p>{t.fee2}</p>
        </div>
        <a
          href="https://www.uscis.gov/feecalculator"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-sm font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          {t.feeLink}
        </a>
      </div>

      {/* Open USCIS */}
      <a
        href="https://my.uscis.gov"
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center rounded-[10px] text-[15px] font-bold no-underline transition-all active:scale-[0.98]"
        style={{
          background: 'var(--primary)',
          color: '#fff',
          padding: '14px',
          minHeight: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {t.openUscis}
      </a>

      <button
        type="button"
        onClick={() => setStep(12)}
        className="w-full rounded-[10px] text-[14px] font-medium transition-all"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-2)',
          padding: '12px',
          minHeight: '44px',
        }}
      >
        {t.emailBtn}
      </button>

      {/* Review prompt — always shown; skipped state self-removes */}
      <ReviewPrompt
        locale={state.locale}
        sessionId={sessionId}
        serviceSlug="re-parole-u4u"
      />
    </div>
  )
}
