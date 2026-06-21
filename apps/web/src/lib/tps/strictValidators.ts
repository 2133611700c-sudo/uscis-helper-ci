/**
 * Strict canonical-shape validators for OCR-derived TPS fields.
 *
 * Reason: the OCR pipeline (Google Vision + module parsers + AI brain)
 * occasionally emits a field whose value is RAW OCR TEXT instead of the
 * normalized shape the wizard / PDF mappers expect. Example caught in
 * the 2026-05-21 FIX_TPS_PASSPORT_MRZ_REAL_DOCUMENT_FAILURE audit:
 * the booklet module returned dob with normalized_value=null and
 * raw_value="Date of birth 13 CEP / AUG 60" — the wizard fell back to
 * raw_value and surfaced that garbage as the user's DOB.
 *
 * This module enforces a single contract: if a value does NOT match the
 * canonical shape for that field, it MUST NOT enter the wizard state.
 * The review screen will then show "Не найдено — введите вручную" so
 * the user types the correct value by hand. No silent guessing.
 *
 * Keep the validators conservative — when in doubt, REJECT. A false
 * negative (rejecting a real-but-weird value) is cheap (user fills the
 * field manually). A false positive (accepting garbage) is expensive
 * (USCIS receives wrong data, packet returned or fee retained).
 */

/** YYYY-MM-DD with month 01-12 and day 01-31. Year 1900-2099. */
const DATE_ISO_RE = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** Single letter M, F or X (ICAO 9303 sex codes). */
const SEX_RE = /^[MFX]$/

/**
 * Passport number: 1-3 letters followed by 6-9 digits, optionally with
 * a single space between the letter prefix and the digits.
 *   FA000000        — Ukrainian international (TD3, synthetic)
 *   EK 790396       — Ukrainian internal-booklet perforation
 *   AB1234567       — generic
 * MRZ canonical form has no space; the visible passport surface may.
 */
const PASSPORT_NUMBER_RE = /^[A-Z]{1,3}\s?[0-9]{6,9}$/

/** A-number: 9 digits. Often shown with dashes (000-000-000) — strip first. */
const A_NUMBER_RE = /^\d{9}$/

/**
 * 5-digit US ZIP, optionally with +4 extension.
 */
const ZIP_RE = /^\d{5}(?:-\d{4})?$/

/**
 * 2-letter USPS state code (uppercase).
 */
const US_STATE_RE = /^[A-Z]{2}$/

/**
 * Returns true if `value` is the canonical shape we accept for `field`,
 * or if the field has no strict shape rule (in which case it passes
 * through unchanged). Untrimmed input — caller is responsible for
 * stripping incidental whitespace before calling.
 *
 * The list is intentionally small: only fields whose ground-truth shape
 * is unambiguous. Names, addresses, "given names with middle bits",
 * country names etc. are deliberately NOT validated here because they
 * legitimately have many shapes.
 */
