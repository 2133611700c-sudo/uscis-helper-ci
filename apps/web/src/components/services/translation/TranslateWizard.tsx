'use client'

/**
 * TranslateWizard — Ukrainian document translation flow for USCIS-style submission.
 *
 * Faithful port of the owner-provided prototype (navy + gold premium design,
 * 7-screen flow, doc-type-FIRST, processing-with-real-OCR, preview-BEFORE-pay
 * per v5 §21, side-by-side translation, watermarked certificate preview).
 *
 * Backend kept identical to the previous wizard so deployed routes still work:
 *   /api/translation/vision-extract  — REAL docintel.readDocument (Gemini + KMU-55)
 *   /api/stripe/checkout            — real Stripe checkout (basic plan = $14.99)
 *   /api/translation/generate-pdf   — Stripe-verified PDF generation (payment gate)
 *
 * CSS is fully scoped under `.tw-root` so the prototype's body/header/h1 rules
 * never bleed into the rest of the site.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { isGarbageValue } from '@uscis-helper/knowledge'
import { getHardUnresolvedReviewFields, getSoftReviewFields } from '@/lib/translation/reviewGate'
import { ukrLabelFor } from './translationFieldLabels'
import { prepareImageForUpload } from '@/lib/upload/prepareImageForUpload'
import { rotateImage90 } from '@/lib/upload/autoRotate'
import { sanitizeFieldListForStorage, isDraftExpired } from '@/lib/storage/persistedDraftPolicy'
import {
  isLedgerClientEnabled,
  saveDraftToServer,
  loadDraftFromServer,
  clearServerDraft,
} from '@/lib/v1/wizardLedgerClient'

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen = 1 | 2 | 3 | 4 | 5 | 6 | 7
type DocTypeChoice =
  | 'passport_internal'
  | 'passport_foreign'
  | 'birth'
  | 'marriage'
  | 'divorce'
  | 'id_card'
  | 'military'
  | 'other'
type Locale = 'en' | 'uk' | 'ru' | 'es'

// Phase 2.1a (feat/one-brain-gemini-core): try auto-reading hard-case docs
// (birth/marriage) behind a flag. OFF (default) → manual ticket, same as before.
// ON → vision-extract is called; all fields come back review_required=true (hard-case
// policy); user must confirm each field before payment; 0-field fallback → manual path.
const HARD_CASE_AUTOREAD = process.env.NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED === '1'
// OPERATOR FLOW (PIVOT 2026-06-11): a paid order goes to the operator queue and
// the customer is redirected to /order/{id} — they never confirm fields or
// download the PDF themselves. OFF ⇒ the legacy self-serve screens (7+).
const OPERATOR_FLOW = process.env.NEXT_PUBLIC_NEW_OPERATOR_FLOW_ENABLED === '1'

interface DocTypeMeta {
  id: DocTypeChoice
  icon: string
  popular?: boolean
  /** Whether docintel has a validated module — drives auto-vs-manual routing (payment gate). */
  auto: boolean
  /**
   * Phase 2.1a: try to auto-read via vision-extract even when `auto=false`.
   * When the API returns 0 fields the flow falls back to the manual path (user can pay
   * immediately, specialist handles it). When fields are returned they all carry
   * review_required=true (hard-case policy); the user must confirm each one.
   */
  autoread?: boolean
  /** docintel registry id (lib/docintel/documentRegistry.ts). */
  registryId: string | null
}

const DOC_TYPES: DocTypeMeta[] = [
  { id: 'passport_internal', icon: '🇺🇦', popular: true, auto: true,                          registryId: 'ua_internal_passport_booklet' },
  { id: 'passport_foreign',  icon: '✈️',                  auto: true,                          registryId: 'ua_international_passport' },
  { id: 'birth',             icon: '👶',                  auto: false, autoread: HARD_CASE_AUTOREAD, registryId: 'ua_birth_certificate' },
  { id: 'marriage',          icon: '💍',                  auto: false, autoread: HARD_CASE_AUTOREAD, registryId: 'ua_marriage_certificate' },
  { id: 'divorce',           icon: '📜',                  auto: false, autoread: HARD_CASE_AUTOREAD, registryId: 'ua_divorce_certificate' },
  { id: 'id_card',           icon: '💳',                  auto: true,                          registryId: 'ua_id_card' },
  { id: 'military',          icon: '🪖',                  auto: false, autoread: true,              registryId: 'ua_military_id' },
  { id: 'other',             icon: '📄',                  auto: false,                         registryId: null },
]

interface ExtractedField {
  field: string
  value: string | null
  raw_cyrillic: string | null
  confidence: number
  kind: string
  review_required?: boolean
  /** ENSEMBLE_DATE: a second engine's reading of this date when the two disagree. */
  ensemble_candidate?: string | null
  review_reasons?: string[]
}

interface DraftState {
  screen: Screen
  selectedDocType: DocTypeChoice | null
  extractedFields: ExtractedField[]
  // CANONICAL_CONTINUITY: the canonical_document_id returned by vision-extract for
  // THIS upload, carried across the Stripe round-trip so generate-pdf (which runs
  // on the post-payment success screen) can resend it. null when extract did not
  // persist a canonical (shadow persist failure or continuity=off) — never fabricated.
  canonicalDocumentId?: string | null
  // file is intentionally NOT persisted (cannot serialize a Blob)
  // PII CONTAINMENT (Phase A): write timestamp for the 24h TTL discard on load.
  savedAt?: string
}

const DRAFT_KEY = 'tw:v2:draft'

// ─── i18n (RU primary — prototype's language; EN/UK/ES kept short and accurate) ──
const T = {
  ru: {
    badge: '🔒 Безопасно',
    legal: 'Мы не являемся адвокатами. Услуга — информационная помощь по 8 CFR §103.2(b)(3).',
    back: '← Назад',
    next: 'Далее →',
    start_over: '↺ Начать заново',
    start_over_confirm: 'Начать заново? Загруженные файлы и распознанные данные будут удалены.',
    // Screen 1 — Welcome
    s1_title_1: 'Перевод', s1_title_2: 'документов',
    s1_subtitle: 'Загрузите фото документа — мы переведём на английский и оформим официальный сертификат для USCIS',
    s1_card_time_t: '5–10 минут', s1_card_time_s: 'Для паспорта Украины',
    s1_card_format_t: 'Официальный формат USCIS', s1_card_format_s: 'Сертификация по 8 CFR §103.2(b)(3)',
    s1_card_seefirst_t: 'Сначала видите — потом платите', s1_card_seefirst_s: 'Оплата только после проверки перевода',
    s1_cta: 'Начать перевод →',
    s1_secure: 'Ваши документы в безопасности.',
    s1_secure_s: 'Мы не храним оригиналы после обработки. Всё зашифровано.',
    // Screen 2 — Doc type
    s2_title_1: 'Какой документ', s2_title_2: 'нужно перевести?',
    s2_subtitle: 'Выберите один документ',
    s2_price_block_price: 'Черновик перевода — от $15',
    s2_price_block_tier: 'Один документ · Оплата после проверки перевода',
    s2_price_block_what: 'Вы получите черновик перевода на английском + шаблон самоподтверждения (8 CFR §103.2(b)(3)). Вы проверяете, исправляете и подписываете.',
    s2_price_block_legal: 'Не юридическая фирма. Информационная помощь — не юридическая консультация.',
    s2_popular: 'Самый частый',
    s2_manual_note: 'Этот тип документа обработает наш специалист. Срок: 1–2 рабочих дня. Цена та же — $14.99.',
    s2_hard_case_note: 'Сложный документ: AI попробует прочитать, все поля потребуют вашего подтверждения. Если AI не сможет — наш специалист обработает вручную. Срок тот же.',
    doc: {
      passport_internal: { name: 'Паспорт Украины', hint: 'Внутренний, книжка' },
      passport_foreign:  { name: 'Загранпаспорт',   hint: 'Биометрический' },
      birth:             { name: 'Свидетельство о рождении', hint: '' },
      marriage:          { name: 'Свидетельство о браке', hint: '' },
      divorce:           { name: 'О расторжении брака', hint: '' },
      id_card:           { name: 'ID-карта',         hint: 'Пластиковая карта' },
      military:          { name: 'Военный билет',    hint: 'Військовий квиток' },
      other:             { name: 'Другой документ',  hint: 'Водительские права и др.' },
    },
    // Screen 3 — Upload
    s3_title_1: 'Загрузите', s3_title_2: 'документ',
    s3_subtitle: 'Сфотографируйте или загрузите файл. Нужны все страницы с данными.',
    s3_drop_main: 'Нажмите чтобы загрузить',
    s3_drop_sub: 'Принимаем: JPG, PNG\nМакс. размер: 10 МБ',
    s3_camera: '📷 Сфотографировать',
    s3_file: '📂 Выбрать файл',
    s3_add_more: '➕ Добавить ещё страницу',
    s3_max_pages: 'Можно загрузить до 6 страниц.',
    s3_page_n: 'Страница',
    s3_remove_aria: 'Удалить страницу',
    s3_rotate: 'Повернуть',
    s3_tip_t: 'Советы для хорошего фото:',
    s3_tip_b: 'снимайте при дневном свете, держите телефон ровно, все буквы должны быть чёткими. Книжку загружайте обеими развёрнутыми страницами или сделайте отдельные фото.',
    s3_better_scan: 'Фото получилось слишком маленьким или нечётким. Пожалуйста, переснимите при хорошем свете, держа телефон ровно, чтобы все буквы были чёткими — и попробуйте снова.',
    s3_cta: 'Распознать документ →',
    s3_cta_n: 'Распознать %COUNT% стр. →',
    // Screen 4 — Processing
    s4_title_1: 'AI читает', s4_title_2: 'ваш документ...',
    s4_subtitle: 'Пожалуйста, подождите. Это займёт несколько секунд.',
    s4_slow: 'Документ читается чуть дольше обычного — пожалуйста, не закрывайте эту страницу. Мы почти закончили.',
    s4_steps: [
      'Проверяем качество изображения',
      'Распознаём текст (OCR)',
      'Определяем поля документа',
      'Переводим на английский',
      'Формируем сертификат',
    ],
    // Screen 5 — Preview
    s5_title: 'Перевод готов!',
    s5_subtitle: 'Проверьте данные. Если что-то неправильно — нажмите «Изменить» и поправьте. Затем оплатите и скачайте PDF.',
    s5_source_doc: 'Ваш документ — сверяйтесь с оригиналом и заполняйте пустые поля',
    s5_edit: '✏️ Изменить',
    s5_edit_aria: 'Изменить значение',
    s5_corrected: 'Исправлено',
    s5_confirm: 'Подтвердить',
    s5_mismatch: 'Данные не совпадают?',
    s5_reupload: 'Загрузить другое фото',
    s5_review_needed: 'Проверьте, пожалуйста',
    s5_second_reading: 'Второе прочтение (Google Vision)',
    s5_second_reading_verify: 'сверьте дату',
    s5_review_block: 'Сверьте отмеченные поля с вашим документом — рукописный текст мы читаем осторожно. Если всё верно, нажмите «Подтвердить»; если нет — «Изменить». Это займёт минуту.',
    s5_soft_confirm: 'Мы прочитали эти поля с вашего паспорта. Пожалуйста, бегло сверьте их с документом и подтвердите — это займёт несколько секунд.',
    s5_confirm_all: 'Всё верно — подтвердить и продолжить',
    s5_sample_badge: '📄 ОБРАЗЕЦ ПЕРЕВОДА',
    s5_cert_intro: 'I, the undersigned, hereby certify that I am competent in Ukrainian and English languages, and that the above is a true and accurate translation of the Ukrainian document.',
    s5_cta: 'Оплатить и получить PDF — $14.99 →',
    s5_payment_note: 'Оплата через Stripe. Безопасно. После оплаты вы сразу скачаете PDF.',
    s5_no_fields: 'Извлечённых полей нет — мы переведём документ вручную после оплаты (1–2 рабочих дня).',
    s5_extraction_error: 'Не удалось распознать автоматически. После оплаты документ обработает наш специалист.',
    s3_ocr_unavailable: 'Распознавание временно недоступно — пожалуйста, попробуйте снова через минуту. Ваш документ не был обработан.',
    s3_try_again: 'Попробовать снова',
    // Screen 6 — Payment
    s6_title: 'Оплата',
    s6_subtitle: 'Один платёж — получите официальный PDF-перевод с сертификатом',
    s6_price_sub: 'Единый тариф, без скрытых платежей',
    s6_features: [
      'Официальный PDF-перевод с сертификатом',
      'Сертификация по 8 CFR §103.2(b)(3) — для подачи в USCIS',
      'Цифровая подпись прямо в браузере',
      'PDF можно скачать сразу',
      'Бесплатные исправления в течение 7 дней',
    ],
    s6_cta: '💳 Оплатить $14.99',
    s6_cta_loading: '⏳ Переход к Stripe…',
    s6_review_block: 'Сначала закройте все поля, отмеченные как требующие проверки.',
    s6_stripe: 'Оплата через Stripe — мировой лидер платёжных систем. Ваша карта в безопасности. Мы не видим и не храним данные карты.',
    s6_terms: 'Нажимая «Оплатить», вы соглашаетесь с условиями использования. Возврат в течение 7 дней если результат неверный.',
    // Screen 7 — Success
    s7_title: 'Готово!',
    s7_subtitle: 'Ваш официальный перевод оформлен и готов к подаче в USCIS',
    s7_pdf_title: '📄 Ваш перевод',
    s7_pdf_sub: 'Скачайте файл ниже',
    s7_download: '⬇️ Скачать PDF',
    s7_downloading: '⏳ Готовим PDF…',
    s7_downloaded: '✅ PDF скачан!',
    s7_sig_title: '✏️ Подпишите документ',
    s7_sig_sub: 'Нарисуйте подпись переводчика (ваша подпись как заявителя)',
    s7_sig_clear: 'Очистить',
    s7_sig_save: 'Подтвердить подпись ✓',
    s7_sig_saved: '✅ Подпись сохранена',
    s7_cert_title: '🖊️ Подтверждение и подпись',
    s7_addr_label: 'Ваш адрес (для сертификации перевода)',
    s7_addr_ph: 'Улица, город, штат, индекс',
    s7_check1: 'Я проверил(а) перевод, данные верные.',
    s7_check2: 'Я понимаю, что своей подписью подтверждаю, что перевод полный и точный.',
    s7_review_block: 'Сначала закройте все OCR-поля, отмеченные для проверки.',
    s7_need_addr: 'Укажите адрес.',
    s7_need_checks: 'Отметьте оба пункта.',
    s7_sign_first: '✏️ Сначала поставьте подпись ниже — без неё перевод нельзя сертифицировать.',
    s7_next_title: '📋 Что делать дальше?',
    s7_next_steps: [
      'Распечатайте PDF (цветной принтер не нужен)',
      'Вложите в пакет документов для USCIS',
      'Если нужна помощь — свяжитесь с нами',
    ],
    s7_restart: '← Перевести ещё один документ',
    progress: ['Тип', 'Фото', 'Анализ', 'Проверка', 'Оплата', 'Готово'] as string[],
  },
}

