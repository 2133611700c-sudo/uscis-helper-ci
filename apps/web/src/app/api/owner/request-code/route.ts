import { NextRequest, NextResponse } from 'next/server'
import { isOwnerEmail, createVerificationCode } from '@/lib/ownerAccess'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    if (!isOwnerEmail(email)) {
      // Don't reveal whether email is owner or not
      return NextResponse.json({ ok: true, message: 'If this is an owner email, a code was sent.' })
    }

    const code = createVerificationCode(email)

    // Send via Resend if available, otherwise log to server console
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from: process.env.RESEND_FROM ?? 'Messenginfo <noreply@messenginfo.com>',
          to: email,
          subject: 'Messenginfo Owner Access Code',
          text: `Your owner access code: ${code}\n\nValid for 10 minutes. Do not share.`,
        })
      } catch {
        // SECURITY (#184 E2): NEVER log the live code in production (it lands in
        // Vercel logs = credential leak). Surface the delivery failure only.
        console.error('[owner] Resend failed to deliver the access code')
        if (process.env.NODE_ENV !== 'production') console.log(`[OWNER_CODE dev-only] ${code}`)
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // No email provider configured — dev-only fallback so a local developer
      // can read the code. Gated so it can never log in production.
      console.log(`[OWNER_CODE dev-only] ${code}`)
    } else {
      console.error('[owner] No email provider configured; cannot deliver access code')
    }

    return NextResponse.json({ ok: true, message: 'If this is an owner email, a code was sent.' })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
