/**
 * legacyOperatorAuth — security helpers for the LEGACY Translation operator
 * Server Actions (manual-review). Stage 0.5 hotfix.
 *
 * WHY: Next.js Server Actions are independently-reachable POST endpoints. The
 * project middleware only gates page renders under /admin/* and EXCLUDES /api;
 * it must not be the sole defense for a mutation that emails a client's PDF.
 * Each action calls requireTranslationOperator() as its FIRST operation
 * (fail-closed).
 *
 * RECIPIENT AUTHORITY: the recipient is RE-VERIFIED against Stripe at send time.
 * We do NOT trust manual_review_queue.contact_email by itself — that column has
 * client writers (/api/tps/manual-review, /api/translation/manual-review both set
 * it from an unauthenticated request body). Instead we read the ticket's
 * session_id (which, for a paid translation order, IS the Stripe checkout id —
 * submit-order sets sessionId: checkoutId) and re-verify it as a paid translation
 * session; the recipient is the VERIFIED Stripe customer email. No client value
 * is ever used; absence of a verified paid session fails closed (no send).
 *
 * Scope guard: this file does NOT implement artifacts/outbox/state-machine
 * (that is V2 / PR #119). Auth + recipient authority only.
 *
 * Stripe is injected (RecipientVerifier) so this module stays pure/testable and
 * the operator page (which imports maskEmail) never pulls in the Stripe SDK.
 */
import { cookies } from 'next/headers'

const ADMIN_COOKIE = 'admin_session'

export type OperatorAuthCode = 'unauthenticated' | 'not_configured'

/** Thrown by requireTranslationOperator. Aborts the action before any side effect. */
export class OperatorAuthError extends Error {
  code: OperatorAuthCode
  /** 401 ~ unauthenticated session, 403 ~ server not configured. */
  httpStatus: number
  constructor(code: OperatorAuthCode) {
    super(`operator_${code}`)
    this.name = 'OperatorAuthError'
    this.code = code
    this.httpStatus = code === 'not_configured' ? 403 : 401
  }
}

/**
 * Fail-closed operator gate. Must be the FIRST call in every legacy mutation.
 * - No ADMIN_SECRET configured  → OperatorAuthError('not_configured') (403).
 * - Missing/invalid admin cookie → OperatorAuthError('unauthenticated') (401).
 * Returns a stable actor label for audit (the legacy single-secret model has no
 * per-operator identity; real identity is V2 / PR #119).
 */
export async function requireTranslationOperator(): Promise<{ actor: string }> {
  const secret = process.env.ADMIN_SECRET
  if (!secret || !secret.trim()) throw new OperatorAuthError('not_configured')
  const store = await cookies()
  const cookie = store.get(ADMIN_COOKIE)?.value
  if (!cookie || cookie !== secret) throw new OperatorAuthError('unauthenticated')
  return { actor: 'translation_operator' }
}

/** Minimal structural Supabase client (loose on purpose — see actions.ts note). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecipientQueryClient = { from: (table: string) => any }

/** Re-verifies a payment session and returns the VERIFIED customer email. */
export type RecipientVerifier = (
  sessionId: string,
) => Promise<{ paid: boolean; correctService: boolean; email: string | null }>

export type RecipientResult = {
  email: string | null
  /** ok | no_ticket_id | ticket_not_found | no_payment_session | verify_error | not_verified_paid | no_verified_email */
  reason: string
}

/**
 * Resolve the AUTHORITATIVE recipient by RE-VERIFYING the ticket's payment session
 * against Stripe. Returns email=null (with a machine reason) when there is no
 * verified paid translation session — callers MUST fail closed (do not send) and
 * MUST NOT fall back to any client-supplied address.
 */
export async function resolveVerifiedRecipient(
  supabase: RecipientQueryClient,
  ticketId: string,
  verify: RecipientVerifier,
): Promise<RecipientResult> {
  if (!ticketId) return { email: null, reason: 'no_ticket_id' }

  const { data, error } = await supabase
    .from('manual_review_queue')
    .select('session_id')
    .eq('id', ticketId)
    .single()
  if (error || !data) return { email: null, reason: 'ticket_not_found' }

  const sessionId = String(data.session_id ?? '').trim()
  if (!sessionId) return { email: null, reason: 'no_payment_session' }

  let v: { paid: boolean; correctService: boolean; email: string | null }
  try {
    v = await verify(sessionId)
  } catch {
    return { email: null, reason: 'verify_error' }
  }
  if (!v.paid || !v.correctService) return { email: null, reason: 'not_verified_paid' }

  const email = String(v.email ?? '').trim().toLowerCase()
  if (!email.includes('@')) return { email: null, reason: 'no_verified_email' }
  return { email, reason: 'ok' }
}

/** Mask an email for display in the operator UI (never show the full address). */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? '').trim()
  if (!e.includes('@')) return '—'
  const [user, domain] = e.split('@')
  const masked =
    user.length <= 2 ? `${user[0] ?? '*'}*` : `${user[0]}${'*'.repeat(user.length - 2)}${user[user.length - 1]}`
  return `${masked}@${domain}`
}
