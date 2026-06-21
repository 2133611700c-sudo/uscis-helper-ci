/**
 * Correction Classifier — v5 §22.
 *
 * Translation Memory MUST NOT learn from every user edit blindly. Each
 * user-applied correction on a critical field is classified into:
 *
 *   - 'controlling_spelling'    user gives a Latin spelling that wins for
 *                               the entire packet (and future packets of
 *                               the same user). Persists to TM.
 *   - 'ocr_error'               OCR misread a glyph; correction is local
 *                               to this session. NOT persisted.
 *   - 'one_document_exception'  user wants a one-off override that does
 *                               NOT propagate to other documents (e.g. a
 *                               legacy USSR spelling for a single doc).
 *                               NOT persisted to packet anchor or TM.
 *
 * Classification heuristic (deterministic; no LLM):
 *   1. If the user-supplied value contains only Latin letters AND the
 *      field is a name field AND the original raw_value was Cyrillic →
 *      'controlling_spelling'.
 *   2. If the user-supplied value differs from raw_value by ≤ 2 character
 *      substitutions AND both values are in the same script → 'ocr_error'.
 *   3. Otherwise → 'one_document_exception'.
 *
 * The user can override the classification on the EvidenceReviewPage UI
 * (e.g. "this is my legal name from passport" => promote to
 * controlling_spelling regardless of heuristic).
 */

import type { ExtractedField } from './types'

export type CorrectionClass = 'controlling_spelling' | 'ocr_error' | 'one_document_exception'

export interface CorrectionInput {
  /** Internal field name, e.g. 'surname', 'date_of_birth', 'series'. */
  field: string
  /** Raw OCR value before any user edit. */
  raw_value: string
  /** Value the user typed/picked on the EvidenceReviewPage. */
  user_value: string
  /** When the user explicitly tagged the correction class via UI, that
   *  wins over the heuristic. */
  user_declared_class?: CorrectionClass
}

export interface CorrectionDecision {
  classification: CorrectionClass
  /** True iff the heuristic would have agreed with the final classification. */
  heuristic_agreed: boolean
  /** If user_declared_class was provided, this records what the heuristic
   *  would have picked (useful for audit). */
  heuristic_classification: CorrectionClass
  /** True iff translation memory MUST persist this correction. */
  persist_to_translation_memory: boolean
  /** True iff this correction MUST update PacketState.controlling_spelling. */
  update_packet_anchor: boolean
}

const NAME_FIELD_KEYS = new Set([
  'surname', 'given_name', 'given_names', 'patronymic',
  'father_full_name', 'mother_full_name',
  'spouse_1_surname_before', 'spouse_1_surname_after',
  'spouse_2_surname_before', 'spouse_2_surname_after',
  'child_surname', 'child_given_name', 'child_patronymic',
])

const LATIN_ONLY = /^[A-Za-z\s'\-.]+$/u
const CYRILLIC_PRESENT = /[Ѐ-ӿ]/u

/** Levenshtein-style cheap edit distance (capped at 3). */
function editDistanceCapped(a: string, b: string, cap: number = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > cap) return cap + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function sameScript(a: string, b: string): boolean {
  const aCyr = CYRILLIC_PRESENT.test(a)
  const bCyr = CYRILLIC_PRESENT.test(b)
  return aCyr === bCyr
}

function heuristicClassify(input: CorrectionInput): CorrectionClass {
  const { field, raw_value, user_value } = input
  const isNameField = NAME_FIELD_KEYS.has(field)

  // Rule 1: user typed Latin name where source was Cyrillic →
  //         controlling_spelling.
  if (
    isNameField &&
    LATIN_ONLY.test(user_value.trim()) &&
    CYRILLIC_PRESENT.test(raw_value)
  ) {
    return 'controlling_spelling'
  }

  // Rule 2: small edit distance + same script → ocr_error.
  if (sameScript(raw_value, user_value)) {
    const d = editDistanceCapped(raw_value.trim(), user_value.trim(), 3)
    if (d <= 2) return 'ocr_error'
  }

  // Rule 3: anything else is a one-document exception.
  return 'one_document_exception'
}

export function classifyCorrection(input: CorrectionInput): CorrectionDecision {
  const heuristic = heuristicClassify(input)
  const final = input.user_declared_class ?? heuristic

  return {
    classification: final,
    heuristic_classification: heuristic,
    heuristic_agreed: final === heuristic,
    persist_to_translation_memory: final === 'controlling_spelling',
    update_packet_anchor: final === 'controlling_spelling',
  }
}

/**
 * Convenience: stamp the classification onto an ExtractedField. Returns
 * a new field object (does not mutate). Caller is responsible for writing
 * back to the packet.
 */
export function stampCorrectionClass(
  field: ExtractedField,
  raw_value_before_edit: string,
  user_declared_class?: CorrectionClass,
): ExtractedField {
  const decision = classifyCorrection({
    field: field.field,
    raw_value: raw_value_before_edit,
    user_value: field.normalized_value,
    user_declared_class,
  })
  return {
    ...field,
    user_corrected: true,
    correction_class: decision.classification,
  }
}
