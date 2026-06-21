/**
 * EADWizard.tsx
 *
 * Self-contained 7-step wizard for I-765 EAD preparation.
 * All 4 locales inline. Client-side only — no backend required.
 *
 * REGULATORY COPY VERIFIED 2026-05-06:
 *   - Form I-765, current edition: verify at uscis.gov/i-765 before filing
 *   - Category (c)(11): parolee granted humanitarian/public-benefit parole
 *     (8 CFR 274a.12(c)(11)) — applies to U4U re-parole recipients
 *   - Category (c)(8): pending asylum applicant (I-589 filed)
 *   - Category (a)(12): TPS recipient
 *   - 540-day auto-extension: file before EAD expires → automatic extension
 *   - DO NOT file (c)(11) before I-131 re-parole is approved
 *   - Fee: never hardcoded — always refer to uscis.gov/feecalculator
 *   - Source: uscis.gov/i-765 (verified 2026-05-06)
 *
 * Not legal advice. Not a law firm. You file yourself with USCIS.
 *
 * B4 Upload Prefill (Phase 2.4: unconditional — flag removed):
 *   Upload step (step 2) always shown before personal info.
 *   User can upload passport / EAD card / I-94 for OCR prefill.
 *   POST /api/ead/ocr/extract → EadCoreAnswers → prefill form fields.
 *   Source gates: A-number/category only from EAD/I-797 source.
 *   I-94 fields only from I-94 source. Address only from DL/manual.
 *   invented_fields_count is always 0.
 */
'use client'

import { useRef, useState } from 'react'
import {
  ChevronRight, ChevronLeft, Download, CheckCircle,
  AlertTriangle, ExternalLink, Info, Upload
} from 'lucide-react'
import { prepareImageForUpload } from '@/lib/upload/prepareImageForUpload'

// docHints the EAD Core route accepts (see mapEadHintToDocintelId in route.ts)
// Phase 2.4: upload step always shown — Core unconditional.
const EAD_CORE_HINTS = ['passport', 'ead', 'i94'] as const
type EadDocHint = (typeof EAD_CORE_HINTS)[number]

// ── Types ─────────────────────────────────────────────────────────────────────

type AppType = 'new' | 'renewal' | null
type Category = 'c11' | 'c08' | 'a12' | 'other' | null
type FilingMethod = 'mail' | 'online' | ''

interface EADFormData {
  appType: AppType
  category: Category
  firstName: string
  lastName: string
  middleName: string
  dob: string
  countryOfBirth: string
  alienNumber: string
  gender: 'male' | 'female' | 'nonbinary' | ''
  hasPassport: boolean
  hasI94: boolean
  hasI131Approval: boolean
  hasPreviousEAD: boolean
  hasPhotos: boolean
  filingMethod: FilingMethod
  usAddress: string
}

const EMPTY: EADFormData = {
  appType: null,
  category: null,
  firstName: '',
  lastName: '',
  middleName: '',
  dob: '',
  countryOfBirth: '',
  alienNumber: '',
  gender: '',
  hasPassport: false,
  hasI94: false,
  hasI131Approval: false,
  hasPreviousEAD: false,
  hasPhotos: false,
  filingMethod: '',
  usAddress: '',
}

// ── Upload state ───────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

interface EadUploadState {
  status: UploadStatus
  hint: EadDocHint
  fileName?: string
  errorMsg?: string
  /** Non-null when OCR returned prefillable fields */
  prefillApplied?: boolean
}

// ── Locale strings ────────────────────────────────────────────────────────────

const UPLOAD_UI: Record<string, {
  title: string
  sub: string
  hintPassport: string
  hintEad: string
  hintI94: string
  select: string
  uploading: string
  prefillDone: string
  prefillHint: string
  skip: string
  error: string
  retry: string
  reviewNote: string
}> = {
  en: {
    title: 'Quick Prefill (Optional)',
    sub: 'Upload a document to automatically fill in your personal information. You can edit all fields afterward.',
    hintPassport: 'Passport (photo page)',
    hintEad: 'EAD Card (front)',
    hintI94: 'Form I-94',
    select: 'Select document type and upload',
    uploading: 'Reading document…',
    prefillDone: '✓ Fields prefilled. Review and correct below.',
    prefillHint: 'Always verify your information before filing with USCIS.',
    skip: 'Skip — enter manually',
    error: 'Could not read document. Enter information manually.',
    retry: 'Try again',
    reviewNote: 'Some fields may need review — please verify before filing.',
  },
  uk: {
    title: 'Швидке заповнення (Необов\'язково)',
    sub: 'Завантажте документ, щоб автоматично заповнити особисту інформацію. Ви зможете відредагувати всі поля.',
    hintPassport: 'Паспорт (сторінка з фото)',
    hintEad: 'Картка EAD (лицева сторона)',
    hintI94: 'Форма I-94',
    select: 'Оберіть тип документа і завантажте',
    uploading: 'Читаємо документ…',
    prefillDone: '✓ Поля заповнені. Перевірте нижче.',
    prefillHint: 'Завжди перевіряйте інформацію перед поданням до USCIS.',
    skip: 'Пропустити — ввести вручну',
    error: 'Не вдалося прочитати документ. Введіть інформацію вручну.',
    retry: 'Спробувати ще',
    reviewNote: 'Деякі поля потребують перевірки — будь ласка, підтвердьте перед поданням.',
  },
  ru: {
    title: 'Быстрое заполнение (Необязательно)',
    sub: 'Загрузите документ для автоматического заполнения личных данных. Все поля можно отредактировать.',
    hintPassport: 'Паспорт (страница с фото)',
    hintEad: 'Карточка EAD (лицевая сторона)',
    hintI94: 'Форма I-94',
    select: 'Выберите тип документа и загрузите',
    uploading: 'Читаем документ…',
    prefillDone: '✓ Поля заполнены. Проверьте ниже.',
    prefillHint: 'Всегда проверяйте информацию перед подачей в USCIS.',
    skip: 'Пропустить — ввести вручную',
    error: 'Не удалось прочитать документ. Введите информацию вручную.',
    retry: 'Попробовать ещё раз',
    reviewNote: 'Некоторые поля требуют проверки — пожалуйста, подтвердите перед подачей.',
  },
  es: {
    title: 'Llenado Rápido (Opcional)',
    sub: 'Suba un documento para completar automáticamente su información personal. Puede editar todos los campos después.',
    hintPassport: 'Pasaporte (página de foto)',
    hintEad: 'Tarjeta EAD (frente)',
    hintI94: 'Formulario I-94',
    select: 'Seleccione el tipo de documento y suba',
    uploading: 'Leyendo documento…',
    prefillDone: '✓ Campos completados. Revise a continuación.',
    prefillHint: 'Siempre verifique su información antes de presentar ante USCIS.',
    skip: 'Omitir — ingresar manualmente',
    error: 'No se pudo leer el documento. Ingrese la información manualmente.',
    retry: 'Intentar de nuevo',
    reviewNote: 'Algunos campos pueden necesitar revisión — verifique antes de presentar.',
  },
}

