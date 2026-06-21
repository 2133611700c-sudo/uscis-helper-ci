'use client'

/**
 * ReparoleWizardV2 — 1:1 port of /uploads/reparole_prototype_final.html.
 *
 * Five-step Re-Parole U4U flow on top of the existing OCR + I-131 packet
 * builder pipeline. Sitewide Header / language switcher / theme toggle
 * stay above this component (rendered by [locale]/layout.tsx). The
 * wizard owns everything inside the page body.
 *
 * Backend reuse — NO new infrastructure for OCR or PDF:
 *   POST /api/tps/ocr/extract           — US-form slots (i94, ead, dl) not
 *                                          covered by Core
 *   POST /api/reparole/ocr/extract      — Core path (Phase 2.3: unconditional)
 *   POST /api/reparole/generate-packet  — direct ReParoleAnswers → ZIP
 *                                          (new thin route mirroring TPS)
 *   POST /api/stripe/checkout           — product='re-parole-u4u' Tier 1 $15
 *
 * Route selection (Phase 2.3: flag removed):
 *   passport/booklet → /api/reparole/ocr/extract (Core, unconditional)
 *   i94/ead/dl       → /api/tps/ocr/extract (no Core mapping exists)
 *
 * Architecture mirrors TPSWizardV2:
 *   - localStorage key wizard:re-parole-u4u:v3:state, schema version
 *     gate evicts pre-firewall payloads, hydration re-filters per
 *     slot contract.
 *   - mergedFields runs passport-authoritative identity conflict
 *     guard.
 *   - Edit opens window.prompt (R1B baseline); rich modal is R2 polish.
 *   - $15 explicit on Pay button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { prepareImageForUpload } from '@/lib/upload/prepareImageForUpload'
import { sanitizeFieldMapForStorage, isDraftExpired } from '@/lib/storage/persistedDraftPolicy'
import {
  isLedgerClientEnabled,
  saveDraftToServer,
  loadDraftFromServer,
  clearServerDraft,
} from '@/lib/v1/wizardLedgerClient'

// docHints covered by /api/reparole/ocr/extract (Phase 2.3: flag removed, Core unconditional)
// US-form slots (i94, ead, dl) go to /api/tps/ocr/extract — no reparole mapping exists.
const CORE_COVERED_SLOTS = new Set(['passport', 'booklet'])

// ─── Brand tokens — CSS variables for dark mode ─────────────────────────────
const GREEN = 'var(--accent, #0d5a34)'
const GREEN_DARK = 'var(--accent-hover, #08391f)'
const PAY_BLUE = '#1a73e8'
const PAY_BLUE_DARK = '#1557b0'
const WARN_BG = 'var(--warning-bg, #fff3cd)'
const WARN_BORDER = 'var(--warning-border, #ffc107)'
const WARN_TEXT = 'var(--warning-text, #856404)'
const INFO_BG = 'var(--info-bg, #e8f0fe)'
const INFO_BORDER = 'var(--info-border, #a8c7fa)'
const INFO_TEXT = 'var(--info-text, #1a4d8f)'
const PAGE_BG = 'var(--background)'
const CARD_BG = 'var(--surface-1)'
const BORDER = 'var(--border)'
const BORDER_LIGHT = 'var(--surface-3)'
const TEXT_PRIMARY = 'var(--text-1)'
const TEXT_SECONDARY = 'var(--text-2)'
const TEXT_MUTED = 'var(--text-3)'
const TEXT_HINT = 'var(--text-3)'
const TEXT_FAINT = 'var(--text-3)'

const STORAGE_SCHEMA = 3
const STORAGE_KEY = 'wizard:re-parole-u4u:v3:state'
const REPAROLE_PRICE_DISPLAY = '$15'

const SLOT_ALLOWED_FIELDS: Record<string, ReadonlySet<string>> = {
  passport: new Set([
    'family_name', 'given_name', 'middle_name', 'dob', 'sex',
    'country_of_birth', 'country_of_nationality',
    'passport_number', 'passport_country_of_issuance', 'passport_expiration_date',
  ]),
  i94: new Set([
    'i94_admission_number', 'last_entry_date', 'i94_class_of_admission',
    'status_at_last_entry',
    'passport_number', 'passport_country_of_issuance',
    'family_name', 'given_name', 'dob',
  ]),
  ead: new Set([
    'a_number', 'ead_category_on_card', 'ead_expiration_date',
    'family_name', 'given_name', 'dob', 'sex',
  ]),
  dl: new Set([
    'address', 'us_address_street', 'us_address_city',
    'us_address_state', 'us_address_zip',
    'family_name', 'given_name', 'dob', 'sex',
    'height', 'weight', 'eye_color', 'hair_color',
  ]),
}

const IDENTITY_FIELDS_AUTHORITATIVE: ReadonlySet<string> = new Set([
  'family_name', 'given_name', 'middle_name', 'dob', 'sex',
  'passport_number', 'passport_expiration_date',
  'country_of_nationality', 'country_of_birth',
])

// ─── Types ──────────────────────────────────────────────────────────────────
type LocaleKey = 'uk' | 'ru' | 'en' | 'es'
type Method = 'online' | 'paper'
type EadChoice = 'ead' | 'noead'

export type ExtractionSource =
  | 'ocr_mrz' | 'ocr_visual' | 'ocr_keyword'
  | 'ai_brain' | 'user_input' | 'user_corrected' | 'inferred'

export interface FieldExtraction {
  value: string
  source: ExtractionSource
  requires_review: boolean
  doc_slot: string
  /** Raw OCR string preserved by a safety demotion (value→null). Optional, additive. */
  raw_value?: string | null
}

interface UploadEntry {
  file: File | null
  fileName: string
  status: 'idle' | 'uploading' | 'done' | 'error'
  errorMsg?: string
  fields?: Record<string, FieldExtraction>
  detected_document_type?: string | null
  slot_mismatch?: boolean
  vision_text_length?: number
  brain_status?: 'off' | 'skipped' | 'ran' | 'error'
  // CANONICAL_CONTINUITY: id of the persisted canonical_documents row returned by the
  // Core extract route for THIS document (passport/booklet). Carried into generate-packet.
  // null/absent when continuity=off or the shadow persist failed — never fabricated.
  canonical_document_id?: string | null
}

interface WizardData {
  method?: Method
  ead?: EadChoice
  uploads: Record<string, UploadEntry>
  manual: {
    daytime_phone?: string
    email?: string
    ssn?: string
    marital_status?: string
    hair_color?: string
    // Mailing address — usually from DL but user may type manually too
    mailing_street?: string
    mailing_city?: string
    mailing_state?: string
    mailing_zip?: string
  }
  paid: boolean
  /** Stripe checkout session id from ?cs= after successful payment.
   *  Sent as X-Payment-Token so the server can verify payment. */
  stripeCheckoutId?: string | null
  packetReady: boolean
}

