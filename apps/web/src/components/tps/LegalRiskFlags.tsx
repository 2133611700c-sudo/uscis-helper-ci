'use client'

/**
 * LegalRiskFlags — 3 yes/no questions whose "yes" answer surfaces a
 * non-blocking amber notice recommending the user consult a licensed
 * immigration attorney or a DOJ-accredited representative.
 *
 * Why this exists:
 *   The TPSAnswers contract already has three boolean flags that USCIS
 *   officers care about:
 *     - has_criminal_concern
 *     - has_prior_tps_denial
 *     - left_us_without_advance_parole
 *   Until now the wizard hardcoded all three to false in the API request
 *   body, which means a user with a real legal-risk case (prior denial,
 *   prior removal, criminal record, left-and-returned without AP) sailed
 *   through the same self-help path as a clean case. That's irresponsible
 *   for an immigration packet preparation service.
 *
 *   This component does NOT give legal advice and does NOT classify
 *   eligibility. It surfaces the flags so the user makes an informed
 *   choice to seek a real lawyer if needed. The packet can still be
 *   generated — Messenginfo doesn't gatekeep — but the user has been
 *   told plainly.
 *
 * Privacy:
 *   Stored in localStorage under `tps:legal-risk:v1` (booleans only, no
 *   detail strings). Cleared by the "Clear my data" button alongside the
 *   other TPS localStorage keys.
 *
 * Locked rules — DO NOT change without updating content-guard:
 *   - Never use "we recommend", "you should", "you must", "approved",
 *     "denied", "qualified", "eligible". These are legal-advice triggers.
 *   - Always include the explicit "Messenginfo is not a law firm" line.
 *   - The official USCIS legal-services link must point to:
 *     https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/find-legal-services
 *     (verified live 2026-05-11; if dead, fix here AND in /[locale]/services
 *     sources page in the same commit).
 */

import type { ReactNode } from 'react'
import { TPS_A11Y } from '@/lib/tps/a11y'

export type Locale = 'uk' | 'ru' | 'en' | 'es'

export interface LegalRiskValue {
  has_criminal_concern: boolean | null
  has_prior_tps_denial: boolean | null
  left_us_without_advance_parole: boolean | null
}

export const EMPTY_LEGAL_RISK: LegalRiskValue = {
  has_criminal_concern: null,
  has_prior_tps_denial: null,
  left_us_without_advance_parole: null,
}

export interface LegalRiskProps {
  locale: Locale
  value: LegalRiskValue
  onChange: (key: keyof LegalRiskValue, val: boolean) => void
}

const FIND_LEGAL_SERVICES_URL =
  'https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/find-legal-services'

interface CopyBundle {
  title: string
  intro: string
  qCriminal: string
  qPriorDenial: string
  qLeftWithoutAp: string
  yes: string
  no: string
  noticeHeading: string
  noticeBody: string
  noticeNotLawFirm: string
  noticeLinkLabel: string
}

