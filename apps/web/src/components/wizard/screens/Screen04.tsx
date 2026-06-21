'use client'

import { useState, useRef } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { MemberTabs } from '@/components/wizard/MemberTabs'

const T = {
  uk: {
    title: 'Завантажте документи',
    subtitle: 'Зробіть фото — ми витягнемо дані. Документи окремі для кожного члена сім\'ї.',
    qualityChip: '💡 Яка якість фото потрібна?',
    required: 'обов\'язково',
    uploaded: '✓ Завантажено',
    takePhoto: '📷 Фото / Завантажити',
    chooseFile: '📂 Файл',
    docLabels: {
      passport: 'Паспорт — сторінка з фото',
      i94: 'Запис I-94 Arrival/Departure',
      parole_notice: 'Попереднє повідомлення про пароль',
      photo: 'Паспортне фото (нещодавнє)',
    },
    docDescs: {
      passport: 'Сторінка з фото: ім\'я, дата народження, номер паспорту.',
      i94: 'Роздрукуйте на i94.cbp.dhs.gov або використайте паперову копію.',
      parole_notice: 'Повідомлення USCIS про ваш поточний термін паролю.',
      photo: '2×2 дюйми, білий фон, зроблено протягом 6 місяців.',
    },
    skipBtn: 'Продовжити без завантаження',
    skipNote: 'Можна завантажити пізніше або надати документи безпосередньо до USCIS.',
    translateTitle: 'Документи не англійською?',
    translateNote: 'Підготуйте чернетку перекладу — ви перевіряєте і підписуєте самостійно.',
    translateBtn: 'Підготувати переклад →',
  },
  ru: {
    title: 'Загрузите документы',
    subtitle: 'Сделайте фото — мы извлечём данные. Документы отдельные для каждого члена семьи.',
    qualityChip: '💡 Какое качество фото нужно?',
    required: 'обязательно',
    uploaded: '✓ Загружено',
    takePhoto: '📷 Фото / Загрузить',
    chooseFile: '📂 Файл',
    docLabels: {
      passport: 'Паспорт — страница с фото',
      i94: 'Запись I-94 Arrival/Departure',
      parole_notice: 'Предыдущее уведомление о пароле',
      photo: 'Фото на документы (недавнее)',
    },
    docDescs: {
      passport: 'Страница с фото: имя, дата рождения, номер паспорта.',
      i94: 'Распечатайте на i94.cbp.dhs.gov или используйте бумажную копию.',
      parole_notice: 'Уведомление USCIS о вашем текущем сроке пароля.',
      photo: '2×2 дюйма, белый фон, сделано в течение 6 месяцев.',
    },
    skipBtn: 'Продолжить без загрузки',
    skipNote: 'Можно загрузить позже или предоставить документы непосредственно в USCIS.',
    translateTitle: 'Документы не на английском?',
    translateNote: 'Подготовьте черновик перевода — вы проверяете и подписываете самостоятельно.',
    translateBtn: 'Подготовить перевод →',
  },
  en: {
    title: 'Upload documents',
    subtitle: 'Take a photo — we auto-extract the data. Documents are separate for each family member.',
    qualityChip: '💡 What photo quality is needed?',
    required: 'required',
    uploaded: '✓ Uploaded',
    takePhoto: '📷 Take Photo / Upload',
    chooseFile: '📂 File',
    docLabels: {
      passport: 'Passport — photo page',
      i94: 'I-94 Arrival/Departure Record',
      parole_notice: 'Previous Parole Notice',
      photo: 'Recent Passport-Style Photo',
    },
    docDescs: {
      passport: 'Photo page with your name, date of birth, and passport number.',
      i94: 'Print from i94.cbp.dhs.gov or use your paper copy.',
      parole_notice: 'USCIS approval notice for your current parole period.',
      photo: '2×2 inch, white background, taken within 6 months.',
    },
    skipBtn: 'Continue without uploading',
    skipNote: 'You can upload later or provide documents directly to USCIS.',
    translateTitle: 'Documents not in English?',
    translateNote: 'Prepare a translation draft — you review and sign it yourself.',
    translateBtn: 'Prepare translation →',
  },
  es: {
    title: 'Subir documentos',
    subtitle: 'Tome una foto — extraemos los datos automáticamente. Documentos separados para cada miembro.',
    qualityChip: '💡 ¿Qué calidad de foto se necesita?',
    required: 'requerido',
    uploaded: '✓ Subido',
    takePhoto: '📷 Tomar foto / Subir',
    chooseFile: '📂 Archivo',
    docLabels: {
      passport: 'Pasaporte — página de foto',
      i94: 'Registro I-94 de Llegada/Salida',
      parole_notice: 'Aviso de Parole Anterior',
      photo: 'Foto tipo pasaporte reciente',
    },
    docDescs: {
      passport: 'Página de foto con nombre, fecha de nacimiento y número de pasaporte.',
      i94: 'Imprima desde i94.cbp.dhs.gov o use su copia en papel.',
      parole_notice: 'Aviso de aprobación de USCIS para su período de parole actual.',
      photo: '2×2 pulgadas, fondo blanco, tomada en los últimos 6 meses.',
    },
    skipBtn: 'Continuar sin subir',
    skipNote: 'Puede subir más tarde o entregar los documentos directamente a USCIS.',
    translateTitle: '¿Documentos no están en inglés?',
    translateNote: 'Prepare un borrador de traducción — usted revisa y firma por su cuenta.',
    translateBtn: 'Preparar traducción →',
  },
} as const

