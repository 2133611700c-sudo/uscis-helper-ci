/**
 * /[locale]/services/re-parole-u4u/status
 *
 * Stage 8G — Case status helper.
 * Purpose: help 60yo Ukrainian user understand their USCIS case status.
 *   1. Enter receipt number (IOE/WAC/LIN) → opens egov.uscis.gov
 *   2. Status decoder: what each USCIS status means in plain language
 * Not legal advice.
 */

import type { Metadata } from 'next'

interface Props {
  params: Promise<{ locale: string }>
}

const T = {
  uk: {
    metaTitle: 'Перевірити статус справи Re-Parole — Messenginfo',
    metaDesc: 'Введіть номер квитанції та перевірте статус вашої заявки Re-Parole на офіційному сайті USCIS.',
    backLink: '← До Re-Parole',
    badge: 'Для українців U4U',
    title: 'Перевірити статус справи',
    subtitle: 'Введіть ваш номер квитанції. Ми відкриємо офіційний сайт USCIS.',
    receiptLabel: 'Номер квитанції',
    receiptPlaceholder: 'IOE1234567890',
    receiptHelp: 'Формат: IOE-, WAC-, LIN- або EAC- + 10 цифр. Знайдіть у листі або повідомленні від USCIS.',
    checkBtn: 'Перевірити на сайті USCIS ↗',
    decoderTitle: 'Що означає мій статус?',
    decoderSubtitle: 'Знайдіть ваш статус — і прочитайте, що робити далі.',
    notLegal: 'Ця сторінка — лише пояснення для довідки. Не є юридичною консультацією.',
    statuses: [
      {
        code: 'Case Was Received',
        emoji: '📬',
        meaning: 'Вашу заявку отримано і зареєстровано в системі USCIS.',
        action: 'Чекайте на наступне повідомлення. Це нормально — так починається кожна справа.',
        type: 'neutral',
      },
      {
        code: 'Case Is Being Actively Reviewed',
        emoji: '🔍',
        meaning: 'Офіцер USCIS зараз розглядає вашу заявку.',
        action: 'Нічого робити не потрібно. Процес іде.',
        type: 'good',
      },
      {
        code: 'Request for Evidence Was Sent',
        emoji: '⚠️',
        meaning: 'USCIS надіслало запит на додаткові документи (RFE). Потрібна відповідь.',
        action: 'Перевірте пошту — там є лист із переліком потрібних документів і дедлайном. Відповідайте вчасно.',
        type: 'warn',
      },
      {
        code: 'We Received Your Response To Our Request For Evidence',
        emoji: '✅',
        meaning: 'USCIS отримало вашу відповідь на запит RFE.',
        action: 'Чекайте на рішення. Справа продовжується.',
        type: 'good',
      },
      {
        code: 'Case Was Approved',
        emoji: '🎉',
        meaning: 'Вашу заявку схвалено! Парол продовжено.',
        action: 'Очікуйте документ поштою (або перевіряйте myUSCIS). Оновіть дані у роботодавця та, якщо треба, перевидайте EAD.',
        type: 'success',
      },
      {
        code: 'Notice Was Mailed',
        emoji: '📮',
        meaning: 'USCIS відправило вам офіційне повідомлення поштою.',
        action: 'Перевірте поштову скриньку. Якщо за 2 тижні лист не прийшов — зверніться в USCIS.',
        type: 'neutral',
      },
      {
        code: 'Case Was Transferred and a New Office Has Jurisdiction',
        emoji: '🏢',
        meaning: 'Справу передано до іншого офісу USCIS.',
        action: 'Нічого робити не потрібно. Номер квитанції залишається тим самим.',
        type: 'neutral',
      },
      {
        code: 'Case Was Denied',
        emoji: '❌',
        meaning: 'Заявку відхилено.',
        action: 'Прочитайте лист із рішенням — там вказана причина відмови та строк на оскарження. Зверніться до адвоката якнайшвидше.',
        type: 'error',
      },
      {
        code: 'Case Was Closed',
        emoji: '🔒',
        meaning: 'Справу закрито (може бути кілька причин).',
        action: 'Зверніться до USCIS (1-800-375-5283) або до адвоката для з\'ясування причини.',
        type: 'warn',
      },
      {
        code: 'Case Reopened',
        emoji: '🔄',
        meaning: 'Справу відновлено для повторного розгляду.',
        action: 'Чекайте рішення. Продовжуйте слідкувати за статусом.',
        type: 'good',
      },
    ],
  },
  ru: {
    metaTitle: 'Проверить статус дела Re-Parole — Messenginfo',
    metaDesc: 'Введите номер квитанции и проверьте статус вашего заявления Re-Parole на официальном сайте USCIS.',
    backLink: '← К Re-Parole',
    badge: 'Для украинцев U4U',
    title: 'Проверить статус дела',
    subtitle: 'Введите ваш номер квитанции. Мы откроем официальный сайт USCIS.',
    receiptLabel: 'Номер квитанции',
    receiptPlaceholder: 'IOE1234567890',
    receiptHelp: 'Формат: IOE-, WAC-, LIN- или EAC- + 10 цифр. Найдите в письме или уведомлении от USCIS.',
    checkBtn: 'Проверить на сайте USCIS ↗',
    decoderTitle: 'Что означает мой статус?',
    decoderSubtitle: 'Найдите ваш статус — и прочитайте, что делать дальше.',
    notLegal: 'Эта страница — только пояснения для справки. Не является юридической консультацией.',
    statuses: [
      {
        code: 'Case Was Received',
        emoji: '📬',
        meaning: 'Ваше заявление получено и зарегистрировано в системе USCIS.',
        action: 'Ждите следующего уведомления. Это нормально — так начинается каждое дело.',
        type: 'neutral',
      },
      {
        code: 'Case Is Being Actively Reviewed',
        emoji: '🔍',
        meaning: 'Офицер USCIS сейчас рассматривает ваше заявление.',
        action: 'Ничего делать не нужно. Процесс идёт.',
        type: 'good',
      },
      {
        code: 'Request for Evidence Was Sent',
        emoji: '⚠️',
        meaning: 'USCIS направило запрос на дополнительные документы (RFE). Нужен ответ.',
        action: 'Проверьте почту — там есть письмо со списком документов и дедлайном. Отвечайте вовремя.',
        type: 'warn',
      },
      {
        code: 'We Received Your Response To Our Request For Evidence',
        emoji: '✅',
        meaning: 'USCIS получило ваш ответ на запрос RFE.',
        action: 'Ждите решения. Дело продолжается.',
        type: 'good',
      },
      {
        code: 'Case Was Approved',
        emoji: '🎉',
        meaning: 'Ваше заявление одобрено! Пароль продлён.',
        action: 'Ожидайте документ по почте (или проверяйте myUSCIS). Обновите данные у работодателя и, при необходимости, переоформите EAD.',
        type: 'success',
      },
      {
        code: 'Notice Was Mailed',
        emoji: '📮',
        meaning: 'USCIS отправило вам официальное уведомление по почте.',
        action: 'Проверьте почтовый ящик. Если через 2 недели письма нет — обратитесь в USCIS.',
        type: 'neutral',
      },
      {
        code: 'Case Was Transferred and a New Office Has Jurisdiction',
        emoji: '🏢',
        meaning: 'Дело передано в другой офис USCIS.',
        action: 'Ничего делать не нужно. Номер квитанции остаётся тем же.',
        type: 'neutral',
      },
      {
        code: 'Case Was Denied',
        emoji: '❌',
        meaning: 'Заявление отклонено.',
        action: 'Прочитайте письмо с решением — там указана причина отказа и срок для обжалования. Обратитесь к адвокату как можно скорее.',
        type: 'error',
      },
      {
        code: 'Case Was Closed',
        emoji: '🔒',
        meaning: 'Дело закрыто (может быть несколько причин).',
        action: 'Обратитесь в USCIS (1-800-375-5283) или к адвокату для выяснения причины.',
        type: 'warn',
      },
      {
        code: 'Case Reopened',
        emoji: '🔄',
        meaning: 'Дело возобновлено для повторного рассмотрения.',
        action: 'Ждите решения. Продолжайте следить за статусом.',
        type: 'good',
      },
    ],
  },
  en: {
    metaTitle: 'Check Re-Parole Case Status — Messenginfo',
    metaDesc: 'Enter your receipt number and check your Re-Parole application status on the official USCIS website.',
    backLink: '← Back to Re-Parole',
    badge: 'For Ukrainians U4U',
    title: 'Check your case status',
    subtitle: 'Enter your receipt number. We will open the official USCIS website.',
    receiptLabel: 'Receipt number',
    receiptPlaceholder: 'IOE1234567890',
    receiptHelp: 'Format: IOE-, WAC-, LIN- or EAC- + 10 digits. Find it in your USCIS notice or letter.',
    checkBtn: 'Check on USCIS ↗',
    decoderTitle: 'What does my status mean?',
    decoderSubtitle: 'Find your status — and read what to do next.',
    notLegal: 'This page is for reference only. Not legal advice.',
    statuses: [
      {
        code: 'Case Was Received',
        emoji: '📬',
        meaning: 'Your application has been received and registered in the USCIS system.',
        action: 'Wait for the next notice. This is normal — every case starts this way.',
        type: 'neutral',
      },
      {
        code: 'Case Is Being Actively Reviewed',
        emoji: '🔍',
        meaning: 'A USCIS officer is currently reviewing your application.',
        action: 'No action needed. The process is moving forward.',
        type: 'good',
      },
      {
        code: 'Request for Evidence Was Sent',
        emoji: '⚠️',
        meaning: 'USCIS sent a Request for Evidence (RFE). A response is required.',
        action: 'Check your mail — there is a letter listing the needed documents and a deadline. Respond on time.',
        type: 'warn',
      },
      {
        code: 'We Received Your Response To Our Request For Evidence',
        emoji: '✅',
        meaning: 'USCIS received your response to the RFE.',
        action: 'Wait for a decision. Your case is continuing.',
        type: 'good',
      },
      {
        code: 'Case Was Approved',
        emoji: '🎉',
        meaning: 'Your application was approved! Parole has been extended.',
        action: 'Expect a document by mail (or check myUSCIS). Update records with your employer and renew EAD if needed.',
        type: 'success',
      },
      {
        code: 'Notice Was Mailed',
        emoji: '📮',
        meaning: 'USCIS mailed you an official notice.',
        action: 'Check your mailbox. If you don\'t receive it within 2 weeks, contact USCIS.',
        type: 'neutral',
      },
      {
        code: 'Case Was Transferred and a New Office Has Jurisdiction',
        emoji: '🏢',
        meaning: 'Your case was transferred to a different USCIS office.',
        action: 'No action needed. Your receipt number stays the same.',
        type: 'neutral',
      },
      {
        code: 'Case Was Denied',
        emoji: '❌',
        meaning: 'Your application was denied.',
        action: 'Read the denial notice — it states the reason and the deadline to appeal. Contact an attorney as soon as possible.',
        type: 'error',
      },
      {
        code: 'Case Was Closed',
        emoji: '🔒',
        meaning: 'Your case was closed (several reasons are possible).',
        action: 'Contact USCIS (1-800-375-5283) or an attorney to find out why.',
        type: 'warn',
      },
      {
        code: 'Case Reopened',
        emoji: '🔄',
        meaning: 'Your case was reopened for reconsideration.',
        action: 'Wait for a decision. Keep tracking your status.',
        type: 'good',
      },
    ],
  },
  es: {
    metaTitle: 'Verificar estado del caso Re-Parole — Messenginfo',
    metaDesc: 'Ingrese su número de recibo y verifique el estado de su solicitud Re-Parole en el sitio oficial de USCIS.',
    backLink: '← Volver a Re-Parole',
    badge: 'Para ucranianos U4U',
    title: 'Verificar estado del caso',
    subtitle: 'Ingrese su número de recibo. Abriremos el sitio oficial de USCIS.',
    receiptLabel: 'Número de recibo',
    receiptPlaceholder: 'IOE1234567890',
    receiptHelp: 'Formato: IOE-, WAC-, LIN- o EAC- + 10 dígitos. Encuéntrelo en su aviso o carta de USCIS.',
    checkBtn: 'Verificar en USCIS ↗',
    decoderTitle: '¿Qué significa mi estado?',
    decoderSubtitle: 'Encuentre su estado — y lea qué hacer a continuación.',
    notLegal: 'Esta página es solo de referencia. No es asesoramiento legal.',
    statuses: [
      {
        code: 'Case Was Received',
        emoji: '📬',
        meaning: 'Su solicitud fue recibida y registrada en el sistema de USCIS.',
        action: 'Espere el próximo aviso. Esto es normal — así comienza cada caso.',
        type: 'neutral',
      },
      {
        code: 'Case Is Being Actively Reviewed',
        emoji: '🔍',
        meaning: 'Un oficial de USCIS está revisando activamente su solicitud.',
        action: 'No se requiere ninguna acción. El proceso avanza.',
        type: 'good',
      },
      {
        code: 'Request for Evidence Was Sent',
        emoji: '⚠️',
        meaning: 'USCIS envió una solicitud de evidencia (RFE). Se requiere una respuesta.',
        action: 'Revise su correo — hay una carta con la lista de documentos y la fecha límite. Responda a tiempo.',
        type: 'warn',
      },
      {
        code: 'We Received Your Response To Our Request For Evidence',
        emoji: '✅',
        meaning: 'USCIS recibió su respuesta al RFE.',
        action: 'Espere la decisión. Su caso continúa.',
        type: 'good',
      },
      {
        code: 'Case Was Approved',
        emoji: '🎉',
        meaning: '¡Su solicitud fue aprobada! El parole ha sido extendido.',
        action: 'Espere el documento por correo (o verifique myUSCIS). Actualice registros con su empleador y renueve el EAD si es necesario.',
        type: 'success',
      },
      {
        code: 'Notice Was Mailed',
        emoji: '📮',
        meaning: 'USCIS le envió un aviso oficial por correo.',
        action: 'Revise su buzón. Si no lo recibe en 2 semanas, comuníquese con USCIS.',
        type: 'neutral',
      },
      {
        code: 'Case Was Transferred and a New Office Has Jurisdiction',
        emoji: '🏢',
        meaning: 'Su caso fue transferido a una oficina diferente de USCIS.',
        action: 'No se requiere ninguna acción. Su número de recibo sigue siendo el mismo.',
        type: 'neutral',
      },
      {
        code: 'Case Was Denied',
        emoji: '❌',
        meaning: 'Su solicitud fue denegada.',
        action: 'Lea el aviso de denegación — indica la razón y el plazo para apelar. Consulte a un abogado lo antes posible.',
        type: 'error',
      },
      {
        code: 'Case Was Closed',
        emoji: '🔒',
        meaning: 'Su caso fue cerrado (pueden haber varias razones).',
        action: 'Comuníquese con USCIS (1-800-375-5283) o un abogado para averiguar el motivo.',
        type: 'warn',
      },
      {
        code: 'Case Reopened',
        emoji: '🔄',
        meaning: 'Su caso fue reabierto para reconsideración.',
        action: 'Espere una decisión. Continúe rastreando su estado.',
        type: 'good',
      },
    ],
  },
} as const

