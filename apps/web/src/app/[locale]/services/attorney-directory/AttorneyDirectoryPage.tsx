'use client'
import Link from 'next/link'
import { track } from '@/components/analytics/Analytics'
import { useState } from 'react'

// Verified nonprofit/legal aid organizations — all free or low-cost
const ORGANIZATIONS = [
  {
    name: 'ILRC (Immigrant Legal Resource Center)',
    type: 'nonprofit',
    url: 'https://www.ilrc.org',
    description: 'Free legal guides and referrals. Ukrainian-focused resources available.',
    phone: null,
    languages: ['en', 'uk', 'ru', 'es'],
    icon: '⚖️',
  },
  {
    name: 'USCIS Free Legal Help',
    type: 'official',
    url: 'https://www.uscis.gov/avoid-scams/find-legal-services',
    description: 'Official USCIS directory of recognized organizations and accredited representatives.',
    phone: null,
    languages: ['en', 'es'],
    icon: '🏛️',
  },
  {
    name: 'CLINIC (Catholic Legal Immigration Network)',
    type: 'nonprofit',
    url: 'https://cliniclegal.org/find-help',
    description: 'Nationwide network of nonprofit immigration legal service providers.',
    phone: null,
    languages: ['en', 'uk', 'ru'],
    icon: '🤝',
  },
  {
    name: 'UNHCR USA',
    type: 'international',
    url: 'https://www.unhcr.org/us/get-help',
    description: 'UN refugee agency — legal resources and protection for displaced Ukrainians.',
    phone: null,
    languages: ['en', 'uk', 'ru'],
    icon: '🌐',
  },
  {
    name: 'National Immigration Legal Services Center',
    type: 'nonprofit',
    url: 'https://immigrationadvocates.org/nonprofit/legaldirectory/',
    description: 'Find free and low-cost immigration legal services in your state.',
    phone: null,
    languages: ['en', 'es'],
    icon: '📋',
  },
  {
    name: 'Americans for Immigrant Justice',
    type: 'nonprofit',
    url: 'https://aijustice.org',
    description: 'Free immigration legal services. Strong Ukrainian community support.',
    phone: null,
    languages: ['en', 'uk'],
    icon: '🗽',
  },
  {
    name: 'AILA (American Immigration Lawyers Association)',
    type: 'referral',
    url: 'https://www.ailalawyer.com',
    description: 'Find a licensed immigration attorney. Many offer free consultations.',
    phone: null,
    languages: ['en'],
    icon: '👨‍⚖️',
  },
  {
    name: 'Ukrainian Congress Committee of America',
    type: 'community',
    url: 'https://ucca.org',
    description: 'Community organization with legal referral network for Ukrainian Americans.',
    phone: null,
    languages: ['en', 'uk'],
    icon: '🇺🇦',
  },
]

const RED_FLAGS = [
  'Guarantees green card or visa approval',
  'Charges a "filing fee" before doing any work',
  'Calls themselves "notario" or "immigration consultant" (not an attorney)',
  'Pressures you to sign blank forms',
  'Claims special connections with USCIS',
  'Does not provide a written contract',
]

