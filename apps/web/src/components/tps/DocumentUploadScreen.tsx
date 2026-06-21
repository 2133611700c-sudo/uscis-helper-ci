'use client'

/**
 * DocumentUploadScreen — the new wizard step that takes uploaded photos
 * of passport / I-94 / EAD and POSTs them to /api/tps/ocr/extract.
 *
 * Per docs/ux/SELF_REVIEW_PATTERN.md and Taras's "address vs evidence"
 * rule:
 *   - We OCR ONLY identity documents (passport / I-94 / EAD card).
 *   - We do NOT OCR all residence-evidence documents here. That stays
 *     a category-checklist step further in the wizard.
 *
 * Each row in the UI is one document slot. The user can:
 *   - take a photo / pick a file
 *   - retry / replace
 *   - skip entirely (we then fall back to manual data entry later)
 *
 * On success, the parent receives a merged map of TpsExtractedField[]
 * keyed by canonical field name (e.g. family_name, passport_number).
 * If two documents disagree on a field, both extracted values are
 * surfaced separately so the review screen can show the mismatch.
 */

import { useCallback, useRef, useState } from 'react'
import type { TpsExtractedField, TpsDocType, TpsModuleResult } from '@/lib/tps/types'
import { ManualHelpModal } from '@/components/tps/ManualHelpModal'
import { prepareImageForUpload } from '@/lib/upload/prepareImageForUpload'

export type Locale = 'uk' | 'ru' | 'en' | 'es'

type SlotState =
  | { kind: 'empty' }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'ok'; fileName: string; extractedCount: number; manualReview: boolean; fields: TpsExtractedField[]; documentId: string }
  | { kind: 'error'; fileName: string; message: string }

interface DocumentSlot {
  doc_type: TpsDocType
  required: boolean
  state: SlotState
}

interface Props {
  locale: Locale

  /** Fired when all required slots are either filled or explicitly
   *  skipped. Receives the flat list of fields extracted across slots. */
  onComplete: (results: {
    fields: TpsExtractedField[]
    documents: Array<{
      document_id: string
      doc_type: TpsDocType
      filename: string
      manual_review: boolean
    }>
    anyManualReview: boolean
  }) => void

  /** Optional back navigation. */
  onBack?: () => void

  /** Optional "skip OCR, type manually" escape hatch. */
  onSkipAll?: () => void
}

