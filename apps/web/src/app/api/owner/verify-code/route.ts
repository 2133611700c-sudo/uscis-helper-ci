import { NextRequest, NextResponse } from 'next/server'
import { verifyCode, setOwnerSessionCookie } from '@/lib/ownerAccess'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json()
    if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
      return NextResponse.json({ error: 'Email and code required' }, { status: 400 })
    }

    // SECURITY (#184 E1): throttle code attempts. The code is a 6-digit value
    // (1e6 space) valid for ~10 min — without a cap an attacker who knows an
    // owner email could brute-force it. 5 attempts per 10 min per IP+email.
    const ip = getClientIP(request)
    const rl = await rateLimit(`owner-verify:${ip}:${email.toLowerCase()}`, 5, 10 * 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } },
      )
    }

    if (!verifyCode(email, code)) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
    }

    await setOwnerSessionCookie(email)
    console.log(`[owner] Session created (no PII logged)`)

    return NextResponse.json({ ok: true, message: 'Owner session active. Valid for 24 hours.' })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
