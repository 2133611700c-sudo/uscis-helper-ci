/**
 * canonical/overrideLoop.ts
 *
 * Closes the orphan canonical override loop.
 *
 * PROBLEM (audit-confirmed): the live user/operator correction path writes to the
 * legacy `user_corrections` table. The canonical_overrides table — and the correct
 * /api/canonical/[id]/override append API with optimistic concurrency + INV-11 null
 * semantics — has ZERO callers. So resolveCanonicalDocument never sees a human edit,
 * and "canonical is the source of truth" is false.
 *
 * THIS MODULE: a flag-gated DUAL-WRITE. When a field is corrected/confirmed and a
 * canonical_document_id is known, append a confirmed canonical override via the
 * existing appendCanonicalOverride RPC — IN ADDITION to the unchanged legacy write.
 *
 * SAFETY CONTRACT:
 *   - Flag CANONICAL_OVERRIDE_LOOP default OFF → this function is never invoked by
 *     callers (they gate on getOverrideLoopMode() !== 'off'); when off the legacy
 *     path is byte-identical to today.
 *   - In shadow the legacy write stays authoritative for output. The canonical
 *     append is best-effort: a failure (incl. 409 stale version) is logged PII-free
 *     and returned as a result; it NEVER throws to the caller and NEVER changes the
 *     legacy correction outcome.
 *   - The base canonical_documents row is NEVER mutated (append-only RPC).
 *   - INV-11: overrideValue=null is an intentional rejection and is preserved.
 *   - Optimistic concurrency: expected_version = current MAX(version) of the
 *     canonical's overrides (0 when none). A concurrent appender → 409 → reported.
 *   - PII: never logs override values; only event, canonical_id, field_key, count.
 */

import {
  loadCanonicalDocumentById,
  listCanonicalOverrides,
  appendCanonicalOverride,
  getEffectiveValue,
  type CanonicalOverride,
} from './persistence'
import { CanonicalConcurrencyError } from './persistence/errors'

/** Source of a correction routed into the canonical chain. */
export type OverrideLoopSource = 'user_edit' | 'certifier_override'

export interface DualWriteInput {
  /** Canonical document UUID. Absent → caller must skip (legacy-only, fail-safe). */
  canonicalDocumentId: string
  /** Canonical field key (== translation snake_case field name, e.g. 'surname'). */
  fieldKey: string
  /**
   * New confirmed value. null is a LEGAL intentional rejection (INV-11): the human
   * explicitly says "no value". A non-null string is the corrected value.
   */
  newValue: string | null
  /** 'user_edit' (end user) | 'certifier_override' (operator). */
  source: OverrideLoopSource
  /** PII-free actor identifier (e.g. 'user', 'certifier'). */
  actor?: string
  /** PII-free reason code (e.g. 'manual', 'ocr_error'). NEVER a field value. */
  reason?: string
}

export type DualWriteResult =
  | { ok: true; newVersion: number; expectedVersion: number }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'conflict'; expectedVersion: number }
  | { ok: false; kind: 'storage_error' }

/**
 * Append a confirmed canonical override mirroring a live correction.
 *
 * Best-effort: returns a typed result instead of throwing. Callers in shadow mode
 * MUST ignore failures (legacy write is authoritative). The function is only ever
 * called when CANONICAL_OVERRIDE_LOOP !== 'off'.
 *
 * The prior effective value (base finalValue resolved against the latest confirmed
 * override) is preserved into originalRejectionReasons-free audit context via the
 * reason code only — we never persist the prior VALUE here (PII). The audit chain
 * already records prior state in user_corrections.old_value (legacy) and in the
 * monotonic override versions.
 */
export async function appendCorrectionAsCanonicalOverride(
  input: DualWriteInput,
): Promise<DualWriteResult> {
  const { canonicalDocumentId, fieldKey, newValue, source, actor, reason } = input

  // 1. Load base. null → not found (caller skips silently, fail-safe). Throw → storage error.
  let base
  try {
    base = await loadCanonicalDocumentById(canonicalDocumentId)
  } catch {
    console.warn('[canonical/override-loop] load failed (best-effort skip)', {
      event: 'override_loop_storage_error',
      canonical_id: canonicalDocumentId,
      step: 'load',
    })
    return { ok: false, kind: 'storage_error' }
  }
  if (!base) {
    console.info('[canonical/override-loop] canonical not found — legacy-only', {
      event: 'override_loop_not_found',
      canonical_id: canonicalDocumentId,
    })
    return { ok: false, kind: 'not_found' }
  }

  // 2. Current override set → expected_version (optimistic concurrency) + prior
  //    effective value (audit only; never logged as a value).
  let existing: CanonicalOverride[]
  try {
    existing = await listCanonicalOverrides(canonicalDocumentId)
  } catch {
    console.warn('[canonical/override-loop] list failed (best-effort skip)', {
      event: 'override_loop_storage_error',
      canonical_id: canonicalDocumentId,
      step: 'list',
    })
    return { ok: false, kind: 'storage_error' }
  }
  const expectedVersion = existing.length
    ? Math.max(...existing.map((o) => o.version ?? 0))
    : 0

  // Compute the prior effective value purely to drive audit reasoning (kept local,
  // never persisted/logged as a value — PII). The latest confirmed override per key
  // wins; otherwise base finalValue.
  const baseField = base.fields.find((f) => f.key === fieldKey)
  let priorOverride: CanonicalOverride | undefined
  for (const o of existing) {
    if (o.fieldKey === fieldKey) priorOverride = o
  }
  const priorEffective = baseField
    ? getEffectiveValue(baseField, priorOverride)
    : undefined
  // Idempotency guard: if the prior effective value already equals the new value,
  // there is nothing to record. Avoids version churn on repeated confirms.
  if (priorEffective === newValue && newValue !== undefined) {
    console.info('[canonical/override-loop] no-op (value unchanged)', {
      event: 'override_loop_noop',
      canonical_id: canonicalDocumentId,
      field_key: fieldKey,
    })
    return { ok: true, newVersion: expectedVersion, expectedVersion }
  }

  // 3. Append a CONFIRMED override. INV-11: newValue=null persists as an explicit
  //    rejection. confirmed=true so resolveCanonicalDocument releases the value.
  const override: CanonicalOverride = {
    fieldKey,
    overrideValue: newValue,
    source,
    confirmed: true,
    actor,
    reason,
    // Preserve base review reasons into the audit chain (no PII — reason codes only).
    originalRejectionReasons: baseField?.reviewReasons,
  }

  try {
    const newVersion = await appendCanonicalOverride(
      canonicalDocumentId,
      [override],
      { expectedVersion },
    )
    console.info('[canonical/override-loop] dual-write appended', {
      event: 'override_loop_appended',
      canonical_id: canonicalDocumentId,
      field_key: fieldKey,
      source,
      new_version: newVersion,
    })
    return { ok: true, newVersion, expectedVersion }
  } catch (err) {
    if (err instanceof CanonicalConcurrencyError) {
      console.warn('[canonical/override-loop] version conflict (best-effort skip)', {
        event: 'override_loop_conflict',
        canonical_id: canonicalDocumentId,
        field_key: fieldKey,
        expected_version: expectedVersion,
      })
      return { ok: false, kind: 'conflict', expectedVersion }
    }
    console.warn('[canonical/override-loop] append failed (best-effort skip)', {
      event: 'override_loop_storage_error',
      canonical_id: canonicalDocumentId,
      field_key: fieldKey,
      step: 'append',
    })
    return { ok: false, kind: 'storage_error' }
  }
}
