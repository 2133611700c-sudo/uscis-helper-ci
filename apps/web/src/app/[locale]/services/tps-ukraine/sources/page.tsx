/**
 * /[locale]/services/tps-ukraine/sources
 *
 * Official USCIS sources for TPS Ukraine. Server component, zero JS.
 * Outbound links open in new tab. All facts verified 2026-05-12.
 * Updated 2026-05-12: added H.R.1 EAD cap rule (FR 2026-08333) and
 * signature rule (FR 2026-09289) per USCIS monitoring cycle.
 */

import type { Metadata } from 'next'
import { ServiceBackBar } from '@/components/layout/ServiceBackBar'

interface Props {
  params: Promise<{ locale: string }>
}

const T = {
  uk: {
    metaTitle: 'TPS Україна — офіційні джерела | Messenginfo',
    metaDesc: 'Усі офіційні джерела USCIS для TPS Ukraine: форми I-821, I-765, I-912, my.uscis.gov, Federal Register, fee calculator.',
    title: 'Офіційні джерела TPS Україна',
    intro: 'Це посилання на офіційні сторінки USCIS та Federal Register. Завжди звіряйтесь з ними — Messenginfo не змінює офіційні правила і не подає за вас.',
    back: '← Назад до TPS',
    note: 'Дата останньої перевірки: 12 травня 2026 р.',
  },
  ru: {
    metaTitle: 'TPS Украина — официальные источники | Messenginfo',
    metaDesc: 'Все официальные источники USCIS для TPS Ukraine: формы I-821, I-765, I-912, my.uscis.gov, Federal Register, fee calculator.',
    title: 'Официальные источники TPS Украина',
    intro: 'Это ссылки на официальные страницы USCIS и Federal Register. Всегда сверяйтесь с ними — Messenginfo не меняет официальные правила и не подаёт за вас.',
    back: '← Назад к TPS',
    note: 'Дата последней проверки: 12 мая 2026 г.',
  },
  en: {
    metaTitle: 'TPS Ukraine — official sources | Messenginfo',
    metaDesc: 'All official USCIS sources for TPS Ukraine: Forms I-821, I-765, I-912, my.uscis.gov, Federal Register, fee calculator.',
    title: 'Official TPS Ukraine sources',
    intro: 'These are links to the official USCIS and Federal Register pages. Always verify with them — Messenginfo does not change official rules and does not file for you.',
    back: '← Back to TPS',
    note: 'Last verified: May 12, 2026.',
  },
  es: {
    metaTitle: 'TPS Ucrania — fuentes oficiales | Messenginfo',
    metaDesc: 'Todas las fuentes oficiales de USCIS para TPS Ucrania: Forms I-821, I-765, I-912, my.uscis.gov, Federal Register, fee calculator.',
    title: 'Fuentes oficiales TPS Ucrania',
    intro: 'Estos son enlaces a las páginas oficiales de USCIS y Federal Register. Siempre verifique con ellos — Messenginfo no cambia las reglas oficiales y no presenta por usted.',
    back: '← Volver a TPS',
    note: 'Última verificación: 12 de mayo de 2026.',
  },
} as const

type Locale = keyof typeof T

interface SourceCategory {
  title: string
  items: Array<{ name: string; desc: string; url: string; label: string }>
}