// ─── Localizations (4 locales) ──────────────────────────────────────────────
const T = {
  uk: {
    h1: '🇺🇦 Re-Parole для України',
    sub: 'Ми заповнюємо форму I-131 — ви подаєте самостійно на USCIS',
    stepOf: (n: number) => `Крок ${n} з 5`,
    back: '← Назад',
    restart: '↺ Спочатку',
    edit: 'Змінити',
    notFound: 'Не знайдено — введіть вручну',
    s1q: 'Як ви плануєте подавати?',
    s1h: 'Ми підготуємо I-131 під обраний спосіб',
    s1Online: 'Онлайн', s1OnlineSub: 'Через myUSCIS',
    s1Paper: 'Поштою', s1PaperSub: 'Paper filing',
    s1FeeWarn: '⚠️ Fee waiver (I-912) — тільки поштою. Parole filing fee НЕ підлягає waiver — поточну суму перевірте на uscis.gov/feecalculator.',
    s2q: 'Вам потрібен дозвіл на роботу?',
    s2h: 'В I-131 (Part 9) є галочка — окрема I-765 не потрібна',
    s2Ead: 'Так', s2EadSub: 'Галочка в Part 9',
    s2NoEad: 'Ні', s2NoEadSub: 'Тільки re-parole',
    s3q: 'Завантажте документи',
    s3h: 'Чим більше — тим менше вводити вручну',
    s3Recognize: 'Розпізнати →',
    s4q: 'Перевірте та доповніть',
    s4h: 'Розпізнані дані + те що потрібно ввести вручну',
    s4OcrTitle: '📋 Розпізнані дані',
    s4ManualTitle: '✏️ Заповніть вручну',
    s4AutoTitle: '⚙️ Заповнено автоматично',
    s4Generate: 'Згенерувати →',
    s5q: 'Ваш пакет готовий',
    s5PkgTitle: '📦 Що ви отримуєте',
    s5Pay: '💳 Оплатити',
    s5Download: '⬇ Завантажити пакет (ZIP)',
    s5InstrTitle: '📌 Інструкція подачі',
    s5ChecklistTitle: '📋 Підготуйте самостійно',
    s5TimeWarn: '⚠️ Подавайте не раніше ніж за 180 днів до закінчення паролю. Ранні заявки відхиляють без повернення коштів.',
    s5Disclaimer: 'Messenginfo не подає документи за вас. Ми не юридична фірма.',
    docPassport: { ic: '🛂', lb: 'Закордонний паспорт', ht: 'Перша сторінка + сторінки зі штампами' },
    docI94: { ic: '📄', lb: 'I-94', ht: 'Роздруківка з i94.cbp.dhs.gov' },
    docEad: { ic: '💳', lb: 'EAD карта', ht: 'Передня і задня сторона' },
    docDl: { ic: '🪪', lb: "Driver's License або State ID", ht: 'Обидві сторони' },
    label: {
      family_name: 'Прізвище / Family Name',
      given_name: "Ім'я / Given Name",
      dob: 'Дата народження',
      sex: 'Стать',
      country_of_birth: 'Країна народження',
      country_of_nationality: 'Громадянство',
      passport_number: 'Номер паспорта',
      passport_country_of_issuance: 'Країна видачі паспорта',
      passport_expiration_date: 'Термін дії паспорта',
      i94_admission_number: 'I-94 Number',
      i94_class_of_admission: 'Class of Admission',
      last_entry_date: 'Дата паролю (Paroled on)',
      status_at_last_entry: 'Термін паролю (Admit until)',
      a_number: 'A-Number',
      mailing_street: 'Поштова адреса в США',
      mailing_city: 'Місто',
      mailing_state: 'Штат',
      mailing_zip: 'ZIP',
      phone: 'Телефон',
      email: 'Email',
      ssn: 'SSN',
      marital: 'Сімейний стан',
      hair: 'Колір волосся',
    },
    placeholder: { mailing: 'Street, Apt', city: 'City', state: 'CA', zip: '90001', ssn: 'Якщо є' },
    autoOnlineDocType: 'I am outside the US...',
    autoOnlineReparole: 'Yes',
    autoOnlineCategory: 'Box 10.C — U4U Ukraine',
    autoPaperItem: 'Part 2, Item 1.e — Advance Parole Document',
    autoPaperLabel: 'Маркування: "Ukraine RE-PAROLE" від руки',
    autoStay: 'Expected length of stay: 24 місяці',
    autoPart9Ead: 'Part 9 — EAD: ✓ Включено',
    payErr: 'Помилка платежу. Спробуйте ще раз.',
    packetErr: 'Помилка створення пакета. Спробуйте ще раз або поверніться назад.',
    ocrErr: 'Помилка розпізнавання. Спробуйте ще раз.',
    warnSlotMismatch: '⚠️ Цей файл не схожий на вибраний тип документа.',
    warnIdentity: '⚠️ В одному з ваших документів інші особисті дані. Паспорт — основне джерело.',
  },
  ru: {
    h1: '🇺🇦 Re-Parole для Украины',
    sub: 'Мы заполняем форму I-131 — вы подаёте сами в USCIS',
    stepOf: (n: number) => `Шаг ${n} из 5`,
    back: '← Назад',
    restart: '↺ С начала',
    edit: 'Изменить',
    notFound: 'Не найдено — введите вручную',
    s1q: 'Как вы планируете подавать?',
    s1h: 'Мы подготовим I-131 под выбранный способ',
    s1Online: 'Онлайн', s1OnlineSub: 'Через myUSCIS',
    s1Paper: 'Почтой', s1PaperSub: 'Paper filing',
    s1FeeWarn: '⚠️ Fee waiver (I-912) — только почтой. Parole filing fee НЕ подлежит waiver — текущую сумму проверьте на uscis.gov/feecalculator.',
    s2q: 'Вам нужно разрешение на работу?',
    s2h: 'В I-131 (Part 9) есть галочка — отдельная I-765 не нужна',
    s2Ead: 'Да', s2EadSub: 'Галочка в Part 9',
    s2NoEad: 'Нет', s2NoEadSub: 'Только re-parole',
    s3q: 'Загрузите документы',
    s3h: 'Чем больше — тем меньше вводить вручную',
    s3Recognize: 'Распознать →',
    s4q: 'Проверьте и дополните',
    s4h: 'Распознанные данные + то что нужно ввести вручную',
    s4OcrTitle: '📋 Распознанные данные',
    s4ManualTitle: '✏️ Заполните вручную',
    s4AutoTitle: '⚙️ Заполнено автоматически',
    s4Generate: 'Сгенерировать →',
    s5q: 'Ваш пакет готов',
    s5PkgTitle: '📦 Что вы получаете',
    s5Pay: '💳 Оплатить',
    s5Download: '⬇ Скачать пакет (ZIP)',
    s5InstrTitle: '📌 Инструкция подачи',
    s5ChecklistTitle: '📋 Подготовьте самостоятельно',
    s5TimeWarn: '⚠️ Подавайте не ранее чем за 180 дней до окончания парола. Ранние заявки отклоняют без возврата средств.',
    s5Disclaimer: 'Messenginfo не подаёт документы за вас. Мы не юридическая фирма.',
    docPassport: { ic: '🛂', lb: 'Заграничный паспорт', ht: 'Первая страница + страницы со штампами' },
    docI94: { ic: '📄', lb: 'I-94', ht: 'Распечатка с i94.cbp.dhs.gov' },
    docEad: { ic: '💳', lb: 'EAD карта', ht: 'Передняя и задняя сторона' },
    docDl: { ic: '🪪', lb: "Driver's License или State ID", ht: 'Обе стороны' },
    label: {
      family_name: 'Фамилия / Family Name',
      given_name: 'Имя / Given Name',
      dob: 'Дата рождения',
      sex: 'Пол',
      country_of_birth: 'Страна рождения',
      country_of_nationality: 'Гражданство',
      passport_number: 'Номер паспорта',
      passport_country_of_issuance: 'Страна выдачи паспорта',
      passport_expiration_date: 'Срок действия паспорта',
      i94_admission_number: 'I-94 Number',
      i94_class_of_admission: 'Class of Admission',
      last_entry_date: 'Дата парола (Paroled on)',
      status_at_last_entry: 'Срок парола (Admit until)',
      a_number: 'A-Number',
      mailing_street: 'Почтовый адрес в США',
      mailing_city: 'Город',
      mailing_state: 'Штат',
      mailing_zip: 'ZIP',
      phone: 'Телефон',
      email: 'Email',
      ssn: 'SSN',
      marital: 'Семейное положение',
      hair: 'Цвет волос',
    },
    placeholder: { mailing: 'Street, Apt', city: 'City', state: 'CA', zip: '90001', ssn: 'Если есть' },
    autoOnlineDocType: 'I am outside the US...',
    autoOnlineReparole: 'Yes',
    autoOnlineCategory: 'Box 10.C — U4U Ukraine',
    autoPaperItem: 'Part 2, Item 1.e — Advance Parole Document',
    autoPaperLabel: 'Маркировка: "Ukraine RE-PAROLE" от руки',
    autoStay: 'Expected length of stay: 24 месяца',
    autoPart9Ead: 'Part 9 — EAD: ✓ Включено',
    payErr: 'Ошибка платежа. Попробуйте ещё раз.',
    packetErr: 'Ошибка создания пакета. Попробуйте ещё раз или вернитесь назад.',
    ocrErr: 'Ошибка распознавания. Попробуйте ещё раз.',
    warnSlotMismatch: '⚠️ Этот файл не похож на выбранный тип документа.',
    warnIdentity: '⚠️ В одном из ваших документов другие личные данные. Паспорт — основной источник.',
  },
  en: {
    h1: '🇺🇦 Re-Parole for Ukraine',
    sub: 'We fill out Form I-131 — you file it yourself with USCIS',
    stepOf: (n: number) => `Step ${n} of 5`,
    back: '← Back',
    restart: '↺ Restart',
    edit: 'Edit',
    notFound: 'Not found — enter manually',
    s1q: 'How will you file?',
    s1h: "We'll prepare your I-131 for the chosen method",
    s1Online: 'Online', s1OnlineSub: 'via myUSCIS',
    s1Paper: 'By mail', s1PaperSub: 'Paper filing',
    s1FeeWarn: '⚠️ Fee waiver (I-912) — paper filing only. The parole filing fee is NOT waivable — verify the current amount at uscis.gov/feecalculator.',
    s2q: 'Do you need work authorization?',
    s2h: 'I-131 Part 9 has a checkbox — separate I-765 not required',
    s2Ead: 'Yes', s2EadSub: 'Check box in Part 9',
    s2NoEad: 'No', s2NoEadSub: 'Re-parole only',
    s3q: 'Upload documents',
    s3h: 'More uploads = less to type manually',
    s3Recognize: 'Recognize →',
    s4q: 'Review and complete',
    s4h: 'Extracted data + fields you need to fill manually',
    s4OcrTitle: '📋 Extracted data',
    s4ManualTitle: '✏️ Fill in manually',
    s4AutoTitle: '⚙️ Auto-filled',
    s4Generate: 'Generate →',
    s5q: 'Your packet is ready',
    s5PkgTitle: '📦 What you get',
    s5Pay: '💳 Pay',
    s5Download: '⬇ Download packet (ZIP)',
    s5InstrTitle: '📌 Filing instructions',
    s5ChecklistTitle: '📋 Prepare yourself',
    s5TimeWarn: '⚠️ Do not file earlier than 180 days before your current parole expires. Early applications are rejected without refund.',
    s5Disclaimer: 'Messenginfo does not file for you. We are not a law firm.',
    docPassport: { ic: '🛂', lb: 'International passport', ht: 'First page + stamp pages' },
    docI94: { ic: '📄', lb: 'I-94', ht: 'Printout from i94.cbp.dhs.gov' },
    docEad: { ic: '💳', lb: 'EAD card', ht: 'Front and back' },
    docDl: { ic: '🪪', lb: "Driver's License or State ID", ht: 'Both sides' },
    label: {
      family_name: 'Family Name / Surname',
      given_name: 'Given Name',
      dob: 'Date of Birth',
      sex: 'Sex',
      country_of_birth: 'Country of Birth',
      country_of_nationality: 'Country of Nationality',
      passport_number: 'Passport Number',
      passport_country_of_issuance: 'Passport Country of Issuance',
      passport_expiration_date: 'Passport Expiration Date',
      i94_admission_number: 'I-94 Number',
      i94_class_of_admission: 'Class of Admission',
      last_entry_date: 'Date Paroled (Paroled on)',
      status_at_last_entry: 'Parole Until (Admit until)',
      a_number: 'A-Number',
      mailing_street: 'US Mailing Address',
      mailing_city: 'City',
      mailing_state: 'State',
      mailing_zip: 'ZIP',
      phone: 'Phone',
      email: 'Email',
      ssn: 'SSN',
      marital: 'Marital Status',
      hair: 'Hair Color',
    },
    placeholder: { mailing: 'Street, Apt', city: 'City', state: 'CA', zip: '90001', ssn: 'If any' },
    autoOnlineDocType: 'I am outside the US...',
    autoOnlineReparole: 'Yes',
    autoOnlineCategory: 'Box 10.C — U4U Ukraine',
    autoPaperItem: 'Part 2, Item 1.e — Advance Parole Document',
    autoPaperLabel: 'Mark: handwrite "Ukraine RE-PAROLE"',
    autoStay: 'Expected length of stay: 24 months',
    autoPart9Ead: 'Part 9 — EAD: ✓ Included',
    payErr: 'Payment error. Please try again.',
    packetErr: 'Packet generation error. Try again or go back.',
    ocrErr: 'Recognition error. Try again.',
    warnSlotMismatch: '⚠️ This file does not look like the selected document type.',
    warnIdentity: '⚠️ One of your documents has different personal data. The passport is authoritative.',
  },
  es: {
    h1: '🇺🇦 Re-Parole para Ucrania',
    sub: 'Llenamos el Formulario I-131 — usted lo presenta a USCIS',
    stepOf: (n: number) => `Paso ${n} de 5`,
    back: '← Atrás',
    restart: '↺ Reiniciar',
    edit: 'Editar',
    notFound: 'No encontrado — ingréselo manualmente',
    s1q: '¿Cómo presentará la solicitud?',
    s1h: 'Prepararemos su I-131 según el método elegido',
    s1Online: 'En línea', s1OnlineSub: 'Mediante myUSCIS',
    s1Paper: 'Por correo', s1PaperSub: 'Paper filing',
    s1FeeWarn: '⚠️ Fee waiver (I-912) — solo correo. La tarifa de presentación de parole NO es renunciable — verifique el monto actual en uscis.gov/feecalculator.',
    s2q: '¿Necesita autorización de empleo?',
    s2h: 'La I-131 Parte 9 tiene una casilla — no necesita I-765 separada',
    s2Ead: 'Sí', s2EadSub: 'Casilla en Parte 9',
    s2NoEad: 'No', s2NoEadSub: 'Solo re-parole',
    s3q: 'Cargue los documentos',
    s3h: 'Más cargas = menos por escribir a mano',
    s3Recognize: 'Reconocer →',
    s4q: 'Revise y complete',
    s4h: 'Datos extraídos + campos por llenar manualmente',
    s4OcrTitle: '📋 Datos extraídos',
    s4ManualTitle: '✏️ Llene manualmente',
    s4AutoTitle: '⚙️ Llenado automáticamente',
    s4Generate: 'Generar →',
    s5q: 'Su paquete está listo',
    s5PkgTitle: '📦 Qué recibe',
    s5Pay: '💳 Pagar',
    s5Download: '⬇ Descargar paquete (ZIP)',
    s5InstrTitle: '📌 Instrucciones de presentación',
    s5ChecklistTitle: '📋 Prepare usted mismo',
    s5TimeWarn: '⚠️ No presente antes de 180 días previos al vencimiento del parole actual. Las solicitudes anticipadas se rechazan sin reembolso.',
    s5Disclaimer: 'Messenginfo no presenta documentos por usted. No somos un bufete de abogados.',
    docPassport: { ic: '🛂', lb: 'Pasaporte internacional', ht: 'Primera página + páginas con sellos' },
    docI94: { ic: '📄', lb: 'I-94', ht: 'Impresión desde i94.cbp.dhs.gov' },
    docEad: { ic: '💳', lb: 'Tarjeta EAD', ht: 'Frente y reverso' },
    docDl: { ic: '🪪', lb: "Licencia de conducir o State ID", ht: 'Ambos lados' },
    label: {
      family_name: 'Apellido / Family Name',
      given_name: 'Nombre / Given Name',
      dob: 'Fecha de nacimiento',
      sex: 'Sexo',
      country_of_birth: 'País de nacimiento',
      country_of_nationality: 'Nacionalidad',
      passport_number: 'Número de pasaporte',
      passport_country_of_issuance: 'País emisor del pasaporte',
      passport_expiration_date: 'Fecha de vencimiento del pasaporte',
      i94_admission_number: 'I-94 Number',
      i94_class_of_admission: 'Class of Admission',
      last_entry_date: 'Fecha de parole (Paroled on)',
      status_at_last_entry: 'Parole hasta (Admit until)',
      a_number: 'A-Number',
      mailing_street: 'Dirección postal en EE. UU.',
      mailing_city: 'Ciudad',
      mailing_state: 'Estado',
      mailing_zip: 'ZIP',
      phone: 'Teléfono',
      email: 'Email',
      ssn: 'SSN',
      marital: 'Estado civil',
      hair: 'Color de cabello',
    },
    placeholder: { mailing: 'Street, Apt', city: 'City', state: 'CA', zip: '90001', ssn: 'Si lo tiene' },
    autoOnlineDocType: 'I am outside the US...',
    autoOnlineReparole: 'Yes',
    autoOnlineCategory: 'Box 10.C — U4U Ukraine',
    autoPaperItem: 'Part 2, Item 1.e — Advance Parole Document',
    autoPaperLabel: 'Marca: escriba "Ukraine RE-PAROLE" a mano',
    autoStay: 'Expected length of stay: 24 meses',
    autoPart9Ead: 'Part 9 — EAD: ✓ Incluido',
    payErr: 'Error de pago. Intente de nuevo.',
    packetErr: 'Error generando el paquete. Intente de nuevo o regrese.',
    ocrErr: 'Error de reconocimiento. Intente de nuevo.',
    warnSlotMismatch: '⚠️ Este archivo no parece coincidir con el tipo de documento seleccionado.',
    warnIdentity: '⚠️ Uno de sus documentos tiene datos personales diferentes. El pasaporte es autoritativo.',
  },
} as const