// Other locales: thin overrides; if a key is missing, falls back to RU.
const T_OVERRIDES: Partial<Record<Locale, Partial<typeof T.ru>>> = {
  en: {
    badge: '🔒 Secure',
    legal: 'We are not attorneys. Service is informational assistance per 8 CFR §103.2(b)(3).',
    back: '← Back',
    next: 'Next →',
    start_over: '↺ Start over',
    start_over_confirm: 'Start over? Your uploaded files and recognized data will be cleared.',
    s1_title_1: 'Document', s1_title_2: 'translation',
    s1_subtitle: 'Upload a photo — we translate to English and issue an official USCIS-style certification.',
    s1_card_time_t: '5–10 minutes', s1_card_time_s: 'For a Ukrainian passport',
    s1_card_format_t: 'USCIS-style format', s1_card_format_s: 'Certification per 8 CFR §103.2(b)(3)',
    s1_card_seefirst_t: 'See first, then pay', s1_card_seefirst_s: 'Payment only after you verify the translation',
    s1_cta: 'Start translation →',
    s1_secure: 'Your documents are safe.',
    s1_secure_s: 'We do not retain originals after processing. Everything is encrypted.',
    s2_title_1: 'Which document', s2_title_2: 'do you need translated?',
    s2_subtitle: 'Pick one document',
    s2_price_block_price: 'Translation draft — from $15',
    s2_price_block_tier: 'Per document · Pay only after reviewing the translation',
    s2_price_block_what: 'You receive an English translation draft + a self-certification template (8 CFR §103.2(b)(3)). You review, correct, and sign it.',
    s2_price_block_legal: 'Not a law firm. Informational help — not legal advice.',
    s2_popular: 'Most common',
    s2_manual_note: 'This document type will be processed by our specialist. Turnaround: 1–2 business days. Same price: $14.99.',
    s2_hard_case_note: 'Complex document: AI will attempt to read it; all fields require your confirmation. If AI cannot extract — a specialist handles it manually at the same price.',
    doc: {
      passport_internal: { name: 'Ukrainian Passport', hint: 'Internal, booklet' },
      passport_foreign:  { name: 'International Passport', hint: 'Biometric' },
      birth:             { name: 'Birth Certificate', hint: '' },
      marriage:          { name: 'Marriage / Divorce', hint: '' },
      divorce:           { name: 'Divorce Certificate', hint: '' },
      id_card:           { name: 'ID Card', hint: 'Plastic card' },
      military:          { name: 'Military ID', hint: 'Військовий квиток' },
      other:             { name: 'Other Document', hint: "Driver's license, etc." },
    },
    s3_title_1: 'Upload', s3_title_2: 'your document',
    s3_subtitle: 'Take a photo or upload a file. Include every page with data.',
    s3_drop_main: 'Tap to upload',
    s3_drop_sub: 'Accepts: JPG, PNG\nMax size: 10 MB',
    s3_camera: '📷 Take a photo',
    s3_file: '📂 Choose file',
    s3_add_more: '➕ Add another page',
    s3_max_pages: 'Up to 6 pages.',
    s3_page_n: 'Page',
    s3_remove_aria: 'Remove page',
    s3_rotate: 'Rotate',
    s3_tip_t: 'Tips for a good photo:',
    s3_tip_b: 'shoot in daylight, hold the phone level, every letter must be sharp. For a booklet, photograph both open pages together or upload separate photos for each side.',
    s3_better_scan: 'The photo came out too small or unclear. Please retake it in good light, holding the phone steady so every letter is sharp — then try again.',
    s3_cta: 'Recognize document →',
    s3_cta_n: 'Recognize %COUNT% pages →',
    s4_title_1: 'AI is reading', s4_title_2: 'your document…',
    s4_subtitle: 'Please wait. This takes a few seconds.',
    s4_slow: 'This document is taking a little longer than usual — please keep this page open. We are almost done.',
    s4_steps: [
      'Checking image quality',
      'Recognising text (OCR)',
      'Identifying document fields',
      'Translating to English',
      'Building certificate',
    ],
    s5_title: 'Translation ready!',
    s5_subtitle: 'Review the data. If anything is wrong, tap «Edit» and fix it. Then pay and download the PDF.',
    s5_source_doc: 'Your document — check against the original and fill in any empty fields',
    s5_edit: '✏️ Edit',
    s5_edit_aria: 'Edit value',
    s5_corrected: 'Edited',
    s5_confirm: 'Confirm',
    s5_mismatch: 'Data does not match?',
    s5_reupload: 'Upload a different photo',
    s5_review_needed: 'Please double-check',
    s5_second_reading: 'Second reading (Google Vision)',
    s5_second_reading_verify: 'please verify the date',
    s5_review_block: 'Please compare the marked fields with your document — we read handwriting cautiously. If a value is correct press Confirm; if not, press Edit. Takes a minute.',
    s5_soft_confirm: 'We read these fields from your passport. Please glance over them against your document and confirm — it takes a few seconds.',
    s5_confirm_all: 'Looks correct — confirm & continue',
    s5_sample_badge: '📄 SAMPLE TRANSLATION',
    s5_cta: 'Pay and get PDF — $14.99 →',
    s5_payment_note: 'Payment via Stripe. Secure. PDF available immediately after payment.',
    s5_no_fields: 'No fields extracted — we will translate manually after payment (1–2 business days).',
    s5_extraction_error: 'Could not auto-recognize. Our specialist will process the document after payment.',
    s3_ocr_unavailable: 'Recognition is temporarily unavailable — please try again in a moment. Your document was not processed.',
    s3_try_again: 'Try again',
    s6_title: 'Payment',
    s6_subtitle: 'One payment — receive an official translated PDF with certification',
    s6_price_sub: 'Single tariff, no hidden fees',
    s6_features: [
      'Official PDF translation with certification',
      'Certification per 8 CFR §103.2(b)(3) — formatted for USCIS submission',
      'Digital signature right in your browser',
      'Download your PDF immediately',
      'Free corrections within 7 days',
    ],
    s6_cta: '💳 Pay $14.99',
    s6_cta_loading: '⏳ Redirecting to Stripe…',
    s6_review_block: 'Resolve all fields marked for review before payment.',
    s6_stripe: 'Payment via Stripe — global leader in payment systems. Your card is safe. We never see or store card data.',
    s6_terms: 'By clicking «Pay» you agree to the terms. Refund within 7 days if the result is incorrect.',
    s7_title: 'Done!',
    s7_subtitle: 'Your official translation is prepared and ready to file with USCIS',
    s7_pdf_title: '📄 Your translation',
    s7_pdf_sub: 'Download your file below',
    s7_download: '⬇️ Download PDF',
    s7_downloading: '⏳ Preparing PDF…',
    s7_downloaded: '✅ PDF downloaded!',
    s7_sig_title: '✏️ Sign the document',
    s7_sig_sub: 'Draw the translator signature (your signature as the applicant)',
    s7_sig_clear: 'Clear',
    s7_sig_save: 'Confirm signature ✓',
    s7_sig_saved: '✅ Signature saved',
    s7_cert_title: '🖊️ Confirm & sign',
    s7_addr_label: 'Your address (for the translation certification)',
    s7_addr_ph: 'Street, city, state, ZIP',
    s7_check1: 'I reviewed the translation and the data is correct.',
    s7_check2: 'I understand my signature attests the translation is complete and accurate.',
    s7_review_block: 'Resolve all OCR fields marked for review before download.',
    s7_need_addr: 'Enter your address.',
    s7_need_checks: 'Check both boxes.',
    s7_sign_first: '✏️ Sign below first — a translation cannot be certified without your signature.',
    s7_next_title: '📋 What next?',
    s7_next_steps: [
      'Print the PDF (color printer not required)',
      'Add it to your USCIS document package',
      'Need help — contact us',
    ],
    s7_restart: '← Translate another document',
    progress: ['Type', 'Photo', 'Analyse', 'Review', 'Pay', 'Done'],
  },
}

function getT(locale: Locale) {
  const base = T.ru
  const ov = T_OVERRIDES[locale] ?? {}
  return { ...base, ...ov, doc: { ...base.doc, ...(ov as any).doc } } as typeof T.ru
}

// ─── Sample translation data — used ONLY when extractedFields is empty
// (manual-review document types, or auto-extract failure on free-tier). It is
// labeled as «ОБРАЗЕЦ» in the cert preview so the user is never misled. ──
const SAMPLE_ROWS: Record<DocTypeChoice, Array<{ ukr: string; val_ukr: string; val_eng: string }>> = {
  passport_internal: [
    { ukr: 'Прізвище', val_ukr: 'ПРИКЛАД', val_eng: 'SAMPLE' },
    { ukr: "Ім'я",      val_ukr: '—',       val_eng: '—' },
    { ukr: 'По батькові', val_ukr: '—',     val_eng: '—' },
    { ukr: 'Дата народження', val_ukr: '—', val_eng: '—' },
    { ukr: 'Місце народження', val_ukr: '—', val_eng: '—' },
  ],
  // Field sets mirror the docintel registry specs (the REAL extraction shapes),
  // so the sample preview is honest about what the translation will contain.
  passport_foreign:  [
    { ukr: 'Прізвище / Surname', val_ukr: '—', val_eng: '—' },
    { ukr: "Ім'я / Given name",  val_ukr: '—', val_eng: '—' },
    { ukr: 'Номер паспорта',     val_ukr: '—', val_eng: '—' },
    { ukr: 'Дата народження',    val_ukr: '—', val_eng: '—' },
    { ukr: 'Дата закінчення строку дії', val_ukr: '—', val_eng: '—' },
  ],
  birth:             [
    { ukr: 'Прізвище дитини',  val_ukr: '—', val_eng: '—' },
    { ukr: "Ім'я, по батькові", val_ukr: '—', val_eng: '—' },
    { ukr: 'Дата народження',  val_ukr: '—', val_eng: '—' },
    { ukr: 'Місце народження', val_ukr: '—', val_eng: '—' },
    { ukr: 'Батько',           val_ukr: '—', val_eng: '—' },
    { ukr: 'Мати',             val_ukr: '—', val_eng: '—' },
    { ukr: 'Актовий запис №',  val_ukr: '—', val_eng: '—' },
    { ukr: 'Орган реєстрації', val_ukr: '—', val_eng: '—' },
  ],
  marriage:          [
    { ukr: "Він (прізвище, імʼя)",  val_ukr: "—", val_eng: "—" },
    { ukr: "Вона (прізвище, імʼя)", val_ukr: "—", val_eng: "—" },
    { ukr: 'Дата реєстрації шлюбу', val_ukr: '—', val_eng: '—' },
    { ukr: 'Актовий запис №',       val_ukr: '—', val_eng: '—' },
    { ukr: 'Орган реєстрації',      val_ukr: '—', val_eng: '—' },
  ],
  divorce:           [
    { ukr: "Він (прізвище, імʼя)",  val_ukr: "—", val_eng: "—" },
    { ukr: "Вона (прізвище, імʼя)", val_ukr: "—", val_eng: "—" },
    { ukr: 'Дата розірвання шлюбу', val_ukr: '—', val_eng: '—' },
    { ukr: 'Актовий запис №',       val_ukr: '—', val_eng: '—' },
  ],
  id_card:           [
    { ukr: 'Прізвище',        val_ukr: '—', val_eng: '—' },
    { ukr: "Ім'я, по батькові", val_ukr: '—', val_eng: '—' },
    { ukr: 'Дата народження', val_ukr: '—', val_eng: '—' },
    { ukr: 'Номер документа', val_ukr: '—', val_eng: '—' },
  ],
  military:          [
    { ukr: 'Прізвище',          val_ukr: '—', val_eng: '—' },
    { ukr: "Ім'я, по батькові",  val_ukr: '—', val_eng: '—' },
    { ukr: 'Дата народження',   val_ukr: '—', val_eng: '—' },
    { ukr: 'Серія та номер',    val_ukr: '—', val_eng: '—' },
  ],
  other:             [{ ukr: 'Документ', val_ukr: '—', val_eng: '—' }],
}

