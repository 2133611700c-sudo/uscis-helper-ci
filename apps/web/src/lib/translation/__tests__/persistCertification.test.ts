/**
 * persistCertification.test.ts — S2 safety: the certification audit is a HARD
 * requirement. Locks the failure the owner flagged: a "signed" PDF must NEVER be
 * returned when the audit row could not be stored.
 */
import { describe, it, expect } from 'vitest'
import { persistCertification, type InsertableClient } from '../persistCertification'

/** Fake supabase client: per-table queue of insert results consumed in order. */
function fakeClient(plan: Record<string, Array<{ error: unknown } | 'throw'>>): InsertableClient {
  const queues: Record<string, Array<{ error: unknown } | 'throw'>> = { ...plan }
  return {
    from(table: string) {
      return {
        async insert() {
          const q = queues[table] ?? []
          const next = q.shift() ?? { error: null }
          if (next === 'throw') throw new Error('network down')
          return next as { error: { code?: string; message?: string } | null }
        },
      }
    },
  }
}

const ROWS = { orderRow: { name: 'X' }, auditRow: { document_hash: 'h' } }

describe('S2 — audit persistence hard-fail', () => {
  it('ok=true only when BOTH order and audit inserts succeed', async () => {
    const c = fakeClient({ translation_orders: [{ error: null }], translation_certification_audit: [{ error: null }] })
    const r = await persistCertification(c, ROWS)
    expect(r.ok).toBe(true)
    expect(r.orderErr).toBeNull()
    expect(r.auditErr).toBeNull()
  })

  it('audit insert failing → ok=false (no success path for the route)', async () => {
    const c = fakeClient({
      translation_orders: [{ error: null }],
      // fails both the attempt and the retry
      translation_certification_audit: [{ error: { code: '23505', message: 'dup' } }, { error: { code: '23505', message: 'dup' } }],
    })
    const r = await persistCertification(c, ROWS)
    expect(r.ok).toBe(false)
    expect(r.auditErr).toContain('23505')
  })

  it('transient audit failure recovers on retry → ok=true', async () => {
    const c = fakeClient({
      translation_orders: [{ error: null }],
      translation_certification_audit: [{ error: { code: '40001', message: 'serialization' } }, { error: null }],
    })
    const r = await persistCertification(c, ROWS)
    expect(r.ok).toBe(true)
    expect(r.auditErr).toBeNull()
  })

  it('a thrown client error is caught and reported as a failure (ok=false)', async () => {
    const c = fakeClient({
      translation_orders: [{ error: null }],
      translation_certification_audit: ['throw', 'throw'],
    })
    const r = await persistCertification(c, ROWS)
    expect(r.ok).toBe(false)
    expect(r.auditErr).toContain('network down')
  })

  it('order insert failing also blocks success (ok=false)', async () => {
    const c = fakeClient({
      translation_orders: [{ error: { code: '23502', message: 'null name' } }, { error: { code: '23502', message: 'null name' } }],
      translation_certification_audit: [{ error: null }],
    })
    const r = await persistCertification(c, ROWS)
    expect(r.ok).toBe(false)
    expect(r.orderErr).toContain('23502')
  })
})
