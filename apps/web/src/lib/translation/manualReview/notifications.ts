/**
 * Notification abstraction for manual review events.
 *
 * Wraps existing channels (Resend email, optional Telegram webhook). Goal:
 *   - Centralize PII-safety: callers pass safe metadata only.
 *   - Survive missing providers: returns 'NOT_CONFIGURED' instead of throwing.
 *   - Never block ticket creation if notification dispatch fails.
 *
 * Channels:
 *   - email_user      → Resend, sent to client_email if available; copy is the
 *                       safe i18n message (no admin notes, no source values).
 *   - email_operator  → Resend, sent to STAFF_EMAIL with ticket id + status only.
 *   - telegram_owner  → optional, fires only if TELEGRAM_OWNER_WEBHOOK_URL set.
 *
 * Payload contract: never include
 *   - raw OCR text
 *   - source_fields values
 *   - translated_fields values
 *   - full names (use initials max)
 *   - DOB / passport / document numbers
 *   - addresses
 */

import { resolveManualReviewMessage, type SupportedLocale } from './messages'
import { sanitizeEventMetadata } from './safeMetadata'
import type { ManualReviewEventType, ManualReviewPriority } from './types'

// ── Result shape ─────────────────────────────────────────────────────────────

export type NotificationDeliveryStatus =
  | 'sent'
  | 'not_configured'
  | 'failed'

export interface NotificationDelivery {
  channel: 'email_user' | 'email_operator' | 'telegram_owner'
  status: NotificationDeliveryStatus
  /** PII-safe error tag, never raw error message */
  errorTag?: string | null
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface UserNotificationInput {
  ticketId: string
  /** Optional client email — caller fetched it from authenticated DB context */
  toEmail?: string | null
  /** Locale for copy */
  locale?: SupportedLocale
  /** Message key from messages.ts (the bucket-level user message) */
  messageKey: string
  /** Optional next-step key */
  nextStepKey?: string | null
}

export interface OperatorNotificationInput {
  ticketId: string
  sessionId?: string | null
  eventType: ManualReviewEventType
  priority: ManualReviewPriority
  moduleType?: string | null
  /**
   * Plain bag of safe metadata. Will be passed through sanitizeEventMetadata
   * before being included in the notification body.
   */
  metadata?: Record<string, unknown>
}

// ── Public API ───────────────────────────────────────────────────────────────

const STAFF_EMAIL = (process.env.MANUAL_REVIEW_STAFF_EMAIL ?? 'contact@messenginfo.com').trim()
const FROM_EMAIL = (process.env.EMAIL_FROM_ADDRESS ?? 'noreply@messenginfo.com').trim()

/**
 * Send a user-facing notification (email).
 * Body comes from i18n message keys only — never includes operator notes,
 * field values, or admin metadata.
 */
export async function notifyUser(input: UserNotificationInput): Promise<NotificationDelivery> {
  if (!input.toEmail || !input.toEmail.includes('@')) {
    return { channel: 'email_user', status: 'not_configured', errorTag: 'no_recipient' }
  }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { channel: 'email_user', status: 'not_configured', errorTag: 'resend_missing' }
  }

  const locale: SupportedLocale = input.locale ?? 'en'
  const subject = subjectForLocale(locale)
  const body = resolveManualReviewMessage(input.messageKey, locale)
  const next = input.nextStepKey ? resolveManualReviewMessage(input.nextStepKey, locale) : ''

  const html = `
    <div style="font-family:system-ui,sans-serif;color:#1e293b;font-size:16px;line-height:1.5">
      <p>${escapeHtml(body)}</p>
      ${next ? `<p style="color:#475569">${escapeHtml(next)}</p>` : ''}
      <p style="color:#94a3b8;font-size:13px;margin-top:24px">
        Messenginfo · ${escapeHtml(input.ticketId.slice(0, 8))}
      </p>
    </div>
  `.trim()

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: `Messenginfo <${FROM_EMAIL}>`,
      to: input.toEmail.trim().toLowerCase(),
      subject,
      html,
    })
    return { channel: 'email_user', status: 'sent', errorTag: null }
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('[manualReview/notifyUser] failed:', String(e))
    return { channel: 'email_user', status: 'failed', errorTag: 'send_error' }
  }
}

