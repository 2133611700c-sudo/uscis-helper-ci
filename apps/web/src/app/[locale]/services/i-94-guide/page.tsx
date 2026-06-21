/**
 * /[locale]/services/i-94-guide
 * I-94 Arrival/Departure Record — comprehensive SEO guide
 * Source: cbp.gov/travel/international-visitors/i-94
 * Last verified: 2026-05-06
 */
import type { Metadata } from 'next'
import Link from 'next/link'

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    en: 'I-94 Guide: How to Check, Download & Correct Your Arrival Record — Messenginfo',
    uk: 'I-94 Гід: Як перевірити, завантажити та виправити запис про прибуття — Messenginfo',
    ru: 'I-94 Руководство: Как проверить, скачать и исправить запись о прибытии — Messenginfo',
    es: 'Guía I-94: Cómo Verificar, Descargar y Corregir su Registro de Llegada — Messenginfo',
  }
  const descs: Record<string, string> = {
    en: 'Complete guide to Form I-94: what it is, how to find your I-94 number online, download your record, check your authorized stay, and what to do if your I-94 has errors.',
    uk: 'Повний посібник з Form I-94: що це таке, як знайти номер I-94 онлайн, завантажити запис, перевірити дозволений термін перебування та що робити, якщо у вашому I-94 є помилки.',
    ru: 'Полное руководство по Form I-94: что это такое, как найти номер I-94 онлайн, скачать запись, проверить разрешённый срок пребывания и что делать, если в вашем I-94 есть ошибки.',
    es: 'Guía completa del Formulario I-94: qué es, cómo encontrar su número I-94 en línea, descargar su registro, verificar su estadía autorizada y qué hacer si su I-94 tiene errores.',
  }
  return {
    title: titles[locale] ?? titles.en,
    description: descs[locale] ?? descs.en,
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/i-94-guide`,
      languages: {
        en: 'https://messenginfo.com/en/services/i-94-guide',
        uk: 'https://messenginfo.com/uk/services/i-94-guide',
        ru: 'https://messenginfo.com/ru/services/i-94-guide',
        es: 'https://messenginfo.com/es/services/i-94-guide',
      },
    },
    openGraph: {
      title: titles[locale] ?? titles.en,
      description: descs[locale] ?? descs.en,
    },
  }
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Check Your I-94 Record Online',
  description: 'Step-by-step guide to finding and downloading your I-94 Arrival/Departure Record from CBP',
  step: [
    { '@type': 'HowToStep', name: 'Go to i94.cbp.dhs.gov', text: 'Navigate to the official CBP I-94 website', url: 'https://i94.cbp.dhs.gov/I94/#/home' },
    { '@type': 'HowToStep', name: 'Click "Get Most Recent I-94"', text: 'Select the option to retrieve your current I-94 record' },
    { '@type': 'HowToStep', name: 'Enter your travel document details', text: 'Provide passport number, date of birth, and first/last name' },
    { '@type': 'HowToStep', name: 'View and download your I-94', text: 'Review your record and save a PDF copy for your records' },
  ],
}

const T: Record<string, {
  badge: string; title: string; subtitle: string
  whatTitle: string; whatDesc: string
  howTitle: string
  howSteps: { num: string; title: string; desc: string; action?: string; actionUrl?: string }[]
  fieldsTitle: string
  fields: { name: string; desc: string; important?: boolean }[]
  codesTitle: string
  codes: { code: string; meaning: string; color: string }[]
  errorTitle: string
  errorSteps: string[]
  faqTitle: string
  faqs: { q: string; a: string }[]
  relatedTitle: string
  disclaimer: string
}> = {
  en: {
    badge: 'Official Guide',
    title: 'I-94 Arrival/Departure Record',
    subtitle: 'Everything you need to know about your I-94 — how to find it, read it, and fix errors.',
    whatTitle: 'What is Form I-94?',
    whatDesc: 'The I-94 is your official Arrival/Departure Record created by U.S. Customs and Border Protection (CBP) when you enter the United States. It shows: your admission date, how long you are authorized to stay (admit-until date), your class of admission (visa category), and your I-94 number needed for other immigration forms.',
    howTitle: 'How to find your I-94 online',
    howSteps: [
      { num: '1', title: 'Go to the official CBP website', desc: 'Navigate to i94.cbp.dhs.gov — this is the ONLY official source.', action: 'Open i94.cbp.dhs.gov', actionUrl: 'https://i94.cbp.dhs.gov/I94/#/home' },
      { num: '2', title: 'Click "Get Most Recent I-94"', desc: 'Select the option to retrieve your most recent arrival record.' },
      { num: '3', title: 'Enter your passport details', desc: 'Provide your: First name, Last name, Date of birth, Passport number, Passport country of issuance.' },
      { num: '4', title: 'View and save your record', desc: 'Your I-94 will display. Click "Print" to save a PDF. Keep this for all USCIS applications.' },
    ],
    fieldsTitle: 'Key fields on your I-94',
    fields: [
      { name: 'I-94 Number', desc: '11-digit admission number required on I-131, I-765, I-485, and other USCIS forms.', important: true },
      { name: 'Most Recent Date of Entry', desc: 'The date you were last admitted into the United States.' },
      { name: 'Class of Admission', desc: 'Your visa category code (e.g., PAR for Parole, TPS for Temporary Protected Status, DT for Deferred Action).', important: true },
      { name: 'Admit Until Date', desc: 'The date your authorized stay expires. "D/S" = Duration of Status (common for F-1 students).', important: true },
      { name: 'Port of Entry', desc: 'The airport or land border where you entered the US.' },
    ],
    codesTitle: 'Common Class of Admission codes',
    codes: [
      { code: 'PAR', meaning: 'Humanitarian Parole (includes U4U Re-Parole)', color: 'bg-blue-100 text-blue-800' },
      { code: 'TPS', meaning: 'Temporary Protected Status', color: 'bg-green-100 text-green-800' },
      { code: 'DT', meaning: 'Deferred Action / Deferred Enforced Departure', color: 'bg-purple-100 text-purple-800' },
      { code: 'B-2', meaning: 'Tourist / Visitor for Pleasure', color: 'bg-yellow-100 text-yellow-800' },
      { code: 'F-1', meaning: 'Academic Student', color: 'bg-orange-100 text-orange-800' },
      { code: 'H-1B', meaning: 'Specialty Occupation Worker', color: 'bg-red-100 text-red-800' },
    ],
    errorTitle: 'What to do if your I-94 has errors',
    errorSteps: [
      'Print your current I-94 record from i94.cbp.dhs.gov as evidence of the error.',
      'Gather your supporting documents: passport, visa, boarding pass, and any prior immigration records.',
      'Contact CBP Deferred Inspection or visit the nearest CBP port of entry.',
      'If the error affects pending USCIS applications, contact USCIS at 1-800-375-5283.',
      'Do NOT attempt to alter or manually correct your I-94. Consult an attorney for complex errors.',
    ],
    faqTitle: 'Frequently Asked Questions',
    faqs: [
      { q: 'I lost my paper I-94 card. What do I do?', a: 'Paper I-94 cards are no longer issued for most travelers (since 2013). Your record is electronic. Go to i94.cbp.dhs.gov to retrieve and print it.' },
      { q: 'My I-94 shows the wrong name/date of birth. Is this a problem?', a: 'Yes — this can cause issues with USCIS applications. Visit a CBP Deferred Inspection Site or contact CBP. Bring your passport, visa, and travel documents.' },
      { q: 'What does my "Admit Until" date mean for Re-Parole holders?', a: 'Your PAR I-94 expiry is your authorized stay deadline. Apply to extend (Re-Parole) at least 120 days before this date. Overstaying without authorization may affect future immigration benefits.' },
      { q: 'Can I stay in the US after my I-94 expires?', a: 'Generally no, unless you have filed a timely renewal or extension and qualify for the pending case protection rule. Consult an attorney if your I-94 is about to expire.' },
      { q: 'Why does my I-94 say "D/S"?', a: '"D/S" means Duration of Status — your stay is tied to your program end date (common for F-1 students and J-1 exchange visitors). Your I-94 does not expire on a fixed date; you must comply with your program terms.' },
      { q: 'I need my I-94 number for Form I-131. Where is it?', a: 'On your I-94 printout from i94.cbp.dhs.gov, it appears at the top as a white 11-digit number. This is what goes in the "I-94 Arrival/Departure Record Number" field on USCIS forms.' },
    ],
    relatedTitle: 'Related tools',
    disclaimer: 'I-94 data sourced from CBP and USCIS official sources. Admission codes and policies change — always verify at i94.cbp.dhs.gov and uscis.gov. Not legal advice.',
  },
  uk: {
    badge: 'Офіційний посібник',
    title: 'I-94 Запис про прибуття/від\'їзд',
    subtitle: 'Все, що вам потрібно знати про ваш I-94 — як знайти, прочитати та виправити помилки.',
    whatTitle: 'Що таке Form I-94?',
    whatDesc: 'I-94 — це ваш офіційний Запис про прибуття/від\'їзд, створений Митно-прикордонною охороною США (CBP) при в\'їзді до Сполучених Штатів. Він показує: дату прийому, дозволений термін перебування (дата "admit-until"), клас прийому (категорія візи) та номер I-94, необхідний для інших імміграційних форм.',
    howTitle: 'Як знайти ваш I-94 онлайн',
    howSteps: [
      { num: '1', title: 'Перейдіть на офіційний сайт CBP', desc: 'Перейдіть на i94.cbp.dhs.gov — це ЄДИНЕ офіційне джерело.', action: 'Відкрити i94.cbp.dhs.gov', actionUrl: 'https://i94.cbp.dhs.gov/I94/#/home' },
      { num: '2', title: 'Натисніть "Get Most Recent I-94"', desc: 'Виберіть опцію для отримання вашого останнього запису про прибуття.' },
      { num: '3', title: 'Введіть дані паспорта', desc: 'Вкажіть: ім\'я, прізвище, дату народження, номер паспорта, країну видачі паспорта.' },
      { num: '4', title: 'Перегляньте та збережіть запис', desc: 'Ваш I-94 відобразиться. Натисніть "Print" для збереження PDF. Зберігайте його для всіх заяв USCIS.' },
    ],
    fieldsTitle: 'Ключові поля вашого I-94',
    fields: [
      { name: 'Номер I-94', desc: '11-значний номер допуску, необхідний для I-131, I-765, I-485 та інших форм USCIS.', important: true },
      { name: 'Дата останнього в\'їзду', desc: 'Дата вашого останнього допуску до Сполучених Штатів.' },
      { name: 'Клас допуску', desc: 'Код категорії вашої візи (напр., PAR для Parole, TPS для Тимчасового захисного статусу).', important: true },
      { name: 'Дата "Admit Until"', desc: 'Дата закінчення вашого дозволеного перебування. "D/S" = Duration of Status (для студентів F-1).', important: true },
      { name: 'Пункт в\'їзду', desc: 'Аеропорт або сухопутний кордон, де ви в\'їхали до США.' },
    ],
    codesTitle: 'Поширені коди класу допуску',
    codes: [
      { code: 'PAR', meaning: 'Гуманітарний пароль (включаючи U4U Re-Parole)', color: 'bg-blue-100 text-blue-800' },
      { code: 'TPS', meaning: 'Тимчасовий захисний статус', color: 'bg-green-100 text-green-800' },
      { code: 'DT', meaning: 'Відстрочена дія / Відстрочений примусовий від\'їзд', color: 'bg-purple-100 text-purple-800' },
      { code: 'B-2', meaning: 'Турист / Відвідувач для відпочинку', color: 'bg-yellow-100 text-yellow-800' },
      { code: 'F-1', meaning: 'Академічний студент', color: 'bg-orange-100 text-orange-800' },
      { code: 'H-1B', meaning: 'Працівник за спеціальністю', color: 'bg-red-100 text-red-800' },
    ],
    errorTitle: 'Що робити, якщо у вашому I-94 є помилки',
    errorSteps: [
      'Роздрукуйте поточний запис I-94 з i94.cbp.dhs.gov як доказ помилки.',
      'Зберіть підтвердні документи: паспорт, візу, посадковий талон та попередні імміграційні записи.',
      'Зверніться до CBP Deferred Inspection або відвідайте найближчий пункт пропуску CBP.',
      'Якщо помилка впливає на заявки USCIS, що розглядаються, зв\'яжіться з USCIS за 1-800-375-5283.',
      'НЕ намагайтеся змінити або вручну виправити ваш I-94. Проконсультуйтеся з адвокатом у складних випадках.',
    ],
    faqTitle: 'Часті запитання',
    faqs: [
      { q: 'Я загубив свою паперову картку I-94. Що мені робити?', a: 'Паперові картки I-94 більше не видаються більшості мандрівників (з 2013 року). Ваш запис є електронним. Перейдіть на i94.cbp.dhs.gov, щоб отримати та роздрукувати його.' },
      { q: 'Мій I-94 показує неправильне ім\'я/дату народження. Це проблема?', a: 'Так — це може викликати проблеми із заявками USCIS. Відвідайте сайт перевірки CBP або зв\'яжіться з CBP. Візьміть паспорт, візу та дорожні документи.' },
      { q: 'Що означає дата "Admit Until" для власників Re-Parole?', a: 'Термін дії вашого PAR I-94 — це ваш дедлайн дозволеного перебування. Подайте на продовження (Re-Parole) принаймні за 120 днів до цієї дати.' },
      { q: 'Навіщо мені I-94 для Form I-131?', a: 'У вашому роздруківці I-94 з i94.cbp.dhs.gov вгорі відображається білий 11-значний номер. Це те, що вноситься в поле "I-94 Arrival/Departure Record Number" у формах USCIS.' },
    ],
    relatedTitle: 'Пов\'язані інструменти',
    disclaimer: 'Дані I-94 отримані з офіційних джерел CBP та USCIS. Коди допуску та правила змінюються — завжди перевіряйте на i94.cbp.dhs.gov та uscis.gov. Не юридична консультація.',
  },
  ru: {
    badge: 'Официальное руководство',
    title: 'I-94 Запись о прибытии/отъезде',
    subtitle: 'Всё, что вам нужно знать о вашем I-94 — как найти, прочитать и исправить ошибки.',
    whatTitle: 'Что такое Form I-94?',
    whatDesc: 'I-94 — это ваша официальная Запись о прибытии/отъезде, созданная Таможенно-пограничной охраной США (CBP) при въезде в Соединённые Штаты. Он показывает: дату въезда, разрешённый срок пребывания, класс въезда (категория визы) и номер I-94, необходимый для других иммиграционных форм.',
    howTitle: 'Как найти ваш I-94 онлайн',
    howSteps: [
      { num: '1', title: 'Перейдите на официальный сайт CBP', desc: 'Перейдите на i94.cbp.dhs.gov — это ЕДИНСТВЕННЫЙ официальный источник.', action: 'Открыть i94.cbp.dhs.gov', actionUrl: 'https://i94.cbp.dhs.gov/I94/#/home' },
      { num: '2', title: 'Нажмите "Get Most Recent I-94"', desc: 'Выберите опцию для получения вашей последней записи о прибытии.' },
      { num: '3', title: 'Введите данные паспорта', desc: 'Укажите: имя, фамилию, дату рождения, номер паспорта, страну выдачи паспорта.' },
      { num: '4', title: 'Просмотрите и сохраните запись', desc: 'Ваш I-94 отобразится. Нажмите "Print" для сохранения PDF. Сохраняйте его для всех заявлений USCIS.' },
    ],
    fieldsTitle: 'Ключевые поля вашего I-94',
    fields: [
      { name: 'Номер I-94', desc: '11-значный номер допуска, необходимый для I-131, I-765, I-485 и других форм USCIS.', important: true },
      { name: 'Дата последнего въезда', desc: 'Дата вашего последнего допуска в Соединённые Штаты.' },
      { name: 'Класс допуска', desc: 'Код категории вашей визы (напр., PAR для Parole, TPS для Временного защитного статуса).', important: true },
      { name: 'Дата "Admit Until"', desc: 'Дата окончания вашего разрешённого пребывания. "D/S" = Duration of Status (для студентов F-1).', important: true },
      { name: 'Пункт въезда', desc: 'Аэропорт или сухопутный пограничный переход, где вы въехали в США.' },
    ],
    codesTitle: 'Распространённые коды класса допуска',
    codes: [
      { code: 'PAR', meaning: 'Гуманитарный паролем (включая U4U Re-Parole)', color: 'bg-blue-100 text-blue-800' },
      { code: 'TPS', meaning: 'Временный защитный статус', color: 'bg-green-100 text-green-800' },
      { code: 'DT', meaning: 'Отложенные действия / Отсроченный принудительный выезд', color: 'bg-purple-100 text-purple-800' },
      { code: 'B-2', meaning: 'Турист / Посетитель для отдыха', color: 'bg-yellow-100 text-yellow-800' },
      { code: 'F-1', meaning: 'Академический студент', color: 'bg-orange-100 text-orange-800' },
      { code: 'H-1B', meaning: 'Работник по специальности', color: 'bg-red-100 text-red-800' },
    ],
    errorTitle: 'Что делать, если в вашем I-94 есть ошибки',
    errorSteps: [
      'Распечатайте текущую запись I-94 с i94.cbp.dhs.gov как доказательство ошибки.',
      'Соберите подтверждающие документы: паспорт, визу, посадочный талон и предыдущие иммиграционные записи.',
      'Обратитесь в CBP Deferred Inspection или посетите ближайший пункт пропуска CBP.',
      'Если ошибка влияет на ожидающие рассмотрения заявки USCIS, свяжитесь с USCIS по 1-800-375-5283.',
      'НЕ пытайтесь изменить или вручную исправить ваш I-94. Проконсультируйтесь с адвокатом в сложных случаях.',
    ],
    faqTitle: 'Часто задаваемые вопросы',
    faqs: [
      { q: 'Я потерял свою бумажную карточку I-94. Что делать?', a: 'Бумажные карточки I-94 больше не выдаются большинству путешественников (с 2013 года). Ваша запись электронная. Перейдите на i94.cbp.dhs.gov, чтобы получить и распечатать её.' },
      { q: 'Мой I-94 показывает неправильное имя/дату рождения. Это проблема?', a: 'Да — это может вызвать проблемы с заявками USCIS. Посетите сайт инспекции CBP или свяжитесь с CBP. Возьмите паспорт, визу и дорожные документы.' },
      { q: 'Зачем мне I-94 для Form I-131?', a: 'В вашей распечатке I-94 с i94.cbp.dhs.gov вверху отображается белый 11-значный номер. Это то, что вносится в поле "I-94 Arrival/Departure Record Number" в формах USCIS.' },
      { q: 'Что означает дата "Admit Until" для держателей Re-Parole?', a: 'Срок действия вашего PAR I-94 — это ваш дедлайн разрешённого пребывания. Подайте на продление (Re-Parole) не менее чем за 120 дней до этой даты.' },
    ],
    relatedTitle: 'Связанные инструменты',
    disclaimer: 'Данные I-94 получены из официальных источников CBP и USCIS. Коды допуска и правила меняются — всегда проверяйте на i94.cbp.dhs.gov и uscis.gov. Не юридическая консультация.',
  },
  es: {
    badge: 'Guía Oficial',
    title: 'I-94 Registro de Llegada/Salida',
    subtitle: 'Todo lo que necesita saber sobre su I-94 — cómo encontrarlo, leerlo y corregir errores.',
    whatTitle: '¿Qué es el Formulario I-94?',
    whatDesc: 'El I-94 es su Registro oficial de Llegada/Salida creado por la Aduana y Protección Fronteriza de EE.UU. (CBP) cuando ingresa a los Estados Unidos. Muestra: su fecha de admisión, cuánto tiempo está autorizado a quedarse (fecha admit-until), su clase de admisión (categoría de visa) y su número I-94 necesario para otros formularios de inmigración.',
    howTitle: 'Cómo encontrar su I-94 en línea',
    howSteps: [
      { num: '1', title: 'Vaya al sitio web oficial de CBP', desc: 'Navegue a i94.cbp.dhs.gov — esta es la ÚNICA fuente oficial.', action: 'Abrir i94.cbp.dhs.gov', actionUrl: 'https://i94.cbp.dhs.gov/I94/#/home' },
      { num: '2', title: 'Haga clic en "Get Most Recent I-94"', desc: 'Seleccione la opción para recuperar su registro de llegada más reciente.' },
      { num: '3', title: 'Ingrese los datos de su pasaporte', desc: 'Proporcione: Nombre, Apellido, Fecha de nacimiento, Número de pasaporte, País de emisión del pasaporte.' },
      { num: '4', title: 'Ver y guardar su registro', desc: 'Su I-94 se mostrará. Haga clic en "Imprimir" para guardar un PDF. Guárdelo para todas las solicitudes de USCIS.' },
    ],
    fieldsTitle: 'Campos clave en su I-94',
    fields: [
      { name: 'Número I-94', desc: 'Número de admisión de 11 dígitos requerido en I-131, I-765, I-485 y otros formularios de USCIS.', important: true },
      { name: 'Fecha de Entrada más Reciente', desc: 'La fecha en que fue admitido por última vez en los Estados Unidos.' },
      { name: 'Clase de Admisión', desc: 'Su código de categoría de visa (ej. PAR para Libertad Condicional, TPS para Estatus de Protección Temporal).', important: true },
      { name: 'Fecha "Admit Until"', desc: 'La fecha en que vence su estadía autorizada. "D/S" = Duración del Estatus (común para estudiantes F-1).', important: true },
      { name: 'Puerto de Entrada', desc: 'El aeropuerto o frontera terrestre donde ingresó a EE.UU.' },
    ],
    codesTitle: 'Códigos comunes de Clase de Admisión',
    codes: [
      { code: 'PAR', meaning: 'Libertad Condicional Humanitaria (incluye U4U Re-Parole)', color: 'bg-blue-100 text-blue-800' },
      { code: 'TPS', meaning: 'Estatus de Protección Temporal', color: 'bg-green-100 text-green-800' },
      { code: 'DT', meaning: 'Acción Diferida / Salida Forzada Diferida', color: 'bg-purple-100 text-purple-800' },
      { code: 'B-2', meaning: 'Turista / Visitante por Placer', color: 'bg-yellow-100 text-yellow-800' },
      { code: 'F-1', meaning: 'Estudiante Académico', color: 'bg-orange-100 text-orange-800' },
      { code: 'H-1B', meaning: 'Trabajador en Ocupación Especializada', color: 'bg-red-100 text-red-800' },
    ],
    errorTitle: 'Qué hacer si su I-94 tiene errores',
    errorSteps: [
      'Imprima su registro I-94 actual de i94.cbp.dhs.gov como evidencia del error.',
      'Reúna sus documentos de respaldo: pasaporte, visa, tarjeta de embarque y registros de inmigración anteriores.',
      'Comuníquese con CBP Deferred Inspection o visite el puerto de entrada de CBP más cercano.',
      'Si el error afecta solicitudes de USCIS pendientes, comuníquese con USCIS al 1-800-375-5283.',
      'NO intente alterar o corregir manualmente su I-94. Consulte a un abogado para errores complejos.',
    ],
    faqTitle: 'Preguntas Frecuentes',
    faqs: [
      { q: 'Perdí mi tarjeta I-94 de papel. ¿Qué hago?', a: 'Las tarjetas I-94 de papel ya no se emiten para la mayoría de los viajeros (desde 2013). Su registro es electrónico. Vaya a i94.cbp.dhs.gov para recuperarlo e imprimirlo.' },
      { q: 'Mi I-94 muestra un nombre/fecha de nacimiento incorrectos. ¿Es un problema?', a: 'Sí — esto puede causar problemas con las solicitudes de USCIS. Visite un sitio de Inspección Diferida de CBP o comuníquese con CBP. Lleve su pasaporte, visa y documentos de viaje.' },
      { q: '¿Qué significa la fecha "Admit Until" para los titulares de Re-Parole?', a: 'La fecha de vencimiento de su I-94 PAR es su plazo de estadía autorizada. Solicite una extensión (Re-Parole) al menos 120 días antes de esta fecha.' },
      { q: '¿Por qué necesito mi I-94 para el Formulario I-131?', a: 'En su impresión de I-94 de i94.cbp.dhs.gov, aparece en la parte superior como un número blanco de 11 dígitos. Esto es lo que va en el campo "I-94 Arrival/Departure Record Number" en los formularios de USCIS.' },
    ],
    relatedTitle: 'Herramientas relacionadas',
    disclaimer: 'Datos de I-94 obtenidos de fuentes oficiales de CBP y USCIS. Los códigos de admisión y las políticas cambian — siempre verifique en i94.cbp.dhs.gov y uscis.gov. No es asesoría legal.',
  },
}

export default async function I94GuidePage({ params }: Props) {
  const { locale } = await params
  const t = T[locale] ?? T.en

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="min-h-screen bg-[var(--surface-1)]">
        {/* Hero */}
        <div className="bg-gradient-to-br from-teal-700 to-blue-800 text-white py-14 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <span className="inline-block bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide mb-4">{t.badge}</span>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{t.title}</h1>
            <p className="text-teal-100 text-[15px] leading-relaxed max-w-lg mx-auto">{t.subtitle}</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

          {/* What is I-94 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
            <h2 className="text-[17px] font-bold text-[var(--text-1)] mb-3">{t.whatTitle}</h2>
            <p className="text-[14px] text-[var(--text-2)] leading-relaxed">{t.whatDesc}</p>
            <a href="https://i94.cbp.dhs.gov/I94/#/home" target="_blank" rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 bg-teal-600 text-white px-5 py-2.5 rounded-xl font-bold text-[14px] hover:bg-teal-700 transition-colors">
              Get Your I-94 Now ↗
            </a>
          </div>

          {/* How to find */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
            <h2 className="text-[17px] font-bold text-[var(--text-1)] mb-4">{t.howTitle}</h2>
            <div className="space-y-4">
              {t.howSteps.map((step) => (
                <div key={step.num} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white text-sm font-black flex items-center justify-center shrink-0">{step.num}</div>
                  <div className="flex-1">
                    <p className="text-[14px] font-bold text-[var(--text-1)] mb-0.5">{step.title}</p>
                    <p className="text-sm text-[var(--text-2)]">{step.desc}</p>
                    {step.action && step.actionUrl && (
                      <a href={step.actionUrl} target="_blank" rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-teal-600 hover:text-teal-800">
                        → {step.action}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key fields */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.fieldsTitle}</h2>
            <div className="divide-y divide-[var(--border)]">
              {t.fields.map((field) => (
                <div key={field.name} className="py-3 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {field.important ? <span className="text-amber-500">⭐</span> : <span className="text-[var(--text-3)]">•</span>}
                  </div>
                  <div>
                    <p className={`text-[14px] font-bold ${field.important ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}>{field.name}</p>
                    <p className="text-sm text-[var(--text-2)]">{field.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Admission codes */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
            <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.codesTitle}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {t.codes.map((item) => (
                <div key={item.code} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <span className={`inline-block text-sm font-bold px-2 py-0.5 rounded mb-1.5 ${item.color}`}>{item.code}</span>
                  <p className="text-sm text-[var(--text-2)]">{item.meaning}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Error correction */}
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <h2 className="text-[15px] font-bold text-amber-900 mb-3">{t.errorTitle}</h2>
            <ol className="space-y-2.5">
              {t.errorSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-amber-800">
                  <span className="w-5 h-5 rounded-full bg-amber-400 text-amber-900 text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* FAQ */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
            <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-4">{t.faqTitle}</h2>
            <div className="space-y-4">
              {t.faqs.map((faq) => (
                <div key={faq.q}>
                  <p className="text-[14px] font-semibold text-[var(--text-1)] mb-1">❓ {faq.q}</p>
                  <p className="text-sm text-[var(--text-2)] leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Related tools */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.relatedTitle}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { href: `/${locale}/services/re-parole-u4u`, icon: '🛡', label: 'Re-Parole U4U Wizard' },
                { href: `/${locale}/services/translate-document`, icon: '📄', label: locale === 'uk' ? 'Переклад документів' : locale === 'ru' ? 'Перевод документов' : 'Document Translation' },
                { href: `/${locale}/services/uscis-case-status`, icon: '🔍', label: locale === 'uk' ? 'Статус справи USCIS' : locale === 'ru' ? 'Статус дела USCIS' : 'USCIS Case Status' },
                { href: `/${locale}/services/ead-work-permit`, icon: '💼', label: locale === 'uk' ? 'EAD Дозвіл на роботу' : locale === 'ru' ? 'EAD Разрешение на работу' : 'EAD Work Permit' },
              ].map((link) => (
                <Link key={link.href} href={link.href}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-[14px] font-semibold text-[var(--text-1)] hover:border-teal-400 hover:bg-teal-50 transition-all">
                  <span className="text-xl">{link.icon}</span>{link.label}
                </Link>
              ))}
            </div>
          </div>

          <p className="text-sm text-[var(--text-3)] text-center leading-relaxed pb-4">{t.disclaimer}</p>
        </div>
      </div>
    </>
  )
}
