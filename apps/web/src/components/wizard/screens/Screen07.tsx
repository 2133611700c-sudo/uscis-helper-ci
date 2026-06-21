'use client'

import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { HelpTip } from '@/components/wizard/HelpTip'

const T = {
  uk: {
    title: 'Пояснення та докази',
    subtitle: 'Поясніть, чому ви маєте право на повторний пароль. Потрібен хоча б один з трьох варіантів нижче.',
    explanationLabel: 'Письмове пояснення',
    explanationOptional: '(необов\'язково, якщо додаєте документи)',
    explanationHelp: 'Пишіть від першої особи. Вкажіть: коли і як ви в\'їхали до США, за якою програмою (U4U), коли закінчується ваш поточний пароль, і чому ви просите продовження. Не потрібно бути юристом — просто опишіть факти своєї ситуації. Ми надаємо шаблон для початку.',
    explanationPlaceholder: 'Наприклад:\n"Я приїхала до США у 2022 році за програмою U4U. Мій поточний parole діє до [вкажіть дату із I-94]. Прошу продовжити parole для продовження захисту в США та можливості продовжувати роботу."\n\nЗмініть деталі відповідно до вашої ситуації.',
    explanationNote: 'Не вказуйте номери паспорту, I-94, SSN, паролі або банківські реквізити.',
    docsLabel: 'Підтверджуючі документи',
    docsOptional: '(необов\'язково, якщо надаєте письмове пояснення)',
    docsExamples: 'Приклади: поточний I-94, попереднє повідомлення про схвалення паролю, підтвердження громадянства України.',
    attachBtn: '+ Додати файли (PDF, JPG, PNG)',
    evidenceLaterLabel: 'Я зберу підтверджуючі документи та додам їх безпосередньо до заявки USCIS.',
    errorMsg: 'Будь ласка, надайте пояснення, додайте документи, або позначте "Додам докази пізніше".',
    continueBtn: 'Продовжити →',
  },
  ru: {
    title: 'Пояснение и доказательства',
    subtitle: 'Объясните, почему вы имеете право на повторный пароль. Нужен хотя бы один из трёх вариантов ниже.',
    explanationLabel: 'Письменное пояснение',
    explanationOptional: '(необязательно, если прикладываете документы)',
    explanationHelp: 'Пишите от первого лица. Укажите: когда и как вы въехали в США, по какой программе (U4U), когда заканчивается ваш текущий пароль, и почему вы просите продление. Не нужно быть юристом — просто опишите факты своей ситуации. Мы предоставляем шаблон для начала.',
    explanationPlaceholder: 'Например:\n"Я приехала в США в 2022 году по программе U4U. Мой текущий parole действует до [укажите дату из I-94]. Прошу продлить parole для продолжения защиты в США и возможности продолжать работу."\n\nИзмените детали в соответствии с вашей ситуацией.',
    explanationNote: 'Не указывайте номера паспорта, I-94, SSN, пароли или банковские реквизиты.',
    docsLabel: 'Подтверждающие документы',
    docsOptional: '(необязательно, если предоставляете письменное пояснение)',
    docsExamples: 'Примеры: текущий I-94, предыдущее уведомление об одобрении пароля, подтверждение гражданства Украины.',
    attachBtn: '+ Добавить файлы (PDF, JPG, PNG)',
    evidenceLaterLabel: 'Я соберу подтверждающие документы и приложу их непосредственно к заявке USCIS.',
    errorMsg: 'Пожалуйста, предоставьте пояснение, добавьте документы или отметьте "Добавлю доказательства позже".',
    continueBtn: 'Продолжить →',
  },
  en: {
    title: 'Supporting statement & evidence',
    subtitle: 'Explain why you qualify for re-parole. You need at least one of the three options below.',
    explanationLabel: 'Written explanation',
    explanationOptional: '(optional if you attach documents)',
    explanationHelp: 'Write in first person. Include: when and how you entered the US, under which program (U4U), when your current parole expires, and why you are requesting re-parole. You do not need to be a lawyer — just state the facts of your situation. We provide a template to get you started.',
    explanationPlaceholder: 'Example:\n"I came to the United States in 2022 under the U4U program. My current parole expires on [enter the date from your I-94]. I am requesting re-parole to continue my protection in the United States."\n\nAdjust the details to match your situation.',
    explanationNote: 'Do not include passport numbers, I-94 numbers, SSN, passwords, or financial account numbers.',
    docsLabel: 'Supporting documents',
    docsOptional: '(optional if you provide a written explanation)',
    docsExamples: 'Examples: current I-94, previous parole approval notice, proof of Ukrainian citizenship.',
    attachBtn: '+ Attach files (PDF, JPG, PNG)',
    evidenceLaterLabel: 'I will gather supporting documents and attach them directly to my USCIS submission.',
    errorMsg: "Please provide an explanation, attach documents, or check \"I'll attach evidence later\".",
    continueBtn: 'Continue →',
  },
  es: {
    title: 'Declaración y evidencias',
    subtitle: 'Explique por qué califica para re-parole. Necesita al menos una de las tres opciones a continuación.',
    explanationLabel: 'Explicación escrita',
    explanationOptional: '(opcional si adjunta documentos)',
    explanationHelp: 'Escriba en primera persona. Incluya: cuándo y cómo entró a EE.UU., bajo qué programa (U4U), cuándo vence su parole actual y por qué solicita re-parole. No necesita ser abogado — solo describa los hechos de su situación. Le proporcionamos una plantilla para comenzar.',
    explanationPlaceholder: 'Ejemplo:\n"Llegué a los Estados Unidos en 2022 bajo el programa U4U. Mi parole actual vence el [indique la fecha de su I-94]. Solicito re-parole para continuar con mi protección en los Estados Unidos."\n\nAjuste los detalles según su situación.',
    explanationNote: 'No incluya números de pasaporte, I-94, SSN, contraseñas ni datos bancarios.',
    docsLabel: 'Documentos de apoyo',
    docsOptional: '(opcional si proporciona una explicación escrita)',
    docsExamples: 'Ejemplos: I-94 actual, aviso de aprobación de parole anterior, prueba de ciudadanía ucraniana.',
    attachBtn: '+ Adjuntar archivos (PDF, JPG, PNG)',
    evidenceLaterLabel: 'Recopilaré documentos de apoyo y los adjuntaré directamente a mi solicitud de USCIS.',
    errorMsg: 'Por favor proporcione una explicación, adjunte documentos o marque "Adjuntaré evidencia más tarde".',
    continueBtn: 'Continuar →',
  },
} as const

