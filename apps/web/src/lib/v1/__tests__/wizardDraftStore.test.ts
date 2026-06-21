import { describe, it, expect } from 'vitest'
import { saveDraft, loadDraft, deleteDraft, isServerLedgerEnabled, DEFAULT_TTL_MS, type DraftDbClient } from '../wizardDraftStore'

const key = Buffer.from('a'.repeat(64), 'hex')

/** In-memory Supabase-shaped client for the chains we use. */
function memDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const client: DraftDbClient & { rows: Map<string, Record<string, unknown>> } = {
    rows,
    from() {
      return {
        upsert(row: { token: string }) { rows.set(row.token, row as Record<string, unknown>); return Promise.resolve({ error: null }) },
        select() {
          return {
            eq(_c: string, token: string) {
              return { single: () => Promise.resolve({ data: rows.get(token) ?? null, error: rows.has(token) ? null : { message: 'not found' } }) }
            },
          }
        },
        delete() { return { eq(_c: string, token: string) { rows.delete(token); return Promise.resolve({ error: null }) } } },
      }
    },
  }
  return client
}

describe('isServerLedgerEnabled — default OFF', () => {
  it('off unless SERVER_LEDGER_ENABLED=1', () => {
    expect(isServerLedgerEnabled({})).toBe(false)
    expect(isServerLedgerEnabled({ SERVER_LEDGER_ENABLED: '0' })).toBe(false)
    expect(isServerLedgerEnabled({ SERVER_LEDGER_ENABLED: '1' })).toBe(true)
  })
})

describe('wizardDraftStore — encrypted round-trip via DB', () => {
  const now = '2026-06-14T00:00:00.000Z'
  const plaintext = JSON.stringify({ family_name: 'X', raw_cyrillic: 'Прізвище', dob: '1990-01-01' })

  it('saves encrypted (no plaintext in the stored row) and loads back', async () => {
    const db = memDb()
    const { token } = await saveDraft({ db, key, product: 'tps', plaintext, nowIso: now })
    const stored = db.rows.get(token)!
    expect(JSON.stringify(stored)).not.toContain('Прізвище') // ciphertext only
    expect(stored.ciphertext).toBeTruthy()
    const loaded = await loadDraft({ db, key, token, nowMs: new Date(now).getTime() + 1000 })
    expect(loaded).toEqual({ plaintext, reason: 'ok' })
  })

  it('returns not_found for an unknown token', async () => {
    const db = memDb()
    expect(await loadDraft({ db, key, token: 'nope', nowMs: Date.parse(now) })).toEqual({ plaintext: null, reason: 'not_found' })
  })

  it('expires after TTL and deletes the row', async () => {
    const db = memDb()
    const { token } = await saveDraft({ db, key, product: 'tps', plaintext, nowIso: now, ttlMs: 1000 })
    const loaded = await loadDraft({ db, key, token, nowMs: Date.parse(now) + 2000 })
    expect(loaded.reason).toBe('expired')
    expect(db.rows.has(token)).toBe(false)
  })

  it('reuses a provided token (update path)', async () => {
    const db = memDb()
    const r1 = await saveDraft({ db, key, product: 'tps', plaintext, nowIso: now })
    const r2 = await saveDraft({ db, key, product: 'tps', plaintext: '{"v":2}', nowIso: now, token: r1.token })
    expect(r2.token).toBe(r1.token)
    expect(db.rows.size).toBe(1)
    const loaded = await loadDraft({ db, key, token: r1.token, nowMs: Date.parse(now) + 1 })
    expect(loaded.plaintext).toBe('{"v":2}')
  })

  it('deleteDraft removes the row', async () => {
    const db = memDb()
    const { token } = await saveDraft({ db, key, product: 'ead', plaintext, nowIso: now })
    await deleteDraft({ db, token })
    expect(db.rows.has(token)).toBe(false)
  })

  it('DEFAULT_TTL_MS is 24h', () => { expect(DEFAULT_TTL_MS).toBe(86400000) })
})
