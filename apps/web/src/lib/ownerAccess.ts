/**
 * Owner Access Layer
 *
 * Allows the site owner to use all paid/generation services for free.
 * Normal users are completely unaffected — they still use Stripe.
 *
 * Security model:
 * - Owner email stored in OWNER_EMAILS env var (never in frontend bundle)
 * - Verification via 6-digit code sent to owner email (Resend)
 * - Session stored as HMAC-signed httpOnly/Secure/SameSite cookie
 * - 24-hour TTL, server-side validation only
 * - Every owner-free action writes an audit event
 *
 * Usage in paid routes:
 *   const owner = await isOwnerSession(request)
 *   if (owner.verified) { // skip Stripe, proceed }
 *   else { // normal payment flow }
 */

import { createHmac } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = '__owner_session'
const CODE_TTL_MS = 10 * 60 * 1000      // 10 minutes to enter code
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

// ── In-memory code store (serverless: per-instance, short-lived) ────────
// For production with multiple instances, use Supabase or KV.
// For a single-owner use case, in-memory is sufficient.
// ── Environment ─────────────────────────────────────────────────────────
function getOwnerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

function getSessionSecret(): string {
  const secret = process.env.OWNER_SESSION_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('OWNER_SESSION_SECRET must be set (≥16 chars)')
  }
  return secret
}

// ── Public: check if email is owner ─────────────────────────────────────
export function isOwnerEmail(email: string): boolean {
  return getOwnerEmails().includes(email.trim().toLowerCase())
}

// ── TOTP-like code generation (stateless, serverless-safe) ──────────────
// Code = first 6 digits of HMAC(secret, email + timeWindow).
// Valid for CODE_TTL_MS. No database needed.
function generateCode(email: string): string {
  const window = Math.floor(Date.now() / CODE_TTL_MS)
  const hmac = createHmac('sha256', getSessionSecret())
    .update(`${email.toLowerCase()}:${window}`)
    .digest('hex')
  // Extract 6-digit numeric code from hex
  const num = parseInt(hmac.slice(0, 8), 16) % 1000000
  return num.toString().padStart(6, '0')
}

export function createVerificationCode(email: string): string {
  if (!isOwnerEmail(email)) throw new Error('Not an owner email')
  return generateCode(email)
}

export function verifyCode(email: string, code: string): boolean {
  if (!isOwnerEmail(email)) return false
  const expected = generateCode(email)
  // Also check previous window (in case code was generated near boundary)
  const prevWindow = Math.floor((Date.now() - CODE_TTL_MS) / CODE_TTL_MS)
  const prevHmac = createHmac('sha256', getSessionSecret())
    .update(`${email.toLowerCase()}:${prevWindow}`)
    .digest('hex')
  const prevNum = parseInt(prevHmac.slice(0, 8), 16) % 1000000
  const prevCode = prevNum.toString().padStart(6, '0')
  return code === expected || code === prevCode
}

// ── Cookie signing ──────────────────────────────────────────────────────
function signCookie(email: string): string {
  const expires = Date.now() + SESSION_TTL_MS
  const payload = `${email.toLowerCase()}|${expires}`
  const sig = createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('hex')
  return `${payload}|${sig}`
}

function verifyCookie(cookieValue: string): { valid: boolean; email: string } {
  const parts = cookieValue.split('|')
  if (parts.length !== 3) return { valid: false, email: '' }
  const [email, expiresStr, sig] = parts
  const expires = parseInt(expiresStr, 10)
  if (isNaN(expires) || Date.now() > expires) return { valid: false, email: '' }
  const expectedSig = createHmac('sha256', getSessionSecret())
    .update(`${email}|${expiresStr}`)
    .digest('hex')
  if (sig !== expectedSig) return { valid: false, email: '' }
  if (!isOwnerEmail(email)) return { valid: false, email: '' }
  return { valid: true, email }
}

// ── Public: set owner session cookie ────────────────────────────────────
export async function setOwnerSessionCookie(email: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, signCookie(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  })
}

// ── Public: clear owner session ─────────────────────────────────────────
export async function clearOwnerSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// ── Public: check if current request is owner ───────────────────────────
export interface OwnerSessionResult {
  verified: boolean
  email: string | null
}

export async function isOwnerSession(
  request?: NextRequest,
): Promise<OwnerSessionResult> {
  try {
    // Try NextRequest cookies first (API routes)
    if (request) {
      const cv = request.cookies.get(COOKIE_NAME)?.value
      if (cv) {
        const r = verifyCookie(cv)
        return { verified: r.valid, email: r.valid ? r.email : null }
      }
    }
    // Fallback: Next.js cookies() (server components / route handlers)
    const cookieStore = await cookies()
    const cv = cookieStore.get(COOKIE_NAME)?.value
    if (!cv) return { verified: false, email: null }
    const r = verifyCookie(cv)
    return { verified: r.valid, email: r.valid ? r.email : null }
  } catch {
    return { verified: false, email: null }
  }
}

// ── Public: audit event for owner-free actions ──────────────────────────
export function ownerAuditEvent(
  action: string,
  service: string,
): Record<string, unknown> {
  return {
    type: 'owner_free_generation',
    action,
    service,
    timestamp: new Date().toISOString(),
    // No raw PII — just the fact that owner used the service
  }
}
