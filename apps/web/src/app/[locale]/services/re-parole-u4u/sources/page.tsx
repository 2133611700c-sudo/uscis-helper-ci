/**
 * /[locale]/services/re-parole-u4u/sources
 *
 * Stage 8G — Official USCIS resources for Re-Parole U4U.
 * Purpose: single page with all verified official links.
 * Primary user: 60yo Ukrainian, phone, first time — does not know where to find official sources.
 */

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ locale: string }>
}

const T = {
  uk: {
    metaTitle: 'Офіційні джерела USCIS — Re-Parole U4U — Messenginfo',
    metaDesc: 'Всі офіційні посилання USCIS для підготовки та подачі заявки Re-Parole: Form I-131, I-94, калькулятор внесків, адреси для пошти.',
    backLink: '← До Re-Parole',
    badge: 'Офіційні джерела USCIS',
    title: 'Офіційні ресурси',
    subtitle: 'Всі посилання на офіційні сайти, які знадобляться для Re-Parole U4U.',
    categories: [
      {
        title: '📋 Форми',
        items: [
          {
            name: 'Form I-131 — Application for Travel Document',
            desc: 'Завантажте офіційну форму і прочитайте інструкції USCIS.',
            url: 'https://www.uscis.gov/i-131',
            label: 'uscis.gov/i-131',
          },
          {
            name: 'Form I-912 — Request for Fee Waiver',
            desc: 'Якщо немає доходу або низький дохід — запросіть звільнення від сплати внеску.',
            url: 'https://www.uscis.gov/i-912',
            label: 'uscis.gov/i-912',
          },
        ],
      },
      {
        title: '📑 Документи заявника',
        items: [
          {
            name: 'Запис I-94 — Arrival/Departure Record',
            desc: 'Завантажте або роздрукуйте ваш поточний запис I-94. Потрібен для форми.',
            url: 'https://i94.cbp.dhs.gov',
            label: 'i94.cbp.dhs.gov',
          },
        ],
      },
      {
        title: '💰 Внески',
        items: [
          {
            name: 'USCIS Fee Calculator',
            desc: 'Перевірте поточний розмір внеску для I-131. Розмір може змінюватись — завжди перевіряйте перед подачею.',
            url: 'https://www.uscis.gov/feecalculator',
            label: 'uscis.gov/feecalculator',
          },
        ],
      },
      {
        title: '📬 Подача поштою',
        items: [
          {
            name: 'Адреси для поштової відправки I-131',
            desc: 'Адреси можуть змінюватись. Перевіряйте безпосередньо перед відправкою.',
            url: 'https://www.uscis.gov/i-131-addresses',
            label: 'uscis.gov/i-131-addresses',
          },
        ],
      },
      {
        title: '🌐 Онлайн подача',
        items: [
          {
            name: 'myUSCIS — Портал онлайн подачі',
            desc: 'Подайте I-131 онлайн. Потрібен акаунт myUSCIS.',
            url: 'https://my.uscis.gov',
            label: 'my.uscis.gov',
          },
          {
            name: 'Перевірка статусу справи',
            desc: 'Введіть номер квитанції (IOE/WAC/LIN) для перевірки статусу.',
            url: 'https://egov.uscis.gov/casestatus/landing.do',
            label: 'egov.uscis.gov',
          },
        ],
      },
      {
        title: '📖 Офіційна інформація',
        items: [
          {
            name: 'USCIS: Humanitarian Parole — Uniting for Ukraine (U4U)',
            desc: 'Офіційна сторінка USCIS про програму U4U та умови повторного паролю.',
            url: 'https://www.uscis.gov/ukraine',
            label: 'uscis.gov/ukraine',
          },
          {
            name: 'USCIS Policy Manual — Parole',
            desc: 'Детальний правовий документ про parole. Для розуміння правил та умов.',
            url: 'https://www.uscis.gov/policy-manual/volume-3-part-b',
            label: 'uscis.gov/policy-manual',
          },
          {
            name: 'USCIS: зв\'язатись з нами',
            desc: 'Телефон USCIS: 1-800-375-5283 (понеділок–п\'ятниця, 8am–8pm ET).',
            url: 'https://www.uscis.gov/contactcenter',
            label: 'uscis.gov/contactcenter',
          },
        ],
      },
    ],
    sourceNote: 'Всі посилання ведуть на офіційні державні сайти США (.gov). Messenginfo не несе відповідальності за зміни в офіційних документах.',
  },
  ru: {
    metaTitle: 'Официальные источники USCIS — Re-Parole U4U — Messenginfo',
    metaDesc: 'Все официальные ссылки USCIS для подготовки и подачи заявления Re-Parole: Form I-131, I-94, калькулятор взносов, адреса для почты.',
    backLink: '← К Re-Parole',
    badge: 'Официальные источники USCIS',
    title: 'Официальные ресурсы',
    subtitle: 'Все ссылки на официальные сайты, которые понадобятся для Re-Parole U4U.',
    categories: [
      {
        title: '📋 Формы',
        items: [
          {
            name: 'Form I-131 — Application for Travel Document',
            desc: 'Скачайте официальную форму и прочитайте инструкции USCIS.',
            url: 'https://www.uscis.gov/i-131',
            label: 'uscis.gov/i-131',
          },
          {
            name: 'Form I-912 — Request for Fee Waiver',
            desc: 'Если нет дохода или низкий доход — запросите освобождение от уплаты взноса.',
            url: 'https://www.uscis.gov/i-912',
            label: 'uscis.gov/i-912',
          },
        ],
      },
      {
        title: '📑 Документы заявителя',
        items: [
          {
            name: 'Запись I-94 — Arrival/Departure Record',
            desc: 'Скачайте или распечатайте вашу текущую запись I-94. Нужна для формы.',
            url: 'https://i94.cbp.dhs.gov',
            label: 'i94.cbp.dhs.gov',
          },
        ],
      },
      {
        title: '💰 Взносы',
        items: [
          {
            name: 'USCIS Fee Calculator',
            desc: 'Проверьте текущий размер взноса для I-131. Размер может меняться — всегда проверяйте перед подачей.',
            url: 'https://www.uscis.gov/feecalculator',
            label: 'uscis.gov/feecalculator',
          },
        ],
      },
      {
        title: '📬 Подача почтой',
        items: [
          {
            name: 'Адреса для почтовой отправки I-131',
            desc: 'Адреса могут меняться. Проверяйте непосредственно перед отправкой.',
            url: 'https://www.uscis.gov/i-131-addresses',
            label: 'uscis.gov/i-131-addresses',
          },
        ],
      },
      {
        title: '🌐 Онлайн подача',
        items: [
          {
            name: 'myUSCIS — Портал онлайн подачи',
            desc: 'Подайте I-131 онлайн. Нужен аккаунт myUSCIS.',
            url: 'https://my.uscis.gov',
            label: 'my.uscis.gov',
          },
          {
            name: 'Проверка статуса дела',
            desc: 'Введите номер квитанции (IOE/WAC/LIN) для проверки статуса.',
            url: 'https://egov.uscis.gov/casestatus/landing.do',
            label: 'egov.uscis.gov',
          },
        ],
      },
      {
        title: '📖 Официальная информация',
        items: [
          {
            name: 'USCIS: Humanitarian Parole — Uniting for Ukraine (U4U)',
            desc: 'Официальная страница USCIS о программе U4U и условиях повторного пароля.',
            url: 'https://www.uscis.gov/ukraine',
            label: 'uscis.gov/ukraine',
          },
          {
            name: 'USCIS Policy Manual — Parole',
            desc: 'Детальный правовой документ о parole. Для понимания правил и условий.',
            url: 'https://www.uscis.gov/policy-manual/volume-3-part-b',
            label: 'uscis.gov/policy-manual',
          },
          {
            name: 'USCIS: связаться с нами',
            desc: 'Телефон USCIS: 1-800-375-5283 (понедельник–пятница, 8am–8pm ET).',
            url: 'https://www.uscis.gov/contactcenter',
            label: 'uscis.gov/contactcenter',
          },
        ],
      },
    ],
    sourceNote: 'Все ссылки ведут на официальные государственные сайты США (.gov). Messenginfo не несёт ответственности за изменения в официальных документах.',
  },
  en: {
    metaTitle: 'Official USCIS Sources — Re-Parole U4U — Messenginfo',
    metaDesc: 'All official USCIS links for preparing and filing a Re-Parole application: Form I-131, I-94, fee calculator, mailing addresses.',
    backLink: '← Back to Re-Parole',
    badge: 'Official USCIS sources',
    title: 'Official resources',
    subtitle: 'All official government links you need for Re-Parole U4U.',
    categories: [
      {
        title: '📋 Forms',
        items: [
          {
            name: 'Form I-131 — Application for Travel Document',
            desc: 'Download the official form and read USCIS instructions.',
            url: 'https://www.uscis.gov/i-131',
            label: 'uscis.gov/i-131',
          },
          {
            name: 'Form I-912 — Request for Fee Waiver',
            desc: 'Low or no income? Apply for a fee waiver.',
            url: 'https://www.uscis.gov/i-912',
            label: 'uscis.gov/i-912',
          },
        ],
      },
      {
        title: '📑 Applicant documents',
        items: [
          {
            name: 'I-94 Arrival/Departure Record',
            desc: 'Download or print your current I-94 record. Required for the form.',
            url: 'https://i94.cbp.dhs.gov',
            label: 'i94.cbp.dhs.gov',
          },
        ],
      },
      {
        title: '💰 Filing fees',
        items: [
          {
            name: 'USCIS Fee Calculator',
            desc: 'Verify current I-131 filing fee. Fees can change — always check before filing.',
            url: 'https://www.uscis.gov/feecalculator',
            label: 'uscis.gov/feecalculator',
          },
        ],
      },
      {
        title: '📬 Filing by mail',
        items: [
          {
            name: 'I-131 Mailing Addresses',
            desc: 'Addresses can change. Always verify right before mailing.',
            url: 'https://www.uscis.gov/i-131-addresses',
            label: 'uscis.gov/i-131-addresses',
          },
        ],
      },
      {
        title: '🌐 Online filing',
        items: [
          {
            name: 'myUSCIS — Online Filing Portal',
            desc: 'File I-131 online. Requires a myUSCIS account.',
            url: 'https://my.uscis.gov',
            label: 'my.uscis.gov',
          },
          {
            name: 'Case Status Check',
            desc: 'Enter your receipt number (IOE/WAC/LIN) to check your case status.',
            url: 'https://egov.uscis.gov/casestatus/landing.do',
            label: 'egov.uscis.gov',
          },
        ],
      },
      {
        title: '📖 Official information',
        items: [
          {
            name: 'USCIS: Humanitarian Parole — Uniting for Ukraine (U4U)',
            desc: 'Official USCIS page about the U4U program and re-parole eligibility.',
            url: 'https://www.uscis.gov/ukraine',
            label: 'uscis.gov/ukraine',
          },
          {
            name: 'USCIS Policy Manual — Parole',
            desc: 'Detailed legal document about parole. For understanding the rules and conditions.',
            url: 'https://www.uscis.gov/policy-manual/volume-3-part-b',
            label: 'uscis.gov/policy-manual',
          },
          {
            name: 'USCIS Contact Center',
            desc: 'USCIS phone: 1-800-375-5283 (Monday–Friday, 8am–8pm ET).',
            url: 'https://www.uscis.gov/contactcenter',
            label: 'uscis.gov/contactcenter',
          },
        ],
      },
    ],
    sourceNote: 'All links lead to official US government (.gov) websites. Messenginfo is not responsible for changes in official documents.',
  },
  es: {
    metaTitle: 'Fuentes oficiales de USCIS — Re-Parole U4U — Messenginfo',
    metaDesc: 'Todos los enlaces oficiales de USCIS para preparar y presentar una solicitud Re-Parole: Formulario I-131, I-94, calculadora de tarifas, direcciones postales.',
    backLink: '← Volver a Re-Parole',
    badge: 'Fuentes oficiales de USCIS',
    title: 'Recursos oficiales',
    subtitle: 'Todos los enlaces oficiales del gobierno que necesita para Re-Parole U4U.',
    categories: [
      {
        title: '📋 Formularios',
        items: [
          {
            name: 'Formulario I-131 — Application for Travel Document',
            desc: 'Descargue el formulario oficial y lea las instrucciones de USCIS.',
            url: 'https://www.uscis.gov/i-131',
            label: 'uscis.gov/i-131',
          },
          {
            name: 'Formulario I-912 — Request for Fee Waiver',
            desc: '¿Ingresos bajos o nulos? Solicite una exención de tarifa.',
            url: 'https://www.uscis.gov/i-912',
            label: 'uscis.gov/i-912',
          },
        ],
      },
      {
        title: '📑 Documentos del solicitante',
        items: [
          {
            name: 'Registro I-94 de Llegada/Salida',
            desc: 'Descargue o imprima su registro I-94 actual. Requerido para el formulario.',
            url: 'https://i94.cbp.dhs.gov',
            label: 'i94.cbp.dhs.gov',
          },
        ],
      },
      {
        title: '💰 Tarifas',
        items: [
          {
            name: 'Calculadora de Tarifas de USCIS',
            desc: 'Verifique la tarifa actual del I-131. Las tarifas pueden cambiar — siempre verifique antes de presentar.',
            url: 'https://www.uscis.gov/feecalculator',
            label: 'uscis.gov/feecalculator',
          },
        ],
      },
      {
        title: '📬 Presentación por correo',
        items: [
          {
            name: 'Direcciones postales para I-131',
            desc: 'Las direcciones pueden cambiar. Siempre verifique justo antes de enviar.',
            url: 'https://www.uscis.gov/i-131-addresses',
            label: 'uscis.gov/i-131-addresses',
          },
        ],
      },
      {
        title: '🌐 Presentación en línea',
        items: [
          {
            name: 'myUSCIS — Portal de presentación en línea',
            desc: 'Presente el I-131 en línea. Requiere cuenta myUSCIS.',
            url: 'https://my.uscis.gov',
            label: 'my.uscis.gov',
          },
          {
            name: 'Verificación de estado del caso',
            desc: 'Ingrese su número de recibo (IOE/WAC/LIN) para verificar el estado.',
            url: 'https://egov.uscis.gov/casestatus/landing.do',
            label: 'egov.uscis.gov',
          },
        ],
      },
      {
        title: '📖 Información oficial',
        items: [
          {
            name: 'USCIS: Parole Humanitario — Uniting for Ukraine (U4U)',
            desc: 'Página oficial de USCIS sobre el programa U4U y la elegibilidad para re-parole.',
            url: 'https://www.uscis.gov/ukraine',
            label: 'uscis.gov/ukraine',
          },
          {
            name: 'Manual de Políticas de USCIS — Parole',
            desc: 'Documento legal detallado sobre parole. Para entender las reglas y condiciones.',
            url: 'https://www.uscis.gov/policy-manual/volume-3-part-b',
            label: 'uscis.gov/policy-manual',
          },
          {
            name: 'Centro de Contacto de USCIS',
            desc: 'Teléfono USCIS: 1-800-375-5283 (lunes–viernes, 8am–8pm ET).',
            url: 'https://www.uscis.gov/contactcenter',
            label: 'uscis.gov/contactcenter',
          },
        ],
      },
    ],
    sourceNote: 'Todos los enlaces conducen a sitios web oficiales del gobierno de EE.UU. (.gov). Messenginfo no es responsable de los cambios en los documentos oficiales.',
  },
} as const