export function isStrictValidValue(field: string, rawValue: string): boolean {
  const value = rawValue.trim()
  if (!value) return false

  switch (field) {
    case 'dob':
    case 'last_entry_date':
    case 'i94_admit_until':
    case 'passport_expiration_date':
    case 'ead_expiration_date':
      return DATE_ISO_RE.test(value)

    case 'sex':
      return SEX_RE.test(value)

    case 'passport_number':
      return PASSPORT_NUMBER_RE.test(value.toUpperCase())

    case 'a_number':
      // Strip dashes/spaces, then 9 digits.
      return A_NUMBER_RE.test(value.replace(/[\s\-]/g, ''))

    case 'us_address_zip':
      return ZIP_RE.test(value)

    case 'us_address_state':
      return US_STATE_RE.test(value.toUpperCase())

    default:
      // No strict rule — accept the value as-is. We only enforce shapes
      // where the canonical form is well-defined and a misread is more
      // costly than asking the user to type it.
      return true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2026-05-21 Pre-normalizer for OCR/Brain values whose CONTENT is correct
// but whose FORMAT does not match the canonical shape we require. Real cause:
// the EAD module's AI-Brain fallback emits dates in MM/DD/YYYY because
// DeepSeek is trained on US format. The wizard's isStrictValidValue checks
// for /^YYYY-MM-DD$/ and drops the value, so the user sees "Не найдено"
// even though OCR successfully read the date.
//
// Design rules:
//   - SAFE: only unambiguous transformations. "01/25/1990" → "1990-01-25"
//     (day 25 > 12, so the layout cannot be DD/MM). "09/07/2024" is
//     AMBIGUOUS (both segments ≤ 12) — we refuse and force manual entry
//     per the project hard rule "no AI guessing for critical fields".
//   - Preserves raw_value upstream; this helper only computes a new
//     normalized_value when one is provably derivable from the raw input.
//   - No new permissions: invalid values that don't normalize still fail
//     the subsequent shape check.
// ─────────────────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/**
 * Try to normalize a date string to YYYY-MM-DD. Returns null if the input
 * cannot be UNAMBIGUOUSLY parsed (e.g. "09/07/2024" — both interpretations
 * are valid calendar dates). Caller treats null as "drop / manual entry".
 */
export function normalizeDate(s: string): string | null {
  const trimmed = s.trim()
  if (!trimmed) return null

  // 1. Already ISO YYYY-MM-DD with valid month/day.
  if (ISO_DATE_RE.test(trimmed)) return trimmed

  // 2. YYYY/MM/DD or YYYY-MM-DD with single-digit month/day (still ISO-ish).
  const isoLike = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (isoLike) {
    const [, y, mo, d] = isoLike
    const candidate = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    return ISO_DATE_RE.test(candidate) ? candidate : null
  }

  // 3. MM/DD/YYYY or DD/MM/YYYY — disambiguate by the first two segments.
  //    If either segment is > 12, the layout is forced.
  const slash = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (slash) {
    const a = parseInt(slash[1], 10)
    const b = parseInt(slash[2], 10)
    const yyyy = slash[3]
    if (a > 12 && b <= 12) {
      // DD/MM/YYYY (EU layout)
      const candidate = `${yyyy}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
      return ISO_DATE_RE.test(candidate) ? candidate : null
    }
    if (b > 12 && a <= 12) {
      // MM/DD/YYYY (US layout)
      const candidate = `${yyyy}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
      return ISO_DATE_RE.test(candidate) ? candidate : null
    }
    // Ambiguous (both ≤ 12). Refuse per "no AI guessing" rule.
    return null
  }

  return null
}

/**
 * Try to normalize a sex value to canonical M/F/X. Returns null when the
 * input cannot be confidently mapped — caller drops to manual entry.
 */
export function normalizeSex(s: string): string | null {
  const v = s.trim().toUpperCase()
  if (!v) return null
  // Already canonical
  if (v === 'M' || v === 'F' || v === 'X') return v
  // English long form
  if (v === 'MALE') return 'M'
  if (v === 'FEMALE') return 'F'
  // Cyrillic abbreviations seen on Ukrainian booklets (Ч=чоловіча, Ж=жіноча)
  if (v === 'Ч' || v === 'ЧОЛ' || v === 'ЧОЛОВ' || v === 'МУЖ' || v === 'МУЖСК') return 'M'
  if (v === 'Ж' || v === 'ЖІН' || v === 'ЖІНОЧ' || v === 'ЖЕН' || v === 'ЖЕНСК') return 'F'
  return null
}

/**
 * Combined normalize + validate. Tries field-specific normalization first
 * (date and sex are the only fields with real OCR-format vs canonical-format
 * mismatch in production today), then runs the strict shape check on the
 * (possibly normalized) value.
 *
 * Return `value` is the canonical form to STORE; caller should preserve
 * the original raw input in raw_value separately for audit.
 */
export function normalizeAndValidate(
  field: string,
  rawValue: string,
): { ok: boolean; value: string } {
  const trimmed = rawValue.trim()
  if (!trimmed) return { ok: false, value: '' }

  let candidate: string = trimmed
  switch (field) {
    case 'dob':
    case 'last_entry_date':
    case 'i94_admit_until':
    case 'passport_expiration_date':
    case 'ead_expiration_date': {
      const n = normalizeDate(trimmed)
      candidate = n ?? trimmed
      break
    }
    case 'sex': {
      const n = normalizeSex(trimmed)
      candidate = n ?? trimmed
      break
    }
    default:
      candidate = trimmed
  }

  if (isStrictValidValue(field, candidate)) {
    return { ok: true, value: candidate }
  }
  return { ok: false, value: trimmed }
}
