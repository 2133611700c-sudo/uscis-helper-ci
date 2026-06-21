/**
 * inputValidation.ts
 *
 * Shared input validation for translation API routes.
 * All user-supplied values pass through here before DB writes.
 *
 * Validation rules are intentionally strict for pilot —
 * we process immigration documents and must not accept garbage.
 */

// ── Allowed field names for Ukrainian passport documents ──────────────────────
// Canonical set used by the field-mapper and DB.
// Any value not in this set is rejected outright.
export const UA_PASSPORT_ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  // 11 critical fields
  'document_type',
  'series',
  'number',
  'surname',
  'given_names',
  'patronymic',
  'date_of_birth',
  'place_of_birth',
  'sex',
  'issued_by',
  'date_of_issue',
  // extended fields (not critical but supported)
  'nationality',
  'date_of_expiry',
  'record_number',
])

// ── Per-field value max lengths ───────────────────────────────────────────────
const FIELD_MAX_LEN: Record<string, number> = {
  surname:           120,
  given_names:       120,
  patronymic:        120,
  place_of_birth:    300,
  issued_by:         300,
  nationality:       120,
  document_type:     60,
  series:            10,
  number:            30,
  date_of_birth:     40,
  date_of_issue:     40,
  date_of_expiry:    40,
  sex:               20,
  record_number:     30,
}
const DEFAULT_MAX_LEN = 500

// ── Prototype-pollution / injection field name patterns ──────────────────────
const DANGEROUS_FIELD_PATTERNS: RegExp[] = [
  /^__proto__$/i,
  /^constructor$/i,
  /^prototype$/i,
  /[.[\]]/,                      // dots or brackets — path traversal
  /['"`;]/,                      // SQL/script injection chars
  /\s/,                          // no whitespace in field names
  /^(select|insert|update|delete|drop|alter|exec|union|--)/i,  // SQL keywords
]

// ── Forbidden value content patterns ─────────────────────────────────────────
const FORBIDDEN_VALUE_PATTERNS: RegExp[] = [
  /<[^>]+>/,              // HTML/XML tags
  /[<>'"]/,              // XSS characters
  // eslint-disable-next-line no-control-regex
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/,  // control characters (allow \t \n \r)
  /\x00/,                // null bytes
]

// ── UUID format check ─────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ValidationError {
  error: string
  message: string
  status: 400 | 404
}

export function validateSessionId(sessionId: unknown): ValidationError | null {
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
    return {
      error: 'invalid_session_id',
      message: 'Session ID must be a valid UUID.',
      status: 400,
    }
  }
  return null
}

export function validateFieldName(field: unknown): ValidationError | null {
  if (typeof field !== 'string' || field.trim() === '') {
    return {
      error: 'invalid_field',
      message: 'A field name is required.',
      status: 400,
    }
  }

  // Reject prototype-pollution and injection patterns
  for (const re of DANGEROUS_FIELD_PATTERNS) {
    if (re.test(field)) {
      return {
        error: 'invalid_field',
        message: 'This field is not supported.',
        status: 400,
      }
    }
  }

  // Allowlist check
  if (!UA_PASSPORT_ALLOWED_FIELDS.has(field)) {
    return {
      error: 'invalid_field',
      message: 'This field is not supported.',
      status: 400,
    }
  }

  return null
}

export function validateCorrectionValue(
  value: unknown,
  field: string
): ValidationError | null {
  if (typeof value !== 'string') {
    return {
      error: 'invalid_value',
      message: 'Please enter a plain-text value.',
      status: 400,
    }
  }

  const trimmed = value.trim()

  if (trimmed === '') {
    return {
      error: 'invalid_value',
      message: 'Please enter a value — this field cannot be empty.',
      status: 400,
    }
  }

  // Length check per field
  const maxLen = FIELD_MAX_LEN[field] ?? DEFAULT_MAX_LEN
  if (trimmed.length > maxLen) {
    return {
      error: 'invalid_value',
      message: `Please enter a shorter value (max ${maxLen} characters).`,
      status: 400,
    }
  }

  // Forbidden content patterns
  for (const re of FORBIDDEN_VALUE_PATTERNS) {
    if (re.test(trimmed)) {
      return {
        error: 'invalid_value',
        message: 'Please enter a shorter plain-text value.',
        status: 400,
      }
    }
  }

  // Repeated-character attack: 80%+ of string is same character
  if (trimmed.length > 20) {
    const freq: Record<string, number> = {}
    for (const ch of trimmed) freq[ch] = (freq[ch] ?? 0) + 1
    const maxFreq = Math.max(...Object.values(freq))
    if (maxFreq / trimmed.length > 0.8) {
      return {
        error: 'invalid_value',
        message: 'Please enter a shorter plain-text value.',
        status: 400,
      }
    }
  }

  return null
}

/** Normalize a string value before DB write: trim + collapse internal whitespace. */
export function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