const COPY = {
  uk: {
    title: 'Завантажте документи',
    subtitle: 'Ми прочитаємо ваші документи і пiдставимо дані у форму. Ви потім перевірите кожне поле.',
    privacy: 'Файли видаляються з нашого сервера після формування пакета. Ми не передаємо їх третім особам.',
    slotPassport: 'Паспорт',
    slotPassportHint: 'Підійде закордонний паспорт (синя/червона книжка, MRZ внизу) АБО внутрішній паспорт-книжка України. Сфотографуйте розворот з фото — добре освітлений, без бликів.',
    slotI94: 'I-94 (запис в’їзду в США)',
    slotI94Hint: 'Скриншот або роздруківка з i94.cbp.dhs.gov.',
    slotEad: 'Картка EAD (якщо у вас вже є дозвіл на роботу)',
    slotEadHint: 'Фото обох сторін картки.',
    optional: 'необов’язково',
    btnUpload: 'Вибрати файл',
    btnReplace: 'Замінити',
    btnRetry: 'Повторити',
    uploading: 'Читаємо…',
    okFields: (n: number) => `Прочитано ${n} ${n === 1 ? 'поле' : n < 5 ? 'поля' : 'полів'}`,
    manualReviewBadge: 'потрібна перевірка',
    errorBadge: 'не вдалося прочитати',
    btnNext: 'Далі →',
    btnBack: '← Назад',
    btnSkipAll: 'Я введу дані руками',
    btnNeedHelp: 'Потрібна допомога',
    blockMissing: 'Завантажте паспорт або натисніть «Я введу дані руками».',
  },
  ru: {
    title: 'Загрузите документы',
    subtitle: 'Мы прочитаем ваши документы и подставим данные в форму. Вы потом проверите каждое поле.',
    privacy: 'Файлы удаляются с нашего сервера после формирования пакета. Мы не передаём их третьим лицам.',
    slotPassport: 'Паспорт',
    slotPassportHint: 'Подойдёт загранпаспорт (синяя/красная книжка, MRZ внизу) ИЛИ внутренний украинский паспорт-книжка. Сфотографируйте разворот с фото — хорошо освещённый, без бликов.',
    slotI94: 'I-94 (запись о въезде в США)',
    slotI94Hint: 'Скриншот или распечатка с i94.cbp.dhs.gov.',
    slotEad: 'Карточка EAD (если у вас уже есть разрешение на работу)',
    slotEadHint: 'Фото обеих сторон карточки.',
    optional: 'необязательно',
    btnUpload: 'Выбрать файл',
    btnReplace: 'Заменить',
    btnRetry: 'Повторить',
    uploading: 'Читаем…',
    okFields: (n: number) => `Прочитано ${n} ${n === 1 ? 'поле' : n < 5 ? 'поля' : 'полей'}`,
    manualReviewBadge: 'нужна проверка',
    errorBadge: 'не удалось прочитать',
    btnNext: 'Дальше →',
    btnBack: '← Назад',
    btnSkipAll: 'Я введу данные руками',
    btnNeedHelp: 'Нужна помощь',
    blockMissing: 'Загрузите паспорт или нажмите «Я введу данные руками».',
  },
  en: {
    title: 'Upload your documents',
    subtitle: 'We will read your documents and prefill the form. You will review every field after.',
    privacy: 'Files are deleted from our server after the packet is generated. We do not share them with third parties.',
    slotPassport: 'Passport',
    slotPassportHint: 'Either an international passport (booklet with MRZ on the bottom) OR the internal Ukrainian passport-book. Photograph the page with your photo — well lit, no glare.',
    slotI94: 'I-94 (US entry record)',
    slotI94Hint: 'Screenshot or printout from i94.cbp.dhs.gov.',
    slotEad: 'EAD card (if you already have a work permit)',
    slotEadHint: 'Photo of both sides.',
    optional: 'optional',
    btnUpload: 'Choose file',
    btnReplace: 'Replace',
    btnRetry: 'Retry',
    uploading: 'Reading…',
    okFields: (n: number) => `${n} field${n === 1 ? '' : 's'} read`,
    manualReviewBadge: 'needs review',
    errorBadge: 'could not read',
    btnNext: 'Next →',
    btnBack: '← Back',
    btnSkipAll: 'I will type the data myself',
    btnNeedHelp: 'I need help',
    blockMissing: 'Upload your passport or press "I will type the data myself".',
  },
  es: {
    title: 'Suba sus documentos',
    subtitle: 'Leeremos sus documentos y prellenaremos el formulario. Usted revisará cada campo después.',
    privacy: 'Los archivos se eliminan de nuestro servidor después de generar el paquete. No los compartimos con terceros.',
    slotPassport: 'Pasaporte',
    slotPassportHint: 'Sirve un pasaporte internacional (con MRZ al pie) O el pasaporte ucraniano interno (libro). Fotografíe la página con su foto — bien iluminada, sin reflejos.',
    slotI94: 'I-94 (registro de entrada a EE.UU.)',
    slotI94Hint: 'Captura o impresión de i94.cbp.dhs.gov.',
    slotEad: 'Tarjeta EAD (si ya tiene permiso de trabajo)',
    slotEadHint: 'Foto de ambos lados.',
    optional: 'opcional',
    btnUpload: 'Elegir archivo',
    btnReplace: 'Reemplazar',
    btnRetry: 'Reintentar',
    uploading: 'Leyendo…',
    okFields: (n: number) => `${n} campo${n === 1 ? '' : 's'} leído${n === 1 ? '' : 's'}`,
    manualReviewBadge: 'necesita revisión',
    errorBadge: 'no se pudo leer',
    btnNext: 'Siguiente →',
    btnBack: '← Atrás',
    btnSkipAll: 'Ingresaré los datos a mano',
    btnNeedHelp: 'Necesito ayuda',
    blockMissing: 'Suba su pasaporte o presione "Ingresaré los datos a mano".',
  },
} as const

/**
 * Localized error messages for the image-quality gate. Maps server-side
 * preprocess error codes ('too_small' / 'too_blurry' / 'corrupt_image' /
 * 'unsupported_file_type') to a sentence we can show the user. Designed
 * for the 60+ smartphone user — plain language, no jargon, ends with
 * a concrete next step.
 */
