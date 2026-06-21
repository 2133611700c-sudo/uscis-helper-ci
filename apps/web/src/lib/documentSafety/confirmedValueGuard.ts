/**
 * documentSafety/confirmedValueGuard — Phase 3.1 (ADR-017 C3 contract).
 *
 * "A confirmed field CAN become final — via C3, never by bypassing it."
 *
 * User confirmation/correction happens CLIENT-side; the confirmed value arrives in the
 * generate-pdf payload as plain text. Without this guard a user-typed value (Cyrillic,
 * garbage, control chars) goes straight into the certified PDF. This is the server-side
 * C3 re-entry for confirmed values: deterministic rules only — no AI, no I/O, no PII
 * leakage (callers must report field NAMES, never values).
 *
 * Rules (release values are Latin post-KMU-55; the PDF uses WinAnsi fonts):
 *   - empty/null on a critical field            → empty_critical
 *   - any Cyrillic character                     → cyrillic_in_release_value
 *   - longer than 200 chars                      → too_long
 *   - control / non-printable characters         → invalid_chars
 *   - date-named fields must be MM/DD/YYYY or YYYY-MM-DD → invalid_date_format
 */
import { classifyCriticality } from './applyOcrFieldSafety'

export interface ConfirmedValueVerdict {
  ok: boolean
  reason?:
    | 'empty_critical'
    | 'cyrillic_in_release_value'
    | 'too_long'
    | 'invalid_chars'
    | 'invalid_date_format'
}

const CYRILLIC = /[Ѐ-ӿ]/
// C0 controls (incl. tab/newline), DEL, C1 controls — none belong in a single-line PDF field value.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/
const DATE_MMDDYYYY = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/
const DATE_ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function isCriticalField(field: string): boolean {
  const c = classifyCriticality(field)
  return c === 'critical_identity' || c === 'critical_document'
}

function isDateField(field: string): boolean {
  const f = (field || '').toLowerCase()
  return f.includes('date') || f.includes('dob')
}

/**
 * Validate ONE user-confirmed value before it may become a final (released) value.
 * Pure and deterministic. Returns a verdict only — never logs, never throws.
 */
export function validateConfirmedValue(
  field: string,
  value: string | null | undefined,
): ConfirmedValueVerdict {
  const v = (value ?? '').trim()

  if (v === '') {
    if (isCriticalField(field)) return { ok: false, reason: 'empty_critical' }
    // Empty non-critical value: nothing to release, but nothing dangerous either.
    return { ok: true }
  }

  if (CYRILLIC.test(v)) return { ok: false, reason: 'cyrillic_in_release_value' }
  if (v.length > 200) return { ok: false, reason: 'too_long' }
  if (CONTROL_CHARS.test(v)) return { ok: false, reason: 'invalid_chars' }
  if (isDateField(field) && !DATE_MMDDYYYY.test(v) && !DATE_ISO.test(v)) {
    return { ok: false, reason: 'invalid_date_format' }
  }

  return { ok: true }
}