const CERT_TITLES_EN: Record<DocTypeChoice, string> = {
  passport_internal: 'TRANSLATION OF UKRAINIAN INTERNAL PASSPORT',
  passport_foreign:  'TRANSLATION OF UKRAINIAN INTERNATIONAL PASSPORT',
  birth:             'TRANSLATION OF UKRAINIAN BIRTH CERTIFICATE',
  marriage:          'TRANSLATION OF UKRAINIAN MARRIAGE CERTIFICATE',
  divorce:           'TRANSLATION OF UKRAINIAN DIVORCE CERTIFICATE',
  id_card:           'TRANSLATION OF UKRAINIAN IDENTITY CARD',
  military:          'TRANSLATION OF UKRAINIAN MILITARY ID',
  other:             'TRANSLATION OF UKRAINIAN DOCUMENT',
}

// Map docintel field ids to Ukrainian labels on the booklet identity page.
// Labels moved to translationFieldLabels.ts (full registry coverage, test-pinned).

function fmtScreenStep(screen: Screen): number {
  // Map screen index to 0-based progress step (welcome has no progress).
  return { 1: -1, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 }[screen]
}

// ─── CSS — TPS design system (scoped under .tw-root) ──────────────────────────
// Same tokens TPSWizardV2 reads (`var(--accent)`, `var(--surface-1)`, Inter
// font, 14px radius, 48px button tap targets, light theme). Prototype's flow +
// structure preserved; only the visual language is now TPS-identical so users
// who came from TPS recognize the wizard instantly.
const WIZARD_CSS = `
.tw-root {
  font-family: var(--font-inter), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--background, #faf9f7);
  color: var(--text-1, #1a1714);
  min-height: 100vh;
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;

  /* TPS-aligned brand tokens (the same globals TPSWizardV2 reads) */
  --acc: var(--accent, #10a37f);
  --acc-h: var(--accent-hover, #0e8f70);
  --acc-l: var(--accent-light, #e6f4ed);

  /* Legacy var names from the prototype, re-aliased so all existing JSX
     inline styles (color:'var(--gold)', etc.) automatically render TPS green. */
  --gold: var(--accent, #10a37f);
  --gold-light: var(--accent-hover, #0e8f70);
  --green: var(--accent, #10a37f);
  --green-light: var(--accent-hover, #0e8f70);
  --blue: #2563eb;
  --red: var(--error-border, #d33);
  --navy: var(--text-1, #1a1714);
  --navy2: var(--surface-1, #fff);
  --navy3: var(--surface-2, #f3f4f6);
  --text: var(--text-1, #1a1714);
  --text-muted: var(--text-3, #6b7280);
  --border: var(--border, #e5e7eb);
  --card: var(--surface-1, #fff);

  --warn-bg: var(--warning-bg, #fff3cd);
  --warn-bd: var(--warning-border, #ffc107);
  --warn-tx: var(--warning-text, #856404);

  --info-bg: var(--info-bg, #eff6ff);
  --info-bd: var(--info-border, #a8c7fa);
  --info-tx: var(--info-text, #1d4ed8);

  --radius: 14px;
  --shadow: 0 1px 4px rgba(0,0,0,.05);
}
.tw-root *, .tw-root *::before, .tw-root *::after { box-sizing: border-box; }

/* Mobile tap feedback: kill the iOS 300ms highlight on every interactive
   surface so taps feel instant and on-brand. Buttons supply their own
   :active state for visible feedback (the global tap-highlight removal
   means we MUST add :active to keep the tap visible). */
.tw-root button, .tw-root label.tw-btn-upload, .tw-root label.tw-upload-zone,
.tw-root .tw-doc-tile, .tw-root .tw-page-tile, .tw-root .tw-back-btn,
.tw-root .tw-edit-btn, .tw-root .tw-trans-edit-btn {
  -webkit-tap-highlight-color: transparent;
}

/* Header — TPS card-on-light */
.tw-header {
  background: var(--card);
  border-bottom: 1px solid var(--border);
  padding: 14px 20px;
  display: flex; align-items: center; gap: 12px;
  position: sticky; top: 0; z-index: 100;
}
.tw-logo { font-size: 20px; color: var(--acc); font-weight: 800; }
.tw-logo span { color: var(--text); }
.tw-header-badge {
  margin-left: auto; background: var(--acc-l);
  border: 1px solid var(--acc); color: var(--acc);
  padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700;
}

/* Progress bar — minimal dots + lines on light bg */
.tw-progress-bar { background: var(--background, #faf9f7); padding: 14px 20px; border-bottom: 1px solid var(--border); }
.tw-progress-steps { display: flex; align-items: flex-start; max-width: 760px; margin: 0 auto; gap: 0; }
.tw-step-wrap { display: flex; flex-direction: column; align-items: center; flex: 0 0 auto; }
.tw-step-dot {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: 14px;
  background: var(--card); color: var(--text-muted);
  border: 2px solid var(--border);
  transition: all 0.3s;
}
.tw-step-dot.done { background: var(--acc); color: #fff; border-color: var(--acc); }
.tw-step-dot.active { background: var(--acc); color: #fff; border-color: var(--acc); box-shadow: 0 0 0 4px var(--acc-l); }
.tw-step-dot.pending { background: var(--card); color: var(--text-muted); border-color: var(--border); }
.tw-step-line { flex: 1; height: 2px; background: var(--border); margin: 16px -1px 0; align-self: flex-start; transition: background 0.3s; }
.tw-step-line.done { background: var(--acc); }
.tw-step-label { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 4px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
.tw-step-label.active-label { color: var(--acc); }

.tw-main { max-width: 760px; margin: 0 auto; padding: 24px 16px 60px; }
.tw-screen { display: none; }
.tw-screen.tw-active { display: block; animation: tw-fadeUp 0.3s ease; }
@keyframes tw-fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

/* Typography — Inter, TPS hierarchy: 28 / 20 / 17 */
.tw-h1 { font-family: inherit; font-size: 28px; font-weight: 800; line-height: 1.2; margin: 0 0 8px; color: var(--text); }
.tw-h2 { font-family: inherit; font-size: 20px; font-weight: 800; margin: 0 0 10px; color: var(--text); }
.tw-subtitle { color: var(--text-muted); font-size: 17px; margin-bottom: 24px; line-height: 1.55; }
.tw-gold { color: var(--acc); }

/* Card — TPS-identical: white, light border, subtle shadow */
.tw-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow);
}

/* Doc-type tiles — TPS-style: white card, 2.5px border, green active */
.tw-doc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; margin-bottom: 16px; }
.tw-doc-tile {
  background: var(--card);
  border: 2.5px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 12px; text-align: center; cursor: pointer; transition: all 0.15s;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  min-height: 130px; justify-content: center;
  color: var(--text); font-family: inherit;
  box-shadow: var(--shadow);
}
.tw-doc-tile:hover { border-color: var(--acc); }
.tw-doc-tile:active { border-color: var(--acc); background: var(--acc-l); transform: scale(0.98); }
.tw-doc-tile.tw-selected { border-color: var(--acc); background: var(--acc-l); }
.tw-doc-tile.popular { border-color: var(--acc); }
.tw-doc-icon { font-size: 36px; }
.tw-doc-name { font-weight: 800; font-size: 15px; line-height: 1.3; color: var(--text); }
.tw-doc-hint { font-size: 13px; color: var(--text-muted); }
.tw-popular-badge { background: var(--acc); color: #fff; font-size: 11px; font-weight: 800; padding: 2px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; }

/* Upload zone — TPS UploadDrop: 2.5px dashed, white bg, hover green */
.tw-upload-zone {
  border: 2.5px dashed var(--border);
  border-radius: var(--radius);
  padding: 28px 20px; text-align: center; cursor: pointer; transition: all 0.15s;
  background: var(--card); margin-bottom: 12px; display: block;
}
.tw-upload-zone:hover, .tw-upload-zone.tw-dragging { border-color: var(--acc); background: var(--acc-l); }
.tw-upload-icon { font-size: 44px; margin-bottom: 10px; }
.tw-upload-main { font-size: 17px; font-weight: 800; margin-bottom: 4px; color: var(--text); }
.tw-upload-sub { color: var(--text-muted); font-size: 14px; white-space: pre-line; }

.tw-upload-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.tw-btn-upload {
  padding: 12px 10px; border-radius: 10px;
  font-size: 15px; font-weight: 700;
  cursor: pointer; border: 1.5px solid var(--border);
  background: var(--card); color: var(--text);
  display: flex; align-items: center; justify-content: center;
  gap: 6px; transition: all 0.15s; min-height: 48px; font-family: inherit;
}
.tw-btn-upload:hover { border-color: var(--acc); color: var(--acc); }
.tw-btn-upload:active { border-color: var(--acc); color: var(--acc); background: var(--acc-l); }
.tw-btn-camera { background: var(--card); color: var(--text); }
.tw-btn-camera:hover { border-color: var(--acc); color: var(--acc); }
.tw-btn-file { background: var(--card); color: var(--text); }
.tw-btn-file:hover { border-color: var(--acc); color: var(--acc); }

.tw-preview-img { width: 100%; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 12px; max-height: 280px; object-fit: cover; display: block; }

/* Multi-page preview grid (Screen 3): each page as a thumbnail tile with
   page-number badge and remove button. Sized for 2 thumbs/row on mobile. */
.tw-page-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin-bottom: 12px;
  border-radius: 12px;
  transition: outline 0.15s, background 0.15s;
  outline: 2px dashed transparent;
  outline-offset: 4px;
}
.tw-page-grid.tw-dragging {
  outline-color: var(--acc);
  background: var(--acc-l);
}
.tw-page-tile {
  border-radius: 12px; overflow: hidden;
  border: 1px solid var(--border); background: var(--card);
  box-shadow: var(--shadow); display: flex; flex-direction: column;
}
.tw-page-thumb { position: relative; }
.tw-page-tile img {
  width: 100%; height: 128px; object-fit: contain; display: block;
  background: var(--surface-2); /* clean letterbox — show the WHOLE document, not a crop */
}
.tw-page-no {
  position: absolute; bottom: 6px; left: 6px;
  background: var(--card); color: var(--text);
  font-size: 12px; font-weight: 700;
  padding: 3px 8px; border-radius: 12px;
  border: 1px solid var(--border);
}
.tw-page-remove {
  position: absolute; top: 6px; right: 6px;
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(0,0,0,0.6); color: #fff;
  border: none; cursor: pointer;
  font-size: 20px; font-weight: 700; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, transform 0.1s;
}
.tw-page-remove:hover { background: rgba(0,0,0,0.78); }
.tw-page-remove:active { background: rgba(0,0,0,0.85); transform: scale(0.92); }
.tw-page-remove:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
/* Labeled rotate control UNDER the thumbnail — text + icon make it obvious it's
   a "rotate the photo" action (a bare corner icon read as unclear). */
.tw-page-rotate-btn {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; padding: 10px 8px; border: none; border-top: 1px solid var(--border);
  background: var(--surface-2); color: var(--text-1);
  font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer;
  -webkit-tap-highlight-color: transparent; transition: background 0.15s, color 0.15s;
}
.tw-page-rotate-btn .tw-rot-ico {
  font-size: 18px; line-height: 1; color: var(--acc); transition: transform 0.2s;
  display: inline-block;
}
.tw-page-rotate-btn:hover { background: var(--acc); color: #fff; }
.tw-page-rotate-btn:hover .tw-rot-ico { color: #fff; transform: rotate(90deg); }
.tw-page-rotate-btn:active { background: var(--acc); }
.tw-page-rotate-btn:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }

/* Primary button — TPS navBtn(forward): green, 18px, 800 weight, 48px tap */
.tw-btn-primary {
  display: block; width: 100%;
  background: var(--acc); color: #fff;
  border: none; border-radius: var(--radius);
  padding: 16px; min-height: 48px;
  font-size: 18px; font-weight: 800; cursor: pointer;
  transition: all 0.15s; text-align: center;
  font-family: inherit;
}
.tw-btn-primary:hover:not(:disabled) { background: var(--acc-h); }
.tw-btn-primary:active:not(:disabled) { background: var(--acc-h); transform: scale(0.98); }
.tw-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.tw-btn-primary:focus-visible { outline: 3px solid var(--acc); outline-offset: 2px; }

/* Secondary — outlined, gray text on white */
.tw-btn-secondary {
  display: block; width: 100%;
  background: var(--card); color: var(--text-muted);
  border: 1.5px solid var(--border); border-radius: var(--radius);
  padding: 14px; min-height: 48px;
  font-size: 17px; font-weight: 700; cursor: pointer;
  transition: all 0.15s; text-align: center; margin-top: 10px;
  font-family: inherit;
}
.tw-btn-secondary:hover { border-color: var(--acc); color: var(--acc); }

/* Green variant — same as primary in TPS land (no separate green) */
.tw-btn-green { background: var(--acc); color: #fff; }
.tw-btn-green:hover:not(:disabled) { background: var(--acc-h); }

/* Back link — small grey, hover green */
.tw-back-btn {
  background: none; border: none; color: var(--text-muted);
  font-size: 14px; cursor: pointer; padding: 10px 0; margin-bottom: 12px;
  display: inline-flex; align-items: center; gap: 4px; font-family: inherit;
  transition: color 0.15s; min-height: 44px; font-weight: 700;
}
.tw-back-btn:hover { color: var(--acc); }
/* Keyboard focus rings — these custom tiles/labels suppress the global ring via
   -webkit-tap-highlight-color, so they need their own :focus-visible. */
.tw-doc-tile:focus-visible, .tw-back-btn:focus-visible,
.tw-btn-upload:focus-visible, .tw-upload-zone:focus-visible {
  outline: 3px solid var(--acc); outline-offset: 2px;
}

/* Processing — green spinner on light bg */
.tw-processing { text-align: center; padding: 16px 0; }
.tw-ai-spinner {
  width: 64px; height: 64px;
  border: 4px solid var(--border);
  border-top: 4px solid var(--acc);
  border-radius: 50%; animation: tw-spin 1s linear infinite;
  margin: 0 auto 20px;
}
@keyframes tw-spin { to { transform: rotate(360deg); } }
.tw-proc-steps { text-align: left; margin-top: 20px; }
.tw-proc-step {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0; border-bottom: 1px solid var(--border);
  font-size: 16px; opacity: 0.45; transition: opacity 0.4s;
  color: var(--text);
}
.tw-proc-step:last-child { border-bottom: none; }
.tw-proc-step.tw-active, .tw-proc-step.tw-done { opacity: 1; }
.tw-proc-icon { font-size: 22px; flex-shrink: 0; width: 28px; text-align: center; }
.tw-proc-spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--border);
  border-top: 2px solid var(--acc);
  border-radius: 50%; animation: tw-spin 0.8s linear infinite;
  flex-shrink: 0; margin-left: 5px;
}

/* Review rows — TPS RW pattern 1:1 (single label per row + stacked values
   on white card, dark text, Edit button on right). No green-on-green
   tinting that hurt contrast in the previous layout. */
.tw-trans-row {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 10px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  animation: tw-fadeUp 0.3s ease forwards;
  opacity: 0;
  box-shadow: var(--shadow);
}
.tw-trans-row.user-edited { border-color: var(--acc); }
.tw-trans-label {
  font-size: 13px; color: var(--text-3, #6b7280);
  font-weight: 700; margin-bottom: 8px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.tw-trans-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tw-trans-orig {
  font-size: 15px; color: var(--text-3, #6b7280);
  font-weight: 500; word-break: break-word;
  font-style: italic;
}
.tw-trans-arrow {
  color: var(--text-3, #6b7280); font-size: 16px;
  user-select: none; line-height: 1; margin: 2px 0;
  font-weight: 700;
}
.tw-trans-eng {
  font-size: 19px; color: var(--text-1, #111827);
  font-weight: 800; word-break: break-word; line-height: 1.3;
}
.tw-trans-eng .corrected-badge {
  display: inline-block; margin-left: 8px;
  background: var(--acc-l); color: var(--acc);
  font-size: 11px; font-weight: 800; padding: 2px 8px;
  border-radius: 12px; border: 1px solid var(--acc);
  text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;
}
.tw-trans-edit-btn {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 8px; color: var(--acc);
  cursor: pointer; padding: 8px 14px;
  font-size: 13px; font-weight: 700;
  min-height: 36px; min-width: 88px;
  font-family: inherit; white-space: nowrap;
  transition: all 0.15s;
}
.tw-trans-edit-btn:hover { background: var(--acc-l); border-color: var(--acc); }
.tw-trans-edit-btn:active { background: var(--acc-l); border-color: var(--acc); transform: scale(0.97); }
.tw-trans-edit-btn:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

/* Cert preview — KEEP white (paper document mockup, theme-independent) */
.tw-cert-preview {
  background: #fff; color: #1a1a2e;
  border-radius: 14px; padding: 20px;
  margin: 20px 0; font-size: 14px; line-height: 1.6;
  border: 2px solid var(--acc); position: relative; overflow: hidden;
}
.tw-cert-badge {
  position: absolute; top: -12px; left: 16px;
  background: var(--acc); color: #fff;
  font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 12px; letter-spacing: 0.5px;
}
.tw-cert-title { font-weight: 900; font-size: 15px; text-align: center; margin-bottom: 10px; color: #1a1a2e; }
.tw-cert-field { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e5e7eb; gap: 12px; }
.tw-cert-key { color: #6b7280; font-size: 13px; }
.tw-cert-val { font-weight: 700; font-size: 13px; text-align: right; color: #1a1a2e; }
.tw-cert-cert { margin-top: 12px; font-size: 12px; color: #4b5563; line-height: 1.5; }
.tw-watermark {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-size: 28px; font-weight: 900;
  color: rgba(16,163,127,0.08);
  white-space: nowrap; pointer-events: none; letter-spacing: 4px;
}

/* Price tag — light green */
.tw-price-tag {
  text-align: center; padding: 24px 16px;
  background: var(--acc-l);
  border: 2px solid var(--acc);
  border-radius: var(--radius); margin-bottom: 16px;
}
.tw-price-amount { font-size: 48px; color: var(--acc); font-weight: 800; line-height: 1; font-family: inherit; }
.tw-price-sub { color: var(--text-muted); font-size: 15px; margin-top: 6px; }

.tw-features-list { margin: 16px 0; }
.tw-feature-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; font-size: 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.tw-feature-item:last-child { border-bottom: none; }
.tw-feature-icon { font-size: 20px; flex-shrink: 0; }

.tw-trust-badges { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.tw-trust-badge {
  background: var(--acc-l); border: 1px solid var(--acc);
  color: var(--acc); padding: 6px 12px; border-radius: 20px;
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; gap: 4px;
}

.tw-success-icon {
  width: 88px; height: 88px;
  background: var(--acc-l);
  border: 3px solid var(--acc);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 44px; margin: 0 auto 20px;
  animation: tw-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
@keyframes tw-pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.tw-reassurance {
  background: var(--info-bg);
  border: 1px solid var(--info-bd);
  border-radius: 12px; padding: 14px;
  margin-top: 12px;
  display: flex; gap: 10px; align-items: flex-start;
}
.tw-reassurance-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
.tw-reassurance-text { font-size: 14px; color: var(--info-tx); line-height: 1.5; }
.tw-reassurance-text strong { color: var(--info-tx); }

.tw-legal-note { font-size: 13px; color: var(--text-muted); text-align: center; padding: 14px 0; line-height: 1.6; }

.tw-confirm-edit {
  background: var(--warn-bg);
  border: 1px solid var(--warn-bd);
  border-radius: 10px; padding: 10px 14px;
  font-size: 14px; color: var(--warn-tx);
  margin-top: 10px;
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
}
.tw-edit-btn {
  background: var(--card); border: 1px solid var(--border);
  color: var(--text); border-radius: 8px;
  padding: 6px 12px; font-size: 13px; cursor: pointer;
  font-family: inherit; transition: all 0.15s; min-height: 36px; font-weight: 700;
}
.tw-edit-btn:hover { border-color: var(--acc); color: var(--acc); }

.tw-sig-canvas {
  width: 100%; height: 120px;
  background: #fff;
  border-radius: 10px; cursor: crosshair;
  border: 1.5px solid var(--border);
  touch-action: none; display: block;
}
.tw-sig-row { display: flex; gap: 10px; margin-top: 10px; }
.tw-sig-row .tw-btn-primary, .tw-sig-row .tw-btn-secondary { margin: 0; padding: 14px; font-size: 16px; min-height: 48px; }

@media (max-width: 480px) {
  .tw-doc-grid { gap: 8px; }
  .tw-doc-tile { padding: 14px 10px; min-height: 110px; }
  .tw-doc-icon { font-size: 32px; }
  .tw-doc-name { font-size: 14px; }
}
`