function qualityMessageFor(
  code: 'too_small' | 'too_blurry' | 'corrupt_image' | 'unsupported_file_type',
  locale: Locale,
): string {
  const MSG: Record<typeof code, Record<Locale, string>> = {
    too_small: {
      uk: 'Фото замале. Зробіть знімок ближче й чіткіше і завантажте ще раз.',
      ru: 'Фото слишком маленькое. Сделайте снимок ближе и чётче и загрузите снова.',
      en: 'The photo is too small. Take a closer, sharper picture and upload again.',
      es: 'La foto es demasiado pequeña. Tome una foto más cercana y nítida e intente de nuevo.',
    },
    too_blurry: {
      uk: 'Фото нечітке. Сфотографуйте при гарному світлі без рук і завантажте ще раз.',
      ru: 'Фото размытое. Сфотографируйте при хорошем свете и без рук, потом загрузите снова.',
      en: 'The photo is blurry. Try again in good light, holding the phone steady.',
      es: 'La foto está borrosa. Vuelva a intentarlo con buena luz y sin mover el teléfono.',
    },
    corrupt_image: {
      uk: 'Не вдалося прочитати файл. Спробуйте інший знімок (JPEG або PNG).',
      ru: 'Не получилось прочитать файл. Попробуйте другой снимок (JPEG или PNG).',
      en: 'We could not read the file. Try another picture (JPEG or PNG).',
      es: 'No pudimos leer el archivo. Pruebe con otra foto (JPEG o PNG).',
    },
    unsupported_file_type: {
      uk: 'Цей тип файлу ще не підтримується. Зробіть фото документа і завантажте JPEG або PNG.',
      ru: 'Этот тип файла пока не поддерживается. Сфотографируйте документ и загрузите JPEG или PNG.',
      en: 'This file type is not supported yet. Take a photo of the document and upload as JPEG or PNG.',
      es: 'Este tipo de archivo aún no es compatible. Tome una foto del documento y súbala como JPEG o PNG.',
    },
  }
  return MSG[code]?.[locale] ?? MSG[code]?.en ?? 'Could not read the image.'
}

/**
 * Localized human-readable message for the case where OCR ran successfully
 * (HTTP 200) but the per-document module did NOT match. We surface the
 * module's match_reason and first warning, but map them to plain-language
 * messages in the user's locale — the raw English string like "Could not
 * locate a TD3 MRZ on this document." is useless for a 60-year-old user.
 *
 * Map keys are the match_reason strings emitted by the passport / passport-
 * booklet / i94 / ead modules. Unknown reasons fall back to a generic
 * "we couldn't read this — try another photo or another document" line.
 */
