/**
 * canonicalPersistence.test.ts
 *
 * Unit tests for the canonical persistence layer (18 required tests).
 * Mocks @supabase/supabase-js — no real DB connection needed.
 *
 * Security invariants tested:
 *   INV-11: finalValue=null must never be converted to undefined on load.
 *   INV-12: No silent fallbacks — overrides applied in explicit order.
 *
 * Hash sentinel:
 *   finalValue=undefined must hash differently from finalValue=null
 *   (they represent different states: C3-not-run vs C3-rejected).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Supabase mock setup
// ---------------------------------------------------------------------------

// We need to intercept Supabase builder chains at each step.
// The mock uses a queue of responses so each call to `from()` pops one response.

type MockResponse = { data: unknown; error: unknown }

// Per-table response queues
const mockResponses: Map<string, MockResponse[]> = new Map()

function queueResponse(table: string, response: MockResponse) {
  if (!mockResponses.has(table)) mockResponses.set(table, [])
  mockResponses.get(table)!.push(response)
}

function dequeueResponse(table: string): MockResponse {
  const queue = mockResponses.get(table) ?? []
  const response = queue.shift()
  if (!response) {
    return { data: null, error: null }
  }
  return response
}

// Build a chainable mock that resolves at the terminal method (single / maybeSingle / then)
function makeChain(table: string) {
  const chain: Record<string, unknown> = {}

  const terminal = {
    then: (resolve: (v: MockResponse) => void) => {
      resolve(dequeueResponse(table))
    },
  }

  // All builder methods return `chain` to allow chaining
  const methods = ['select', 'insert', 'upsert', 'eq', 'order', 'limit', 'in', 'is']
  for (const m of methods) {
    chain[m] = (..._args: unknown[]) => chain
  }

  chain['single'] = () => Promise.resolve(dequeueResponse(table))
  chain['maybeSingle'] = () => Promise.resolve(dequeueResponse(table))

  // Make chain itself thenable so `await supabase.from(...).insert(...)` works
  chain['then'] = terminal.then

  return chain
}

const mockFrom = vi.fn((table: string) => makeChain(table))
const mockRpc = vi.fn((_fn: string, _args: unknown) =>
  Promise.resolve({ data: 1, error: null })
)

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

// Set env vars before importing the module under test
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import {
  persistCanonicalDocument,
  loadCanonicalDocumentById,
  resolveCanonicalDocument,
  verifyCanonicalHash,
  computeResultHash,
  computeFieldsHash,
  computeResolvedHash,
  getEffectiveValue,
  appendCanonicalOverride,
  FINAL_VALUE_UNDEFINED_SENTINEL,
  type CanonicalOverride,
} from '../index'
import type { CanonicalDocumentResult, CanonicalField } from '../../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<CanonicalField> = {}): CanonicalField {
  return {
    key: 'first_name',
    rawValue: 'OLENA',
    rawCyrillic: 'Олена',
    normalizedValue: 'Olena',
    finalValue: 'Olena',
    criticality: 'critical',
    confidence: {
      ocr: 0.95,
      field_match: 0.9,
      normalization: 0.9,
      source_match: null,
      final: 0.9,
    },
    source: 'document_ocr',
    reviewRequired: false,
    reviewReasons: [],
    evidence: [
      { value: 'OLENA', source: 'document_ocr', confidence: 0.95, provider: 'gemini' },
    ],
    ...overrides,
  }
}

function makeResult(
  overrides: Partial<CanonicalDocumentResult> = {}
): CanonicalDocumentResult {
  return {
    documentSessionId: 'sess-abc',
    product: 'translation',
    docType: 'birth_certificate',
    fields: [makeField()],
    hashes: { uploadHash: null, normalizedImageHash: null, canonicalResultHash: null },
    createdAt: '2026-06-13T00:00:00.000Z',
    requiresReview: false,
    ...overrides,
  }
}

/** Build a mock DB row (simulates what Supabase stores + returns). */
function makeDbRow(result: CanonicalDocumentResult, id = 'uuid-1') {
  const fields_json = result.fields.map((f) => ({
    ...f,
    finalValue:
      f.finalValue === undefined ? FINAL_VALUE_UNDEFINED_SENTINEL : f.finalValue,
  }))
  return {
    id,
    session_id: 'sess-abc',
    document_session_id: result.documentSessionId,
    product: result.product,
    doc_type: result.docType,
    fields_json,
    result_hash: computeResultHash(result),
    fields_hash: computeFieldsHash(result),
    created_at: result.createdAt,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResponses.clear()
  // Reset mockFrom to use the fresh response queues
  mockFrom.mockImplementation((table: string) => makeChain(table))
  // Default RPC mock: success, returns version 1
  mockRpc.mockResolvedValue({ data: 1, error: null })
})

