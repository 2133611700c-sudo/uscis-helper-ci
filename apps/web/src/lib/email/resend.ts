/**
 * apps/web/src/lib/email/resend.ts
 *
 * Reusable Resend email lib for Messenginfo.
 *
 * Rules:
 *   - from = EMAIL_FROM_ADDRESS || 'noreply@messenginfo.com'
 *   - BCC = CONTACT_EMAIL_DESTINATION on EVERY email
 *   - Never throw after the email attempt — always return { ok, error }
 *   - Never log secrets (API key)
 *   - Log to Supabase email_events table if it exists
 */

import { Resend } from 'resend'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailType = 'contact' | 'packet_ready' | 'admin_notification' | 'magic_link' | 'translation_email' | 'payment_failure_ack'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
  type: EmailType
  /**
   * Attachment content semantics:
   *   - encoding 'utf8' (default, backward-compatible): `content` is raw text;
   *     sendEmail base64-encodes it before handing to Resend.
   *   - encoding 'base64': `content` is ALREADY base64 (e.g. pdfBuffer.toString('base64'));
   *     sendEmail passes it through unchanged. Prevents double-encoding of binary attachments.
   */
  attachment?: { filename: string; content: string; encoding?: 'base64' | 'utf8' }
  /**
   * Delivery idempotency key (e.g. the outbox idempotency_key). When set it is
   * passed to Resend as the Idempotency-Key so a duplicate send (worker retry) is
   * a no-op at the provider. PII-free (an opaque hash), never logged.
   */
  idempotencyKey?: string
}

export interface SendEmailResult {
  ok: boolean
  messageId?: string
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS ?? 'noreply@messenginfo.com'
}

function getBccAddress(): string | undefined {
  return process.env.CONTACT_EMAIL_DESTINATION || undefined
}

async function logEmailEvent(params: {
  type: EmailType
  to: string
  subject: string
  messageId?: string
  ok: boolean
  error?: string
}): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient()
    // Check if email_events table exists by trying the insert
    // If table doesn't exist, Supabase returns an error — we catch and ignore
    await supabase.from('email_events').insert({
      email_type: params.type,
      to_address: params.to,
      subject: params.subject,
      resend_id: params.messageId ?? null,
      status: params.ok ? 'sent' : 'failed',
      error_message: params.error ?? null,
      sent_at: new Date().toISOString(),
    })
  } catch {
    // Table may not exist — ignore silently
  }
}

// ─── Injectable transport seam (prod default = Resend) ──────────────────────────
//
// The actual provider call lives behind an EmailTransport so tests can inject a
// capturing transport (NO real send) and assert exactly-once delivery, idempotency
// key propagation, attachment integrity, etc. Production NEVER touches this seam —
// the default transport is the real Resend send (defaultResendTransport) and
// resetEmailTransport() restores it. setEmailTransportForTesting() is for vitest
// only; nothing in the product calls it, so the prod default is unchanged.

export interface EmailTransport {
  send(params: SendEmailParams): Promise<SendEmailResult>
}

const defaultResendTransport: EmailTransport = {
  send: realResendSend,
}

let activeTransport: EmailTransport = defaultResendTransport

/** TEST-ONLY: replace the email transport with a capturing/fake one. */
export function setEmailTransportForTesting(transport: EmailTransport): void {
  activeTransport = transport
}

/** TEST-ONLY: restore the production Resend transport. */
export function resetEmailTransport(): void {
  activeTransport = defaultResendTransport
}

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send an email. Delegates to the active transport (prod = Resend; tests may inject
 * a capturing transport). Never throws — returns { ok: false, error } on failure.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  return activeTransport.send(params)
}

/**
 * The production Resend send path (BCC, attachment encoding, idempotency key,
 * email_events logging). This is the default transport; tests replace the seam,
 * not this function.
 */