function moduleFailureMessage(
  matchReason: string,
  warnings: string[] | undefined,
  docType: TpsDocType,
  locale: Locale,
): string {
  const MSG: Record<string, Record<Locale, string>> = {
    // Passport TD3 path could not locate MRZ AND the booklet path also did
    // not find Ukrainian-booklet labels. Most likely user uploaded the
    // wrong page (e.g. visa or stamps page) or a non-passport document.
    mrz_not_located: {
      uk: 'Не вдалось знайти машиночитану зону (MRZ) на цьому фото. Сфотографуйте розворот з фото та двома рядками великих літер унизу — або завантажте внутрішній паспорт-книжку.',
      ru: 'Не удалось найти машиночитаемую зону (MRZ) на этом фото. Сфотографируйте разворот с фото и двумя строками заглавных букв внизу — или загрузите внутренний паспорт-книжку.',
      en: 'Could not find the machine-readable zone (MRZ) on this photo. Use the page with the photo and the two lines of capital letters at the bottom — or upload your internal Ukrainian passport-book.',
      es: 'No se encontró la zona de lectura automática (MRZ). Use la página con foto y las dos líneas de letras mayúsculas al pie — o suba el pasaporte interno ucraniano.',
    },
    // Booklet path was tried (after TD3 failed) and ALSO did not match —
    // signals (Cyrillic "ПАСПОРТ ГРОМАДЯНИНА УКРАЇНИ" etc.) absent.
    booklet_signals_missing: {
      uk: 'Не схоже на український паспорт. Перевірте: ви сфотографували сторінку з вашими даними? Якщо у вас є тільки внутрішній паспорт — сфотографуйте розворот з фото та підписом.',
      ru: 'Не похоже на украинский паспорт. Проверьте: вы сфотографировали страницу со своими данными? Если у вас только внутренний паспорт — сфотографируйте разворот с фото и подписью.',
      en: 'This does not look like a Ukrainian passport. Make sure you photographed the page with your personal details — for an internal passport, use the spread with your photo and signature.',
      es: 'Esto no parece ser un pasaporte ucraniano. Asegúrese de fotografiar la página con sus datos personales.',
    },
    // Booklet matched (signals present) but we could not parse a single
    // critical field from it. Photo was probably blurry or partially
    // cropped.
    booklet_no_fields_extracted: {
      uk: 'Ми побачили український паспорт, але не змогли прочитати поля. Зробіть чіткіше фото при гарному освітленні без рук.',
      ru: 'Мы увидели украинский паспорт, но не смогли прочитать поля. Сделайте чёткое фото при хорошем освещении без дрожания.',
      en: 'We detected a Ukrainian passport but could not read the field values. Try again with a clearer, well-lit photo.',
      es: 'Detectamos un pasaporte ucraniano pero no pudimos leer los campos. Pruebe con una foto más clara.',
    },
    // I-94 module: layout not detected.
    i94_layout_not_detected: {
      uk: 'Не схоже на запис I-94. Завантажте скріншот або PDF з i94.cbp.dhs.gov.',
      ru: 'Не похоже на запись I-94. Загрузите скриншот или PDF с i94.cbp.dhs.gov.',
      en: 'This does not look like an I-94. Upload a screenshot or PDF from i94.cbp.dhs.gov.',
      es: 'Esto no parece ser un I-94. Suba una captura o PDF de i94.cbp.dhs.gov.',
    },
    // EAD module: layout not detected.
    ead_layout_not_detected: {
      uk: 'Не схоже на картку EAD. Сфотографуйте обидві сторони картки USCIS.',
      ru: 'Не похоже на карточку EAD. Сфотографируйте обе стороны карточки USCIS.',
      en: 'This does not look like an EAD card. Photograph both sides of the USCIS card.',
      es: 'Esto no parece una tarjeta EAD. Fotografíe ambas caras de la tarjeta de USCIS.',
    },
  }

  // Try match_reason first, then a couple of well-known warning shapes.
  const fromReason = MSG[matchReason]?.[locale]
  if (fromReason) return fromReason

  // Generic per-doc-type fallback. Only the doc types the upload screen
  // currently exposes — passport / i94 / ead — get a tailored message; any
  // future doc type falls through to a generic line.
  const GENERIC: Partial<Record<TpsDocType, Record<Locale, string>>> = {
    passport: {
      uk: 'Не вдалося прочитати паспорт із цього фото. Спробуйте інший знімок або введіть дані руками.',
      ru: 'Не получилось прочитать паспорт с этого фото. Попробуйте другой снимок или введите данные руками.',
      en: 'We could not read the passport from this photo. Try another picture or enter the data manually.',
      es: 'No pudimos leer el pasaporte de esta foto. Pruebe con otra foto o ingrese los datos a mano.',
    },
    i94: {
      uk: 'Не вдалося прочитати I-94 із цього файла.',
      ru: 'Не получилось прочитать I-94 из этого файла.',
      en: 'Could not read the I-94 from this file.',
      es: 'No pudimos leer el I-94 de este archivo.',
    },
    ead: {
      uk: 'Не вдалося прочитати картку EAD з цього фото.',
      ru: 'Не получилось прочитать карточку EAD с этого фото.',
      en: 'Could not read the EAD card from this photo.',
      es: 'No pudimos leer la tarjeta EAD de esta foto.',
    },
  }
  const FALLBACK: Record<Locale, string> = {
    uk: 'Не вдалося прочитати документ.',
    ru: 'Не получилось прочитать документ.',
    en: 'Could not read the document.',
    es: 'No pudimos leer el documento.',
  }
  return GENERIC[docType]?.[locale] ?? FALLBACK[locale]
}

