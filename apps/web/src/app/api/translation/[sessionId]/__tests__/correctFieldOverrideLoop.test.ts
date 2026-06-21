/**
 * correctFieldOverrideLoop.test.ts — P1: dual-write wiring in the LIVE correction route.
 *
 * Proves at the ROUTE boundary:
 *   - flag OFF (default) → the canonical override helper is NEVER called; the legacy
 *     user_corrections write still happens; response canonical_loop==='off' (OFF-parity).
 *   - flag shadow + canonical_document_id present → helper called once; legacy write
 *     still happens; canonical_loop==='appended'.
 *   - flag shadow + canonical_document_id ABSENT → helper NOT called (legacy-only,
 *     fail-safe); canonical_loop==='skipped_no_id'.
 *
 * The overrideLoop helper itself is mocked (its end-to-end behaviour is covered in
 * overrideLoop.test.ts). Here we assert the route gates and calls it correctly and
 * that the legacy path is untouched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Legacy Supabase admin mock (in-memory just enough for the route) ──────────
const legacyInserts: Record<string, unknown[]> = {}

function makeAdminChain(table: string) {
  const state: { filters: Array<[string, unknown]> } = { filters: [] }
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (c: string, v: unknown) => { state.filters.push([c, v]); return chain }
  chain.update = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) })
  chain.insert = (row: unknown) => {
    legacyInserts[table] = legacyInserts[table] ?? []
    legacyInserts[table].push(row)
    return {
      select: () => ({ single: () => Promise.resolve({ data: { id: 'corr-1' }, error: null }) }),
    }
  }
  chain.single = () => {
    if (table === 'translation_sessions') return Promise.resolve({ data: { session_id: 's' }, error: null })
    if (table === 'extracted_fields') return Promise.resolve({ data: { id: 'f1', normalized_value: 'Old' }, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) => {
    if (table === 'extracted_fields') {
      resolve({ data: [{ field: 'surname', confirmed: true }], error: null })
    } else if (table === 'user_corrections') {
      resolve({ data: [], error: null })
    } else {
      resolve({ data: [], error: null })
    }
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({ from: (t: string) => makeAdminChain(t) }),
}))

// ── Override-loop helper mock (spy) ───────────────────────────────────────────
const appendSpy = vi.fn(async () => ({ ok: true as const, newVersion: 1, expectedVersion: 0 }))
vi.mock('@/lib/canonical/overrideLoop', () => ({
  appendCorrectionAsCanonicalOverride: (...args: unknown[]) => appendSpy(...(args as [])),
}))

import { POST } from '../correct-field/route'

const SESSION = '22222222-2222-2222-2222-222222222222'
const CANON = '33333333-3333-3333-3333-333333333333'

function req(body: unknown) {
  return new Request('http://test/correct-field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

function ctx() {
  return { params: Promise.resolve({ sessionId: SESSION }) }
}

describe('correct-field route — canonical override loop wiring', () => {
  const orig = process.env.CANONICAL_OVERRIDE_LOOP
  beforeEach(() => {
    appendSpy.mockClear()
    for (const k of Object.keys(legacyInserts)) delete legacyInserts[k]
  })
  afterEach(() => {
    if (orig === undefined) delete process.env.CANONICAL_OVERRIDE_LOOP
    else process.env.CANONICAL_OVERRIDE_LOOP = orig
  })

  it('OFF-parity: flag OFF → helper NOT called, legacy user_corrections write still happens', async () => {
    delete process.env.CANONICAL_OVERRIDE_LOOP
    const res = await POST(req({ field: 'surname', new_value: 'Kovalenko', canonical_document_id: CANON }), ctx())
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.canonical_loop).toBe('off')
    expect(appendSpy).not.toHaveBeenCalled()
    // legacy write unchanged
    expect(legacyInserts['user_corrections']).toHaveLength(1)
  })

  it('shadow + id present → helper called once; legacy write still happens', async () => {
    process.env.CANONICAL_OVERRIDE_LOOP = 'shadow'
    const res = await POST(req({ field: 'surname', new_value: 'Kovalenko', canonical_document_id: CANON }), ctx())
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.canonical_loop).toBe('appended')
    expect(appendSpy).toHaveBeenCalledTimes(1)
    expect(legacyInserts['user_corrections']).toHaveLength(1)
  })

  it('shadow + NO canonical_document_id → helper NOT called (legacy-only, fail-safe)', async () => {
    process.env.CANONICAL_OVERRIDE_LOOP = 'shadow'
    const res = await POST(req({ field: 'surname', new_value: 'Kovalenko' }), ctx())
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.canonical_loop).toBe('skipped_no_id')
    expect(appendSpy).not.toHaveBeenCalled()
    expect(legacyInserts['user_corrections']).toHaveLength(1)
  })
})