// ---------------------------------------------------------------------------
// Test 1: persistCanonicalDocument inserts row with correct hashes
// ---------------------------------------------------------------------------

describe('Test 1: persistCanonicalDocument upserts row with correct hashes', () => {
  it('upserts a row and returns correct hashes', async () => {
    const result = makeResult()
    const expectedResultHash = computeResultHash(result)
    const expectedFieldsHash = computeFieldsHash(result)

    // Queue: single() call returns the upserted row (id + both hashes)
    queueResponse('canonical_documents', {
      data: { id: 'uuid-1', fields_hash: expectedFieldsHash, result_hash: expectedResultHash },
      error: null,
    })

    const ret = await persistCanonicalDocument(result, 'sess-abc')

    expect(ret.id).toBe('uuid-1')
    expect(ret.resultHash).toBe(expectedResultHash)
    expect(ret.fieldsHash).toBe(expectedFieldsHash)
    expect(mockFrom).toHaveBeenCalledWith('canonical_documents')
  })
})

// ---------------------------------------------------------------------------
// Test 2: Hash is deterministic (same input → same hash)
// ---------------------------------------------------------------------------

describe('Test 2: Hash is deterministic', () => {
  it('produces identical hashes for the same CanonicalDocumentResult', () => {
    const result = makeResult()
    expect(computeResultHash(result)).toBe(computeResultHash(result))
    expect(computeFieldsHash(result)).toBe(computeFieldsHash(result))
  })
})

// ---------------------------------------------------------------------------
// Test 3: fields_hash sentinel — undefined hashes differently from null and string
// ---------------------------------------------------------------------------

describe('Test 3: fields_hash sentinel', () => {
  it('undefined hashes differently from null (INV-11 sentinel proof)', () => {
    const withUndefined = makeResult({ fields: [makeField({ finalValue: undefined })] })
    const withNull = makeResult({ fields: [makeField({ finalValue: null })] })
    expect(computeFieldsHash(withUndefined)).not.toBe(computeFieldsHash(withNull))
  })

  it('undefined hashes differently from string value', () => {
    const withUndefined = makeResult({ fields: [makeField({ finalValue: undefined })] })
    const withString = makeResult({ fields: [makeField({ finalValue: 'Olena' })] })
    expect(computeFieldsHash(withUndefined)).not.toBe(computeFieldsHash(withString))
  })

  it('null hashes differently from string value', () => {
    const withNull = makeResult({ fields: [makeField({ finalValue: null })] })
    const withString = makeResult({ fields: [makeField({ finalValue: 'Olena' })] })
    expect(computeFieldsHash(withNull)).not.toBe(computeFieldsHash(withString))
  })

  it('undefined sentinel string in hash input equals __UNDEFINED__ constant', () => {
    // Verifies the sentinel constant is exactly what we expect
    expect(FINAL_VALUE_UNDEFINED_SENTINEL).toBe('__UNDEFINED__')
  })
})

// ---------------------------------------------------------------------------
// Test 4: fields_hash changes when finalValue changes
// ---------------------------------------------------------------------------

describe('Test 4: fields_hash changes when finalValue changes', () => {
  it('different finalValues produce different hashes', () => {
    const r1 = makeResult({ fields: [makeField({ finalValue: 'Olena' })] })
    const r2 = makeResult({ fields: [makeField({ finalValue: 'Elena' })] })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
  })
})

// ---------------------------------------------------------------------------
// Test 5: fields_hash changes when reviewRequired changes
// ---------------------------------------------------------------------------

