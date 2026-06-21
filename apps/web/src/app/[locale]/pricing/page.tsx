import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, AlertTriangle, ShieldCheck, Clock } from 'lucide-react'
import { routing } from '@/i18n/routing'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    en: 'Pricing – Messenginfo',
    uk: 'Ціни – Messenginfo',
    ru: 'Цены – Messenginfo',
    es: 'Precios – Messenginfo',
  }
  const descs: Record<string, string> = {
    en: 'Simple, transparent pricing for immigration document preparation tools.',
    uk: 'Прозорі ціни на інструменти підготовки іміграційних документів.',
    ru: 'Прозрачные цены на инструменты подготовки иммиграционных документов.',
    es: 'Precios simples y transparentes para herramientas de preparación de documentos de inmigración.',
  }
  return {
    title: titles[locale] ?? titles.en,
    description: descs[locale] ?? descs.en,
  }
}

// ─── i18n strings ─────────────────────────────────────────────────────────────
const T = {
  en: {
    eyebrow: 'Pricing',
    title: 'Simple, transparent pricing',
    subtitle: 'No subscriptions. No hidden fees. Pay once per document.',
    disclaimer: 'Messenginfo is not a law firm. We provide self-help tools and information, not legal advice. You are the translator of record on all self-certification packages.',
    popular: 'Most popular',
    translationTitle: 'Translation Packages',
    translationSubtitle: 'All packages deliver 4 USCIS-format files instantly: translation draft, self-certification template, filing checklist, and filing instructions.',
    comingSoon: 'Coming soon',
    guaranteeTitle: 'Translation Package Format Guarantee',
    guaranteeBody: 'If USCIS rejects your translation specifically because of a formatting or certification structure defect in the package we generated, we will regenerate the package for free or refund the Messenginfo service fee. This guarantee covers format defects only — not case approval outcomes, user errors, unsigned certification blocks, or missing supporting documents.',
    plans: [
      {
        name: 'Translation Draft',
        price: '$15',
        period: 'per document',
        description: 'Computer-generated English translation draft. You review field values, you sign the self-certification template.',
        cta: 'Translate a document',
        ctaHref: '/services/translate-document',
        highlight: false,
        available: true,
        items: [
          '14 document types supported',
          'Translation draft (HTML, printable)',
          'Self-Certification Template — you sign',
          'USCIS filing checklist',
          'Filing instructions',
          'Instant download — all 4 files',
        ],
        note: 'You are the translator of record. Messenginfo generates the draft — you review, correct, and certify it.',
      },
      {
        name: 'Reviewed Draft',
        price: '$29',
        period: 'per document',
        description: 'Enhanced translation draft with stronger formatting, detailed self-certification statement, and format guarantee.',
        cta: 'Translate a document',
        ctaHref: '/services/translate-document',
        highlight: true,
        available: true,
        items: [
          'Everything in Translation Draft',
          'Enhanced certification statement text',
          'Stronger formatting & layout',
          'Multi-page document support',
          'Format Guarantee included',
          'Instant download — all 4 files',
        ],
        note: 'Still self-certified. Reviewed for format completeness only — not legal accuracy.',
      },
      {
        name: 'Human-Certified',
        price: 'from $49',
        period: 'per document',
        description: 'A licensed human translator reviews, corrects, and signs the certification statement. Maximum USCIS acceptance confidence.',
        cta: 'Join waitlist',
        ctaHref: '/',
        highlight: false,
        available: false,
        items: [
          'Licensed human translator',
          'Translator signs the certification',
          'Translator credentials statement',
          'USCIS acceptance guarantee',
          '3–5 business day delivery',
        ],
        note: 'Translator is an independent licensed professional. Messenginfo is the platform.',
      },
    ],
    otherTitle: 'Other services',
    otherServices: [
      {
        name: 'Re-Parole Filing Packet',
        price: '$29',
        period: 'per application',
        description: 'Complete self-filing packet for I-131 Re-Parole (Uniting for Ukraine). Includes form prep guide, USCIS checklist, document package instructions, and I-912 fee waiver option.',
        cta: 'Start Re-Parole',
        ctaHref: '/services/re-parole-u4u',
        items: [
          'I-131 form preparation guide',
          'USCIS filing checklist',
          'Document package instructions',
          'I-912 fee waiver option',
          'Available in EN / UK / RU / ES',
        ],
        note: 'You file yourself. Messenginfo does not submit to USCIS on your behalf.',
      },
    ],
    comingTitle: 'Coming to Messenginfo',
    comingItems: [
      'EAD Renewal (I-765) — Employment Authorization wizard',
      'TPS Ukraine deadline tracker & filing guide',
      'I-94 correction guide',
      'USCIS payment problem resolution guide',
      'Attorney directory — verified immigration attorneys & DOJ-accredited reps',
    ],
    faqTitle: 'Frequently asked questions',
    faqs: [
      {
        q: 'Is the payment secure?',
        a: 'Yes. Payments are processed by Stripe — a PCI-compliant payment processor. Messenginfo does not store your card details.',
      },
      {
        q: 'What does the Format Guarantee cover?',
        a: 'If USCIS rejects your translation specifically because of a formatting or certification structure defect caused by our generated package (for example: missing required certification elements or incorrect format per 8 CFR 103.2(b)(3)), we will regenerate the package for free or refund the Messenginfo service fee. This does not cover USCIS case denial based on eligibility, unsigned certification blocks, incorrect user-provided information, or missing supporting documents.',
      },
      {
        q: 'Can I use the Translation Draft without a professional translator?',
        a: 'Under 8 CFR 103.2(b)(3), USCIS accepts translations certified by any person who certifies their competence — including you, the applicant. The Self-Certification Template in the download includes the required certification statement. You review the translation, correct any errors, then sign and date the certification by hand. This is your responsibility and your certification.',
      },
      {
        q: 'What is the difference between the Translation Draft and Reviewed Draft?',
        a: 'Both packages are self-certified (you sign). The Reviewed Draft ($29) includes enhanced formatting, a more detailed certification statement with stronger legal language, multi-page document support, and the Format Guarantee. The Translation Draft ($15) is the standard package — same 4 files, simpler formatting.',
      },
      {
        q: 'When will Professionally Reviewed Translation be available?',
        a: 'We are building a partner network of licensed human translators. Professionally Reviewed Translation is targeted for launch in Q3 2026. Join the waitlist on the homepage.',
      },
      {
        q: 'Is this legal advice?',
        a: 'No. Messenginfo is not a law firm and does not provide legal advice. For advice on your specific situation, consult a licensed immigration attorney or a DOJ-accredited representative.',
      },
    ],
  },
  uk: {
    eyebrow: 'Ціни',
    title: 'Прозорі ціни без сюрпризів',
    subtitle: 'Без підписок. Без прихованих зборів. Одна оплата за документ.',
    disclaimer: 'Messenginfo — не юридична фірма. Ми надаємо інструменти самодопомоги та інформацію, а не юридичні консультації. Ви є перекладачем відповідно до запису в усіх пакетах самопідтвердження.',
    popular: 'Найпопулярніший',
    translationTitle: 'Пакети перекладу',
    translationSubtitle: 'Усі пакети дають 4 файли у форматі USCIS миттєво: чернетка перекладу, шаблон самопідтвердження, контрольний список і інструкції.',
    comingSoon: 'Незабаром',
    guaranteeTitle: 'Гарантія формату пакету перекладу',
    guaranteeBody: 'Якщо USCIS відхилить ваш переклад саме через дефект форматування або структури підтвердження у згенерованому нами пакеті — ми безкоштовно перегенеруємо пакет або повернемо оплату за сервіс Messenginfo. Гарантія покриває лише дефекти формату — не результати розгляду справи, помилки користувача, непідписані блоки підтвердження чи відсутні документи.',
    plans: [
      {
        name: 'Чернетка перекладу',
        price: '$15',
        period: 'за документ',
        description: 'AI-чернетка перекладу англійською. Ви перевіряєте поля, ви підписуєте шаблон самопідтвердження.',
        cta: 'Перекласти документ',
        ctaHref: '/services/translate-document',
        highlight: false,
        available: true,
        items: ['14 типів документів', 'Чернетка перекладу (HTML, друкується)', 'Шаблон самопідтвердження — ви підписуєте', 'Контрольний список USCIS', 'Інструкції з подання', 'Миттєве завантаження — 4 файли'],
        note: 'Ви є перекладачем за записом. Messenginfo генерує чернетку — ви перевіряєте, виправляєте й підтверджуєте.',
      },
      {
        name: 'Перевірена чернетка',
        price: '$29',
        period: 'за документ',
        description: 'Покращена чернетка з детальнішим формулюванням підтвердження та гарантією формату.',
        cta: 'Перекласти документ',
        ctaHref: '/services/translate-document',
        highlight: true,
        available: true,
        items: ['Усе з пакету «Чернетка»', 'Посилений текст підтвердження', 'Покращений формат і макет', 'Підтримка багатосторінкових документів', 'Гарантія формату включена', 'Миттєве завантаження — 4 файли'],
        note: 'Самопідтвердження. Перевірено на повноту формату — не юридичну точність.',
      },
      {
        name: 'Сертифікація людиною',
        price: 'від $49',
        period: 'за документ',
        description: 'Ліцензований перекладач-людина перевіряє та підписує підтвердження. Максимальна впевненість для USCIS.',
        cta: 'Приєднатись до списку очікування',
        ctaHref: '/',
        highlight: false,
        available: false,
        items: ['Ліцензований перекладач-людина', 'Перекладач підписує підтвердження', 'Документ з кваліфікацією перекладача', 'Гарантія прийняття USCIS', 'Доставка 3–5 робочих днів'],
        note: 'Перекладач — незалежний ліцензований фахівець. Messenginfo — платформа.',
      },
    ],
    otherTitle: 'Інші послуги',
    otherServices: [
      {
        name: 'Пакет подачі Re-Parole',
        price: '$29',
        period: 'за заяву',
        description: 'Повний пакет для самостійної подачі I-131 Re-Parole (Єднання для України). Посібник форми, чеклист USCIS, інструкції, опція I-912.',
        cta: 'Почати Re-Parole',
        ctaHref: '/services/re-parole-u4u',
        items: ['Посібник із підготовки I-131', 'Чеклист подачі USCIS', 'Інструкції до пакету документів', 'Опція відмови від оплати I-912', '4 мови (EN / UK / RU / ES)'],
        note: 'Ви подаєте самостійно. Messenginfo не подає до USCIS від вашого імені.',
      },
    ],
    comingTitle: 'Незабаром у Messenginfo',
    comingItems: ['EAD Renewal (I-765) — майстер продовження дозволу на роботу', 'Трекер дедлайну TPS Україна', 'Посібник виправлення I-94', 'Посібник вирішення проблем з оплатою USCIS', 'Каталог адвокатів — перевірені іміграційні адвокати'],
    faqTitle: 'Часті питання',
    faqs: [
      { q: 'Чи безпечна оплата?', a: 'Так. Платежі обробляє Stripe — сертифікований PCI платіжний провайдер. Messenginfo не зберігає дані вашої картки.' },
      { q: 'Що покриває гарантія формату?', a: 'Якщо USCIS відхилить переклад через дефект формату у нашому пакеті (наприклад: відсутні обов\'язкові елементи підтвердження або неправильний формат за 8 CFR 103.2(b)(3)) — ми безкоштовно перегенеруємо або повернемо оплату. Гарантія не покриває відмови за підставами прийнятності, помилки користувача, непідписані блоки або відсутні документи.' },
      { q: 'Чи можна використовувати чернетку без професійного перекладача?', a: 'За 8 CFR 103.2(b)(3) USCIS приймає переклади від будь-якої компетентної особи — включно з вами. Шаблон самопідтвердження у завантаженні містить необхідний текст. Ви перевіряєте переклад, виправляєте помилки, потім підписуєте й датуєте від руки.' },
      { q: 'Різниця між «Чернеткою» і «Перевіреною чернеткою»?', a: 'Обидва пакети — самопідтвердження. «Перевірена чернетка» ($29) має посилений текст підтвердження, покращений формат, підтримку багатосторінкових документів і включає гарантію формату. «Чернетка перекладу» ($15) — стандартний пакет, ті самі 4 файли, простіший формат.' },
      { q: 'Це юридична консультація?', a: 'Ні. Messenginfo — не юридична фірма і не надає юридичних консультацій. Для консультації зверніться до ліцензованого іміграційного адвоката.' },
    ],
  },
  ru: {
    eyebrow: 'Цены',
    title: 'Прозрачные цены без сюрпризов',
    subtitle: 'Без подписок. Без скрытых сборов. Разовая оплата за документ.',
    disclaimer: 'Messenginfo — не юридическая фирма. Мы предоставляем инструменты самопомощи и информацию, а не юридические консультации. Вы являетесь переводчиком согласно записи во всех пакетах самоподтверждения.',
    popular: 'Самый популярный',
    translationTitle: 'Пакеты перевода',
    translationSubtitle: 'Все пакеты содержат 4 файла в формате USCIS мгновенно: черновик перевода, шаблон самоподтверждения, контрольный список и инструкции.',
    comingSoon: 'Скоро',
    guaranteeTitle: 'Гарантия формата пакета перевода',
    guaranteeBody: 'Если USCIS отклонит ваш перевод именно из-за дефекта форматирования или структуры подтверждения в сгенерированном нами пакете — мы бесплатно перегенерируем пакет или вернём оплату за сервис Messenginfo. Гарантия распространяется только на дефекты формата — не на результаты рассмотрения дела, ошибки пользователя, неподписанные блоки подтверждения или отсутствующие документы.',
    plans: [
      {
        name: 'Черновик перевода',
        price: '$15',
        period: 'за документ',
        description: 'AI-черновик перевода на английский. Вы проверяете поля, вы подписываете шаблон самоподтверждения.',
        cta: 'Перевести документ',
        ctaHref: '/services/translate-document',
        highlight: false,
        available: true,
        items: ['14 типов документов', 'Черновик перевода (HTML, для печати)', 'Шаблон самоподтверждения — вы подписываете', 'Контрольный список USCIS', 'Инструкции по подаче', 'Мгновенная загрузка — 4 файла'],
        note: 'Вы являетесь переводчиком согласно записи. Messenginfo генерирует черновик — вы проверяете, исправляете и подтверждаете.',
      },
      {
        name: 'Проверенный черновик',
        price: '$29',
        period: 'за документ',
        description: 'Улучшенный черновик с более детальным текстом подтверждения и гарантией формата.',
        cta: 'Перевести документ',
        ctaHref: '/services/translate-document',
        highlight: true,
        available: true,
        items: ['Всё из пакета «Черновик»', 'Усиленный текст подтверждения', 'Улучшенное форматирование', 'Поддержка многостраничных документов', 'Гарантия формата включена', 'Мгновенная загрузка — 4 файла'],
        note: 'Самоподтверждение. Проверено на полноту формата — не юридическую точность.',
      },
      {
        name: 'Сертификация человеком',
        price: 'от $49',
        period: 'за документ',
        description: 'Лицензированный переводчик проверяет и подписывает подтверждение. Максимальная уверенность для USCIS.',
        cta: 'Вступить в лист ожидания',
        ctaHref: '/',
        highlight: false,
        available: false,
        items: ['Лицензированный переводчик-человек', 'Переводчик подписывает подтверждение', 'Документ с квалификацией переводчика', 'Гарантия принятия USCIS', 'Доставка 3–5 рабочих дней'],
        note: 'Переводчик — независимый лицензированный специалист. Messenginfo — платформа.',
      },
    ],
    otherTitle: 'Другие услуги',
    otherServices: [
      {
        name: 'Пакет подачи Re-Parole',
        price: '$29',
        period: 'за заявление',
        description: 'Полный пакет для самостоятельной подачи I-131 Re-Parole (Объединение для Украины). Руководство по форме, чеклист USCIS, инструкции, опция I-912.',
        cta: 'Начать Re-Parole',
        ctaHref: '/services/re-parole-u4u',
        items: ['Руководство по подготовке I-131', 'Чеклист подачи USCIS', 'Инструкции к пакету документов', 'Опция отказа от оплаты I-912', '4 языка (EN / UK / RU / ES)'],
        note: 'Вы подаёте самостоятельно. Messenginfo не подаёт в USCIS от вашего имени.',
      },
    ],
    comingTitle: 'Скоро в Messenginfo',
    comingItems: ['EAD Renewal (I-765) — мастер продления разрешения на работу', 'Трекер дедлайна TPS Украина', 'Руководство исправления I-94', 'Руководство по решению проблем с оплатой USCIS', 'Каталог адвокатов — проверенные иммиграционные адвокаты'],
    faqTitle: 'Часто задаваемые вопросы',
    faqs: [
      { q: 'Безопасна ли оплата?', a: 'Да. Платежи обрабатывает Stripe — PCI-сертифицированный платёжный провайдер. Messenginfo не хранит данные вашей карты.' },
      { q: 'Что покрывает гарантия формата?', a: 'Если USCIS отклонит перевод из-за дефекта формата в нашем пакете (например: отсутствие обязательных элементов или неправильный формат по 8 CFR 103.2(b)(3)) — мы бесплатно перегенерируем или вернём оплату. Гарантия не покрывает отказы по основаниям приемлемости, ошибки пользователя, неподписанные блоки или отсутствующие документы.' },
      { q: 'Можно ли использовать черновик без профессионального переводчика?', a: 'По 8 CFR 103.2(b)(3) USCIS принимает переводы от любого компетентного лица — включая вас. Шаблон самоподтверждения в загрузке содержит необходимый текст. Вы проверяете перевод, исправляете ошибки, затем подписываете и датируете от руки.' },
      { q: 'Разница между «Черновиком» и «Проверенным черновиком»?', a: 'Оба пакета — самоподтверждение. «Проверенный черновик» ($29) имеет усиленный текст подтверждения, улучшенное форматирование, поддержку многостраничных документов и включает гарантию формата. «Черновик перевода» ($15) — стандартный пакет, те же 4 файла, более простой формат.' },
      { q: 'Это юридическая консультация?', a: 'Нет. Messenginfo — не юридическая фирма и не предоставляет юридических консультаций. Для консультации обратитесь к лицензированному иммиграционному адвокату.' },
    ],
  },
  es: {
    eyebrow: 'Precios',
    title: 'Precios simples y transparentes',
    subtitle: 'Sin suscripciones. Sin tarifas ocultas. Un solo pago por documento.',
    disclaimer: 'Messenginfo no es un bufete de abogados. Proporcionamos herramientas de autoayuda e información, no asesoría legal. Usted es el traductor de registro en todos los paquetes de auto-certificación.',
    popular: 'Más popular',
    translationTitle: 'Paquetes de traducción',
    translationSubtitle: 'Todos los paquetes entregan 4 archivos en formato USCIS al instante: borrador de traducción, plantilla de auto-certificación, lista de verificación e instrucciones.',
    comingSoon: 'Próximamente',
    guaranteeTitle: 'Garantía de formato del paquete de traducción',
    guaranteeBody: 'Si USCIS rechaza su traducción específicamente por un defecto de formato o estructura de certificación en el paquete que generamos, regeneraremos el paquete gratis o reembolsaremos la tarifa del servicio de Messenginfo. Esta garantía cubre solo defectos de formato — no resultados de aprobación, errores del usuario, bloques de certificación sin firmar, ni documentos faltantes.',
    plans: [
      {
        name: 'Borrador de traducción',
        price: '$15',
        period: 'por documento',
        description: 'Borrador de traducción al inglés asistido por IA. Usted revisa los campos y firma la plantilla de auto-certificación.',
        cta: 'Traducir documento',
        ctaHref: '/services/translate-document',
        highlight: false,
        available: true,
        items: ['14 tipos de documentos', 'Borrador de traducción (HTML, imprimible)', 'Plantilla de auto-certificación — usted firma', 'Lista de verificación USCIS', 'Instrucciones de presentación', 'Descarga instantánea — 4 archivos'],
        note: 'Usted es el traductor de registro. Messenginfo genera el borrador — usted lo revisa, corrige y certifica.',
      },
      {
        name: 'Borrador revisado',
        price: '$29',
        period: 'por documento',
        description: 'Borrador mejorado con texto de certificación más detallado y garantía de formato.',
        cta: 'Traducir documento',
        ctaHref: '/services/translate-document',
        highlight: true,
        available: true,
        items: ['Todo del paquete Borrador', 'Texto de certificación reforzado', 'Formato y diseño mejorados', 'Soporte para documentos de varias páginas', 'Garantía de formato incluida', 'Descarga instantánea — 4 archivos'],
        note: 'Aún auto-certificado. Revisado para completitud de formato solamente, no exactitud legal.',
      },
      {
        name: 'Certificación humana',
        price: 'desde $49',
        period: 'por documento',
        description: 'Un traductor humano licenciado revisa y firma la certificación. Máxima confianza de aceptación USCIS.',
        cta: 'Unirse a lista de espera',
        ctaHref: '/',
        highlight: false,
        available: false,
        items: ['Traductor humano licenciado', 'El traductor firma la certificación', 'Declaración de credenciales del traductor', 'Garantía de aceptación USCIS', 'Entrega en 3–5 días hábiles'],
        note: 'El traductor es un profesional independiente licenciado. Messenginfo es la plataforma.',
      },
    ],
    otherTitle: 'Otros servicios',
    otherServices: [
      {
        name: 'Paquete de presentación Re-Parole',
        price: '$29',
        period: 'por solicitud',
        description: 'Paquete completo para la presentación propia de I-131 Re-Parole (Uniting for Ukraine). Guía de formulario, lista USCIS, instrucciones, opción I-912.',
        cta: 'Iniciar Re-Parole',
        ctaHref: '/services/re-parole-u4u',
        items: ['Guía de preparación de I-131', 'Lista de verificación USCIS', 'Instrucciones del paquete de documentos', 'Opción de exención de tarifas I-912', '4 idiomas (EN / UK / RU / ES)'],
        note: 'Usted presenta por su cuenta. Messenginfo no presenta a USCIS en su nombre.',
      },
    ],
    comingTitle: 'Próximamente en Messenginfo',
    comingItems: ['EAD Renewal (I-765) — asistente de renovación de autorización de empleo', 'Rastreador de fechas límite TPS Ucrania', 'Guía de corrección I-94', 'Guía de resolución de problemas de pago USCIS', 'Directorio de abogados — abogados de inmigración verificados'],
    faqTitle: 'Preguntas frecuentes',
    faqs: [
      { q: '¿Es seguro el pago?', a: 'Sí. Los pagos son procesados por Stripe, un procesador de pagos certificado PCI. Messenginfo no almacena los datos de su tarjeta.' },
      { q: '¿Qué cubre la Garantía de formato?', a: 'Si USCIS rechaza su traducción por un defecto de formato en nuestro paquete (por ejemplo: elementos de certificación faltantes o formato incorrecto según 8 CFR 103.2(b)(3)), regeneraremos el paquete gratis o reembolsaremos la tarifa. La garantía no cubre rechazos por elegibilidad, errores del usuario, bloques sin firmar ni documentos faltantes.' },
      { q: '¿Puedo usar el borrador sin un traductor profesional?', a: 'Según 8 CFR 103.2(b)(3), USCIS acepta traducciones certificadas por cualquier persona competente, incluido usted. La Plantilla de auto-certificación contiene el texto requerido. Usted revisa, corrige y luego firma y fecha a mano.' },
      { q: '¿Diferencia entre Borrador y Borrador revisado?', a: 'Ambos son auto-certificados. El Borrador revisado ($29) tiene texto de certificación reforzado, mejor formato, soporte para varias páginas e incluye la Garantía de formato. El Borrador de traducción ($15) es el paquete estándar — mismos 4 archivos, formato más simple.' },
      { q: '¿Esto es asesoría legal?', a: 'No. Messenginfo no es un bufete de abogados y no brinda asesoría legal. Consulte a un abogado de inmigración licenciado para su situación específica.' },
    ],
  },
} as const