type Locale = keyof typeof T

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en
  return {
    title: t.metaTitle,
    description: t.metaDesc,
    metadataBase: new URL('https://messenginfo.com'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/re-parole-u4u/sources`,
      languages: Object.fromEntries(
        (['uk', 'ru', 'en', 'es'] as Locale[]).map((l) => [
          l,
          `https://messenginfo.com/${l}/services/re-parole-u4u/sources`,
        ]),
      ),
    },
  }
}

export default async function SourcesPage({ params }: Props) {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--background)', padding: '0 0 48px' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <section style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '20px 20px 18px' }}>
        <a
          href={`/${locale}/services/re-parole-u4u`}
          style={{ display: 'inline-block', fontSize: '15px', color: 'var(--primary)', fontWeight: 600, marginBottom: '12px', textDecoration: 'none' }}
        >
          {t.backLink}
        </a>
        <div style={{ marginBottom: '10px' }}>
          <span style={{ display: 'inline-block', fontSize: '15px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px', background: 'var(--info-bg)', color: 'var(--info-text)' }}>
            {t.badge}
          </span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, lineHeight: 1.2, color: 'var(--text-1)', marginBottom: '6px' }}>
          {t.title}
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.4 }}>
          {t.subtitle}
        </p>
      </section>

      {/* ── Resource categories ─────────────────────────────────── */}
      <section style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {t.categories.map((cat) => (
            <div key={cat.title}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-1)', marginBottom: '8px' }}>
                {cat.title}
              </p>
              <div
                style={{
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                {cat.items.map((item, idx) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      padding: '14px',
                      textDecoration: 'none',
                      background: 'var(--surface)',
                      borderBottom: idx < cat.items.length - 1 ? '1px solid var(--border)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)', marginBottom: '3px', lineHeight: 1.3 }}>
                          {item.name}
                        </p>
                        <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.4, marginBottom: '6px' }}>
                          {item.desc}
                        </p>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}>
                          {item.label} ↗
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Source note ─────────────────────────────────────────── */}
      <section style={{ padding: '20px 20px 0' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.5 }}>
          {t.sourceNote}
        </p>
      </section>
    </main>
  )
}
