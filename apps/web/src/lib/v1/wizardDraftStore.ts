/**
 * wizardDraftStore — server-side encrypted wizard-draft persistence (V1 #9).
 *
 * The browser keeps only an opaque token; the draft (PII) lives in the
 * wizard_drafts table ENCRYPTED (AES-256-GCM, wizardDraftCrypto). Server-only.
 * The Supabase client is injected so this is unit-testable without a DB.
 *
 * Feature-flagged: SERVER_LEDGER_ENABLED (default OFF) — until ON, nothing calls
 * these functions, so there is no behavior change.
 */
import {
  sealDraft,
  openDraft,
  generateOpaqueToken,
  isDraftExpired,
  type SealedDraft,
} from './wizardDraftCrypto'

export function isServerLedgerEnabled(env: Record<string, string | undefined>): boolean {
  return env.SERVER_LEDGER_ENABLED === '1'
}

export type WizardProduct = 'tps' | 'reparole' | 'ead' | 'translation'

type DraftRow = {
  token: string
  product: string
  iv: string
  ciphertext: string
  tag: string
  created_at: string
  expires_at: string
}

/** Minimal structural Supabase client (loose on purpose — see actions note). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DraftDbClient = { from: (table: string) => any }

const TABLE = 'wizard_drafts'
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

/** Encrypt + upsert a draft. Returns the opaque token the browser will hold. */
export async function saveDraft(args: {
  db: DraftDbClient
  key: Buffer
  product: WizardProduct
  plaintext: string
  nowIso: string
  ttlMs?: number
  token?: string // reuse an existing token (update) or mint a new one
}): Promise<{ token: string }> {
  const token = args.token ?? generateOpaqueToken()
  const sealed = sealDraft(args.plaintext, args.key)
  const ttl = args.ttlMs ?? DEFAULT_TTL_MS
  const expires = new Date(new Date(args.nowIso).getTime() + ttl).toISOString()
  const row: DraftRow = {
    token,
    product: args.product,
    iv: sealed.iv,
    ciphertext: sealed.ciphertext,
    tag: sealed.tag,
    created_at: args.nowIso,
    expires_at: expires,
  }
  const { error } = await args.db.from(TABLE).upsert(row, { onConflict: 'token' })
  if (error) throw new Error(`wizard_draft_save_failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  return { token }
}

/** Load + decrypt a draft. Returns null (and best-effort deletes) if expired/missing. */
export async function loadDraft(args: {
  db: DraftDbClient
  key: Buffer
  token: string
  nowMs: number
}): Promise<{ plaintext: string | null; reason: 'ok' | 'not_found' | 'expired' }> {
  if (!args.token) return { plaintext: null, reason: 'not_found' }
  const { data, error } = await args.db.from(TABLE).select('*').eq('token', args.token).single()
  if (error || !data) return { plaintext: null, reason: 'not_found' }
  const row = data as DraftRow
  if (isDraftExpired(new Date(row.created_at).getTime(), new Date(row.expires_at).getTime() - new Date(row.created_at).getTime(), args.nowMs)) {
    await deleteDraft({ db: args.db, token: args.token }).catch(() => {})
    return { plaintext: null, reason: 'expired' }
  }
  const sealed: SealedDraft = { iv: row.iv, ciphertext: row.ciphertext, tag: row.tag }
  return { plaintext: openDraft(sealed, args.key), reason: 'ok' }
}

export async function deleteDraft(args: { db: DraftDbClient; token: string }): Promise<void> {
  if (!args.token) return
  await args.db.from(TABLE).delete().eq('token', args.token)
}