export function Screen07() {
  const { state, setMember, setStep } = useWizard()
  const t = T[state.locale] ?? T.en
  const member = state.members[0]

  const [explanation, setExplanation] = useState(
    member?.manualAnswers?.['explanation'] ?? ''
  )
  const [evidenceLater, setEvidenceLater] = useState(
    member?.manualAnswers?.['evidenceLater'] === 'true'
  )
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [error, setError] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setEvidenceFiles((prev) => [...prev, ...files])
  }

  function removeFile(idx: number) {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const hasExplanation = explanation.trim().length > 0
    const hasEvidence = evidenceFiles.length > 0

    if (!hasExplanation && !hasEvidence && !evidenceLater) {
      setError(t.errorMsg)
      return
    }

    if (member) {
      setMember(member.id, {
        manualAnswers: {
          ...member.manualAnswers,
          explanation: explanation.trim(),
          evidenceLater: String(evidenceLater),
          evidenceFileCount: String(evidenceFiles.length),
        },
      })
    }

    setStep(8)
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

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Explanation */}
        <div>
          <label
            htmlFor="explanation"
            className="block text-sm font-semibold mb-1.5"
            style={{ color: 'var(--text-1)' }}
          >
            {t.explanationLabel}
            <span className="ml-1.5 font-normal text-sm" style={{ color: 'var(--text-3)' }}>
              {t.explanationOptional}
            </span>
            <HelpTip id="tip-explanation" content={t.explanationHelp} />
          </label>
          <textarea
            id="explanation"
            rows={5}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder={t.explanationPlaceholder}
            className="w-full rounded-[8px] text-[16px] resize-y"
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
              padding: '11px 12px',
              minHeight: '100px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            {t.explanationNote}
          </p>
        </div>

        {/* Evidence upload */}
        <div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
            {t.docsLabel}
            <span className="ml-1.5 font-normal text-sm" style={{ color: 'var(--text-3)' }}>
              {t.docsOptional}
            </span>
          </p>
          <p className="text-sm mb-2" style={{ color: 'var(--text-3)' }}>
            {t.docsExamples}
          </p>
          <label
            htmlFor="evidence-upload"
            className="flex cursor-pointer items-center gap-3 rounded-[12px] text-[14px] font-medium transition-all"
            style={{
              border: '1.5px dashed var(--border-strong)',
              color: 'var(--text-3)',
              padding: '14px',
              minHeight: '52px',
            }}
          >
            <span>{t.attachBtn}</span>
            <input
              id="evidence-upload"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>

          {evidenceFiles.length > 0 && (
            <ul className="space-y-1.5 mt-2">
              {evidenceFiles.map((f, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between rounded-[8px] px-3 py-2 text-sm"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                >
                  <span className="truncate max-w-[240px]">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="ml-2 transition-colors"
                    style={{ color: 'var(--text-3)' }}
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Evidence later */}
        <label
          className="flex items-start gap-3 cursor-pointer rounded-[12px] p-3.5 transition-all"
          style={{
            background: evidenceLater ? 'var(--info-bg)' : 'var(--surface)',
            border: `1px solid ${evidenceLater ? 'var(--info-border)' : 'var(--border)'}`,
          }}
        >
          <div
            className="w-[24px] h-[24px] rounded-[6px] flex-shrink-0 flex items-center justify-center mt-0.5"
            style={{
              border: `2px solid ${evidenceLater ? 'var(--primary)' : 'var(--border-strong)'}`,
              background: evidenceLater ? 'var(--primary)' : 'var(--surface)',
            }}
          >
            {evidenceLater && <span className="text-white font-bold text-[14px]">✓</span>}
          </div>
          <input
            type="checkbox"
            checked={evidenceLater}
            onChange={(e) => setEvidenceLater(e.target.checked)}
            className="sr-only"
          />
          <span className="text-sm" style={{ color: 'var(--text-1)' }}>
            {t.evidenceLaterLabel}
          </span>
        </label>

        {error && (
          <div
            className="rounded-[12px] p-3.5"
            style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--error-text)' }}>{error}</p>
          </div>
        )}

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
          {t.continueBtn}
        </button>
      </form>
    </div>
  )
}
