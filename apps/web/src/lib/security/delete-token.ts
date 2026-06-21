/**
 * HMAC-SHA256 signed delete tokens for on-demand GDPR case deletion.
 * Signed with ADMIN_SECRET. Valid 90 days.
 */
import { createHmac, timingSafeEqual } from 'crypto'

function b64url(s: string) {
  return Buffer.from(s).toString('base64url')
}

export function generateDeleteToken(caseId: string, secret: string): string {
  const payload = b64url(
    JSON.stringify({ id: caseId, exp: Date.now() + 90 * 24 * 60 * 60 * 1000 })
  )
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
}

export function verifyDeleteToken(token: string, secret: string): { id: string } | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const payload = token.slice(0, dot)
    const sig = token.slice(dot + 1)

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
    ) return null

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      id: string
      exp: number
    }
    if (!data.id || !data.exp || Date.now() > data.exp) return null

    return { id: data.id }
  } catch {
    return null
  }
}