export function DocumentUploadScreen({ locale, onComplete, onBack, onSkipAll }: Props) {
  const c = COPY[locale]
  const [slots, setSlots] = useState<DocumentSlot[]>([
    { doc_type: 'passport', required: true, state: { kind: 'empty' } },
    { doc_type: 'i94',      required: false, state: { kind: 'empty' } },
    { doc_type: 'ead',      required: false, state: { kind: 'empty' } },
  ])
  // CB.3 — Manual fallback. Opens ManualHelpModal which POSTs to
  // /api/tps/manual-review. The reason code picks 'image_quality_failed'
  // when any slot has hit the image-quality gate, otherwise the generic
  // 'user_requested_human_help'. No PII is sent — only email + stage label.
  const [helpOpen, setHelpOpen] = useState(false)

  const slotMeta = (t: TpsDocType) => {
    if (t === 'passport') return { title: c.slotPassport, hint: c.slotPassportHint }
    if (t === 'i94')      return { title: c.slotI94,      hint: c.slotI94Hint }
    if (t === 'ead')      return { title: c.slotEad,      hint: c.slotEadHint }
    return { title: t, hint: '' }
  }

  const updateSlot = useCallback((doc_type: TpsDocType, next: SlotState) => {
    setSlots((prev) => prev.map((s) => (s.doc_type === doc_type ? { ...s, state: next } : s)))
  }, [])

  const handleFile = useCallback(
    async (doc_type: TpsDocType, file: File) => {
      updateSlot(doc_type, { kind: 'uploading', fileName: file.name })
      try {
        const fd = new FormData()
        const prepared = await prepareImageForUpload(file)
        fd.append('file', prepared.blob, prepared.name)
        fd.append('doc_type_hint', doc_type)
        const res = await fetch('/api/tps/ocr/extract', { method: 'POST', body: fd })
        const data = (await res.json()) as {
          ok?: boolean
          error?: string
          quality_error?: {
            code: 'too_small' | 'too_blurry' | 'corrupt_image' | 'unsupported_file_type'
            message: string
          }
          module?: TpsModuleResult
          document_id?: string
        }
        if (!res.ok || !data.ok) {
          // Image-quality gate failures (422) deserve a localized,
          // human-readable message — not a "HTTP 422" mystery. Map the
          // server `code` to the user's locale.
          let msg = data.error ?? `HTTP ${res.status}`
          if (data.quality_error) {
            msg = qualityMessageFor(data.quality_error.code, locale)
          }
          updateSlot(doc_type, { kind: 'error', fileName: file.name, message: msg })
          return
        }
        // Use `mod` instead of `module` — Next.js lint forbids reassigning
        // the CommonJS `module` global (no-assign-module-variable).
        const mod = data.module
        if (!mod || !mod.matched) {
          updateSlot(doc_type, {
            kind: 'error',
            fileName: file.name,
            // Map module match_reason to a localized, actionable message.
            // The raw English warnings ("Could not locate a TD3 MRZ on
            // this document.") are useless for a Russian-speaking user.
            message: moduleFailureMessage(
              mod?.match_reason ?? '',
              mod?.warnings,
              doc_type,
              locale,
            ),
          })
          return
        }
        updateSlot(doc_type, {
          kind: 'ok',
          fileName: file.name,
          extractedCount: mod.fields.length,
          manualReview: mod.manual_review_required,
          fields: mod.fields,
          documentId: data.document_id ?? `doc_${Date.now()}`,
        })
      } catch (e) {
        updateSlot(doc_type, {
          kind: 'error',
          fileName: file.name,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [updateSlot, locale],
  )

  // Required slot = passport. Block forward navigation until it is ok.
  const passport = slots.find((s) => s.doc_type === 'passport')!
  const canProceed = passport.state.kind === 'ok'

  const handleNext = useCallback(() => {
    const okSlots = slots.filter((s): s is DocumentSlot & { state: Extract<SlotState, { kind: 'ok' }> } => s.state.kind === 'ok')
    const fields = okSlots.flatMap((s) => s.state.fields)
    const documents = okSlots.map((s) => ({
      document_id: s.state.documentId,
      doc_type: s.doc_type,
      filename: s.state.fileName,
      manual_review: s.state.manualReview,
    }))
    const anyManualReview = okSlots.some((s) => s.state.manualReview)
    onComplete({ fields, documents, anyManualReview })
  }, [slots, onComplete])

  return (
    <section
      data-testid="tps-doc-upload"
      style={{
        padding: '18px 20px 24px',
        maxWidth: 640,
        margin: '0 auto',
      }}
    >
      <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>{c.title}</h2>
      <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 14 }}>{c.subtitle}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {slots.map((slot) => {
          const meta = slotMeta(slot.doc_type)
          return <SlotRow key={slot.doc_type} c={c} meta={meta} slot={slot} onFile={(f) => void handleFile(slot.doc_type, f)} />
        })}
      </div>

      <p
        style={{
          fontSize: 11,
          color: 'var(--text-3)',
          lineHeight: 1.5,
          padding: '10px 12px',
          background: 'var(--surface-2)',
          borderRadius: 8,
          marginBottom: 18,
        }}
      >
        🔒 {c.privacy}
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: 15,
              fontWeight: 700,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              cursor: 'pointer',
            }}
          >
            {c.btnBack}
          </button>
        )}
        <button
          type="button"
          data-testid="upload-next"
          disabled={!canProceed}
          aria-disabled={!canProceed}
          onClick={canProceed ? handleNext : undefined}
          style={{
            flex: onBack ? 2 : 1,
            padding: '14px 18px',
            fontSize: 16,
            fontWeight: 800,
            borderRadius: 12,
            border: 'none',
            background: canProceed ? 'var(--success)' : 'var(--surface-2)',
            color: canProceed ? '#fff' : 'var(--text-3)',
            cursor: canProceed ? 'pointer' : 'not-allowed',
            opacity: canProceed ? 1 : 0.55,
            boxShadow: canProceed ? '0 3px 14px rgba(22,163,74,0.30)' : 'none',
          }}
        >
          {c.btnNext}
        </button>
      </div>

      {!canProceed && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 8 }}>{c.blockMissing}</p>
      )}

      {onSkipAll && (
        <button
          type="button"
          data-testid="upload-skip-all"
          onClick={onSkipAll}
          style={{
            display: 'block',
            margin: '14px auto 0',
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-3)',
            fontSize: 13,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          {c.btnSkipAll}
        </button>
      )}

      {/* CB.3 — Manual fallback. Always available so a stuck user is
          never trapped. Reason code defaults to user_requested_human_help. */}
      <button
        type="button"
        data-testid="tps-upload-need-help"
        onClick={() => setHelpOpen(true)}
        style={{
          display: 'block',
          margin: '6px auto 0',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-3)',
          fontSize: 13,
          textDecoration: 'underline',
          cursor: 'pointer',
        }}
      >
        {c.btnNeedHelp}
      </button>

      <ManualHelpModal
        open={helpOpen}
        locale={locale}
        stage="upload"
        reason="user_requested_human_help"
        onClose={() => setHelpOpen(false)}
      />
    </section>
  )
}