// ─── Component ────────────────────────────────────────────────────────────────
export function TranslateWizard() {
  const params = useParams() as { locale?: string } | null
  const searchParams = useSearchParams()
  const locale = ((params?.locale as Locale) ?? 'ru') as Locale
  const t = getT(locale)

  const [screen, setScreen] = useState<Screen>(1)
  const [selectedDocType, setSelectedDocType] = useState<DocTypeChoice | null>(null)
  // Multi-page support: a document may span multiple pages (booklet identity
  // page, then registration, then photo page; or birth-cert front + back).
  // We collect all pages here in upload order and send them all to OCR.
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  // Translator/certifier attestation (USCIS 8 CFR §103.2(b)(3)). Address + the two
  // checkboxes are required before the final certified PDF can be generated.
  const [certifierAddress, setCertifierAddress] = useState('')
  const [dataReviewed, setDataReviewed] = useState(false)
  const [accuracyAttested, setAccuracyAttested] = useState(false)
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([])
  // CANONICAL_CONTINUITY: id of the persisted canonical document for the PRIMARY
  // uploaded document, captured from the vision-extract response and resent in the
  // generate-pdf body. null when extract returned no id (shadow persist failure or
  // continuity=off) — we send nothing rather than fabricate/stale an id.
  const [canonicalDocumentId, setCanonicalDocumentId] = useState<string | null>(null)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  // Phase 2.1a: true when we called vision-extract for a hard-case doc (autoread=true)
  // AND the API returned >0 fields. In that state the review gate is enforced even though
  // the doc has auto=false. False (default) → manual path or 0-field fallback.
  const [hardCaseHasFields, setHardCaseHasFields] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  // Owner mode: the site owner can run every product without payment (server
  // routes already honour the owner cookie). Checked on mount; NOT persisted.
  const [isOwner, setIsOwner] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfDownloaded, setPdfDownloaded] = useState(false)
  const [sigSaved, setSigSaved] = useState(false)
  const [procStep, setProcStep] = useState(0) // 0-5 — which step is currently active
  const [procSlow, setProcSlow] = useState(false) // true after ~15s — reassure, don't let users close the tab
  const [scanWarning, setScanWarning] = useState(false) // server said the photo is too small/unclear — ask to retake, don't push to pay
  // HONEST DEGRADATION (P1): provider rate-limit / outage. The document was NOT
  // read — show a "try again shortly" state and send the user back to upload,
  // NEVER advance to the manual/review path as if the read succeeded.
  const [ocrUnavailable, setOcrUnavailable] = useState(false)
  const MAX_PAGES = 6 // hard cap to keep OCR cost predictable (~$0.001/page)
  const [stripeCheckoutId, setStripeCheckoutId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return sessionStorage.getItem('tw:cs') } catch { return null }
  })

  // Restore draft ONLY when returning from the Stripe round-trip (?paid=1).
  // SESSION ISOLATION: a fresh visit must NOT resurrect a previous session's
  // fields — doing so showed stale/foreign data (e.g. "Іваненко/Іван/Проскурів")
  // as if it were recognized for the CURRENT upload. On a plain visit, start clean.
  useEffect(() => {
    if (searchParams?.get('paid') !== '1') return // not a Stripe return → no stale restore
    // applyDraft rebuilds the wizard state from a draft regardless of SOURCE
    // (sessionStorage OFF / server ledger ON) so both paths share one rebuild and
    // cannot drift apart. Returns false when the draft is stale/wrong-screen.
    const applyDraft = (draft: DraftState): boolean => {
      // PII CONTAINMENT (Phase A): hard 24h TTL — discard a stale draft on load.
      if (isDraftExpired(draft.savedAt)) return false
      if (['review', 'payment', 'success'].includes(String(draft.screen))) return false
      // Restore selectedDocType + extractedFields so the success-screen PDF call
      // still has them after payment. Screen is set by the ?paid=1 handler below.
      if (draft.selectedDocType) setSelectedDocType(draft.selectedDocType)
      if (Array.isArray(draft.extractedFields)) setExtractedFields(draft.extractedFields)
      // CANONICAL_CONTINUITY: restore the captured id so the post-payment
      // generate-pdf call can resend it. Only accept a string — never fabricate.
      if (typeof draft.canonicalDocumentId === 'string' && draft.canonicalDocumentId.length > 0) {
        setCanonicalDocumentId(draft.canonicalDocumentId)
      }
      return true
    }

    if (isLedgerClientEnabled()) {
      // SERVER LEDGER (V1 #9), ON: the draft (PII incl. raw_cyrillic) lives
      // server-side encrypted; the browser holds ONLY the opaque httpOnly token
      // cookie which survived the Stripe redirect. Rehydrate by GETting the
      // ledger. Defensively wipe any legacy sessionStorage draft so no PII
      // lingers from a pre-ledger session. The ledger enforces its own TTL;
      // an expired/missing draft yields null → nothing restored.
      try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* */ }
      void loadDraftFromServer<DraftState>().then((draft) => {
        try { if (draft && typeof draft === 'object') applyDraft(draft) } catch { /* */ }
      })
    } else {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        if (!raw) return
        const draft = JSON.parse(raw) as DraftState
        if (isDraftExpired(draft.savedAt)) {
          try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* */ }
          return
        }
        applyDraft(draft)
      } catch { /* ignore */ }
    }
  }, [])

  // Stripe return: ?paid=1&plan=basic&cs=cs_X → advance to screen 7.
  useEffect(() => {
    const paid = searchParams?.get('paid')
    const cs = searchParams?.get('cs')
    if (paid === '1') {
      if (cs && /^(cs_|py_)/.test(cs)) {
        setStripeCheckoutId(cs)
        try { sessionStorage.setItem('tw:cs', cs) } catch { /* */ }
      }
      // SERVER LEDGER (V1 #9): read the persisted draft from the correct SOURCE.
      // ON → GET the encrypted draft from the server ledger by opaque token (the
      // browser holds NO PII; raw_cyrillic lives server-side). OFF → read the
      // sessionStorage draft exactly as before. Same DraftState shape both ways.
      const readPersistedDraft = async (): Promise<DraftState | null> => {
        if (isLedgerClientEnabled()) {
          return await loadDraftFromServer<DraftState>()
        }
        try {
          const raw = sessionStorage.getItem(DRAFT_KEY)
          return raw ? (JSON.parse(raw) as DraftState) : null
        } catch { return null }
      }
      // SERVER LEDGER (V1 #9): clear the persisted draft from the correct SOURCE.
      // ON → DELETE the ledger row + opaque cookie; OFF → sessionStorage remove.
      const clearPersistedDraft = (): void => {
        if (isLedgerClientEnabled()) {
          void clearServerDraft()
          try { sessionStorage.removeItem('tw:cs') } catch { /* */ }
        } else {
          try { sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem('tw:cs') } catch { /* */ }
        }
      }

      // OPERATOR FLOW: hand the paid order to the operator queue and leave the
      // wizard entirely — the customer tracks /order/{id} and gets the PDF by
      // email. Idempotent per checkout id (server reuses the open ticket).
      // Falls through to the legacy success screen only if submit fails, so a
      // backend problem never strands a paying customer without ANY path.
      if (OPERATOR_FLOW && cs && /^(cs_|py_)/.test(cs)) {
        void (async () => {
          try {
            const draft = await readPersistedDraft()
            const docTypeId = draft?.selectedDocType ?? selectedDocType
            const draftFields = (Array.isArray(draft?.extractedFields) && draft!.extractedFields.length > 0)
              ? draft!.extractedFields : extractedFields
            const resp = await fetch('/api/translation/submit-order', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                checkout_id: cs,
                doc_type: DOC_TYPES.find((d) => d.id === docTypeId)?.registryId ?? docTypeId ?? 'other',
                locale,
                fields: draftFields.map((f) => ({
                  field: f.field, value: f.value ?? null, raw_cyrillic: f.raw_cyrillic ?? null,
                  review_required: f.review_required ?? false,
                })),
              }),
            })
            const j = await resp.json().catch(() => null)
            if (resp.ok && j?.ok && j.order_id) {
              // PII CONTAINMENT (Phase A): order handed to the operator queue =
              // terminal success. Clear the persisted draft (OCR PII incl.
              // raw_cyrillic) now; the carriage was already submitted to the
              // server above. ON → DELETE the ledger row + cookie; OFF → session.
              clearPersistedDraft()
              window.location.assign(`/${locale}/order/${j.order_id}`)
              return
            }
            console.warn('[wizard] submit-order failed, showing legacy success screen')
            setScreen(7)
          } catch {
            setScreen(7) // backend problem must never strand a paying customer
          }
        })()
      } else {
        setScreen(7)
      }

      // #5: a MANUAL-review document was PAID but no auto-fields were extracted —
      // create a staff ticket so the paid work is actually queued (was: payment
      // taken, no ticket). Read the persisted draft (reliable across the Stripe
      // round-trip), idempotent per checkout id, fire-and-forget — never blocks success.
      // The `tw:ticket:${cs}` flag is a non-PII idempotency marker — it stays in
      // sessionStorage in BOTH modes. Only the DRAFT read switches source (ON →
      // server ledger, OFF → sessionStorage) via readPersistedDraft().
      if (cs && (() => { try { return !sessionStorage.getItem(`tw:ticket:${cs}`) } catch { return false } })()) {
        void (async () => {
          try {
            const draft = await readPersistedDraft()
            const docTypeId = draft?.selectedDocType ?? selectedDocType
            const fieldsLen = Array.isArray(draft?.extractedFields) ? draft!.extractedFields.length : extractedFields.length
            if (fieldsLen === 0 && docTypeId) {
              try { sessionStorage.setItem(`tw:ticket:${cs}`, '1') } catch { /* */ }
              void fetch('/api/translation/manual-review', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: cs,
                  doc_type: DOC_TYPES.find((d) => d.id === docTypeId)?.registryId ?? docTypeId ?? 'other',
                  source_lang: locale === 'uk' ? 'uk' : locale === 'en' ? 'en' : 'ru',
                  reason: 'manual_document_type',
                  confidence: 0,
                }),
              }).catch(() => { try { sessionStorage.removeItem(`tw:ticket:${cs}`) } catch { /* */ } })
            }
          } catch { /* never block the success screen */ }
        })()
      }
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('paid'); url.searchParams.delete('plan'); url.searchParams.delete('cs')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [searchParams])

  const goTo = useCallback((n: Screen) => {
    setScreen(n)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const saveDraft = useCallback(async (): Promise<void> => {
    try {
      // PII CONTAINMENT (Phase A): persist ONLY {field, value, review_required,
      // raw_cyrillic} per field — strip confidence / kind / ensemble_candidate /
      // review_reasons. raw_cyrillic is kept ON PURPOSE: it is load-bearing
      // carriage for the post-payment submit-order operator hand-off.
      const draft: DraftState = {
        screen,
        selectedDocType,
        extractedFields: sanitizeFieldListForStorage('translation', extractedFields) as unknown as ExtractedField[],
        canonicalDocumentId,
        savedAt: new Date().toISOString(),
      }
      // SERVER LEDGER (V1 #9): when ON, the draft (PII incl. raw_cyrillic) is
      // POSTed to the server ledger (encrypted at rest); the browser keeps ONLY
      // the opaque httpOnly token cookie — NOTHING (esp. raw_cyrillic) is written
      // to sessionStorage. We AWAIT the save so the token cookie is set before any
      // Stripe redirect (the cookie is what survives the round-trip). When OFF,
      // the sessionStorage write runs exactly as before (byte-identical). Same
      // serialized DraftState shape both ways so hydrate reuses one rebuild.
      if (isLedgerClientEnabled()) {
        // Defensively wipe any legacy sessionStorage draft so no PII lingers.
        try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* */ }
        await saveDraftToServer('translation', draft)
      } else {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      }
    } catch { /* */ }
  }, [screen, selectedDocType, extractedFields, canonicalDocumentId])

  // ── File handling (multi-page) ──
  // Append-mode: every drop/pick adds pages to the existing list (capped at
  // MAX_PAGES). The user can remove individual pages on screen 3. Each page
  // gets a preview URL via FileReader for the thumbnail grid.
  const handleFiles = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files) return
    const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (incoming.length === 0) return
    setExtractionError(null)
    setExtractedFields([])
    setUploadedFiles((prev) => {
      const next = [...prev, ...incoming].slice(0, MAX_PAGES)
      // Only generate previews for the slice we actually kept.
      const acceptedNew = next.slice(prev.length)
      acceptedNew.forEach((f) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const url = e.target?.result as string
          setPreviewUrls((p) => [...p, url])
        }
        reader.readAsDataURL(f)
      })
      return next
    })
  }, [])
  const handleRemoveFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
  }, [])
  // Manual rotate = the safety net for when auto-orientation is wrong or didn't
  // fire. Files the user rotated by hand are marked so the OSD doesn't override
  // them at upload (identity-keyed so it survives add/remove).
  const userRotatedRef = useRef<WeakSet<File>>(new WeakSet())
  const handleRotateFile = useCallback(async (index: number) => {
    const file = uploadedFiles[index]
    if (!file) return
    const rotated = await rotateImage90(file)
    userRotatedRef.current.add(rotated)
    setUploadedFiles((prev) => prev.map((f, i) => (i === index ? rotated : f)))
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setPreviewUrls((prev) => prev.map((u, i) => (i === index ? url : u)))
    }
    reader.readAsDataURL(rotated)
  }, [uploadedFiles])

  // Desktop drag-drop. Mobile has no drag-and-drop API so these handlers
  // are silent no-ops there; tap-to-upload via the file picker covers
  // mobile, giving feature parity at the *outcome* level (files added).
  const [isDragging, setIsDragging] = useState(false)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types?.includes('Files')) setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  // ── Processing: REAL /api/translation/vision-extract over all pages ──
  // The endpoint accepts repeated `file` keys and merges fields server-side,
  // preferring the earliest non-empty value per field name. Booklet identity
  // page typically wins; later pages fill in anything page 1 missed.
  const startProcessing = useCallback(async () => {
    if (uploadedFiles.length === 0 || !selectedDocType) return
    setProcStep(1)
    setProcSlow(false)
    setScanWarning(false)
    setOcrUnavailable(false)
    goTo(4)
    setExtractionError(null)
    setExtractedFields([])
    // CANONICAL_CONTINUITY: clear any id from a previous upload before this read.
    setCanonicalDocumentId(null)

    // Tick visible steps while the network call is in flight. Multi-page
    // calls take longer (≈ 2-3 s per page) so we stretch the ticker.
    const perPage = Math.max(700, Math.min(1500, uploadedFiles.length * 600))
    const tickers = [
      setTimeout(() => setProcStep(2), perPage),
      setTimeout(() => setProcStep(3), perPage * 2),
      setTimeout(() => setProcStep(4), perPage * 3),
      setTimeout(() => setProcStep(5), perPage * 4),
      // After ~15s reassure the user (slow Gemini read / multi-page) so a
      // 35-80yo doesn't think it froze and close the tab.
      setTimeout(() => setProcSlow(true), 15000),
    ]
    const meta = DOC_TYPES.find((d) => d.id === selectedDocType)
    const registryId = meta?.registryId

    // Phase 2.1a: hard-case docs (birth/marriage) can opt into autoread via flag.
    // If autoread is true, call vision-extract and surface fields for review.
    // 0-field result → fall through to the manual path (no fields = specialist handles it).
    const shouldCallVisionExtract = (meta?.auto || meta?.autoread) && !!registryId

    try {
      if (!shouldCallVisionExtract) {
        // Manual-review path: skip the API call. We still advance to review with
        // empty fields — the review screen shows an honest "manual review" notice.
        await new Promise((r) => setTimeout(r, perPage * 4 + 500))
        tickers.forEach(clearTimeout)
        setHardCaseHasFields(false)
        setProcStep(5)
        goTo(5)
        return
      }
      const form = new FormData()
      // Keep the TOTAL upload under Vercel's ~4.5MB body cap by giving each file
      // a SHARE of the budget. The old per-file 3.8MB threshold let two normal
      // phone photos (~2.5MB each = 5MB) blow the cap → HTTP 413 → "could not
      // recognize". More files → smaller per-file budget + smaller max edge.
      const pageCount = Math.max(1, uploadedFiles.length)
      const perFileBudget = Math.floor(4_000_000 / pageCount)
      const maxEdge = pageCount >= 4 ? 1600 : pageCount >= 2 ? 2000 : 2400
      const quality = pageCount >= 4 ? 0.72 : pageCount >= 2 ? 0.78 : 0.82
      for (const f of uploadedFiles) {
        // prepareImageForUpload = downscale to the per-file budget. Orientation is
        // handled by the vision reader at read time; the manual rotate button bakes
        // its rotation into `f` before upload, so nothing else is needed here.
        const prepared = await prepareImageForUpload(f, {
          thresholdBytes: perFileBudget, maxEdge, quality,
        })
        form.append('file', prepared.blob, prepared.name)
      }
      form.append('docTypeId', registryId!)
      const res = await fetch('/api/translation/vision-extract', { method: 'POST', body: form })
      tickers.forEach(clearTimeout)
      setProcStep(5)
      const json = await res.json().catch(() => ({} as { ok?: boolean; fields?: ExtractedField[]; error?: string; error_code?: string; status?: string; canonical_document_id?: string | null }))
      if (!res.ok || !json?.ok) {
        // A photo-quality bounce (too small / blurry / needs reshoot) is FIXABLE —
        // send the user back to upload with a clear "retake" notice instead of
        // pushing them to pay for a specialist to read a bad photo.
        const status = (json as { status?: string })?.status
        if (status === 'needs_better_scan' || status === 'reshoot_required') {
          setScanWarning(true)
          setProcStep(0)
          goTo(3)
          return
        }
        // HONEST DEGRADATION (P1): a provider rate-limit / outage is NOT a read.
        // The server now returns a typed error_code (OCR_RATE_LIMITED, etc.) with
        // an honest non-2xx (429/503/502). The document was NOT processed, so we
        // must NOT advance to the manual/review path as if it succeeded — send the
        // user back to upload with a clear "try again shortly" notice. Detected by
        // the typed error_code or the explicit provider_unavailable status.
        const errorCode = (json as { error_code?: string })?.error_code
        const isProviderUnavailable =
          status === 'provider_unavailable' ||
          (typeof errorCode === 'string' && errorCode.startsWith('OCR_')) ||
          res.status === 429 || res.status === 502 || res.status === 503
        if (isProviderUnavailable) {
          setOcrUnavailable(true)
          setHardCaseHasFields(false)
          setProcStep(0)
          goTo(3)
          return
        }
        setExtractionError(json?.error ?? `HTTP ${res.status}`)
        // For hard-case autoread: a read failure falls through to manual path (no review gate).
        setHardCaseHasFields(false)
        goTo(5)
        return
      }
      // Keep guarded/empty fields that the engine flagged for review — the user
      // fills them in (the central-brain returns value:null + review_required when
      // readers disagree; dropping them hid the field instead of asking the human).
      // GARBAGE GUARD: an OCR label/garbage value ("„ Пріз", punctuation, a field
      // label) must never be shown as recognized — downgrade it to empty + review.
      const fields = Array.isArray(json.fields)
        ? (json.fields as ExtractedField[])
            .map((f) => (f.value && isGarbageValue(f.value)
              ? ({ ...f, value: '', review_required: true } as ExtractedField)
              : f))
            .filter((f) => f.value || (f as any).review_required)
        : []
      setExtractedFields(fields)
      // CANONICAL_CONTINUITY (CAPTURE): store the canonical_document_id the server
      // persisted for this read. Only a string is accepted — null/absent (shadow
      // persist failure or continuity=off) stores null so RESEND sends nothing.
      // This id belongs to the PRIMARY document of this upload: vision-extract was
      // invoked with a single docTypeId over all pages and returns ONE canonical
      // result, so there is exactly one id to carry.
      const capturedId = (json as { canonical_document_id?: string | null }).canonical_document_id
      setCanonicalDocumentId(typeof capturedId === 'string' && capturedId.length > 0 ? capturedId : null)
      // Phase 2.1a: if we called vision-extract for a hard-case doc (autoread=true,
      // auto=false) AND got back >0 fields → enforce the review gate.
      // 0 fields → treat as manual (no gate; specialist handles it).
      setHardCaseHasFields(!meta?.auto && !!meta?.autoread && fields.length > 0)
      goTo(5)
    } catch (e: unknown) {
      tickers.forEach(clearTimeout)
      setExtractionError(e instanceof Error ? e.message : 'Network error')
      setHardCaseHasFields(false)
      setProcStep(5)
      goTo(5)
    }
  }, [uploadedFiles, selectedDocType, goTo])

  // ── Edit a single field (TPS RW pattern: native prompt for max a11y) ──
  // Mirrors TPSWizardV2's approach: window.prompt is universally accessible
  // (screen readers, 35-80yo users on older browsers) and ships without a
  // modal dep. The corrected value is stamped with source 'user_corrected' so
  // the PDF cert reflects user-verified data, not raw OCR.
  const handleEditField = useCallback((fieldKey: string, promptLabel: string, currentEng: string) => {
    if (typeof window === 'undefined') return
    const next = window.prompt(promptLabel, currentEng)
    if (next === null) return // cancelled
    const trimmed = next.trim()
    if (trimmed === currentEng.trim()) {
      if (!trimmed) return
      setExtractedFields((prev) => prev.map((f) =>
        f.field === fieldKey
          ? { ...f, kind: 'user_confirmed', confidence: 1, review_required: false }
          : f,
      ))
      return
    }
    setExtractedFields((prev) => prev.map((f) =>
      f.field === fieldKey
        ? { ...f, value: trimmed, kind: 'user_corrected', confidence: 1, review_required: false }
        : f,
    ))
  }, [])

  const handleConfirmField = useCallback((fieldKey: string) => {
    setExtractedFields((prev) => prev.map((f) =>
      f.field === fieldKey && (f.value ?? '').trim()
        ? { ...f, kind: 'user_confirmed', confidence: 1, review_required: false }
        : f,
    ))
  }, [])

  const currentDocMeta = DOC_TYPES.find((d) => d.id === selectedDocType) ?? null
  // Phase 2.1a: review gate is enforced for auto docs (passport/id) AND for hard-case
  // docs when autoread returned >0 fields. Pure manual path (flag OFF or 0 fields) → no gate.
  const needsReviewGate = currentDocMeta?.auto || hardCaseHasFields
  // A field flagged ONLY because the document has no MRZ math-anchor
  // (every internal passport booklet; any passport with the MRZ strip out of
  // frame) becomes a one-click SOFT confirm, not a hard block on payment.
  // Genuine doubt (low_confidence / mrz_check_failed / provider_conflict /
  // empty value) still hard-blocks. The operator re-reviews and signs before
  // any certified PDF, so a soft confirm only unlocks the Stripe step.
  const reviewGateRows = useMemo(
    () =>
      extractedFields.map((f) => ({
        field: f.field,
        normalized_value: f.value,
        review_required: Boolean(f.review_required),
        review_reasons: f.review_reasons,
      })),
    [extractedFields],
  )
  const unresolvedReviewFields = needsReviewGate ? getHardUnresolvedReviewFields(reviewGateRows) : []
  const softReviewFields = needsReviewGate ? getSoftReviewFields(reviewGateRows) : []
  const hasUnresolvedReviewFields = unresolvedReviewFields.length > 0
  const hasSoftReviewFields = softReviewFields.length > 0
  const canProceedToCertifiedOutput =
    !needsReviewGate || (extractedFields.length > 0 && !hasUnresolvedReviewFields)

  const handleConfirmAllSoftFields = useCallback(() => {
    setExtractedFields((prev) =>
      prev.map((f) =>
        softReviewFields.includes(f.field) && (f.value ?? '').trim()
          ? { ...f, kind: 'user_confirmed', confidence: 1, review_required: false }
          : f,
      ),
    )
  }, [softReviewFields])

  // ── Real Stripe checkout (replaces prototype's simulatePayment) ──
  const handlePayment = useCallback(async () => {
    if (paymentLoading || !canProceedToCertifiedOutput) return
    // OWNER MODE: the site owner tests every product WITHOUT payment. The
    // generate-pdf route already bypasses the payment gate for a verified owner
    // cookie, so skip Stripe and go straight to the sign/download screen.
    if (isOwner) { await saveDraft(); setScreen(7); return }
    setPaymentLoading(true)
    // Persist draft so we can rebuild state after the Stripe round-trip. AWAIT so
    // that (ledger ON) the encrypted draft is stored AND the opaque token cookie
    // is set BEFORE we navigate to Stripe — the cookie is what carries identity
    // across the redirect. (ledger OFF) await of the sync sessionStorage write is
    // a no-op; behaviour unchanged.
    await saveDraft()
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'translation', plan: 'basic', locale }),
      })
      const data = await res.json()
      if (data?.url) {
        window.location.href = data.url
      } else {
        console.error('Stripe checkout error:', data?.error)
        alert('Payment could not be initiated. Please try again.')
        setPaymentLoading(false)
      }
    } catch (err) {
      console.error('Payment fetch failed:', err)
      alert('Network error. Please try again.')
      setPaymentLoading(false)
    }
  }, [paymentLoading, canProceedToCertifiedOutput, saveDraft, locale, isOwner])

  // Owner-mode check (mount): unlocks free testing of the full flow.
  useEffect(() => {
    fetch('/api/owner/status').then((r) => r.json()).then((d) => { if (d?.owner) setIsOwner(true) }).catch(() => {})
  }, [])

  // ── Signature canvas ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const hasDrawnRef = useRef(false)

  useEffect(() => {
    if (screen !== 7) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctxRef.current = ctx
    ctx.strokeStyle = '#1a2d52'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = c.getBoundingClientRect()
      const sx = c.width / rect.width
      const sy = c.height / rect.height
      const touch = (e as TouchEvent).touches?.[0]
      if (touch) return { x: (touch.clientX - rect.left) * sx, y: (touch.clientY - rect.top) * sy }
      const me = e as MouseEvent
      return { x: (me.clientX - rect.left) * sx, y: (me.clientY - rect.top) * sy }
    }
    const start = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e) e.preventDefault()
      drawingRef.current = true
      lastRef.current = getPos(e)
    }
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawingRef.current) return
      if ('touches' in e) e.preventDefault()
      const p = getPos(e)
      ctx.beginPath()
      if (lastRef.current) ctx.moveTo(lastRef.current.x, lastRef.current.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      lastRef.current = p
      hasDrawnRef.current = true
    }
    const end = () => { drawingRef.current = false }
    c.addEventListener('mousedown', start)
    c.addEventListener('mousemove', move)
    c.addEventListener('mouseup', end)
    c.addEventListener('mouseleave', end)
    c.addEventListener('touchstart', start, { passive: false })
    c.addEventListener('touchmove', move, { passive: false })
    c.addEventListener('touchend', end)
    return () => {
      c.removeEventListener('mousedown', start)
      c.removeEventListener('mousemove', move)
      c.removeEventListener('mouseup', end)
      c.removeEventListener('mouseleave', end)
      c.removeEventListener('touchstart', start)
      c.removeEventListener('touchmove', move)
      c.removeEventListener('touchend', end)
    }
  }, [screen])

  const clearSig = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx?.clearRect(0, 0, c.width, c.height)
    hasDrawnRef.current = false
    setSigSaved(false)
  }, [])

  // ── Real PDF generation (replaces simulateDownload) ──
  const handleDownloadPdf = useCallback(async () => {
    if (pdfLoading) return
    if (hasUnresolvedReviewFields) return
    // #16 gate: the translation draft must be SIGNED before download — never
    // generate/download without a real on-screen signature (drawn AND confirmed).
    // No silent manual_wet_signature bypass.
    if (!sigSaved || !hasDrawnRef.current) return
    // Certification preconditions (client mirror of the server review-gate).
    if (!dataReviewed || !accuracyAttested || !certifierAddress.trim()) return
    setPdfLoading(true)
    try {
      const c = canvasRef.current
      const sigDataUrl = (hasDrawnRef.current && c) ? c.toDataURL('image/png') : null
      const profileName = (() => {
        const fam = extractedFields.find((f) => f.field === 'family_name')?.value ?? ''
        const giv = extractedFields.find((f) => f.field === 'given_name')?.value ?? ''
        return [giv, fam].filter(Boolean).join(' ').toUpperCase() || 'APPLICANT'
      })()
      const fieldsForPdf = extractedFields.map((f) => ({
        field: f.field,
        raw_value: f.raw_cyrillic ?? '',
        normalized_value: f.value ?? '',
        source_label: f.raw_cyrillic ?? '',
        source_zone: 'identity_page',
        language_layer: 'cyrillic',
        confidence: f.confidence,
        // Use the engine's REAL per-field flag (was hardcoded true → alert-fatigue,
        // hid which fields are actually unverified). Empty value also needs attention.
        review_required: Boolean((f as any).review_required) || !f.value,
        passes: ['gemini_vision_read'],
        ocr_ids: [],
      }))
      const res = await fetch('/api/translation/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(stripeCheckoutId ? { 'X-Payment-Token': stripeCheckoutId } : {}),
        },
        body: JSON.stringify({
          profile: { name: profileName, email: '', phone: '', addr: certifierAddress.trim() },
          dataReviewed,
          accuracyAttested,
          selectedPlan: 'basic',
          spanishCopy: false,
          locale,
          signatureDataUrl: sigDataUrl,
          signatureMethod: sigDataUrl ? 'drawn_on_screen' : 'manual_wet_signature',
          signedAt: new Date().toISOString(),
          certificationTextVersion: 'self_cert_8cfr_v1',
          session_id: stripeCheckoutId,
          doc_type: DOC_TYPES.find((d) => d.id === selectedDocType)?.registryId ?? 'other',
          scope_title: CERT_TITLES_EN[selectedDocType ?? 'other'],
          fields: fieldsForPdf,
          // CANONICAL_CONTINUITY (RESEND): link this PDF to the canonical document
          // persisted at extract time. Spread so the key is OMITTED when no id was
          // captured (shadow persist failure / continuity=off) — stays optional, a
          // wrong/stale id is worse than none. Enforce-mode validation is server-side.
          ...(canonicalDocumentId ? { canonical_document_id: canonicalDocumentId } : {}),
        }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `translation-${Date.now()}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        setPdfDownloaded(true)
      } else {
        const data = await res.json().catch(() => ({} as { error?: string }))
        alert(data?.error ?? `PDF download failed (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error('[TranslateWizard download]', err)
      alert('Network error. Please try again.')
    } finally {
      setPdfLoading(false)
    }
  }, [pdfLoading, hasUnresolvedReviewFields, sigSaved, dataReviewed, accuracyAttested, certifierAddress, extractedFields, stripeCheckoutId, locale, selectedDocType])

  // Full reset for "Start over" / "Translate another". Clears EVERY piece of
  // session state — including the attestation inputs and the persisted Stripe
  // checkout id — so a fresh start cannot inherit stale data (the live-failure
  // class). Pairs with the session-isolation guard (no draft restore on a plain
  // visit): this is the explicit, user-driven reset.
  const resetAll = useCallback(() => {
    setSelectedDocType(null)
    setUploadedFiles([])
    setPreviewUrls([])
    setExtractedFields([])
    setExtractionError(null)
    setHardCaseHasFields(false)
    setCertifierAddress('')
    setDataReviewed(false)
    setAccuracyAttested(false)
    setPaymentLoading(false)
    setPdfLoading(false)
    setPdfDownloaded(false)
    setSigSaved(false)
    setProcStep(0)
    setStripeCheckoutId(null)
    // SERVER LEDGER (V1 #9): explicit user-driven reset clears the persisted
    // draft. ON → DELETE the ledger row + opaque cookie; OFF → sessionStorage
    // remove exactly as before. The non-PII 'tw:cs' marker is cleared in both.
    if (isLedgerClientEnabled()) {
      void clearServerDraft()
      try { sessionStorage.removeItem('tw:cs') } catch { /* */ }
    } else {
      try {
        sessionStorage.removeItem(DRAFT_KEY)
        sessionStorage.removeItem('tw:cs')
      } catch { /* */ }
    }
  }, [])

  // "Start over" from mid-flow: confirm (data loss), reset, return to doc-type.
  const startOver = useCallback(() => {
    if (typeof window !== 'undefined' && !window.confirm(t.start_over_confirm)) return
    resetAll()
    goTo(2)
  }, [resetAll, goTo, t])

  // ── Translation table rows: REAL fields if present, else honest sample ──
  // `fieldKey` + `kind` carry through so the review screen can wire the Edit
  // button to the right extractedFields entry and flag user-corrected rows.
  const translationRows = (() => {
    if (extractedFields.length > 0) {
      return extractedFields
        // SILENT-DROP FIX (2026-06-11): unlabeled fields previously VANISHED here
        // (passport number/expiry, 9/10 birth-cert fields). Never drop — fall back.
        .map((f) => ({
          fieldKey: f.field,
          ukr: ukrLabelFor(f.field),
          val_ukr: f.raw_cyrillic ?? '—',
          val_eng: f.value ?? '—',
          current_eng: f.value ?? '',
          kind: f.kind,
          requiresReview: Boolean(f.review_required),
          // ENSEMBLE_DATE: second engine's reading when the two disagreed on a date.
          ensembleCandidate: f.ensemble_candidate ?? null,
        }))
    }
    return [] // empty → review screen renders the manual-review notice
  })()
  // Cert-preview shape doesn't need fieldKey/kind — strip to the older shape
  // so SAMPLE_ROWS (which lacks them) is structurally compatible.
  const certRowsForPreview: Array<{ ukr: string; val_ukr: string; val_eng: string }> =
    translationRows.length > 0
      ? translationRows.map((r) => ({ ukr: r.ukr, val_ukr: r.val_ukr, val_eng: r.val_eng }))
      : SAMPLE_ROWS[selectedDocType ?? 'other']
  const certTitle = CERT_TITLES_EN[selectedDocType ?? 'other']
  const certDateLine = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // ── Progress bar ──
  const stepIndex = fmtScreenStep(screen)
  const showProgress = screen !== 1

  return (
    <div className="tw-root">
      <style>{WIZARD_CSS}</style>

      <header className="tw-header">
        <div className="tw-logo">Messeng<span>info</span></div>
        <div className="tw-header-badge">{t.badge}</div>
      </header>

      {showProgress && (
        <div className="tw-progress-bar">
          <div className="tw-progress-steps">
            {t.progress.map((lbl, i) => (
              <div key={lbl} style={{ display: 'contents' }}>
                <div className="tw-step-wrap">
                  <div className={`tw-step-dot ${i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending'}`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <div className={`tw-step-label ${i === stepIndex ? 'active-label' : ''}`}>{lbl}</div>
                </div>
                {i < t.progress.length - 1 && <div className={`tw-step-line ${i < stepIndex ? 'done' : ''}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="tw-main">
        {/* SCREEN 1 — Welcome */}
        <div className={`tw-screen ${screen === 1 ? 'tw-active' : ''}`}>
          <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📋</div>
            <h1 className="tw-h1">{t.s1_title_1}<br /><span className="tw-gold">{t.s1_title_2}</span></h1>
            <p className="tw-subtitle">{t.s1_subtitle}</p>
          </div>
          <div className="tw-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px' }}>
            <span style={{ fontSize: 28 }}>⚡</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{t.s1_card_time_t}</div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>{t.s1_card_time_s}</div>
            </div>
          </div>
          <div className="tw-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', marginTop: -8 }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{t.s1_card_format_t}</div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>{t.s1_card_format_s}</div>
            </div>
          </div>
          <div className="tw-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', marginTop: -8 }}>
            <span style={{ fontSize: 28 }}>👁</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{t.s1_card_seefirst_t}</div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>{t.s1_card_seefirst_s}</div>
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <button className="tw-btn-primary" onClick={() => goTo(2)}>{t.s1_cta}</button>
          </div>
          <div className="tw-reassurance" style={{ marginTop: 20 }}>
            <div className="tw-reassurance-icon">🔐</div>
            <div className="tw-reassurance-text"><strong>{t.s1_secure}</strong> {t.s1_secure_s}</div>
          </div>
          <p className="tw-legal-note">{t.legal}</p>
        </div>

        {/* SCREEN 2 — Doc type */}
        <div className={`tw-screen ${screen === 2 ? 'tw-active' : ''}`}>
          <button type="button" className="tw-back-btn" onClick={() => goTo(1)}>{t.back}</button>
          <h2 className="tw-h2">{t.s2_title_1}<br />{t.s2_title_2}</h2>
          <p className="tw-subtitle">{t.s2_subtitle}</p>
          {/* Price + trust BEFORE upload — a 35-80yo should know the cost and what
              they get before committing a document. Range only (not a fixed price). */}
          <div className="tw-card" style={{ borderLeft: '3px solid var(--acc)', padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-1)' }}>{t.s2_price_block_price}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{t.s2_price_block_tier}</div>
            <div style={{ fontSize: 13, color: 'var(--text-1)', marginTop: 8, lineHeight: 1.5 }}>{t.s2_price_block_what}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{t.s2_price_block_legal}</div>
          </div>
          <div className="tw-doc-grid">
            {DOC_TYPES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={selectedDocType === d.id}
                className={`tw-doc-tile ${d.popular ? 'popular' : ''} ${selectedDocType === d.id ? 'tw-selected' : ''}`}
                onClick={() => setSelectedDocType(d.id)}
              >
                {d.popular && <span className="tw-popular-badge">{t.s2_popular}</span>}
                <div className="tw-doc-icon">{d.icon}</div>
                <div className="tw-doc-name">{t.doc[d.id].name}</div>
                {t.doc[d.id].hint && <div className="tw-doc-hint">{t.doc[d.id].hint}</div>}
              </button>
            ))}
          </div>
          {selectedDocType && (() => {
            const m = DOC_TYPES.find((d) => d.id === selectedDocType)
            if (!m || m.auto) return null
            // Phase 2.1a: hard-case autoread shows a different notice (AI tries, confirm required)
            if (m.autoread) return (
              <div className="tw-reassurance" style={{ marginTop: 16, borderColor: 'var(--warn-bd)', background: 'var(--warn-bg)' }}>
                <div className="tw-reassurance-icon">🔍</div>
                <div className="tw-reassurance-text" style={{ color: 'var(--warn-tx)' }}>{t.s2_hard_case_note}</div>
              </div>
            )
            return (
              <div className="tw-reassurance" style={{ marginTop: 16 }}>
                <div className="tw-reassurance-icon">👨‍💼</div>
                <div className="tw-reassurance-text">{t.s2_manual_note}</div>
              </div>
            )
          })()}
          <div style={{ marginTop: 20 }}>
            <button className="tw-btn-primary" disabled={!selectedDocType} onClick={() => goTo(3)}>{t.next}</button>
          </div>
          <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13 }}>
            <a href="/supported-documents" target="_blank" rel="noreferrer" style={{ color: 'var(--acc, #2c6e9e)', textDecoration: 'underline' }}>
              📋 {locale === 'uk' ? 'Усі підтримувані документи' : locale === 'en' ? 'All supported documents' : locale === 'es' ? 'Todos los documentos compatibles' : 'Все поддерживаемые документы'}
            </a>
          </div>
        </div>

        {/* SCREEN 3 — Upload (multi-page) */}
        <div className={`tw-screen ${screen === 3 ? 'tw-active' : ''}`}>
          <button type="button" className="tw-back-btn" onClick={() => goTo(2)}>{t.back}</button>
          <h2 className="tw-h2">{t.s3_title_1}<br />{t.s3_title_2}</h2>
          <p className="tw-subtitle">{t.s3_subtitle}</p>
          {scanWarning && (
            <div className="tw-confirm-edit" style={{ marginTop: 12, background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}>
              <span aria-hidden="true">📷</span>
              <div style={{ flex: 1, color: 'var(--warning-text)', fontWeight: 600 }}>{t.s3_better_scan}</div>
            </div>
          )}
          {/* HONEST DEGRADATION (P1): recognition provider temporarily unavailable.
              The document was NOT read — offer a retry, never a silent success. */}
          {ocrUnavailable && (
            <div className="tw-confirm-edit" style={{ marginTop: 12, background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}>
              <span aria-hidden="true">⏳</span>
              <div style={{ flex: 1, color: 'var(--warning-text)', fontWeight: 600 }}>{t.s3_ocr_unavailable}</div>
              <button
                type="button"
                className="tw-edit-btn"
                onClick={() => { setOcrUnavailable(false); startProcessing() }}
                disabled={uploadedFiles.length === 0}
              >
                {t.s3_try_again}
              </button>
            </div>
          )}

          {previewUrls.length > 0 && (
            <div
              className={`tw-page-grid ${isDragging ? 'tw-dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {previewUrls.map((url, i) => (
                <div className="tw-page-tile" key={`${url.slice(0, 32)}-${i}`}>
                  <div className="tw-page-thumb">
                    <img src={url} alt={`${t.s3_page_n} ${i + 1}`} />
                    <div className="tw-page-no">{t.s3_page_n} {i + 1}</div>
                    <button
                      type="button"
                      className="tw-page-remove"
                      aria-label={`${t.s3_remove_aria} ${i + 1}`}
                      onClick={() => handleRemoveFile(i)}
                    >×</button>
                  </div>
                  <button
                    type="button"
                    className="tw-page-rotate-btn"
                    aria-label={`${t.s3_rotate} ${i + 1}`}
                    onClick={() => handleRotateFile(i)}
                  >
                    <span className="tw-rot-ico" aria-hidden="true">↻</span> {t.s3_rotate}
                  </button>
                </div>
              ))}
            </div>
          )}

          {previewUrls.length === 0 && (
            <label
              className={`tw-upload-zone ${isDragging ? 'tw-dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="tw-upload-icon">📸</div>
              <div className="tw-upload-main">{t.s3_drop_main}</div>
              <div className="tw-upload-sub">{t.s3_drop_sub}</div>
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = '' }}
              />
            </label>
          )}

          {previewUrls.length < MAX_PAGES ? (
            <div className="tw-upload-btns">
              <label className="tw-btn-upload tw-btn-camera">
                {previewUrls.length > 0 ? t.s3_add_more : t.s3_camera}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = '' }}
                />
              </label>
              <label className="tw-btn-upload tw-btn-file">
                {t.s3_file}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => { handleFiles(e.target.files); e.currentTarget.value = '' }}
                />
              </label>
            </div>
          ) : (
            <div className="tw-reassurance" style={{ marginTop: 12 }}>
              <div className="tw-reassurance-icon">📄</div>
              <div className="tw-reassurance-text">{t.s3_max_pages}</div>
            </div>
          )}

          <div className="tw-reassurance" style={{ marginTop: 16 }}>
            <div className="tw-reassurance-icon">💡</div>
            <div className="tw-reassurance-text"><strong>{t.s3_tip_t}</strong> {t.s3_tip_b}</div>
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              className="tw-btn-primary"
              disabled={uploadedFiles.length === 0}
              onClick={startProcessing}
            >
              {uploadedFiles.length > 1
                ? t.s3_cta_n.replace('%COUNT%', String(uploadedFiles.length))
                : t.s3_cta}
            </button>
          </div>
        </div>

        {/* SCREEN 4 — Processing */}
        <div className={`tw-screen ${screen === 4 ? 'tw-active' : ''}`}>
          <div className="tw-processing">
            <div className="tw-ai-spinner" />
            <h2 className="tw-h2">{t.s4_title_1}<br />{t.s4_title_2}</h2>
            <p className="tw-subtitle">{t.s4_subtitle}</p>
            {procSlow && (
              <p className="tw-subtitle" style={{ marginTop: 8, color: 'var(--warning-text)', fontWeight: 600 }}>
                {t.s4_slow}
              </p>
            )}
          </div>
          <div className="tw-card tw-proc-steps" role="status" aria-live="polite">
            {t.s4_steps.map((label, i) => {
              const idx = i + 1
              const isDone = procStep > idx
              const isActive = procStep === idx
              return (
                <div key={label} className={`tw-proc-step ${isDone ? 'tw-done' : ''} ${isActive ? 'tw-active' : ''}`}>
                  {isActive ? <div className="tw-proc-spinner" /> : <span className="tw-proc-icon">{isDone ? '✅' : '○'}</span>}
                  <div>{label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* SCREEN 5 — Translation preview (BEFORE payment, v5 §21) */}
        <div className={`tw-screen ${screen === 5 ? 'tw-active' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <button type="button" className="tw-back-btn" onClick={() => goTo(3)}>{t.back}</button>
            <button type="button" className="tw-back-btn" onClick={startOver}>{t.start_over}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <h2 className="tw-h2" style={{ margin: 0 }}>{t.s5_title}</h2>
          </div>
          <p className="tw-subtitle">{t.s5_subtitle}</p>

          {previewUrls.length > 0 && (
            <div className="tw-card" style={{ padding: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t.s5_source_doc}</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {previewUrls.map((url, i) => (
                  <a key={`src-${i}`} href={url} target="_blank" rel="noopener noreferrer" style={{ flex: '0 0 auto', display: 'block' }} aria-label={`${t.s5_source_doc} ${i + 1}`}>
                    <img src={url} alt={`${t.s5_source_doc} ${i + 1}`} style={{ height: 240, maxWidth: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {translationRows.length > 0 ? (
            <>
              {hasUnresolvedReviewFields && (
                <div className="tw-confirm-edit" style={{ marginBottom: 12 }}>
                  <span>⚠️</span>
                  <div style={{ flex: 1 }}>{t.s5_review_block}</div>
                </div>
              )}
              {!hasUnresolvedReviewFields && hasSoftReviewFields && (
                <div
                  className="tw-confirm-edit"
                  style={{ marginBottom: 12, alignItems: 'center', flexWrap: 'wrap', gap: 12 }}
                >
                  <span aria-hidden="true">👁️</span>
                  <div style={{ flex: 1, minWidth: 200 }}>{t.s5_soft_confirm}</div>
                  <button type="button" className="tw-btn-primary" onClick={handleConfirmAllSoftFields}>
                    {t.s5_confirm_all}
                  </button>
                </div>
              )}
              <div>
                {translationRows.map((row, i) => {
                  const isEdited = row.kind === 'user_corrected'
                  return (
                    <div
                      key={`${row.fieldKey}-${i}`}
                      className={`tw-trans-row ${isEdited ? 'user-edited' : ''}`}
                      style={{ animationDelay: `${i * 0.08}s` }}
                    >
                      <div className="tw-trans-stack">
                        <div className="tw-trans-label">{row.ukr}</div>
                        <div className="tw-trans-orig">{row.val_ukr}</div>
                        <div className="tw-trans-arrow" aria-hidden="true">↓</div>
                        <div className="tw-trans-eng">
                          {row.val_eng}
                          {isEdited && <span className="corrected-badge">{t.s5_corrected}</span>}
                          {row.requiresReview && <span className="corrected-badge" style={{ background: 'var(--warn-bg)', color: 'var(--warn-tx)', border: '1px solid var(--warn-bd)' }}>{t.s5_review_needed}</span>}
                        </div>
                        {row.ensembleCandidate && (
                          <div
                            className="tw-trans-ensemble"
                            style={{ fontSize: 12, color: 'var(--warn-tx)', marginTop: 4, lineHeight: 1.4 }}
                          >
                            {t.s5_second_reading}: <b>{row.ensembleCandidate}</b> — {t.s5_second_reading_verify}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          type="button"
                          className="tw-trans-edit-btn"
                          onClick={() => handleEditField(row.fieldKey, row.ukr, row.current_eng)}
                          aria-label={`${t.s5_edit_aria} ${row.ukr}`}
                        >
                          {t.s5_edit}
                        </button>
                        {row.requiresReview && row.current_eng.trim() && (
                          <button
                            type="button"
                            className="tw-trans-edit-btn"
                            onClick={() => handleConfirmField(row.fieldKey)}
                            aria-label={`${t.s5_confirm} ${row.ukr}`}
                          >
                            {t.s5_confirm}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="tw-confirm-edit">
                <span>⚠️</span>
                <div style={{ flex: 1 }}>{t.s5_mismatch}</div>
                <button type="button" className="tw-edit-btn" onClick={() => goTo(3)}>{t.s5_reupload}</button>
              </div>
            </>
          ) : (
            <div className="tw-reassurance" style={{ background: 'var(--warn-bg)', borderColor: 'var(--warn-bd)' }}>
              <div className="tw-reassurance-icon">👨‍💼</div>
              <div className="tw-reassurance-text" style={{ color: 'var(--warn-tx)' }}>
                {extractionError ? t.s5_extraction_error : t.s5_no_fields}
              </div>
            </div>
          )}

          {/* Cert preview with watermark */}
          <div className="tw-cert-preview">
            <span className="tw-cert-badge">{t.s5_sample_badge}</span>
            <div className="tw-watermark">{t.s5_sample_badge.replace(/^📄\s*/, '')}</div>
            <div className="tw-cert-title">{certTitle}</div>
            <div>
              {certRowsForPreview.map((row, i) => (
                <div key={`cf-${i}`} className="tw-cert-field">
                  <span className="tw-cert-key">{row.ukr}:</span>
                  <span className="tw-cert-val">{row.val_eng}</span>
                </div>
              ))}
            </div>
            <div className="tw-cert-cert">
              <strong>CERTIFICATION:</strong> {t.s5_cert_intro}
              <br /><br />
              <strong>Messenginfo.com</strong> | Translation Service | Date: {certDateLine}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <button className="tw-btn-primary" onClick={() => goTo(6)} disabled={!canProceedToCertifiedOutput}>{t.s5_cta}</button>
            <div className="tw-legal-note" style={{ marginTop: 12 }}>{t.s5_payment_note}</div>
          </div>
        </div>

        {/* SCREEN 6 — Payment */}
        <div className={`tw-screen ${screen === 6 ? 'tw-active' : ''}`}>
          <button type="button" className="tw-back-btn" onClick={() => goTo(5)}>{t.back}</button>
          <h2 className="tw-h2">{t.s6_title}</h2>
          <p className="tw-subtitle">{t.s6_subtitle}</p>
          <div className="tw-price-tag">
            <div className="tw-price-amount">$14.99</div>
            <div className="tw-price-sub">{t.s6_price_sub}</div>
          </div>
          <div className="tw-features-list">
            {t.s6_features.map((f, i) => (
              <div key={i} className="tw-feature-item">
                <span className="tw-feature-icon">{['📄', '⚖️', '✏️', '📧', '🔄'][i]}</span>
                <div>{f}</div>
              </div>
            ))}
          </div>
          <div className="tw-trust-badges">
            <div className="tw-trust-badge">🔒 Stripe</div>
            <div className="tw-trust-badge">🛡️ SSL</div>
            <div className="tw-trust-badge">↩️ 7d refund</div>
          </div>
          <button
            type="button"
            className="tw-btn-primary tw-btn-green"
            onClick={handlePayment}
            disabled={paymentLoading || !canProceedToCertifiedOutput}
            style={{ fontSize: 21, padding: 22 }}
          >
            {isOwner ? '🔑 Owner — continue free' : paymentLoading ? t.s6_cta_loading : t.s6_cta}
          </button>
          {!canProceedToCertifiedOutput && (
            <div className="tw-legal-note" style={{ marginTop: 12 }}>{t.s6_review_block}</div>
          )}
          <div className="tw-reassurance" style={{ marginTop: 16 }}>
            <div className="tw-reassurance-icon">🔒</div>
            <div className="tw-reassurance-text">{t.s6_stripe}</div>
          </div>
          <p className="tw-legal-note">{t.s6_terms}</p>
        </div>

        {/* SCREEN 7 — Success */}
        <div className={`tw-screen ${screen === 7 ? 'tw-active' : ''}`}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="tw-success-icon">✅</div>
            <h1 className="tw-h1">{t.s7_title}</h1>
            <p className="tw-subtitle">{t.s7_subtitle}</p>
          </div>
          <div className="tw-card" style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12, color: 'var(--text-1)' }}>{t.s7_pdf_title}</div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16 }}>{t.s7_pdf_sub}</div>
            <button
              type="button"
              className="tw-btn-primary tw-btn-green"
              onClick={handleDownloadPdf}
              disabled={pdfLoading || hasUnresolvedReviewFields || !sigSaved || !dataReviewed || !accuracyAttested || !certifierAddress.trim()}
              style={{ marginBottom: 0 }}
            >
              {pdfLoading ? t.s7_downloading : pdfDownloaded ? t.s7_downloaded : t.s7_download}
            </button>
            {hasUnresolvedReviewFields && (
              <div style={{ fontSize: 13, color: 'var(--gold)', marginTop: 10, fontWeight: 600 }}>
                {t.s7_review_block}
              </div>
            )}
            {(!certifierAddress.trim() || !dataReviewed || !accuracyAttested || !sigSaved) && (
              <div style={{ fontSize: 13, color: 'var(--gold)', marginTop: 10, fontWeight: 600 }}>
                {!certifierAddress.trim() ? t.s7_need_addr : (!dataReviewed || !accuracyAttested) ? t.s7_need_checks : t.s7_sign_first}
              </div>
            )}
          </div>
          <div className="tw-card">
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14 }}>{t.s7_cert_title}</div>
            <label htmlFor="tw-certifier-addr" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t.s7_addr_label}</label>
            <input
              id="tw-certifier-addr"
              type="text"
              value={certifierAddress}
              onChange={(e) => setCertifierAddress(e.target.value)}
              placeholder={t.s7_addr_ph}
              autoComplete="street-address"
              style={{ width: '100%', padding: 14, fontSize: 16, minHeight: 48, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16, boxSizing: 'border-box' }}
            />
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataReviewed} onChange={(e) => setDataReviewed(e.target.checked)} style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0 }} />
              <span>{t.s7_check1}</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, cursor: 'pointer' }}>
              <input type="checkbox" checked={accuracyAttested} onChange={(e) => setAccuracyAttested(e.target.checked)} style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0 }} />
              <span>{t.s7_check2}</span>
            </label>
          </div>
          <div className="tw-card">
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14 }}>{t.s7_sig_title}</div>
            <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16 }}>{t.s7_sig_sub}</p>
            <canvas ref={canvasRef} className="tw-sig-canvas" width={560} height={120} />
            <div className="tw-sig-row">
              <button type="button" onClick={clearSig} className="tw-btn-secondary" style={{ flex: 1 }}>
                {t.s7_sig_clear}
              </button>
              <button
                type="button"
                onClick={() => { if (hasDrawnRef.current) setSigSaved(true) }}
                className="tw-btn-primary"
                style={{ flex: 2, background: sigSaved ? 'var(--green)' : 'var(--gold)', color: sigSaved ? '#fff' : 'var(--navy)' }}
              >
                {sigSaved ? t.s7_sig_saved : t.s7_sig_save}
              </button>
            </div>
          </div>
          <div className="tw-card">
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14 }}>{t.s7_next_title}</div>
            {t.s7_next_steps.map((step, i) => (
              <div key={i} className="tw-feature-item" style={{ fontSize: 16 }}>
                <span className="tw-feature-icon">{['1️⃣', '2️⃣', '3️⃣'][i]}</span>
                <div>{step}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="tw-btn-primary"
            onClick={() => { resetAll(); goTo(1) }}
            style={{ background: 'var(--navy3)', color: 'var(--text)', boxShadow: 'none' }}
          >
            {t.s7_restart}
          </button>
        </div>
      </main>
    </div>
  )
}