describe('Test 5: fields_hash changes when reviewRequired changes', () => {
  it('different reviewRequired values produce different hashes', () => {
    const r1 = makeResult({ fields: [makeField({ reviewRequired: false })] })
    const r2 = makeResult({ fields: [makeField({ reviewRequired: true })] })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
  })
})

// ---------------------------------------------------------------------------
// Test 6: fields_hash does NOT change when rawValue changes
// ---------------------------------------------------------------------------

describe('Test 6: fields_hash v2 covers full provenance (tamper-evident)', () => {
  // v2 (FIELDS_HASH_SCHEMA_VERSION) binds the full security-relevant field shape.
  // Each of these mutations MUST change the hash — otherwise provenance is unprotected.
  it('rawValue tampering changes the hash', () => {
    const r1 = makeResult({ fields: [makeField({ rawValue: 'OLENA' })] })
    const r2 = makeResult({ fields: [makeField({ rawValue: 'ОЛЕНА' })] })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
  })

  it('normalizedValue tampering changes the hash', () => {
    const r1 = makeResult({ fields: [makeField({ normalizedValue: 'Olena' })] })
    const r2 = makeResult({ fields: [makeField({ normalizedValue: 'Elena' })] })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
  })

  it('source tampering changes the hash', () => {
    const r1 = makeResult({ fields: [makeField({ source: 'document_ocr' })] })
    const r2 = makeResult({ fields: [makeField({ source: 'manual_user_entry' })] })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
  })

  it('evidence tampering changes the hash', () => {
    const r1 = makeResult({
      fields: [makeField({ evidence: [{ value: 'OLENA', source: 'document_ocr', confidence: 0.95, provider: 'gemini' }] })],
    })
    const r2 = makeResult({
      fields: [makeField({ evidence: [{ value: 'HACKED', source: 'document_ocr', confidence: 0.95, provider: 'gemini' }] })],
    })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
  })

  it('knowledgeProvenance tampering changes the hash', () => {
    const r1 = makeResult({ fields: [makeField({ knowledgeProvenance: 'kmu55' })] })
    const r2 = makeResult({ fields: [makeField({ knowledgeProvenance: 'gazetteer_exact' })] })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
  })

  it('docType / product identity tampering changes the hash', () => {
    const r1 = makeResult({ product: 'translation', docType: 'birth_certificate' })
    const r2 = makeResult({ product: 'tps', docType: 'birth_certificate' })
    const r3 = makeResult({ product: 'translation', docType: 'marriage_certificate' })
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r2))
    expect(computeFieldsHash(r1)).not.toBe(computeFieldsHash(r3))
  })

  it('evidence order does not affect hash (deterministic serialization)', () => {
    const e1 = { value: 'A', source: 'document_ocr' as const, confidence: 0.9, provider: 'g' }
    const e2 = { value: 'B', source: 'document_ocr' as const, confidence: 0.8, provider: 'v' }
    const r1 = makeResult({ fields: [makeField({ evidence: [e1, e2] })] })
    const r2 = makeResult({ fields: [makeField({ evidence: [e2, e1] })] })
    expect(computeFieldsHash(r1)).toBe(computeFieldsHash(r2))
  })
})

// ---------------------------------------------------------------------------
// Test 7: resolved_hash changes when override added vs no override
// ---------------------------------------------------------------------------

describe('Test 7: resolved_hash changes when override added', () => {
  it('no overrides vs one override produce different resolved hashes', () => {
    const baseFieldsHash = 'aabbccdd' + '0'.repeat(56)
    const noOverrides: CanonicalOverride[] = []
    const withOverride: CanonicalOverride[] = [
      {
        fieldKey: 'first_name',
        overrideValue: 'Olena',
        source: 'user_edit',
        createdAt: '2026-06-13T01:00:00Z',
      },
    ]
    expect(computeResolvedHash(baseFieldsHash, noOverrides)).not.toBe(
      computeResolvedHash(baseFieldsHash, withOverride)
    )
  })
})

// ---------------------------------------------------------------------------
// Test 8: resolved_hash is stable — same overrides, same order → same hash
// ---------------------------------------------------------------------------

