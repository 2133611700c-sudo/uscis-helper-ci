/**
 * POST /api/translation/email
 *
 * Generates a translation draft HTML and sends it to the user's email as an attachment.
 * Called from TranslateWizard post-download email block.
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateTranslationHTML } from '@/lib/translation/generateTranslationHTML'
import { sendTranslationEmail } from '@/lib/email/resend'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

// Basic email regex — server-side guard only, not a replacement for Resend's own validation
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: NextRequest) {
  try {
    // SECURITY (#195): this endpoint self-emails a generated translation draft and
    // is intentionally usable by anonymous users (free draft → "email me a copy").
    // Without a cap it is an open email relay: an attacker can send template-wrapped,
    // attacker-supplied field text to ANY address from our domain (spam/phish on the
    // Resend reputation). Throttle hard per IP — 5 sends / hour is ample for the
    // legitimate "email myself my draft" flow.
    const ip = getClientIP(req)
    const rl = await rateLimit(`translation-email:${ip}`, 5, 60 * 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
      )
    }

    const body = await req.json()
    const { email, prodId, fieldValues, srcLang, docLabel } = body as {
      email: string
      prodId: string
      fieldValues: Record<string, string>
      srcLang: string
      docLabel: string
    }

    // Validate required fields
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ ok: false, error: 'Invalid email address' }, { status: 400 })
    }
    if (!prodId || typeof prodId !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing prodId' }, { status: 400 })
    }
    if (!fieldValues || typeof fieldValues !== 'object') {
      return NextResponse.json({ ok: false, error: 'Missing fieldValues' }, { status: 400 })
    }

    // Generate HTML server-side (same function as client-side download)
    const htmlContent = generateTranslationHTML(prodId, fieldValues, srcLang ?? 'Ukrainian')
    const safeDocLabel = (docLabel ?? prodId).replace(/[^a-zA-Z0-9\s\-_]/g, '').trim() || 'document'
    const filename = `translation-draft-${prodId.replace(/[^a-z0-9\-]/g, '-')}.html`

    const result = await sendTranslationEmail({
      to: email.trim().toLowerCase(),
      docLabel: safeDocLabel,
      htmlContent,
      filename,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? 'Send failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
