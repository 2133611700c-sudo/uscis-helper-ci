/**
 * recordGuardBlock — L1 baseline write-hook. Persists a PII-free guard-block event to
 * public.guard_block_events (schema applied by the owner: gate_type, reason_code,
 * field_name, would_block, doc_type, session_id uuid). The rate-alert cron reads it.
 *
 * Behind GUARD_BLOCK_METRICS_ENABLED (default OFF → no-op). Best-effort, never throws.
 * NO field VALUES are stored — only the field NAME, gate, reason code (LAW 5).
 */
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** session_id is a uuid column — coerce a non-uuid (e.g. 'legacy') to null. */
export function asUuidOrNull(s: string | null | undefined): string | null {
  return s && UUID_RE.test(s) ? s : null
}

export interface GuardBlockEvent {
  gateType: string // confirmed_value_guard | ocr_field_safety
  reasonCode: string // PII-free reason
  /** would_block=true in SHADOW (would have blocked); false when it actually blocked */
  wouldBlock: boolean
  fieldName?: string | null
  docType?: string | null
  sessionId?: string | null
}

export function isGuardBlockMetricsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GUARD_BLOCK_METRICS_ENABLED === '1'
}

/** Record one guard-block event. OFF ⇒ no-op. Never throws. */
export async function recordGuardBlock(e: GuardBlockEvent): Promise<void> {
  if (!isGuardBlockMetricsEnabled()) return
  try {
    const supabase = createAdminSupabaseClient()
    await supabase.from('guard_block_events').insert({
      gate_type: e.gateType,
      reason_code: e.reasonCode,
      would_block: e.wouldBlock,
      field_name: e.fieldName ?? null,
      doc_type: e.docType ?? null,
      session_id: asUuidOrNull(e.sessionId),
    })
  } catch {
    /* metrics must never break the request */
  }
}
