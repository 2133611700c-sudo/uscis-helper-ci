/**
 * /api/wizard-draft — server-side encrypted wizard draft (V1 criterion #9).
 *
 * The browser holds ONLY an opaque httpOnly cookie token; the draft (PII) is
 * stored encrypted server-side (wizard_drafts). Feature-flagged: when
 * SERVER_LEDGER_ENABLED !== '1' the route 404s (no behavior change). Never logs
 * the draft or the token.
 *
 *  POST   { product, draft }  → save (encrypt+upsert), set opaque token cookie
 *  GET                        → load+decrypt the draft for the cookie token
 *  DELETE                     → delete the draft + clear cookie
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { keyFromEnv } from '@/lib/v1/wizardDraftCrypto'
import {
  isServerLedgerEnabled,
  saveDraft,
  loadDraft,
  deleteDraft,
  type WizardProduct,
} from '@/lib/v1/wizardDraftStore'

const COOKIE = 'wizard_draft_token'
const PRODUCTS: WizardProduct[] = ['tps', 'reparole', 'ead', 'translation']

function offOrKey(): { off: true } | { off: false; key: Buffer } | { misconfigured: true } {
  if (!isServerLedgerEnabled(process.env)) return { off: true }
  try {
    return { off: false, key: keyFromEnv(process.env) }
  } catch {
    return { misconfigured: true }
  }
}

export async function POST(req: NextRequest) {
  const g = offOrKey()
  if ('off' in g && g.off) return new NextResponse(null, { status: 404 })
  if ('misconfigured' in g) return NextResponse.json({ error: 'ledger_misconfigured' }, { status: 503 })
  const body = (await req.json().catch(() => ({}))) as { product?: unknown; draft?: unknown }
  if (typeof body.product !== 'string' || !PRODUCTS.includes(body.product as WizardProduct) || typeof body.draft !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const existing = req.cookies.get(COOKIE)?.value
  const db = createAdminSupabaseClient()
  const { token } = await saveDraft({
    db,
    key: (g as { key: Buffer }).key,
    product: body.product as WizardProduct,
    plaintext: body.draft,
    nowIso: new Date().toISOString(),
    token: existing,
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 86400 })
  return res
}

export async function GET(req: NextRequest) {
  const g = offOrKey()
  if ('off' in g && g.off) return new NextResponse(null, { status: 404 })
  if ('misconfigured' in g) return NextResponse.json({ error: 'ledger_misconfigured' }, { status: 503 })
  const token = req.cookies.get(COOKIE)?.value ?? ''
  const db = createAdminSupabaseClient()
  const { plaintext, reason } = await loadDraft({ db, key: (g as { key: Buffer }).key, token, nowMs: Date.now() })
  if (!plaintext) return NextResponse.json({ ok: false, reason }, { status: reason === 'expired' ? 410 : 404 })
  return NextResponse.json({ ok: true, draft: plaintext })
}

export async function DELETE(req: NextRequest) {
  if (!isServerLedgerEnabled(process.env)) return new NextResponse(null, { status: 404 })
  const token = req.cookies.get(COOKIE)?.value
  if (token) {
    const db = createAdminSupabaseClient()
    await deleteDraft({ db, token })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE)
  return res
}
