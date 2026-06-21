'use client'
import Link from 'next/link'
import { track } from '@/components/analytics/Analytics'

// USCIS Case Status Online — official portal.
// Messenginfo does NOT process status data. This page is purely a navigational shortcut.
const USCIS_CASE_STATUS_URL = 'https://egov.uscis.gov/'
const USCIS_PROCESSING_TIMES_URL = 'https://egov.uscis.gov/processing-times/'

const T = {
  en: {
    badge: 'Quick Link',
    title: 'Check Your USCIS Case Status',
    subtitle: 'Case status is provided exclusively by USCIS. Messenginfo does not handle or store receipt numbers — we just send you to the official USCIS portal.',
    openBtn: 'Open USCIS Case Status Online',
    openHint: 'Opens egov.uscis.gov in a new tab. You enter your receipt number there.',
    whatTitle: 'How receipt numbers look',
    formCodes: [
      { code: 'EAC', form: 'I-131, I-765 (Vermont SC)', color: 'bg-blue-100 text-blue-800' },
      { code: 'WAC', form: 'I-131, I-765 (California SC)', color: 'bg-purple-100 text-purple-800' },
      { code: 'LIN', form: 'I-485, I-539 (Nebraska SC)', color: 'bg-green-100 text-green-800' },
      { code: 'MSC', form: 'I-131 (NBC)', color: 'bg-orange-100 text-orange-800' },
      { code: 'SRC', form: 'I-765 (Texas SC)', color: 'bg-pink-100 text-pink-800' },
      { code: 'IOE', form: 'Online filings', color: 'bg-gray-100 text-gray-800' },
    ],
    processingTimesTitle: 'Official processing times',
    processingTimesDesc: 'Processing times change frequently. Always check the official USCIS tool — never rely on third-party estimates.',
    processingTimesBtn: 'Open Processing Times on USCIS.gov',
    faqTitle: 'Common questions',
    faqs: [
      { q: 'Where do I find my receipt number?', a: 'On Form I-797 (Notice of Action) — the 13-character code at the top. Also in your USCIS online account if you filed online.' },
      { q: 'What does "Case Was Received" mean?', a: 'USCIS received your application. Processing has not started yet. This is normal and can last weeks to months.' },
      { q: 'What does "Request for Evidence (RFE)" mean?', a: 'USCIS needs more documents. You typically have 87 days to respond. Consult an attorney if you receive an RFE.' },
      { q: 'My status hasn\'t changed in months — what can I do?', a: 'Check USCIS processing times at uscis.gov/processing-times. If outside the published timeframe, you may submit an e-Request (service request) at uscis.gov/e-request.' },
    ],
    disclaimer: 'Messenginfo is not affiliated with USCIS and does not process case status data. This page is a navigational shortcut to the official USCIS Case Status Online tool. Not legal advice.',
    relatedTitle: 'Related tools',
  },
  uk: {
    badge: 'Швидке посилання',
    title: 'Перевірка статусу справи USCIS',
    subtitle: 'Статус справи надає виключно USCIS. Messenginfo не обробляє і не зберігає номери — ми лише переводимо вас на офіційний портал USCIS.',
    openBtn: 'Відкрити USCIS Case Status Online',
    openHint: 'Відкриється egov.uscis.gov у новій вкладці. Номер отримання ви вводите там.',
    whatTitle: 'Як виглядають номери отримань',
    formCodes: [
      { code: 'EAC', form: 'I-131, I-765 (Vermont SC)', color: 'bg-blue-100 text-blue-800' },
      { code: 'WAC', form: 'I-131, I-765 (California SC)', color: 'bg-purple-100 text-purple-800' },
      { code: 'LIN', form: 'I-485, I-539 (Nebraska SC)', color: 'bg-green-100 text-green-800' },
      { code: 'MSC', form: 'I-131 (NBC)', color: 'bg-orange-100 text-orange-800' },
      { code: 'SRC', form: 'I-765 (Texas SC)', color: 'bg-pink-100 text-pink-800' },
      { code: 'IOE', form: 'Онлайн-подачі', color: 'bg-gray-100 text-gray-800' },
    ],
    processingTimesTitle: 'Офіційні терміни розгляду',
    processingTimesDesc: 'Терміни часто змінюються. Завжди перевіряйте на офіційному інструменті USCIS — ніколи не покладайтесь на сторонні оцінки.',
    processingTimesBtn: 'Відкрити терміни на USCIS.gov',
    faqTitle: 'Часті запитання',
    faqs: [
      { q: 'Де знайти номер отримання?', a: 'У Form I-797 (Notice of Action) — 13-символьний код вгорі. Також в особистому кабінеті USCIS, якщо ви подавали онлайн.' },
      { q: 'Що означає "Case Was Received"?', a: 'USCIS отримав вашу заяву. Розгляд ще не розпочався. Це нормально і може тривати тижні або місяці.' },
      { q: 'Що означає "Request for Evidence (RFE)"?', a: 'USCIS потребує додаткових документів. Зазвичай у вас є 87 днів для відповіді. Проконсультуйтесь з адвокатом.' },
      { q: 'Статус не змінювався місяцями — що робити?', a: 'Перевірте терміни розгляду на uscis.gov/processing-times. Якщо поза межами опублікованих термінів, подайте e-Request на uscis.gov/e-request.' },
    ],
    disclaimer: 'Messenginfo не пов\'язаний з USCIS і не обробляє дані про статус справи. Ця сторінка — навігаційне посилання на офіційний інструмент USCIS Case Status Online. Не юридична консультація.',
    relatedTitle: 'Пов\'язані інструменти',
  },
  ru: {
    badge: 'Быстрая ссылка',
    title: 'Проверка статуса дела USCIS',
    subtitle: 'Статус дела предоставляет исключительно USCIS. Messenginfo не обрабатывает и не хранит номера — мы только переводим вас на официальный портал USCIS.',
    openBtn: 'Открыть USCIS Case Status Online',
    openHint: 'Откроется egov.uscis.gov в новой вкладке. Номер получения вы вводите там.',
    whatTitle: 'Как выглядят номера получений',
    formCodes: [
      { code: 'EAC', form: 'I-131, I-765 (Vermont SC)', color: 'bg-blue-100 text-blue-800' },
      { code: 'WAC', form: 'I-131, I-765 (California SC)', color: 'bg-purple-100 text-purple-800' },
      { code: 'LIN', form: 'I-485, I-539 (Nebraska SC)', color: 'bg-green-100 text-green-800' },
      { code: 'MSC', form: 'I-131 (NBC)', color: 'bg-orange-100 text-orange-800' },
      { code: 'SRC', form: 'I-765 (Texas SC)', color: 'bg-pink-100 text-pink-800' },
      { code: 'IOE', form: 'Онлайн-подачи', color: 'bg-gray-100 text-gray-800' },
    ],
    processingTimesTitle: 'Официальные сроки рассмотрения',
    processingTimesDesc: 'Сроки часто меняются. Всегда проверяйте на официальном инструменте USCIS — не полагайтесь на сторонние оценки.',
    processingTimesBtn: 'Открыть сроки на USCIS.gov',
    faqTitle: 'Частые вопросы',
    faqs: [
      { q: 'Где найти номер получения?', a: 'В Form I-797 (Notice of Action) — 13-символьный код вверху. Также в личном кабинете USCIS, если вы подавали онлайн.' },
      { q: 'Что означает "Case Was Received"?', a: 'USCIS получил вашу заявку. Рассмотрение ещё не начато. Это нормально и может длиться недели или месяцы.' },
      { q: 'Что означает "Request for Evidence (RFE)"?', a: 'USCIS требует дополнительных документов. Обычно у вас есть 87 дней для ответа. Проконсультируйтесь с адвокатом.' },
      { q: 'Статус не менялся месяцами — что делать?', a: 'Проверьте сроки рассмотрения на uscis.gov/processing-times. Если вне опубликованных сроков, подайте e-Request на uscis.gov/e-request.' },
    ],
    disclaimer: 'Messenginfo не связан с USCIS и не обрабатывает данные о статусе дела. Эта страница — навигационная ссылка на официальный инструмент USCIS Case Status Online. Не юридическая консультация.',
    relatedTitle: 'Связанные инструменты',
  },
  es: {
    badge: 'Enlace Rápido',
    title: 'Verifique el Estado de su Caso USCIS',
    subtitle: 'El estado del caso lo proporciona exclusivamente USCIS. Messenginfo no procesa ni almacena números de recibo — solo le enviamos al portal oficial de USCIS.',
    openBtn: 'Abrir USCIS Case Status Online',
    openHint: 'Se abre egov.uscis.gov en una nueva pestaña. Ingrese su número de recibo allí.',
    whatTitle: 'Cómo se ven los números de recibo',
    formCodes: [
      { code: 'EAC', form: 'I-131, I-765 (Vermont SC)', color: 'bg-blue-100 text-blue-800' },
      { code: 'WAC', form: 'I-131, I-765 (California SC)', color: 'bg-purple-100 text-purple-800' },
      { code: 'LIN', form: 'I-485, I-539 (Nebraska SC)', color: 'bg-green-100 text-green-800' },
      { code: 'MSC', form: 'I-131 (NBC)', color: 'bg-orange-100 text-orange-800' },
      { code: 'SRC', form: 'I-765 (Texas SC)', color: 'bg-pink-100 text-pink-800' },
      { code: 'IOE', form: 'Presentaciones en línea', color: 'bg-gray-100 text-gray-800' },
    ],
    processingTimesTitle: 'Tiempos de procesamiento oficiales',
    processingTimesDesc: 'Los tiempos cambian con frecuencia. Siempre verifique en la herramienta oficial de USCIS — nunca confíe en estimaciones de terceros.',
    processingTimesBtn: 'Abrir Tiempos en USCIS.gov',
    faqTitle: 'Preguntas frecuentes',
    faqs: [
      { q: '¿Dónde encuentro mi número de recibo?', a: 'En el Formulario I-797 (Aviso de Acción) — el código de 13 caracteres en la parte superior. También en su cuenta en línea de USCIS si presentó en línea.' },
      { q: '¿Qué significa "Case Was Received"?', a: 'USCIS recibió su solicitud. El procesamiento aún no ha comenzado. Esto es normal y puede durar semanas o meses.' },
      { q: '¿Qué significa "Request for Evidence (RFE)"?', a: 'USCIS necesita más documentos. Generalmente tiene 87 días para responder. Consulte a un abogado si recibe un RFE.' },
      { q: 'Mi estado no ha cambiado en meses — ¿qué puedo hacer?', a: 'Verifique los tiempos de procesamiento en uscis.gov/processing-times. Si está fuera del marco de tiempo publicado, puede enviar un e-Request en uscis.gov/e-request.' },
    ],
    disclaimer: 'Messenginfo no está afiliado con USCIS y no procesa datos de estado de casos. Esta página es un acceso directo de navegación a la herramienta oficial USCIS Case Status Online. No es asesoría legal.',
    relatedTitle: 'Herramientas relacionadas',
  },
}

