/**
 * canonicalNotFoundContract.test.ts
 *
 * Regression suite for the not-found contract bug found by preview-enforce smoke:
 *   In enforce mode, a generate-pdf / render / packet request with a
 *   canonical_document_id that does NOT exist returned 503
 *   CANONICAL_STORAGE_UNAVAILABLE instead of the contractual 404
 *   CANONICAL_NOT_FOUND.
 *
 * Root causes (two distinct paths, both fixed):
 *   A. resolveCanonicalDocument() THREW on base not-found → route catch → 503.
 *      Fix: return null on not-found (mirror loadCanonicalDocumentById), throw
 *      ONLY on a genuine Supabase/DB error.
 *   B. verifyCanonicalHash() collapsed not-found AND query-error into
 *      { valid:false, mismatch } → packet routes returned 409 (hash mismatch).
 *      Fix: return { valid:false, notFound:true } for a missing row, THROW on a
 *      real query error; routes check notFound → 404 before the 409 branch.
 *
 * CONTRACT (binding):
 *   422 = missing id | 404 = id not found | 409 = hash mismatch
 *   403 = session mismatch | 503 = real infra failure ONLY.
 *   Never collapse not-found into 503 or 409.
 *
 * These tests drive the REAL persistence functions with a configurable Supabase
 * mock (not-found vs infra error), then assert the route status-mapping logic.
 * PII rules: synthetic ids only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Configurable Supabase mock.
//   notFoundMode  → maybeSingle resolves { data: null, error: null }
//   infraMode     → maybeSingle resolves { data: null, error: { message } }
// One shared mock state, flipped per test.
// ---------------------------------------------------------------------------

const mockState: { mode: 'not_found' | 'infra' } = { mode: 'not_found' }

function buildResponse() {
  if (mockState.mode === 'infra') {
    return { data: null, error: { message: 'connection reset by peer (simulated infra)' } }
  }
  return { data: null, error: null }
}

vi.mock('@supabase/supabase-js', () => {
  const chain = (): Record<string, unknown> => ({
    select: () => chain(),
    eq: () => chain(),
    order: () => chain(),
    limit: () => chain(),
    maybeSingle: async () => buildResponse(),
    single: async () => buildResponse(),
  })
  return { createClient: () => ({ from: () => chain() }) }
})

import {
  resolveCanonicalDocument,
  verifyCanonicalHash,
  loadCanonicalDocumentById,
} from '@/lib/canonical/persistence'

beforeEach(() => {
  mockState.mode = 'not_found'
  process.env.SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

// ---------------------------------------------------------------------------
// Persistence layer — the root cause
// ---------------------------------------------------------------------------

describe('resolveCanonicalDocument — not-found vs infra signalling', () => {
  it('returns null (NOT throw) when the base canonical does not exist', async () => {
    mockState.mode = 'not_found'
    const result = await resolveCanonicalDocument('bogus-id-does-not-exist')
    expect(result).toBeNull()
  })

  it('throws on a genuine Supabase/DB error (→ caller maps to 503)', async () => {
    mockState.mode = 'infra'
    await expect(resolveCanonicalDocument('any-id')).rejects.toThrow()
  })

  it('mirrors loadCanonicalDocumentById null behaviour for not-found', async () => {
    mockState.mode = 'not_found'
    const loaded = await loadCanonicalDocumentById('bogus-id')
    const resolved = await resolveCanonicalDocument('bogus-id')
    expect(loaded).toBeNull()
    expect(resolved).toBeNull()
  })
})

describe('verifyCanonicalHash — not-found vs infra vs mismatch signalling', () => {
  it('returns { valid:false, notFound:true } when the row does not exist', async () => {
    mockState.mode = 'not_found'
    const check = await verifyCanonicalHash('bogus-id')
    expect(check.valid).toBe(false)
    expect(check.notFound).toBe(true)
    // A missing row is NOT a hash mismatch — no mismatch string for the 409 branch
    expect(check.mismatch).toBeUndefined()
  })

  it('throws on a genuine query error (→ caller maps to 503, never 409)', async () => {
    mockState.mode = 'infra'
    await expect(verifyCanonicalHash('any-id')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Route status-mapping — mirrors the FIXED route logic for all 5 routes.
// ---------------------------------------------------------------------------

type RouteResult = { status: number; errorCode?: string }

/** Translation routes (generate-pdf, render): resolve-first, null → 404, throw → 503. */
async function simulateTranslationRoute(opts: {
  mode: string
  canonicalId: string | null
  resolve: 'null' | 'throw' | 'ok'
}): Promise<RouteResult> {
  const { mode, canonicalId, resolve } = opts
  if (mode === 'enforce' && !canonicalId) {
    return { status: 422, errorCode: 'CANONICAL_ID_REQUIRED' }
  }
  if (canonicalId && mode !== 'off') {
    try {
      const sourceCanonical = resolve === 'throw'
        ? (() => { throw new Error('infra') })()
        : resolve === 'null'
          ? null
          : ({} as Record<string, unknown>)
      if (!sourceCanonical) {
        if (mode === 'enforce') return { status: 404, errorCode: 'CANONICAL_NOT_FOUND' }
      }
    } catch {
      if (mode === 'enforce') return { status: 503, errorCode: 'CANONICAL_STORAGE_UNAVAILABLE' }
    }
  }
  return { status: 200 }
}

