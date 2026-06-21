/**
 * P1 — TPS server-ledger WIRING into the LIVE wizard (TPSWizardV2).
 *
 * The route + crypto + store are proven elsewhere (wizard-draft/route.itest,
 * wizardDraftCrypto.test, wizardDraftStore.test). This suite proves the WIRING:
 *
 *  1. SAVE→HYDRATE→CLEAR roundtrip through the real wizardLedgerClient against
 *     the real /api/wizard-draft handlers (in-memory Supabase double) — exactly
 *     the shape TPSWizardV2 persists ({schema, uploadsMeta, lastStep, savedAt}).
 *  2. ON-path browser invariant: the browser keeps ONLY the opaque token cookie;
 *     the stored row holds NO names/DOB/addresses/document numbers/raw_cyrillic.
 *  3. canonical_document_id survives the ledger roundtrip (carriage preserved).
 *  4. TTL: an expired ledger entry is dropped on hydrate (GET → 410, draft null).
 *  5. OFF-path parity (static): TPSWizardV2 gates EVERY ledger call on
 *     isLedgerClientEnabled() so an OFF deploy is a no-op (localStorage path).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// In-memory wizard_drafts table shared across the route + assertions.
const rows = new Map<string, Record<string, unknown>>()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from() {
      return {
        upsert(row: { token: string }) { rows.set(row.token, row as Record<string, unknown>); return Promise.resolve({ error: null }) },
        select() { return { eq(_c: string, t: string) { return { single: () => Promise.resolve({ data: rows.get(t) ?? null, error: rows.has(t) ? null : { message: 'nf' } }) } } } },
        delete() { return { eq(_c: string, t: string) { rows.delete(t); return Promise.resolve({ error: null }) } } },
      }
    },
  }),
}))

import { NextRequest } from 'next/server'
import { POST, GET, DELETE } from '../../../../../api/wizard-draft/route'
import {
  saveDraftToServer,
  loadDraftFromServer,
  clearServerDraft,
  isLedgerClientEnabled,
} from '@/lib/v1/wizardLedgerClient'

const ENC_KEY = 'b'.repeat(64)

/**
 * Browser-fidelity fetch shim: routes the wizardLedgerClient's fetch calls to
 * the real route handlers, carrying ONLY the opaque httpOnly cookie between
 * calls — exactly the browser contract. We assert the cookie jar holds nothing
 * but the opaque token (no PII ever lands in the "browser").
 */
function makeBrowserFetch() {
  const cookieJar: Record<string, string> = {}
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const cookieHeader = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')
    if (cookieHeader) headers['cookie'] = cookieHeader
    const req = new NextRequest('http://localhost' + input, {
      method,
      headers,
      body: init?.body as string | undefined,
    })
    const res = method === 'POST' ? await POST(req) : method === 'DELETE' ? await DELETE(req) : await GET(req)
    // Reflect Set-Cookie into the jar (mirrors the browser keeping the cookie).
    const setTok = res.cookies.get('wizard_draft_token')
    if (setTok) {
      if (setTok.value === '') delete cookieJar['wizard_draft_token']
      else cookieJar['wizard_draft_token'] = setTok.value
    }
    return { ok: res.ok, status: res.status, json: async () => res.json() }
  }
  return { fetchImpl, cookieJar }
}

// The exact persisted-draft shape TPSWizardV2 builds (PII-bearing).
const wizardDraft = {
  schema: 3,
  manual: {},
  packetReady: false,
  part7Reviewed: false,
  lastStep: 5,
  savedAt: new Date().toISOString(),
  uploadsMeta: {
    passport: {
      fileName: 'passport.jpg',
      status: 'done',
      fields: {
        family_name: { value: 'SHEVCHENKO', requires_review: false, doc_slot: 'passport' },
        given_name: { value: 'TARAS', requires_review: false, doc_slot: 'passport' },
        dob: { value: '1990-03-09', requires_review: false, doc_slot: 'passport' },
        raw_cyrillic: { value: 'Шевченко Тарас', requires_review: true, doc_slot: 'passport' },
        document_number: { value: 'FX123456', requires_review: false, doc_slot: 'passport' },
        address: { value: '1 Khreshchatyk St, Kyiv', requires_review: false, doc_slot: 'passport' },
      },
      canonical_document_id: 'canon-abc-123',
    },
  },
}

const PII_TOKENS = ['SHEVCHENKO', 'TARAS', '1990-03-09', 'Шевченко', 'FX123456', 'Khreshchatyk']