const COPY: Record<Locale, CopyBundle> = {
  uk: {
    title: 'Юридично складні випадки',
    intro:
      'Ці питання впливають на те, наскільки ваш випадок підходить для самостійного подання. Дайте чесну відповідь — ми нікому її не передаємо.',
    qCriminal:
      'Чи є у вас арешти, обвинувачення або судимості (у США або за кордоном)?',
    qPriorDenial:
      'Чи відмовляли вам у TPS або в інших імміграційних заявах раніше?',
    qLeftWithoutAp:
      'Ви виїжджали зі США після надання TPS без Advance Parole / Travel Document?',
    yes: 'Так',
    no: 'Ні',
    noticeHeading: 'Радимо порадитись з юристом',
    noticeBody:
      'Один або кілька ваших відповідей вказують на ситуацію, яка може ускладнити справу. Самостійне подання все ще можливе, але краще обговорити це з ліцензованим імміграційним адвокатом або акредитованим представником DOJ перед відправкою.',
    noticeNotLawFirm:
      'Messenginfo — не юридична фірма і не надає юридичних консультацій.',
    noticeLinkLabel: 'Як знайти юриста — офіційна сторінка USCIS →',
  },
  ru: {
    title: 'Юридически сложные случаи',
    intro:
      'Эти вопросы влияют на то, насколько ваш случай подходит для самостоятельной подачи. Ответьте честно — мы никому это не передаём.',
    qCriminal:
      'Есть ли у вас аресты, обвинения или судимости (в США или за рубежом)?',
    qPriorDenial:
      'Отказывали ли вам в TPS или в других иммиграционных заявлениях раньше?',
    qLeftWithoutAp:
      'Вы выезжали из США после получения TPS без Advance Parole / Travel Document?',
    yes: 'Да',
    no: 'Нет',
    noticeHeading: 'Стоит поговорить с юристом',
    noticeBody:
      'Один или несколько ваших ответов указывают на ситуацию, которая может усложнить дело. Самостоятельная подача всё ещё возможна, но лучше обсудить это с лицензированным иммиграционным адвокатом или аккредитованным представителем DOJ до отправки.',
    noticeNotLawFirm:
      'Messenginfo — не юридическая фирма и не оказывает юридические консультации.',
    noticeLinkLabel: 'Как найти юриста — официальная страница USCIS →',
  },
  en: {
    title: 'Legally complex situations',
    intro:
      'These questions affect how appropriate self-filing is for your case. Answer honestly — your answers are not shared.',
    qCriminal:
      'Do you have any arrests, charges, or convictions (in the US or abroad)?',
    qPriorDenial:
      'Have you ever been denied TPS or another immigration application before?',
    qLeftWithoutAp:
      'Did you leave the US after being granted TPS without Advance Parole / Travel Document?',
    yes: 'Yes',
    no: 'No',
    noticeHeading: 'Consider talking to a lawyer',
    noticeBody:
      'One or more of your answers points to a situation that may complicate your case. Self-filing is still possible, but it is worth speaking with a licensed immigration attorney or a DOJ-accredited representative before you mail anything.',
    noticeNotLawFirm:
      'Messenginfo is not a law firm and does not provide legal advice.',
    noticeLinkLabel: 'How to find a lawyer — official USCIS page →',
  },
  es: {
    title: 'Casos legalmente complejos',
    intro:
      'Estas preguntas afectan si presentar usted mismo es apropiado para su caso. Responda con honestidad — sus respuestas no se comparten.',
    qCriminal:
      '¿Tiene arrestos, cargos o condenas (en EE. UU. o en el extranjero)?',
    qPriorDenial:
      '¿Le han negado el TPS u otra solicitud de inmigración anteriormente?',
    qLeftWithoutAp:
      '¿Salió de EE. UU. después de recibir TPS sin Advance Parole / Travel Document?',
    yes: 'Sí',
    no: 'No',
    noticeHeading: 'Considere hablar con un abogado',
    noticeBody:
      'Una o más de sus respuestas indica una situación que puede complicar su caso. Presentar usted mismo sigue siendo posible, pero conviene hablar con un abogado de inmigración con licencia o un representante acreditado por el DOJ antes de enviar.',
    noticeNotLawFirm:
      'Messenginfo no es un bufete de abogados y no ofrece asesoría legal.',
    noticeLinkLabel: 'Cómo encontrar un abogado — página oficial de USCIS →',
  },
}

const KEYS: Array<keyof LegalRiskValue> = [
  'has_criminal_concern',
  'has_prior_tps_denial',
  'left_us_without_advance_parole',
]

export function hasAnyLegalRisk(v: LegalRiskValue): boolean {
  return KEYS.some((k) => v[k] === true)
}