type Locale = keyof typeof T
type StatusType = 'neutral' | 'good' | 'warn' | 'error' | 'success'

function statusColors(type: StatusType) {
  switch (type) {
    case 'success': return { bg: 'var(--success-bg)', border: 'var(--success-border)', text: 'var(--success-text)', dot: 'var(--success)' }
    case 'good':    return { bg: 'var(--info-bg)', border: 'var(--info-border)', text: 'var(--info-text)', dot: 'var(--primary)' }
    case 'warn':    return { bg: 'var(--warning-bg)', border: 'var(--warning-border)', text: 'var(--warning-text)', dot: '#f59e0b' }
    case 'error':   return { bg: 'var(--error-bg)', border: 'var(--error-border)', text: 'var(--error-text)', dot: 'var(--error)' }
    default:        return { bg: 'var(--surface)', border: 'var(--border)', text: 'var(--text-2)', dot: 'var(--text-3)' }
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = T[(locale as Locale)] ?? T.en
  return {
    title: t.metaTitle,
    description: t.metaDesc,
    metadataBase: new URL('https://messenginfo.com'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/re-parole-u4u/status`,
      languages: Object.fromEntries(
        (['uk', 'ru', 'en', 'es'] as Locale[]).map((l) => [
          l,
          `https://messenginfo.com/${l}/services/re-parole-u4u/status`,
        ]),
      ),
    },
  }
}