async function realResendSend(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getResendClient()

  if (!client) {
    const err = 'RESEND_API_KEY not configured'
    await logEmailEvent({ type: params.type, to: params.to, subject: params.subject, ok: false, error: err })
    return { ok: false, error: err }
  }

  const from = getFromAddress()
  // No BCC on translation_email — client gets their doc, admin gets a separate clean report
  const bcc = params.type === 'translation_email' ? undefined : getBccAddress()

  try {
    const attachments = params.attachment
      ? [{
          filename: params.attachment.filename,
          content: params.attachment.encoding === 'base64'
            ? params.attachment.content // already base64 — pass through unchanged (no double-encoding)
            : Buffer.from(params.attachment.content, 'utf-8').toString('base64'),
        }]
      : undefined

    const { data, error } = await client.emails.send(
      {
        from,
        to: [params.to],
        bcc: bcc ? [bcc] : undefined,
        subject: params.subject,
        html: params.html,
        text: params.text,
        attachments,
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
    )

    if (error) {
      await logEmailEvent({
        type: params.type,
        to: params.to,
        subject: params.subject,
        ok: false,
        error: error.message,
      })
      return { ok: false, error: error.message }
    }

    await logEmailEvent({
      type: params.type,
      to: params.to,
      subject: params.subject,
      messageId: data?.id,
      ok: true,
    })

    return { ok: true, messageId: data?.id }
  } catch (e: unknown) {
    // NEVER log the full error if it might contain the API key
    const msg = e instanceof Error ? e.message : 'Unknown email error'
    await logEmailEvent({ type: params.type, to: params.to, subject: params.subject, ok: false, error: msg })
    return { ok: false, error: msg }
  }
}

// ─── Convenience functions ────────────────────────────────────────────────────

/**
 * Send a contact form notification to the destination email.
 * BCC is applied automatically by sendEmail().
 */
export async function sendContactNotification(params: {
  name: string
  email: string
  message: string
  locale?: string
}): Promise<{ ok: boolean }> {
  const destination = process.env.CONTACT_EMAIL_DESTINATION
  if (!destination) {
    return { ok: false }
  }

  const html = `
    <h2 style="color:#1D5CBB">New contact message — Messenginfo</h2>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Name</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(params.name)}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Email</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(params.email)}</td></tr>
      ${params.locale ? `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Locale</td><td style="padding:8px;border:1px solid #ddd">${escapeHtml(params.locale)}</td></tr>` : ''}
      <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Message</td><td style="padding:8px;border:1px solid #ddd;white-space:pre-wrap">${escapeHtml(params.message)}</td></tr>
    </table>
    <p style="color:#888;font-size:12px;margin-top:24px">Sent via messenginfo.com</p>
  `

  const result = await sendEmail({
    to: destination,
    subject: `[Messenginfo] New contact from ${params.name}`,
    html,
    text: `Name: ${params.name}\nEmail: ${params.email}\n\n${params.message}`,
    type: 'contact',
  })

  return { ok: result.ok }
}

/**
 * Send a "packet ready" download notification to the user.
 */
export async function sendPacketReadyEmail(params: {
  to: string
  downloadUrl: string
  orderId: string
  expiresAt: Date
}): Promise<{ ok: boolean }> {
  const expiryStr = params.expiresAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const html = `
    <h2 style="color:#1D5CBB">Your document packet is ready</h2>
    <p>Your translation packet for order <strong>${escapeHtml(params.orderId)}</strong> has been generated and is ready to download.</p>
    <p>
      <a href="${escapeHtml(params.downloadUrl)}"
         style="display:inline-block;padding:12px 24px;background:#1D5CBB;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
        Download Packet
      </a>
    </p>
    <p style="color:#888;font-size:13px">This link expires on ${expiryStr}.</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
    <p style="color:#CC1A1A;font-size:12px">
      <strong>NOT LEGAL ADVICE.</strong> This is a draft translation package. USCIS generally requires a complete English translation with a signed self-certification statement (8 CFR 103.2(b)(3)). You must print, complete, and sign the included Self-Certification Template. Consult a licensed immigration attorney for official submissions.
    </p>
    <p style="color:#888;font-size:12px">messenginfo.com</p>
  `

  return sendEmail({
    to: params.to,
    subject: `[Messenginfo] Your translation packet is ready — Order ${params.orderId}`,
    html,
    text: `Your translation packet for order ${params.orderId} is ready.\n\nDownload: ${params.downloadUrl}\n\nExpires: ${expiryStr}\n\nNOT LEGAL ADVICE. Translator-signed draft template only.`,
    type: 'packet_ready',
  })
}

/**
 * Send a translation draft HTML file to the user's email as an attachment.
 */
export async function sendTranslationEmail(params: {
  to: string
  docLabel: string
  htmlContent: string
  filename: string
}): Promise<SendEmailResult> {
  const client = getResendClient()

  if (!client) {
    const err = 'RESEND_API_KEY not configured'
    await logEmailEvent({ type: 'translation_email', to: params.to, subject: '', ok: false, error: err })
    return { ok: false, error: err }
  }

  const from = getFromAddress()
  const bcc = getBccAddress()
  const subject = `[Messenginfo] Your translation draft — ${params.docLabel}`

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1D5CBB">Your translation draft is attached</h2>
      <p>Your <strong>${escapeHtml(params.docLabel)}</strong> translation draft is attached to this email as an HTML file.</p>
      <h3 style="margin-top:20px">Next steps:</h3>
      <ol style="line-height:2">
        <li>Open the attached <code>.html</code> file in your browser</li>
        <li>File → Print → Save as PDF</li>
        <li>Sign the Certification block by hand (required by USCIS)</li>
        <li>Submit with your original document</li>
      </ol>
      <div style="margin-top:20px;padding:12px 16px;background:#FFF7ED;border-left:4px solid #F59E0B;border-radius:4px">
        <p style="margin:0;color:#92400E;font-size:13px">
          <strong>⚠ IMPORTANT:</strong> This is a draft template only. Messenginfo does not certify translations.
          You must complete and sign the Certification block yourself before submitting to USCIS (8 CFR 103.2(b)(3)).
        </p>
      </div>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
      <p style="color:#9CA3AF;font-size:12px">messenginfo.com — Not legal advice. Draft template only.</p>
    </div>
  `

  const attachment = Buffer.from(params.htmlContent, 'utf-8').toString('base64')

  try {
    const { data, error } = await client.emails.send({
      from,
      to: [params.to],
      bcc: bcc ? [bcc] : undefined,
      subject,
      html: emailHtml,
      attachments: [
        {
          filename: params.filename,
          content: attachment,
        },
      ],
    })

    if (error) {
      await logEmailEvent({ type: 'translation_email', to: params.to, subject, ok: false, error: error.message })
      return { ok: false, error: error.message }
    }

    await logEmailEvent({ type: 'translation_email', to: params.to, subject, messageId: data?.id, ok: true })
    return { ok: true, messageId: data?.id ?? undefined }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    await logEmailEvent({ type: 'translation_email', to: params.to, subject, ok: false, error: msg })
    return { ok: false, error: msg }
  }
}

// ─── HTML helper ──────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