const T = {
  en: {
    badge: 'Legal Resources',
    title: 'Find Immigration Legal Help',
    subtitle: 'Free and low-cost resources for Ukrainian parolees, TPS holders, and their families.',
    warningTitle: '⚠️ You are NOT talking to an attorney',
    warningDesc: 'Messenginfo provides self-help information only. We are not a law firm and this is not legal advice. For complex cases, RFEs, denials, or court proceedings — consult a licensed attorney.',
    orgTitle: 'Verified Legal Aid Organizations',
    filterAll: 'All',
    filterFree: 'Free / Nonprofit',
    filterOfficial: 'Official',
    filterReferral: 'Referral',
    visitBtn: 'Visit →',
    redFlagTitle: '🚩 Immigration Scam Red Flags',
    redFlagDesc: 'Protect yourself — never pay someone who:',
    selfHelpTitle: 'Self-Help: What you can do without an attorney',
    selfHelp: [
      { icon: '📄', label: 'USCIS Forms', desc: 'Most forms (I-821, I-765, I-131) can be filed yourself. uscis.gov/forms', href: 'https://www.uscis.gov/forms' },
      { icon: '📋', label: 'Form Instructions', desc: 'Every form has detailed instructions. Read them carefully.', href: 'https://www.uscis.gov/forms' },
      { icon: '🔍', label: 'Case Status', desc: 'Check your case at egov.uscis.gov/casestatus', href: 'https://egov.uscis.gov/casestatus/landing.do' },
      { icon: '📞', label: 'USCIS Contact Center', desc: '1-800-375-5283 — customer service for general questions', href: 'tel:18003755283' },
    ],
    typesTitle: 'Who can legally help you',
    types: [
      { title: 'Licensed Attorney (J.D.)', icon: '⚖️', desc: 'Full legal representation. Can appear in immigration court.', color: 'border-green-300 bg-green-50' },
      { title: 'Accredited Representative', icon: '🏛️', desc: 'Authorized by EOIR to represent clients at nonprofits.', color: 'border-blue-300 bg-blue-50' },
      { title: 'Accredited Law Student', icon: '📚', desc: 'Supervised clinical programs at law schools.', color: 'border-purple-300 bg-purple-50' },
      { title: 'Notario / Consultant', icon: '🚫', desc: 'NOT authorized to practice immigration law in the US. Avoid.', color: 'border-red-300 bg-red-50' },
    ],
    relatedTitle: 'Related self-help tools',
    disclaimer: 'Messenginfo is not a law firm. Directory listings are informational only. Always verify attorney credentials at your state bar. Not legal advice.',
  },
  uk: {
    badge: 'Юридичні ресурси',
    title: 'Знайдіть імміграційну юридичну допомогу',
    subtitle: 'Безкоштовні та доступні ресурси для українських паролів, власників TPS та їх сімей.',
    warningTitle: '⚠️ Ви НЕ розмовляєте з адвокатом',
    warningDesc: 'Messenginfo надає лише інформацію для самодопомоги. Ми не є юридичною фірмою, і це не юридична консультація. Для складних справ, RFE, відмов або судових провадженнь — зверніться до ліцензованого адвоката.',
    orgTitle: 'Перевірені організації правової допомоги',
    filterAll: 'Всі',
    filterFree: 'Безкоштовно / НКО',
    filterOfficial: 'Офіційні',
    filterReferral: 'Направлення',
    visitBtn: 'Перейти →',
    redFlagTitle: '🚩 Ознаки імміграційного шахрайства',
    redFlagDesc: 'Захистіть себе — ніколи не платіть тому, хто:',
    selfHelpTitle: 'Самодопомога: що можна зробити без адвоката',
    selfHelp: [
      { icon: '📄', label: 'Форми USCIS', desc: 'Більшість форм (I-821, I-765, I-131) можна подати самостійно. uscis.gov/forms', href: 'https://www.uscis.gov/forms' },
      { icon: '📋', label: 'Інструкції до форм', desc: 'Кожна форма має детальні інструкції. Читайте уважно.', href: 'https://www.uscis.gov/forms' },
      { icon: '🔍', label: 'Статус справи', desc: 'Перевірте вашу справу на egov.uscis.gov/casestatus', href: 'https://egov.uscis.gov/casestatus/landing.do' },
      { icon: '📞', label: 'Контактний центр USCIS', desc: '1-800-375-5283 — обслуговування клієнтів для загальних питань', href: 'tel:18003755283' },
    ],
    typesTitle: 'Хто може законно допомогти вам',
    types: [
      { title: 'Ліцензований адвокат (J.D.)', icon: '⚖️', desc: 'Повне юридичне представництво. Може виступати в імміграційному суді.', color: 'border-green-300 bg-green-50' },
      { title: 'Акредитований представник', icon: '🏛️', desc: 'Уповноважений EOIR для представлення клієнтів у НКО.', color: 'border-blue-300 bg-blue-50' },
      { title: 'Акредитований студент юридичного факультету', icon: '📚', desc: 'Клінічні програми під наглядом юридичних шкіл.', color: 'border-purple-300 bg-purple-50' },
      { title: 'Notario / Консультант', icon: '🚫', desc: 'НЕ уповноважений практикувати імміграційне право в США. Уникайте.', color: 'border-red-300 bg-red-50' },
    ],
    relatedTitle: 'Пов\'язані інструменти самодопомоги',
    disclaimer: 'Messenginfo не є юридичною фірмою. Записи в каталозі мають лише інформаційний характер. Завжди перевіряйте повноваження адвоката в асоціації адвокатів вашого штату. Не юридична консультація.',
  },
  ru: {
    badge: 'Юридические ресурсы',
    title: 'Найдите иммиграционную юридическую помощь',
    subtitle: 'Бесплатные и доступные ресурсы для украинских парольщиков, держателей TPS и их семей.',
    warningTitle: '⚠️ Вы НЕ разговариваете с адвокатом',
    warningDesc: 'Messenginfo предоставляет только информацию для самопомощи. Мы не являемся юридической фирмой, и это не юридическая консультация. Для сложных дел, RFE, отказов или судебных разбирательств — обратитесь к лицензированному адвокату.',
    orgTitle: 'Проверенные организации правовой помощи',
    filterAll: 'Все',
    filterFree: 'Бесплатно / НКО',
    filterOfficial: 'Официальные',
    filterReferral: 'Направление',
    visitBtn: 'Перейти →',
    redFlagTitle: '🚩 Признаки иммиграционного мошенничества',
    redFlagDesc: 'Защитите себя — никогда не платите тому, кто:',
    selfHelpTitle: 'Самопомощь: что можно сделать без адвоката',
    selfHelp: [
      { icon: '📄', label: 'Формы USCIS', desc: 'Большинство форм (I-821, I-765, I-131) можно подать самостоятельно. uscis.gov/forms', href: 'https://www.uscis.gov/forms' },
      { icon: '📋', label: 'Инструкции к формам', desc: 'Каждая форма имеет подробные инструкции. Читайте внимательно.', href: 'https://www.uscis.gov/forms' },
      { icon: '🔍', label: 'Статус дела', desc: 'Проверьте ваше дело на egov.uscis.gov/casestatus', href: 'https://egov.uscis.gov/casestatus/landing.do' },
      { icon: '📞', label: 'Контактный центр USCIS', desc: '1-800-375-5283 — обслуживание клиентов для общих вопросов', href: 'tel:18003755283' },
    ],
    typesTitle: 'Кто может законно вам помочь',
    types: [
      { title: 'Лицензированный адвокат (J.D.)', icon: '⚖️', desc: 'Полное юридическое представительство. Может выступать в иммиграционном суде.', color: 'border-green-300 bg-green-50' },
      { title: 'Аккредитованный представитель', icon: '🏛️', desc: 'Уполномочен EOIR для представления клиентов в НКО.', color: 'border-blue-300 bg-blue-50' },
      { title: 'Аккредитованный студент юридического факультета', icon: '📚', desc: 'Клинические программы под наблюдением юридических школ.', color: 'border-purple-300 bg-purple-50' },
      { title: 'Notario / Консультант', icon: '🚫', desc: 'НЕ уполномочен практиковать иммиграционное право в США. Избегайте.', color: 'border-red-300 bg-red-50' },
    ],
    relatedTitle: 'Связанные инструменты самопомощи',
    disclaimer: 'Messenginfo не является юридической фирмой. Записи в каталоге носят только информационный характер. Всегда проверяйте полномочия адвоката в адвокатской ассоциации вашего штата. Не юридическая консультация.',
  },
  es: {
    badge: 'Recursos Legales',
    title: 'Encuentre Ayuda Legal de Inmigración',
    subtitle: 'Recursos gratuitos y de bajo costo para ucranianos en libertad condicional, titulares de TPS y sus familias.',
    warningTitle: '⚠️ NO está hablando con un abogado',
    warningDesc: 'Messenginfo proporciona únicamente información de autoayuda. No somos un bufete de abogados y esto no es asesoría legal. Para casos complejos, RFE, denegaciones o procedimientos judiciales — consulte a un abogado con licencia.',
    orgTitle: 'Organizaciones de Asistencia Legal Verificadas',
    filterAll: 'Todas',
    filterFree: 'Gratis / Sin fines de lucro',
    filterOfficial: 'Oficiales',
    filterReferral: 'Referidos',
    visitBtn: 'Visitar →',
    redFlagTitle: '🚩 Señales de Estafa de Inmigración',
    redFlagDesc: 'Protéjase — nunca pague a alguien que:',
    selfHelpTitle: 'Autoayuda: lo que puede hacer sin un abogado',
    selfHelp: [
      { icon: '📄', label: 'Formularios USCIS', desc: 'La mayoría de los formularios (I-821, I-765, I-131) se pueden presentar usted mismo. uscis.gov/forms', href: 'https://www.uscis.gov/forms' },
      { icon: '📋', label: 'Instrucciones de formularios', desc: 'Cada formulario tiene instrucciones detalladas. Léalas cuidadosamente.', href: 'https://www.uscis.gov/forms' },
      { icon: '🔍', label: 'Estado del caso', desc: 'Verifique su caso en egov.uscis.gov/casestatus', href: 'https://egov.uscis.gov/casestatus/landing.do' },
      { icon: '📞', label: 'Centro de Contacto USCIS', desc: '1-800-375-5283 — servicio al cliente para preguntas generales', href: 'tel:18003755283' },
    ],
    typesTitle: 'Quién puede ayudarle legalmente',
    types: [
      { title: 'Abogado con Licencia (J.D.)', icon: '⚖️', desc: 'Representación legal completa. Puede comparecer ante el tribunal de inmigración.', color: 'border-green-300 bg-green-50' },
      { title: 'Representante Acreditado', icon: '🏛️', desc: 'Autorizado por EOIR para representar clientes en organizaciones sin fines de lucro.', color: 'border-blue-300 bg-blue-50' },
      { title: 'Estudiante de Derecho Acreditado', icon: '📚', desc: 'Programas clínicos supervisados en escuelas de derecho.', color: 'border-purple-300 bg-purple-50' },
      { title: 'Notario / Consultor', icon: '🚫', desc: 'NO autorizado a ejercer la ley de inmigración en EE.UU. Evite.', color: 'border-red-300 bg-red-50' },
    ],
    relatedTitle: 'Herramientas de autoayuda relacionadas',
    disclaimer: 'Messenginfo no es un bufete de abogados. Las entradas del directorio son solo informativas. Siempre verifique las credenciales del abogado en el colegio de abogados de su estado. No es asesoría legal.',
  },
}

