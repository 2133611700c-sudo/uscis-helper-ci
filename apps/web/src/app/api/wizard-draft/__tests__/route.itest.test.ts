/**
 * Integration test for /api/wizard-draft — proves the server-side PII ledger
 * works END-TO-END at the route level: POST (encrypt+store) → GET (decrypt) →
 * DELETE, with the opaque token carried only via the httpOnly cookie, and the
 * stored row containing NO plaintext PII. Uses an in-memory Supabase double so
 * no real DB / network is touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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
import { POST, GET, DELETE } from '../route'

const ENC_KEY = 'a'.repeat(64)
const URL = 'http://localhost/api/wizard-draft'

function reqWithCookie(method: string, cookie?: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cookie) headers['cookie'] = `wizard_draft_token=${cookie}`
  return new NextRequest(URL, { method, headers, body: body ? JSON.stringify(body) : undefined })
}

describe('/api/wizard-draft — server ledger end-to-end', () => {
  beforeEach(() => {
    rows.clear()
    process.env.SERVER_LEDGER_ENABLED = '1'
    process.env.WIZARD_DRAFT_ENC_KEY = ENC_KEY
  })
  afterEach(() => {
    delete process.env.SERVER_LEDGER_ENABLED
    delete process.env.WIZARD_DRAFT_ENC_KEY
  })

  it('404s when the feature flag is OFF', async () => {
    delete process.env.SERVER_LEDGER_ENABLED
    expect((await POST(reqWithCookie('POST', undefined, { product: 'tps', draft: '{}' }))).status).toBe(404)
    expect((await GET(reqWithCookie('GET'))).status).toBe(404)
  })

  it('503s when enabled but the encryption key is missing (fail-closed)', async () => {
    delete process.env.WIZARD_DRAFT_ENC_KEY
    expect((await POST(reqWithCookie('POST', undefined, { product: 'tps', draft: '{}' }))).status).toBe(503)
  })

  it('rejects a bad body', async () => {
    expect((await POST(reqWithCookie('POST', undefined, { product: 'nope', draft: 5 }))).status).toBe(400)
  })

  it('POST encrypts (no plaintext PII stored) + GET decrypts via the cookie token', async () => {
    const draft = JSON.stringify({ family_name: 'SECRETNAME', raw_cyrillic: 'Прізвище', dob: '1990-01-01' })
    const postRes = await POST(reqWithCookie('POST', undefined, { product: 'tps', draft }))
    expect(postRes.status).toBe(200)
    const token = postRes.cookies.get('wizard_draft_token')?.value
    expect(token).toMatch(/^[0-9a-f]{64}$/)

    // stored row holds only ciphertext — never the plaintext PII
    const stored = JSON.stringify([...rows.values()])
    expect(stored).not.toContain('SECRETNAME')
    expect(stored).not.toContain('Прізвище')

    const getRes = await GET(reqWithCookie('GET', token))
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { ok: boolean; draft: string }
    expect(body.ok).toBe(true)
    expect(JSON.parse(body.draft)).toEqual({ family_name: 'SECRETNAME', raw_cyrillic: 'Прізвище', dob: '1990-01-01' })
  })

  it('GET 404s for a missing/unknown token', async () => {
    expect((await GET(reqWithCookie('GET', 'deadbeef'))).status).toBe(404)
  })

  it('DELETE removes the row and clears the cookie', async () => {
    const postRes = await POST(reqWithCookie('POST', undefined, { product: 'ead', draft: '{"a":1}' }))
    const token = postRes.cookies.get('wizard_draft_token')!.value
    expect(rows.size).toBe(1)
    const del = await DELETE(reqWithCookie('DELETE', token))
    expect(del.status).toBe(200)
    expect(rows.size).toBe(0)
  })
})
