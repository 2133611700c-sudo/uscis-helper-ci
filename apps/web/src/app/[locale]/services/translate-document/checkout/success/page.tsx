'use client'

/**
 * /[locale]/services/translate-document/checkout/success
 * Stage 10I — Post-payment page: restores wizard state from localStorage and
 * lets user download all 4 translation files immediately.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { DOCS, DocEra, SourceLang, FieldDef } from '@/lib/translation/docDefinitions'
import { generateTranslationDoc } from '@/lib/translation/generateTranslationHTML'

// ── Pending session shape (must match what TranslationWizard saves) ───────────
interface PendingSession {
  docId: string
  srcLang: SourceLang
  targetLang: SourceLang
  docEra: DocEra | null
  fieldValues: Record<string, string>
  savedAt: number
}

// ── i18n ──────────────────────────────────────────────────────────────────────
const T = {
  en: {
    title: '✅ Payment received!',
    subtitle: 'Your translation template is ready. Download all 4 files below.',
    file1: 'Translation Draft (EN)',
    file2: 'Translator Certification',
    file3: 'USCIS Checklist',
    file4: 'Filing Instructions',
    dlAll: 'Download all files',
    backLabel: '← Back to Translate Documents',
    noSession: 'Your files are ready — click the link below to return and download.',
    noSessionNote:
      'It looks like your browser cleared the session data. Return to the translation tool — your payment is saved.',
    returnBtn: '← Return to Translate Documents',
    hint: 'Open in browser → File → Print → Save as PDF. Sign the certification block by hand.',
    thanks: 'Thank you for your order!',
    support: 'Questions? Email support@messenginfo.com',
  },
  uk: {
    title: '✅ Оплата отримана!',
    subtitle: 'Ваш засвідчений переклад готовий. Завантажте всі 4 файли нижче.',
    file1: 'Чернетка перекладу (EN)',
    file2: 'Свідоцтво перекладача',
    file3: 'Контрольний список USCIS',
    file4: 'Інструкція з подачі',
    dlAll: 'Завантажити всі файли',
    backLabel: '← Повернутись до Перекладу документів',
    noSession: 'Ваші файли готові — натисніть кнопку нижче, щоб повернутись.',
    noSessionNote:
      'Схоже, браузер очистив дані сесії. Поверніться до інструменту перекладу — оплата збережена.',
    returnBtn: '← Повернутись до Перекладу документів',
    hint: 'Відкрийте у браузері → Файл → Друк → Зберегти як PDF. Підпишіть блок підтвердження від руки.',
    thanks: 'Дякуємо за замовлення!',
    support: 'Питання? Пишіть на support@messenginfo.com',
  },
  ru: {
    title: '✅ Оплата получена!',
    subtitle: 'Ваш заверенный перевод готов. Скачайте все 4 файла ниже.',
    file1: 'Черновик перевода (EN)',
    file2: 'Свидетельство переводчика',
    file3: 'Контрольный список USCIS',
    file4: 'Инструкция по подаче',
    dlAll: 'Скачать все файлы',
    backLabel: '← Вернуться к Переводу документов',
    noSession: 'Ваши файлы готовы — нажмите кнопку ниже, чтобы вернуться.',
    noSessionNote:
      'Похоже, браузер очистил данные сессии. Вернитесь в инструмент перевода — оплата сохранена.',
    returnBtn: '← Вернуться к Переводу документов',
    hint: 'Откройте в браузере → Файл → Печать → Сохранить как PDF. Подпишите блок подтверждения от руки.',
    thanks: 'Спасибо за заказ!',
    support: 'Вопросы? Пишите на support@messenginfo.com',
  },
  es: {
    title: '✅ ¡Pago recibido!',
    subtitle: 'Su traducción certificada está lista. Descargue los 4 archivos a continuación.',
    file1: 'Borrador de traducción (EN)',
    file2: 'Certificación del traductor',
    file3: 'Lista de verificación USCIS',
    file4: 'Instrucciones de presentación',
    dlAll: 'Descargar todos los archivos',
    backLabel: '← Volver a Traducción de documentos',
    noSession: 'Sus archivos están listos — haga clic en el botón de abajo para regresar.',
    noSessionNote:
      'Parece que el navegador borró los datos de sesión. Vuelva a la herramienta de traducción — su pago está guardado.',
    returnBtn: '← Volver a Traducción de documentos',
    hint: 'Abra en el navegador → Archivo → Imprimir → Guardar como PDF. Firme el bloque de certificación a mano.',
    thanks: '¡Gracias por su pedido!',
    support: '¿Preguntas? Escriba a support@messenginfo.com',
  },
} as const

type Locale = keyof typeof T

// ── Download helper ───────────────────────────────────────────────────────────
function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a) }, 2000)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TranslationCheckoutSuccess() {
  const params = useParams()
  const locale = (params?.locale as Locale) ?? 'en'
  const t = T[locale] ?? T.en

  const [files, setFiles] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const generated = useRef(false)

  useEffect(() => {
    if (generated.current) return
    generated.current = true

    try {
      const raw = localStorage.getItem('translation_pending')
      if (!raw) { setLoaded(true); return }

      const session = JSON.parse(raw) as PendingSession
      // Expire after 2 hours (safety guard)
      if (Date.now() - session.savedAt > 2 * 60 * 60 * 1000) {
        localStorage.removeItem('translation_pending')
        setLoaded(true)
        return
      }

      const doc = DOCS.find((d) => d.id === session.docId)
      if (!doc) { setLoaded(true); return }

      // Mirror wizard logic: merge base fields + era extra fields
      const eraVariant =
        session.docEra && doc.eraVariants
          ? (doc.eraVariants.find((e) => e.id === session.docEra) ?? null)
          : null
      const fields: FieldDef[] = [
        ...(doc.fields ?? []),
        ...(eraVariant?.extraFields ?? []),
      ]

      const generated4 = Array.from(
        generateTranslationDoc(
          doc,
          fields,
          session.fieldValues,
          session.srcLang,
          session.targetLang,
          eraVariant?.noteForTranslator,
        ),
      )

      setFiles(generated4)
    } catch {
      // parse error or localStorage unavailable — show no-session UI
    }

    setLoaded(true)
  }, [])

  const fileLabels = [t.file1, t.file2, t.file3, t.file4]
  const fileNames = [
    'translation-draft.html',
    'translator-certification.html',
    'uscis-checklist.html',
    'filing-instructions.html',
  ]
  const fileIsWarning = [false, true, false, false]

  function handleDownloadSingle(idx: number) {
    if (!files[idx]) return
    downloadBlob(files[idx], fileNames[idx])
  }

  function handleDownloadAll() {
    files.forEach((f, i) => {
      setTimeout(() => downloadBlob(f, fileNames[i]), i * 350)
    })
    try { localStorage.removeItem('translation_pending') } catch { /* ignore */ }
  }

  if (!loaded) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Header card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-1)', marginBottom: '8px' }}>{t.title}</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.5 }}>{t.subtitle}</p>
        </div>

        {files.length === 4 ? (
          <>
            {/* File list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fileLabels.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleDownloadSingle(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: `1px solid ${fileIsWarning[i] ? '#fcd34d' : 'var(--border)'}`,
                    background: fileIsWarning[i] ? '#fffbeb' : 'var(--surface-2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: fileIsWarning[i] ? '#fde68a' : '#dbeafe',
                    color: fileIsWarning[i] ? '#92400e' : '#1d4ed8',
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: fileIsWarning[i] ? '#92400e' : 'var(--text-1)', marginBottom: '2px' }}>{label}</p>
                    <p style={{ fontSize: '15px', color: fileIsWarning[i] ? '#b45309' : 'var(--text-3)' }}>{fileNames[i]}</p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ flexShrink: 0, color: fileIsWarning[i] ? '#b45309' : '#3b82f6' }}>
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Download all */}
            <button
              type="button"
              onClick={handleDownloadAll}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px 20px', borderRadius: '12px',
                border: '2px solid #2563eb', background: 'transparent',
                color: '#2563eb', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t.dlAll}
            </button>

            {/* Hint */}
            <div style={{ borderRadius: '10px', border: '1px solid #fcd34d', background: '#fffbeb', padding: '12px 16px' }}>
              <p style={{ fontSize: '15px', color: '#92400e', lineHeight: 1.5 }}>⚠ {t.hint}</p>
            </div>
          </>
        ) : (
          /* No session data — browser cleared localStorage */
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '8px' }}>{t.noSession}</p>
            <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.5 }}>{t.noSessionNote}</p>
          </div>
        )}

        {/* Support + nav */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)' }}>{t.thanks}</p>
          <p style={{ fontSize: '15px', color: 'var(--text-3)' }}>{t.support}</p>
          <a
            href={`/${locale}/services/translate-document`}
            style={{ fontSize: '15px', color: '#2563eb', textDecoration: 'none', marginTop: '4px' }}
          >
            {t.backLabel}
          </a>
        </div>
      </div>
    </main>
  )
}