export function LegalRiskFlags(props: LegalRiskProps): ReactNode {
  const c = COPY[props.locale]
  const anyYes = hasAnyLegalRisk(props.value)

  const questions: Array<{ key: keyof LegalRiskValue; label: string }> = [
    { key: 'has_criminal_concern', label: c.qCriminal },
    { key: 'has_prior_tps_denial', label: c.qPriorDenial },
    { key: 'left_us_without_advance_parole', label: c.qLeftWithoutAp },
  ]

  const card: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: anyYes
      ? '1px solid var(--warning, #fcd34d)'
      : '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    marginTop: 18,
  }

  return (
    <section
      data-testid="tps-legal-risk"
      style={card}
      aria-label={c.title}
    >
      <h3
        style={{
          // A11Y: section title 16→18
          fontSize: TPS_A11Y.TEXT_PRIMARY_VALUE,
          fontWeight: TPS_A11Y.WEIGHT_HEAVY,
          color: 'var(--text-1)',
          marginBottom: 4,
        }}
      >
        {c.title}
      </h3>
      <p style={{
        // A11Y: intro 13→16 — older users read it slowly, must be comfortable
        fontSize: TPS_A11Y.TEXT_BODY,
        color: 'var(--text-1)',
        marginBottom: 14,
        lineHeight: TPS_A11Y.LINE_HEIGHT_BODY,
      }}>
        {c.intro}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {questions.map(({ key, label }) => (
          <div
            key={key}
            data-testid={`tps-legal-risk-${key}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <p style={{
              // A11Y: question text 14→16
              fontSize: TPS_A11Y.TEXT_BODY,
              fontWeight: TPS_A11Y.WEIGHT_MEDIUM,
              color: 'var(--text-1)',
              margin: 0,
              lineHeight: TPS_A11Y.LINE_HEIGHT_BODY,
            }}>
              {label}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <RadioPill
                checked={props.value[key] === false}
                label={c.no}
                onClick={() => props.onChange(key, false)}
                testId={`tps-legal-risk-${key}-no`}
                tone="neutral"
              />
              <RadioPill
                checked={props.value[key] === true}
                label={c.yes}
                onClick={() => props.onChange(key, true)}
                testId={`tps-legal-risk-${key}-yes`}
                tone="warn"
              />
            </div>
          </div>
        ))}
      </div>

      {anyYes && (
        <div
          data-testid="tps-legal-risk-notice"
          style={{
            marginTop: 16,
            padding: 16,
            background: 'var(--warning-bg, #fef3c7)',
            color: 'var(--warning-text, #92400e)',
            borderRadius: 12,
            border: '2px solid var(--warning, #fcd34d)',
          }}
        >
          <p style={{
            // A11Y: notice heading 14→17
            fontWeight: TPS_A11Y.WEIGHT_HEAVY,
            fontSize: 17,
            marginBottom: 8,
          }}>
            {c.noticeHeading}
          </p>
          <p style={{
            // A11Y: notice body 13→16 — at-risk user must read this fully
            fontSize: TPS_A11Y.TEXT_BODY,
            lineHeight: TPS_A11Y.LINE_HEIGHT_BODY,
            marginBottom: 10,
          }}>
            {c.noticeBody}
          </p>
          <p style={{
            // A11Y: 'not a law firm' MUST be readable — 12→14 medium weight
            fontSize: TPS_A11Y.TEXT_DISCLAIMER,
            fontWeight: TPS_A11Y.WEIGHT_MEDIUM,
            fontStyle: 'italic',
            marginBottom: 10,
          }}>
            {c.noticeNotLawFirm}
          </p>
          <a
            href={FIND_LEGAL_SERVICES_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              // A11Y: link to USCIS find-legal-services 13→15
              fontSize: 15,
              fontWeight: TPS_A11Y.WEIGHT_BOLD,
              color: 'var(--warning-text, #92400e)',
              textDecoration: 'underline',
              display: 'inline-block',
              minHeight: TPS_A11Y.TOUCH_MIN,
              lineHeight: '44px',
            }}
            data-testid="tps-legal-risk-link"
          >
            {c.noticeLinkLabel}
          </a>
        </div>
      )}
    </section>
  )
}

interface RadioPillProps {
  checked: boolean
  label: string
  onClick: () => void
  testId: string
  tone: 'neutral' | 'warn'
}

function RadioPill(props: RadioPillProps): ReactNode {
  const bg = props.checked
    ? props.tone === 'warn'
      ? 'var(--warning, #fcd34d)'
      : 'var(--surface-3)'
    : 'var(--surface)'
  const color = props.checked
    ? props.tone === 'warn'
      ? 'var(--warning-text, #92400e)'
      : 'var(--text-1)'
    : 'var(--text-2)'
  const border = props.checked
    ? props.tone === 'warn'
      ? '1px solid var(--warning, #fcd34d)'
      : '1px solid var(--text-1)'
    : '1px solid var(--border)'

  return (
    <button
      type="button"
      onClick={props.onClick}
      data-testid={props.testId}
      aria-pressed={props.checked}
      style={{
        flex: 1,
        // A11Y: 48px touch target (TOUCH_PRIMARY), 17px label so elder
        // user can read Yes/No without zooming on small Android.
        minHeight: TPS_A11Y.TOUCH_PRIMARY,
        padding: '12px 16px',
        background: bg,
        color,
        border,
        borderRadius: 10,
        fontSize: 17,
        fontWeight: TPS_A11Y.WEIGHT_BOLD,
        cursor: 'pointer',
      }}
    >
      {props.label}
    </button>
  )
}
