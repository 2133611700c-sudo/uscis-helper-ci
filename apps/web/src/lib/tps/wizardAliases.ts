/**
 * Field-name aliases applied to the wizard's merged OCR result before it is
 * fed into the answers builder / review screen.
 *
 * Background — 2026-05-20 audit (TPS_CLEAN_SESSION_REAL_UPLOAD_E2E_AUDIT):
 * The I-94 OCR module extracts the class-of-admission code (e.g. "UHP",
 * "Parole", "B-2") into the field `i94_class_of_admission` because that
 * matches the CBP label on the printed I-94. The USCIS forms ask for the
 * same fact under the wording "Status at last entry":
 *
 *   - I-821 (01/20/25) Part 2 Item 19 → `Part2_Item19_ImmigrationStatus[0]`
 *   - I-765 (08/21/25) Line 23        → `Line23_StatusLastEntry[0]`
 *
 * The PDF mappers (i821FieldMap.ts:237, i765FieldMap.ts:145) both look at
 * `TPSAnswers.status_at_last_entry`. If we don't bridge `i94_class_of_admission`
 * to `status_at_last_entry` in the wizard, both PDFs ship with the field
 * blank even though OCR already recovered the value — the user is told
 * "Не найдено — введите вручную" on the review screen for data they did
 * provide.
 *
 * Keep this helper pure and side-effect-free so it can be unit-tested
 * without touching React.
 */

/** Shape any `mergedFields` entry must satisfy to be aliasable. */
export interface AliasFieldShape {
  value: string
  requires_review?: boolean
}

/**
 * Returns a new merged-fields record with the i94 class-of-admission alias
 * applied. Never mutates the input. Idempotent: if `status_at_last_entry`
 * is already present, the alias does not overwrite it (manual edits and
 * explicit OCR wins).
 *
 * The aliased entry is force-marked `requires_review: true` so the user
 * sees a "проверьте" badge — class codes like "UHP" may need to be expanded
 * before signing. T is inferred from the caller's concrete entry type, so
 * extra fields (source, doc_slot, source_document_id, etc.) are preserved
 * through the spread without losing precision.
 */
export function applyI94StatusAlias<T extends AliasFieldShape>(
  merged: Record<string, T>,
): Record<string, T> {
  const src = merged.i94_class_of_admission
  if (!src || typeof src.value !== 'string' || src.value === '') return merged
  if (merged.status_at_last_entry) return merged
  return {
    ...merged,
    status_at_last_entry: { ...src, requires_review: true },
  }
}
