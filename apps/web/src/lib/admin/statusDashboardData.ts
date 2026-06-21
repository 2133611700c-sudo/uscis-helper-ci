/**
 * statusDashboardData — assembles the /admin/status read-only snapshot.
 *
 * Separated from the page so the assembly is unit-testable with a fake
 * Supabase client. Rules:
 *  - PII-FREE by construction: only counts, timestamps, enum-ish columns and
 *    ids/hashes are selected — never names, values, or raw OCR.
 *  - Graceful on empty/missing tables: a query error yields a section marked
 *    `error` instead of throwing; the dashboard must render on a fresh DB.
 *  - GitHub CI status is optional (needs GITHUB_TOKEN); absent ⇒ 'unavailable'.
 */

type Row = Record<string, unknown>
interface QueryResult { data: Row[] | null; error: { message: string } | null }
/** The minimal supabase-js surface this module touches (injectable for tests). */
export interface DbLike {
  from(table: string): {
    select(cols: string, opts?: { count?: 'exact'; head?: boolean }): PromiseLike<QueryResult & { count?: number | null }> & {
      gte(col: string, v: string): PromiseLike<QueryResult & { count?: number | null }> & {
        order(col: string, o: { ascending: boolean }): { limit(n: number): PromiseLike<QueryResult> }
      }
      order(col: string, o: { ascending: boolean }): { limit(n: number): PromiseLike<QueryResult> }
      eq(col: string, v: string): PromiseLike<QueryResult & { count?: number | null }>
      in(col: string, v: string[]): PromiseLike<QueryResult & { count?: number | null }>
    }
  }
}

export interface FlagState { name: string; value: string; note: string }

export interface StatusDashboard {
  generatedAtUtc: string
  prodSha: string
  flags: FlagState[]
  guardBlocks24h: { total: number | null; perHour: number | null; error?: string }
  certifierAuditLast10: Array<Record<string, unknown>>
  certifierAuditError?: string
  reviewQueue: { pending: number | null; error?: string }
  passportMigration: { state: 'not_registered' | 'registered'; flag: string; dualRender: string }
  ci: { status: string; lastSuccess?: string; lastFailure?: string }
}

/** Flags worth showing — name + how to read the value. Values from process.env. */
const WATCHED_FLAGS: Array<{ name: string; note: string }> = [
  { name: 'MIRROR_PDF_ENABLED', note: 'mirror PDF for registered schemas (birth cert LIVE by default via allowlist; flag enables the rest)' },
  { name: 'PASSPORT_SCHEMA_RENDERER_ENABLED', note: 'passport schemas live switch (migration step E)' },
  { name: 'PASSPORT_SCHEMA_DUAL_RENDER_ENABLED', note: 'dual-render parity logging' },
  { name: 'CONFIRMED_VALUE_GUARD_MODE', note: 'shadow until 14d baseline + GT' },
  { name: 'CERTIFIER_OVERRIDE_ENABLED', note: 'gated on L2 PASS + D5 UI' },
  { name: 'OCR_FIELD_SAFETY_ENABLED', note: 'rolled back after false-positive incident' },
  { name: 'GUARD_BLOCK_METRICS_ENABLED', note: 'L1 baseline clock (14d from 2026-06-11)' },
  { name: 'ENSEMBLE_DATE_ENABLED', note: 'cross-engine date check' },
  { name: 'NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED', note: 'wizard autoread' },
  { name: 'REFUND_AUTOTICKET_ENABLED', note: 'A-full payment-failure triage' },
]

// PII-free columns ONLY. Never add value/name/raw columns here.
const AUDIT_COLS = 'id, created_at, doc_type, field_name, tier, reason_code'

export async function buildStatusDashboard(
  db: DbLike,
  env: Record<string, string | undefined> = process.env,
  nowIso: string = new Date().toISOString(),
): Promise<StatusDashboard> {
  const flags: FlagState[] = WATCHED_FLAGS.map(({ name, note }) => ({
    name, note, value: env[name] === undefined || env[name] === '' ? 'OFF (unset)' : String(env[name]),
  }))

  const since = new Date(Date.parse(nowIso) - 24 * 3600_000).toISOString()

  let guardBlocks24h: StatusDashboard['guardBlocks24h']
  try {
    const r = await db.from('guard_block_events').select('id', { count: 'exact', head: true }).gte('created_at', since)
    guardBlocks24h = r.error
      ? { total: null, perHour: null, error: r.error.message }
      : { total: r.count ?? 0, perHour: Math.round(((r.count ?? 0) / 24) * 100) / 100 }
  } catch (e) {
    guardBlocks24h = { total: null, perHour: null, error: (e as Error).message }
  }

  let certifierAuditLast10: Array<Record<string, unknown>> = []
  let certifierAuditError: string | undefined
  try {
    const r = await db.from('certifier_override_audit').select(AUDIT_COLS)
      .order('created_at', { ascending: false }).limit(10)
    if (r.error) certifierAuditError = r.error.message
    else certifierAuditLast10 = r.data ?? []
  } catch (e) {
    certifierAuditError = (e as Error).message
  }

  let reviewQueue: StatusDashboard['reviewQueue']
  try {
    const r = await db.from('manual_review_queue').select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'queued', 'assigned', 'in_review'])
    reviewQueue = r.error ? { pending: null, error: r.error.message } : { pending: r.count ?? 0 }
  } catch (e) {
    reviewQueue = { pending: null, error: (e as Error).message }
  }

  const rendererFlag = env.PASSPORT_SCHEMA_RENDERER_ENABLED === '1'

  return {
    generatedAtUtc: nowIso,
    prodSha: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    flags,
    guardBlocks24h,
    certifierAuditLast10,
    certifierAuditError,
    reviewQueue,
    passportMigration: {
      // Passport schemas registered unconditionally 2026-06-12 (the flag is retired);
      // mirror is live by default via MIRROR_READY_DOCTYPES.
      state: 'registered',
      flag: rendererFlag ? '1 (retired flag)' : 'registered (flag retired)',
      dualRender: env.PASSPORT_SCHEMA_DUAL_RENDER_ENABLED === '1' ? '1' : 'OFF (unset)',
    },
    ci: env.GITHUB_TOKEN
      ? { status: 'token_present_fetch_in_page' }
      : { status: 'unavailable (GITHUB_TOKEN not set — see GitHub Actions tab)' },
  }
}
