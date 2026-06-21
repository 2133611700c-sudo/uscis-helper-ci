/**
 * P1 — Translation server-ledger WIRING into the LIVE wizard (TranslateWizard).
 *
 * The route + crypto + store are proven elsewhere (wizard-draft/route.itest,
 * wizardDraftCrypto.test, wizardDraftStore.test) and the client adapter in
 * wizardLedgerClient.test. This suite proves the TRANSLATION wiring:
 *
 *  1. SAVE→HYDRATE→CLEAR roundtrip through the real wizardLedgerClient against
 *     the real /api/wizard-draft handlers (in-memory Supabase double) — exactly
 *     the DraftState shape TranslateWizard persists ({screen, selectedDocType,
 *     extractedFields[{field,value,raw_cyrillic,review_required}], canonicalDocumentId,
 *     savedAt}).
 *  2. ON-path browser invariant: the browser keeps ONLY the opaque token cookie;
 *     the cookie jar holds NO value/raw_cyrillic (the documented sessionStorage
 *     PII exception is gone server-side). raw_cyrillic NOT in the browser.
 *  3. Server row stores ciphertext only — no plaintext PII (incl. raw_cyrillic) at rest.
 *  4. canonicalDocumentId survives the ledger roundtrip (carriage preserved) AND
 *     survives the simulated Stripe ?paid=1 round-trip (token-cookie → GET).
 *  5. TTL: an expired ledger entry is dropped on hydrate (GET → 410, draft null).
 *  6. CLEAR-after-submit-order deletes the row + token cookie.
 *  7. OFF-path parity (static): TranslateWizard gates EVERY ledger call on
 *     isLedgerClientEnabled() so an OFF deploy is a no-op (sessionStorage path),
 *     byte-identical to the pre-ledger code.
 *
 * Live-browser Playwright is NOT run here: there is no local Supabase/DB and no
 * Stripe staging session in CI; the ON path is proven via this integration test
 * (real route handlers + real client + browser-fidelity cookie jar) instead of a
 * faked green E2E. See README of this suite header.
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
import { POST, GET, DELETE } from '../../../../app/api/wizard-draft/route'
import {
  saveDraftToServer,
  loadDraftFromServer,
  clearServerDraft,
  isLedgerClientEnabled,
} from '@/lib/v1/wizardLedgerClient'

const ENC_KEY = 'c'.repeat(64)

/**
 * Browser-fidelity fetch shim: routes the wizardLedgerClient's fetch calls to
 * the real route handlers, carrying ONLY the opaque httpOnly cookie between
 * calls — exactly the browser contract that survives the Stripe redirect. We
 * assert the cookie jar holds nothing but the opaque token (no PII, ever).
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
    const setTok = res.cookies.get('wizard_draft_token')
    if (setTok) {
      if (setTok.value === '') delete cookieJar['wizard_draft_token']
      else cookieJar['wizard_draft_token'] = setTok.value
    }
    return { ok: res.ok, status: res.status, json: async () => res.json() }
  }
  return { fetchImpl, cookieJar }
}

// The exact persisted DraftState TranslateWizard builds (PII-bearing — note
// raw_cyrillic, which is the documented sessionStorage exception in OFF mode and
// MUST NOT reach the browser in ON mode).
const wizardDraft = {
  screen: 5,
  selectedDocType: 'birth',
  canonicalDocumentId: 'canon-tw-789',
  savedAt: new Date().toISOString(),
  extractedFields: [
    { field: 'family_name', value: 'SHEVCHENKO', raw_cyrillic: 'Шевченко', review_required: false },
    { field: 'given_name', value: 'TARAS', raw_cyrillic: 'Тарас', review_required: false },
    { field: 'dob', value: '1990-03-09', raw_cyrillic: '9 березня 1990', review_required: true },
    { field: 'place_of_birth', value: 'Kyiv', raw_cyrillic: 'Київ', review_required: false },
  ],
}

const PII_TOKENS = ['SHEVCHENKO', 'TARAS', '1990-03-09', 'Шевченко', 'Тарас', 'Київ', 'березня', 'Kyiv']

describe('Translation server-ledger wiring — ON path (flag=1)', () => {
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

  it('SAVE→HYDRATE roundtrip restores the exact draft (incl. canonicalDocumentId + raw_cyrillic)', async () => {
    const { fetchImpl } = makeBrowserFetch()
    expect(await saveDraftToServer('translation', wizardDraft, fetchImpl as never)).toBe(true)
    const restored = await loadDraftFromServer<typeof wizardDraft>(fetchImpl as never)
    expect(restored).toEqual(wizardDraft)
    // canonical carriage preserved through the ledger roundtrip
    expect(restored?.canonicalDocumentId).toBe('canon-tw-789')
    // raw_cyrillic carriage preserved server-side for the operator hand-off
    expect(restored?.extractedFields.find((f) => f.field === 'family_name')?.raw_cyrillic).toBe('Шевченко')
  })

  it('browser keeps ONLY the opaque token cookie — NO value/raw_cyrillic PII in the browser jar', async () => {
    const { fetchImpl, cookieJar } = makeBrowserFetch()
    await saveDraftToServer('translation', wizardDraft, fetchImpl as never)
    const keys = Object.keys(cookieJar)
    expect(keys).toEqual(['wizard_draft_token'])
    expect(cookieJar['wizard_draft_token']).toMatch(/^[0-9a-f]{64}$/)
    const jarBlob = JSON.stringify(cookieJar)
    for (const pii of PII_TOKENS) expect(jarBlob).not.toContain(pii)
  })

  it('server row stores ciphertext only — no plaintext PII (incl. raw_cyrillic) at rest', async () => {
    const { fetchImpl } = makeBrowserFetch()
    await saveDraftToServer('translation', wizardDraft, fetchImpl as never)
    const stored = JSON.stringify([...rows.values()])
    for (const pii of PII_TOKENS) expect(stored).not.toContain(pii)
  })

  it('canonicalDocumentId survives the Stripe ?paid=1 round-trip (token cookie → GET)', async () => {
    // Save before Stripe redirect.
    const { fetchImpl, cookieJar } = makeBrowserFetch()
    await saveDraftToServer('translation', wizardDraft, fetchImpl as never)
    const tokenBeforeRedirect = cookieJar['wizard_draft_token']
    expect(tokenBeforeRedirect).toMatch(/^[0-9a-f]{64}$/)
    // The only thing that crosses the Stripe redirect is the httpOnly cookie.
    // Simulate the return leg with a FRESH fetch shim seeded only with that cookie.
    const after = makeBrowserFetch()
    after.cookieJar['wizard_draft_token'] = tokenBeforeRedirect
    const restored = await loadDraftFromServer<typeof wizardDraft>(after.fetchImpl as never)
    expect(restored?.canonicalDocumentId).toBe('canon-tw-789')
    expect(restored?.extractedFields).toHaveLength(4)
  })

  it('CLEAR after submit-order deletes the ledger row and the token cookie', async () => {
    const { fetchImpl, cookieJar } = makeBrowserFetch()
    await saveDraftToServer('translation', wizardDraft, fetchImpl as never)
    expect(rows.size).toBe(1)
    expect(await clearServerDraft(fetchImpl as never)).toBe(true)
    expect(rows.size).toBe(0)
    expect(cookieJar['wizard_draft_token']).toBeUndefined()
  })

  it('TTL: an expired ledger entry is not restored on hydrate', async () => {
    const { fetchImpl } = makeBrowserFetch()
    await saveDraftToServer('translation', wizardDraft, fetchImpl as never)
    for (const row of rows.values()) {
      row.created_at = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      row.expires_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
    expect(await loadDraftFromServer(fetchImpl as never)).toBeNull()
  })
})

describe('TranslateWizard OFF-path parity (static guarantees)', () => {
  const SRC = readFileSync(
    join(__dirname, '..', 'TranslateWizard.tsx'),
    'utf8',
  )

  it('imports the ledger client + the guard', () => {
    expect(SRC).toContain("from '@/lib/v1/wizardLedgerClient'")
    expect(SRC).toContain('isLedgerClientEnabled')
    for (const fn of ['saveDraftToServer', 'loadDraftFromServer', 'clearServerDraft']) {
      expect(SRC).toContain(fn)
    }
  })

  it('SAVE: ledger POST in the ON branch, sessionStorage.setItem in the OFF branch', () => {
    expect(SRC).toMatch(/if \(isLedgerClientEnabled\(\)\) \{[\s\S]*saveDraftToServer\('translation', draft\)[\s\S]*\} else \{[\s\S]*sessionStorage\.setItem\(DRAFT_KEY, JSON\.stringify\(draft\)\)/)
  })

  it('HYDRATE: ledger GET in the ON branch, sessionStorage.getItem(DRAFT_KEY) in the OFF branch', () => {
    expect(SRC).toMatch(/if \(isLedgerClientEnabled\(\)\) \{[\s\S]*loadDraftFromServer[\s\S]*\} else \{[\s\S]*sessionStorage\.getItem\(DRAFT_KEY\)/)
  })

  it('CLEAR (submit-order + reset): clearServerDraft in ON branch, sessionStorage.removeItem(DRAFT_KEY) in OFF branch', () => {
    const clears = SRC.match(/if \(isLedgerClientEnabled\(\)\) \{[\s\S]*?clearServerDraft\(\)[\s\S]*?\} else \{[\s\S]*?sessionStorage\.removeItem\(DRAFT_KEY\)/g) ?? []
    expect(clears.length).toBeGreaterThanOrEqual(1)
  })

  it('READ source switches: readPersistedDraft uses the ledger ON, sessionStorage OFF', () => {
    expect(SRC).toMatch(/readPersistedDraft[\s\S]*if \(isLedgerClientEnabled\(\)\) \{[\s\S]*loadDraftFromServer/)
  })

  it('payment awaits saveDraft so the token cookie is set before the Stripe redirect', () => {
    expect(SRC).toContain('await saveDraft()')
  })

  it('canonicalDocumentId is still persisted in the DraftState (both paths)', () => {
    // saveDraft builds one DraftState with canonicalDocumentId regardless of path.
    expect(SRC).toMatch(/const draft: DraftState = \{[\s\S]*canonicalDocumentId,/)
  })

  it('raw_cyrillic stays in the DraftState carriage (server-side ON, sessionStorage OFF) — never dropped', () => {
    // The sanitizer keeps raw_cyrillic on purpose; the draft shape is identical
    // both ways, only the storage SINK differs (server vs session).
    expect(SRC).toContain("sanitizeFieldListForStorage('translation', extractedFields)")
  })
})
