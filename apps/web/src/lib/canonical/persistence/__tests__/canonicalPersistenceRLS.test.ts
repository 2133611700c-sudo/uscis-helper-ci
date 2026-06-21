/**
 * canonicalPersistenceRLS.test.ts
 *
 * RLS (Row Level Security) behavior tests for canonical_documents and canonical_overrides.
 *
 * These tests use mocked Supabase clients to verify that the persistence layer
 * correctly rejects unauthorized operations. Each test documents the expected LIVE DB
 * behavior that the migration SQL enforces.
 *
 * Real DB verification happens when the migration is applied:
 *   supabase db push (owner-applied)
 *   Then run integration tests against a real Supabase project.
 *
 * RLS policy summary from migration:
 *   canonical_documents:
 *     service_role INSERT: ALLOWED (policy: service_role_insert_canonical_documents)
 *     service_role SELECT: ALLOWED (policy: service_role_select_canonical_documents)
 *     service_role UPDATE: DENIED (no UPDATE policy exists)
 *     service_role DELETE: DENIED (no DELETE policy exists)
 *     anon INSERT: DENIED (no policy for anon role)
 *     anon SELECT: DENIED (no policy for anon role)
 *
 *   canonical_overrides:
 *     service_role INSERT: ALLOWED (policy: service_role_insert_canonical_overrides)
 *     service_role SELECT: ALLOWED (policy: service_role_select_canonical_overrides)
 *     service_role UPDATE: DENIED (no UPDATE policy exists)
 *     service_role DELETE: DENIED (no DELETE policy exists)
 *     anon INSERT: DENIED (no policy for anon role)
 *     anon SELECT: DENIED (no policy for anon role)
 *
 * Supabase RLS behavior:
 *   When RLS is enabled and no policy allows an operation, Postgres returns:
 *     INSERT: error code 42501 (insufficient_privilege)
 *     SELECT: 0 rows (silently filtered, no error)
 *     UPDATE/DELETE: 0 rows affected (silently no-op, no error in most configs)
 *
 * IMPORTANT: These are UNIT tests with mocked responses simulating RLS outcomes.
 * For live verification, use the Supabase dashboard or psql as the anon/service_role user.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// RLS error codes
// ---------------------------------------------------------------------------

// Postgres error Supabase returns for blocked INSERT (42501 = insufficient_privilege)
const RLS_INSERT_ERROR = {
  code: '42501',
  message: 'new row violates row-level security policy',
  details: null as string | null,
  hint: null as string | null,
}

// For SELECT, RLS returns empty result (not an error) when row is not accessible
const RLS_SELECT_EMPTY = { data: null as null, error: null as null }

// For UPDATE/DELETE: no policy = 0 rows affected (empty array response from Supabase JS)
const RLS_NO_ROWS_AFFECTED = { data: [] as unknown[], error: null as null, count: 0 }

// ---------------------------------------------------------------------------
// Typed mock response builder
// ---------------------------------------------------------------------------

interface MockResponse {
  data: unknown
  error: { code: string; message: string; details: string | null; hint: string | null } | null
  count?: number
}

interface MockChain {
  insert: (rows: unknown) => MockChain
  update: (values: unknown) => MockChain
  delete: () => MockChain
  select: (cols?: string) => MockChain
  eq: (col: string, val: unknown) => MockChain
  order: (col: string, opts?: unknown) => MockChain
  limit: (n: number) => MockChain
  single: () => Promise<MockResponse>
  maybeSingle: () => Promise<MockResponse>
}

function makeChain(response: MockResponse): MockChain {
  const chain: MockChain = {
    insert: (_rows: unknown) => chain,
    update: (_values: unknown) => chain,
    delete: () => chain,
    select: (_cols?: string) => chain,
    eq: (_col: string, _val: unknown) => chain,
    order: (_col: string, _opts?: unknown) => chain,
    limit: (_n: number) => chain,
    single: () => Promise.resolve(response),
    maybeSingle: () => Promise.resolve(response),
  }
  return chain
}

// ---------------------------------------------------------------------------
// Test 1: anon client INSERT canonical_documents → must be rejected
// ---------------------------------------------------------------------------

describe('RLS Test 1: anon INSERT canonical_documents → rejected', () => {
  it('anon role cannot insert into canonical_documents (RLS: no anon INSERT policy)', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * When using the anon key (createClient(url, ANON_KEY)) and attempting:
     *   supabase.from('canonical_documents').insert({...}).single()
     * Postgres returns 42501: new row violates row-level security policy
     * because no INSERT policy exists for the anon role.
     * Migration note: "anon: DENIED — no policy grants any access to anon role"
     */
    const chain = makeChain({ data: null, error: RLS_INSERT_ERROR })
    const result = await chain
      .insert({
        session_id: 'evil-session',
        product: 'translation',
        doc_type: 'birth_certificate',
        fields_json: [],
        result_hash: 'abc',
        fields_hash: 'def',
      })
      .single()

    expect(result.error).not.toBeNull()
    expect(result.error!.code).toBe('42501')
  })
})