const CATEGORIES: Record<Locale, SourceCategory[]> = {
  uk: [
    {
      title: '📋 TPS Україна — головні сторінки USCIS',
      items: [
        { name: 'TPS Designated Country: Ukraine', desc: 'Офіційна сторінка USCIS про TPS для України — поточні дати, продовження, автопродовження EAD.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine', label: 'uscis.gov/.../tps-ukraine' },
        { name: 'TPS — загальна сторінка', desc: 'Загальна сторінка USCIS про програму TPS: хто має право, як подавати, що таке continuous residence.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status', label: 'uscis.gov/humanitarian/temporary-protected-status' },
      ],
    },
    {
      title: '📝 Форми',
      items: [
        { name: 'Form I-821', desc: 'Application for Temporary Protected Status — головна форма TPS.', url: 'https://www.uscis.gov/i-821', label: 'uscis.gov/i-821' },
        { name: 'Form I-765', desc: 'Application for Employment Authorization (EAD) — дозвіл на роботу.', url: 'https://www.uscis.gov/i-765', label: 'uscis.gov/i-765' },
        { name: 'Form I-912', desc: 'Request for Fee Waiver — звільнення від держмита (тільки паперова подача).', url: 'https://www.uscis.gov/i-912', label: 'uscis.gov/i-912' },
        { name: 'Form I-131', desc: 'Advance Parole — тільки якщо вам потрібно подорожувати під час дії TPS.', url: 'https://www.uscis.gov/i-131', label: 'uscis.gov/i-131' },
      ],
    },
    {
      title: '💵 Збори та подача',
      items: [
        { name: 'USCIS fee calculator', desc: 'Точно вирахуйте суму держмита для вашої комбінації форм.', url: 'https://www.uscis.gov/feecalculator', label: 'uscis.gov/feecalculator' },
        { name: 'my.uscis.gov — онлайн-подача', desc: 'Офіційний акаунт USCIS для онлайн-подачі та статусу справи.', url: 'https://my.uscis.gov/', label: 'my.uscis.gov' },
      ],
    },
    {
      title: '⚠ Нові правила 2026 — перевірте перед поданням',
      items: [
        { name: 'H.R.1 TPS EAD cap (діє з 29 травня 2026)', desc: 'Правило H.R.1: нові TPS EAD дійсні лише 1 рік. Деякі збори H.R.1 не скасовуються через I-912. Джерело: 91 FR 22952 (doc 2026-08333).', url: 'https://www.federalregister.gov/documents/2026/04/29/2026-08333/uscis-immigration-fees-and-related-procedures-required-by-hr1-reconciliation-bill', label: 'federalregister.gov/.../2026-08333' },
        { name: 'Підписи на формах (діє з 10 липня 2026)', desc: 'USCIS може відхилити заяву і утримати збір, якщо підпис недійсний (копія, текст, програма). Джерело: 91 FR 25479 (doc 2026-09289).', url: 'https://www.federalregister.gov/documents/2026/05/11/2026-09289/signatures-on-immigration-benefit-requests', label: 'federalregister.gov/.../2026-09289' },
      ],
    },
    {
      title: '📰 Federal Register та офіційні оголошення',
      items: [
        { name: 'Federal Register notice 2025-00771', desc: 'Розширення TPS Ukraine на 18 місяців (квітень 2025 — жовтень 2026), 60-денне re-registration вікно, автопродовження EAD.', url: 'https://www.federalregister.gov/documents/2025/01/17/2025-00771/extension-of-the-designation-of-ukraine-for-temporary-protected-status', label: 'federalregister.gov/.../2025-00771' },
        { name: 'USCIS news — Extension of TPS for Ukraine', desc: 'Офіційне оголошення USCIS про продовження TPS Ukraine.', url: 'https://www.uscis.gov/newsroom/stakeholder-messages/extension-of-tps-for-ukraine', label: 'uscis.gov/newsroom/.../tps-ukraine' },
      ],
    },
    {
      title: '🛂 Документи та подача',
      items: [
        { name: 'CBP I-94 — історія в’їздів', desc: 'Перевірте дату вашого в’їзду в США — вона потрібна для secured residence.', url: 'https://i94.cbp.dhs.gov/', label: 'i94.cbp.dhs.gov' },
        { name: 'USCIS — статус справи', desc: 'Перевірте статус справи за номером квитанції (IOE/WAC/LIN).', url: 'https://egov.uscis.gov/', label: 'egov.uscis.gov' },
        { name: 'USCIS — знайти legal services', desc: 'Перевірена USCIS база ліцензованих legal services та pro-bono клінік.', url: 'https://www.uscis.gov/avoid-scams/find-legal-services', label: 'uscis.gov/avoid-scams/find-legal-services' },
      ],
    },
  ],
  ru: [
    {
      title: '📋 TPS Украина — главные страницы USCIS',
      items: [
        { name: 'TPS Designated Country: Ukraine', desc: 'Официальная страница USCIS о TPS для Украины — текущие даты, продление, автопродление EAD.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine', label: 'uscis.gov/.../tps-ukraine' },
        { name: 'TPS — общая страница', desc: 'Общая страница USCIS о программе TPS: кто имеет право, как подавать, что такое continuous residence.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status', label: 'uscis.gov/humanitarian/temporary-protected-status' },
      ],
    },
    {
      title: '📝 Формы',
      items: [
        { name: 'Form I-821', desc: 'Application for Temporary Protected Status — главная форма TPS.', url: 'https://www.uscis.gov/i-821', label: 'uscis.gov/i-821' },
        { name: 'Form I-765', desc: 'Application for Employment Authorization (EAD) — разрешение на работу.', url: 'https://www.uscis.gov/i-765', label: 'uscis.gov/i-765' },
        { name: 'Form I-912', desc: 'Request for Fee Waiver — освобождение от госпошлины (только бумажная подача).', url: 'https://www.uscis.gov/i-912', label: 'uscis.gov/i-912' },
        { name: 'Form I-131', desc: 'Advance Parole — только если вам нужно путешествовать во время TPS.', url: 'https://www.uscis.gov/i-131', label: 'uscis.gov/i-131' },
      ],
    },
    {
      title: '💵 Сборы и подача',
      items: [
        { name: 'USCIS fee calculator', desc: 'Точно рассчитайте сумму госпошлины для вашей комбинации форм.', url: 'https://www.uscis.gov/feecalculator', label: 'uscis.gov/feecalculator' },
        { name: 'my.uscis.gov — онлайн-подача', desc: 'Официальный аккаунт USCIS для онлайн-подачи и статуса дела.', url: 'https://my.uscis.gov/', label: 'my.uscis.gov' },
      ],
    },
    {
      title: '⚠ Новые правила 2026 — проверьте перед подачей',
      items: [
        { name: 'H.R.1 TPS EAD cap (с 29 мая 2026)', desc: 'Правило H.R.1: новые TPS EAD действительны только 1 год. Некоторые сборы H.R.1 не отменяются через I-912. Источник: 91 FR 22952 (doc 2026-08333).', url: 'https://www.federalregister.gov/documents/2026/04/29/2026-08333/uscis-immigration-fees-and-related-procedures-required-by-hr1-reconciliation-bill', label: 'federalregister.gov/.../2026-08333' },
        { name: 'Подписи на формах (с 10 июля 2026)', desc: 'USCIS может отклонить заявление и удержать сбор, если подпись недействительна (копия, текст, программа). Источник: 91 FR 25479 (doc 2026-09289).', url: 'https://www.federalregister.gov/documents/2026/05/11/2026-09289/signatures-on-immigration-benefit-requests', label: 'federalregister.gov/.../2026-09289' },
      ],
    },
    {
      title: '📰 Federal Register и официальные объявления',
      items: [
        { name: 'Federal Register notice 2025-00771', desc: 'Продление TPS Ukraine на 18 месяцев (апрель 2025 — октябрь 2026), 60-дневное окно re-registration, автопродление EAD.', url: 'https://www.federalregister.gov/documents/2025/01/17/2025-00771/extension-of-the-designation-of-ukraine-for-temporary-protected-status', label: 'federalregister.gov/.../2025-00771' },
        { name: 'USCIS news — Extension of TPS for Ukraine', desc: 'Официальное объявление USCIS о продлении TPS Ukraine.', url: 'https://www.uscis.gov/newsroom/stakeholder-messages/extension-of-tps-for-ukraine', label: 'uscis.gov/newsroom/.../tps-ukraine' },
      ],
    },
    {
      title: '🛂 Документы и подача',
      items: [
        { name: 'CBP I-94 — история въездов', desc: 'Проверьте дату вашего въезда в США — она нужна для continuous residence.', url: 'https://i94.cbp.dhs.gov/', label: 'i94.cbp.dhs.gov' },
        { name: 'USCIS — статус дела', desc: 'Проверьте статус дела по номеру квитанции (IOE/WAC/LIN).', url: 'https://egov.uscis.gov/', label: 'egov.uscis.gov' },
        { name: 'USCIS — найти legal services', desc: 'Проверенная USCIS база лицензированных legal services и pro-bono клиник.', url: 'https://www.uscis.gov/avoid-scams/find-legal-services', label: 'uscis.gov/avoid-scams/find-legal-services' },
      ],
    },
  ],
  en: [
    {
      title: '📋 TPS Ukraine — main USCIS pages',
      items: [
        { name: 'TPS Designated Country: Ukraine', desc: 'Official USCIS page on TPS for Ukraine — current dates, extension, EAD auto-extension.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine', label: 'uscis.gov/.../tps-ukraine' },
        { name: 'TPS — general page', desc: 'General USCIS page on the TPS program: eligibility, how to file, continuous residence.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status', label: 'uscis.gov/humanitarian/temporary-protected-status' },
      ],
    },
    {
      title: '📝 Forms',
      items: [
        { name: 'Form I-821', desc: 'Application for Temporary Protected Status — the main TPS form.', url: 'https://www.uscis.gov/i-821', label: 'uscis.gov/i-821' },
        { name: 'Form I-765', desc: 'Application for Employment Authorization (EAD).', url: 'https://www.uscis.gov/i-765', label: 'uscis.gov/i-765' },
        { name: 'Form I-912', desc: 'Request for Fee Waiver — only with paper filing.', url: 'https://www.uscis.gov/i-912', label: 'uscis.gov/i-912' },
        { name: 'Form I-131', desc: 'Advance Parole — only if you need to travel while on TPS.', url: 'https://www.uscis.gov/i-131', label: 'uscis.gov/i-131' },
      ],
    },
    {
      title: '💵 Fees and filing',
      items: [
        { name: 'USCIS fee calculator', desc: 'Calculate the exact USCIS fee for your combination of forms.', url: 'https://www.uscis.gov/feecalculator', label: 'uscis.gov/feecalculator' },
        { name: 'my.uscis.gov — online filing', desc: 'Official USCIS account for online filing and case status.', url: 'https://my.uscis.gov/', label: 'my.uscis.gov' },
      ],
    },
    {
      title: '⚠ New 2026 rules — verify before filing',
      items: [
        { name: 'H.R.1 TPS EAD cap (effective May 29, 2026)', desc: 'H.R.1 rule: new TPS EADs valid for 1 year only. Some H.R.1 fees cannot be waived via I-912. Source: 91 FR 22952 (doc 2026-08333).', url: 'https://www.federalregister.gov/documents/2026/04/29/2026-08333/uscis-immigration-fees-and-related-procedures-required-by-hr1-reconciliation-bill', label: 'federalregister.gov/.../2026-08333' },
        { name: 'Signature rule (effective July 10, 2026)', desc: 'USCIS may deny application and keep filing fee if signature is invalid (copied image, typed name, software). Source: 91 FR 25479 (doc 2026-09289).', url: 'https://www.federalregister.gov/documents/2026/05/11/2026-09289/signatures-on-immigration-benefit-requests', label: 'federalregister.gov/.../2026-09289' },
      ],
    },
    {
      title: '📰 Federal Register and official announcements',
      items: [
        { name: 'Federal Register notice 2025-00771', desc: 'Extension of TPS Ukraine for 18 months (Apr 2025 – Oct 2026), 60-day re-registration window, EAD auto-extension.', url: 'https://www.federalregister.gov/documents/2025/01/17/2025-00771/extension-of-the-designation-of-ukraine-for-temporary-protected-status', label: 'federalregister.gov/.../2025-00771' },
        { name: 'USCIS news — Extension of TPS for Ukraine', desc: 'Official USCIS announcement of the TPS Ukraine extension.', url: 'https://www.uscis.gov/newsroom/stakeholder-messages/extension-of-tps-for-ukraine', label: 'uscis.gov/newsroom/.../tps-ukraine' },
      ],
    },
    {
      title: '🛂 Documents and filing',
      items: [
        { name: 'CBP I-94 — travel history', desc: 'Check your US arrival date — needed for continuous residence.', url: 'https://i94.cbp.dhs.gov/', label: 'i94.cbp.dhs.gov' },
        { name: 'USCIS — case status', desc: 'Check the status of your case using your receipt number (IOE/WAC/LIN).', url: 'https://egov.uscis.gov/', label: 'egov.uscis.gov' },
        { name: 'USCIS — find legal services', desc: 'USCIS-vetted directory of licensed legal services and pro-bono clinics.', url: 'https://www.uscis.gov/avoid-scams/find-legal-services', label: 'uscis.gov/avoid-scams/find-legal-services' },
      ],
    },
  ],
  es: [
    {
      title: '📋 TPS Ucrania — páginas principales de USCIS',
      items: [
        { name: 'TPS Designated Country: Ukraine', desc: 'Página oficial de USCIS sobre TPS para Ucrania — fechas actuales, extensión, auto-extensión EAD.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine', label: 'uscis.gov/.../tps-ukraine' },
        { name: 'TPS — página general', desc: 'Página general de USCIS sobre el programa TPS: elegibilidad, cómo presentar, continuous residence.', url: 'https://www.uscis.gov/humanitarian/temporary-protected-status', label: 'uscis.gov/humanitarian/temporary-protected-status' },
      ],
    },
    {
      title: '📝 Formularios',
      items: [
        { name: 'Form I-821', desc: 'Application for Temporary Protected Status — formulario principal TPS.', url: 'https://www.uscis.gov/i-821', label: 'uscis.gov/i-821' },
        { name: 'Form I-765', desc: 'Application for Employment Authorization (EAD).', url: 'https://www.uscis.gov/i-765', label: 'uscis.gov/i-765' },
        { name: 'Form I-912', desc: 'Request for Fee Waiver — solo con presentación en papel.', url: 'https://www.uscis.gov/i-912', label: 'uscis.gov/i-912' },
        { name: 'Form I-131', desc: 'Advance Parole — solo si necesita viajar mientras tiene TPS.', url: 'https://www.uscis.gov/i-131', label: 'uscis.gov/i-131' },
      ],
    },
    {
      title: '💵 Tarifas y presentación',
      items: [
        { name: 'USCIS fee calculator', desc: 'Calcule la tarifa exacta de USCIS para su combinación de formularios.', url: 'https://www.uscis.gov/feecalculator', label: 'uscis.gov/feecalculator' },
        { name: 'my.uscis.gov — presentación en línea', desc: 'Cuenta oficial de USCIS para presentación en línea y estado del caso.', url: 'https://my.uscis.gov/', label: 'my.uscis.gov' },
      ],
    },
    {
      title: '⚠ Nuevas reglas 2026 — verifique antes de presentar',
      items: [
        { name: 'H.R.1 TPS EAD cap (vigente desde 29 may 2026)', desc: 'Regla H.R.1: los nuevos EAD TPS son válidos solo por 1 año. Algunas tarifas H.R.1 no pueden exonerarse mediante I-912. Fuente: 91 FR 22952 (doc 2026-08333).', url: 'https://www.federalregister.gov/documents/2026/04/29/2026-08333/uscis-immigration-fees-and-related-procedures-required-by-hr1-reconciliation-bill', label: 'federalregister.gov/.../2026-08333' },
        { name: 'Regla de firma (vigente desde 10 jul 2026)', desc: 'USCIS puede denegar la solicitud y retener la tarifa si la firma es inválida (imagen copiada, nombre escrito, software). Fuente: 91 FR 25479 (doc 2026-09289).', url: 'https://www.federalregister.gov/documents/2026/05/11/2026-09289/signatures-on-immigration-benefit-requests', label: 'federalregister.gov/.../2026-09289' },
      ],
    },
    {
      title: '📰 Federal Register y anuncios oficiales',
      items: [
        { name: 'Federal Register notice 2025-00771', desc: 'Extensión de TPS Ucrania por 18 meses (abr 2025 – oct 2026), ventana de re-registración de 60 días, auto-extensión EAD.', url: 'https://www.federalregister.gov/documents/2025/01/17/2025-00771/extension-of-the-designation-of-ukraine-for-temporary-protected-status', label: 'federalregister.gov/.../2025-00771' },
        { name: 'USCIS news — Extension of TPS for Ukraine', desc: 'Anuncio oficial de USCIS sobre la extensión de TPS Ucrania.', url: 'https://www.uscis.gov/newsroom/stakeholder-messages/extension-of-tps-for-ukraine', label: 'uscis.gov/newsroom/.../tps-ukraine' },
      ],
    },
    {
      title: '🛂 Documentos y presentación',
      items: [
        { name: 'CBP I-94 — historial de viajes', desc: 'Verifique su fecha de llegada a EE. UU. — necesaria para continuous residence.', url: 'https://i94.cbp.dhs.gov/', label: 'i94.cbp.dhs.gov' },
        { name: 'USCIS — estado del caso', desc: 'Verifique el estado de su caso con el número de recibo (IOE/WAC/LIN).', url: 'https://egov.uscis.gov/', label: 'egov.uscis.gov' },
        { name: 'USCIS — encontrar legal services', desc: 'Directorio verificado por USCIS de servicios legales con licencia y clínicas pro-bono.', url: 'https://www.uscis.gov/avoid-scams/find-legal-services', label: 'uscis.gov/avoid-scams/find-legal-services' },
      ],
    },
  ],
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en
  return {
    title: t.metaTitle,
    description: t.metaDesc,
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/tps-ukraine/sources`,
      languages: Object.fromEntries(
        (['uk', 'ru', 'en', 'es'] as Locale[]).map((l) => [
          l,
          `https://messenginfo.com/${l}/services/tps-ukraine/sources`,
        ]),
      ),
    },
  }
}

