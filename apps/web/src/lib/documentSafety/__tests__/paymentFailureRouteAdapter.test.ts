/**
 * paymentFailureRouteAdapter.test.ts — the flag boundary.
 * With REFUND_AUTOTICKET_ENABLED OFF (default), postPaymentFailure is a no-op that
 * resolves without touching any external utility — byte-identical prod. (The decision
 * logic itself is covered by handlePaymentFailure.test.ts via DI.)
 */
import { describe, it, expect, afterEach } from 'vitest'
import { postPaymentFailure } from '../paymentFailureRouteAdapter'

afterEach(() => { delete process.env.REFUND_AUTOTICKET_ENABLED })

describe('REFUND_AUTOTICKET_ENABLED OFF (default) → no-op', () => {
  it('resolves without throwing and without external calls when the flag is unset', async () => {
    delete process.env.REFUND_AUTOTICKET_ENABLED
    await expect(
      postPaymentFailure('user_input_invalid', { sessionId: 's1', email: 'u@example.com', docType: 'ua_birth_certificate' }),
    ).resolves.toBeUndefined()
  })

  it('resolves for every failure type while OFF', async () => {
    delete process.env.REFUND_AUTOTICKET_ENABLED
    for (const t of ['user_input_invalid', 'guard_block', 'backend_persist_failure', 'delivery_failure'] as const) {
      await expect(postPaymentFailure(t, { sessionId: 's', email: null, docType: null })).resolves.toBeUndefined()
    }
  })
})
