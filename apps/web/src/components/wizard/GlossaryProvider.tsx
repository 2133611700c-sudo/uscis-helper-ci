/**
 * Glossary of USCIS / immigration terms used in the Re-Parole U4U wizard.
 * Locale-aware: each term has definitions in uk / ru / en / es.
 * Falls back to 'en' if a locale entry is missing.
 *
 * Import GLOSSARY directly wherever you need a definition.
 * GlossaryProvider is a no-op wrapper kept for future context expansion.
 */

type LocaleKey = 'uk' | 'ru' | 'en' | 'es'

export const GLOSSARY: Record<string, Record<LocaleKey, string>> = {
  Parole: {
    uk: 'Тимчасовий дозвіл перебувати в США, виданий DHS. Не є візою чи постійним видом на проживання.',
    ru: 'Временное разрешение находиться в США, выданное DHS. Не является визой или постоянным видом на жительство.',
    en: 'A temporary permission to enter or remain in the US granted by DHS. Not the same as a visa or lawful permanent residence.',
    es: 'Permiso temporal para entrar o permanecer en los EE.UU. otorgado por el DHS. No es lo mismo que una visa o residencia permanente.',
  },
  'Re-Parole': {
    uk: 'Продовження попереднього дозволу parole. Потрібно подати до закінчення терміну поточного parole.',
    ru: 'Продление предыдущего разрешения parole. Необходимо подать до истечения срока текущего parole.',
    en: 'An extension of a previous grant of parole. Must be applied for before the current parole expires.',
    es: 'Una extensión de una concesión de parole anterior. Debe solicitarse antes de que expire el parole actual.',
  },
  'I-131': {
    uk: 'Application for Travel Document — форма USCIS для re-parole, advance parole та refugee travel document. Редакція 01/20/25.',
    ru: 'Application for Travel Document — форма USCIS для re-parole, advance parole и refugee travel document. Редакция 01/20/25.',
    en: 'Application for Travel Document — the USCIS form used for re-parole, advance parole, and refugee travel documents. Edition 01/20/25.',
    es: 'Application for Travel Document — el formulario USCIS para re-parole, advance parole y documentos de viaje para refugiados. Edición 01/20/25.',
  },
  'I-94': {
    uk: 'Запис про в\'їзд до США. Знайдіть свій актуальний запис (і дату закінчення parole) на i94.cbp.dhs.gov.',
    ru: 'Запись о въезде в США. Найдите актуальную запись (и дату окончания parole) на i94.cbp.dhs.gov.',
    en: 'Arrival/Departure Record. Find your current record (including parole expiry date) at i94.cbp.dhs.gov.',
    es: 'Registro de llegada/salida. Encuentre su registro actual (incluida la fecha de vencimiento del parole) en i94.cbp.dhs.gov.',
  },
  'I-912': {
    uk: 'Request for Fee Waiver — запит на звільнення від сплати державного збору USCIS. Подається разом з I-131 поштою.',
    ru: 'Request for Fee Waiver — запрос об освобождении от уплаты государственной пошлины USCIS. Подаётся вместе с I-131 по почте.',
    en: 'Request for Fee Waiver — form to request exemption from the USCIS filing fee. Filed together with I-131 by mail.',
    es: 'Solicitud de exención de tarifa — formulario para solicitar la exención de la tarifa de presentación de USCIS. Se presenta junto con el I-131 por correo.',
  },
  EAD: {
    uk: 'Employment Authorization Document — дозвіл на роботу в США для іноземних громадян.',
    ru: 'Employment Authorization Document — разрешение на работу в США для иностранных граждан.',
    en: 'Employment Authorization Document — a "work permit" that allows non-citizens to legally work in the US.',
    es: 'Documento de Autorización de Empleo — un "permiso de trabajo" que permite a los no ciudadanos trabajar legalmente en los EE.UU.',
  },
  U4U: {
    uk: 'Uniting for Ukraine — гуманітарна програма DHS, яка дозволяє громадянам України приїхати до США на умовах parole.',
    ru: 'Uniting for Ukraine — гуманитарная программа DHS, позволяющая гражданам Украины приехать в США по программе parole.',
    en: 'Uniting for Ukraine — a DHS program allowing Ukrainian nationals to come to the US under parole.',
    es: 'Uniting for Ukraine — un programa del DHS que permite a los ciudadanos ucranianos venir a los EE.UU. bajo parole.',
  },
  Biometrics: {
    uk: 'Відбитки пальців та фото, що збираються USCIS у центрі ASC. Більшість заявників U4U re-parole звільнені від цієї вимоги.',
    ru: 'Отпечатки пальцев и фото, собираемые USCIS в центре ASC. Большинство заявителей U4U re-parole освобождены от этого требования.',
    en: 'Fingerprints and photo collected by USCIS at an Application Support Center (ASC). Most U4U re-parole applicants are exempt.',
    es: 'Huellas dactilares y foto recopiladas por USCIS en un Centro de Apoyo a Solicitudes (ASC). La mayoría de los solicitantes de re-parole U4U están exentos.',
  },
  USCIS: {
    uk: 'U.S. Citizenship and Immigration Services — федеральне агентство, що адмініструє імміграційні пільги.',
    ru: 'U.S. Citizenship and Immigration Services — федеральное агентство, администрирующее иммиграционные льготы.',
    en: 'U.S. Citizenship and Immigration Services — the federal agency that administers immigration benefits.',
    es: 'U.S. Citizenship and Immigration Services — la agencia federal que administra los beneficios de inmigración.',
  },
  Lockbox: {
    uk: 'Центр обробки паперових заявок USCIS. Для U4U I-131 — Chicago Lockbox.',
    ru: 'Центр обработки бумажных заявлений USCIS. Для U4U I-131 — Chicago Lockbox.',
    en: 'A USCIS processing facility that receives paper filings. U4U I-131 goes to the Chicago Lockbox.',
    es: 'Una instalación de procesamiento de USCIS que recibe presentaciones en papel. El I-131 de U4U va al Chicago Lockbox.',
  },
  'Receipt Notice': {
    uk: 'Форма I-797 — USCIS надсилає її після отримання заявки, підтверджуючи прийняття та надаючи номер справи.',
    ru: 'Форма I-797 — USCIS отправляет её после получения заявления, подтверждая получение и предоставляя номер дела.',
    en: 'Form I-797 — USCIS sends this after receiving your application, confirming it was received and providing a case number.',
    es: 'Formulario I-797 — USCIS lo envía después de recibir su solicitud, confirmando su recepción y proporcionando un número de caso.',
  },
}

/** Returns the definition for a term in the given locale, falling back to English. */
export function getGlossaryDef(term: string, locale: string): string | undefined {
  const entry = GLOSSARY[term]
  if (!entry) return undefined
  return entry[locale as LocaleKey] ?? entry.en
}

/** Re-export as a simple wrapper. No context provider needed. */
export function GlossaryProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
