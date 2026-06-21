import { describe, it, expect, vi } from 'vitest'
import {
  isLedgerClientEnabled,
  saveDraftToServer,
  loadDraftFromServer,
  clearServerDraft,
} from '../wizardLedgerClient'

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const notOk = (status = 404) => ({ ok: false, status, json: async () => ({}) })

describe('isLedgerClientEnabled — default OFF', () => {
  it('off unless NEXT_PUBLIC_SERVER_LEDGER_ENABLED=1', () => {
    expect(isLedgerClientEnabled({})).toBe(false)
    expect(isLedgerClientEnabled({ NEXT_PUBLIC_SERVER_LEDGER_ENABLED: '0' })).toBe(false)
    expect(isLedgerClientEnabled({ NEXT_PUBLIC_SERVER_LEDGER_ENABLED: '1' })).toBe(true)
  })
})

describe('saveDraftToServer', () => {
  it('POSTs the product + JSON-stringified draft and returns true on ok', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.product).toBe('tps')
      expect(JSON.parse(body.draft)).toEqual({ a: 1 })
      return okJson({ ok: true })
    })
    expect(await saveDraftToServer('tps', { a: 1 }, f as never)).toBe(true)
    expect(f).toHaveBeenCalledWith('/api/wizard-draft', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }))
  })
  it('returns false on non-ok and never throws on network error', async () => {
    expect(await saveDraftToServer('ead', {}, (async () => notOk(503)) as never)).toBe(false)
    expect(await saveDraftToServer('ead', {}, (async () => { throw new Error('net') }) as never)).toBe(false)
  })
})

describe('loadDraftFromServer', () => {
  it('returns the parsed draft on ok', async () => {
    const f = (async () => okJson({ ok: true, draft: JSON.stringify({ x: 2 }) })) as never
    expect(await loadDraftFromServer(f)).toEqual({ x: 2 })
  })
  it('returns null on not-found / malformed / network error', async () => {
    expect(await loadDraftFromServer((async () => notOk(404)) as never)).toBeNull()
    expect(await loadDraftFromServer((async () => okJson({ ok: false })) as never)).toBeNull()
    expect(await loadDraftFromServer((async () => { throw new Error('net') }) as never)).toBeNull()
  })
})

describe('clearServerDraft', () => {
  it('DELETEs and returns ok', async () => {
    const f = vi.fn(async () => okJson({ ok: true }))
    expect(await clearServerDraft(f as never)).toBe(true)
    expect(f).toHaveBeenCalledWith('/api/wizard-draft', expect.objectContaining({ method: 'DELETE' }))
  })
})
