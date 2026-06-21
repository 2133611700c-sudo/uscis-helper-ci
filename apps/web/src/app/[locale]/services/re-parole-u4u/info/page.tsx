/**
 * /[locale]/services/re-parole-u4u
 *
 * Stage 8K — Landing 110%.
 * - H1: 26px → 34px
 * - Trust pills below CTA (4 micro-badges)
 * - 4 trust cards 2×2 grid
 * - "How it works" — 3 steps
 * - FAQ accordion — 6 Q&A via <details>/<summary> (no client component)
 */

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ locale: string }>
}

const T = {
  uk: {
    metaTitle: 'Re-Parole U4U для українців — Messenginfo',
    metaDesc: 'Підготуйте пакет Form I-131 для продовження parole. Самостійна подача. Не юридична консультація.',
    badge: 'Для українців U4U',
    title: 'Продовження parole',
    subtitle: 'Термін вашого parole закінчується? Ми допоможемо підготувати пакет документів.',
    ctaMain: 'Почати Re-Parole пакет →',
    legalOne: 'Не юридична фірма · Ви подаєте самостійно до USCIS · Тільки для довідки',
    trustPills: ['✔ Безпечно', '✔ ~20 хвилин', '✔ Без реєстрації', '✔ Ви подаєте'],
    trustCards: [
      { icon: '🔒', title: 'Безпечно', desc: 'Ваші дані не зберігаються і нікуди не передаються.' },
      { icon: '⏱', title: 'Швидко', desc: 'Пакет готовий приблизно за 20 хвилин.' },
      { icon: '✅', title: 'Без реєстрації', desc: 'Жодного акаунту — просто дайте відповіді на питання.' },
      { icon: '📱', title: 'Ви подаєте', desc: 'Ми готуємо. Ви надсилаєте до USCIS самостійно.' },
    ],
    howTitle: 'Як це працює',
    howSteps: [
      { num: '1', title: 'Дайте відповіді', desc: 'Майстер задасть 12 питань про вашу ситуацію — без юридичного жаргону.' },
      { num: '2', title: 'Отримайте пакет', desc: 'Система підготує заповнену Form I-131 та чек-лист документів.' },
      { num: '3', title: 'Надішліть до USCIS', desc: 'Роздрукуйте та подайте самостійно — або з допомогою юриста.' },
    ],
    ctaStatus: '🔍 Перевірити статус справи →',
    ctaTranslate: '📄 Перекласти документ →',
    priceTitle: 'Вартість послуги',
    priceService: 'Послуга Messenginfo',
    priceServiceDesc: 'Підготовка пакету Form I-131',
    priceRows: [
      { label: '1 людина', price: '$15' },
      { label: '2 людини', price: '$25', save: 'економія $5' },
      { label: '3 людини', price: '$35', save: 'економія $10' },
      { label: "4+ (сім'я)", price: '$45', save: 'економія $15', highlight: true },
    ],
    priceUSCIS: 'Держмито USCIS',
    priceUSCISDesc: 'Більшість U4U — $0. Перевірте на',
    priceUSCISLink: 'uscis.gov/feecalculator',
    priceUSCISVal: '$0*',
    entries: [
      {
        key: 'status',
        icon: '🔍',
        title: 'Перевірити статус справи',
        desc: 'Вже подали? Введіть номер квитанції (IOE/WAC/LIN) і дізнайтесь, що означає ваш статус.',
        cta: 'Перевірити →',
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Перекласти документ для USCIS',
        desc: 'Документи не англійською? Підготуйте чернетку перекладу.',
        cta: 'Перекласти →',
      },
      {
        key: 'sources',
        icon: '🔗',
        title: 'Офіційні ресурси USCIS',
        desc: 'I-131, I-94, калькулятор внесків, адреси для пошти, myUSCIS — всі офіційні посилання.',
        cta: 'Відкрити →',
      },
    ],
    faqTitle: 'Питання та відповіді',
    faqs: [
      {
        q: 'Чи це юридична консультація?',
        a: 'Ні. Messenginfo — це сервіс підготовки документів. Ми не є юридичною фірмою і не надаємо юридичних порад. Якщо ваша ситуація складна — зверніться до ліцензованого адвоката.',
      },
      {
        q: 'Чи зберігаються мої дані?',
        a: 'Ваша сесія зберігається тимчасово лише для підготовки пакету. Ми не передаємо особисті дані третім особам.',
      },
      {
        q: 'Що таке Re-Parole U4U?',
        a: 'Унітинг фор Україна (U4U) — програма Federal програма, яка дозволяє українцям продовжити термін перебування у США через Form I-131. Re-Parole — це повторна подача після початкового дозволу.',
      },
      {
        q: 'Скільки часу займає підготовка пакету?',
        a: 'Приблизно 15–25 хвилин, якщо у вас є всі потрібні документи під рукою (паспорт, I-94, попередній I-131 якщо є).',
      },
      {
        q: 'Чи потрібно платити держмито USCIS?',
        a: 'Більшість заявників U4U звільнені від держмита ($0). Точну суму перевірте на uscis.gov/feecalculator — вона може змінюватись.',
      },
      {
        q: 'Що якщо я припинив сесію посередині?',
        a: 'Ваш прогрес зберігається в браузері. Поверніться на ту саму сторінку — ви продовжите з того місця, де зупинились.',
      },
    ],
    footer: 'Form I-131 редакція 01/20/25 · uscis.gov/i-131 · Messenginfo не подає документи від вашого імені',
  },
  ru: {
    metaTitle: 'Re-Parole U4U для украинцев — Messenginfo',
    metaDesc: 'Подготовьте пакет Form I-131 для продления parole. Самостоятельная подача. Не юридическая консультация.',
    badge: 'Для украинцев U4U',
    title: 'Продление parole',
    subtitle: 'Срок вашего parole заканчивается? Мы поможем подготовить пакет документов.',
    ctaMain: 'Начать Re-Parole пакет →',
    legalOne: 'Не юридическая фирма · Вы подаёте самостоятельно в USCIS · Только для справки',
    trustPills: ['✔ Безопасно', '✔ ~20 минут', '✔ Без регистрации', '✔ Вы подаёте'],
    trustCards: [
      { icon: '🔒', title: 'Безопасно', desc: 'Ваши данные не хранятся и никуда не передаются.' },
      { icon: '⏱', title: 'Быстро', desc: 'Пакет готов примерно за 20 минут.' },
      { icon: '✅', title: 'Без регистрации', desc: 'Никакого аккаунта — просто ответьте на вопросы.' },
      { icon: '📱', title: 'Вы подаёте', desc: 'Мы готовим. Вы отправляете в USCIS самостоятельно.' },
    ],
    howTitle: 'Как это работает',
    howSteps: [
      { num: '1', title: 'Ответьте на вопросы', desc: 'Мастер задаст 12 вопросов о вашей ситуации — без юридического жаргона.' },
      { num: '2', title: 'Получите пакет', desc: 'Система подготовит заполненную Form I-131 и чек-лист документов.' },
      { num: '3', title: 'Отправьте в USCIS', desc: 'Распечатайте и подайте самостоятельно — или с помощью адвоката.' },
    ],
    ctaStatus: '🔍 Проверить статус дела →',
    ctaTranslate: '📄 Перевести документ →',
    priceTitle: 'Стоимость услуги',
    priceService: 'Услуга Messenginfo',
    priceServiceDesc: 'Подготовка пакета Form I-131',
    priceRows: [
      { label: '1 человек', price: '$15' },
      { label: '2 человека', price: '$25', save: 'экономия $5' },
      { label: '3 человека', price: '$35', save: 'экономия $10' },
      { label: '4+ (семья)', price: '$45', save: 'экономия $15', highlight: true },
    ],
    priceUSCIS: 'Госпошлина USCIS',
    priceUSCISDesc: 'Большинство U4U — $0. Проверьте на',
    priceUSCISLink: 'uscis.gov/feecalculator',
    priceUSCISVal: '$0*',
    entries: [
      {
        key: 'status',
        icon: '🔍',
        title: 'Проверить статус дела',
        desc: 'Уже подали? Введите номер квитанции (IOE/WAC/LIN) и узнайте, что означает ваш статус.',
        cta: 'Проверить →',
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Перевести документ для USCIS',
        desc: 'Документы не на английском? Подготовьте черновик перевода.',
        cta: 'Перевести →',
      },
      {
        key: 'sources',
        icon: '🔗',
        title: 'Официальные ресурсы USCIS',
        desc: 'I-131, I-94, калькулятор взносов, адреса для почты, myUSCIS — все официальные ссылки.',
        cta: 'Открыть →',
      },
    ],
    faqTitle: 'Вопросы и ответы',
    faqs: [
      {
        q: 'Это юридическая консультация?',
        a: 'Нет. Messenginfo — сервис подготовки документов. Мы не являемся юридической фирмой и не предоставляем юридических советов. Если ваша ситуация сложная — обратитесь к лицензированному адвокату.',
      },
      {
        q: 'Мои данные сохраняются?',
        a: 'Ваша сессия хранится временно только для подготовки пакета. Мы не передаём личные данные третьим лицам.',
      },
      {
        q: 'Что такое Re-Parole U4U?',
        a: 'Uniting for Ukraine (U4U) — федеральная программа, позволяющая украинцам продлить срок пребывания в США через Form I-131. Re-Parole — повторная подача после первоначального разрешения.',
      },
      {
        q: 'Сколько времени занимает подготовка?',
        a: 'Около 15–25 минут, если под рукой все нужные документы (паспорт, I-94, предыдущий I-131 если есть).',
      },
      {
        q: 'Нужно ли платить госпошлину USCIS?',
        a: 'Большинство заявителей U4U освобождены от госпошлины ($0). Точную сумму проверьте на uscis.gov/feecalculator.',
      },
      {
        q: 'Что если я прервал сессию на середине?',
        a: 'Ваш прогресс сохраняется в браузере. Вернитесь на ту же страницу — продолжите с того места, где остановились.',
      },
    ],
    footer: 'Form I-131 редакция 01/20/25 · uscis.gov/i-131 · Messenginfo не подаёт документы от вашего имени',
  },
  en: {
    metaTitle: 'U4U Re-Parole for Ukrainians — Messenginfo',
    metaDesc: 'Prepare your Form I-131 Re-Parole packet. Self-filing. Not legal advice.',
    badge: 'For Ukrainians — U4U',
    title: 'Re-Parole for Ukrainians',
    subtitle: 'Is your parole expiring? We help you prepare the document packet.',
    ctaMain: 'Start Re-Parole packet →',
    legalOne: 'Not a law firm · You file with USCIS yourself · For guidance only',
    trustPills: ['✔ Secure', '✔ ~20 minutes', '✔ No account', '✔ You file'],
    trustCards: [
      { icon: '🔒', title: 'Secure', desc: 'Your data is not stored or shared with anyone.' },
      { icon: '⏱', title: 'Fast', desc: 'Packet ready in about 20 minutes.' },
      { icon: '✅', title: 'No account', desc: 'No sign-up required — just answer the questions.' },
      { icon: '📱', title: 'You file', desc: 'We prepare it. You send it to USCIS yourself.' },
    ],
    howTitle: 'How it works',
    howSteps: [
      { num: '1', title: 'Answer questions', desc: 'The wizard asks 12 questions about your situation — no legal jargon.' },
      { num: '2', title: 'Get your packet', desc: 'The system prepares a filled Form I-131 and a document checklist.' },
      { num: '3', title: 'File with USCIS', desc: 'Print and file yourself — or with the help of an attorney.' },
    ],
    ctaStatus: '🔍 Check case status →',
    ctaTranslate: '📄 Translate a document →',
    priceTitle: 'Service pricing',
    priceService: 'Messenginfo service fee',
    priceServiceDesc: 'Form I-131 packet preparation',
    priceRows: [
      { label: '1 person', price: '$15' },
      { label: '2 people', price: '$25', save: 'save $5' },
      { label: '3 people', price: '$35', save: 'save $10' },
      { label: '4+ (family)', price: '$45', save: 'save $15', highlight: true },
    ],
    priceUSCIS: 'USCIS government fee',
    priceUSCISDesc: 'Most U4U applicants — $0. Verify at',
    priceUSCISLink: 'uscis.gov/feecalculator',
    priceUSCISVal: '$0*',
    entries: [
      {
        key: 'status',
        icon: '🔍',
        title: 'Check case status',
        desc: 'Already filed? Enter your receipt number (IOE/WAC/LIN) and find out what your status means.',
        cta: 'Check →',
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Translate a document for USCIS',
        desc: 'Documents not in English? Prepare a translation draft.',
        cta: 'Translate →',
      },
      {
        key: 'sources',
        icon: '🔗',
        title: 'Official USCIS resources',
        desc: 'I-131, I-94, fee calculator, mailing addresses, myUSCIS — all official links in one place.',
        cta: 'Open →',
      },
    ],
    faqTitle: 'Frequently asked questions',
    faqs: [
      {
        q: 'Is this legal advice?',
        a: 'No. Messenginfo is a document preparation service. We are not a law firm and do not provide legal advice. If your situation is complex, consult a licensed attorney.',
      },
      {
        q: 'Is my data stored?',
        a: 'Your session is stored temporarily only to prepare the packet. We do not share personal data with third parties.',
      },
      {
        q: 'What is Re-Parole U4U?',
        a: 'Uniting for Ukraine (U4U) is a federal program allowing Ukrainians to extend their stay in the US via Form I-131. Re-Parole is a re-application after the initial grant.',
      },
      {
        q: 'How long does preparation take?',
        a: 'About 15–25 minutes, if you have all necessary documents handy (passport, I-94, previous I-131 if applicable).',
      },
      {
        q: 'Do I have to pay a USCIS fee?',
        a: 'Most U4U applicants are fee-exempt ($0). Verify the exact amount at uscis.gov/feecalculator — it may change.',
      },
      {
        q: 'What if I left mid-session?',
        a: 'Your progress is saved in your browser. Return to the same page and continue from where you left off.',
      },
    ],
    footer: 'Form I-131 edition 01/20/25 · uscis.gov/i-131 · Messenginfo does not file on your behalf',
  },
  es: {
    metaTitle: 'Re-Parole U4U para ucranianos — Messenginfo',
    metaDesc: 'Prepare su paquete Form I-131 para Re-Parole. Presentación propia. No es asesoramiento legal.',
    badge: 'Para ucranianos U4U',
    title: 'Re-Parole para ucranianos',
    subtitle: '¿Su parole está por vencer? Le ayudamos a preparar el paquete de documentos.',
    ctaMain: 'Comenzar paquete Re-Parole →',
    legalOne: 'No es bufete · Usted presenta ante USCIS · Solo orientativo',
    trustPills: ['✔ Seguro', '✔ ~20 minutos', '✔ Sin registro', '✔ Usted presenta'],
    trustCards: [
      { icon: '🔒', title: 'Seguro', desc: 'Sus datos no se almacenan ni se comparten con nadie.' },
      { icon: '⏱', title: 'Rápido', desc: 'Paquete listo en aproximadamente 20 minutos.' },
      { icon: '✅', title: 'Sin registro', desc: 'No necesita cuenta — solo responda las preguntas.' },
      { icon: '📱', title: 'Usted presenta', desc: 'Nosotros preparamos. Usted envía a USCIS.' },
    ],
    howTitle: 'Cómo funciona',
    howSteps: [
      { num: '1', title: 'Responda preguntas', desc: 'El asistente hace 12 preguntas sobre su situación — sin jerga legal.' },
      { num: '2', title: 'Obtenga su paquete', desc: 'El sistema prepara el Form I-131 completo y una lista de documentos.' },
      { num: '3', title: 'Presente ante USCIS', desc: 'Imprima y presente por su cuenta — o con ayuda de un abogado.' },
    ],
    ctaStatus: '🔍 Verificar estado del caso →',
    ctaTranslate: '📄 Traducir documento →',
    priceTitle: 'Precio del servicio',
    priceService: 'Tarifa de servicio Messenginfo',
    priceServiceDesc: 'Preparación del paquete Form I-131',
    priceRows: [
      { label: '1 persona', price: '$15' },
      { label: '2 personas', price: '$25', save: 'ahorra $5' },
      { label: '3 personas', price: '$35', save: 'ahorra $10' },
      { label: '4+ (familia)', price: '$45', save: 'ahorra $15', highlight: true },
    ],
    priceUSCIS: 'Tarifa gubernamental USCIS',
    priceUSCISDesc: 'La mayoría de U4U — $0. Verifique en',
    priceUSCISLink: 'uscis.gov/feecalculator',
    priceUSCISVal: '$0*',
    entries: [
      {
        key: 'status',
        icon: '🔍',
        title: 'Verificar estado del caso',
        desc: '¿Ya presentó? Ingrese su número de recibo (IOE/WAC/LIN).',
        cta: 'Verificar →',
      },
      {
        key: 'translate',
        icon: '📄',
        title: 'Traducir documento para USCIS',
        desc: '¿Documentos no están en inglés? Prepare un borrador de traducción.',
        cta: 'Traducir →',
      },
      {
        key: 'sources',
        icon: '🔗',
        title: 'Recursos oficiales de USCIS',
        desc: 'I-131, I-94, calculadora de tarifas, direcciones postales, myUSCIS.',
        cta: 'Abrir →',
      },
    ],
    faqTitle: 'Preguntas frecuentes',
    faqs: [
      {
        q: '¿Es esto asesoramiento legal?',
        a: 'No. Messenginfo es un servicio de preparación de documentos. No somos un bufete y no brindamos asesoramiento legal. Si su situación es compleja, consulte a un abogado.',
      },
      {
        q: '¿Se almacenan mis datos?',
        a: 'Su sesión se almacena temporalmente solo para preparar el paquete. No compartimos datos personales con terceros.',
      },
      {
        q: '¿Qué es Re-Parole U4U?',
        a: 'Uniting for Ukraine (U4U) es un programa federal que permite a los ucranianos extender su estadía en EE. UU. mediante el Form I-131. Re-Parole es una nueva solicitud después del permiso inicial.',
      },
      {
        q: '¿Cuánto tiempo toma la preparación?',
        a: 'Unos 15–25 minutos, si tiene todos los documentos necesarios a mano (pasaporte, I-94, I-131 anterior si aplica).',
      },
      {
        q: '¿Debo pagar la tarifa de USCIS?',
        a: 'La mayoría de solicitantes U4U están exentos de tarifas ($0). Verifique el monto exacto en uscis.gov/feecalculator.',
      },
      {
        q: '¿Qué pasa si abandoné la sesión a mitad?',
        a: 'Su progreso se guarda en el navegador. Regrese a la misma página y continúe desde donde lo dejó.',
      },
    ],
    footer: 'Form I-131 edición 01/20/25 · uscis.gov/i-131 · Messenginfo no presenta en su nombre',
  },
} as const

