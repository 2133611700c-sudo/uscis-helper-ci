/**
 * wizardLedgerClient — browser-side adapter for the server PII ledger (V1 #9).
 *
 * When NEXT_PUBLIC_SERVER_LEDGER_ENABLED === '1', a wizard persists its draft to
 * the server (POST /api/wizard-draft) instead of localStorage, so PII never sits
 * in the browser; only the opaque httpOnly token cookie remains. When the flag is
 * off, isLedgerClientEnabled() returns false and callers keep their existing
 * localStorage path (no behavior change). Pure fetch wrapper — fetch is injected
 * for tests; never logs draft contents.
 */
export type WizardProduct = 'tps' | 'reparole' | 'ead' | 'translation'
type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export function isLedgerClientEnabled(env: Record<string, string | undefined> = readPublicEnv()): boolean {
  return env.NEXT_PUBLIC_SERVER_LEDGER_ENABLED === '1'
}

function readPublicEnv(): Record<string, string | undefined> {
  // Next inlines NEXT_PUBLIC_* at build time; guard for non-browser/test contexts.
  try {
    return (typeof process !== 'undefined' && process.env) ? process.env : {}
  } catch {
    return {}
  }
}

const ENDPOINT = '/api/wizard-draft'

/** Save a draft to the server ledger. Returns true on success. Never throws on network. */
export async function saveDraftToServer(
  product: WizardProduct,
  draft: unknown,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<boolean> {
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ product, draft: JSON.stringify(draft) }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Load the draft for the current opaque token cookie, or null. */
export async function loadDraftFromServer<T = unknown>(
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<T | null> {
  try {
    const res = await fetchImpl(ENDPOINT, { method: 'GET', credentials: 'same-origin' })
    if (!res.ok) return null
    const body = (await res.json()) as { ok?: boolean; draft?: string }
    if (!body?.ok || typeof body.draft !== 'string') return null
    return JSON.parse(body.draft) as T
  } catch {
    return null
  }
}

/** Delete the server draft + clear the token cookie. */
export async function clearServerDraft(
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<boolean> {
  try {
    const res = await fetchImpl(ENDPOINT, { method: 'DELETE', credentials: 'same-origin' })
    return res.ok
  } catch {
    return false
  }
}
