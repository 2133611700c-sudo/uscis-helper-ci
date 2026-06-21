/**
 * formatName.ts — S3 no-silent-correction for person names.
 *
 * The naive title-cast `s[0] + s.slice(1).toLowerCase()` used in the EAD and
 * passport modules CORRUPTS the controlling Latin spelling of real names and
 * does so with review_required=false:
 *   "O'BRIEN"          → "O'brien"            (apostrophe segment lowercased)
 *   "PETRENKO-VASYL"   → "Petrenko-vasyl"     (hyphen segment lowercased)
 *   "VAN DER BERG"     → "Van der berg"       (EAD never split on spaces)
 *   "McDonald"         → "Mcdonald"           (deliberate mixed case destroyed)
 * Per the project rule the MRZ/EAD Latin spelling is CONTROLLING, so silently
 * mangling its case is a correction we must not make blindly (the analogue of the
 * geography silent-snap fixed in gazetteer.ts).
 *
 * Rule:
 *  - A read that is ALREADY mixed-case carries deliberate casing
 *    ("McDonald", "O'Brien", "DeWitt") — PRESERVE it verbatim, never re-case.
 *  - An all-UPPER or all-lower read (typical MRZ / EAD print) is title-cased per
 *    alphabetic segment, splitting on space / hyphen / apostrophe so each part
 *    keeps its own initial capital.
 *
 * The caller MUST still store the original separately as raw_value; this returns
 * only the normalized/display form.
 *
 * Residual (documented, not silently wrong): an all-caps "MCDONALD" with no
 * mixed-case signal title-cases to "Mcdonald" — the internal capital cannot be
 * recovered from caps alone. raw_value is preserved for the reviewer; a dictionary
 * of Mc/Mac/De-style names is out of scope here.
 */
export function formatLatinName(raw: string): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const hasLower = /\p{Ll}/u.test(s)
  const hasUpper = /\p{Lu}/u.test(s)
  // Mixed case ⇒ deliberate; keep as-is (do not destroy "McDonald" / "O'Brien").
  if (hasLower && hasUpper) return s
  // All-upper or all-lower ⇒ title-case each alphabetic segment. \p{L}+ stops at
  // space, hyphen and apostrophe, so every part is capitalized independently.
  return s.replace(/\p{L}+/gu, (seg) =>
    seg.charAt(0).toLocaleUpperCase() + seg.slice(1).toLocaleLowerCase(),
  )
}
