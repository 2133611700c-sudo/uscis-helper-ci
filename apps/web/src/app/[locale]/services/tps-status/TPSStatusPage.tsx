'use client'
import Link from 'next/link'
import { track } from '@/components/analytics/Analytics'
import { useState } from 'react'

/**
 * TPS Ukraine — current status as of 2026-05-06
 * Source: uscis.gov/tps/ukraine (verified)
 * TPS Ukraine was last extended through Oct 19, 2026
 * Re-registration period: Apr 19 – Jun 18, 2026
 */
const TPS_DATA = {
  currentDesignation: 'Active',
  designatedThrough: 'October 19, 2026',
  reregistrationOpen: 'April 19, 2026',
  reregistrationClose: 'June 18, 2026',
  eligibleForms: ['I-821 (TPS Application)', 'I-765 (EAD)', 'I-131 (Travel Document)'],
  officialUrl: 'https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine',
  federalRegisterUrl: 'https://www.federalregister.gov/documents/current',
}

const T = {
  en: {
    badge: 'Live Status',
    title: 'TPS Ukraine Status',
    subtitle: 'Temporary Protected Status for Ukrainian nationals in the United States.',
    statusLabel: 'Current TPS Designation',
    activeLabel: 'ACTIVE',
    throughLabel: 'Protected Through',
    reregTitle: 'Re-registration Window',
    reregOpen: 'Opens',
    reregClose: 'Closes',
    reregWarning: 'Miss this window and you may lose TPS status. File early.',
    eligibleTitle: 'Forms to File',
    timelineTitle: 'TPS Ukraine Timeline',
    timeline: [
      { date: 'Apr 2022', event: 'Ukraine first designated for TPS', type: 'start' },
      { date: 'Oct 2023', event: 'TPS extended through Oct 19, 2025', type: 'ext' },
      { date: 'Apr 2025', event: 'TPS extended through Oct 19, 2026', type: 'ext' },
      { date: 'Apr–Jun 2026', event: 'Re-registration window open', type: 'action' },
      { date: 'Oct 2026', event: 'Current designation expires — watch for extension', type: 'warn' },
    ],
    requirementsTitle: 'Who qualifies for TPS Ukraine',
    requirements: [
      'Ukrainian national (or no nationality, last habitual residence in Ukraine)',
      'Continuously residing in the US since March 1, 2022',
      'Continuously physically present in the US since April 11, 2022',
      'No disqualifying criminal record',
      'Not firmly resettled in another country',
    ],
    officialBtn: 'Official USCIS TPS Ukraine page ↗',
    faqTitle: 'Common TPS Questions',
    faqs: [
      { q: 'Does TPS give me a green card?', a: 'No. TPS is temporary protection from deportation and allows you to work. It does not lead directly to permanent residence.' },
      { q: 'Can I travel outside the US with TPS?', a: 'Only with advance parole (Form I-131). Travel without it may result in loss of TPS and inability to return.' },
      { q: 'What if I miss the re-registration window?', a: 'You may be subject to deportation and lose your work authorization. File as early as possible within the window.' },
      { q: 'Do I need an attorney to apply for TPS?', a: 'Not required. You can file I-821 yourself. Our translation tool can help prepare your Ukrainian documents.' },
      { q: 'Will TPS be extended again after October 2026?', a: 'Unknown. Watch the USCIS TPS page and Federal Register. Extensions are typically announced 60–90 days before expiry.' },
    ],
    alertTitle: 'Get TPS deadline alerts',
    alertDesc: 'Set a calendar reminder for the re-registration window and expiration date.',
    calBtn: 'Add to calendar',
    relatedTitle: 'Related tools',
    disclaimer: 'TPS status data sourced from uscis.gov. Dates may change. Always verify at uscis.gov/tps. Not legal advice.',
  },
  uk: {
    badge: 'Актуальний статус',
    title: 'Статус TPS Україна',
    subtitle: 'Тимчасовий захисний статус для громадян України у США.',
    statusLabel: 'Поточне призначення TPS',
    activeLabel: 'АКТИВНИЙ',
    throughLabel: 'Захист до',
    reregTitle: 'Вікно повторної реєстрації',
    reregOpen: 'Відкривається',
    reregClose: 'Закривається',
    reregWarning: 'Пропустіть це вікно — і ви можете втратити статус TPS. Подавайте заздалегідь.',
    eligibleTitle: 'Форми для подачі',
    timelineTitle: 'Хронологія TPS Україна',
    timeline: [
      { date: 'Квіт 2022', event: 'Україна вперше отримала статус TPS', type: 'start' },
      { date: 'Жовт 2023', event: 'TPS продовжено до 19 жовтня 2025', type: 'ext' },
      { date: 'Квіт 2025', event: 'TPS продовжено до 19 жовтня 2026', type: 'ext' },
      { date: 'Квіт–Черв 2026', event: 'Вікно повторної реєстрації відкрите', type: 'action' },
      { date: 'Жовт 2026', event: 'Поточне призначення закінчується — стежте за продовженням', type: 'warn' },
    ],
    requirementsTitle: 'Хто має право на TPS Україна',
    requirements: [
      'Громадянин України (або особа без громадянства, яка постійно проживала в Україні)',
      'Безперервне проживання у США з 1 березня 2022 р.',
      'Безперервна фізична присутність у США з 11 квітня 2022 р.',
      'Відсутність дискваліфікуючих кримінальних записів',
      'Не влаштовані на постійне проживання в іншій країні',
    ],
    officialBtn: 'Офіційна сторінка USCIS TPS Україна ↗',
    faqTitle: 'Поширені запитання про TPS',
    faqs: [
      { q: 'TPS дає мені грін-карту?', a: 'Ні. TPS — це тимчасовий захист від депортації та право на роботу. Він не веде безпосередньо до постійного проживання.' },
      { q: 'Чи можу я подорожувати за межі США з TPS?', a: 'Тільки з advance parole (Form I-131). Подорож без нього може призвести до втрати TPS і неможливості повернення.' },
      { q: 'Що буде, якщо я пропущу вікно повторної реєстрації?', a: 'Ви можете бути депортовані та втратити дозвіл на роботу. Подавайте якомога раніше у вікні.' },
      { q: 'Чи потрібен мені адвокат для подачі на TPS?', a: 'Не обов\'язково. Ви можете самостійно подати I-821. Наш інструмент перекладу допоможе підготувати українські документи.' },
      { q: 'Чи буде TPS продовжено після жовтня 2026?', a: 'Невідомо. Стежте за сторінкою USCIS TPS та Federal Register. Продовження зазвичай оголошуються за 60–90 днів до закінчення.' },
    ],
    alertTitle: 'Отримати нагадування про терміни TPS',
    alertDesc: 'Встановіть нагадування в календарі для вікна повторної реєстрації та дати закінчення.',
    calBtn: 'Додати до календаря',
    relatedTitle: 'Пов\'язані інструменти',
    disclaimer: 'Дані про статус TPS отримані з uscis.gov. Дати можуть змінитися. Завжди перевіряйте на uscis.gov/tps. Не юридична консультація.',
  },
  ru: {
    badge: 'Актуальный статус',
    title: 'Статус TPS Украина',
    subtitle: 'Временный защитный статус для граждан Украины в США.',
    statusLabel: 'Текущее назначение TPS',
    activeLabel: 'АКТИВНЫЙ',
    throughLabel: 'Защита до',
    reregTitle: 'Окно повторной регистрации',
    reregOpen: 'Открывается',
    reregClose: 'Закрывается',
    reregWarning: 'Пропустите это окно — и вы можете потерять статус TPS. Подавайте заранее.',
    eligibleTitle: 'Формы для подачи',
    timelineTitle: 'Хронология TPS Украина',
    timeline: [
      { date: 'Апр 2022', event: 'Украина впервые получила статус TPS', type: 'start' },
      { date: 'Окт 2023', event: 'TPS продлён до 19 октября 2025', type: 'ext' },
      { date: 'Апр 2025', event: 'TPS продлён до 19 октября 2026', type: 'ext' },
      { date: 'Апр–Июн 2026', event: 'Окно повторной регистрации открыто', type: 'action' },
      { date: 'Окт 2026', event: 'Текущее назначение истекает — следите за продлением', type: 'warn' },
    ],
    requirementsTitle: 'Кто имеет право на TPS Украина',
    requirements: [
      'Гражданин Украины (или лицо без гражданства, постоянно проживавшее в Украине)',
      'Непрерывное проживание в США с 1 марта 2022 г.',
      'Непрерывное физическое присутствие в США с 11 апреля 2022 г.',
      'Отсутствие дисквалифицирующих уголовных записей',
      'Не устроены на постоянное проживание в другой стране',
    ],
    officialBtn: 'Официальная страница USCIS TPS Украина ↗',
    faqTitle: 'Частые вопросы о TPS',
    faqs: [
      { q: 'TPS даёт мне грин-карту?', a: 'Нет. TPS — это временная защита от депортации и право на работу. Он не ведёт напрямую к постоянному проживанию.' },
      { q: 'Могу ли я путешествовать за пределы США с TPS?', a: 'Только с advance parole (Form I-131). Путешествие без него может привести к потере TPS и невозможности вернуться.' },
      { q: 'Что будет, если я пропущу окно повторной регистрации?', a: 'Вы можете быть депортированы и потерять разрешение на работу. Подавайте как можно раньше в окне.' },
      { q: 'Нужен ли мне адвокат для подачи на TPS?', a: 'Не обязательно. Вы можете самостоятельно подать I-821. Наш инструмент перевода поможет подготовить украинские документы.' },
      { q: 'Будет ли TPS продлён после октября 2026?', a: 'Неизвестно. Следите за страницей USCIS TPS и Federal Register. Продления обычно объявляются за 60–90 дней до истечения.' },
    ],
    alertTitle: 'Получить напоминания о сроках TPS',
    alertDesc: 'Установите напоминание в календаре для окна повторной регистрации и даты истечения.',
    calBtn: 'Добавить в календарь',
    relatedTitle: 'Связанные инструменты',
    disclaimer: 'Данные о статусе TPS получены с uscis.gov. Даты могут измениться. Всегда проверяйте на uscis.gov/tps. Не юридическая консультация.',
  },
  es: {
    badge: 'Estado Actual',
    title: 'Estado TPS Ucrania',
    subtitle: 'Estatus de Protección Temporal para ciudadanos ucranianos en los Estados Unidos.',
    statusLabel: 'Designación TPS Actual',
    activeLabel: 'ACTIVO',
    throughLabel: 'Protección Hasta',
    reregTitle: 'Ventana de Re-registro',
    reregOpen: 'Se Abre',
    reregClose: 'Se Cierra',
    reregWarning: 'Pierda esta ventana y podría perder el estado TPS. Presente temprano.',
    eligibleTitle: 'Formularios a Presentar',
    timelineTitle: 'Cronología TPS Ucrania',
    timeline: [
      { date: 'Abr 2022', event: 'Ucrania designada por primera vez para TPS', type: 'start' },
      { date: 'Oct 2023', event: 'TPS extendido hasta el 19 de octubre de 2025', type: 'ext' },
      { date: 'Abr 2025', event: 'TPS extendido hasta el 19 de octubre de 2026', type: 'ext' },
      { date: 'Abr–Jun 2026', event: 'Ventana de re-registro abierta', type: 'action' },
      { date: 'Oct 2026', event: 'Designación actual expira — esté atento a la extensión', type: 'warn' },
    ],
    requirementsTitle: '¿Quién califica para TPS Ucrania?',
    requirements: [
      'Nacional ucraniano (o apátrida con última residencia habitual en Ucrania)',
      'Residencia continua en EE.UU. desde el 1 de marzo de 2022',
      'Presencia física continua en EE.UU. desde el 11 de abril de 2022',
      'Sin antecedentes penales descalificadores',
      'No asentado firmemente en otro país',
    ],
    officialBtn: 'Página oficial de USCIS TPS Ucrania ↗',
    faqTitle: 'Preguntas Frecuentes sobre TPS',
    faqs: [
      { q: '¿El TPS me da una tarjeta verde?', a: 'No. El TPS es protección temporal contra la deportación y permite trabajar. No conduce directamente a la residencia permanente.' },
      { q: '¿Puedo viajar fuera de EE.UU. con TPS?', a: 'Solo con permiso de viaje adelantado (Formulario I-131). Viajar sin él puede resultar en la pérdida del TPS e imposibilidad de regresar.' },
      { q: '¿Qué pasa si pierdo la ventana de re-registro?', a: 'Puede estar sujeto a deportación y perder su autorización de trabajo. Presente lo antes posible dentro de la ventana.' },
      { q: '¿Necesito un abogado para solicitar TPS?', a: 'No es obligatorio. Puede presentar el I-821 usted mismo. Nuestra herramienta de traducción puede ayudar a preparar sus documentos ucranianos.' },
      { q: '¿Se extenderá el TPS después de octubre de 2026?', a: 'Desconocido. Siga la página de TPS de USCIS y el Federal Register. Las extensiones generalmente se anuncian 60–90 días antes del vencimiento.' },
    ],
    alertTitle: 'Obtener alertas de plazos de TPS',
    alertDesc: 'Configure un recordatorio en su calendario para la ventana de re-registro y la fecha de vencimiento.',
    calBtn: 'Agregar al calendario',
    relatedTitle: 'Herramientas relacionadas',
    disclaimer: 'Datos de estado TPS obtenidos de uscis.gov. Las fechas pueden cambiar. Siempre verifique en uscis.gov/tps. No es asesoría legal.',
  },
}

