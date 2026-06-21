/**
 * canonical/manualOverride.ts — the Manual Override Contract
 * (FIELD_CONFIDENCE_AND_CRITICALITY_POLICY §D, master plan Phase 2–3).
 *
 * A user correction is the LOWEST authority source, applied ONLY after explicit
 * user confirmation. The override:
 *   - sets the value to the user's entry and `source = 'manual_user_entry'`;
 *   - PRESERVES the prior machine value as evidence (never lost) + records a
 *     `rejectedReason` when it actually replaced a different value;
 *   - clears `reviewRequired` — the override IS the human confirmation for this
 *     field (this is how a critical field's mandatory review is resolved);
 *   - never silently overrides a HIGHER-authority source: that is the caller's
 *     gate, but we record the prior source in the rejected evidence so the
 *     downgrade is auditable.
 *
 * Pure function — no I/O.
 */
import type { CanonicalField, FieldEvidence } from './types'
import { buildConfidence, materiallyDifferent } from './policy'

export function applyManualOverride(field: CanonicalField, userValue: string): CanonicalField {
  const value = (userValue ?? '').trim()
  const prior = field.normalizedValue ?? field.rawValue
  const replacedDifferent = prior != null && prior !== '' && materiallyDifferent(prior, value)

  // Preserve the prior machine value as evidence — never lose what the document said.
  const evidence: FieldEvidence[] = [...field.evidence]
  if (prior != null && prior !== '' && !evidence.some((e) => e.value === prior && e.provider === 'pre_manual_override')) {
    evidence.push({
      value: prior,
      source: field.source,
      confidence: field.confidence.final,
      provider: 'pre_manual_override',
    })
  }

  return {
    ...field,
    normalizedValue: value,
    source: 'manual_user_entry',
    // User-confirmed → full source_match; final derives to 1.0.
    confidence: buildConfidence({ ocr: null, field_match: null, normalization: 1, source_match: 1 }),
    reviewRequired: false, // the override is the human confirmation
    reviewReasons: [],
    evidence,
    ...(replacedDifferent ? { rejectedReason: 'superseded_by_manual_user_entry' } : {}),
  }
}