export default async function StatusPage({ params }: Props) {
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

      {/* ── Link to official USCIS Case Status (no form, no input) ─ */}
      {/* Messenginfo does not process receipt numbers. We send the user
          directly to the official USCIS portal where they enter the number. */}
      <section style={{ padding: '20px 20px 0' }}>
        <a
          href="https://egov.uscis.gov/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            width: '100%',
            fontSize: '15px',
            fontWeight: 700,
            padding: '14px',
            minHeight: '52px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--btn-action)',
            color: 'var(--btn-action-text)',
            textAlign: 'center',
            textDecoration: 'none',
            boxSizing: 'border-box',
            lineHeight: '24px',
          }}
        >
          {t.checkBtn}
        </a>
        <p style={{ fontSize: '15px', color: 'var(--text-3)', marginTop: '8px', lineHeight: 1.45 }}>
          {t.receiptHelp}
        </p>
      </section>

      {/* ── Status decoder ─────────────────────────────────────── */}
      <section style={{ padding: '28px 20px 0' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-1)', marginBottom: '4px' }}>
          {t.decoderTitle}
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '16px', lineHeight: 1.4 }}>
          {t.decoderSubtitle}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {t.statuses.map((s) => {
            const c = statusColors(s.type as StatusType)
            return (
              <div
                key={s.code}
                style={{
                  borderRadius: '12px',
                  padding: '14px',
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>{s.emoji}</span>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: c.text, fontFamily: 'monospace', marginBottom: '3px' }}>
                      {s.code}
                    </p>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.35 }}>
                      {s.meaning}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    marginLeft: '30px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    border: `1px solid ${c.border}`,
                  }}
                >
                  <p style={{ fontSize: '15px', color: 'var(--text-2)', lineHeight: 1.45 }}>
                    👉 {s.action}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Disclaimer ─────────────────────────────────────────── */}
      <section style={{ padding: '20px 20px 0' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-3)', lineHeight: 1.5 }}>
          {t.notLegal}
        </p>
      </section>
    </main>
  )
}