/* ── Internal: single slot row ─────────────────────────────────────────── */

function SlotRow({
  c,
  meta,
  slot,
  onFile,
}: {
  // Union of every locale's COPY shape — TypeScript can't keep literal
  // types stable across locales, so widen to the structural shape.
  c: (typeof COPY)[Locale]
  meta: { title: string; hint: string }
  slot: DocumentSlot
  onFile: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onChoose = () => inputRef.current?.click()
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
  }

  let badge: { text: string; color: string; bg: string } | null = null
  let action: string = c.btnUpload
  if (slot.state.kind === 'uploading') action = c.uploading
  if (slot.state.kind === 'error') {
    action = c.btnRetry
    badge = { text: c.errorBadge, color: 'var(--danger-text, #991b1b)', bg: 'var(--danger-bg, #fee2e2)' }
  }
  if (slot.state.kind === 'ok') {
    action = c.btnReplace
    badge = slot.state.manualReview
      ? { text: c.manualReviewBadge, color: 'var(--warning-text, #92400e)', bg: 'var(--warning-bg, #fef3c7)' }
      : { text: c.okFields(slot.state.extractedCount), color: 'var(--success-text, #166534)', bg: 'var(--success-bg, #dcfce7)' }
  }

  return (
    <div
      data-testid={`upload-slot-${slot.doc_type}`}
      style={{
        padding: '14px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        borderRadius: 12,
      }}
    >
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
        {meta.title}
        {!slot.required && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginLeft: 8 }}>
            ({c.optional})
          </span>
        )}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.4 }}>{meta.hint}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          disabled={slot.state.kind === 'uploading'}
          onClick={onChoose}
          style={{
            padding: '10px 14px',
            background: 'var(--surface-2)',
            color: 'var(--text-1)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: slot.state.kind === 'uploading' ? 'wait' : 'pointer',
            opacity: slot.state.kind === 'uploading' ? 0.6 : 1,
          }}
        >
          {action}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onChange}
          style={{ display: 'none' }}
        />
        {badge && (
          <span
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              color: badge.color,
              background: badge.bg,
              borderRadius: 999,
            }}
          >
            {badge.text}
          </span>
        )}
      </div>

      {slot.state.kind === 'error' && (
        <p style={{ fontSize: 12, color: 'var(--danger-text, #991b1b)', marginTop: 6 }}>
          {slot.state.message}
        </p>
      )}
    </div>
  )
}
