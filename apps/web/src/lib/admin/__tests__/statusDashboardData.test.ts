/**
 * statusDashboardData.test.ts — the /admin/status data assembly must
 * (a) survive empty/erroring tables, (b) leak zero PII (counts/enums only),
 * (c) report the passport migration state straight from the flag.
 */
import { describe, it, expect } from 'vitest'
import { buildStatusDashboard, type DbLike } from '../statusDashboardData'

function fakeDb(opts: { fail?: boolean; auditRows?: Array<Record<string, unknown>> } = {}): DbLike {
  const result = (data: Array<Record<string, unknown>> | null, count = 0) =>
    Promise.resolve(opts.fail
      ? { data: null, count: null, error: { message: 'relation does not exist' } }
      : { data, count, error: null })
  const chain = {
    gte: () => ({ ...chain, then: result(null, 5).then.bind(result(null, 5)), order: () => ({ limit: () => result(opts.auditRows ?? []) }) }),
    order: () => ({ limit: () => result(opts.auditRows ?? []) }),
    eq: () => result(null, 0),
    in: () => result(null, 2),
    then: result(null, 5).then.bind(result(null, 5)),
  }
  return { from: () => ({ select: () => chain as never }) }
}

const NOW = '2026-06-11T12:00:00.000Z'

describe('buildStatusDashboard', () => {
  it('assembles counts on a healthy DB and reads flags from env', async () => {
    const d = await buildStatusDashboard(fakeDb(), {
      PASSPORT_SCHEMA_RENDERER_ENABLED: '', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567',
      CONFIRMED_VALUE_GUARD_MODE: 'shadow',
    }, NOW)
    expect(d.prodSha).toBe('abcdef1')
    expect(d.guardBlocks24h.total).toBe(5)
    expect(d.guardBlocks24h.perHour).toBeCloseTo(0.21, 2)
    expect(d.reviewQueue.pending).toBe(2)
    expect(d.flags.find((f) => f.name === 'CONFIRMED_VALUE_GUARD_MODE')?.value).toBe('shadow')
    expect(d.flags.find((f) => f.name === 'MIRROR_PDF_ENABLED')?.value).toBe('OFF (unset)')
  })

  it('graceful on empty/missing tables: sections carry error, nothing throws', async () => {
    const d = await buildStatusDashboard(fakeDb({ fail: true }), {}, NOW)
    expect(d.guardBlocks24h.total).toBeNull()
    expect(d.guardBlocks24h.error).toContain('relation')
    expect(d.reviewQueue.pending).toBeNull()
    expect(d.certifierAuditLast10).toEqual([])
  })

  it('passport migration state is registered (flag retired 2026-06-12)', async () => {
    const off = await buildStatusDashboard(fakeDb(), {}, NOW)
    expect(off.passportMigration.state).toBe('registered')
    const on = await buildStatusDashboard(fakeDb(), { PASSPORT_SCHEMA_RENDERER_ENABLED: '1' }, NOW)
    expect(on.passportMigration.state).toBe('registered')
  })

  it('PII guard: serialized output never contains name/value/raw keys or PII-ish content', async () => {
    const d = await buildStatusDashboard(fakeDb({
      auditRows: [{ id: 'x', created_at: NOW, doc_type: 'ua_birth_certificate', field_name: 'family_name', tier: 1, reason_code: 'document_reread' }],
    }), {}, NOW)
    const s = JSON.stringify(d)
    // (flags legitimately have a "value" key = the flag setting, not document data)
    for (const banned of ['"raw_value"', '"normalized_value"', '"contact_name"', '"email"', 'previous_value', 'new_value']) {
      expect(s, banned).not.toContain(banned)
    }
    // The audit rows themselves must carry ONLY the whitelisted PII-free columns.
    const allowed = new Set(['id', 'created_at', 'doc_type', 'field_name', 'tier', 'reason_code'])
    for (const row of d.certifierAuditLast10) {
      for (const k of Object.keys(row)) expect(allowed.has(k), `audit column ${k}`).toBe(true)
    }
    expect(d.certifierAuditLast10[0].field_name).toBe('family_name') // field NAME ok, value never
  })

  it('CI section degrades to unavailable without GITHUB_TOKEN', async () => {
    const d = await buildStatusDashboard(fakeDb(), {}, NOW)
    expect(d.ci.status).toContain('unavailable')
  })
})
