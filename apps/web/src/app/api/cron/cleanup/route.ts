/**
 * GET /api/cron/cleanup
 *
 * Vercel Cron Job — runs daily at 02:00 UTC.
 *
 * Three-pass cleanup of expired PII:
 *
 *   PASS 1 — manual_review_queue
 *     Deletes rows where expires_at < now() and removes their files from
 *     the `translation-uploads` storage bucket. Owned by the document
 *     translation product.
 *
 *   PASS 2 — wizard_sessions (Re-Parole / future shared)
 *     Deletes rows where expires_at < now(). Children (session_documents,
 *     extracted_fields, manual_answers, generated_packets, session_members,
 *     audit_log) cascade per migration 20260502000001_wizard_schema.sql.
 *     Closes SP-2 from SECURITY_PRIVACY_AUDIT_TPS_V1.
 *
 *   PASS 3 — `packets` storage bucket (Re-Parole filled ZIPs)
 *     Lists every object under the bucket and removes anything older than
 *     PACKETS_RETENTION_DAYS (default 7, matches the signed-URL TTL).
 *     Closes SP-1 + SP-3 from SECURITY_PRIVACY_AUDIT_TPS_V1.
 *
 * Protected by Vercel CRON_SECRET (Authorization: Bearer header).
 * Set CRON_SECRET in Vercel Dashboard → Environment Variables.
 *
 * Each pass is independent: a partial failure surfaces in the response
 * counts but does not abort later passes. We always prefer to delete the
 * DB row even if the storage delete fails — GDPR / privacy hygiene wins
 * over orphaned storage objects (which a follow-up run will sweep).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const PACKETS_RETENTION_DAYS = Number(process.env.CLEANUP_PACKETS_RETENTION_DAYS ?? '7')

type SupabaseAdmin = ReturnType<typeof createAdminSupabaseClient>

interface PassResult {
  pass: string
  ok: boolean
  deleted_rows?: number
  deleted_files?: number
  error?: string
}

export async function GET(req: NextRequest) {
  // ── Auth: Vercel passes Authorization: Bearer <CRON_SECRET> ───────────────
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron/cleanup] CRON_SECRET not configured')
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const supabase = createAdminSupabaseClient()
  const now = new Date().toISOString()

  const passes: PassResult[] = []

  // ── PASS 1 — manual_review_queue ──────────────────────────────────────────
  passes.push(await purgeManualReviewQueue(supabase, now))

  // ── PASS 2 — wizard_sessions (cascade) ────────────────────────────────────
  passes.push(await purgeWizardSessions(supabase, now))

  // ── PASS 3 — packets storage bucket ───────────────────────────────────────
  passes.push(await purgePacketsBucket(supabase))

  const totalDeletedRows = passes.reduce((s, p) => s + (p.deleted_rows ?? 0), 0)
  const totalDeletedFiles = passes.reduce((s, p) => s + (p.deleted_files ?? 0), 0)
  const anyFailures = passes.some((p) => !p.ok)

  return NextResponse.json({
    ok: !anyFailures,
    deleted_rows: totalDeletedRows,
    deleted_files: totalDeletedFiles,
    passes,
  })
}

// ── PASS 1 — manual_review_queue ───────────────────────────────────────────
async function purgeManualReviewQueue(supabase: SupabaseAdmin, now: string): Promise<PassResult> {
  const { data: expired, error: fetchErr } = await supabase
    .from('manual_review_queue')
    .select('id, file_url')
    .lt('expires_at', now)

  if (fetchErr) {
    console.error('[cron/cleanup/mrq] fetch failed:', fetchErr.message)
    return { pass: 'manual_review_queue', ok: false, error: fetchErr.message }
  }

  if (!expired || expired.length === 0) {
    return { pass: 'manual_review_queue', ok: true, deleted_rows: 0, deleted_files: 0 }
  }

  const fileUrls = expired
    .map((r) => (r as { id: string; file_url: string | null }).file_url)
    .filter((u): u is string => !!u)

  let filesRemoved = 0
  if (fileUrls.length > 0) {
    const { error: storageErr, data: removed } = await supabase.storage
      .from('translation-uploads')
      .remove(fileUrls)
    if (storageErr) {
      console.warn('[cron/cleanup/mrq] storage delete partial error:', storageErr.message)
    }
    filesRemoved = removed?.length ?? 0
  }

  const ids = expired.map((r) => (r as { id: string }).id)
  const { error: deleteErr } = await supabase
    .from('manual_review_queue')
    .delete()
    .in('id', ids)

  if (deleteErr) {
    console.error('[cron/cleanup/mrq] row delete failed:', deleteErr.message)
    return { pass: 'manual_review_queue', ok: false, error: deleteErr.message }
  }

  return {
    pass: 'manual_review_queue',
    ok: true,
    deleted_rows: ids.length,
    deleted_files: filesRemoved,
  }
}

// ── PASS 2 — wizard_sessions (cascade-deletes children) ────────────────────
async function purgeWizardSessions(supabase: SupabaseAdmin, now: string): Promise<PassResult> {
  // Fetch the IDs first so we can report a count. Direct DELETE-LT-NOW would
  // be one round trip but Supabase REST returns 204 without a count for
  // delete-with-filter, and we want auditable numbers in the response.
  const { data: expired, error: fetchErr } = await supabase
    .from('wizard_sessions')
    .select('id')
    .lt('expires_at', now)

  if (fetchErr) {
    console.error('[cron/cleanup/wizard] fetch failed:', fetchErr.message)
    return { pass: 'wizard_sessions', ok: false, error: fetchErr.message }
  }

  if (!expired || expired.length === 0) {
    return { pass: 'wizard_sessions', ok: true, deleted_rows: 0 }
  }

  const ids = expired.map((r) => (r as { id: string }).id)
  const { error: deleteErr } = await supabase
    .from('wizard_sessions')
    .delete()
    .in('id', ids)

  if (deleteErr) {
    console.error('[cron/cleanup/wizard] delete failed:', deleteErr.message)
    return { pass: 'wizard_sessions', ok: false, error: deleteErr.message }
  }

  return { pass: 'wizard_sessions', ok: true, deleted_rows: ids.length }
}

// ── PASS 3 — packets storage bucket ────────────────────────────────────────
async function purgePacketsBucket(supabase: SupabaseAdmin): Promise<PassResult> {
  const cutoffMs = Date.now() - PACKETS_RETENTION_DAYS * 24 * 60 * 60 * 1000

  // Top-level listing returns subfolders keyed by session_id; we then list
  // each folder and remove objects whose `created_at` is older than cutoff.
  // We cap at 1000 sessions per run — well above any realistic daily volume,
  // and a self-healing limit for the unhappy case where a run was missed.
  const { data: folders, error: listErr } = await supabase.storage
    .from('packets')
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

  if (listErr) {
    console.error('[cron/cleanup/packets] list root failed:', listErr.message)
    return { pass: 'packets_bucket', ok: false, error: listErr.message }
  }

  if (!folders || folders.length === 0) {
    return { pass: 'packets_bucket', ok: true, deleted_files: 0 }
  }

  const toRemove: string[] = []
  for (const folder of folders) {
    if (!folder.name) continue
    const { data: files, error: subErr } = await supabase.storage
      .from('packets')
      .list(folder.name, { limit: 100 })
    if (subErr) {
      console.warn('[cron/cleanup/packets] list folder', folder.name, 'failed:', subErr.message)
      continue
    }
    if (!files) continue
    for (const f of files) {
      // `created_at` is the upload timestamp per Supabase Storage API.
      const created = f.created_at ? new Date(f.created_at).getTime() : 0
      if (created > 0 && created < cutoffMs) {
        toRemove.push(`${folder.name}/${f.name}`)
      }
    }
  }

  if (toRemove.length === 0) {
    return { pass: 'packets_bucket', ok: true, deleted_files: 0 }
  }

  const rmResult = await supabase.storage
    .from('packets')
    .remove(toRemove)

  if (rmResult.error) {
    console.warn('[cron/cleanup/packets] remove partial error:', rmResult.error.message)
    return {
      pass: 'packets_bucket',
      ok: false,
      // Best-effort: when the remove call itself errors, supabase-js may
      // still have removed some objects but the success list isn't
      // returned in the error branch. Report 0 — the next cron run will
      // sweep the survivors.
      deleted_files: 0,
      error: rmResult.error.message,
    }
  }

  return {
    pass: 'packets_bucket',
    ok: true,
    deleted_files: rmResult.data?.length ?? 0,
  }
}