/**
 * Notify the operator team (email). Body is metadata-only, no PII.
 */
export async function notifyOperator(
  input: OperatorNotificationInput,
): Promise<NotificationDelivery> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { channel: 'email_operator', status: 'not_configured', errorTag: 'resend_missing' }
  }

  const safeMeta = sanitizeEventMetadata({
    ticket_id: input.ticketId,
    session_id: input.sessionId ?? null,
    event_type: input.eventType,
    priority: input.priority,
    module_type: input.moduleType ?? null,
    ...input.metadata,
  })

  const rows = Object.entries(safeMeta)
    .map(([k, v]) => `<tr><td style="padding:4px 8px;color:#64748b">${escapeHtml(k)}</td><td style="padding:4px 8px;color:#1e293b">${escapeHtml(formatScalar(v))}</td></tr>`)
    .join('')

  const subject = `[Manual Review] ${input.eventType} · ${input.priority} · ${input.ticketId.slice(0, 8)}`
  const html = `
    <div style="font-family:system-ui,sans-serif">
      <h2 style="font-size:16px;color:#1e293b">Manual Review event</h2>
      <table style="border-collapse:collapse;font-size:13px">${rows}</table>
      <p style="color:#94a3b8;font-size:12px;margin-top:16px">
        This notification is metadata-only by design — no source content is included.
        Use the admin queue to view the full case.
      </p>
    </div>
  `.trim()

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: `Messenginfo Staff <${FROM_EMAIL}>`,
      to: STAFF_EMAIL,
      subject,
      html,
    })
    return { channel: 'email_operator', status: 'sent', errorTag: null }
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('[manualReview/notifyOperator] failed:', String(e))
    return { channel: 'email_operator', status: 'failed', errorTag: 'send_error' }
  }
}

/**
 * Optional: ping the owner Telegram channel/webhook if configured.
 */
export async function notifyOwnerAlert(
  input: OperatorNotificationInput,
): Promise<NotificationDelivery> {
  // NATIVE Telegram Bot API path (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) — the
  // 3-minute BotFather setup; takes precedence over the custom webhook.
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (botToken && chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `[manual_review] ${input.eventType} ${input.priority} ${input.ticketId.slice(0, 8)}`,
        }),
      })
      if (res.ok) return { channel: 'telegram_owner', status: 'sent', errorTag: null }
      return { channel: 'telegram_owner', status: 'failed', errorTag: `http_${res.status}` }
    } catch {
      return { channel: 'telegram_owner', status: 'failed', errorTag: 'send_error' }
    }
  }
  const url = process.env.TELEGRAM_OWNER_WEBHOOK_URL
  if (!url) {
    return { channel: 'telegram_owner', status: 'not_configured', errorTag: 'webhook_missing' }
  }
  const safeMeta = sanitizeEventMetadata({
    ticket_id: input.ticketId,
    session_id: input.sessionId ?? null,
    event_type: input.eventType,
    priority: input.priority,
    module_type: input.moduleType ?? null,
    ...input.metadata,
  })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[manual_review] ${input.eventType} ${input.priority} ${input.ticketId.slice(0, 8)}`,
        metadata: safeMeta,
      }),
    })
    if (!res.ok) {
      return { channel: 'telegram_owner', status: 'failed', errorTag: `http_${res.status}` }
    }
    return { channel: 'telegram_owner', status: 'sent', errorTag: null }
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error('[manualReview/notifyOwnerAlert] failed:', String(e))
    return { channel: 'telegram_owner', status: 'failed', errorTag: 'send_error' }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function subjectForLocale(locale: SupportedLocale): string {
  switch (locale) {
    case 'ru': return 'Messenginfo — обновление по вашему документу'
    case 'uk': return 'Messenginfo — оновлення щодо вашого документа'
    default:   return 'Messenginfo — your document update'
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
