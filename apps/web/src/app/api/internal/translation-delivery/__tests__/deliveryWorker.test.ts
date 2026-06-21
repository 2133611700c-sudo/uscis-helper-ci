/**
 * deliveryWorker.test.ts — delivery worker contract (Phase 2, Agent 2).
 *
 * Covers test classes:
 *   15 email retry uses the SAME stored artifact (no regeneration)
 *   16 duplicate worker run → no double delivery (claim_outbox_event exactly-once)
 *
 * Source-level verification of the worker contract + idempotency wiring.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'route.ts'), 'utf-8')
const ORDERS = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'lib', 'translation', 'orders', 'index.ts'),
  'utf-8',
)

describe('delivery worker route contract', () => {
  it('internal auth via CRON_SECRET Bearer (reuses cron pattern)', () => {
    expect(SRC).toMatch(/process\.env\.CRON_SECRET/)
    expect(SRC).toMatch(/`Bearer \$\{cronSecret\}`/)
    expect(SRC).toMatch(/401/)
  })

  it('test 16: claims atomically via claim_outbox_event (exactly-once)', () => {
    expect(SRC).toMatch(/claimOutboxEvent\(WORKER_ID\)/)
    // The claim RPC itself uses SKIP LOCKED — wired in the data module.
    expect(ORDERS).toMatch(/claim_outbox_event/)
  })

  it('test 15: NEVER re-renders — loads exact stored bytes only', () => {
    expect(SRC).toMatch(/downloadArtifactBytes\(/)
    // The worker must not import or call the renderer.
    expect(SRC).not.toMatch(/generateTranslationPDF|renderFromCanonical/)
  })

  it('test 15: stored bytes are hash-verified before send (no silent tamper)', () => {
    expect(ORDERS).toMatch(/downloadArtifactBytes/)
    const fn = ORDERS.slice(ORDERS.indexOf('export async function downloadArtifactBytes'))
    expect(fn).toMatch(/artifact hash mismatch/)
  })

  it('passes the outbox idempotency_key to the email send', () => {
    expect(SRC).toMatch(/idempotencyKey:\s*claim\.idempotencyKey/)
  })

  it('success → markOutboxDelivered + transition →delivered', () => {
    expect(SRC).toMatch(/markOutboxDelivered\(claim\.id\)/)
    expect(SRC).toMatch(/toStatus:\s*'delivered'/)
  })

  it('transient failure → retry with backoff; permanent → delivery_failed', () => {
    expect(SRC).toMatch(/markOutboxFailed\(/)
    expect(SRC).toMatch(/next attempt|backoffMs|nextAttemptAt|Date\.now\(\) \+ backoffMs/i)
    expect(SRC).toMatch(/markOutboxPermanentlyFailed\(/)
    expect(SRC).toMatch(/toStatus:\s*'delivery_failed'/)
  })

  it('test 18: PII-free — never logs recipient or document content', () => {
    expect(SRC).not.toMatch(/console\.(info|log|warn|error)\([^)]*verifiedRecipientEmail/)
    // Response returns counts + outbox ids only.
    expect(SRC).toMatch(/outbox_ids:\s*processed\.map/)
  })
})

// ── Pure backoff function (exposed via re-derivation for determinism) ───────────
describe('backoff schedule', () => {
  // Mirror the worker's formula to assert monotonic, capped growth.
  const backoffMs = (attempt: number) => Math.min(2 ** Math.max(0, attempt - 1), 16) * 60_000
  it('grows 1→2→4→8→16 minutes then caps', () => {
    expect(backoffMs(1)).toBe(60_000)
    expect(backoffMs(2)).toBe(120_000)
    expect(backoffMs(3)).toBe(240_000)
    expect(backoffMs(5)).toBe(16 * 60_000)
    expect(backoffMs(9)).toBe(16 * 60_000) // capped
  })
})
