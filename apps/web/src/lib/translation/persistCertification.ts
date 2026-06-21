/**
 * persistCertification.ts — S2: audit persistence is a HARD requirement.
 *
 * The `translation_certification_audit` row IS our 8 CFR §103.2(b)(3) compliance
 * artifact (WHAT was attested + WHEN, the signed attestation payload). If it is
 * not stored, the platform must NOT hand back a "signed" PDF as if the
 * certification had been recorded — that would be a silent compliance gap.
 *
 * This module performs the two inserts (order + audit) with ONE retry each to
 * absorb a transient blip, and reports a clean ok/error result. The route uses
 * the result to decide between returning the PDF (ok) and returning a non-200
 * with the signed attestation logged for reconciliation (not ok).
 *
 * It is deliberately client-agnostic (takes a minimal insert interface) so it can
 * be unit-tested with a fake client and no live Supabase.
 */

/** Minimal shape of the supabase-js insert path we depend on. */
export interface InsertableClient {
  from(table: string): {
    // PromiseLike (not Promise) so the real supabase-js query builder — a thenable,
    // not a literal Promise — is assignable. We only ever await `{ error }`.
    insert(row: unknown): PromiseLike<{ error: { code?: string; message?: string } | null }>
  }
}

export interface PersistResult {
  /** True only when BOTH the order and the audit row were stored. */
  ok: boolean
  /** Non-null = the order insert failed after retry (operational record). */
  orderErr: string | null
  /** Non-null = the audit insert failed after retry (legal attestation record). */
  auditErr: string | null
}

/**
 * Insert one row, retrying once. supabase-js does NOT throw on a DB error — it
 * returns `{ error }` — so we check it AND guard against a thrown client/network
 * error. Returns an error string on failure after the retry, else null.
 */
async function insertWithRetry(
  client: InsertableClient,
  table: string,
  row: unknown,
  attempts = 2,
): Promise<string | null> {
  let last: string | null = 'no attempt made'
  for (let i = 1; i <= attempts; i++) {
    try {
      const { error } = await client.from(table).insert(row)
      if (!error) return null
      last = `${error.code ?? 'ERR'}: ${error.message ?? 'unknown'}`
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
  }
  return last
}

/**
 * Persist the order + certification audit. Returns ok=true only if BOTH stored.
 * The caller MUST treat ok=false as a hard failure (no success response).
 */
export async function persistCertification(
  client: InsertableClient,
  rows: { orderRow: unknown; auditRow: unknown },
): Promise<PersistResult> {
  const orderErr = await insertWithRetry(client, 'translation_orders', rows.orderRow)
  const auditErr = await insertWithRetry(client, 'translation_certification_audit', rows.auditRow)
  return { ok: !orderErr && !auditErr, orderErr, auditErr }
}
