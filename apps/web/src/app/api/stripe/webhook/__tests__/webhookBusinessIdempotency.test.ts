/**
 * webhookBusinessIdempotency.test.ts — #184 critique-1: prove the webhook's
 * BUSINESS side-effects are idempotent under re-processing.
 *
 * The ledger fail-open path (ledger unavailable → process anyway) is only safe if
 * re-delivering the SAME event does not corrupt or double-apply business state.
 * This drives the handler against a STATEFUL fake DB with the ledger forced
 * unavailable (so BOTH deliveries process), and asserts:
 *   - re-parole: payment_status='paid' is a pure idempotent SET (final state
 *     identical after 1 vs 2 deliveries).
 *   - translation: the update is guarded by `.eq('status','signed')`, so the 2nd
 *     delivery matches nothing (the row is already 'emailed') — no double effect.
 *   - the ONLY non-idempotent write is the append-only audit_log row, which is a
 *     log (duplicate entries under DB degradation are benign, not a business effect).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  event: {} as unknown,
  pending: [] as Promise<unknown>[],
  // ledger forced unavailable so BOTH deliveries fall through to processing
  rpcResult: { data: null, error: { message: 'ledger down' } } as { data: unknown; error: { message: string } | null },
  state: {
    wizard: {} as Record<string, { payment_status: string; stripe_checkout_id: string | null }>,
    translation: [] as Array<{ email: string; status: string; stripe_checkout_id: string | null }>,
    auditInserts: 0,
    wizardUpdateOps: 0,
    translationRowsUpdated: 0,
  },
}))

vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>()
  return { ...actual, after: (cb: () => unknown) => { h.pending.push((async () => cb())()) } }
})
vi.mock('@/lib/stripe/client', () => ({ stripe: { webhooks: { constructEvent: vi.fn(() => h.event) } } }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => makeStatefulClient(),
}))

function makeStatefulClient() {
  // A tiny stateful query builder modelling the exact chains the handler uses:
  //   from('audit_log').insert(obj).then(cb)
  //   from('wizard_sessions').update(obj).eq('id', id)                 (awaited)
  //   from('translation_orders').update(obj).eq('email',e).eq('status','signed').order().limit() (awaited)
  function builder(table: string) {
    let pendingUpdate: Record<string, unknown> | null = null
    const filters: Array<[string, unknown]> = []
    const apply = () => {
      if (table === 'wizard_sessions' && pendingUpdate) {
        h.state.wizardUpdateOps += 1
        const id = filters.find((f) => f[0] === 'id')?.[1] as string
        if (id && h.state.wizard[id]) Object.assign(h.state.wizard[id], pendingUpdate)
        return { error: null }
      }
      if (table === 'translation_orders' && pendingUpdate) {
        const email = filters.find((f) => f[0] === 'email')?.[1]
        const status = filters.find((f) => f[0] === 'status')?.[1]
        const rows = h.state.translation.filter((r) => r.email === email && (status === undefined || r.status === status))
        rows.forEach((r) => Object.assign(r, pendingUpdate))
        h.state.translationRowsUpdated += rows.length
        return { error: null }
      }
      return { error: null }
    }
    const b: Record<string, unknown> = {
      insert: () => { if (table === 'audit_log') h.state.auditInserts += 1; return Promise.resolve({ error: null }) },
      update: (obj: Record<string, unknown>) => { pendingUpdate = obj; return b },
      eq: (c: string, v: unknown) => { filters.push([c, v]); return b },
      order: () => b,
      limit: () => b,
      then: (res: (v: { error: null }) => unknown) => res(apply()),
    }
    return b
  }
  return {
    rpc: () => Promise.resolve(h.rpcResult),
    from: (t: string) => builder(t),
  }
}

import { POST } from '../route'

function whReq(): Request {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=x', 'content-type': 'application/json' },
    body: '{}',
  })
}

/** POST a webhook and wait for its `after()` background processing to finish. */
async function deliver(): Promise<void> {
  await POST(whReq() as never)
  await Promise.all(h.pending)
  h.pending = []
}

describe('#184 — webhook business-effect idempotency under ledger fail-open', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    h.rpcResult = { data: null, error: { message: 'ledger down' } } // force fall-through both times
    h.state = { wizard: {}, translation: [], auditInserts: 0, wizardUpdateOps: 0, translationRowsUpdated: 0 }
    h.pending = []
  })

  it('re-parole: re-delivery keeps payment_status=paid (idempotent SET), no corruption', async () => {
    h.state.wizard['w1'] = { payment_status: 'unpaid', stripe_checkout_id: null }
    h.event = { id: 'evt_rp', type: 'checkout.session.completed', data: { object: { id: 'cs_rp', metadata: { service: 're-parole-u4u', wizard_session_id: 'w1' }, customer_details: null } } }

    await deliver() // delivery 1
    const afterFirst = { ...h.state.wizard['w1'] }
    await deliver() // delivery 2 (duplicate, ledger still down → processes again)

    // business STATE identical after 1 vs 2 deliveries (idempotent)
    expect(h.state.wizard['w1']).toEqual(afterFirst)
    expect(h.state.wizard['w1'].payment_status).toBe('paid')
    expect(h.state.wizard['w1'].stripe_checkout_id).toBe('cs_rp')
    // audit_log is the ONLY non-idempotent write (a benign duplicate log row)
    expect(h.state.auditInserts).toBe(2)
  })

  it('translation: the .eq(status,signed) guard makes the 2nd delivery a no-op', async () => {
    h.state.translation = [{ email: 'u@x.io', status: 'signed', stripe_checkout_id: null }]
    h.event = { id: 'evt_tr', type: 'checkout.session.completed', data: { object: { id: 'cs_tr', metadata: { service: 'translation' }, customer_details: { email: 'u@x.io' } } } }

    await deliver() // delivery 1 → signed → emailed (1 row)
    await deliver() // delivery 2 → no row is 'signed' anymore → 0 rows

    expect(h.state.translation[0].status).toBe('emailed')
    expect(h.state.translationRowsUpdated).toBe(1) // only the first delivery mutated a row
  })
})