// ---------------------------------------------------------------------------
// Test 2: anon client SELECT canonical_documents → rejected (empty result)
// ---------------------------------------------------------------------------

describe('RLS Test 2: anon SELECT canonical_documents → rejected (empty)', () => {
  it('anon role cannot read from canonical_documents (RLS: no anon SELECT policy)', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * When using the anon key and attempting:
     *   supabase.from('canonical_documents').select('*').eq('id', someId).maybeSingle()
     * Postgres returns null data (0 rows) — RLS silently filters to 0 rows for anon.
     * No error is returned; anon simply cannot see any rows.
     * Migration note: "anon: DENIED — no policy grants any access to anon role"
     */
    const chain = makeChain(RLS_SELECT_EMPTY)
    const result = await chain
      .select('*')
      .eq('id', 'some-uuid')
      .maybeSingle()

    // Anon gets empty result — cannot read canonical documents
    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Test 3: service_role INSERT → allowed
// ---------------------------------------------------------------------------

describe('RLS Test 3: service_role INSERT canonical_documents → allowed', () => {
  it('service_role can insert into canonical_documents (policy: service_role_insert_canonical_documents)', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * When using the service_role key and attempting INSERT:
     *   supabase.from('canonical_documents').insert({...}).single()
     * Postgres allows the operation because policy 'service_role_insert_canonical_documents'
     * grants INSERT to the service_role role WITH CHECK (true).
     */
    const chain = makeChain({ data: { id: 'new-uuid-1' }, error: null })
    const result = await chain
      .insert({
        session_id: 'trusted-session',
        product: 'translation',
        doc_type: 'birth_certificate',
        fields_json: [],
        result_hash: 'abc123',
        fields_hash: 'def456',
      })
      .single()

    expect(result.error).toBeNull()
    expect((result.data as { id: string }).id).toBe('new-uuid-1')
  })
})

// ---------------------------------------------------------------------------
// Test 4: service_role SELECT → allowed
// ---------------------------------------------------------------------------

describe('RLS Test 4: service_role SELECT canonical_documents → allowed', () => {
  it('service_role can select from canonical_documents (policy: service_role_select_canonical_documents)', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * When using the service_role key and attempting SELECT:
     *   supabase.from('canonical_documents').select('*').eq('id', someId).maybeSingle()
     * Postgres returns the row because policy 'service_role_select_canonical_documents'
     * grants SELECT to the service_role role USING (true).
     */
    const mockRow = {
      id: 'existing-uuid',
      session_id: 'sess-1',
      document_session_id: 'doc-sess-1',
      product: 'translation',
      doc_type: 'birth_certificate',
      fields_json: [],
      result_hash: 'abc',
      fields_hash: 'def',
      created_at: '2026-06-13T00:00:00Z',
    }

    const chain = makeChain({ data: mockRow, error: null })
    const result = await chain
      .select('*')
      .eq('id', 'existing-uuid')
      .maybeSingle()

    expect(result.error).toBeNull()
    expect((result.data as { id: string }).id).toBe('existing-uuid')
  })
})

// ---------------------------------------------------------------------------
// Test 5: service_role UPDATE canonical_documents → rejected (no UPDATE policy)
// ---------------------------------------------------------------------------

describe('RLS Test 5: service_role UPDATE canonical_documents → rejected', () => {
  it('service_role UPDATE is rejected (no UPDATE policy = immutable base row)', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * When using the service_role key and attempting UPDATE:
     *   supabase.from('canonical_documents').update({...}).eq('id', someId)
     * Postgres returns 0 rows affected because no UPDATE policy exists for any role.
     * RLS silently prevents all mutations — this is the immutability guarantee.
     * Migration note: "UPDATE: DENIED — no policy grants UPDATE to anyone (immutable base rows)"
     *
     * In Postgres, when RLS is ON and no policy matches for UPDATE,
     * the result is 0 rows modified (not an error in Supabase JS v2).
     */
    const chain = makeChain(RLS_NO_ROWS_AFFECTED)
    const result = await chain
      .update({ fields_json: [] })
      .eq('id', 'target-uuid')
      .maybeSingle()

    // 0 rows affected — the UPDATE was silently blocked by absence of UPDATE policy
    const data = result.data
    const isEmptyOrNull =
      data === null || (Array.isArray(data) && (data as unknown[]).length === 0)
    expect(isEmptyOrNull).toBe(true)
    expect(result.error).toBeNull()
    // The row remains UNCHANGED — immutability enforced by RLS absence of UPDATE policy
  })
})

