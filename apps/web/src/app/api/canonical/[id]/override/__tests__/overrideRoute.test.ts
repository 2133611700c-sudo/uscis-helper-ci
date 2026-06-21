/**
 * overrideRoute.test.ts
 *
 * Tests for the HTTP override route POST/GET /api/canonical/[id]/override.
 * The persistence module is mocked — these tests prove the route's HTTP status
 * contract, INV-11 null survival, and the PII rule (override_value never logged
 * nor returned). Fixtures are synthetic and PII-free (TESTIVANENKO etc.).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { CanonicalConcurrencyError } from '@/lib/canonical/persistence/errors'

// ---------------------------------------------------------------------------
// Mock the persistence layer (no DB).
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  loadCanonicalDocumentById: vi.fn(),
  listCanonicalOverrides: vi.fn(),
  appendCanonicalOverride: vi.fn(),
  verifyCanonicalHash: vi.fn(),
}))

vi.mock('@/lib/canonical/persistence', () => ({
  loadCanonicalDocumentById: mocks.loadCanonicalDocumentById,
  listCanonicalOverrides: mocks.listCanonicalOverrides,
  appendCanonicalOverride: mocks.appendCanonicalOverride,
  verifyCanonicalHash: mocks.verifyCanonicalHash,
}))

import { POST, GET } from '../route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_ID = '11111111-1111-4111-8111-111111111111'
const SESSION = 'SESSION-TESTIVANENKO'

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/canonical/x/override', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getReq(qs = ''): NextRequest {
  return new NextRequest(`http://localhost/api/canonical/x/override${qs}`, {
    method: 'GET',
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function baseCanonical(sessionId: string | null = SESSION) {
  return {
    documentSessionId: sessionId ?? '',
    product: 'translation',
    docType: 'ua_birth_certificate',
    fields: [],
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: 'h' },
    createdAt: '2026-06-13T00:00:00Z',
    requiresReview: false,
  }
}

function oneOverride(overrideValue: string | null = 'TESTIVANENKO') {
  return {
    session_id: SESSION,
    expected_version: 0,
    overrides: [
      {
        field_key: 'family_name',
        override_value: overrideValue,
        source: 'user_edit',
        confirmed: true,
        actor: 'user',
      },
    ],
  }
}

beforeEach(() => {
  mocks.loadCanonicalDocumentById.mockReset()
  mocks.listCanonicalOverrides.mockReset()
  mocks.appendCanonicalOverride.mockReset()
  mocks.verifyCanonicalHash.mockReset()
  // sane defaults
  mocks.loadCanonicalDocumentById.mockResolvedValue(baseCanonical())
  mocks.verifyCanonicalHash.mockResolvedValue({ valid: true })
  mocks.appendCanonicalOverride.mockResolvedValue(1)
  mocks.listCanonicalOverrides.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// POST tests
// ---------------------------------------------------------------------------

describe('POST /api/canonical/[id]/override', () => {
  it('post_missing_expected_version_returns_422', async () => {
    const body = oneOverride()
    delete (body as Record<string, unknown>).expected_version
    const res = await POST(postReq(body), ctx(VALID_ID))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('CANONICAL_ID_REQUIRED')
  })

  it('post_invalid_uuid_returns_422', async () => {
    const res = await POST(postReq(oneOverride()), ctx('not-a-uuid'))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('CANONICAL_ID_REQUIRED')
    expect(json.detail).toBe('invalid UUID format')
  })

  it('post_empty_field_key_returns_422', async () => {
    const body = oneOverride()
    body.overrides[0].field_key = ''
    const res = await POST(postReq(body), ctx(VALID_ID))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('CANONICAL_ID_REQUIRED')
  })

  it('post_canonical_not_found_returns_404', async () => {
    mocks.loadCanonicalDocumentById.mockResolvedValue(null)
    const res = await POST(postReq(oneOverride()), ctx(VALID_ID))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('CANONICAL_NOT_FOUND')
  })

  it('post_session_mismatch_returns_403', async () => {
    mocks.loadCanonicalDocumentById.mockResolvedValue(baseCanonical('SOME-OTHER-SESSION'))
    const res = await POST(postReq(oneOverride()), ctx(VALID_ID))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('CANONICAL_SESSION_MISMATCH')
  })

  it('post_version_conflict_returns_409', async () => {
    mocks.appendCanonicalOverride.mockRejectedValue(
      new CanonicalConcurrencyError('OVERRIDE_VERSION_CONFLICT', {
        canonicalId: VALID_ID,
        expectedVersion: 0,
      }),
    )
    const res = await POST(postReq(oneOverride()), ctx(VALID_ID))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('OVERRIDE_VERSION_CONFLICT')
  })

  it('post_infra_error_returns_503', async () => {
    mocks.appendCanonicalOverride.mockRejectedValue(new Error('boom: network timeout'))
    const res = await POST(postReq(oneOverride()), ctx(VALID_ID))
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.error).toBe('CANONICAL_STORAGE_UNAVAILABLE')
  })

  it('post_success_returns_200_with_new_version', async () => {
    mocks.appendCanonicalOverride.mockResolvedValue(7)
    const res = await POST(postReq(oneOverride()), ctx(VALID_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, new_version: 7, applied_count: 1 })
  })

  it('post_null_override_value_is_accepted', async () => {
    const res = await POST(postReq(oneOverride(null)), ctx(VALID_ID))
    expect(res.status).toBe(200)
    // INV-11: null reached the persistence call, not dropped.
    expect(mocks.appendCanonicalOverride).toHaveBeenCalledTimes(1)
    const [, overrides, options] = mocks.appendCanonicalOverride.mock.calls[0]
    expect(overrides[0].overrideValue).toBeNull()
    expect('overrideValue' in overrides[0]).toBe(true)
    expect(options).toEqual({ expectedVersion: 0 })
  })

  it('post_does_not_log_override_value', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const SECRET = 'SECRET_VALUE_TESTIVANENKO_42'
    const res = await POST(postReq(oneOverride(SECRET)), ctx(VALID_ID))
    expect(res.status).toBe(200)
    const allLogged = [...infoSpy.mock.calls, ...logSpy.mock.calls]
      .flat()
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')
    expect(allLogged).not.toContain(SECRET)
    // but field key IS logged (PII-safe metadata)
    expect(allLogged).toContain('family_name')
  })
})

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------

describe('GET /api/canonical/[id]/override', () => {
  it('get_returns_field_keys_and_count_only', async () => {
    mocks.listCanonicalOverrides.mockResolvedValue([
      { fieldKey: 'family_name', overrideValue: 'SECRET_TESTIVANENKO', source: 'user_edit', version: 1, confirmed: true },
      { fieldKey: 'given_name', overrideValue: 'SECRET_OLENA', source: 'user_edit', version: 2, confirmed: true },
      { fieldKey: 'family_name', overrideValue: 'SECRET_AGAIN', source: 'user_edit', version: 3, confirmed: true },
    ])
    const res = await GET(getReq(`?session_id=${SESSION}`), ctx(VALID_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.canonical_document_id).toBe(VALID_ID)
    expect(json.count).toBe(3)
    expect(json.field_keys.sort()).toEqual(['family_name', 'given_name'])
    expect(json.current_version).toBe(3)
    // PII-safe: no override values anywhere in the payload
    const raw = JSON.stringify(json)
    expect(raw).not.toContain('SECRET')
    expect(raw).not.toContain('override_value')
  })
})
