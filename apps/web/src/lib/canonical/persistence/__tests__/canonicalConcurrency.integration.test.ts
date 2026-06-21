/**
 * canonicalConcurrency.integration.test.ts
 *
 * Integration tests for the canonical persistence concurrency guarantees.
 * These tests run against the REAL Supabase DB — NOT mocks.
 *
 * Guard: tests are skipped if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set.
 *
 * Run with:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter web run test -- canonicalConcurrency.integration
 *   or:
 *   pnpm --filter web run test:integration
 *
 * Cleanup: all test rows use session_id = 'CANONICAL_CONCURRENCY_TEST' sentinel and are
 * deleted in afterAll. Overrides are deleted via cascade (FK to canonical_documents).
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  persistCanonicalDocument,
  appendCanonicalOverride,
  listCanonicalOverrides,
  resolveCanonicalDocument,
} from '../index'
import { CanonicalConcurrencyError } from '../errors'
import type { CanonicalDocumentResult } from '../../types'

// ---------------------------------------------------------------------------
// Guard: skip if credentials are not set
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN_INTEGRATION = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

const TEST_SESSION_ID = 'CANONICAL_CONCURRENCY_TEST'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestResult(
  docType = 'birth_certificate',
  overrideFirstName?: string
): CanonicalDocumentResult {
  return {
    documentSessionId: `${TEST_SESSION_ID}-doc`,
    product: 'translation',
    docType,
    fields: [
      {
        key: 'first_name',
        finalValue: overrideFirstName ?? 'Іван',
        reviewRequired: false,
        source: 'document_ocr',
        confidence: { ocr: 0.95, field_match: null, normalization: null, source_match: null, final: 0.95 },
        reviewReasons: [],
        rawValue: overrideFirstName ?? 'Іван',
        rawCyrillic: overrideFirstName ?? 'Іван',
        normalizedValue: null,
        criticality: 'critical' as const,
        evidence: [],
      },
      {
        key: 'last_name',
        finalValue: 'Петренко',
        reviewRequired: false,
        source: 'document_ocr',
        confidence: { ocr: 0.9, field_match: null, normalization: null, source_match: null, final: 0.9 },
        normalizedValue: null,
        criticality: 'high' as const,
        reviewReasons: [],
        rawValue: 'Петренко',
        rawCyrillic: 'Петренко',
        evidence: [],
      },
    ],
    hashes: {
      uploadHash: null,
      normalizedImageHash: null,
      canonicalResultHash: null,
    },
    createdAt: new Date().toISOString(),
    requiresReview: false,
  }
}

// Service-role client for direct DB cleanup
let supabaseAdmin: SupabaseClient | null = null

// Canonical IDs created during tests — for cleanup
const createdCanonicalIds: string[] = []

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (!RUN_INTEGRATION) return
  supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
})

afterAll(async () => {
  if (!RUN_INTEGRATION || !supabaseAdmin) return

  // Delete overrides first (FK), then canonical documents
  if (createdCanonicalIds.length > 0) {
    await supabaseAdmin
      .from('canonical_overrides')
      .delete()
      .in('canonical_id', createdCanonicalIds)
  }

  await supabaseAdmin
    .from('canonical_documents')
    .delete()
    .eq('session_id', TEST_SESSION_ID)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('canonical persistence — concurrency integration', () => {
  // -------------------------------------------------------------------------
  // 1. concurrent_append_same_expected_version_one_succeeds
  // -------------------------------------------------------------------------
  it('concurrent_append_same_expected_version_one_succeeds', async () => {
    if (!RUN_INTEGRATION) {
      console.log('SKIP: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const { id } = await persistCanonicalDocument(
      makeTestResult('birth_certificate'),
      TEST_SESSION_ID
    )
    createdCanonicalIds.push(id)

    const override1 = {
      fieldKey: 'first_name',
      overrideValue: 'Ivan',
      source: 'user_edit' as const,
      reason: 'test concurrency 1',
      confirmed: true,
      actor: 'test',
    }
    const override2 = {
      fieldKey: 'last_name',
      overrideValue: 'Petrenko',
      source: 'user_edit' as const,
      reason: 'test concurrency 2',
      confirmed: true,
      actor: 'test',
    }

    // Both callers believe version=0
    const results = await Promise.allSettled([
      appendCanonicalOverride(id, [override1], { expectedVersion: 0 }),
      appendCanonicalOverride(id, [override2], { expectedVersion: 0 }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    // Exactly one succeeds, one fails with conflict
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason
    expect(rejectedReason).toBeInstanceOf(CanonicalConcurrencyError)
    expect((rejectedReason as CanonicalConcurrencyError).code).toBe(
      'OVERRIDE_VERSION_CONFLICT'
    )
  })

  // -------------------------------------------------------------------------
  // 2. concurrent_append_no_duplicate_version
  // -------------------------------------------------------------------------
  it('concurrent_append_no_duplicate_version', async () => {
    if (!RUN_INTEGRATION) return

    const { id } = await persistCanonicalDocument(
      makeTestResult('marriage_certificate'),
      TEST_SESSION_ID
    )
    createdCanonicalIds.push(id)

    const results = await Promise.allSettled([
      appendCanonicalOverride(
        id,
        [{ fieldKey: 'spouse_1_first_name', overrideValue: 'A', source: 'user_edit', confirmed: true, actor: 'test' }],
        { expectedVersion: 0 }
      ),
      appendCanonicalOverride(
        id,
        [{ fieldKey: 'spouse_1_last_name', overrideValue: 'B', source: 'user_edit', confirmed: true, actor: 'test' }],
        { expectedVersion: 0 }
      ),
    ])

    // At least one must have succeeded
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)

    // Verify no duplicate versions in DB
    if (!supabaseAdmin) throw new Error('supabaseAdmin not initialised')
    const { data: rows } = await supabaseAdmin
      .from('canonical_overrides')
      .select('version')
      .eq('canonical_id', id)

    const versions = (rows ?? []).map((r: { version: number }) => r.version)
    const uniqueVersions = new Set(versions)
    expect(uniqueVersions.size).toBe(versions.length)
  })

  // -------------------------------------------------------------------------
  // 3. sequential_append_monotonic_versions
  // -------------------------------------------------------------------------
  it('sequential_append_monotonic_versions', async () => {
    if (!RUN_INTEGRATION) return

    const { id } = await persistCanonicalDocument(
      makeTestResult('divorce_certificate'),
      TEST_SESSION_ID
    )
    createdCanonicalIds.push(id)

    const v1 = await appendCanonicalOverride(
      id,
      [{ fieldKey: 'first_name', overrideValue: 'A1', source: 'user_edit', confirmed: true, actor: 'test' }],
      { expectedVersion: 0 }
    )
    const v2 = await appendCanonicalOverride(
      id,
      [{ fieldKey: 'first_name', overrideValue: 'A2', source: 'certifier_override', confirmed: true, actor: 'test' }],
      { expectedVersion: v1 }
    )
    const v3 = await appendCanonicalOverride(
      id,
      [{ fieldKey: 'first_name', overrideValue: 'A3', source: 'system_correction', confirmed: true, actor: 'test' }],
      { expectedVersion: v2 }
    )

    expect(v1).toBe(1)
    expect(v2).toBe(2)
    expect(v3).toBe(3)

    const overrides = await listCanonicalOverrides(id)
    const versions = overrides.map((o) => o.version)
    expect(versions).toEqual([1, 2, 3])
  })

  // -------------------------------------------------------------------------
  // 4. idempotent_persist_same_hash_returns_same_id
  // -------------------------------------------------------------------------
  it('idempotent_persist_same_hash_returns_same_id', async () => {
    if (!RUN_INTEGRATION) return

    const result = makeTestResult('death_certificate')
    const call1 = await persistCanonicalDocument(result, TEST_SESSION_ID)
    const call2 = await persistCanonicalDocument(result, TEST_SESSION_ID)

    createdCanonicalIds.push(call1.id)

    expect(call1.id).toBe(call2.id)
    expect(call1.fieldsHash).toBe(call2.fieldsHash)
    expect(call1.resultHash).toBe(call2.resultHash)
  })

  // -------------------------------------------------------------------------
  // 5. idempotent_persist_concurrent_retries_no_duplicate
  // -------------------------------------------------------------------------
  it('idempotent_persist_concurrent_retries_no_duplicate', async () => {
    if (!RUN_INTEGRATION) return

    const result = makeTestResult('name_change_certificate')

    const [r1, r2] = await Promise.all([
      persistCanonicalDocument(result, TEST_SESSION_ID),
      persistCanonicalDocument(result, TEST_SESSION_ID),
    ])

    createdCanonicalIds.push(r1.id)

    // Both calls must return the SAME id
    expect(r1.id).toBe(r2.id)

    // DB must have exactly ONE row for this session+docType+fieldsHash
    if (!supabaseAdmin) throw new Error('supabaseAdmin not initialised')
    const { data: rows } = await supabaseAdmin
      .from('canonical_documents')
      .select('id')
      .eq('session_id', TEST_SESSION_ID)
      .eq('doc_type', 'name_change_certificate')
      .eq('fields_hash', r1.fieldsHash)

    expect((rows ?? []).length).toBe(1)
  })

  // -------------------------------------------------------------------------
  // 6. version_order_beats_created_at
  // -------------------------------------------------------------------------
  it('version_order_beats_created_at', async () => {
    if (!RUN_INTEGRATION || !supabaseAdmin) return

    const { id } = await persistCanonicalDocument(
      makeTestResult('birth_certificate', 'VersionOrderTest'),
      TEST_SESSION_ID
    )
    createdCanonicalIds.push(id)

    // Insert two overrides with deliberate created_at reversal:
    //   version=1 → created_at = now + 10 seconds (future)
    //   version=2 → created_at = now - 10 seconds (past)
    // If resolveCanonicalDocument uses version ASC (correct), the version=2 value wins.
    // If it wrongly uses created_at ASC, the version=2 row (with earlier created_at) would
    // still win by coincidence here — so we insert with version=2 as the FINAL desired value
    // and version=1 as an overridden-away value, then verify the version=2 value appears.
    const now = new Date()
    const future = new Date(now.getTime() + 10_000).toISOString()
    const past = new Date(now.getTime() - 10_000).toISOString()

    // version 1 has a FUTURE created_at, value = 'WrongValue'
    await supabaseAdmin.from('canonical_overrides').insert({
      canonical_id: id,
      field_key: 'first_name',
      override_value: 'WrongValue',
      source: 'user_edit',
      version: 1,
      confirmed: true,
      actor: 'test',
      created_at: future,
    })

    // version 2 has an earlier created_at (PAST), value = 'CorrectValue'
    await supabaseAdmin.from('canonical_overrides').insert({
      canonical_id: id,
      field_key: 'first_name',
      override_value: 'CorrectValue',
      source: 'certifier_override',
      version: 2,
      confirmed: true,
      actor: 'test',
      created_at: past,
    })

    // resolveCanonicalDocument must produce 'CorrectValue' (version=2 wins)
    // NOT 'WrongValue' (which has the later created_at)
    const resolved = await resolveCanonicalDocument(id)
    expect(resolved).not.toBeNull()
    const firstNameField = resolved!.fields.find((f) => f.key === 'first_name')
    expect(firstNameField?.finalValue).toBe('CorrectValue')

    // Also verify listCanonicalOverrides returns in version ASC order
    const overrides = await listCanonicalOverrides(id)
    expect(overrides[0].version).toBe(1)
    expect(overrides[1].version).toBe(2)
    expect(overrides[0].overrideValue).toBe('WrongValue')
    expect(overrides[1].overrideValue).toBe('CorrectValue')
  })
})
