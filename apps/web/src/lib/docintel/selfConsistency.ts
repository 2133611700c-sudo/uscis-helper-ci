/**
 * docintel/selfConsistency — self-consistency as an INSTABILITY DETECTOR.
 * Design: docs/reports/SELF_CONSISTENCY_DESIGN.md.
 *
 * NOT a majority vote. NOT a "pick the right answer". Re-reading the same image and
 * comparing the extracted IDENTITY tells us whether the model is STABLE on this
 * (handwritten) document. Disagreement ⇒ force review. Agreement ≠ correctness —
 * it NEVER lowers review and NEVER claims the value is right.
 *
 * The identity tuple is built from the RAW model read (Cyrillic) BEFORE any
 * KMU-55 / gazetteer / dictionary normalization — otherwise a "smart" normalizer
 * could collapse two different model reads to the same string and hide instability.
 */

import crypto from 'node:crypto'
import { isIdentityCriticalField } from './antiFabricationGate'
import type { ExtractedDocField, VisionFieldRead } from './types'

/** Substrings of the identity tuple used for the instability hash (design §3). */
const IDENTITY_TUPLE_SUBSTRINGS = [
  'family_name',
  'given_name',
  'patronymic',
  'middle_name',
  'date_of_birth',
  'dob',
  'place_of_birth',
  'place_city',
] as const

function isTupleField(fieldId: string): boolean {
  const f = (fieldId ?? '').toLowerCase()
  return IDENTITY_TUPLE_SUBSTRINGS.some((s) => f.includes(s))
}

/** Compare-only normalization. Deliberately NOT KMU/dictionary. */
export function normalizeForCompare(s: string): string {
  return (s ?? '')
    .normalize('NFC')
    .replace(/[’'`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uk')
}

/**
 * Deterministic identity hash from a RAW vision read. Returns the hash and the
 * count of non-empty identity tuple fields (for the sparse-tuple guard).
 */
export function identityHash(rawFields: VisionFieldRead[]): { hash: string; count: number } {
  const entries: string[] = []
  for (const r of rawFields) {
    if (!r || !isTupleField(r.field)) continue
    const raw = (r.cyrillic || r.iso_date || '').toString()
    const norm = normalizeForCompare(raw)
    if (!norm) continue
    entries.push(`${r.field.toLowerCase()}=${norm}`)
  }
  entries.sort()
  const hash = crypto.createHash('sha256').update(entries.join('|')).digest('hex')
  return { hash, count: entries.length }
}

export type SelfConsistencyStatus = 'agree' | 'mismatch' | 'incomplete' | 'insufficient_identity_fields'

const REASON_BY_STATUS: Record<Exclude<SelfConsistencyStatus, 'agree'>, string> = {
  mismatch: 'self_consistency_identity_mismatch',
  incomplete: 'self_consistency_incomplete',
  insufficient_identity_fields: 'insufficient_identity_fields',
}

/**
 * Decide the status from the first read's tuple count and the other reads' hashes.
 * - <2 identity fields → insufficient_identity_fields (cannot self-verify).
 * - any later read errored (null) → incomplete.
 * - any later hash differs from the first → mismatch.
 * - all present and equal → agree.
 */
export function decideStatus(
  first: { hash: string; count: number },
  others: Array<{ hash: string; count: number } | null>,
): SelfConsistencyStatus {
  if (first.count < 2) return 'insufficient_identity_fields'
  if (others.some((o) => o === null)) return 'incomplete'
  if (others.some((o) => o!.hash !== first.hash)) return 'mismatch'
  return 'agree'
}

/**
 * Apply the outcome to the canonical fields. Pure. `agree` → unchanged. Otherwise
 * force review on identity-critical fields + append the reason. NEVER changes a
 * value, NEVER lowers a flag, NEVER claims correctness.
 */
export function applySelfConsistencyOutcome(
  fields: ExtractedDocField[],
  status: SelfConsistencyStatus,
): ExtractedDocField[] {
  if (status === 'agree') return fields
  const reason = REASON_BY_STATUS[status]
  return fields.map((f) => {
    if (!isIdentityCriticalField(f.field)) return f
    const reasons = Array.from(new Set([...(f.review_reasons ?? []), reason]))
    return { ...f, review_required: true, review_reasons: reasons }
  })
}