type FilterType = 'all' | 'nonprofit' | 'official' | 'referral' | 'community' | 'international'

export function AttorneyDirectoryPage({ locale }: { locale: string }) {
  const t = (T as Record<string, typeof T.en>)[locale] ?? T.en
  const [filter, setFilter] = useState<FilterType>('all')

  const filtered = filter === 'all' ? ORGANIZATIONS : ORGANIZATIONS.filter((o) => {
    if (filter === 'nonprofit') return o.type === 'nonprofit' || o.type === 'community' || o.type === 'international'
    if (filter === 'official') return o.type === 'official'
    if (filter === 'referral') return o.type === 'referral'
    return true
  })

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-700 to-slate-900 text-white py-14 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-block bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide mb-4">{t.badge}</span>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">{t.title}</h1>
          <p className="text-slate-300 text-[15px] leading-relaxed max-w-lg mx-auto">{t.subtitle}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Not-a-lawyer warning */}
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="text-[14px] font-bold text-amber-900 mb-1">{t.warningTitle}</p>
          <p className="text-sm text-amber-800 leading-relaxed">{t.warningDesc}</p>
        </div>

        {/* Who can help you */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-4">{t.typesTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {t.types.map((type: { title: string; icon: string; desc: string; color: string }) => (
              <div key={type.title} className={`rounded-xl border p-3 ${type.color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{type.icon}</span>
                  <span className="text-sm font-bold">{type.title}</span>
                </div>
                <p className="text-sm opacity-80">{type.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Organizations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-[var(--text-1)]">{t.orgTitle}</h2>
            <div className="flex gap-1.5">
              {(['all', 'nonprofit', 'official', 'referral'] as const).map((f) => {
                const labels: Record<string, string> = { all: t.filterAll, nonprofit: t.filterFree, official: t.filterOfficial, referral: t.filterReferral }
                return (
                  <button key={f} type="button" onClick={() => setFilter(f)}
                    className={`text-sm px-2.5 py-1 rounded-full font-semibold transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:bg-[var(--surface-1)]'}`}>
                    {labels[f]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((org) => (
              <div key={org.name} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{org.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-bold text-[var(--text-1)]">{org.name}</p>
                        <p className="text-sm text-[var(--text-2)] mt-0.5 leading-relaxed">{org.description}</p>
                        <div className="flex gap-1 mt-2">
                          {org.languages.map((lang) => (
                            <span key={lang} className="text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-3)] uppercase">{lang}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <a href={org.url} target="_blank" rel="noopener noreferrer"
                      onClick={() => track('attorney_org_clicked', { org: org.name, locale })}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                      {t.visitBtn}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Red flags */}
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-[15px] font-bold text-red-900 mb-2">{t.redFlagTitle}</h2>
          <p className="text-sm text-red-700 mb-3">{t.redFlagDesc}</p>
          <ul className="space-y-2">
            {RED_FLAGS.map((flag) => (
              <li key={flag} className="flex items-start gap-2 text-sm text-red-800">
                <span className="text-red-500 shrink-0 mt-0.5">🚩</span>{flag}
              </li>
            ))}
          </ul>
        </div>

        {/* Self-help */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.selfHelpTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {t.selfHelp.map((item: { icon: string; label: string; desc: string; href: string }) => (
              <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 hover:border-blue-300 hover:bg-blue-50 transition-all">
                <span className="text-2xl shrink-0">{item.icon}</span>
                <div>
                  <p className="text-sm font-bold text-[var(--text-1)]">{item.label}</p>
                  <p className="text-sm text-[var(--text-2)]">{item.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Related tools */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <h2 className="text-[15px] font-bold text-[var(--text-1)] mb-3">{t.relatedTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { href: `/${locale}/services/translate-document`, icon: '📄', label: locale === 'uk' ? 'Переклад документів для USCIS' : locale === 'ru' ? 'Перевод документов для USCIS' : 'USCIS Document Translation' },
              { href: `/${locale}/services/uscis-case-status`, icon: '🔍', label: locale === 'uk' ? 'Статус справи USCIS' : locale === 'ru' ? 'Статус дела USCIS' : 'USCIS Case Status' },
              { href: `/${locale}/services/re-parole-u4u`, icon: '🛡', label: 'Re-Parole U4U Wizard' },
              { href: `/${locale}/services/ead-work-permit`, icon: '💼', label: locale === 'uk' ? 'EAD Дозвіл на роботу' : locale === 'ru' ? 'EAD Разрешение на работу' : 'EAD Work Permit' },
            ].map((link) => (
              <Link key={link.href} href={link.href}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[14px] font-semibold text-[var(--text-1)] hover:border-blue-400 hover:bg-blue-50 transition-all">
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