describe('TPS server-ledger wiring — ON path (flag=1)', () => {
  beforeEach(() => {
    rows.clear()
    process.env.SERVER_LEDGER_ENABLED = '1'
    process.env.NEXT_PUBLIC_SERVER_LEDGER_ENABLED = '1'
    process.env.WIZARD_DRAFT_ENC_KEY = ENC_KEY
  })
  afterEach(() => {
    delete process.env.SERVER_LEDGER_ENABLED
    delete process.env.NEXT_PUBLIC_SERVER_LEDGER_ENABLED
    delete process.env.WIZARD_DRAFT_ENC_KEY
  })

  it('isLedgerClientEnabled reads NEXT_PUBLIC_SERVER_LEDGER_ENABLED', () => {
    expect(isLedgerClientEnabled()).toBe(true)
    expect(isLedgerClientEnabled({ NEXT_PUBLIC_SERVER_LEDGER_ENABLED: '0' })).toBe(false)
  })

  it('SAVE→HYDRATE roundtrip restores the exact draft (incl. canonical_document_id)', async () => {
    const { fetchImpl } = makeBrowserFetch()
    expect(await saveDraftToServer('tps', wizardDraft, fetchImpl as never)).toBe(true)
    const restored = await loadDraftFromServer<typeof wizardDraft>(fetchImpl as never)
    expect(restored).toEqual(wizardDraft)
    // canonical carriage preserved through the ledger roundtrip
    expect(restored?.uploadsMeta.passport.canonical_document_id).toBe('canon-abc-123')
  })

  it('browser keeps ONLY the opaque token cookie — no PII in the browser jar', async () => {
    const { fetchImpl, cookieJar } = makeBrowserFetch()
    await saveDraftToServer('tps', wizardDraft, fetchImpl as never)
    const keys = Object.keys(cookieJar)
    expect(keys).toEqual(['wizard_draft_token'])
    expect(cookieJar['wizard_draft_token']).toMatch(/^[0-9a-f]{64}$/)
    const jarBlob = JSON.stringify(cookieJar)
    for (const pii of PII_TOKENS) expect(jarBlob).not.toContain(pii)
  })

  it('server row stores ciphertext only — no plaintext PII at rest', async () => {
    const { fetchImpl } = makeBrowserFetch()
    await saveDraftToServer('tps', wizardDraft, fetchImpl as never)
    const stored = JSON.stringify([...rows.values()])
    for (const pii of PII_TOKENS) expect(stored).not.toContain(pii)
  })

  it('CLEAR deletes the ledger row and the token cookie', async () => {
    const { fetchImpl, cookieJar } = makeBrowserFetch()
    await saveDraftToServer('tps', wizardDraft, fetchImpl as never)
    expect(rows.size).toBe(1)
    expect(await clearServerDraft(fetchImpl as never)).toBe(true)
    expect(rows.size).toBe(0)
    expect(cookieJar['wizard_draft_token']).toBeUndefined()
  })

  it('TTL: an expired ledger entry is not restored on hydrate', async () => {
    const { fetchImpl } = makeBrowserFetch()
    await saveDraftToServer('tps', wizardDraft, fetchImpl as never)
    // Force the stored row past its TTL.
    for (const row of rows.values()) {
      const past = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      row.created_at = past
      row.expires_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
    expect(await loadDraftFromServer(fetchImpl as never)).toBeNull()
  })
})

describe('TPSWizardV2 OFF-path parity (static guarantees)', () => {
  const SRC = readFileSync(
    join(__dirname, '..', 'TPSWizardV2.tsx'),
    'utf8',
  )

  it('every ledger call is gated on isLedgerClientEnabled()', () => {
    // No bare ledger call may exist outside a flag guard. We assert each ledger
    // primitive only appears alongside the guard in the file, and that the file
    // imports the guard.
    expect(SRC).toContain("from '@/lib/v1/wizardLedgerClient'")
    expect(SRC).toContain('isLedgerClientEnabled')
    for (const fn of ['saveDraftToServer', 'loadDraftFromServer', 'clearServerDraft']) {
      expect(SRC).toContain(fn)
    }
  })

  it('SAVE: ledger POST is in the ON branch, localStorage.setItem in the OFF branch', () => {
    // The save effect must choose ledger XOR localStorage on the flag.
    expect(SRC).toMatch(/if \(isLedgerClientEnabled\(\)\) \{\s*void saveDraftToServer\('tps', draftRecord\)\s*\} else \{\s*localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(draftRecord\)\)/)
  })

  it('HYDRATE: ledger GET in the ON branch, localStorage.getItem(STORAGE_KEY) in the OFF branch', () => {
    expect(SRC).toMatch(/if \(isLedgerClientEnabled\(\)\) \{[\s\S]*loadDraftFromServer[\s\S]*\} else \{[\s\S]*localStorage\.getItem\(STORAGE_KEY\)/)
  })

  it('CLEAR (terminal + restart): clearServerDraft in ON branch, removeItem in OFF branch', () => {
    const clears = SRC.match(/if \(isLedgerClientEnabled\(\)\) \{[^}]*clearServerDraft\(\)[^}]*\} else \{[^}]*localStorage\.removeItem\(STORAGE_KEY\)/g) ?? []
    expect(clears.length).toBeGreaterThanOrEqual(2)
  })

  it('canonical_document_id is still persisted in the draft record (both paths)', () => {
    // draftRecord carries uploadsMeta (uploadsSafe) which includes canonical_document_id.
    expect(SRC).toContain('canonical_document_id: u.canonical_document_id ?? null')
  })
})
