/**
 * fieldAccessor — THE single sanctioned way to read a value out of a CanonicalField.
 *
 * Phase 1 ("one canonical currency"): every consumer (Translation / I-821 / I-131 /
 * I-765) must read document-derived values through here, never re-implement the
 * release-value precedence. This kills the copy-pasted rule in 4 adapters AND the
 * Re-Parole blind spot (its adapter read normalizedValue only, ignoring C3).
 *
 * C3 (ADR-017) value-resolution semantics — EXACT, per CanonicalField.finalValue:
 *   - finalValue === null      → C3 ran and REJECTED the field. Return null.
 *                                 NEVER fall back to normalizedValue/rawValue.
 *   - finalValue is a string   → C3 accepted; this is the release value.
 *   - finalValue === undefined → C3 did not run (flag OFF / field unprocessed).
 *                                 Fall back to normalizedValue ?? rawValue.
 *
 * FORBIDDEN (the bug this prevents): a blind `finalValue ?? normalizedValue ?? rawValue`
 * — that releases the normalized value when C3 deliberately rejected (finalValue=null),
 * resurrecting a value the safety layer killed.
 */
import type { CanonicalDocumentResult, CanonicalField } from '../types'
import { keysFor } from './keyAliases'

/** True once C3 (applyOcrFieldSafety) has run on this field (finalValue set, null or string). */
export function wasFinalizationApplied(field: CanonicalField): boolean {
  return field.finalValue !== undefined
}

/** True when C3 ran and rejected the field (finalValue explicitly null) ⇒ no value may be released. */
export function isCanonicalFieldRejected(field: CanonicalField): boolean {
  return field.finalValue === null
}

/**
 * The release value for a field, honoring C3 exactly. null = nothing safe to release
 * (rejected, or genuinely empty). Never invents, never resurrects a rejected value.
 */
export function getCanonicalValue(field: CanonicalField): string | null {
  // C3 ran and rejected → hard stop, no fallback.
  if (field.finalValue === null) return null
  // C3 accepted → the release value.
  if (typeof field.finalValue === 'string') {
    const v = field.finalValue.trim()
    return v.length ? v : null
  }
  // C3 not applied (undefined) → backward-compat fallback.
  const v = (field.normalizedValue ?? field.rawValue ?? '').trim()
  return v.length ? v : null
}

/** Find a field by exact key. */
export function getField(result: CanonicalDocumentResult, key: string): CanonicalField | null {
  return result.fields.find((f) => f.key === key) ?? null
}

/** Read a value by exact key (release semantics). null if absent or rejected. */
export function getValueByKey(result: CanonicalDocumentResult, key: string): string | null {
  const f = getField(result, key)
  return f ? getCanonicalValue(f) : null
}

/**
 * Read a value by its primary canonical key, accepting any registered alias. The
 * primary key wins if present; otherwise the first alias that has a (non-rejected)
 * value. Returns the matched key too, so a consumer can audit provenance.
 */
export function getValueByAliases(
  result: CanonicalDocumentResult,
  primaryKey: string,
): { value: string | null; matchedKey: string | null; reviewRequired: boolean } {
  for (const k of keysFor(primaryKey)) {
    const f = getField(result, k)
    if (!f) continue
    const v = getCanonicalValue(f)
    if (v !== null) return { value: v, matchedKey: k, reviewRequired: f.reviewRequired }
  }
  // No value anywhere — report the primary field's review state if it exists.
  const primary = getField(result, primaryKey)
  return { value: null, matchedKey: null, reviewRequired: primary?.reviewRequired ?? false }
}

/** Keys of every field that still needs human review. */
export function reviewRequiredKeys(result: CanonicalDocumentResult): string[] {
  return result.fields.filter((f) => f.reviewRequired).map((f) => f.key)
}