const UI: Record<string, {
  // Step 0
  step0Title: string; step0Sub: string; newEAD: string; newEADDesc: string
  renewEAD: string; renewEADDesc: string; notLegal: string
  // Step 1
  step1Title: string; step1Sub: string
  c11Label: string; c11Desc: string; c11Cat: string; c11Warning: string
  c08Label: string; c08Desc: string; c08Cat: string
  a12Label: string; a12Desc: string; a12Cat: string
  otherLabel: string; otherDesc: string
  // Step 2
  step2Title: string; step2Sub: string
  firstName: string; lastName: string; middleName: string
  dob: string; countryOfBirth: string; alienNumber: string; alienHint: string
  genderLabel: string; genderMale: string; genderFemale: string; genderOther: string
  // Step 3
  step3Title: string; step3Sub: string; missingRequired: string
  // Step 4
  step4Title: string; step4Sub: string
  filingMail: string; filingMailDesc: string; filingOnline: string; filingOnlineDesc: string
  addressLabel: string; addressHint: string; checkAddress: string
  // Step 5
  step5Title: string; step5Sub: string
  lblType: string; lblCategory: string; lblPersonal: string; lblDocs: string; lblFiling: string
  // Step 6
  step6Title: string; step6Sub: string
  downloadBtn: string; downloaded: string; downloadHint: string; downloadAgain: string
  officialFormLink: string; feeLink: string; autoExt: string
  // Nav / shared
  next: string; back: string; edit: string; required: string; optional: string
  stepLabels: string[]
  stepLabelsNoUpload: string[]
  catNames: Record<string, string>
  appTypeNames: Record<string, string>
  filingNames: Record<string, string>
  disclaimer: string
}> = {
  en: {
    step0Title: 'EAD Work Permit — I-765 Preparation',
    step0Sub: 'Prepare your I-765 filing packet in ~15 minutes. You review, sign, and submit yourself to USCIS.',
    newEAD: 'New EAD',
    newEADDesc: 'Applying for the first time',
    renewEAD: 'EAD Renewal',
    renewEADDesc: 'My current EAD expires within 6 months',
    notLegal: 'Self-help preparation tool only. Not legal advice. Not a law firm. You file yourself with USCIS.',
    step1Title: 'Your Immigration Status',
    step1Sub: 'Select the category that best describes your current status.',
    c11Label: 'U4U Re-Parole — I-131 Approved',
    c11Desc: 'Parole granted for urgent humanitarian reasons',
    c11Cat: 'Category (c)(11) — 8 CFR 274a.12(c)(11)',
    c11Warning: '⚠ Only file Form I-765 under (c)(11) AFTER your Form I-131 Re-Parole has been approved by USCIS. Filing before approval may result in rejection.',
    c08Label: 'Pending Asylum — I-589 Filed',
    c08Desc: 'Asylum application filed, case pending with USCIS or EOIR',
    c08Cat: 'Category (c)(8) — 8 CFR 274a.12(c)(8)',
    a12Label: 'TPS Ukraine Recipient',
    a12Desc: 'Temporary Protected Status for Ukrainians',
    a12Cat: 'Category (a)(12) — 8 CFR 274a.12(a)(12)',
    otherLabel: 'Other / Not Sure',
    otherDesc: 'Consult uscis.gov/i-765 or an immigration attorney to identify your eligibility category.',
    step2Title: 'Personal Information',
    step2Sub: 'Enter information exactly as it appears in your passport or travel document.',
    firstName: 'First Name (Given Name)',
    lastName: 'Last Name (Family Name)',
    middleName: 'Middle Name (if on passport)',
    dob: 'Date of Birth',
    countryOfBirth: 'Country of Birth',
    alienNumber: 'A-Number (Alien Registration Number)',
    alienHint: 'Your A-Number starts with "A" and appears on your I-94, EAD card, or USCIS notices. Leave blank if you do not have one.',
    genderLabel: 'Gender (as it appears on your passport)',
    genderMale: 'Male',
    genderFemale: 'Female',
    genderOther: 'Another gender identity',
    step3Title: 'Documents Checklist',
    step3Sub: 'Check off documents you currently have available.',
    missingRequired: '⚠ You are missing required items. Gather them before filing.',
    step4Title: 'Filing Method',
    step4Sub: 'How will you submit your I-765 application?',
    filingMail: 'File by Mail',
    filingMailDesc: 'Print, sign, and mail to the USCIS Lockbox facility',
    filingOnline: 'File Online',
    filingOnlineDesc: 'Submit at my.uscis.gov (most categories supported)',
    addressLabel: 'Your Current U.S. Mailing Address',
    addressHint: 'USCIS will mail your EAD card to this address. Use a stable address.',
    checkAddress: 'The correct USCIS Lockbox mailing address depends on your state and eligibility category. Verify at uscis.gov/i-765 before mailing.',
    step5Title: 'Review Your Information',
    step5Sub: 'Confirm everything is correct before generating your preparation packet.',
    lblType: 'Application Type',
    lblCategory: 'Eligibility Category',
    lblPersonal: 'Personal Information',
    lblDocs: 'Documents Ready',
    lblFiling: 'Filing Method',
    step6Title: 'Your I-765 Preparation Packet is Ready',
    step6Sub: 'Download your worksheet, then complete the official Form I-765 from uscis.gov/i-765.',
    downloadBtn: '⬇ Download Preparation Worksheet (.html)',
    downloaded: '✓ Download started.',
    downloadHint: 'Open in browser → File → Print → Save as PDF. Use this as a reference when filling official Form I-765.',
    downloadAgain: 'Download again',
    officialFormLink: 'Get official Form I-765 at uscis.gov/i-765 →',
    feeLink: 'Check filing fee at uscis.gov/feecalculator →',
    autoExt: '540-day auto-extension: Filing I-765 renewal before your EAD expires activates an automatic 540-day work authorization extension.',
    next: 'Continue →',
    back: '← Back',
    edit: 'Edit',
    required: 'Required',
    optional: 'Optional',
    stepLabels: ['Type', 'Status', 'Upload', 'Info', 'Docs', 'Filing', 'Review', 'Download'],
    stepLabelsNoUpload: ['Type', 'Status', 'Info', 'Docs', 'Filing', 'Review', 'Download'],
    catNames: { c11: '(c)(11) — Re-Parole', c08: '(c)(8) — Pending Asylum', a12: '(a)(12) — TPS Ukraine', other: 'Other / Not sure' },
    appTypeNames: { new: 'New EAD', renewal: 'EAD Renewal' },
    filingNames: { mail: 'By Mail (USCIS Lockbox)', online: 'Online (my.uscis.gov)' },
    disclaimer: 'This worksheet is a self-help preparation tool. Messenginfo is not a law firm and does not provide legal advice. The official Form I-765 and current instructions are available at uscis.gov/i-765. USCIS policies and fees change — always verify current requirements before filing.',
  },
  uk: {
    step0Title: 'Дозвіл на роботу EAD — Підготовка I-765',
    step0Sub: 'Підготуйте пакет I-765 приблизно за 15 хвилин. Ви самостійно перевіряєте, підписуєте та подаєте до USCIS.',
    newEAD: 'Новий EAD',
    newEADDesc: 'Подаю вперше',
    renewEAD: 'Продовження EAD',
    renewEADDesc: 'Мій EAD закінчується протягом 6 місяців',
    notLegal: 'Лише інструмент самопідготовки. Не юридична консультація. Не юридична фірма. Ви подаєте самостійно до USCIS.',
    step1Title: 'Ваш імміграційний статус',
    step1Sub: 'Оберіть категорію, яка найкраще відповідає вашій ситуації.',
    c11Label: 'U4U Re-Parole — I-131 Затверджено',
    c11Desc: 'Паролл виданий з гуманітарних причин',
    c11Cat: 'Категорія (c)(11) — 8 CFR 274a.12(c)(11)',
    c11Warning: '⚠ Подавайте форму I-765 за категорією (c)(11) ЛИШЕ ПІСЛЯ того, як USCIS затвердить вашу форму I-131 Re-Parole. Подача до затвердження може призвести до відмови.',
    c08Label: 'Очікується рішення по притулку — I-589 подано',
    c08Desc: 'Заява на притулок подана, справа розглядається',
    c08Cat: 'Категорія (c)(8) — 8 CFR 274a.12(c)(8)',
    a12Label: 'TPS Україна (Тимчасовий захищений статус)',
    a12Desc: 'Тимчасовий захищений статус для українців',
    a12Cat: 'Категорія (a)(12) — 8 CFR 274a.12(a)(12)',
    otherLabel: 'Інше / Не впевнений(на)',
    otherDesc: 'Перевірте uscis.gov/i-765 або зверніться до імміграційного адвоката.',
    step2Title: 'Особиста інформація',
    step2Sub: 'Вводьте дані точно так, як вони вказані у вашому паспорті.',
    firstName: "Ім'я (Given Name)",
    lastName: 'Прізвище (Family Name)',
    middleName: 'По батькові (якщо є в паспорті)',
    dob: 'Дата народження',
    countryOfBirth: 'Країна народження',
    alienNumber: 'A-Number (номер іноземного громадянина)',
    alienHint: 'A-Number починається з "A" і вказаний на I-94, картці EAD або повідомленнях USCIS. Залиште порожнім, якщо немає.',
    genderLabel: 'Стать (як у паспорті)',
    genderMale: 'Чоловіча',
    genderFemale: 'Жіноча',
    genderOther: 'Інша гендерна ідентичність',
    step3Title: 'Перелік документів',
    step3Sub: 'Відмітьте документи, які у вас зараз є.',
    missingRequired: '⚠ Бракує обов\'язкових документів. Зберіть їх перед подачею.',
    step4Title: 'Спосіб подачі',
    step4Sub: 'Як ви будете подавати заяву I-765?',
    filingMail: 'Поштою',
    filingMailDesc: 'Роздрукуйте, підпишіть і надішліть до скриньки USCIS Lockbox',
    filingOnline: 'Онлайн',
    filingOnlineDesc: 'Подайте на my.uscis.gov (підтримується для більшості категорій)',
    addressLabel: 'Ваша поточна поштова адреса в США',
    addressHint: 'USCIS надішле картку EAD на цю адресу.',
    checkAddress: 'Правильна адреса скриньки USCIS залежить від вашого штату та категорії. Перевірте на uscis.gov/i-765 перед відправкою.',
    step5Title: 'Перегляд інформації',
    step5Sub: 'Перевірте все перед завантаженням пакету.',
    lblType: 'Тип заяви',
    lblCategory: 'Категорія',
    lblPersonal: 'Особисті дані',
    lblDocs: 'Готові документи',
    lblFiling: 'Спосіб подачі',
    step6Title: 'Ваш пакет I-765 готовий',
    step6Sub: 'Завантажте робочий лист, потім заповніть офіційну форму I-765 з uscis.gov/i-765.',
    downloadBtn: '⬇ Завантажити робочий лист (.html)',
    downloaded: '✓ Завантаження розпочато.',
    downloadHint: 'Відкрийте у браузері → Файл → Друк → Зберегти як PDF. Використовуйте як довідку при заповненні офіційної форми I-765.',
    downloadAgain: 'Завантажити ще раз',
    officialFormLink: 'Отримати офіційну форму I-765 на uscis.gov/i-765 →',
    feeLink: 'Перевірити держмито на uscis.gov/feecalculator →',
    autoExt: 'Автоматичне продовження на 540 днів: якщо подати I-765 до закінчення терміну EAD, ви отримаєте автоматичне продовження дозволу на роботу.',
    next: 'Далі →',
    back: '← Назад',
    edit: 'Змінити',
    required: "Обов'язково",
    optional: 'Необов\'язково',
    stepLabels: ['Тип', 'Статус', 'Завант.', 'Дані', 'Документи', 'Подача', 'Огляд', 'Завантаження'],
    stepLabelsNoUpload: ['Тип', 'Статус', 'Дані', 'Документи', 'Подача', 'Огляд', 'Завантаження'],
    catNames: { c11: '(c)(11) — Re-Parole', c08: '(c)(8) — Притулок', a12: '(a)(12) — TPS', other: 'Інше' },
    appTypeNames: { new: 'Новий EAD', renewal: 'Продовження EAD' },
    filingNames: { mail: 'Поштою (USCIS Lockbox)', online: 'Онлайн (my.uscis.gov)' },
    disclaimer: 'Цей робочий лист — інструмент самопідготовки. Messenginfo не є юридичною фірмою і не надає юридичних консультацій. Офіційна форма I-765 та інструкції доступні на uscis.gov/i-765. Правила та збори USCIS можуть змінюватися — завжди перевіряйте актуальні вимоги перед подачею.',
  },
  ru: {
    step0Title: 'Разрешение на работу EAD — Подготовка I-765',
    step0Sub: 'Подготовьте пакет I-765 примерно за 15 минут. Вы сами проверяете, подписываете и подаёте в USCIS.',
    newEAD: 'Новый EAD',
    newEADDesc: 'Подаю впервые',
    renewEAD: 'Продление EAD',
    renewEADDesc: 'Мой EAD истекает в течение 6 месяцев',
    notLegal: 'Только инструмент самоподготовки. Не юридическая консультация. Не юридическая фирма. Вы подаёте самостоятельно в USCIS.',
    step1Title: 'Ваш иммиграционный статус',
    step1Sub: 'Выберите категорию, которая лучше всего описывает вашу ситуацию.',
    c11Label: 'U4U Re-Parole — I-131 одобрен',
    c11Desc: 'Парол выдан по гуманитарным причинам',
    c11Cat: 'Категория (c)(11) — 8 CFR 274a.12(c)(11)',
    c11Warning: '⚠ Подавайте форму I-765 по категории (c)(11) ТОЛЬКО ПОСЛЕ того, как USCIS одобрит вашу форму I-131 Re-Parole. Подача до одобрения может привести к отказу.',
    c08Label: 'Ожидается решение по убежищу — I-589 подан',
    c08Desc: 'Заявление на убежище подано, дело рассматривается',
    c08Cat: 'Категория (c)(8) — 8 CFR 274a.12(c)(8)',
    a12Label: 'TPS Украина (Временный защищённый статус)',
    a12Desc: 'Временный защищённый статус для украинцев',
    a12Cat: 'Категория (a)(12) — 8 CFR 274a.12(a)(12)',
    otherLabel: 'Другое / Не уверен(а)',
    otherDesc: 'Проверьте uscis.gov/i-765 или обратитесь к иммиграционному адвокату.',
    step2Title: 'Личная информация',
    step2Sub: 'Вводите данные точно так, как они указаны в вашем паспорте.',
    firstName: 'Имя (Given Name)',
    lastName: 'Фамилия (Family Name)',
    middleName: 'Отчество (если есть в паспорте)',
    dob: 'Дата рождения',
    countryOfBirth: 'Страна рождения',
    alienNumber: 'A-Number (номер иностранного гражданина)',
    alienHint: 'A-Number начинается с "A" и указан на I-94, карточке EAD или уведомлениях USCIS. Оставьте пустым, если нет.',
    genderLabel: 'Пол (как в паспорте)',
    genderMale: 'Мужской',
    genderFemale: 'Женский',
    genderOther: 'Другая гендерная идентичность',
    step3Title: 'Список документов',
    step3Sub: 'Отметьте документы, которые у вас сейчас есть.',
    missingRequired: '⚠ Отсутствуют обязательные документы. Соберите их перед подачей.',
    step4Title: 'Способ подачи',
    step4Sub: 'Как вы будете подавать заявление I-765?',
    filingMail: 'По почте',
    filingMailDesc: 'Распечатайте, подпишите и отправьте в Lockbox USCIS',
    filingOnline: 'Онлайн',
    filingOnlineDesc: 'Подайте на my.uscis.gov (поддерживается для большинства категорий)',
    addressLabel: 'Ваш текущий почтовый адрес в США',
    addressHint: 'USCIS отправит карточку EAD на этот адрес.',
    checkAddress: 'Правильный адрес Lockbox USCIS зависит от вашего штата и категории. Проверьте на uscis.gov/i-765 перед отправкой.',
    step5Title: 'Проверка информации',
    step5Sub: 'Проверьте всё перед скачиванием пакета.',
    lblType: 'Тип заявления',
    lblCategory: 'Категория',
    lblPersonal: 'Личные данные',
    lblDocs: 'Готовые документы',
    lblFiling: 'Способ подачи',
    step6Title: 'Ваш пакет I-765 готов',
    step6Sub: 'Скачайте рабочий лист, затем заполните официальную форму I-765 с uscis.gov/i-765.',
    downloadBtn: '⬇ Скачать рабочий лист (.html)',
    downloaded: '✓ Загрузка началась.',
    downloadHint: 'Откройте в браузере → Файл → Печать → Сохранить как PDF. Используйте как справку при заполнении официальной формы I-765.',
    downloadAgain: 'Скачать ещё раз',
    officialFormLink: 'Получить официальную форму I-765 на uscis.gov/i-765 →',
    feeLink: 'Проверить госпошлину на uscis.gov/feecalculator →',
    autoExt: 'Автоматическое продление на 540 дней: если подать I-765 до окончания срока EAD, вы получите автоматическое продление разрешения на работу.',
    next: 'Далее →',
    back: '← Назад',
    edit: 'Изменить',
    required: 'Обязательно',
    optional: 'Необязательно',
    stepLabels: ['Тип', 'Статус', 'Загрузка', 'Данные', 'Документы', 'Подача', 'Обзор', 'Скачать'],
    stepLabelsNoUpload: ['Тип', 'Статус', 'Данные', 'Документы', 'Подача', 'Обзор', 'Скачать'],
    catNames: { c11: '(c)(11) — Re-Parole', c08: '(c)(8) — Убежище', a12: '(a)(12) — TPS', other: 'Другое' },
    appTypeNames: { new: 'Новый EAD', renewal: 'Продление EAD' },
    filingNames: { mail: 'По почте (USCIS Lockbox)', online: 'Онлайн (my.uscis.gov)' },
    disclaimer: 'Этот рабочий лист — инструмент самоподготовки. Messenginfo не является юридической фирмой и не предоставляет юридические консультации. Официальная форма I-765 и инструкции доступны на uscis.gov/i-765. Правила и сборы USCIS могут меняться — всегда проверяйте актуальные требования перед подачей.',
  },
  es: {
    step0Title: 'Permiso de Trabajo EAD — Preparación I-765',
    step0Sub: 'Prepare su paquete I-765 en ~15 minutos. Usted mismo revisa, firma y presenta ante USCIS.',
    newEAD: 'EAD Nuevo',
    newEADDesc: 'Solicitud por primera vez',
    renewEAD: 'Renovación de EAD',
    renewEADDesc: 'Mi EAD vence en 6 meses',
    notLegal: 'Solo herramienta de autopreparación. No es asesoría legal. No es firma de abogados. Usted presenta ante USCIS.',
    step1Title: 'Su Estado Migratorio',
    step1Sub: 'Seleccione la categoría que mejor describe su situación.',
    c11Label: 'U4U Re-Parole — I-131 Aprobado',
    c11Desc: 'Libertad condicional otorgada por razones humanitarias urgentes',
    c11Cat: 'Categoría (c)(11) — 8 CFR 274a.12(c)(11)',
    c11Warning: '⚠ Presente el Formulario I-765 bajo (c)(11) SOLO DESPUÉS de que USCIS apruebe su Formulario I-131 Re-Parole. Presentarlo antes puede resultar en rechazo.',
    c08Label: 'Asilo Pendiente — I-589 Presentado',
    c08Desc: 'Solicitud de asilo presentada, caso pendiente',
    c08Cat: 'Categoría (c)(8) — 8 CFR 274a.12(c)(8)',
    a12Label: 'TPS Ucrania Beneficiario',
    a12Desc: 'Estado de Protección Temporal para Ucranianos',
    a12Cat: 'Categoría (a)(12) — 8 CFR 274a.12(a)(12)',
    otherLabel: 'Otro / No estoy seguro(a)',
    otherDesc: 'Consulte uscis.gov/i-765 o un abogado de inmigración para identificar su categoría.',
    step2Title: 'Información Personal',
    step2Sub: 'Ingrese la información exactamente como aparece en su pasaporte.',
    firstName: 'Nombre (Given Name)',
    lastName: 'Apellido (Family Name)',
    middleName: 'Segundo nombre (si aparece en el pasaporte)',
    dob: 'Fecha de Nacimiento',
    countryOfBirth: 'País de Nacimiento',
    alienNumber: 'Número A (Alien Registration Number)',
    alienHint: 'Su Número A comienza con "A" y aparece en su I-94 o tarjeta EAD. Déjelo en blanco si no tiene.',
    genderLabel: 'Género (como aparece en su pasaporte)',
    genderMale: 'Masculino',
    genderFemale: 'Femenino',
    genderOther: 'Otra identidad de género',
    step3Title: 'Lista de Documentos',
    step3Sub: 'Marque los documentos que ya tiene disponibles.',
    missingRequired: '⚠ Le faltan documentos requeridos. Reúnalos antes de presentar.',
    step4Title: 'Método de Presentación',
    step4Sub: '¿Cómo presentará su solicitud I-765?',
    filingMail: 'Por Correo',
    filingMailDesc: 'Imprima, firme y envíe al buzón USCIS Lockbox',
    filingOnline: 'En Línea',
    filingOnlineDesc: 'Presente en my.uscis.gov (compatible con la mayoría de categorías)',
    addressLabel: 'Su Dirección Postal Actual en EE.UU.',
    addressHint: 'USCIS enviará su tarjeta EAD a esta dirección.',
    checkAddress: 'La dirección correcta del Lockbox de USCIS depende de su estado y categoría. Verifique en uscis.gov/i-765 antes de enviar.',
    step5Title: 'Revisar Información',
    step5Sub: 'Confirme que todo es correcto antes de generar su paquete.',
    lblType: 'Tipo de Solicitud',
    lblCategory: 'Categoría de Elegibilidad',
    lblPersonal: 'Información Personal',
    lblDocs: 'Documentos Listos',
    lblFiling: 'Método de Presentación',
    step6Title: 'Su Paquete I-765 está Listo',
    step6Sub: 'Descargue su hoja de trabajo, luego complete el Formulario I-765 oficial de uscis.gov/i-765.',
    downloadBtn: '⬇ Descargar Hoja de Trabajo (.html)',
    downloaded: '✓ Descarga iniciada.',
    downloadHint: 'Abra en el navegador → Archivo → Imprimir → Guardar como PDF. Use como referencia al completar el Formulario I-765 oficial.',
    downloadAgain: 'Descargar de nuevo',
    officialFormLink: 'Obtener Formulario I-765 oficial en uscis.gov/i-765 →',
    feeLink: 'Verificar tarifa en uscis.gov/feecalculator →',
    autoExt: 'Extensión automática de 540 días: presentar la renovación antes de que expire el EAD activa una extensión automática de 540 días de autorización de trabajo.',
    next: 'Continuar →',
    back: '← Atrás',
    edit: 'Editar',
    required: 'Requerido',
    optional: 'Opcional',
    stepLabels: ['Tipo', 'Estado', 'Subir', 'Datos', 'Documentos', 'Presentación', 'Revisión', 'Descarga'],
    stepLabelsNoUpload: ['Tipo', 'Estado', 'Datos', 'Documentos', 'Presentación', 'Revisión', 'Descarga'],
    catNames: { c11: '(c)(11) — Re-Parole', c08: '(c)(8) — Asilo Pendiente', a12: '(a)(12) — TPS Ucrania', other: 'Otro / No seguro' },
    appTypeNames: { new: 'EAD Nuevo', renewal: 'Renovación de EAD' },
    filingNames: { mail: 'Por Correo (USCIS Lockbox)', online: 'En Línea (my.uscis.gov)' },
    disclaimer: 'Esta hoja de trabajo es una herramienta de autopreparación. Messenginfo no es una firma de abogados y no proporciona asesoramiento legal. El Formulario I-765 oficial e instrucciones están disponibles en uscis.gov/i-765. Las políticas y tarifas de USCIS cambian — siempre verifique los requisitos actuales antes de presentar.',
  },
}