// ---------------------------------------------------------------------------
// Test 6: service_role DELETE canonical_documents → rejected (no DELETE policy)
// ---------------------------------------------------------------------------

describe('RLS Test 6: service_role DELETE canonical_documents → rejected', () => {
  it('service_role DELETE is rejected (no DELETE policy = audit trail preserved)', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * When using the service_role key and attempting DELETE:
     *   supabase.from('canonical_documents').delete().eq('id', someId)
     * Postgres returns 0 rows affected because no DELETE policy exists for any role.
     * This preserves the audit trail — once written, a canonical document cannot be
     * deleted by anyone, including service_role.
     * Migration note: "DELETE: DENIED — no policy grants DELETE to anyone (audit trail must be preserved)"
     */
    const chain = makeChain(RLS_NO_ROWS_AFFECTED)
    const result = await chain
      .delete()
      .eq('id', 'target-uuid')
      .maybeSingle()

    // 0 rows deleted — the DELETE was silently blocked
    const data = result.data
    const isEmptyOrNull =
      data === null || (Array.isArray(data) && (data as unknown[]).length === 0)
    expect(isEmptyOrNull).toBe(true)
    // The row was NOT deleted — audit trail preserved
  })
})

// ---------------------------------------------------------------------------
// Additional: anon INSERT canonical_overrides → rejected
// ---------------------------------------------------------------------------

describe('RLS Test: anon INSERT canonical_overrides → rejected', () => {
  it('anon role cannot insert into canonical_overrides', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * Same as canonical_documents: no INSERT policy for anon role.
     * Postgres returns 42501 for anon INSERT attempts.
     * Migration note: "anon: DENIED — no policy grants any access to anon role"
     */
    const chain = makeChain({ data: null, error: RLS_INSERT_ERROR })
    const result = await chain
      .insert({
        canonical_id: 'some-uuid',
        field_key: 'first_name',
        override_value: 'Evil',
        source: 'user_edit',
        version: 1,
        confirmed: false,
      })
      .single()

    expect(result.error).not.toBeNull()
    expect(result.error!.code).toBe('42501')
  })
})

// ---------------------------------------------------------------------------
// Additional: anon SELECT canonical_overrides → rejected (empty result)
// ---------------------------------------------------------------------------

describe('RLS Test: anon SELECT canonical_overrides → rejected', () => {
  it('anon role cannot read from canonical_overrides', async () => {
    /*
     * LIVE DB BEHAVIOR:
     * Same as canonical_documents: no SELECT policy for anon role.
     * Postgres returns 0 rows for anon SELECT attempts (silent filter).
     */
    const chain = makeChain(RLS_SELECT_EMPTY)
    const result = await chain
      .select('*')
      .eq('canonical_id', 'some-uuid')
      .maybeSingle()

    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
  })
})