type DocSlot = {
  key: 'passport' | 'i94' | 'parole_notice' | 'photo'
  required: boolean
}

const DOC_SLOTS: DocSlot[] = [
  { key: 'passport', required: true },
  { key: 'i94', required: true },
  { key: 'parole_notice', required: false },
  { key: 'photo', required: false },
]

export function Screen04() {
  const { state, setMember, setStep } = useWizard()
  const { members } = state
  const t = T[state.locale] ?? T.en
  const [activeIndex, setActiveIndex] = useState(0)

  const activeMember = members[activeIndex]
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function handleUpload(docKey: string) {
    if (!activeMember) return
    inputRefs.current[docKey]?.click()
  }

  function handleFileChange(docKey: string) {
    if (!activeMember) return
    setMember(activeMember.id, {
      docs: {
        ...activeMember.docs,
        [docKey]: { storageKey: `mock:${docKey}`, status: 'done' },
      },
    })
  }

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

      {/* Quality tip */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium px-2.5 py-1.5"
        style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', color: 'var(--info-text)' }}
      >
        {t.qualityChip}
      </button>

      <div
        id={`member-panel-${activeIndex}`}
        role="tabpanel"
        aria-label={`Documents for ${activeMember.alias}`}
        className="space-y-2.5"
      >
        {DOC_SLOTS.map((slot) => {
          const doc = activeMember.docs[slot.key]
          const isDone = doc?.status === 'done'

          return (
            <div
              key={slot.key}
              className="rounded-[12px] p-3.5"
              style={{
                background: 'var(--surface)',
                border: isDone ? '1px solid var(--success-border)' : '1px solid var(--border)',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                  {t.docLabels[slot.key]}
                  {slot.required && (
                    <span className="ml-1.5 text-sm font-bold" style={{ color: 'var(--error-text)' }}>
                      {t.required}
                    </span>
                  )}
                </p>
                {isDone && (
                  <span
                    className="text-sm font-bold px-2 py-0.5 rounded-[6px] flex-shrink-0"
                    style={{ background: 'var(--success-bg)', color: 'var(--success-text)' }}
                  >
                    {t.uploaded}
                  </span>
                )}
              </div>
              <p className="text-sm mb-2.5" style={{ color: 'var(--text-3)' }}>
                {t.docDescs[slot.key]}
              </p>
              {!isDone && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpload(slot.key)}
                    className="flex-1 rounded-[8px] text-[14px] font-semibold transition-all active:scale-95"
                    style={{
                      background: 'var(--primary)',
                      color: '#fff',
                      border: 'none',
                      padding: '11px 14px',
                      minHeight: '44px',
                    }}
                  >
                    {t.takePhoto}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpload(slot.key)}
                    className="rounded-[8px] text-[14px] font-semibold transition-all active:scale-95"
                    style={{
                      background: 'var(--surface)',
                      border: '1.5px solid var(--border-strong)',
                      color: 'var(--text-1)',
                      padding: '11px 14px',
                      minHeight: '44px',
                    }}
                  >
                    {t.chooseFile}
                  </button>
                </div>
              )}
              <input
                ref={(el) => { inputRefs.current[slot.key] = el }}
                type="file"
                accept="image/*,.pdf"
                className="sr-only"
                aria-label={`Upload ${t.docLabels[slot.key]}`}
                onChange={() => handleFileChange(slot.key)}
              />
            </div>
          )
        })}
      </div>

      {/* Skip — continue without uploading */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setStep(5)}
          className="w-full rounded-[10px] text-[14px] font-medium transition-all active:scale-[0.98]"
          style={{
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
            border: '1px solid var(--border)',
            padding: '13px 14px',
            minHeight: '48px',
          }}
        >
          {t.skipBtn}
        </button>
        <p className="text-sm mt-1.5 text-center" style={{ color: 'var(--text-3)' }}>
          {t.skipNote}
        </p>
      </div>

      {/* Translation CTA */}
      <div
        className="rounded-[12px] p-3.5 flex items-center justify-between gap-3"
        style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--info-text)' }}>
            📝 {t.translateTitle}
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            {t.translateNote}
          </p>
        </div>
        <a
          href={`/${state.locale}/services/translate-document?from=re-parole-u4u&return=/${state.locale}/services/re-parole-u4u/start`}
          className="text-sm font-semibold flex-shrink-0 rounded-[8px] px-3 py-2 transition-all"
          style={{
            background: 'var(--primary)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          {t.translateBtn}
        </a>
      </div>
    </div>
  )
}