// ─── Component ──────────────────────────────────────────────────────────────
interface Props { locale: string }

/** Normalize Ukrainian passport "place of birth" (oblast/city) to country name. */
function normalizeCountryOfBirth(raw: string, nationality: string): string {
  if (!raw) return nationality || 'Ukraine'
  const lower = raw.toLowerCase().trim()
  if (lower === 'ukraine' || lower === 'україна') return 'Ukraine'
  if (/\bukr/i.test(raw)) return 'Ukraine'
  if (/обл\.?|obl\.?|область|м\.|місто|city|village|район|raion/i.test(raw)) return nationality || 'Ukraine'
  if (raw.length <= 30 && !/[,\/]/.test(raw)) return raw
  return nationality || 'Ukraine'
}

export default function ReparoleWizardV2({ locale }: Props) {
  const t = T[(locale as LocaleKey)] ?? T.uk
  const [step, setStep] = useState(1)
  const [data, setData] = useState<WizardData>({ uploads: {}, manual: {}, paid: false, packetReady: false })
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  // PII CONTAINMENT (Phase A): suppress persistence after terminal success.
  const draftClearedRef = useRef(false)

  // Persist + hydrate ─ same pattern as TPSWizardV2
  useEffect(() => {
    // SERVER LEDGER (V1 #9) — when the flag is ON, the draft (PII) lives
    // server-side encrypted; the browser holds ONLY an opaque httpOnly token
    // cookie. We rehydrate by GETting the ledger instead of reading
    // localStorage. The rebuild logic (applyPersistedDraft) is byte-identical
    // to the localStorage path; only the SOURCE of `parsed` differs. When the
    // flag is OFF this whole branch is skipped and behaviour is unchanged.
    //
    // applyPersistedDraft mirrors the original inline rehydration so both the
    // localStorage (OFF) and ledger (ON) paths share one rebuild — avoiding the
    // class of bug where the two paths drift apart.
    const applyPersistedDraft = (parsed: unknown): void => {
      if (!parsed || typeof parsed !== 'object') return
      const p = parsed as Record<string, unknown> & { schema?: number; lastStep?: number; uploadsMeta?: unknown }
      if (p.schema === STORAGE_SCHEMA) {
        const rebuilt: Record<string, UploadEntry> = {}
        const meta = (p.uploadsMeta || {}) as Record<string, {
          fileName: string
          status: UploadEntry['status']
          fields?: Record<string, FieldExtraction>
          // CANONICAL_CONTINUITY: persisted canonical id survives reload so the resend
          // step can still carry it after the user returns from Stripe checkout.
          canonical_document_id?: string | null
        } | undefined>
        for (const k of Object.keys(meta)) {
          const m = meta[k]
          if (!m) continue
          const allowed = SLOT_ALLOWED_FIELDS[k]
          const clean: Record<string, FieldExtraction> = {}
          if (m.fields) {
            for (const fk of Object.keys(m.fields)) {
              const fx = m.fields[fk]
              if (!fx || typeof fx.value !== 'string') continue
              if (allowed && !allowed.has(fk)) continue
              clean[fk] = fx
            }
          }
          rebuilt[k] = {
            file: null, fileName: m.fileName, status: m.status, fields: clean,
            canonical_document_id: typeof m.canonical_document_id === 'string' ? m.canonical_document_id : null,
          }
        }
        const { uploadsMeta: _u, lastStep: _l, schema: _s, ...rest } = p
        setData((d) => ({ ...d, ...rest, uploads: rebuilt }))
        if (typeof p.lastStep === 'number') setStep(p.lastStep)
      }
    }

    if (isLedgerClientEnabled()) {
      // ON: draft (PII) lives server-side; the browser holds only the opaque
      // token cookie. We still defensively wipe any legacy localStorage keys so
      // no PII lingers from a pre-ledger session. The ledger applies its own
      // server-side TTL; an expired/missing draft yields null → fresh wizard.
      try { localStorage.removeItem('wizard:re-parole-u4u:v2:state') } catch { /* */ }
      try { localStorage.removeItem('wizard:re-parole-u4u:state') } catch { /* */ }
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
      void loadDraftFromServer<unknown>().then((draft) => {
        try {
          if (draft && typeof draft === 'object' && !isDraftExpired((draft as { savedAt?: string }).savedAt)) {
            applyPersistedDraft(draft)
          }
        } catch { /* corrupt/expired draft → fresh wizard */ }
      })
    } else {
      try {
        // Wipe legacy keys defensively
        ['wizard:re-parole-u4u:v2:state', 'wizard:re-parole-u4u:state'].forEach((k) => {
          try { localStorage.removeItem(k) } catch { /* */ }
        })
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          // PII CONTAINMENT (Phase A): hard 24h TTL — discard stale drafts outright.
          if (parsed && typeof parsed === 'object' && isDraftExpired(parsed.savedAt)) {
            try { localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
            throw new Error('draft_expired')
          }
          applyPersistedDraft(parsed)
        }
      } catch { /* */ }
    }
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get('paid') === '1') {
        // Capture the Stripe checkout session id so it can be sent as
        // X-Payment-Token for server-side payment verification.
        const cs = sp.get('cs')
        setData((d) => ({ ...d, paid: true, stripeCheckoutId: cs ?? null }))
        setStep(5)
      }
    }
  }, [])

  // Owner access: skip Stripe if owner session is active
  useEffect(() => {
    fetch('/api/owner/status')
      .then((r) => r.json())
      .then((d) => { if (d?.owner) setData((prev) => ({ ...prev, paid: true })) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // PII CONTAINMENT (Phase A): stop persisting after terminal success.
    if (draftClearedRef.current) return
    try {
      const { uploads, ...rest } = data
      // PII CONTAINMENT (Phase A): persist ONLY {value, requires_review, doc_slot}
      // per field — strip raw OCR text and source traces. canonical_document_id
      // (opaque) is kept for the Stripe carriage.
      const uploadsMeta: Record<string, Pick<UploadEntry, 'fileName' | 'status' | 'fields' | 'canonical_document_id'>> = {}
      for (const k of Object.keys(uploads)) {
        const u = uploads[k]
        uploadsMeta[k] = {
          fileName: u.fileName,
          status: u.status,
          fields: sanitizeFieldMapForStorage('reparole', u.fields) as unknown as UploadEntry['fields'],
          canonical_document_id: u.canonical_document_id,
        }
      }
      const draftRecord = {
        schema: STORAGE_SCHEMA, ...rest, lastStep: step, uploadsMeta,
        savedAt: new Date().toISOString(),
      }
      // SERVER LEDGER (V1 #9): when ON, the draft (PII) is POSTed to the server
      // ledger (encrypted at rest); the browser keeps ONLY the opaque httpOnly
      // token cookie — NOTHING is written to localStorage. When OFF, the
      // localStorage write below runs exactly as before (byte-identical).
      // The serialized record shape is the SAME in both paths so hydrate reuses
      // one rebuild (applyPersistedDraft).
      if (isLedgerClientEnabled()) {
        void saveDraftToServer('reparole', draftRecord)
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draftRecord))
      }
    } catch { /* */ }
  }, [data, step])

  // Merged fields with passport-authoritative identity guard
  const mergedFields = useMemo(() => {
    const merged: Record<string, FieldExtraction> = {}
    const conflicts: Record<string, string[]> = {}
    const passport = data.uploads.passport
    if (passport?.fields) {
      for (const k of Object.keys(passport.fields)) {
        const fx = passport.fields[k]
        if (fx && fx.value) merged[k] = fx
      }
    }
    for (const id of Object.keys(data.uploads)) {
      if (id === 'passport') continue
      const u = data.uploads[id]
      if (!u.fields) continue
      for (const k of Object.keys(u.fields)) {
        const fxRaw = u.fields[k]
        if (!fxRaw) continue
        // UI-AWARE CANDIDATE RENDER (OCR_FIELD_SAFETY incident, 2026-06-11): a safety-
        // demoted value (value→null, raw preserved) must prefill with forced review,
        // not vanish into "Не найдено". Same fix as the TPS wizard ingest.
        const fx = fxRaw.value
          ? fxRaw
          : (fxRaw.raw_value ? { ...fxRaw, value: fxRaw.raw_value, requires_review: true } : null)
        if (!fx || !fx.value) continue
        if (!merged[k]) { merged[k] = fx; continue }
        if (
          IDENTITY_FIELDS_AUTHORITATIVE.has(k) &&
          merged[k].value.toLowerCase().trim() !== fx.value.toLowerCase().trim()
        ) {
          (conflicts[k] ||= []).push(`${id}:${fx.value}`)
          merged[k] = { ...merged[k], requires_review: true }
        }
      }
    }
    ;(merged as Record<string, FieldExtraction> & { __conflicts?: typeof conflicts }).__conflicts =
      Object.keys(conflicts).length > 0 ? conflicts : undefined
    return merged
  }, [data.uploads])

  const goto = useCallback((n: number) => {
    setStep(n); setErrMsg(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleUpload = useCallback(async (id: string, file: File) => {
    setData((d) => ({
      ...d, uploads: { ...d.uploads, [id]: { file, fileName: file.name, status: 'uploading' } },
    }))
    try {
      const fd = new FormData()
      const prepared = await prepareImageForUpload(file)
      fd.append('file', prepared.blob, prepared.name); fd.append('docHint', id)

      // ── Route selection (B3, Phase 2.3) ─────────────────────────────────────
      // passport/booklet → Core route; i94/ead/dl → TPS route (no mapping exists).
      const useCoreRoute = CORE_COVERED_SLOTS.has(id)
      const ocrRoute = useCoreRoute ? '/api/reparole/ocr/extract' : '/api/tps/ocr/extract'

      const r = await fetch(ocrRoute, { method: 'POST', body: fd })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = await r.json()

      const fields: Record<string, FieldExtraction> = {}

      if (useCoreRoute && json?._core === true) {
        // ── Core response shape: ReParoleCoreAnswers ─────────────────────
        // Top-level string fields → wizard FieldExtraction records.
        // date_of_birth (Core) maps to dob (wizard key).
        const CORE_FIELD_MAP: Record<string, string> = {
          family_name: 'family_name',
          given_name: 'given_name',
          middle_name: 'middle_name',
          date_of_birth: 'dob',
          sex: 'sex',
          country_of_birth: 'country_of_birth',
          country_of_nationality: 'country_of_nationality',
          passport_number: 'passport_number',
          passport_expiration_date: 'passport_expiration_date',
          i94_admission_number: 'i94_admission_number',
          last_entry_date: 'last_entry_date',
          i94_class_of_admission: 'i94_class_of_admission',
          a_number: 'a_number',
        }
        const uncertainSet = new Set<string>(
          Array.isArray(json.uncertain_fields) ? json.uncertain_fields : [],
        )
        for (const [coreKey, wizardKey] of Object.entries(CORE_FIELD_MAP)) {
          const v = json[coreKey]
          if (typeof v !== 'string' || !v) continue
          const needsReview = Boolean(json.review_required) || uncertainSet.has(coreKey)
          fields[wizardKey] = {
            value: v,
            source: 'ai_brain',
            requires_review: needsReview,
            doc_slot: id,
          }
        }
      } else {
        // ── Old TPS response shape: json.module.fields array ─────────────
        const modFields = Array.isArray(json?.module?.fields) ? json.module.fields : []
        for (const f of modFields) {
          if (f && typeof f.field === 'string') {
            const v = typeof f.normalized_value === 'string' && f.normalized_value
              ? f.normalized_value
              : typeof f.raw_value === 'string' ? f.raw_value : ''
            if (!v) continue
            const src: ExtractionSource =
              ['ocr_mrz', 'ocr_visual', 'ocr_keyword', 'ai_brain',
               'user_input', 'user_corrected', 'inferred'].includes(f.extraction_source)
                ? (f.extraction_source as ExtractionSource) : 'ocr_visual'
            fields[f.field] = { value: v, source: src, requires_review: Boolean(f.review_required), doc_slot: id }
          }
        }
      }

      // ── CANONICAL_CONTINUITY: capture the persisted canonical id from the Core extract
      //    response. Only the Core route (passport/booklet) persists a canonical; the TPS
      //    fallback route (i94/ead/dl) does not. Store it only when the server returned a
      //    real string — if absent/null (continuity=off or shadow persist failed) store null
      //    so the resend step sends nothing. Never fabricate an id.
      const capturedCanonicalId: string | null =
        useCoreRoute && json?._core === true && typeof json?.canonical_document_id === 'string'
          ? json.canonical_document_id
          : null

      setData((d) => ({
        ...d, uploads: { ...d.uploads, [id]: {
          file, fileName: file.name, status: 'done', fields,
          // Core path doesn't return these diagnostic fields; keep undefined for Core.
          detected_document_type: useCoreRoute ? (json?.doc_type_hint ?? null) : (json?.detected_document_type ?? null),
          slot_mismatch: useCoreRoute ? false : Boolean(json?.slot_mismatch),
          vision_text_length: useCoreRoute ? undefined : (typeof json?.vision_text_length === 'number' ? json.vision_text_length : undefined),
          brain_status: useCoreRoute ? 'ran' : (typeof json?.brain_status === 'string' ? json.brain_status as UploadEntry['brain_status'] : undefined),
          canonical_document_id: capturedCanonicalId,
        } },
      }))
    } catch {
      setData((d) => ({
        ...d, uploads: { ...d.uploads, [id]: {
          file, fileName: file.name, status: 'error', errorMsg: t.ocrErr,
        } },
      }))
    }
  }, [t.ocrErr])

  const handleGenerate = useCallback(async () => {
    setBusy(true); setErrMsg(null)
    try {
      const v = (k: string): string => mergedFields[k]?.value || ''
      const aNum = v('a_number').replace(/\D/g, '')
      // ── CANONICAL_CONTINUITY (RESEND): carry the persisted canonical id for the PRIMARY
      //    identity document. The passport is the authoritative identity source for the
      //    Re-Parole packet (mergedFields is passport-first), and it is the doc whose Core
      //    extract persisted the canonical; the internal-passport booklet is the fallback.
      //    Only the Core route persists, so only these two slots can carry an id. Omit the
      //    field entirely when no id was captured — never send null/undefined/fabricated.
      const canonicalDocumentId: string | null =
        (typeof data.uploads.passport?.canonical_document_id === 'string'
          ? data.uploads.passport.canonical_document_id
          : null) ??
        (typeof data.uploads.booklet?.canonical_document_id === 'string'
          ? data.uploads.booklet.canonical_document_id
          : null)
      const answers = {
        family_name: v('family_name'), given_name: v('given_name'), middle_name: v('middle_name'),
        mailing_street: data.manual.mailing_street || v('us_address_street') || v('address'),
        mailing_city: data.manual.mailing_city || v('us_address_city') || '',
        mailing_state: data.manual.mailing_state || v('us_address_state') || '',
        mailing_zip: data.manual.mailing_zip || v('us_address_zip') || '',
        physical_same_as_mailing: true,
        a_number: aNum,
        dob: v('dob'),
        sex: (v('sex') === 'F' ? 'F' : 'M') as 'M' | 'F',
        country_of_birth: normalizeCountryOfBirth(v('country_of_birth'), v('country_of_nationality')),
        country_of_nationality: v('country_of_nationality') || 'Ukraine',
        passport_number: v('passport_number'),
        passport_country_of_issuance: v('passport_country_of_issuance') || 'Ukraine',
        passport_expiration_date: v('passport_expiration_date'),
        daytime_phone: data.manual.daytime_phone || '',
        email: data.manual.email || '',
        ssn: data.manual.ssn || '',
        marital_status: data.manual.marital_status || '',
        hair_color: data.manual.hair_color || '',
        i94_admission_number: v('i94_admission_number'),
        last_entry_date: v('last_entry_date'),
        ead_requested: data.ead === 'ead',
        filing_method: data.method || 'online',
        // Spread the canonical id only when captured (optional; generate-packet treats it
        // as optional and keeps working in shadow mode when absent).
        ...(canonicalDocumentId ? { canonical_document_id: canonicalDocumentId } : {}),
      }
      const r = await fetch('/api/reparole/generate-packet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Server-side payment gate: send the Stripe checkout session id as the
          // payment token. Owner sessions are verified server-side via cookie and
          // do not need this header.
          ...(data.stripeCheckoutId ? { 'x-payment-token': data.stripeCheckoutId } : {}),
        },
        body: JSON.stringify(answers),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j?.error || `HTTP ${r.status}`)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'reparole-packet-draft.zip'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      // PII CONTAINMENT (Phase A): packet generated = terminal success. Clear the
      // browser-persisted draft (OCR PII) and suppress further persistence.
      draftClearedRef.current = true
      // SERVER LEDGER (V1 #9): clear the persisted draft on terminal success.
      // ON → DELETE the server ledger entry + opaque cookie; OFF → removeItem.
      if (isLedgerClientEnabled()) { void clearServerDraft() } else { try { localStorage.removeItem(STORAGE_KEY) } catch { /* */ } }
      setData((d) => ({ ...d, packetReady: true }))
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : t.packetErr)
    } finally { setBusy(false) }
  }, [data, mergedFields, t.packetErr])

  const restart = useCallback(() => {
    // SERVER LEDGER (V1 #9): start-over clears the persisted draft.
    // ON → DELETE the server ledger entry + opaque cookie; OFF → removeItem.
    if (isLedgerClientEnabled()) { void clearServerDraft() } else { try { localStorage.removeItem(STORAGE_KEY) } catch { /* */ } }
    // Re-enable persistence for the fresh document (cleared on completion).
    draftClearedRef.current = false
    setData({ uploads: {}, manual: {}, paid: false, packetReady: false })
    setStep(1)
  }, [])

  const onEditField = useCallback((key: string, label: string, current: string) => {
    if (typeof window === 'undefined') return
    const next = window.prompt(label, current)
    if (next === null) return
    const trimmed = next.trim()
    if (trimmed === current.trim()) return
    setData((d) => {
      const out = { ...d, uploads: { ...d.uploads } }
      let written = false
      for (const slotId of Object.keys(out.uploads)) {
        const u = out.uploads[slotId]
        if (!u.fields || !u.fields[key]) continue
        out.uploads[slotId] = { ...u, fields: { ...u.fields,
          [key]: { value: trimmed, source: 'user_corrected', requires_review: false, doc_slot: slotId } } }
        written = true; break
      }
      if (!written) {
        const existing = out.uploads.manual
        out.uploads.manual = {
          file: null, fileName: 'manual', status: 'done',
          fields: { ...(existing?.fields ?? {}),
            [key]: { value: trimmed, source: 'user_input', requires_review: false, doc_slot: 'manual' } },
        }
      }
      return out
    })
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────
  const ocrRows: Array<{ key: string; label: string }> = [
    { key: 'family_name', label: t.label.family_name },
    { key: 'given_name', label: t.label.given_name },
    { key: 'dob', label: t.label.dob },
    { key: 'sex', label: t.label.sex },
    { key: 'country_of_birth', label: t.label.country_of_birth },
    { key: 'country_of_nationality', label: t.label.country_of_nationality },
    { key: 'passport_number', label: t.label.passport_number },
    { key: 'passport_country_of_issuance', label: t.label.passport_country_of_issuance },
    { key: 'passport_expiration_date', label: t.label.passport_expiration_date },
    { key: 'i94_admission_number', label: t.label.i94_admission_number },
    { key: 'i94_class_of_admission', label: t.label.i94_class_of_admission },
    { key: 'last_entry_date', label: t.label.last_entry_date },
    { key: 'status_at_last_entry', label: t.label.status_at_last_entry },
    { key: 'a_number', label: t.label.a_number },
  ]

  return (
    <main style={{
      background: PAGE_BG, color: TEXT_PRIMARY, fontSize: 17, lineHeight: 1.6,
      minHeight: '100vh', fontFamily: '-apple-system,"Segoe UI",Roboto,Inter,sans-serif',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', color: GREEN, marginBottom: 2 }}>{t.h1}</h1>
        <p style={{ textAlign: 'center', fontSize: 15, color: TEXT_SECONDARY, marginBottom: 20 }}>{t.sub}</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 }}>
          <button type="button" onClick={() => {
            const ok = typeof window === 'undefined' ? true : window.confirm(t.restart + '?')
            if (ok) restart()
          }} style={{
            background: 'none', border: 'none', fontSize: 13, color: TEXT_MUTED,
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', padding: 0,
          }}>{t.restart}</button>
        </div>
        <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} style={{
              flex: 1, height: 5, background: i <= step ? GREEN : 'var(--surface-3, #e2e5ea)',
              borderRadius: 3, transition: '.3s',
            }} />
          ))}
        </div>

        {/* STEP 1 — method */}
        {step === 1 && (
          <section>
            <Step t={t} n={1} q={t.s1q} h={t.s1h} />
            <Pair value={data.method} onPick={(id) => { setData((d) => ({ ...d, method: id as Method })); goto(2) }}
              options={[
                { id: 'online', label: t.s1Online, sub: t.s1OnlineSub },
                { id: 'paper', label: t.s1Paper, sub: t.s1PaperSub },
              ]} />
            {data.method === 'online' && <Warn>{t.s1FeeWarn}</Warn>}
          </section>
        )}

        {/* STEP 2 — EAD */}
        {step === 2 && (
          <section>
            <Step t={t} n={2} q={t.s2q} h={t.s2h} />
            <Pair value={data.ead} onPick={(id) => { setData((d) => ({ ...d, ead: id as EadChoice })); goto(3) }}
              options={[
                { id: 'ead', label: t.s2Ead, sub: t.s2EadSub },
                { id: 'noead', label: t.s2NoEad, sub: t.s2NoEadSub },
              ]} />
            <Nav back={() => goto(1)} backLabel={t.back} />
          </section>
        )}

        {/* STEP 3 — uploads */}
        {step === 3 && (
          <section>
            <Step t={t} n={3} q={t.s3q} h={t.s3h} />
            <Card>
              {(['passport', 'i94', 'ead', 'dl'] as const).map((slot) => {
                const doc = slot === 'passport' ? t.docPassport :
                            slot === 'i94' ? t.docI94 :
                            slot === 'ead' ? t.docEad : t.docDl
                return <UploadDrop key={slot} id={slot} doc={doc} entry={data.uploads[slot]} onPick={handleUpload} />
              })}
            </Card>
            <Nav back={() => goto(2)} next={() => goto(4)} backLabel={t.back} nextLabel={t.s3Recognize} />
          </section>
        )}

        {/* STEP 4 — review */}
        {step === 4 && (
          <section>
            <Step t={t} n={4} q={t.s4q} h={t.s4h} />
            {/* Banners */}
            {(() => {
              const banners: React.ReactNode[] = []
              for (const slotId of Object.keys(data.uploads)) {
                const u = data.uploads[slotId]
                if (u.status === 'done' && u.slot_mismatch) {
                  banners.push(
                    <div key={`m-${slotId}`} style={{ background: WARN_BG, border: `1.5px solid ${WARN_BORDER}`,
                      borderRadius: 12, padding: 12, fontSize: 14, color: WARN_TEXT, marginBottom: 12 }}>
                      {t.warnSlotMismatch} {u.fileName ? `(${u.fileName})` : ''}
                    </div>,
                  )
                }
              }
              const conflicts = (mergedFields as Record<string, FieldExtraction> & {
                __conflicts?: Record<string, string[]> }).__conflicts
              if (conflicts && Object.keys(conflicts).length > 0) {
                banners.push(
                  <div key="conflict" style={{ background: WARN_BG, border: `1.5px solid ${WARN_BORDER}`,
                    borderRadius: 12, padding: 12, fontSize: 14, color: WARN_TEXT, marginBottom: 12 }}>
                    {t.warnIdentity}
                  </div>,
                )
              }
              return banners
            })()}

            <Card title={t.s4OcrTitle}>
              {ocrRows.map((r) => {
                const fx = mergedFields[r.key]
                if (fx && fx.value) {
                  return <RW key={r.key} label={r.label} value={fx.value}
                    onEdit={() => onEditField(r.key, r.label, fx.value)} editLabel={t.edit} />
                }
                return <RW key={r.key} label={r.label} value={t.notFound} missing
                  onEdit={() => onEditField(r.key, r.label, '')} editLabel={t.edit} />
              })}
            </Card>

            <Card title={t.s4ManualTitle}>
              <Field label={t.label.phone} value={data.manual.daytime_phone || ''} placeholder="2131234567"
                inputMode="tel" maxLength={10}
                onChange={(v) => setData((d) => ({ ...d, manual: { ...d.manual, daytime_phone: v.replace(/\D/g, '').slice(0, 10) } }))} />
              <Field label={t.label.email} value={data.manual.email || ''}
                onChange={(v) => setData((d) => ({ ...d, manual: { ...d.manual, email: v } }))} />
              <Field label={t.label.ssn} placeholder={t.placeholder.ssn} value={data.manual.ssn || ''}
                onChange={(v) => setData((d) => ({ ...d, manual: { ...d.manual, ssn: v } }))} />
              {/* 2026-05-20: same DL-OCR auto-fill we added to the TPS
                  wizard. mailing_* inputs now show the OCR'd value as
                  a fallback when the user hasn't typed anything. User
                  edit still goes into manual state (priority). The
                  submit path already had this fallback (line 605-608)
                  but the UI didn't, so users saw an empty placeholder
                  even when the DL OCR clearly extracted everything. */}
              <Field label={t.label.mailing_street} placeholder={t.placeholder.mailing}
                value={data.manual.mailing_street || mergedFields.us_address_street?.value || ''}
                onChange={(v) => setData((d) => ({ ...d, manual: { ...d.manual, mailing_street: v } }))} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Field label={t.label.mailing_city} placeholder={t.placeholder.city}
                  value={data.manual.mailing_city || mergedFields.us_address_city?.value || ''}
                  onChange={(v) => setData((d) => ({ ...d, manual: { ...d.manual, mailing_city: v } }))} />
                <Field label={t.label.mailing_state} placeholder={t.placeholder.state}
                  value={data.manual.mailing_state || mergedFields.us_address_state?.value || ''}
                  onChange={(v) => setData((d) => ({ ...d, manual: { ...d.manual, mailing_state: v } }))} />
                <Field label={t.label.mailing_zip} placeholder={t.placeholder.zip}
                  value={data.manual.mailing_zip || mergedFields.us_address_zip?.value || ''}
                  onChange={(v) => setData((d) => ({ ...d, manual: { ...d.manual, mailing_zip: v } }))} />
              </div>
            </Card>

            <Card title={t.s4AutoTitle}>
              {data.method === 'paper' ? (
                <>
                  <RWAuto label={t.autoPaperItem} value="✓" />
                  <RWAuto label={t.autoPaperLabel} value="✓" />
                </>
              ) : (
                <>
                  <RWAuto label="Document type" value={t.autoOnlineDocType} />
                  <RWAuto label="Re-parole?" value={t.autoOnlineReparole} />
                  <RWAuto label="Category" value={t.autoOnlineCategory} />
                </>
              )}
              <RWAuto label={t.autoStay} value="24" />
              {data.ead === 'ead' && <RWAuto label={t.autoPart9Ead} value="✓" />}
            </Card>

            <Nav back={() => goto(3)} next={() => goto(5)} backLabel={t.back} nextLabel={t.s4Generate} />
          </section>
        )}

        {/* STEP 5 — pay + download */}
        {step === 5 && (
          <section>
            <Step t={t} n={5} q={t.s5q} h="" />
            <Card title={t.s5PkgTitle}>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {[
                  `Form I-131 (PDF) — edition 01/20/25`,
                  data.method === 'paper' ? 'Part 2: 1.e + "Ukraine RE-PAROLE" mark' : 'Online myUSCIS transfer guide',
                  data.ead === 'ead' ? 'Part 9: EAD request included' : null,
                  'Part 3: biometrics fields filled',
                  'Step-by-step filing instructions',
                  'Self-prep checklist',
                ].filter(Boolean).map((line, i) => (
                  <li key={i} style={{ padding: '6px 0 6px 26px', position: 'relative', fontSize: 15 }}>
                    <span style={{ position: 'absolute', left: 0, color: GREEN, fontWeight: 800 }}>✓</span>
                    {line}
                  </li>
                ))}
              </ul>
            </Card>

            {!data.paid && (
              <button type="button" disabled={busy}
                onClick={async () => {
                  setBusy(true); setErrMsg(null)
                  try {
                    let wizardId: string | null = null
                    try {
                      wizardId = localStorage.getItem('wizard:re-parole-u4u:v3:id')
                      if (!wizardId) {
                        wizardId = `reparole-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                        localStorage.setItem('wizard:re-parole-u4u:v3:id', wizardId)
                      }
                    } catch { /* */ }
                    const r = await fetch('/api/stripe/checkout', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ product: 're-parole-u4u', locale, session_id: wizardId }),
                    })
                    if (!r.ok) {
                      const j = await r.json().catch(() => ({}))
                      throw new Error(j?.error || `HTTP ${r.status}`)
                    }
                    const { url } = await r.json()
                    if (url) window.location.href = url
                    else throw new Error('No checkout URL')
                  } catch (e) {
                    setErrMsg(e instanceof Error ? e.message : t.payErr)
                    setBusy(false)
                  }
                }}
                style={{
                  background: PAY_BLUE, color: '#fff', fontSize: 20, padding: 18, borderRadius: 14,
                  border: 'none', width: '100%', cursor: busy ? 'wait' : 'pointer', fontWeight: 800,
                  marginBottom: 10, fontFamily: 'inherit', opacity: busy ? 0.7 : 1,
                }}
                onMouseOver={(e) => !busy && (e.currentTarget.style.background = PAY_BLUE_DARK)}
                onMouseOut={(e) => !busy && (e.currentTarget.style.background = PAY_BLUE)}>
                {busy ? '…' : `${t.s5Pay} — ${REPAROLE_PRICE_DISPLAY}`}
              </button>
            )}

            {data.paid && (
              <button type="button" disabled={busy} onClick={handleGenerate}
                style={{
                  background: GREEN, color: '#fff', fontSize: 20, padding: 18, borderRadius: 14,
                  border: 'none', width: '100%', cursor: busy ? 'wait' : 'pointer', fontWeight: 800,
                  marginBottom: 10, fontFamily: 'inherit', opacity: busy ? 0.7 : 1,
                }}
                onMouseOver={(e) => !busy && (e.currentTarget.style.background = GREEN_DARK)}
                onMouseOut={(e) => !busy && (e.currentTarget.style.background = GREEN)}>
                {busy ? '…' : t.s5Download}
              </button>
            )}

            {errMsg && (
              <div style={{ background: 'var(--error-bg, #fdecea)', border: '1.5px solid var(--error-border, #d33)', borderRadius: 12,
                padding: 12, fontSize: 14, color: 'var(--error-text, #a33)', marginBottom: 12 }}>{errMsg}</div>
            )}

            <Warn>{t.s5TimeWarn}</Warn>
            <div style={{ textAlign: 'center', fontSize: 12, color: TEXT_MUTED, marginTop: 14,
              padding: 12, background: 'var(--surface-2)', borderRadius: 12 }}>
              {t.s5Disclaimer}
            </div>
            <Nav back={() => goto(4)} backLabel={t.back} />
          </section>
        )}
      </div>
    </main>
  )
}

// ─── Tiny shared subcomponents ──────────────────────────────────────────────
function Step({ t, n, q, h }: { t: (typeof T)[LocaleKey]; n: number; q: string; h: string }) {
  return (
    <>
      <div style={{ fontSize: 14, color: TEXT_FAINT, marginBottom: 4 }}>{t.stepOf(n)}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 3 }}>{q}</div>
      {h && <div style={{ fontSize: 15, color: TEXT_MUTED, marginBottom: 16 }}>{h}</div>}
    </>
  )
}

function Pair({ value, onPick, options }: {
  value?: string
  onPick: (id: string) => void
  options: Array<{ id: string; label: string; sub: string }>
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      {options.map((o) => {
        const active = value === o.id
        return (
          <button key={o.id} type="button" onClick={() => onPick(o.id)} style={{
            flex: 1, padding: '16px 8px',
            border: `2.5px solid ${active ? GREEN : BORDER}`, borderRadius: 14,
            background: active ? GREEN : CARD_BG, color: active ? '#fff' : TEXT_PRIMARY,
            cursor: 'pointer', fontSize: 18, fontWeight: 700, fontFamily: 'inherit',
            transition: '.15s',
          }}>
            {o.label}
            <small style={{ display: 'block', fontSize: 14, fontWeight: 400, marginTop: 3, opacity: 0.7 }}>{o.sub}</small>
          </button>
        )
      })}
    </div>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD_BG, borderRadius: 14, padding: 16, marginBottom: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      {title && <div style={{ fontSize: 18, fontWeight: 800, color: GREEN, marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  )
}

function UploadDrop({ id, doc, entry, onPick }: {
  id: string
  doc: { ic: string; lb: string; ht: string }
  entry?: UploadEntry
  onPick: (id: string, f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const ok = entry?.status === 'done'
  const uploading = entry?.status === 'uploading'
  const err = entry?.status === 'error'
  return (
    <div onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
      style={{
        border: `2.5px ${ok ? 'solid' : 'dashed'} ${ok ? GREEN : err ? 'var(--error-border, #d33)' : BORDER}`,
        borderRadius: 14, padding: 18, textAlign: 'center', cursor: 'pointer',
        marginBottom: 10, background: ok ? 'var(--success-bg, #e6f4ea)' : err ? 'var(--error-bg, #fdecea)' : CARD_BG,
        opacity: uploading ? 0.7 : 1, transition: '.2s',
      }}>
      <div style={{ fontSize: 40, marginBottom: 4 }}>{doc.ic}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: ok ? GREEN : err ? 'var(--error-text, #a33)' : TEXT_PRIMARY }}>
        {doc.lb} {ok && '✓'} {uploading && '⏳'}
      </div>
      <div style={{ fontSize: 14, color: TEXT_HINT, marginTop: 3 }}>
        {err ? entry?.errorMsg : doc.ht}
      </div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(id, f) }} />
    </div>
  )
}

function RW({ label, value, onEdit, editLabel, missing }: {
  label: string; value: string; onEdit: () => void; editLabel: string; missing?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: `1px solid ${BORDER_LIGHT}`, gap: 12,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, color: TEXT_MUTED }}>{label}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {missing ? (
          <div style={{ fontSize: 14, fontStyle: 'italic', color: TEXT_MUTED, textAlign: 'right', maxWidth: 240 }}>{value}</div>
        ) : (
          <div style={{ fontSize: 17, fontWeight: 700, textAlign: 'right' }}>{value}</div>
        )}
        <button type="button" onClick={onEdit} style={{
          background: 'none', border: 'none', fontSize: 14, color: GREEN,
          cursor: 'pointer', marginLeft: 8, textDecoration: 'underline', fontFamily: 'inherit',
        }}>{editLabel}</button>
      </div>
    </div>
  )
}

function RWAuto({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0',
      borderBottom: `1px solid ${BORDER_LIGHT}` }}>
      <div style={{ fontSize: 14, color: TEXT_MUTED }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function Field({ label, placeholder, value, onChange, inputMode, maxLength }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void
  inputMode?: 'text' | 'tel' | 'email' | 'numeric'; maxLength?: number
}) {
  return (
    <div style={{ marginBottom: 2, flex: 1 }}>
      <div style={{ fontSize: 15, color: TEXT_MUTED }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || label}
        inputMode={inputMode} maxLength={maxLength}
        style={{
          width: '100%', padding: '10px 12px',
          border: `1.5px solid ${BORDER}`, borderRadius: 10,
          fontSize: 17, margin: '4px 0 10px', fontFamily: 'inherit',
        }} />
    </div>
  )
}

function Nav({ back, next, backLabel, nextLabel }: {
  back?: () => void; next?: () => void; backLabel: string; nextLabel?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
      {back && (
        <button type="button" onClick={back} style={{
          flex: 1, padding: 16, border: 'none', borderRadius: 14,
          fontSize: 18, fontWeight: 800, cursor: 'pointer',
          background: 'var(--surface-2, #eee)', color: TEXT_SECONDARY, fontFamily: 'inherit',
        }}>{backLabel}</button>
      )}
      {next && nextLabel && (
        <button type="button" onClick={next} style={{
          flex: 1, padding: 16, border: 'none', borderRadius: 14,
          fontSize: 18, fontWeight: 800, cursor: 'pointer',
          background: GREEN, color: '#fff', fontFamily: 'inherit',
        }}>{nextLabel}</button>
      )}
    </div>
  )
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: WARN_BG, border: `1.5px solid ${WARN_BORDER}`, borderRadius: 12,
      padding: 12, fontSize: 14, color: WARN_TEXT, marginBottom: 12,
    }}>{children}</div>
  )
}