type Locale = keyof typeof T

export default async function PricingPage({ params }: Props) {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="text-sm font-semibold text-[var(--primary)] uppercase tracking-widest mb-3">
          {t.eyebrow}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-1)] mb-4">
          {t.title}
        </h1>
        <p className="text-[var(--text-2)] text-base sm:text-lg max-w-2xl mx-auto">
          {t.subtitle}
        </p>
      </div>

      {/* Format Guarantee banner */}
      <div className="mb-10 rounded-2xl border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700 p-5 flex gap-4 items-start">
        <ShieldCheck className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-green-800 dark:text-green-300 mb-1">
            {t.guaranteeTitle}
          </p>
          <p className="text-sm text-green-700 dark:text-green-400 leading-relaxed">
            {t.guaranteeBody}
          </p>
        </div>
      </div>

      {/* Translation packages */}
      <section className="mb-14">
        <h2 className="text-xl font-bold text-[var(--text-1)] mb-1">{t.translationTitle}</h2>
        <p className="text-sm text-[var(--text-2)] mb-6">{t.translationSubtitle}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {t.plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20'
                  : plan.available
                  ? 'border-[var(--border)] bg-[var(--surface-1)]'
                  : 'border-[var(--border)] bg-[var(--surface-1)] opacity-70'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
                  {t.popular}
                </span>
              )}
              {!plan.available && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[var(--surface-2)] text-[var(--text-2)] text-xs font-bold px-3 py-1 rounded-full border border-[var(--border)]">
                  {t.comingSoon}
                </span>
              )}

              <div className="mb-5">
                <p className={`text-sm font-semibold mb-1 ${plan.highlight ? 'text-white/80' : 'text-[var(--text-2)]'}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-[var(--text-1)]'}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm mb-1 ${plan.highlight ? 'text-white/70' : 'text-[var(--text-2)]'}`}>
                    / {plan.period}
                  </span>
                </div>
                <p className={`text-sm mt-3 leading-relaxed ${plan.highlight ? 'text-white/85' : 'text-[var(--text-2)]'}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlight ? 'text-white' : plan.available ? 'text-[var(--primary)]' : 'text-[var(--text-2)]'}`} />
                    <span className={plan.highlight ? 'text-white/90' : 'text-[var(--text-1)]'}>{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/${locale}${plan.ctaHref}`}
                className={`block text-center rounded-xl py-3 px-4 text-sm font-semibold transition-all ${
                  plan.highlight
                    ? 'bg-white text-[var(--primary)] hover:bg-white/90'
                    : plan.available
                    ? 'bg-[var(--primary)] text-white hover:opacity-90'
                    : 'bg-[var(--surface-2)] text-[var(--text-2)] cursor-default pointer-events-none'
                }`}
              >
                {plan.cta} {plan.available ? '→' : ''}
              </Link>

              {plan.note && (
                <p className={`text-xs mt-3 leading-relaxed ${plan.highlight ? 'text-white/60' : 'text-[var(--text-2)]'}`}>
                  ⚠ {plan.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Other services */}
      <section className="mb-14">
        <h2 className="text-xl font-bold text-[var(--text-1)] mb-4">{t.otherTitle}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {t.otherServices.map((svc) => (
            <div key={svc.name} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6 flex flex-col">
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--text-2)] mb-1">{svc.name}</p>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-[var(--text-1)]">{svc.price}</span>
                  <span className="text-sm mb-1 text-[var(--text-2)]">/ {svc.period}</span>
                </div>
                <p className="text-sm mt-2 text-[var(--text-2)] leading-relaxed">{svc.description}</p>
              </div>
              <ul className="space-y-2 mb-5 flex-1">
                {svc.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[var(--primary)]" />
                    <span className="text-[var(--text-1)]">{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/${locale}${svc.ctaHref}`}
                className="block text-center rounded-xl py-3 px-4 text-sm font-semibold bg-[var(--primary)] text-white hover:opacity-90 transition-all"
              >
                {svc.cta} →
              </Link>
              {svc.note && (
                <p className="text-xs mt-3 text-[var(--text-2)] leading-relaxed">⚠ {svc.note}</p>
              )}
            </div>
          ))}

          {/* Coming soon services */}
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[var(--text-2)]" />
              <p className="text-sm font-bold text-[var(--text-1)]">{t.comingTitle}</p>
            </div>
            <ul className="space-y-2">
              {t.comingItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--text-2)] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Disclaimer bar */}
      <div className="mb-14 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
          {t.disclaimer}
        </p>
      </div>

      {/* FAQ */}
      <section>
        <h2 className="text-xl font-bold text-[var(--text-1)] mb-6">{t.faqTitle}</h2>
        <div className="space-y-4">
          {t.faqs.map((faq) => (
            <div key={faq.q} className="border border-[var(--border)] rounded-xl p-5 bg-[var(--surface-1)]">
              <p className="font-semibold text-[var(--text-1)] mb-2">{faq.q}</p>
              <p className="text-sm text-[var(--text-2)] leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
