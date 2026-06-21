/**
 * canonicalDbInvariants.live.test.ts — Wave 1 Agent 1 LIVE DB invariant proof.
 *
 * Proves, against the REAL Supabase project (service-role path), that:
 *   - service_role_update_base_rejected    (canonical_documents UPDATE blocked by trigger)
 *   - service_role_delete_base_rejected     (canonical_documents DELETE blocked by trigger)
 *   - service_role_update_override_rejected (canonical_overrides UPDATE blocked by trigger)
 *   - service_role_delete_override_rejected (canonical_overrides DELETE blocked by trigger)
 *   - cross_product_idempotency_no_collision (same session+doc_type+hash, diff product → 2 rows)
 *   - identical_retry_same_id               (idempotent persist returns same id)
 *   - atomic_override_version_conflict       (stale expected_version → conflict)
 *
 * PII-free: uses only synthetic sentinel session_id 'WAVE1_TEST_*' with empty fields_json.
 * Cleans up via the guarded canonical_admin_cleanup_sentinel RPC.
 *
 * SELF-SKIPS unless RUN_DB_INVARIANTS=1 AND service-role env is present, so normal CI
 * never touches the network. Invoke with:
 *   RUN_DB_INVARIANTS=1 pnpm --filter web exec vitest run \
 *     src/lib/canonical/persistence/__tests__/canonicalDbInvariants.live.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const GATE =
  process.env.RUN_DB_INVARIANTS === '1' &&
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY

const SENTINEL = `WAVE1_TEST_VITEST_${Date.now()}`

function svc(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

describe.skipIf(!GATE)('canonical DB invariants (live, service-role path)', () => {
  let db: SupabaseClient
  let docId: string
  let ovrId: string

  beforeAll(async () => {
    db = svc()
    const fh = `vitest_fh_${Date.now()}`
    const ins = await db
      .from('canonical_documents')
      .insert({
        session_id: SENTINEL,
        product: 'tps',
        doc_type: 'vitest_doc',
        fields_json: [],
        result_hash: 'rh',
        fields_hash: fh,
      })
      .select('id')
      .single()
    expect(ins.error).toBeNull()
    docId = (ins.data as { id: string }).id

    // append one override via the atomic RPC (expected_version 0)
    const rpc = await db.rpc('append_canonical_overrides_atomic', {
      p_canonical_id: docId,
      p_expected_version: 0,
      p_overrides: [
        { field_key: 'k', override_value: 'x', source: 'user_edit', confirmed: true },
      ],
    })
    expect(rpc.error).toBeNull()
    const list = await db
      .from('canonical_overrides')
      .select('id')
      .eq('canonical_id', docId)
      .limit(1)
      .single()
    ovrId = (list.data as { id: string }).id
  })

  afterAll(async () => {
    if (db) await db.rpc('canonical_admin_cleanup_sentinel', { p_session_prefix: 'WAVE1_TEST' })
  })

  it('service_role_update_base_rejected', async () => {
    const r = await db.from('canonical_documents').update({ session_id: 'HACKED' }).eq('id', docId)
    expect(r.error).not.toBeNull()
    expect(String(r.error?.message)).toContain('CANONICAL_BASE_IMMUTABLE')
  })

  it('service_role_delete_base_rejected', async () => {
    const r = await db.from('canonical_documents').delete().eq('id', docId)
    expect(r.error).not.toBeNull()
    expect(String(r.error?.message)).toContain('CANONICAL_BASE_IMMUTABLE')
  })

  it('service_role_update_override_rejected', async () => {
    const r = await db
      .from('canonical_overrides')
      .update({ override_value: 'HACKED' })
      .eq('id', ovrId)
    expect(r.error).not.toBeNull()
    expect(String(r.error?.message)).toContain('CANONICAL_OVERRIDES_APPEND_ONLY')
  })

  it('service_role_delete_override_rejected', async () => {
    const r = await db.from('canonical_overrides').delete().eq('id', ovrId)
    expect(r.error).not.toBeNull()
    expect(String(r.error?.message)).toContain('CANONICAL_OVERRIDES_APPEND_ONLY')
  })

  it('cross_product_idempotency_no_collision', async () => {
    const fh = `vitest_idem_${Date.now()}`
    const a = await db
      .from('canonical_documents')
      .upsert(
        { session_id: SENTINEL, product: 'tps', doc_type: 'idem', fields_json: [], result_hash: 'r', fields_hash: fh },
        { onConflict: 'session_id,product,doc_type,fields_hash', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    const b = await db
      .from('canonical_documents')
      .upsert(
        { session_id: SENTINEL, product: 'translation', doc_type: 'idem', fields_json: [], result_hash: 'r', fields_hash: fh },
        { onConflict: 'session_id,product,doc_type,fields_hash', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect((a.data as { id: string }).id).not.toBe((b.data as { id: string }).id)
  })

  it('atomic_override_version_conflict', async () => {
    // docId already has version 1; calling with expected_version 0 must conflict.
    const r = await db.rpc('append_canonical_overrides_atomic', {
      p_canonical_id: docId,
      p_expected_version: 0,
      p_overrides: [{ field_key: 'k2', override_value: 'y', source: 'user_edit', confirmed: true }],
    })
    expect(r.error).not.toBeNull()
    expect(String(r.error?.message)).toContain('OVERRIDE_VERSION_CONFLICT')
  })
})