// ── Document checklist definitions ────────────────────────────────────────────

interface DocItem {
  key: keyof EADFormData
  label: Record<string, string>
  requiredFor: ('new' | 'renewal' | 'c11' | 'c08' | 'a12' | 'other' | 'always')[]
}

const DOCS: DocItem[] = [
  {
    key: 'hasPassport',
    label: {
      en: 'Passport (photocopy of photo/bio page)',
      uk: 'Паспорт (копія сторінки з фото)',
      ru: 'Паспорт (копия страницы с фото)',
      es: 'Pasaporte (fotocopia de la página de foto)',
    },
    requiredFor: ['always'],
  },
  {
    key: 'hasI94',
    label: {
      en: 'Form I-94 Arrival/Departure Record (download at i94.cbp.dhs.gov)',
      uk: 'Форма I-94 (завантажте на i94.cbp.dhs.gov)',
      ru: 'Форма I-94 (скачайте на i94.cbp.dhs.gov)',
      es: 'Formulario I-94 (descargue en i94.cbp.dhs.gov)',
    },
    requiredFor: ['always'],
  },
  {
    key: 'hasI131Approval',
    label: {
      en: 'Form I-131 Approval Notice (required for Re-Parole category c11)',
      uk: 'Повідомлення про затвердження I-131 (потрібне для Re-Parole, категорія c11)',
      ru: 'Уведомление об одобрении I-131 (нужно для Re-Parole, категория c11)',
      es: 'Aviso de Aprobación del Formulario I-131 (requerido para Re-Parole categoría c11)',
    },
    requiredFor: ['c11'],
  },
  {
    key: 'hasPreviousEAD',
    label: {
      en: 'Previous or expiring EAD card (front and back copy, for renewals)',
      uk: 'Попередня або чинна картка EAD (копії обох сторін, для продовження)',
      ru: 'Предыдущая или действующая карточка EAD (копии обеих сторон, для продления)',
      es: 'Tarjeta EAD anterior o vigente (copia frontal y trasera, para renovaciones)',
    },
    requiredFor: ['renewal'],
  },
  {
    key: 'hasPhotos',
    label: {
      en: '2 passport-style photos (2"×2", white background)',
      uk: '2 фото паспортного формату (2"×2", білий фон)',
      ru: '2 фото паспортного формата (2"×2", белый фон)',
      es: '2 fotos tipo pasaporte (2"×2", fondo blanco)',
    },
    requiredFor: ['always'],
  },
]

