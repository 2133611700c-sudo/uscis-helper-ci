// L1 guard-block rate check (hourly). Alerts the owner if the guard-block rate over
// the rolling window exceeds a CALIBRATED threshold. Threshold comes from
// GUARD_BLOCK_RATE_THRESHOLD (env) — UNSET ⇒ Infinity ⇒ never alerts (measurement-
// first: collect baseline first, set the number, then it alerts). Uses tested logic.
import { supabase } from './lib/supabase-client'
import { sendOwnerAlert } from './lib/owner-alert'
import { countInWindow, exceedsRate, rateAlertSummary, type RateWindow } from '../../apps/web/src/lib/documentSafety/guardBlockRate'

const WINDOW_MS = 60 * 60 * 1000 // 1h

async function main(): Promise<void> {
  const thresholdRaw = process.env.GUARD_BLOCK_RATE_THRESHOLD
  const threshold = thresholdRaw && Number.isFinite(Number(thresholdRaw)) ? Number(thresholdRaw) : Infinity
  const window: RateWindow = { windowMs: WINDOW_MS, threshold }

  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  const { data: rows, error } = await supabase
    .from('guard_block_events')
    .select('created_at')
    .gte('created_at', since)
  if (error) throw error

  const now = Date.now()
  const times = ((rows ?? []) as Array<{ created_at: string }>).map((r) => new Date(r.created_at).getTime())
  const count = countInWindow(times, now, WINDOW_MS)

  if (exceedsRate(times, now, window)) {
    await sendOwnerAlert(`[rate-alert] ${rateAlertSummary(count, window)}`, { count, threshold })
    console.log(`[guard-block-rate-check] ALERT count=${count} threshold=${threshold}`)
  } else {
    console.log(`[guard-block-rate-check] ok count=${count} threshold=${Number.isFinite(threshold) ? threshold : 'uncalibrated'}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
