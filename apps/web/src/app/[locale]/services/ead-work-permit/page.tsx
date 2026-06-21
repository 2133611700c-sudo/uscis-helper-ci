/**
 * /[locale]/services/ead-work-permit
 *
 * Stage 11A: EAD Work Permit (I-765) landing page.
 *
 * REGULATORY COPY VERIFIED 2026-05-06:
 *   - Form I-765 (current edition — verify at uscis.gov/i-765 before filing)
 *   - Category (c)(11): U4U Re-Parole recipients — file ONLY after I-131 approval
 *   - 540-day auto-extension for timely-filed renewals
 *   - Fee: DO NOT hardcode — uscis.gov/feecalculator
 *   - Source: uscis.gov/i-765 (verified 2026-05-06)
 *
 * No legal advice. Not a law firm. User files themselves with USCIS.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { ServiceBackBar } from '@/components/layout/ServiceBackBar'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    uk: 'EAD Дозвіл на роботу (I-765) для українців — Messenginfo',
    ru: 'EAD Разрешение на работу (I-765) для украинцев — Messenginfo',
    es: 'Permiso de Trabajo EAD (I-765) para Ucranianos — Messenginfo',
    en: 'EAD Work Permit (I-765) for Ukrainians — Messenginfo',
  }
  const descs: Record<string, string> = {
    uk: 'Підготуйте пакет Form I-765 для отримання або продовження дозволу на роботу. Категорія (c)(11) для U4U Re-Parole. Самостійна подача. Не юридична консультація.',
    ru: 'Подготовьте пакет Form I-765 для получения или продления разрешения на работу. Категория (c)(11) для U4U Re-Parole. Самостоятельная подача. Не юридическая консультация.',
    es: 'Prepare su paquete Form I-765 para obtener o renovar su permiso de trabajo. Categoría (c)(11) para U4U Re-Parole. Presentación propia. No es asesoría legal.',
    en: 'Prepare your Form I-765 packet to get or renew your EAD work permit. Category (c)(11) for U4U Re-Parole. File yourself. Not legal advice.',
  }
  return {
    title: titles[locale] ?? titles.en,
    description: descs[locale] ?? descs.en,
    metadataBase: new URL('https://messenginfo.com'),
  }
}

// ── Inline translations ───────────────────────────────────────────────────────

const T: Record<string, {
  badge: string; title: string; subtitle: string
  ctaMain: string; ctaStatus: string; ctaTranslate: string
  legalOne: string
  trustPills: string[]
  trustCards: { icon: string; title: string; desc: string }[]
  howTitle: string
  howSteps: { num: string; title: string; desc: string }[]
  warningTitle: string; warningDesc: string
  autoExtTitle: string; autoExtDesc: string
  faqTitle: string
  faqs: { q: string; a: string }[]
  priceTitle: string; priceService: string; priceServiceDesc: string
  priceUSCIS: string; priceUSCISDesc: string; priceUSCISNote: string
  priceRows: { label: string; price: string }[]
}> = {
  uk: {
    badge: 'Дозвіл на роботу для українців',
    title: 'Отримайте або продовжте EAD дозвіл на роботу',
    subtitle: 'Підготуйте пакет Form I-765 самостійно. ~15 хвилин. Ви подаєте до USCIS.',
    ctaMain: 'Почати підготовку I-765 →',
    ctaStatus: '🔍 Перевірити статус справи →',
    ctaTranslate: '📄 Перекласти документ →',
    legalOne: 'Не юридична фірма · Ви подаєте самостійно до USCIS · Тільки для довідки',
    trustPills: ['✔ ~15 хвилин', '✔ Без реєстрації', '✔ Ви подаєте', '✔ Безкоштовно'],
    trustCards: [
      { icon: '⚡', title: 'Швидко', desc: 'Пакет готовий приблизно за 15 хвилин.' },
      { icon: '✅', title: 'Без реєстрації', desc: 'Жодного акаунту — просто дайте відповіді.' },
      { icon: '📱', title: 'Ви подаєте', desc: 'Ми готуємо. Ви надсилаєте до USCIS самостійно.' },
      { icon: '🔒', title: 'Безпечно', desc: 'Ваші дані не зберігаються і не передаються.' },
    ],
    howTitle: 'Як це працює',
    howSteps: [
      { num: '1', title: 'Дайте відповіді', desc: 'Майстер задасть 7 питань про ваш статус і документи.' },
      { num: '2', title: 'Отримайте пакет', desc: 'Завантажте робочий лист I-765 з вашими даними.' },
      { num: '3', title: 'Подайте до USCIS', desc: 'Заповніть офіційну форму, зберіть документи і подайте поштою або онлайн.' },
    ],
    warningTitle: '⚠ Важливо для Re-Parole U4U',
    warningDesc: 'Не подавайте I-765 за категорією (c)(11) до отримання схвалення I-131 від USCIS. Подача до схвалення може призвести до відмови.',
    autoExtTitle: '540-денне автоматичне продовження',
    autoExtDesc: 'Якщо подати I-765 до закінчення поточного EAD, USCIS автоматично продовжує дозвіл на роботу на 540 днів. Збережіть копію квитанції про прийом як підтвердження.',
    faqTitle: 'Питання та відповіді',
    faqs: [
      { q: 'Коли можна подавати I-765?', a: 'Для категорії (c)(11) — лише після затвердження I-131 від USCIS. Для продовження — рекомендується подати за 6 місяців до закінчення EAD, щоб скористатись автоматичним продовженням на 540 днів.' },
      { q: 'Скільки коштує держмито?', a: 'Суму держмита перевіряйте на uscis.gov/feecalculator — вона може змінюватись. Не вірте цифрам з неофіційних джерел.' },
      { q: 'Чи можна подавати онлайн?', a: 'Так, більшість категорій підтримуються на my.uscis.gov. Перевірте конкретну категорію на uscis.gov/i-765.' },
      { q: 'Чи це юридична консультація?', a: 'Ні. Messenginfo — інструмент самопідготовки. Ми не юридична фірма. Якщо ваша ситуація складна — зверніться до ліцензованого адвоката.' },
    ],
    priceTitle: 'Вартість',
    priceService: 'Інструмент Messenginfo',
    priceServiceDesc: 'Підготовка робочого листа I-765',
    priceUSCIS: 'Держмито USCIS',
    priceUSCISDesc: 'Залежить від категорії. Перевірте на',
    priceUSCISNote: 'uscis.gov/feecalculator',
    priceRows: [
      { label: 'Робочий лист I-765', price: 'Безкоштовно' },
      { label: 'Держмито USCIS', price: 'Перевіряйте на uscis.gov/feecalculator' },
    ],
  },
  ru: {
    badge: 'Разрешение на работу для украинцев',
    title: 'Получите или продлите EAD разрешение на работу',
    subtitle: 'Подготовьте пакет Form I-765 самостоятельно. ~15 минут. Вы подаёте в USCIS.',
    ctaMain: 'Начать подготовку I-765 →',
    ctaStatus: '🔍 Проверить статус дела →',
    ctaTranslate: '📄 Перевести документ →',
    legalOne: 'Не юридическая фирма · Вы подаёте самостоятельно в USCIS · Только для справки',
    trustPills: ['✔ ~15 минут', '✔ Без регистрации', '✔ Вы подаёте', '✔ Бесплатно'],
    trustCards: [
      { icon: '⚡', title: 'Быстро', desc: 'Пакет готов примерно за 15 минут.' },
      { icon: '✅', title: 'Без регистрации', desc: 'Никакого аккаунта — просто ответьте на вопросы.' },
      { icon: '📱', title: 'Вы подаёте', desc: 'Мы готовим. Вы отправляете в USCIS самостоятельно.' },
      { icon: '🔒', title: 'Безопасно', desc: 'Ваши данные не хранятся и не передаются.' },
    ],
    howTitle: 'Как это работает',
    howSteps: [
      { num: '1', title: 'Ответьте на вопросы', desc: 'Мастер задаст 7 вопросов о вашем статусе и документах.' },
      { num: '2', title: 'Получите пакет', desc: 'Скачайте рабочий лист I-765 с вашими данными.' },
      { num: '3', title: 'Подайте в USCIS', desc: 'Заполните официальную форму, соберите документы и подайте по почте или онлайн.' },
    ],
    warningTitle: '⚠ Важно для Re-Parole U4U',
    warningDesc: 'Не подавайте I-765 по категории (c)(11) до получения одобрения I-131 от USCIS. Подача до одобрения может привести к отказу.',
    autoExtTitle: '540-дневное автоматическое продление',
    autoExtDesc: 'Если подать I-765 до истечения текущего EAD, USCIS автоматически продлевает разрешение на работу на 540 дней. Сохраните копию квитанции как подтверждение.',
    faqTitle: 'Вопросы и ответы',
    faqs: [
      { q: 'Когда можно подавать I-765?', a: 'Для категории (c)(11) — только после одобрения I-131 от USCIS. Для продления — рекомендуется подать за 6 месяцев до истечения EAD, чтобы воспользоваться автоматическим продлением на 540 дней.' },
      { q: 'Сколько стоит госпошлина?', a: 'Сумму госпошлины проверяйте на uscis.gov/feecalculator — она может меняться. Не доверяйте цифрам из неофициальных источников.' },
      { q: 'Можно ли подавать онлайн?', a: 'Да, большинство категорий поддерживаются на my.uscis.gov. Проверьте конкретную категорию на uscis.gov/i-765.' },
      { q: 'Это юридическая консультация?', a: 'Нет. Messenginfo — инструмент самоподготовки. Мы не юридическая фирма. Если ваша ситуация сложная — обратитесь к лицензированному адвокату.' },
    ],
    priceTitle: 'Стоимость',
    priceService: 'Инструмент Messenginfo',
    priceServiceDesc: 'Подготовка рабочего листа I-765',
    priceUSCIS: 'Госпошлина USCIS',
    priceUSCISDesc: 'Зависит от категории. Проверьте на',
    priceUSCISNote: 'uscis.gov/feecalculator',
    priceRows: [
      { label: 'Рабочий лист I-765', price: 'Бесплатно' },
      { label: 'Госпошлина USCIS', price: 'Проверяйте на uscis.gov/feecalculator' },
    ],
  },
  es: {
    badge: 'Permiso de Trabajo para Ucranianos',
    title: 'Obtenga o Renueve su Permiso de Trabajo EAD',
    subtitle: 'Prepare su paquete Form I-765 usted mismo. ~15 minutos. Usted presenta ante USCIS.',
    ctaMain: 'Comenzar Preparación I-765 →',
    ctaStatus: '🔍 Verificar Estado del Caso →',
    ctaTranslate: '📄 Traducir Documento →',
    legalOne: 'No es firma de abogados · Usted presenta ante USCIS · Solo para referencia',
    trustPills: ['✔ ~15 min', '✔ Sin registro', '✔ Usted presenta', '✔ Gratis'],
    trustCards: [
      { icon: '⚡', title: 'Rápido', desc: 'El paquete está listo en aproximadamente 15 minutos.' },
      { icon: '✅', title: 'Sin Registro', desc: 'Sin cuenta — solo responda las preguntas.' },
      { icon: '📱', title: 'Usted Presenta', desc: 'Nosotros preparamos. Usted presenta ante USCIS.' },
      { icon: '🔒', title: 'Seguro', desc: 'Sus datos no se almacenan ni se comparten.' },
    ],
    howTitle: 'Cómo Funciona',
    howSteps: [
      { num: '1', title: 'Responda Preguntas', desc: 'El asistente le hará 7 preguntas sobre su estado y documentos.' },
      { num: '2', title: 'Obtenga el Paquete', desc: 'Descargue su hoja de trabajo I-765 con sus datos.' },
      { num: '3', title: 'Presente ante USCIS', desc: 'Complete el formulario oficial, reúna documentos y presente por correo o en línea.' },
    ],
    warningTitle: '⚠ Importante para Re-Parole U4U',
    warningDesc: 'No presente I-765 bajo categoría (c)(11) hasta recibir la aprobación de I-131 de USCIS. Presentar antes de la aprobación puede resultar en rechazo.',
    autoExtTitle: 'Extensión Automática de 540 Días',
    autoExtDesc: 'Si presenta I-765 antes de que expire su EAD actual, USCIS extiende automáticamente su autorización de trabajo 540 días. Guarde una copia del recibo como comprobante.',
    faqTitle: 'Preguntas y Respuestas',
    faqs: [
      { q: '¿Cuándo puedo presentar I-765?', a: 'Para categoría (c)(11): solo después de la aprobación de I-131. Para renovaciones: se recomienda presentar 6 meses antes de que venza el EAD para aprovechar la extensión automática de 540 días.' },
      { q: '¿Cuánto cuesta la tarifa?', a: 'Verifique la tarifa actual en uscis.gov/feecalculator — puede cambiar. No confíe en cifras de fuentes no oficiales.' },
      { q: '¿Puedo presentar en línea?', a: 'Sí, la mayoría de categorías son compatibles con my.uscis.gov. Verifique su categoría específica en uscis.gov/i-765.' },
      { q: '¿Es asesoría legal?', a: 'No. Messenginfo es una herramienta de autopreparación. No somos firma de abogados. Si su situación es compleja, consulte a un abogado de inmigración.' },
    ],
    priceTitle: 'Precio',
    priceService: 'Herramienta Messenginfo',
    priceServiceDesc: 'Preparación de hoja de trabajo I-765',
    priceUSCIS: 'Tarifa USCIS',
    priceUSCISDesc: 'Depende de su categoría. Verifique en',
    priceUSCISNote: 'uscis.gov/feecalculator',
    priceRows: [
      { label: 'Hoja de trabajo I-765', price: 'Gratis' },
      { label: 'Tarifa USCIS', price: 'Verifique en uscis.gov/feecalculator' },
    ],
  },
  en: {
    badge: 'Work Permit for Ukrainians',
    title: 'Get or Renew Your EAD Work Permit',
    subtitle: 'Prepare your Form I-765 packet yourself. ~15 minutes. You file with USCIS.',
    ctaMain: 'Start I-765 Preparation →',
    ctaStatus: '🔍 Check Case Status →',
    ctaTranslate: '📄 Translate a Document →',
    legalOne: 'Not a law firm · You file yourself with USCIS · For reference only',
    trustPills: ['✔ ~15 min', '✔ No registration', '✔ You file', '✔ Free tool'],
    trustCards: [
      { icon: '⚡', title: 'Fast', desc: 'Packet ready in about 15 minutes.' },
      { icon: '✅', title: 'No Registration', desc: 'No account needed — just answer the questions.' },
      { icon: '📱', title: 'You File', desc: 'We prepare. You submit to USCIS yourself.' },
      { icon: '🔒', title: 'Private', desc: 'Your data is not stored or shared.' },
    ],
    howTitle: 'How It Works',
    howSteps: [
      { num: '1', title: 'Answer Questions', desc: 'The wizard asks 7 questions about your status and documents.' },
      { num: '2', title: 'Get Your Packet', desc: 'Download your I-765 preparation worksheet with your data.' },
      { num: '3', title: 'File with USCIS', desc: 'Complete the official form, gather documents, and mail or file online.' },
    ],
    warningTitle: '⚠ Important for Re-Parole U4U',
    warningDesc: 'Do not file I-765 under category (c)(11) until you have received I-131 approval from USCIS. Filing before approval may result in rejection.',
    autoExtTitle: '540-Day Automatic Extension',
    autoExtDesc: 'Filing I-765 renewal before your current EAD expires triggers an automatic 540-day work authorization extension. Keep your filing receipt as proof.',
    faqTitle: 'FAQ',
    faqs: [
      { q: 'When can I file I-765?', a: 'For category (c)(11): only after I-131 approval. For renewals: file at least 6 months before your EAD expires to receive the 540-day automatic extension.' },
      { q: 'How much is the filing fee?', a: 'Check the current fee at uscis.gov/feecalculator — it changes. Do not rely on unofficial sources.' },
      { q: 'Can I file online?', a: 'Yes, most categories are supported at my.uscis.gov. Check your specific category at uscis.gov/i-765.' },
      { q: 'Is this legal advice?', a: 'No. Messenginfo is a self-help preparation tool. We are not a law firm. If your situation is complex, consult a licensed immigration attorney.' },
    ],
    priceTitle: 'Pricing',
    priceService: 'Messenginfo Tool',
    priceServiceDesc: 'I-765 preparation worksheet',
    priceUSCIS: 'USCIS Filing Fee',
    priceUSCISDesc: 'Depends on your category. Check at',
    priceUSCISNote: 'uscis.gov/feecalculator',
    priceRows: [
      { label: 'I-765 Worksheet', price: 'Free' },
      { label: 'USCIS Filing Fee', price: 'Check uscis.gov/feecalculator' },
    ],
  },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function EADLandingPage({ params }: Props) {
  const { locale } = await params
  const t = T[locale] ?? T.en

  return (
    <>
    <ServiceBackBar locale={locale} />
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-10">

      {/* Hero */}
      <section>
        <div className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm font-bold mb-3">
          {t.badge}
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-extrabold text-[var(--text-1)] leading-tight">
          {t.title}
        </h1>
        <p className="mt-3 text-[16px] text-[var(--text-2)]">{t.subtitle}</p>

        <div className="mt-5">
          <Link
            href={`/${locale}/services/ead-work-permit/start`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[16px] rounded-2xl transition-colors"
          >
            {t.ctaMain}
          </Link>
        </div>

        {/* Trust pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {t.trustPills.map(pill => (
            <span key={pill} className="px-3 py-1 rounded-full text-sm font-semibold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
              {pill}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-[var(--text-2)]">{t.legalOne}</p>
      </section>

      {/* Warning block for re-parole */}
      <section className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-300">
        <div className="font-bold text-[14px] text-amber-800 dark:text-amber-200 mb-1">{t.warningTitle}</div>
        <p className="text-sm text-amber-700 dark:text-amber-300">{t.warningDesc}</p>
      </section>

      {/* Auto-extension callout */}
      <section className="p-4 rounded-2xl bg-green-50 dark:bg-green-950 border border-green-200">
        <div className="font-bold text-[14px] text-green-800 dark:text-green-200 mb-1">✅ {t.autoExtTitle}</div>
        <p className="text-sm text-green-700 dark:text-green-300">{t.autoExtDesc}</p>
      </section>

      {/* Trust cards */}
      <section>
        <div className="grid grid-cols-2 gap-3">
          {t.trustCards.map(card => (
            <div key={card.title} className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)]">
              <div className="text-2xl mb-1">{card.icon}</div>
              <div className="font-bold text-[14px] text-[var(--text-1)]">{card.title}</div>
              <div className="text-sm text-[var(--text-2)] mt-1">{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-[20px] font-bold text-[var(--text-1)] mb-4">{t.howTitle}</h2>
        <div className="space-y-3">
          {t.howSteps.map(s => (
            <div key={s.num} className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[14px]">
                {s.num}
              </div>
              <div>
                <div className="font-bold text-[15px] text-[var(--text-1)]">{s.title}</div>
                <div className="text-sm text-[var(--text-2)] mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section>
        <h2 className="text-[20px] font-bold text-[var(--text-1)] mb-4">{t.priceTitle}</h2>
        <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-1)]">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-bold text-[15px] text-[var(--text-1)]">{t.priceService}</div>
                <div className="text-sm text-[var(--text-2)]">{t.priceServiceDesc}</div>
              </div>
              <div className="text-[20px] font-extrabold text-green-600">$0</div>
            </div>
          </div>
          <div className="p-4 bg-[var(--surface-2)]">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-[15px] text-[var(--text-1)]">{t.priceUSCIS}</div>
                <div className="text-sm text-[var(--text-2)]">
                  {t.priceUSCISDesc}{' '}
                  <a href="https://www.uscis.gov/feecalculator" target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline">
                    {t.priceUSCISNote}
                  </a>
                </div>
              </div>
              <div className="text-[14px] font-bold text-[var(--text-2)] text-right">→</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA again */}
      <section className="text-center">
        <Link
          href={`/${locale}/services/ead-work-permit/start`}
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[16px] rounded-2xl transition-colors"
        >
          {t.ctaMain}
        </Link>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="text-[20px] font-bold text-[var(--text-1)] mb-4">{t.faqTitle}</h2>
        <div className="space-y-2">
          {t.faqs.map(faq => (
            <details key={faq.q} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden group">
              <summary className="px-4 py-3 font-semibold text-[14px] text-[var(--text-1)] cursor-pointer select-none list-none flex justify-between items-center hover:bg-[var(--surface-2)] transition-colors">
                {faq.q}
                <span className="text-[var(--text-2)] group-open:rotate-180 transition-transform text-[18px]">⌃</span>
              </summary>
              <div className="px-4 pb-3 text-sm text-[var(--text-2)] leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* Other services */}
      <section className="pt-4 border-t border-[var(--border)]">
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href={`/${locale}/services/re-parole-u4u`}
            className="flex-1 text-center py-2.5 px-4 rounded-xl border-2 border-[var(--border)] text-[14px] font-semibold text-[var(--text-1)] hover:border-blue-400 transition-colors">
            Re-Parole U4U (I-131)
          </Link>
          <Link href={`/${locale}/services/translate-document`}
            className="flex-1 text-center py-2.5 px-4 rounded-xl border-2 border-[var(--border)] text-[14px] font-semibold text-[var(--text-1)] hover:border-blue-400 transition-colors">
            {t.ctaTranslate}
          </Link>
        </div>
      </section>

    </main>
    </>
  )
}