// ── HTML packet generator ─────────────────────────────────────────────────────

function generatePacketHTML(data: EADFormData, locale: string): string {
  const ui = UI[locale] ?? UI.en
  const catName = data.category ? (ui.catNames[data.category] ?? data.category) : '—'
  const appTypeName = data.appType ? (ui.appTypeNames[data.appType] ?? data.appType) : '—'
  const filingName = data.filingMethod ? (ui.filingNames[data.filingMethod] ?? data.filingMethod) : '—'

  const docsReady = DOCS
    .filter(d => data[d.key] === true)
    .map(d => `<li>✅ ${d.label[locale] ?? d.label.en}</li>`)
    .join('\n')

  const docsMissing = DOCS
    .filter(d => data[d.key] !== true)
    .map(d => `<li>☐ ${d.label[locale] ?? d.label.en}</li>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<title>I-765 Preparation Worksheet — Messenginfo</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  .header { border-bottom: 3px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px; font-size: 22px; color: #1d4ed8; }
  .header p { margin: 0; font-size: 13px; color: #666; }
  .disclaimer { background: #fef9c3; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; }
  .warning { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13px; }
  .section { margin-bottom: 24px; }
  .section h2 { font-size: 15px; font-weight: bold; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; color: #374151; }
  .row { display: flex; gap: 12px; margin-bottom: 8px; }
  .label { font-size: 12px; color: #6b7280; min-width: 200px; }
  .value { font-size: 13px; font-weight: 600; color: #111; }
  ul { margin: 8px 0; padding-left: 20px; }
  li { margin-bottom: 4px; font-size: 13px; }
  .next-steps { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 16px; }
  .next-steps h3 { margin-top: 0; font-size: 14px; color: #166534; }
  .next-steps ol { margin: 0; padding-left: 20px; }
  .next-steps li { margin-bottom: 8px; font-size: 13px; }
  .links { margin-top: 16px; }
  .links a { color: #1d4ed8; font-size: 13px; display: block; margin-bottom: 6px; }
  .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 11px; color: #9ca3af; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>

<div class="header">
  <h1>I-765 Employment Authorization — Preparation Worksheet</h1>
  <p>Generated by Messenginfo &nbsp;|&nbsp; messenginfo.com &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p>⚠ DRAFT ONLY — This worksheet is a preparation reference, not the official USCIS form.</p>
</div>

<div class="disclaimer">
  <strong>Disclaimer:</strong> ${ui.disclaimer}
</div>

${data.category === 'c11' ? `
<div class="warning">
  ${ui.c11Warning}
</div>
` : ''}

<div class="section">
  <h2>Application Overview</h2>
  <div class="row"><span class="label">Application Type:</span><span class="value">${appTypeName}</span></div>
  <div class="row"><span class="label">Eligibility Category:</span><span class="value">${catName}</span></div>
  <div class="row"><span class="label">Filing Method:</span><span class="value">${filingName}</span></div>
</div>

<div class="section">
  <h2>Part 1 — Applicant Information (I-765 reference)</h2>
  <div class="row"><span class="label">1.a Last Name (Family Name):</span><span class="value">${data.lastName || '—'}</span></div>
  <div class="row"><span class="label">1.b First Name (Given Name):</span><span class="value">${data.firstName || '—'}</span></div>
  <div class="row"><span class="label">1.c Middle Name:</span><span class="value">${data.middleName || '(none)'}</span></div>
  <div class="row"><span class="label">2. Date of Birth:</span><span class="value">${data.dob || '—'}</span></div>
  <div class="row"><span class="label">3. Country of Birth:</span><span class="value">${data.countryOfBirth || '—'}</span></div>
  <div class="row"><span class="label">4. Gender:</span><span class="value">${data.gender || '—'}</span></div>
  <div class="row"><span class="label">5. A-Number (if any):</span><span class="value">${data.alienNumber || '(none provided)'}</span></div>
  <div class="row"><span class="label">Mailing Address (U.S.):</span><span class="value">${data.usAddress || '—'}</span></div>
</div>

<div class="section">
  <h2>Part 2 — Eligibility (I-765 reference)</h2>
  <div class="row">
    <span class="label">Eligibility Category:</span>
    <span class="value">${catName}</span>
  </div>
  <p style="font-size:13px; color:#374151; margin-top:8px;">
    Enter this category code on Part 2 of the official Form I-765.
    Verify the current accepted edition at <a href="https://www.uscis.gov/i-765" target="_blank">uscis.gov/i-765</a>.
  </p>
</div>

<div class="section">
  <h2>Documents Checklist</h2>
  ${docsReady ? `<p style="font-size:13px;font-weight:600;color:#166534;">Ready:</p><ul>${docsReady}</ul>` : ''}
  ${docsMissing ? `<p style="font-size:13px;font-weight:600;color:#dc2626;">Still needed:</p><ul>${docsMissing}</ul>` : ''}
</div>

<div class="section">
  <div class="next-steps">
    <h3>▶ Next Steps — What to Do</h3>
    <ol>
      <li>Download the official Form I-765 and current instructions from <a href="https://www.uscis.gov/i-765" target="_blank">uscis.gov/i-765</a>.</li>
      <li>Complete Part 1 (Applicant Info) and Part 2 (Eligibility Category) of the official form using this worksheet as reference.</li>
      <li>Gather all documents from the checklist above (passport copy, I-94, photos, etc.).</li>
      ${data.category === 'c11' ? '<li><strong>Verify your Form I-131 Re-Parole approval is in hand before filing.</strong></li>' : ''}
      ${data.appType === 'renewal' ? '<li><strong>540-day auto-extension:</strong> File before your current EAD expires to receive the automatic extension. Keep a copy of your filing receipt as proof of continued work authorization.</li>' : ''}
      <li>Verify the correct USCIS Lockbox mailing address for your state and category at <a href="https://www.uscis.gov/i-765" target="_blank">uscis.gov/i-765</a>.</li>
      <li>Check the current filing fee at <a href="https://www.uscis.gov/feecalculator" target="_blank">uscis.gov/feecalculator</a>. Include a check or money order payable to "U.S. Department of Homeland Security".</li>
      <li>Make copies of everything before mailing. Send by certified mail with tracking.</li>
    </ol>
  </div>
</div>

<div class="links">
  <a href="https://www.uscis.gov/i-765" target="_blank">🔗 uscis.gov/i-765 — Official Form I-765 and Instructions</a>
  <a href="https://www.uscis.gov/feecalculator" target="_blank">🔗 uscis.gov/feecalculator — Filing Fee Calculator</a>
  <a href="https://i94.cbp.dhs.gov/" target="_blank">🔗 i94.cbp.dhs.gov — Download your Form I-94</a>
  <a href="https://my.uscis.gov/" target="_blank">🔗 my.uscis.gov — Online filing portal</a>
</div>

<div class="footer">
  Generated by Messenginfo.com &nbsp;|&nbsp; Self-help tool — not legal advice &nbsp;|&nbsp; Not a USCIS form
</div>

</body>
</html>`
}

function downloadHtmlFile(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
      {labels.map((label, i) => {
        const done = step > i
        const active = step === i
        return (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold transition-all
              ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]'}`}>
              {done
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="10" height="10"><polyline points="20 6 9 17 4 12" /></svg>
                : i + 1}
            </div>
            <span className={`text-sm font-semibold whitespace-nowrap hidden sm:inline
              ${done ? 'text-green-600 dark:text-green-400' : active ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text-2)]'}`}>{label}</span>
            {i < labels.length - 1 && <div className={`w-3 h-0.5 mx-0.5 ${done ? 'bg-green-400' : 'bg-[var(--border)]'}`} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Option card ───────────────────────────────────────────────────────────────

function OptionCard({ selected, onClick, title, desc, badge, testId }: {
  selected: boolean; onClick: () => void
  title: string; desc?: string; badge?: string
  /** Stable E2E selector (no text/i18n coupling). */
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`relative w-full text-left p-4 rounded-2xl border-2 transition-all duration-150 cursor-pointer
        ${selected
          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 shadow-md -translate-y-0.5'
          : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400 hover:-translate-y-0.5 hover:shadow-sm'}`}
    >
      {selected && (
        <span className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" width="10" height="10"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
      )}
      <div className="font-bold text-[15px] text-[var(--text-1)] pr-6">{title}</div>
      {badge && <div className="text-sm font-mono text-blue-600 mt-0.5">{badge}</div>}
      {desc && <div className="text-sm text-[var(--text-2)] mt-1 leading-snug">{desc}</div>}
    </button>
  )
}

// ── Review row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-[var(--text-2)]">{label}</span>
      <span className="text-[14px] font-semibold text-[var(--text-1)] ml-4 text-right">{value || '—'}</span>
    </div>
  )
}

// ── Main wizard component ─────────────────────────────────────────────────────

interface EADWizardProps {
  locale: string
}

export function EADWizard({ locale }: EADWizardProps) {
  const ui = UI[locale] ?? UI.en
  const uploadUi = UPLOAD_UI[locale] ?? UPLOAD_UI.en
  const [step, setStep] = useState(0)
  const [data, setData] = useState<EADFormData>(EMPTY)
  const [downloaded, setDownloaded] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfDownloaded, setPdfDownloaded] = useState(false)

  // ── Upload prefill state (B4, flag-gated) ─────────────────────────────────
  const [uploadState, setUploadState] = useState<EadUploadState>({
    status: 'idle',
    hint: 'passport',
  })
  const [hasReviewFields, setHasReviewFields] = useState(false)
  // CANONICAL_CONTINUITY: id of the persisted canonical document from the extract
  // response. Captured on upload, resent in the generate-packet body. null when the
  // extract did not return one (persistence off/failed) — we NEVER fabricate an id.
  const [canonicalDocumentId, setCanonicalDocumentId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function patch(partial: Partial<EADFormData>) {
    setData(prev => ({ ...prev, ...partial }))
  }

  function canAdvance(): boolean {
    // Step 2 = upload (optional, never blocks). Steps 3-7 = personal info / docs / filing / review.
    switch (step) {
      case 0: return data.appType !== null
      case 1: return data.category !== null
      case 2: return uploadState.status !== 'uploading'
      case 3: return data.firstName.trim().length > 0 && data.lastName.trim().length > 0 && data.dob.length > 0
      case 4: return true
      case 5: return data.filingMethod !== '' && data.usAddress.trim().length > 5
      case 6: return true
      default: return true
    }
  }

  function handleDownload() {
    const html = generatePacketHTML(data, locale)
    downloadHtmlFile(html, 'i765-preparation-worksheet.html')
    setDownloaded(true)
  }

  // ── Primary action: download a REAL filled I-765 PDF (parity with TPS / ReParole)
  async function handleDownloadPdf() {
    if (pdfLoading) return
    setPdfLoading(true)
    try {
      // CANONICAL_CONTINUITY: resend the captured canonical id so the server can load
      // the persisted canonical document (shadow: optional; enforce: required server-side).
      // Omitted when not captured — never send a fabricated/stale id.
      const generateBody = canonicalDocumentId
        ? { ...data, canonical_document_id: canonicalDocumentId }
        : data
      const res = await fetch('/api/ead/generate-packet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateBody),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        alert(err.error ?? 'PDF generation failed. Try again.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `I-765-draft-${(data.lastName || 'applicant').replace(/[^A-Za-z0-9]/g, '')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setPdfDownloaded(true)
    } catch (e) {
      console.error('[EAD download PDF]', e)
      alert('Network error — try again.')
    } finally {
      setPdfLoading(false)
    }
  }

  const PDF_LABELS: Record<string, { primary: string; loading: string; done: string; hint: string }> = {
    en: { primary: '⬇ Download Filled I-765 PDF', loading: 'Generating PDF…', done: '✓ PDF downloaded', hint: 'Filled with your data. Review, sign, and mail per USCIS instructions at uscis.gov/i-765.' },
    uk: { primary: '⬇ Завантажити заповнений I-765 (PDF)', loading: 'Генеруємо PDF…',     done: '✓ PDF завантажено', hint: 'Заповнено вашими даними. Перевірте, підпишіть та надішліть за інструкціями USCIS на uscis.gov/i-765.' },
    ru: { primary: '⬇ Скачать заполненный I-765 (PDF)',    loading: 'Создаём PDF…',      done: '✓ PDF скачан',     hint: 'Заполнен вашими данными. Проверьте, подпишите и отправьте по инструкциям USCIS на uscis.gov/i-765.' },
    es: { primary: '⬇ Descargar I-765 Rellenado (PDF)',    loading: 'Generando PDF…',    done: '✓ PDF descargado', hint: 'Rellenado con sus datos. Revise, firme y envíelo según las instrucciones de USCIS en uscis.gov/i-765.' },
  }
  const pdfL = PDF_LABELS[locale] ?? PDF_LABELS.en

  // ── B4 Upload handler — POST /api/ead/ocr/extract → prefill form ─────────
  async function handleEadUpload(file: File) {
    setUploadState(s => ({ ...s, status: 'uploading', fileName: file.name, errorMsg: undefined }))
    try {
      const fd = new FormData()
      const prepared = await prepareImageForUpload(file)
      fd.append('file', prepared.blob, prepared.name)
      fd.append('docHint', uploadState.hint)

      const res = await fetch('/api/ead/ocr/extract', { method: 'POST', body: fd })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({})) as { error?: string }
        setUploadState(s => ({
          ...s, status: 'error',
          errorMsg: errJson.error ?? uploadUi.error,
        }))
        return
      }

      const json = await res.json() as {
        ok?: boolean
        family_name?: string | null
        given_name?: string | null
        date_of_birth?: string | null
        sex?: string | null
        country_of_birth?: string | null
        passport_number?: string | null
        a_number?: string | null
        review_required?: boolean
        uncertain_fields?: string[]
        canonical_document_id?: string | null
        _core?: boolean
      }

      if (!json.ok) {
        setUploadState(s => ({ ...s, status: 'error', errorMsg: uploadUi.error }))
        return
      }

      // CANONICAL_CONTINUITY: capture the persisted canonical id (primary identity
      // doc = the file just uploaded in Step 2). Store the value as-is; absent/null
      // means persistence was off or failed — resend nothing rather than a fake id.
      setCanonicalDocumentId(
        typeof json.canonical_document_id === 'string' ? json.canonical_document_id : null,
      )

      // Prefill form from Core answers (identity fields only — source-gated fields
      // are already null in the response when source gate not met)
      const prefill: Partial<EADFormData> = {}
      if (json.family_name) prefill.lastName = json.family_name
      if (json.given_name) prefill.firstName = json.given_name
      if (json.date_of_birth) prefill.dob = json.date_of_birth
      if (json.sex === 'M') prefill.gender = 'male'
      else if (json.sex === 'F') prefill.gender = 'female'
      if (json.country_of_birth) prefill.countryOfBirth = json.country_of_birth
      // A-number only from EAD/I-797 source — Core enforces this; map if present
      if (json.a_number) prefill.alienNumber = json.a_number

      patch(prefill)
      setHasReviewFields(Boolean(json.review_required))
      setUploadState(s => ({ ...s, status: 'done', prefillApplied: Object.keys(prefill).length > 0 }))
    } catch {
      setUploadState(s => ({ ...s, status: 'error', errorMsg: uploadUi.error }))
    }
  }

  // ── Step 2 (flag ON only): Upload prefill ─────────────────────────────────
  function StepUpload() {
    const hints: { key: EadDocHint; label: string }[] = [
      { key: 'passport', label: uploadUi.hintPassport },
      { key: 'ead', label: uploadUi.hintEad },
      { key: 'i94', label: uploadUi.hintI94 },
    ]
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-[19px] font-bold text-[var(--text-1)]">{uploadUi.title}</h2>
          <p className="text-[14px] text-[var(--text-2)] mt-1">{uploadUi.sub}</p>
        </div>

        {/* Document type selection */}
        <div className="flex flex-wrap gap-2">
          {hints.map(h => (
            <button
              key={h.key}
              type="button"
              onClick={() => setUploadState(s => ({ ...s, hint: h.key, status: 'idle', errorMsg: undefined }))}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all
                ${uploadState.hint === h.key
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] hover:border-blue-400'}`}
            >
              {h.label}
            </button>
          ))}
        </div>

        {/* Upload area */}
        {uploadState.status !== 'done' ? (
          <div>
            <label
              className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all
                ${uploadState.status === 'uploading'
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 opacity-70'
                  : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="sr-only"
                disabled={uploadState.status === 'uploading'}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleEadUpload(file)
                }}
              />
              <Upload size={28} className="text-[var(--text-2)]" />
              <span className="text-[14px] font-semibold text-[var(--text-2)]">
                {uploadState.status === 'uploading' ? uploadUi.uploading : uploadUi.select}
              </span>
              {uploadState.status === 'uploading' && (
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
            </label>

            {uploadState.status === 'error' && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-300 text-sm text-red-800 dark:text-red-200">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
                <div>
                  <div>{uploadState.errorMsg}</div>
                  <button
                    type="button"
                    onClick={() => { setUploadState(s => ({ ...s, status: 'idle', errorMsg: undefined })); fileInputRef.current?.click() }}
                    className="mt-1 text-red-700 dark:text-red-300 font-semibold underline"
                  >
                    {uploadUi.retry}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-4 rounded-xl bg-green-50 dark:bg-green-950 border border-green-300">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-green-800 dark:text-green-200">{uploadUi.prefillDone}</div>
                <div className="text-sm text-green-700 dark:text-green-300 mt-0.5">{uploadUi.prefillHint}</div>
              </div>
            </div>
            {hasReviewFields && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-300 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
                <span>{uploadUi.reviewNote}</span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setStep(s => s + 1)}
          className="w-full py-2 px-4 border-2 border-[var(--border)] hover:border-blue-400 text-[var(--text-1)] text-[14px] font-semibold rounded-2xl transition-all text-center"
        >
          {uploadUi.skip}
        </button>
      </div>
    )
  }

  // ── Step 0: App type ──────────────────────────────────────────────────────
  function Step0() {
    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">💼</div>
          <h1 className="text-[22px] font-bold text-[var(--text-1)] leading-tight">{ui.step0Title}</h1>
          <p className="text-[14px] text-[var(--text-2)] mt-2 max-w-md mx-auto">{ui.step0Sub}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionCard
            testId="ead-type-new"
            selected={data.appType === 'new'}
            onClick={() => patch({ appType: 'new' })}
            title={ui.newEAD}
            desc={ui.newEADDesc}
          />
          <OptionCard
            testId="ead-type-renewal"
            selected={data.appType === 'renewal'}
            onClick={() => patch({ appType: 'renewal' })}
            title={ui.renewEAD}
            desc={ui.renewEADDesc}
          />
        </div>

        {data.appType === 'renewal' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 text-sm text-green-800 dark:text-green-300">
            <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{ui.autoExt}</span>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text-2)]">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>{ui.notLegal}</span>
        </div>
      </div>
    )
  }

  // ── Step 1: Category ──────────────────────────────────────────────────────
  function Step1() {
    const cats: { key: Category; label: string; desc: string; badge: string }[] = [
      { key: 'c11', label: ui.c11Label, desc: ui.c11Desc, badge: ui.c11Cat },
      { key: 'c08', label: ui.c08Label, desc: ui.c08Desc, badge: ui.c08Cat },
      { key: 'a12', label: ui.a12Label, desc: ui.a12Desc, badge: ui.a12Cat },
      { key: 'other', label: ui.otherLabel, desc: ui.otherDesc, badge: '' },
    ]
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-bold text-[var(--text-1)]">{ui.step1Title}</h2>
          <p className="text-[14px] text-[var(--text-2)] mt-1">{ui.step1Sub}</p>
        </div>
        {cats.map(c => (
          <OptionCard
            key={c.key ?? 'other'}
            testId={`ead-cat-${c.key ?? 'other'}`}
            selected={data.category === c.key}
            onClick={() => patch({ category: c.key })}
            title={c.label}
            desc={c.desc}
            badge={c.badge}
          />
        ))}
        {data.category === 'c11' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-300 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <span>{ui.c11Warning}</span>
          </div>
        )}
      </div>
    )
  }

  // ── Step 2: Personal info ─────────────────────────────────────────────────
  function Step2() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-[19px] font-bold text-[var(--text-1)]">{ui.step2Title}</h2>
          <p className="text-[14px] text-[var(--text-2)] mt-1">{ui.step2Sub}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ead-lastName" className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.lastName} <span className="text-red-500">*</span></label>
            <input
              id="ead-lastName"
              data-testid="ead-input-lastName"
              type="text" value={data.lastName}
              onChange={e => patch({ lastName: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] text-[14px] focus:ring-2 focus:ring-blue-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
              placeholder="ШЕВЧЕНКО / SHEVCHENKO"
            />
          </div>
          <div>
            <label htmlFor="ead-firstName" className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.firstName} <span className="text-red-500">*</span></label>
            <input
              id="ead-firstName"
              data-testid="ead-input-firstName"
              type="text" value={data.firstName}
              onChange={e => patch({ firstName: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] text-[14px] focus:ring-2 focus:ring-blue-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
              placeholder="TARAS"
            />
          </div>
        </div>
        <div>
          <label htmlFor="ead-middleName" className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.middleName}</label>
          <input
            id="ead-middleName"
            type="text" value={data.middleName}
            onChange={e => patch({ middleName: e.target.value })}
            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] text-[14px] focus:ring-2 focus:ring-blue-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ead-dob" className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.dob} <span className="text-red-500">*</span></label>
            <input
              id="ead-dob"
              data-testid="ead-input-dob"
              type="date" value={data.dob}
              onChange={e => patch({ dob: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] text-[14px] focus:ring-2 focus:ring-blue-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
            />
          </div>
          <div>
            <label htmlFor="ead-countryOfBirth" className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.countryOfBirth}</label>
            <input
              id="ead-countryOfBirth"
              data-testid="ead-input-countryOfBirth"
              type="text" value={data.countryOfBirth}
              onChange={e => patch({ countryOfBirth: e.target.value })}
              placeholder="Ukraine"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] text-[14px] focus:ring-2 focus:ring-blue-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.genderLabel}</label>
          <div className="flex gap-2 flex-wrap">
            {(['male', 'female', 'nonbinary'] as const).map(g => (
              <button key={g} type="button"
                onClick={() => patch({ gender: g })}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all
                  ${data.gender === g
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] hover:border-blue-400'}`}>
                {g === 'male' ? ui.genderMale : g === 'female' ? ui.genderFemale : ui.genderOther}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="ead-alienNumber" className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.alienNumber}</label>
          <input
            id="ead-alienNumber"
            type="text" value={data.alienNumber}
            onChange={e => patch({ alienNumber: e.target.value })}
            placeholder="A123456789"
            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] text-[14px] focus:ring-2 focus:ring-blue-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
          />
          <p className="text-sm text-[var(--text-2)] mt-1">{ui.alienHint}</p>
        </div>
      </div>
    )
  }

  // ── Step 3: Documents ─────────────────────────────────────────────────────
  function Step3() {
    const missingRequired = DOCS.some(d => {
      const isReq = d.requiredFor.includes('always') ||
        (data.category && d.requiredFor.includes(data.category as never)) ||
        (data.appType && d.requiredFor.includes(data.appType as never))
      return isReq && !data[d.key]
    })
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-bold text-[var(--text-1)]">{ui.step3Title}</h2>
          <p className="text-[14px] text-[var(--text-2)] mt-1">{ui.step3Sub}</p>
        </div>
        {DOCS.map(doc => {
          const isRequired =
            doc.requiredFor.includes('always') ||
            (data.category ? doc.requiredFor.includes(data.category as never) : false) ||
            (data.appType ? doc.requiredFor.includes(data.appType as never) : false)
          const checked = Boolean(data[doc.key])
          return (
            <label key={doc.key}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                ${checked ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-blue-300'}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={e => patch({ [doc.key]: e.target.checked } as Partial<EADFormData>)}
                className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0"
              />
              <div>
                <div className="text-[14px] font-semibold text-[var(--text-1)]">{doc.label[locale] ?? doc.label.en}</div>
                <div className={`text-sm font-bold mt-0.5 ${isRequired ? 'text-red-600' : 'text-[var(--text-2)]'}`}>
                  {isRequired ? ui.required : ui.optional}
                </div>
              </div>
            </label>
          )
        })}
        {missingRequired && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-300 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
            <span>{ui.missingRequired}</span>
          </div>
        )}
      </div>
    )
  }

  // ── Step 4: Filing method ─────────────────────────────────────────────────
  function Step4() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-[19px] font-bold text-[var(--text-1)]">{ui.step4Title}</h2>
          <p className="text-[14px] text-[var(--text-2)] mt-1">{ui.step4Sub}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionCard
            testId="ead-filing-mail"
            selected={data.filingMethod === 'mail'}
            onClick={() => patch({ filingMethod: 'mail' })}
            title={ui.filingMail}
            desc={ui.filingMailDesc}
          />
          <OptionCard
            testId="ead-filing-online"
            selected={data.filingMethod === 'online'}
            onClick={() => patch({ filingMethod: 'online' })}
            title={ui.filingOnline}
            desc={ui.filingOnlineDesc}
          />
        </div>
        {data.filingMethod === 'mail' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 text-sm text-blue-800 dark:text-blue-200">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>{ui.checkAddress}</span>
          </div>
        )}
        <div>
          <label htmlFor="ead-usAddress" className="block text-sm font-semibold text-[var(--text-1)] mb-1">{ui.addressLabel} <span className="text-red-500">*</span></label>
          <textarea
            id="ead-usAddress"
            data-testid="ead-input-usAddress"
            value={data.usAddress}
            onChange={e => patch({ usAddress: e.target.value })}
            rows={3}
            placeholder="123 Main St, Apt 4B&#10;Chicago, IL 60601"
            className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] text-[14px] resize-none focus:ring-2 focus:ring-blue-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600"
          />
          <p className="text-sm text-[var(--text-2)] mt-1">{ui.addressHint}</p>
        </div>
      </div>
    )
  }

  // ── Step 5: Review ────────────────────────────────────────────────────────
  function Step5() {
    const readyDocs = DOCS.filter(d => data[d.key]).map(d => d.label[locale] ?? d.label.en)
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-[19px] font-bold text-[var(--text-1)]">{ui.step5Title}</h2>
          <p className="text-[14px] text-[var(--text-2)] mt-1">{ui.step5Sub}</p>
        </div>
        <div data-testid="ead-review-container" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
          {[
            { label: ui.lblType, value: data.appType ? (ui.appTypeNames[data.appType] ?? '') : '—' },
            { label: ui.lblCategory, value: data.category ? (ui.catNames[data.category] ?? '') : '—' },
            { label: ui.firstName, value: data.firstName },
            { label: ui.lastName, value: data.lastName },
            { label: ui.dob, value: data.dob },
            { label: ui.countryOfBirth, value: data.countryOfBirth },
            { label: 'A-Number', value: data.alienNumber || '(none)' },
            { label: ui.lblDocs, value: readyDocs.length ? `${readyDocs.length} items` : '—' },
            { label: ui.lblFiling, value: data.filingMethod ? (ui.filingNames[data.filingMethod] ?? '') : '—' },
            { label: ui.addressLabel, value: data.usAddress },
          ].map((row, i) => (
            <div key={i} className="px-4 py-2.5 border-b border-[var(--border)] last:border-0">
              <ReviewRow label={row.label} value={row.value} />
            </div>
          ))}
        </div>
        <p className="text-sm text-[var(--text-2)]">{ui.disclaimer}</p>
      </div>
    )
  }

  // ── Step 6: Download ──────────────────────────────────────────────────────
  function Step6() {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-2">📋</div>
          <h2 className="text-[20px] font-bold text-[var(--text-1)]">{ui.step6Title}</h2>
          <p className="text-[14px] text-[var(--text-2)] mt-2 max-w-md mx-auto">{ui.step6Sub}</p>
        </div>

        {/* PRIMARY: real filled I-765 PDF (parity with TPS / ReParole) */}
        {!pdfDownloaded ? (
          <button
            type="button"
            data-testid="ead-download-pdf-cta"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 disabled:opacity-50 active:scale-[0.98] text-white font-bold text-[15px] rounded-2xl transition-all flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Download size={18} />
            {pdfLoading ? pdfL.loading : pdfL.primary}
          </button>
        ) : (
          <div data-testid="ead-pdf-downloaded-state" className="flex items-start gap-2 p-4 rounded-xl bg-green-50 dark:bg-green-950 border border-green-300">
            <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
            <div>
              <div className="font-bold text-green-800 dark:text-green-200">{pdfL.done}</div>
              <div className="text-sm text-green-700 dark:text-green-300 mt-0.5">{pdfL.hint}</div>
              <button type="button" onClick={handleDownloadPdf} disabled={pdfLoading}
                className="mt-2 py-2 px-4 border-2 border-green-300 rounded-xl text-[14px] font-semibold text-green-800 dark:text-green-200 hover:border-green-500 transition-colors disabled:opacity-50 min-h-[40px]">
                {pdfLoading ? pdfL.loading : pdfL.primary}
              </button>
            </div>
          </div>
        )}

        {/* SECONDARY: legacy HTML preparation worksheet (kept for users who want a printable reference list) */}
        {!downloaded ? (
          <button
            type="button"
            onClick={handleDownload}
            className="w-full py-2 px-4 border-2 border-[var(--border)] hover:border-blue-400 text-[var(--text-1)] text-[14px] font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Download size={16} />
            {ui.downloadBtn}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-4 rounded-xl bg-green-50 dark:bg-green-950 border border-green-300">
              <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
              <div>
                <div className="font-bold text-green-800 dark:text-green-200">{ui.downloaded}</div>
                <div className="text-sm text-green-700 dark:text-green-300 mt-0.5">{ui.downloadHint}</div>
              </div>
            </div>
            <button type="button" onClick={handleDownload}
              className="w-full py-2 px-4 border-2 border-[var(--border)] rounded-xl text-[14px] font-semibold text-[var(--text-1)] hover:border-blue-400 transition-colors">
              {ui.downloadAgain}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <a href="https://www.uscis.gov/i-765" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[14px] text-blue-600 hover:underline font-semibold">
            <ExternalLink size={14} /> {ui.officialFormLink}
          </a>
          <a href="https://www.uscis.gov/feecalculator" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[14px] text-blue-600 hover:underline font-semibold">
            <ExternalLink size={14} /> {ui.feeLink}
          </a>
        </div>

        {data.appType === 'renewal' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 text-sm text-green-800 dark:text-green-300">
            <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{ui.autoExt}</span>
          </div>
        )}

        <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text-2)]">
          {ui.disclaimer}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const STEPS = [Step0, Step1, StepUpload, Step2, Step3, Step4, Step5, Step6]
  const LAST_STEP = STEPS.length - 1
  const ActiveStep = STEPS[step]
  const stepLabels = ui.stepLabels

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="mb-6">
        <StepIndicator step={step} labels={stepLabels} />
      </div>

      <div className="bg-[var(--surface-1)] rounded-2xl border border-[var(--border)] p-5 shadow-sm">
        <ActiveStep />
      </div>

      {step < LAST_STEP && (
        <div className="flex gap-3 mt-4">
          {step > 0 && (
            <button
              type="button"
              data-testid="ead-back-cta"
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl border-2 border-[var(--border)] text-[14px] font-semibold text-[var(--text-1)] hover:border-blue-400 transition-colors"
            >
              <ChevronLeft size={16} /> {ui.back}
            </button>
          )}
          <button
            type="button"
            data-testid="ead-next-cta"
            onClick={() => { if (canAdvance()) setStep(s => s + 1) }}
            disabled={!canAdvance()}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-[14px] font-bold transition-all
              ${canAdvance()
                ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98]'
                : 'bg-[var(--surface-2)] text-[var(--text-2)] cursor-not-allowed opacity-60'}`}
          >
            {ui.next} <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
