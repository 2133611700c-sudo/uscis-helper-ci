/**
 * OCR audit sanitizer — P0 PII safety.
 *
 * The TPS OCR extract route builds a `brain_raw` audit object that historically
 * carried per-field `source_value` / `final_value` (real applicant OCR values:
 * names, DOB, document numbers, addresses) and `normalization_diagnostics[]`
 * with `input_raw` (raw OCR text). That object is persisted to
 * `tps_ocr_audit.brain_raw` (jsonb). Storing applicant PII in an audit table is
 * a privacy defect.
 *
 * This module produces a PII-FREE technical-only projection of `brain_raw`.
 * It runs in TWO places (defence in depth):
 *   1. the route, before handing the object to the audit writer; and
 *   2. the audit writer itself (`ocrAudit.ts`), unconditionally, so even a
 *      caller that bypasses (or predates) the route fix cannot persist values.
 *
 * Strategy = allow-list + deny-list, applied recursively at EVERY nesting level:
 *   - FORBIDDEN keys (carry an applicant value or raw OCR text) are DROPPED
 *     outright, no matter how deep, including alternate names like `value`,
 *     `rawValue`, `raw`, `text`, `line`.
 *   - A boolean `has_source_line` is derived from the presence of a dropped
 *     `source_line` (we keep the SIGNAL, never the line text).
 *   - All other keys are kept only if their value is itself technical
 *     (primitive that is not free OCR text, or a recursively-sanitized
 *     object/array). We do not echo arbitrary strings back: every surviving
 *     string key must be on the technical allow-list.
 *
 * The sanitizer is total: it never throws and always returns a plain object so
 * the audit write cannot break the OCR response.
 */

/**
 * Keys that may hold an applicant value or raw OCR text. Always dropped, at any
 * depth, regardless of value type. Matched case-insensitively. Kept broad on
 * purpose: future code that adds a new value-bearing alias is denied by default.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(
  [
    'source_value',
    'final_value',
    'input_raw',
    'output_normalized',
    'source_line',
    'raw_text',
    'raw',
    'value',
    'raw_value',
    'rawvalue',
    'normalized_value',
    'text',
    'line',
    'line_text',
    'ocr_text',
    'mrz',
    'mrz_line',
    'address',
    'name',
    'full_name',
    'given_name',
    'surname',
    'patronymic',
    'dob',
    'date_of_birth',
    'document_number',
    'doc_number',
    'a_number',
    'passport_number',
  ].map((k) => k.toLowerCase()),
)

/**
 * Technical string-or-scalar keys that are SAFE to keep verbatim. Anything not
 * on this list and not a recursable container is dropped, so we never echo an
 * arbitrary string (which could be an applicant value under a new key name).
 */
const ALLOWED_KEYS: ReadonlySet<string> = new Set(
  [
    'field',
    'present',
    'confidence',
    'requires_review',
    'inferred',
    'has_source_line',
    'rejected_reason',
    'validation_status',
    'reason',
    'category',
    'status',
    'manual_required',
    'count',
    'counts',
    'text_length',
    'field_count',
    'page_count',
    'provider',
    'model',
    'latency',
    'latency_ms',
    'processing_ms',
    'error_category',
    'error_code',
    'brain_error_code',
    'crossref_status',
    'vision_arbiter_status',
    'brain_status',
    'brain_trigger',
    'brain_document_type',
    'brain_document_type_confidence',
    'brain_needs_manual_review',
    'document_type',
    'document_type_confidence',
    'needs_manual_review',
    'redacted_at',
  ].map((k) => k.toLowerCase()),
)

/**
 * Keys whose value is a container of further audit entries we want to recurse
 * into and keep (after sanitizing each element). These hold no value text
 * themselves — only nested technical objects.
 */
const RECURSE_CONTAINER_KEYS: ReadonlySet<string> = new Set(
  [
    'brain_fields',
    'validated_skipped',
    'contract_rejected_fields',
    'normalization_rejected_fields',
    'normalization_diagnostics',
    'warnings',
    'brain_warnings',
    'diagnostics',
    'fields',
  ].map((k) => k.toLowerCase()),
)

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * A primitive is safe to keep only if it is NOT a free-form string. Strings are
 * kept ONLY when the owning key is on the allow-list (handled by the caller);
 * here we permit booleans, finite numbers, and null. Short technical-token
 * strings are allowed through this helper ONLY for allow-listed keys.
 */
