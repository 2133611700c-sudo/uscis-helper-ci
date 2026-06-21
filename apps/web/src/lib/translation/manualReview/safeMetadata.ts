/**
 * PII-safe metadata validator for manual_review_events.metadata and
 * for ticket safe_summary fields.
 *
 * Goal: prevent raw PII from leaking into audit logs, queue list views, or
 * user-facing status responses.
 *
 * Allowed metadata keys (whitelist). Anything else is stripped.
 *
 * Also runs heuristic value redaction:
 *   - long digit runs (≥ 4) → '[redacted-digits]'
 *   - email-like strings   → '[redacted-email]'
 *   - phone-like strings   → '[redacted-phone]'
 *   - Cyrillic word runs    → '[redacted-text]' (likely names / OCR fragments)
 *   - free-form strings >  64 chars  → truncated + tagged
 */

export const SAFE_METADATA_KEYS = [
  'field_name',
  'reason_code',
  'status',
  'from_status',
  'to_status',
  'value_length',
  'duration_ms',
  'count',
  'route',
  'ticket_id',
  'session_id',
  'document_id',
  'module_type',
  'priority',
  'event_type',
  'http_status',
  'attempt',
  'reasons',           // array of reason codes only — values validated separately
  'operator_id_hash',  // SHA-prefix is fine; full operator email is not
] as const

export type SafeMetadataKey = (typeof SAFE_METADATA_KEYS)[number]

/**
 * Heuristically redact a string value. Returns either the original string
 * (if it looks safe) or a redacted token. Does NOT throw.
 */
export function redactValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') {
    return '[redacted-non-scalar]'
  }

  const s = value.trim()
  if (s.length === 0) return ''

  // Email
  if (/\S+@\S+\.\S+/.test(s)) return '[redacted-email]'

  // Phone-like: starts with `+`, OR contains at least one separator
  // (space, hyphen, paren, dot) between digits. Pure digit strings fall
  // through to the digit-run check below — that's what catches passport
  // numbers, DOBs, document numbers.
  if (/^\+[\d\s\-().]{6,}$/.test(s)) return '[redacted-phone]'
  if (/\d[\s\-().]+\d.*\d/.test(s) && /\d/g.test(s)) {
    const digitCount = (s.match(/\d/g) ?? []).length
    if (digitCount >= 7) return '[redacted-phone]'
  }

  // Digit run (passport, document number, DOB without separators, etc.)
  if (/\d{4,}/.test(s)) return '[redacted-digits]'

  // Cyrillic words (names, OCR fragments) — strip if more than one cyrillic word
  const cyrillicWords = s.match(/[Ѐ-ӿ]+/g) ?? []
  if (cyrillicWords.length >= 1) return '[redacted-text]'

  // Long free-form
  if (s.length > 64) return `${s.slice(0, 24)}…[truncated:${s.length}]`

  return s
}

/**
 * Sanitize a metadata object for an audit event.
 *
 * - Drops any key not in SAFE_METADATA_KEYS.
 * - Redacts string values via redactValue (non-string scalars passed through).
 * - For 'reasons', expects an array of strings — each redacted/checked individually.
 * - Object values (other than the 'reasons' array) are dropped.
 */
export function sanitizeEventMetadata(
  raw: unknown,
): Record<string, string | number | boolean | string[] | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const out: Record<string, string | number | boolean | string[] | null> = {}
  const allowed = new Set<string>(SAFE_METADATA_KEYS)

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(k)) continue

    if (k === 'reasons' && Array.isArray(v)) {
      out[k] = v
        .filter((r): r is string => typeof r === 'string' && r.length < 64)
        .map(r => r.trim())
      continue
    }

    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
      // Disallow nested structures except 'reasons'
      continue
    }

    out[k] = redactValue(v)
  }

  return out
}

/**
 * True if the given object contains only safe scalar values under whitelisted
 * keys. Used in tests to assert that ticket safeSummary / event metadata never
 * leak PII shapes.
 */
export function isSafeMetadata(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const allowed = new Set<string>(SAFE_METADATA_KEYS)

  // Identifier-shaped keys naturally contain digits (UUIDs, short hashes).
  // For these we relax the digit-run check ONLY when the value matches
  // a known id pattern. Anything else falls through to the strict checks,
  // so e.g. `ticket_id: 'FN123456'` is still flagged as unsafe (passport
  // shape leaking through an id field).
  const idLikeKeys = new Set<string>([
    'ticket_id',
    'session_id',
    'document_id',
    'operator_id_hash',
  ])
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const SHORT_HASH_RE = /^op_[0-9a-f]{1,16}$/i

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(k)) return false

    if (k === 'reasons') {
      if (!Array.isArray(v)) return false
      if (!v.every(x => typeof x === 'string' && x.length < 64)) return false
      continue
    }

    if (v === null) continue
    if (typeof v === 'number' || typeof v === 'boolean') continue
    if (typeof v !== 'string') return false

    // Always-blocked patterns:
    if (/\S+@\S+\.\S+/.test(v)) return false
    if (/[Ѐ-ӿ]{3,}/.test(v)) return false
    if (/^\+[\d\s\-().]{6,}$/.test(v)) return false

    if (idLikeKeys.has(k) && (UUID_RE.test(v) || SHORT_HASH_RE.test(v))) {
      // Recognized id shape (UUID or op_hash). Always-blocked patterns
      // were already rejected above.
      continue
    }

    // Strict block for everything else:
    if (/\d[\s\-().]+\d.*\d/.test(v)) {
      const digitCount = (v.match(/\d/g) ?? []).length
      if (digitCount >= 7) return false
    }
    if (/\d{4,}/.test(v)) return false
  }

  return true
}

/**
 * Build a safe summary string for queue list view. Inputs may include raw PII
 * (e.g. detected document type label, operator note draft) — output is
 * scrubbed and length-capped.
 */
export function buildSafeSummary(parts: {
  /** Internal canonical document type key (safe — alphanumeric + underscores) */
  documentType?: string | null
  /** Reason codes — already enum values, safe */
  reasons?: readonly string[]
  /** Optional short label, max 80 chars; will be redacted */
  hint?: string | null
}): string {
  const docType = (parts.documentType ?? 'unknown').replace(/[^a-z0-9_]/gi, '').slice(0, 40)
  const reasons = (parts.reasons ?? []).filter(r => /^[a-z0-9_]{1,40}$/i.test(r)).slice(0, 6)
  const hintRedactedRaw = parts.hint ? redactValue(parts.hint) : null
  const hint = typeof hintRedactedRaw === 'string' && hintRedactedRaw.length > 0
    ? hintRedactedRaw.slice(0, 60)
    : ''

  const reasonsPart = reasons.length > 0 ? ` · reasons:${reasons.join(',')}` : ''
  const hintPart = hint.length > 0 ? ` · ${hint}` : ''
  const summary = `[${docType}]${reasonsPart}${hintPart}`
  return summary.slice(0, 200)
}
