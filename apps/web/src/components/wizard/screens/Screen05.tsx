'use client'

import { useState, useEffect } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { MemberTabs } from '@/components/wizard/MemberTabs'
import { SupportBlock } from '@/components/wizard/SupportBlock'

const T = {
  uk: {
    title: 'Перевірка документів',
    subtitle: 'Перевіряємо завантажені файли для кожного заявника.',
    analyzing: 'Аналізуємо… ⏳',
    analyzingNote: 'Витягуємо дані з ваших документів',
    noDocs: (alias: string) => `Для "${alias}" документи не завантажено`,
    noDocsNote: 'Це нормально — ви заповните дані безпосередньо у формі I-131. Перейдіть далі, і ми проведемо вас через кожне обов\'язкове поле.',
    continueManual: 'Продовжити — заповнити вручну →',
    translateHint: '📝 Документи не англійською? Замовте переклад →',
    allRecognized: '✓ Усі документи розпізнано',
    extractedNote: 'Ми витягли дані з ваших документів. Тепер перевірте кожне поле.',
    futureNote: 'Автоматичне заповнення полів — у наступному оновленні.',
    uploadedBadge: '✓ Завантажено',
    continueBtn: 'Продовжити →',
  },
  ru: {
    title: 'Проверка документов',
    subtitle: 'Проверяем загруженные файлы для каждого заявителя.',
    analyzing: 'Анализируем… ⏳',
    analyzingNote: 'Извлекаем данные из ваших документов',
    noDocs: (alias: string) => `Для "${alias}" документы не загружены`,
    noDocsNote: 'Это нормально — вы заполните данные непосредственно в форме I-131. Двигайтесь дальше, и мы проведём вас через каждое обязательное поле.',
    continueManual: 'Продолжить — заполнить вручную →',
    translateHint: '📝 Документы не на английском? Заказать перевод →',
    allRecognized: '✓ Все документы распознаны',
    extractedNote: 'Мы извлекли данные из ваших документов. Теперь проверьте каждое поле.',
    futureNote: 'Автоматическое заполнение полей — в следующем обновлении.',
    uploadedBadge: '✓ Загружено',
    continueBtn: 'Продолжить →',
  },
  en: {
    title: 'Reviewing your documents',
    subtitle: 'Checking uploaded files for each applicant.',
    analyzing: 'Analyzing… ⏳',
    analyzingNote: 'Extracting data from your documents',
    noDocs: (alias: string) => `No documents uploaded for "${alias}"`,
    noDocsNote: "That's fine — you'll fill in the details directly on Form I-131. Skip ahead and we'll guide you through every required field.",
    continueManual: 'Continue — fill in details manually →',
    translateHint: '📝 Documents not in English? Order translation →',
    allRecognized: '✓ All documents recognized',
    extractedNote: "We extracted data from your documents. Now you'll verify each field.",
    futureNote: 'Automated field extraction available in a future update.',
    uploadedBadge: '✓ Uploaded',
    continueBtn: 'Continue →',
  },
  es: {
    title: 'Revisando sus documentos',
    subtitle: 'Verificando archivos subidos para cada solicitante.',
    analyzing: 'Analizando… ⏳',
    analyzingNote: 'Extrayendo datos de sus documentos',
    noDocs: (alias: string) => `No se subieron documentos para "${alias}"`,
    noDocsNote: 'No hay problema — completará los datos directamente en el Formulario I-131. Continúe y lo guiaremos en cada campo requerido.',
    continueManual: 'Continuar — completar manualmente →',
    translateHint: '📝 ¿Documentos no están en inglés? Solicitar traducción →',
    allRecognized: '✓ Todos los documentos reconocidos',
    extractedNote: 'Extrajimos datos de sus documentos. Ahora verifique cada campo.',
    futureNote: 'Extracción automática de campos disponible en una actualización futura.',
    uploadedBadge: '✓ Subido',
    continueBtn: 'Continuar →',
  },
} as const