export default async function TpsUkraineSourcesPage({ params }: Props) {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en
  const cats = CATEGORIES[(locale as Locale)] ?? CATEGORIES.en
  const backHref = `/${locale}/services/tps-ukraine`

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--background)', padding: '0 0 48px' }}>
      <ServiceBackBar locale={locale} />
      <section style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '20px 20px 18px' }}>
        <a
          href={backHref}
          style={{ fontSize: '15px', color: 'var(--text-3)', textDecoration: 'none', display: 'inline-block', marginBottom: '12px' }}
        >
          {t.back}
        </a>
        <h1 style={{ fontSize: '28px', fontWeight: 800, lineHeight: 1.2, color: 'var(--text-1)', marginBottom: '8px' }}>
          {t.title}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.5 }}>{t.intro}</p>
        <p style={{ fontSize: '15px', color: 'var(--text-3)', marginTop: '10px' }}>{t.note}</p>
      </section>

      <section style={{ padding: '14px 20px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {cats.map((cat) => (
          <div key={cat.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)' }}>{cat.title}</p>
            </div>
            {cat.items.map((item, idx) => (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: '14px',
                  borderBottom: idx < cat.items.length - 1 ? '1px solid var(--border)' : 'none',
                  textDecoration: 'none',
                  color: 'var(--text-1)',
                }}
              >
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '3px' }}>
                  {item.name}
                </p>
                <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.45, marginBottom: '4px' }}>
                  {item.desc}
                </p>
                <p style={{ fontSize: '15px', color: 'var(--primary)', fontWeight: 600 }}>
                  {item.label} ↗
                </p>
              </a>
            ))}
          </div>
        ))}
      </section>
    </main>
  )
}