const typeColors: Record<string, string> = {
  start: 'bg-green-100 border-green-300 text-green-800',
  ext: 'bg-blue-100 border-blue-300 text-blue-800',
  action: 'bg-amber-100 border-amber-300 text-amber-800',
  warn: 'bg-red-100 border-red-300 text-red-800',
}

export function TPSStatusPage({ locale }: { locale: string }) {
  const t = (T as Record<string, typeof T.en>)[locale] ?? T.en
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Messenginfo//TPS Alert//EN',
    'BEGIN:VEVENT',
    `DTSTART:20260619`,
    `DTEND:20260619`,
    'SUMMARY:TPS Ukraine Re-registration CLOSES TODAY',
    'DESCRIPTION:Last day to re-register for TPS Ukraine. File I-821 immediately. uscis.gov/tps',
    'URL:https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261019',
    'DTEND:20261019',
    'SUMMARY:TPS Ukraine EXPIRES — Check for Extension',
    'DESCRIPTION:TPS Ukraine designation expires today. Check uscis.gov/tps for extension announcement.',
    'URL:https://www.uscis.gov/humanitarian/temporary-protected-status',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  function downloadCal() {
    track('tps_calendar_downloaded', { locale })
    const blob = new Blob([icsContent], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tps-ukraine-alerts.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
      {/* Hero */}
      <div className="bg-gradient-to-br from-yellow-600 to-blue-700 text-white py-14 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="text-3xl">🇺🇦</span>
            <span className="inline-block bg-white/20 border border-white/30 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide">{t.badge}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{t.title}</h1>
          <p className="text-yellow-100 text-[15px] leading-relaxed max-w-lg mx-auto">{t.subtitle}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Status card */}
        <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-green-600 uppercase tracking-wide mb-1">{t.statusLabel}</p>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse inline-block" />
                <span className="text-[20px] font-black text-green-800">{t.activeLabel}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-green-600 mb-1">{t.throughLabel}</p>
              <p className="text-[18px] font-bold text-green-900">{TPS_DATA.designatedThrough}</p>
            </div>
          </div>

          {/* Re-registration window */}
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-800 mb-2">⚠ {t.reregTitle}</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <p className="text-sm text-amber-600">{t.reregOpen}</p>
                <p className="text-[15px] font-bold text-amber-900">{TPS_DATA.reregistrationOpen}</p>
              </div>
              <div>
                <p className="text-sm text-amber-600">{t.reregClose}</p>
                <p className="text-[15px] font-bold text-amber-900">{TPS_DATA.reregistrationClose}</p>
              </div>
            </div>
            <p className="text-sm text-amber-700">{t.reregWarning}</p>
          </div>
        </div>

        {/* Forms to file */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.eligibleTitle}</h2>
          <div className="flex flex-wrap gap-2">
            {TPS_DATA.eligibleForms.map((form) => (
              <span key={form} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800">{form}</span>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-4">{t.timelineTitle}</h2>
          <div className="space-y-3">
            {t.timeline.map((item: { date: string; event: string; type: string }) => (
              <div key={item.date} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${typeColors[item.type] ?? 'bg-gray-50 border-gray-200 text-gray-800'}`}>
                <span className="text-sm font-bold whitespace-nowrap shrink-0 mt-0.5">{item.date}</span>
                <span className="text-sm">{item.event}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.requirementsTitle}</h2>
          <ul className="space-y-2">
            {t.requirements.map((req: string) => (
              <li key={req} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16" className="text-green-500 shrink-0 mt-0.5"><polyline points="20 6 9 17 4 12" /></svg>
                {req}
              </li>
            ))}
          </ul>
        </div>

        {/* Calendar download */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-[15px] font-bold text-blue-900 mb-1">{t.alertTitle}</h2>
          <p className="text-sm text-blue-700 mb-4">{t.alertDesc}</p>
          <button type="button" onClick={downloadCal}
            className="inline-flex items-center gap-2 bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-[14px] hover:bg-blue-800 transition-colors">
            📅 {t.calBtn}
          </button>
        </div>

        {/* Official USCIS link */}
        <a href={TPS_DATA.officialUrl} target="_blank" rel="noopener noreferrer"
          onClick={() => track('tps_official_clicked', { locale })}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-blue-600 text-blue-700 px-5 py-4 font-bold text-[14px] hover:bg-blue-50 transition-colors">
          {t.officialBtn}
        </a>

        {/* FAQ */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-4">{t.faqTitle}</h2>
          <div className="space-y-2">
            {t.faqs.map((faq: { q: string; a: string }, i: number) => (
              <div key={i} className="border border-[var(--border)] rounded-xl overflow-hidden">
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-[14px] font-semibold text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-colors">
                  {faq.q}
                  <span className="ml-2 shrink-0 text-[var(--text-3)]">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-sm text-[var(--text-2)] leading-relaxed border-t border-[var(--border)]">
                    <p className="pt-3">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Related */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.relatedTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { href: `/${locale}/services/re-parole-u4u`, icon: '🛡', label: 'Re-Parole U4U' },
              { href: `/${locale}/services/translate-document`, icon: '📄', label: locale === 'uk' ? 'Переклад документів' : locale === 'ru' ? 'Перевод документов' : 'Document Translation' },
              { href: `/${locale}/services/uscis-case-status`, icon: '🔍', label: locale === 'uk' ? 'Статус справи USCIS' : locale === 'ru' ? 'Статус дела USCIS' : 'USCIS Case Status' },
              { href: `/${locale}/services/ead-work-permit`, icon: '💼', label: locale === 'uk' ? 'EAD Дозвіл на роботу' : locale === 'ru' ? 'EAD Разрешение на работу' : 'EAD Work Permit' },
            ].map((link) => (
              <Link key={link.href} href={link.href}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-[14px] font-semibold text-[var(--text-1)] hover:border-blue-400 hover:bg-blue-50 transition-all">
                <span className="text-xl">{link.icon}</span>{link.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="text-sm text-[var(--text-3)] text-center leading-relaxed pb-4">{t.disclaimer}</p>
      </div>
    </div>
  )
}