export function Screen05() {
  const { state, setStep } = useWizard()
  const { members } = state
  const t = T[state.locale] ?? T.en
  const [activeIndex, setActiveIndex] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)

  const activeMember = members[activeIndex]

  const hasUploadedDocs =
    activeMember != null &&
    Object.values(activeMember.docs).some((d) => d.status === 'done')

  useEffect(() => {
    if (!hasUploadedDocs) {
      setAnalyzing(false)
      return
    }
    setAnalyzing(true)
    const timer = setTimeout(() => setAnalyzing(false), 2000)
    return () => clearTimeout(timer)
  }, [activeIndex, hasUploadedDocs])

  if (!activeMember) return null

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

      <MemberTabs activeIndex={activeIndex} onChange={setActiveIndex} />

      <div
        id={`member-panel-${activeIndex}`}
        role="tabpanel"
        aria-label={`Review for ${activeMember.alias}`}
        className="space-y-3"
      >
        {/* Spinner while analyzing */}
        {analyzing && (
          <div
            className="rounded-[12px] p-6 text-center"
            style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}
          >
            <div
              className="w-[32px] h-[32px] rounded-full mx-auto mb-3 animate-spin"
              style={{
                border: '3px solid var(--info-border)',
                borderTopColor: 'var(--primary)',
              }}
              aria-label="Analyzing"
            />
            <p className="text-[14px] font-medium" style={{ color: 'var(--info-text)' }}>
              {t.analyzing}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              {t.analyzingNote}
            </p>
          </div>
        )}

        {/* No uploads */}
        {!analyzing && !hasUploadedDocs && (
          <>
            <div
              className="rounded-[12px] p-4"
              style={{
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border)',
              }}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-[20px] flex-shrink-0">📄</span>
                <div>
                  <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--warning-text)' }}>
                    {t.noDocs(activeMember.alias)}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--warning-text)' }}>
                    {t.noDocsNote}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(6)}
              className="w-full rounded-[10px] text-[15px] font-bold transition-all active:scale-[0.98]"
              style={{
                background: 'var(--success)',
                color: '#fff',
                border: 'none',
                padding: '14px',
                minHeight: '52px',
              }}
            >
              {t.continueManual}
            </button>

            {/* Translation CTA */}
            <a
              href={`/${state.locale}/services/translate-document`}
              className="block w-full text-center rounded-[10px] text-[14px] font-medium transition-all"
              style={{
                background: 'var(--info-bg)',
                border: '1px solid var(--info-border)',
                color: 'var(--info-text)',
                padding: '12px 14px',
                textDecoration: 'none',
              }}
            >
              {t.translateHint}
            </a>
          </>
        )}

        {/* Uploads done */}
        {!analyzing && hasUploadedDocs && (
          <>
            <div
              className="rounded-[12px] p-4"
              style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}
            >
              <p
                className="text-sm font-semibold uppercase tracking-wide mb-3"
                style={{ color: 'var(--success-text)', letterSpacing: '0.6px' }}
              >
                {t.allRecognized}
              </p>
              <p className="text-sm mb-3 leading-relaxed" style={{ color: 'var(--success-text)' }}>
                {t.extractedNote}
              </p>
              {Object.entries(activeMember.docs)
                .filter(([, d]) => d.status === 'done')
                .map(([docKey]) => (
                  <div
                    key={docKey}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span className="capitalize" style={{ color: 'var(--text-2)' }}>
                      {docKey.replace(/_/g, ' ')}
                    </span>
                    <span className="font-bold text-sm" style={{ color: 'var(--success-text)' }}>
                      {t.uploadedBadge}
                    </span>
                  </div>
                ))}
              <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>
                {t.futureNote}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStep(6)}
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
          </>
        )}
      </div>

      <SupportBlock locale={state.locale} />
    </div>
  )
}