/** Packet routes (tps, reparole, ead): hash-first. notFound → 404, throw → 503, mismatch → 409. */
async function simulatePacketRoute(opts: {
  mode: string
  canonicalId: string | null
  hash: { valid: boolean; mismatch?: string; notFound?: boolean } | 'throw'
  resolve?: 'null' | 'throw' | 'ok'
}): Promise<RouteResult> {
  const { mode, canonicalId, hash, resolve = 'ok' } = opts
  if (mode === 'enforce' && !canonicalId) {
    return { status: 422, errorCode: 'CANONICAL_ID_REQUIRED' }
  }
  if (canonicalId && mode !== 'off') {
    let hashCheck: { valid: boolean; mismatch?: string; notFound?: boolean }
    try {
      if (hash === 'throw') throw new Error('infra')
      hashCheck = hash
    } catch {
      if (mode === 'enforce') return { status: 503, errorCode: 'CANONICAL_STORAGE_UNAVAILABLE' }
      hashCheck = { valid: false }
    }

    if (hashCheck.notFound) {
      if (mode === 'enforce') return { status: 404, errorCode: 'CANONICAL_NOT_FOUND' }
    } else if (!hashCheck.valid) {
      if (mode === 'enforce') return { status: 409, errorCode: 'CANONICAL_HASH_MISMATCH' }
    } else {
      try {
        const documentCanonical = resolve === 'throw'
          ? (() => { throw new Error('infra') })()
          : resolve === 'null'
            ? null
            : ({} as Record<string, unknown>)
        if (!documentCanonical && mode === 'enforce') {
          return { status: 404, errorCode: 'CANONICAL_NOT_FOUND' }
        }
      } catch {
        if (mode === 'enforce') return { status: 503, errorCode: 'CANONICAL_STORAGE_UNAVAILABLE' }
      }
    }
  }
  if (mode === 'enforce' && resolve === 'null') {
    // unreachable safety net in real routes; modelled for completeness
  }
  return { status: 200 }
}

describe('generate-pdf — enforce not-found → 404, infra → 503', () => {
  it('not-found id → 404 CANONICAL_NOT_FOUND', async () => {
    const r = await simulateTranslationRoute({ mode: 'enforce', canonicalId: 'bogus', resolve: 'null' })
    expect(r).toEqual({ status: 404, errorCode: 'CANONICAL_NOT_FOUND' })
  })
  it('infra throw → 503 CANONICAL_STORAGE_UNAVAILABLE', async () => {
    const r = await simulateTranslationRoute({ mode: 'enforce', canonicalId: 'x', resolve: 'throw' })
    expect(r).toEqual({ status: 503, errorCode: 'CANONICAL_STORAGE_UNAVAILABLE' })
  })
})

describe('translation/render — enforce not-found → 404, infra → 503', () => {
  it('not-found id → 404 CANONICAL_NOT_FOUND', async () => {
    const r = await simulateTranslationRoute({ mode: 'enforce', canonicalId: 'bogus', resolve: 'null' })
    expect(r).toEqual({ status: 404, errorCode: 'CANONICAL_NOT_FOUND' })
  })
  it('infra throw → 503 CANONICAL_STORAGE_UNAVAILABLE', async () => {
    const r = await simulateTranslationRoute({ mode: 'enforce', canonicalId: 'x', resolve: 'throw' })
    expect(r).toEqual({ status: 503, errorCode: 'CANONICAL_STORAGE_UNAVAILABLE' })
  })
})

describe.each([
  ['tps/generate-packet'],
  ['reparole/generate-packet'],
  ['ead/generate-packet'],
])('%s — enforce not-found precedence', (routeName) => {
  it(`${routeName}: not-found via hash check → 404, NOT 409/503`, async () => {
    const r = await simulatePacketRoute({
      mode: 'enforce',
      canonicalId: 'bogus',
      hash: { valid: false, notFound: true },
    })
    expect(r).toEqual({ status: 404, errorCode: 'CANONICAL_NOT_FOUND' })
  })

  it(`${routeName}: genuine hash mismatch → 409 (preserved)`, async () => {
    const r = await simulatePacketRoute({
      mode: 'enforce',
      canonicalId: 'x',
      hash: { valid: false, mismatch: 'stored=aabb recomputed=ccdd' },
    })
    expect(r).toEqual({ status: 409, errorCode: 'CANONICAL_HASH_MISMATCH' })
  })

  it(`${routeName}: hash-verify infra throw → 503, NOT 409`, async () => {
    const r = await simulatePacketRoute({ mode: 'enforce', canonicalId: 'x', hash: 'throw' })
    expect(r).toEqual({ status: 503, errorCode: 'CANONICAL_STORAGE_UNAVAILABLE' })
  })

  it(`${routeName}: resolve infra throw after valid hash → 503`, async () => {
    const r = await simulatePacketRoute({
      mode: 'enforce',
      canonicalId: 'x',
      hash: { valid: true },
      resolve: 'throw',
    })
    expect(r).toEqual({ status: 503, errorCode: 'CANONICAL_STORAGE_UNAVAILABLE' })
  })
})