describe('Test 8: resolved_hash is stable', () => {
  it('same overrides in same order produce identical resolved hashes', () => {
    const baseFieldsHash = 'aabbccdd' + '0'.repeat(56)
    const overrides: CanonicalOverride[] = [
      {
        fieldKey: 'first_name',
        overrideValue: 'Olena',
        source: 'user_edit',
        createdAt: '2026-06-13T01:00:00Z',
      },
    ]
    expect(computeResolvedHash(baseFieldsHash, overrides)).toBe(
      computeResolvedHash(baseFieldsHash, overrides)
    )
  })
})

// ---------------------------------------------------------------------------
// Test 9: loadCanonicalDocumentById returns null when not found
// ---------------------------------------------------------------------------

describe('Test 9: loadCanonicalDocumentById returns null when not found', () => {
  it('returns null for non-existent id', async () => {
    queueResponse('canonical_documents', { data: null, error: null })

    const result = await loadCanonicalDocumentById('non-existent-id')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Test 10: loadCanonicalDocumentById — finalValue=null preserved (INV-11)
// ---------------------------------------------------------------------------

describe('Test 10: INV-11 — finalValue=null preserved on load', () => {
  it('finalValue=null in DB loads as null, not undefined', async () => {
    const original = makeResult({
      fields: [makeField({ finalValue: null })],
    })
    const row = makeDbRow(original)

    queueResponse('canonical_documents', { data: row, error: null })

    const loaded = await loadCanonicalDocumentById('uuid-1')
    expect(loaded).not.toBeNull()
    const field = loaded!.fields[0]
    // Must be explicitly null, not undefined
    expect(field.finalValue).toBeNull()
    expect(field.finalValue).not.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Test 11: loadCanonicalDocumentById — undefined sentinel restored correctly
// ---------------------------------------------------------------------------

describe('Test 11: undefined sentinel restored on load', () => {
  it('finalValue=__UNDEFINED__ in DB loads as undefined (C3 not run)', async () => {
    const original = makeResult({
      fields: [makeField({ finalValue: undefined })],
    })
    const row = makeDbRow(original)
    // Verify the row actually has the sentinel string
    expect(row.fields_json[0].finalValue).toBe(FINAL_VALUE_UNDEFINED_SENTINEL)

    queueResponse('canonical_documents', { data: row, error: null })

    const loaded = await loadCanonicalDocumentById('uuid-1')
    expect(loaded).not.toBeNull()
    const field = loaded!.fields[0]
    // Must be undefined (C3 did not run), not null (C3 rejected) or '__UNDEFINED__'
    expect(field.finalValue).toBeUndefined()
    expect(field.finalValue).not.toBeNull()
    expect(field.finalValue).not.toBe(FINAL_VALUE_UNDEFINED_SENTINEL)
  })
})

// ---------------------------------------------------------------------------
// Test 12: resolveCanonicalDocument applies overrides in created_at order (last wins)
// ---------------------------------------------------------------------------

describe('Test 12: resolveCanonicalDocument — last override per field wins', () => {
  it('applies overrides sorted by created_at, last wins per field_key', async () => {
    const original = makeResult({
      fields: [makeField({ key: 'first_name', finalValue: 'Olena' })],
    })
    const row = makeDbRow(original)

    const overrideRows = [
      {
        id: 'ov-1',
        canonical_id: 'uuid-1',
        field_key: 'first_name',
        override_value: 'Elena',
        source: 'user_edit',
        reason: null,
        version: 1,
        supersedes_id: null,
        confirmed: true,
        actor: 'user',
        original_rejection_reasons: null,
        created_at: '2026-06-13T01:00:00Z',
      },
      {
        id: 'ov-2',
        canonical_id: 'uuid-1',
        field_key: 'first_name',
        override_value: 'Olena-final',
        source: 'certifier_override',
        reason: 'corrected spelling',
        version: 2,
        supersedes_id: 'ov-1',
        confirmed: true,
        actor: 'certifier',
        original_rejection_reasons: null,
        created_at: '2026-06-13T02:00:00Z',
      },
    ]

    // Call 1: loadCanonicalDocumentById → canonical_documents
    queueResponse('canonical_documents', { data: row, error: null })
    // Call 2: listCanonicalOverrides → canonical_overrides (returns array directly via .order())
    // We need to handle the list query differently — it does not use maybeSingle/single
    // The mock needs to handle the case where the chain itself is awaited
    queueResponse('canonical_overrides', { data: overrideRows, error: null })

    const resolved = await resolveCanonicalDocument('uuid-1')
    expect(resolved).not.toBeNull()
    const field = resolved!.fields.find((f) => f.key === 'first_name')
    expect(field).toBeDefined()
    // Last confirmed override wins (ov-2)
    expect(field!.finalValue).toBe('Olena-final')
    expect(field!.source).toBe('certifier_override')
    expect(field!.reviewRequired).toBe(false)
    // rawValue preserved from base (audit trail)
    expect(field!.rawValue).toBe('OLENA')
  })
})

// ---------------------------------------------------------------------------
// Test 13: resolveCanonicalDocument — null override_value → field.finalValue=null (INV-11)
// ---------------------------------------------------------------------------

describe('Test 13: resolveCanonicalDocument — null override preserves INV-11', () => {
  it('null override_value sets finalValue=null (explicit C3 reject)', async () => {
    const original = makeResult({
      fields: [makeField({ key: 'first_name', finalValue: 'Olena' })],
    })
    const row = makeDbRow(original)

    const overrideRows = [
      {
        id: 'ov-3',
        canonical_id: 'uuid-1',
        field_key: 'first_name',
        override_value: null,
        source: 'system_correction',
        reason: 'rejected by certifier',
        version: 1,
        supersedes_id: null,
        confirmed: true,
        actor: 'system',
        original_rejection_reasons: ['low_confidence'],
        created_at: '2026-06-13T03:00:00Z',
      },
    ]

    queueResponse('canonical_documents', { data: row, error: null })
    queueResponse('canonical_overrides', { data: overrideRows, error: null })

    const resolved = await resolveCanonicalDocument('uuid-1')
    expect(resolved).not.toBeNull()
    const field = resolved!.fields.find((f) => f.key === 'first_name')
    expect(field).toBeDefined()
    // INV-11: null must remain null
    expect(field!.finalValue).toBeNull()
    expect(field!.finalValue).not.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Test 14: resolveCanonicalDocument — rawValue + evidence[] unchanged after override
// ---------------------------------------------------------------------------

describe('Test 14: resolveCanonicalDocument — base immutable after override', () => {
  it('rawValue and evidence[] are unchanged after override is applied', async () => {
    const original = makeResult({
      fields: [
        makeField({
          key: 'first_name',
          finalValue: 'Olena',
          rawValue: 'OLENA',
          evidence: [
            { value: 'OLENA', source: 'document_ocr', confidence: 0.9, provider: 'gemini' },
          ],
        }),
      ],
    })
    const row = makeDbRow(original)

    const overrideRows = [
      {
        id: 'ov-4',
        canonical_id: 'uuid-1',
        field_key: 'first_name',
        override_value: 'Olena-corrected',
        source: 'user_edit',
        reason: null,
        version: 1,
        supersedes_id: null,
        confirmed: true,
        actor: 'user',
        original_rejection_reasons: null,
        created_at: '2026-06-13T04:00:00Z',
      },
    ]

    queueResponse('canonical_documents', { data: row, error: null })
    queueResponse('canonical_overrides', { data: overrideRows, error: null })

    const resolved = await resolveCanonicalDocument('uuid-1')
    expect(resolved).not.toBeNull()
    const field = resolved!.fields.find((f) => f.key === 'first_name')
    expect(field).toBeDefined()

    // Override applied correctly
    expect(field!.finalValue).toBe('Olena-corrected')

    // Base values preserved (audit trail)
    expect(field!.rawValue).toBe('OLENA')
    expect(field!.evidence).toHaveLength(1)
    expect(field!.evidence[0].value).toBe('OLENA')
  })
})

// ---------------------------------------------------------------------------
// Test 15: getEffectiveValue — finalValue=null, no confirmed override → null (c3_null_not_resurrected)
// ---------------------------------------------------------------------------

describe('Test 15: getEffectiveValue — c3_null_not_resurrected', () => {
  it('finalValue=null with no override returns null (INV-11 enforced)', () => {
    const field = makeField({ finalValue: null })
    const result = getEffectiveValue(field, undefined)
    expect(result).toBeNull()
    expect(result).not.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Test 16: getEffectiveValue — finalValue=null, confirmed override='SMITH' → 'SMITH'
// ---------------------------------------------------------------------------

describe('Test 16: getEffectiveValue — c3_null_confirmed_override_is_effective', () => {
  it('confirmed override releases value when finalValue=null (explicit human decision)', () => {
    const field = makeField({ finalValue: null })
    const override: CanonicalOverride = {
      fieldKey: 'first_name',
      overrideValue: 'SMITH',
      source: 'user_edit',
      confirmed: true,
    }
    const result = getEffectiveValue(field, override)
    expect(result).toBe('SMITH')
  })

  it('base field finalValue remains null after confirmed override (base is immutable)', () => {
    const field = makeField({ finalValue: null })
    const override: CanonicalOverride = {
      fieldKey: 'first_name',
      overrideValue: 'SMITH',
      source: 'user_edit',
      confirmed: true,
    }
    // getEffectiveValue must not mutate the field
    getEffectiveValue(field, override)
    expect(field.finalValue).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Test 17: getEffectiveValue — unconfirmed override does not release value
// ---------------------------------------------------------------------------

describe('Test 17: getEffectiveValue — unconfirmed_override_does_not_release_value', () => {
  it('unconfirmed override: effectiveValue remains null', () => {
    const field = makeField({ finalValue: null })
    const override: CanonicalOverride = {
      fieldKey: 'first_name',
      overrideValue: 'SMITH',
      source: 'user_edit',
      confirmed: false,
    }
    const result = getEffectiveValue(field, override)
    // Staged but not confirmed → still null
    expect(result).toBeNull()
  })

  it('unconfirmed override with string finalValue: returns base finalValue', () => {
    const field = makeField({ finalValue: 'Olena' })
    const override: CanonicalOverride = {
      fieldKey: 'first_name',
      overrideValue: 'Elena',
      source: 'user_edit',
      confirmed: false,
    }
    // Unconfirmed → return base value
    const result = getEffectiveValue(field, override)
    expect(result).toBe('Olena')
  })
})

// ---------------------------------------------------------------------------
// Test 18: appendCanonicalOverride — delegates to atomic RPC with correct args
// ---------------------------------------------------------------------------

describe('Test 18: appendCanonicalOverride — delegates to atomic RPC', () => {
  it('calls append_canonical_overrides_atomic RPC with correct arguments', async () => {
    // RPC returns new version = 1 for the first call, 2 for the second
    mockRpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: 2, error: null })

    const v1 = await appendCanonicalOverride('canon-1', [
      { fieldKey: 'first_name', overrideValue: 'Olena', source: 'user_edit', confirmed: true },
    ], { expectedVersion: 0 })

    expect(mockRpc).toHaveBeenCalledWith(
      'append_canonical_overrides_atomic',
      expect.objectContaining({
        p_canonical_id: 'canon-1',
        p_expected_version: 0,
      })
    )
    expect(v1).toBe(1)

    const v2 = await appendCanonicalOverride('canon-1', [
      { fieldKey: 'last_name', overrideValue: 'Kovalenko', source: 'user_edit', confirmed: true },
    ], { expectedVersion: 1 })

    expect(mockRpc).toHaveBeenLastCalledWith(
      'append_canonical_overrides_atomic',
      expect.objectContaining({
        p_canonical_id: 'canon-1',
        p_expected_version: 1,
      })
    )
    expect(v2).toBe(2)
    // Monotonic: v2 > v1
    expect(v2).toBeGreaterThan(v1)
  })

  it('throws CanonicalConcurrencyError when RPC returns OVERRIDE_VERSION_CONFLICT', async () => {
    const { CanonicalConcurrencyError } = await import('../errors')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRpc.mockResolvedValueOnce({
      data: 0,
      error: { message: 'OVERRIDE_VERSION_CONFLICT expected=0 current=1' },
    } as any)

    await expect(
      appendCanonicalOverride('canon-2', [
        { fieldKey: 'first_name', overrideValue: 'Test', source: 'user_edit', confirmed: true },
      ], { expectedVersion: 0 })
    ).rejects.toBeInstanceOf(CanonicalConcurrencyError)
  })
})
