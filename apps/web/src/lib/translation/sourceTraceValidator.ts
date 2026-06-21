/**
 * Source Trace Validator — v5 §27.
 *
 * "No source trace for a critical field → no final PDF."
 *
 * Checks that every critical field declared by the active document module
 * has a corresponding SourceTrace with a non-empty source_label,
 * source_zone, raw_value, normalized_value, and confidence ≥ threshold.
 *
 * This validator runs BEFORE TranslationQaValidator. It is the gate that
 * answers "do we even know where this number came from?" before any
 * forbidden-phrase scan or layout check.
 */

import type { ExtractedField, SourceTrace, PacketState } from './types'
import { findDocumentModule } from './modules/registry'
import { resolveDocumentModule } from './modules/classifier'

export interface SourceTraceValidationResult {
  ok: boolean
  /** Critical fields whose SourceTrace is missing or incomplete. */
  missing: string[]
  /** Critical fields whose SourceTrace has confidence below threshold. */
  low_confidence: Array<{ field: string; confidence: number }>
  /** Critical fields whose normalized_value disagrees with the field's normalized_value. */
  mismatched_value: Array<{ field: string; trace_value: string; field_value: string }>
  /** All checks performed (for audit). */
  passes: string[]
  /** Render is allowed only when ok=true. */
  review_required: boolean
}

/**
 * A SourceTrace is valid when:
 *   1. it exists for every critical field in the active module
 *   2. every entry has source_label, source_zone, raw_value,
 *      normalized_value (non-empty)
 *   3. every entry has confidence ≥ minConfidence (default 0.85, the same
 *      threshold the classifier uses for routing)
 *   4. every entry's normalized_value matches the corresponding
 *      ExtractedField.normalized_value (no silent divergence)
 */
export function validateSourceTrace(
  packet: PacketState,
  minConfidence: number = 0.85,
): SourceTraceValidationResult {
  const moduleType = packet.document_type ?? 'unknown'
  // First try direct registry lookup (canonical key).
  // Fall back to alias-aware resolver so legacy DocumentType values
  // (e.g. 'ua_passport_booklet') resolve to the right module.
  const mod = findDocumentModule(moduleType) ?? resolveDocumentModule(moduleType, 1.0)

  const missing: string[] = []
  const low_confidence: SourceTraceValidationResult['low_confidence'] = []
  const mismatched_value: SourceTraceValidationResult['mismatched_value'] = []

  // Manual-review fallback module has no critical fields to validate
  // against (it's the sentinel route). This validator's job is *only*
  // source-trace presence — punt to render-gate for allowAutoPdf check.
  if (!mod || mod.documentType === 'manual_review_required') {
    return {
      ok: true,
      missing: [],
      low_confidence: [],
      mismatched_value: [],
      passes: ['source_trace_check_skipped_no_active_module'],
      review_required: false,
    }
  }

  const criticalFieldKeys = mod.criticalFields.map(f => f.key)
  const traceByField = new Map<string, SourceTrace>()
  for (const t of packet.source_traces) {
    traceByField.set(t.field, t)
  }
  const fieldByName = new Map<string, ExtractedField>()
  for (const f of packet.extracted_fields) {
    fieldByName.set(f.field, f)
  }

  for (const key of criticalFieldKeys) {
    const trace = traceByField.get(key)
    if (!trace) {
      missing.push(key)
      continue
    }
    if (
      !trace.source_label?.trim() ||
      !trace.source_zone?.trim() ||
      !trace.raw_value?.trim() ||
      !trace.normalized_value?.trim()
    ) {
      missing.push(key)
      continue
    }
    if (typeof trace.confidence !== 'number' || trace.confidence < minConfidence) {
      low_confidence.push({ field: key, confidence: trace.confidence ?? 0 })
    }

    const f = fieldByName.get(key)
    if (
      f &&
      f.normalized_value &&
      trace.normalized_value &&
      f.normalized_value.trim() !== trace.normalized_value.trim()
    ) {
      mismatched_value.push({
        field: key,
        trace_value: trace.normalized_value.trim(),
        field_value: f.normalized_value.trim(),
      })
    }
  }

  const ok = missing.length === 0 && low_confidence.length === 0 && mismatched_value.length === 0

  return {
    ok,
    missing,
    low_confidence,
    mismatched_value,
    passes: ['source_trace_check'],
    review_required: !ok,
  }
}