type Locale = keyof typeof T

function getHref(entryKey: string, locale: string): string {
  if (entryKey === 'status') return `/${locale}/services/re-parole-u4u/status`
  if (entryKey === 'translate') return `/${locale}/services/translate-document`
  if (entryKey === 'sources') return `/${locale}/services/re-parole-u4u/sources`
  return '#'
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en
  return {
    title: t.metaTitle,
    description: t.metaDesc,
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/re-parole-u4u/info`,
      languages: Object.fromEntries(
        (['uk', 'ru', 'en', 'es'] as Locale[]).map((l) => [
          l,
          `https://messenginfo.com/${l}/services/re-parole-u4u/info`,
        ]),
      ),
    },
  }
}

export default async function ReParoleLandingPage({ params }: Props) {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en
  const wizardHref = `/${locale}/services/re-parole-u4u/start`

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--background)', padding: '0 0 48px' }}>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '24px 20px 20px',
        }}
      >
        {/* Badge */}
        <span
          style={{
            display: 'inline-block',
            fontSize: '15px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '99px',
            background: 'var(--info-bg)',
            color: 'var(--info-text)',
            marginBottom: '10px',
          }}
        >
          {t.badge}
        </span>

        {/* H1 — 34px (8K upgrade from 26px) */}
        <h1
          style={{
            fontSize: '34px',
            fontWeight: 800,
            lineHeight: 1.15,
            color: 'var(--text-1)',
            marginBottom: '8px',
          }}
        >
          {t.title}
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '16px',
            fontWeight: 500,
            color: 'var(--primary)',
            marginBottom: '18px',
            lineHeight: 1.4,
          }}
        >
          {t.subtitle}
        </p>

        {/* ★ PRIMARY CTA — full width, 56px, bright green ★ */}
        <a
          href={wizardHref}
          style={{
            display: 'block',
            width: '100%',
            padding: '0',
            height: '56px',
            lineHeight: '56px',
            textAlign: 'center',
            borderRadius: '14px',
            fontSize: '17px',
            fontWeight: 800,
            color: '#fff',
            background: 'var(--success)',
            textDecoration: 'none',
            boxShadow: '0 3px 14px rgba(22,163,74,0.30)',
            letterSpacing: '0.01em',
            marginBottom: '10px',
          }}
        >
          {t.ctaMain}
        </a>

        {/* Secondary CTAs — status + translate */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <a
            href={`/${locale}/services/re-parole-u4u/status`}
            style={{
              flex: 1,
              display: 'block',
              padding: '11px 8px',
              textAlign: 'center',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-1)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              textDecoration: 'none',
              lineHeight: 1.3,
            }}
          >
            {t.ctaStatus}
          </a>
          <a
            href={`/${locale}/services/translate-document`}
            style={{
              flex: 1,
              display: 'block',
              padding: '11px 8px',
              textAlign: 'center',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-1)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              textDecoration: 'none',
              lineHeight: 1.3,
            }}
          >
            {t.ctaTranslate}
          </a>
        </div>

        {/* Trust pills — below CTA */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            justifyContent: 'center',
            marginBottom: '10px',
          }}
        >
          {t.trustPills.map((pill) => (
            <span
              key={pill}
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--success-text, #166534)',
                background: 'var(--success-bg, #dcfce7)',
                padding: '3px 9px',
                borderRadius: '99px',
              }}
            >
              {pill}
            </span>
          ))}
        </div>

        {/* Single-line disclaimer */}
        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-3)',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {t.legalOne}
        </p>
      </section>

      {/* ── Trust cards — 2×2 grid ──────────────────────────────── */}
      <section style={{ padding: '16px 20px 0' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
          }}
        >
          {t.trustCards.map((card) => (
            <div
              key={card.title}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '14px 12px',
              }}
            >
              <div style={{ fontSize: '22px', marginBottom: '6px', lineHeight: 1 }}>{card.icon}</div>
              <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '4px' }}>
                {card.title}
              </p>
              <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.4 }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works — 3 steps ──────────────────────────────── */}
      <section style={{ padding: '16px 20px 0' }}>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {t.howTitle}
            </p>
          </div>
          {t.howSteps.map((step, idx) => (
            <div
              key={step.num}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '14px',
                borderBottom: idx < t.howSteps.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {step.num}
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '3px' }}>
                  {step.title}
                </p>
                <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.4 }}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Price block ─────────────────────────────────────────── */}
      <section style={{ padding: '16px 20px 0' }}>
        <div
          style={{
            border: '1.5px solid var(--border-strong)',
            borderRadius: '14px',
            background: 'var(--surface)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {t.priceTitle}
            </p>
          </div>

          {/* Messenginfo fee — per-person rows */}
          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: '12px 14px 8px' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>{t.priceService}</p>
              <p style={{ fontSize: '15px', color: 'var(--text-3)' }}>{t.priceServiceDesc}</p>
            </div>
            {(t.priceRows as ReadonlyArray<{ label: string; price: string; save?: string; highlight?: boolean }>).map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  background: row.highlight ? 'var(--success-bg, #dcfce7)' : 'transparent',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '15px', color: 'var(--text-2)' }}>{row.label}</span>
                  {row.save && (
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success-text, #166534)', background: 'var(--success-bg, #dcfce7)', padding: '1px 6px', borderRadius: '99px' }}>
                      {row.save}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '16px', fontWeight: 800, color: row.highlight ? 'var(--success)' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.price}
                </span>
              </div>
            ))}
          </div>

          {/* USCIS fee */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)' }}>{t.priceUSCIS}</p>
              <p style={{ fontSize: '15px', color: 'var(--text-3)' }}>
                {t.priceUSCISDesc}{' '}
                <a
                  href="https://www.uscis.gov/feecalculator"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary)', fontWeight: 600 }}
                >
                  {t.priceUSCISLink}
                </a>
              </p>
            </div>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--success)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: '8px' }}>
              {t.priceUSCISVal}
            </span>
          </div>
        </div>
      </section>

      {/* ── Secondary entry cards ──────────────────────────────── */}
      <section style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {t.entries.map((entry) => (
            <a
              key={entry.key}
              href={getHref(entry.key, locale)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderRadius: '12px',
                padding: '14px 16px',
                textDecoration: 'none',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: '24px', lineHeight: 1, flexShrink: 0 }}>{entry.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '2px' }}>
                  {entry.title}
                </p>
                <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.4 }}>
                  {entry.desc}
                </p>
              </div>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                {entry.cta}
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ── FAQ accordion — <details>/<summary>, zero JS ─────────── */}
      <section style={{ padding: '16px 20px 0' }}>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {t.faqTitle}
            </p>
          </div>
          {t.faqs.map((faq, idx) => (
            <details
              key={faq.q}
              style={{
                borderBottom: idx < t.faqs.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <summary
                style={{
                  padding: '13px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-1)',
                  cursor: 'pointer',
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>{faq.q}</span>
                <span
                  style={{
                    fontSize: '18px',
                    color: 'var(--text-3)',
                    flexShrink: 0,
                    lineHeight: 1,
                    fontWeight: 300,
                  }}
                >
                  +
                </span>
              </summary>
              <p
                style={{
                  padding: '0 14px 14px',
                  fontSize: '15px',
                  color: 'var(--text-2)',
                  lineHeight: 1.55,
                  marginTop: '-2px',
                }}
              >
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <section style={{ padding: '16px 20px 0' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.5 }}>
          <a
            href="https://www.uscis.gov/i-131"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-3)' }}
          >
            {t.footer}
          </a>
        </p>
      </section>
    </main>
  )
}
