/**
 * sessionOwnership.test.ts — security regression for #184 E7 (wizard session IDOR).
 *
 * The wizard session is bound to an httpOnly cookie (wizard_anon_id) set at POST.
 * GET/PATCH must require that cookie AND scope the DB query to the matching
 * anon_user_id, so a leaked/shared session UUID can no longer read or modify
 * another browser's session. Supabase is mocked — these assert the HTTP +
 * ownership contract, not the DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

process.env.SUPABASE_URL = 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'

const h = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  eqCalls: [] as Array<[string, unknown]>,
  fromCalls: [] as string[],
}))

vi.mock('@supabase/supabase-js', () => {
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    from: (t: string) => { h.fromCalls.push(t); return b },
    insert: () => b,
    select: () => b,
    update: () => b,
    eq: (col: string, val: unknown) => { h.eqCalls.push([col, val]); return b },
    single: async () => h.result,
    maybeSingle: async () => h.result,
  })
  return { createClient: () => b }
})

import { GET, PATCH, POST } from '../route'

const OWNER_A = '11111111-1111-4111-8111-111111111111'
const OWNER_B = '22222222-2222-4222-8222-222222222222'
const SID = '33333333-3333-4333-8333-333333333333'

let ipN = 0
const ip = () => { ipN += 1; return `198.51.100.${ipN}` }

function getReq(id: string, cookie?: string): NextRequest {
  const headers: Record<string, string> = { 'x-forwarded-for': ip() }
  if (cookie) headers.cookie = `wizard_anon_id=${cookie}`
  return new NextRequest(`http://localhost/api/wizard/session?id=${id}`, { method: 'GET', headers })
}
function patchReq(body: unknown, cookie?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip() }
  if (cookie) headers.cookie = `wizard_anon_id=${cookie}`
  return new NextRequest('http://localhost/api/wizard/session', { method: 'PATCH', headers, body: JSON.stringify(body) })
}

describe('#184 E7 — wizard session ownership', () => {
  beforeEach(() => { h.result = { data: null, error: null }; h.eqCalls = []; h.fromCalls = [] })

  it('GET without the owner cookie → 404 and never queries the DB', async () => {
    const res = await GET(getReq(SID))
    expect(res.status).toBe(404)
    expect(h.fromCalls).toHaveLength(0)
  })

  it('GET with cookie scopes the query to id AND anon_user_id (no cross-tenant read)', async () => {
    h.result = { data: { id: SID, locale: 'en', current_step: 0, state_json: {} }, error: null }
    const res = await GET(getReq(SID, OWNER_A))
    expect(res.status).toBe(200)
    expect(h.eqCalls).toContainEqual(['id', SID])
    expect(h.eqCalls).toContainEqual(['anon_user_id', OWNER_A])
  })

  it("GET for another browser's session UUID with the wrong owner → 404 (filtered, no leak)", async () => {
    h.result = { data: null, error: { code: 'PGRST116' } } // 0 rows for id+OWNER_B
    const res = await GET(getReq(SID, OWNER_B))
    expect(res.status).toBe(404)
    expect(h.eqCalls).toContainEqual(['anon_user_id', OWNER_B])
  })

  it('PATCH without the owner cookie → 404 and never writes', async () => {
    const res = await PATCH(patchReq({ session_id: SID, current_step: 2 }))
    expect(res.status).toBe(404)
    expect(h.fromCalls).toHaveLength(0)
  })

  it('PATCH whose id+owner matches no row → 404 (cannot modify someone else)', async () => {
    h.result = { data: null, error: null } // maybeSingle → no row
    const res = await PATCH(patchReq({ session_id: SID, current_step: 2 }, OWNER_B))
    expect(res.status).toBe(404)
    expect(h.eqCalls).toContainEqual(['anon_user_id', OWNER_B])
  })

  it('POST binds ownership by setting the httpOnly wizard_anon_id cookie', async () => {
    h.result = { data: { id: SID, anon_user_id: OWNER_A, locale: 'en', service_slug: 'tps-ukraine', current_step: 0, created_at: 't' }, error: null }
    const res = await POST(new NextRequest('http://localhost/api/wizard/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() },
      body: JSON.stringify({ locale: 'en', service_slug: 'tps-ukraine', anon_user_id: OWNER_A }),
    }))
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain('wizard_anon_id=')
    expect(setCookie.toLowerCase()).toContain('httponly')
  })
})
