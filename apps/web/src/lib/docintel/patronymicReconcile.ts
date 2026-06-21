/**
 * docintel/patronymicReconcile — P2.2 (SMART_NORMALIZE_ENABLED, default OFF).
 *
 * Moves the previously-orphaned `reconcilePatronymic` (was only reachable from
 * the dead orchestrator.ts) into the live document reader. Unlike the per-field
 * `toCanonicalValue`, this needs the full ExtractedDocField[] set, so it runs as
 * a post-pass.
 *
 * IMPORTANT scope decision (why this is a VALIDATION pass, not regeneration):
 * `reconcilePatronymic(read, givenName, sex)` expects `givenName` to be the
 * FATHER's given name (a patronymic is derived from the father, not the holder).
 * Our canonical field set has the HOLDER's `given_name`/`child_given_name`, not
 * the father's given name — passing it would fabricate a wrong patronymic. The
 * registry also has no `sex` field. So we do NOT regenerate from a sibling name.
 * We validate the read for well-formedness (sex inferred from the patronymic's
 * own suffix) and raise review on anything malformed. This honors "конфликт →
 * review" without ever emitting an unverifiable value.
 *
 * Hard rules (no exceptions):
 *   - NEVER silently replace a read with a derived value: any change forces review.
 *   - NEVER lower an existing review flag (handwriting already forces review).
 *   - Malformed / undeterminable patronymic → keep the value, force review.
 */

import { reconcilePatronymic, isValidPatronymic, transliterateKMU55 } from '@uscis-helper/knowledge'
import type { Sex } from '@uscis-helper/knowledge'
import type { ExtractedDocField } from './types'

/** Field ids that hold a single-token patronymic, per the document registry. */
const PATRONYMIC_FIELDS = new Set(['patronymic', 'middle_name', 'child_patronymic'])

/** Infer sex from the patronymic's own suffix (ович/ич → M, івна/ічна → F). */
function inferSexFromPatronymic(cyrillic: string): Sex | null {
  if (!cyrillic) return null
  if (isValidPatronymic(cyrillic, 'F')) return 'F'
  if (isValidPatronymic(cyrillic, 'M')) return 'M'
  return null
}

function sameLatin(a: string | null, b: string | null): boolean {
  return (a ?? '').toLocaleLowerCase('uk') === (b ?? '').toLocaleLowerCase('uk')
}

/**
 * Validate every patronymic field. Returns a NEW array (pure); non-patronymic
 * fields pass through untouched.
 */
export function reconcilePatronymicFields(fields: ExtractedDocField[]): ExtractedDocField[] {
  return fields.map((f) => {
    if (!PATRONYMIC_FIELDS.has(f.field)) return f // not a patronymic field

    const patrCy = (f.raw_cyrillic ?? '').trim()
    if (!patrCy) return f // nothing read — nothing to reconcile

    const sex = inferSexFromPatronymic(patrCy)

    // Malformed read: sex cannot be inferred → cannot validate. Force review,
    // keep the raw value (no guessing, no blanking).
    if (!sex) {
      return { ...f, review_required: true }
    }

    // givenName intentionally '' — we do NOT have the father's given name, and
    // must not regenerate from the holder's name. With a valid read + sex, this
    // returns read_valid (value normalized to title-case Cyrillic).
    const res = reconcilePatronymic(patrCy, '', sex)

    if (!res.value) {
      return { ...f, review_required: true }
    }

    const newLatin = transliterateKMU55(res.value) || f.value
    const changed = !sameLatin(newLatin, f.value)

    return {
      ...f,
      value: newLatin,
      // Never lower an existing flag; raise on a reconcile-review or any change.
      review_required: f.review_required || res.review_required || changed,
    }
  })
}