export function CaseStatusTracker({ locale }: { locale: string }) {
  const t = (T as Record<string, typeof T.en>)[locale] ?? T.en

  function handleOpen() {
    track('uscis_portal_clicked', { locale, source: 'case_status_page' })
  }

  function handleProcessingTimes() {
    track('uscis_processing_times_clicked', { locale })
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'USCIS Case Status — Quick Link',
    url: `https://messenginfo.com/${locale}/services/uscis-case-status`,
    description: 'Direct link to the official USCIS Case Status Online tool',
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="min-h-screen bg-[var(--surface-1)]">
        {/* Hero */}
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 text-white py-14 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <span className="inline-block bg-blue-500/40 border border-blue-400/40 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide mb-4">
              {t.badge}
            </span>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{t.title}</h1>
            <p className="text-blue-100 text-base leading-relaxed max-w-lg mx-auto">{t.subtitle}</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

          {/* Single CTA — link only, no form, no inputs */}
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-7 text-center">
            <a
              href={USCIS_CASE_STATUS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpen}
              className="inline-flex items-center gap-2 bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-[16px] hover:bg-blue-800 transition-colors shadow-sm"
            >
              {t.openBtn} ↗
            </a>
            <p className="mt-4 text-sm text-blue-700 leading-relaxed">{t.openHint}</p>
          </div>

          {/* Receipt number codes — reference table, helps users identify their number */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <h2 className="text-base font-bold text-[var(--text-1)] mb-3">{t.whatTitle}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {t.formCodes.map((item: { code: string; form: string; color: string }) => (
                <div key={item.code} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface-1)]">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${item.color}`}>{item.code}</span>
                  <span className="text-sm text-[var(--text-2)]">{item.form}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Processing times — external link to USCIS only */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-base font-bold text-amber-900 mb-2">⏱ {t.processingTimesTitle}</h2>
            <p className="text-sm text-amber-800 mb-4 leading-relaxed">{t.processingTimesDesc}</p>
            <a
              href={USCIS_PROCESSING_TIMES_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleProcessingTimes}
              className="inline-flex items-center gap-2 bg-amber-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-amber-800 transition-colors"
            >
              {t.processingTimesBtn} ↗
            </a>
          </div>

          {/* FAQ */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
            <h2 className="text-base font-bold text-[var(--text-1)] mb-4">{t.faqTitle}</h2>
            <div className="space-y-4">
              {t.faqs.map((faq: { q: string; a: string }) => (
                <div key={faq.q}>
                  <p className="text-base font-semibold text-[var(--text-1)] mb-1">❓ {faq.q}</p>
                  <p className="text-sm text-[var(--text-2)] leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Related tools */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <h2 className="text-base font-bold text-[var(--text-1)] mb-3">{t.relatedTitle}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { href: `/${locale}/services/translate-document`, icon: '📄', label: locale === 'uk' ? 'Переклад документів' : locale === 'ru' ? 'Перевод документов' : locale === 'es' ? 'Traducción de documentos' : 'Document Translation' },
                { href: `/${locale}/services/re-parole-u4u`, icon: '🛡', label: locale === 'uk' ? 'Re-Parole U4U' : 'Re-Parole U4U' },
                { href: `/${locale}/services/ead-work-permit`, icon: '💼', label: locale === 'uk' ? 'EAD Дозвіл на роботу' : locale === 'ru' ? 'EAD Разрешение на работу' : locale === 'es' ? 'Permiso de Trabajo EAD' : 'EAD Work Permit' },
                { href: `/${locale}/services/tps-status`, icon: '🔒', label: 'TPS Ukraine Status' },
              ].map((link) => (
                <Link key={link.href} href={link.href}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-base font-semibold text-[var(--text-1)] hover:border-blue-400 hover:bg-blue-50 transition-all">
                  <span className="text-xl">{link.icon}</span>{link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-sm text-[var(--text-2)] text-center leading-relaxed pb-4">{t.disclaimer}</p>
        </div>
      </div>
    </>
  )
}
