/**
 * paymentFailureRouteAdapter — stub.
 *
 * handlePaymentFailure / paymentFailureTriage removed (operator-flow supersedes).
 * REFUND_AUTOTICKET_ENABLED is OFF and not set in prod, so this was already a no-op.
 * Interface kept intact so generate-pdf route compiles unchanged. Never throws.
 */

export interface PostPaymentFailureCtx {
  sessionId: string
  email: string | null
  docType: string | null
}

export async function postPaymentFailure(
  _failureType: string,
  _ctx: PostPaymentFailureCtx,
): Promise<void> {
  /* REFUND_AUTOTICKET feature removed — operator-flow handles post-payment failures */
}