function isSafeScalar(v: unknown): boolean {
  return (
    v === null ||
    typeof v === 'boolean' ||
    (typeof v === 'number' && Number.isFinite(v))
  )
}

/**
 * Keys whose value is an array of bare strings that are FIELD NAMES / category
 * tokens (NOT applicant values) — e.g. ["surname", "given_name"]. Only for
 * these keys do we keep bare-string array elements. Any other string array is
 * assumed to carry values and is dropped.
 */
const FIELD_NAME_LIST_KEYS: ReadonlySet<string> = new Set(
  [
    'contract_rejected_fields',
    'normalization_rejected_fields',
    'rejected_fields',
    'warnings',
    'brain_warnings',
  ].map((k) => k.toLowerCase()),
)

function sanitizeArray(arr: unknown[], ownerKey: string | null): unknown[] {
  const allowBareStrings = ownerKey != null && FIELD_NAME_LIST_KEYS.has(ownerKey)
  const out: unknown[] = []
  for (const el of arr) {
    if (isPlainObject(el)) {
      out.push(sanitizeObject(el))
    } else if (typeof el === 'string') {
      // Bare string elements survive ONLY under a field-name/category list key
      // AND only when they look like a short identifier token (no spaces).
      // Everywhere else a bare string may be an applicant value → DROP.
      if (allowBareStrings && el.length <= 64 && !/\s/.test(el)) out.push(el)
    } else if (isSafeScalar(el)) {
      out.push(el)
    }
    // arrays of arrays / anything else: dropped
  }
  return out
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let sawSourceLine = false

  for (const [rawKey, value] of Object.entries(obj)) {
    const key = rawKey.toLowerCase()

    if (FORBIDDEN_KEYS.has(key)) {
      if (key === 'source_line') {
        // Keep only the boolean signal: was a source line present?
        sawSourceLine =
          sawSourceLine ||
          (typeof value === 'string' ? value.length > 0 : value != null)
      }
      continue // drop the value text itself at every level
    }

    if (Array.isArray(value)) {
      // Recurse into arrays of technical entries.
      out[rawKey] = sanitizeArray(value, key)
      continue
    }

    if (isPlainObject(value)) {
      // Recurse into nested objects (allow-listed container or technical map).
      const nested = sanitizeObject(value)
      // Keep recursable containers and known technical sub-objects.
      if (RECURSE_CONTAINER_KEYS.has(key) || ALLOWED_KEYS.has(key) || Object.keys(nested).length > 0) {
        out[rawKey] = nested
      }
      continue
    }

    if (typeof value === 'string') {
      // Strings survive ONLY under an allow-listed technical key, and only if
      // they are bounded identifiers/tokens (never free-form OCR text).
      if (ALLOWED_KEYS.has(key) && value.length <= 128) {
        out[rawKey] = value
      }
      // otherwise: an unknown string key — treat as a possible value and DROP.
      continue
    }

    if (isSafeScalar(value)) {
      // booleans / finite numbers / null are technical and key-agnostic safe.
      out[rawKey] = value
      continue
    }
    // functions / symbols / bigint / undefined: dropped
  }

  // Surface the derived source-line signal if we dropped a source_line.
  if (sawSourceLine && !('has_source_line' in out)) {
    out.has_source_line = true
  }

  return out
}

/**
 * Sanitize a `brain_raw` audit object into a PII-FREE technical-only structure.
 *
 * Total + defensive: never throws, always returns a plain object (or null when
 * the input is nullish), so the audit writer cannot break the OCR response.
 *
 * @param raw the (possibly value-bearing) brain_raw object the route built
 * @returns a new object containing only technical keys; PII keys removed at
 *          every nesting level
 */
export function sanitizeBrainRawForAudit(
  raw: unknown,
): Record<string, unknown> | null {
  try {
    if (raw == null) return null
    if (Array.isArray(raw)) {
      return { entries: sanitizeArray(raw, null) }
    }
    if (!isPlainObject(raw)) {
      // A bare scalar brain_raw carries no useful audit — drop to empty marker.
      return {}
    }
    return sanitizeObject(raw)
  } catch {
    // Never let sanitization (or audit) break the OCR response.
    return {}
  }
}
