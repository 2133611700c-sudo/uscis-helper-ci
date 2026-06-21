/**
 * Input validation helpers for API routes.
 *
 * Centralised here so every route uses the same whitelist.
 * Keep this file dependency-free (no external libraries) so it stays fast at Edge.
 */

// ── UUIDs ────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns true if `value` is a well-formed UUID v4 (or any UUID variant). */
export function isUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// ── Locales ──────────────────────────────────────────────────────────────────

export const VALID_LOCALES = ['en', 'uk', 'ru', 'es'] as const
export type Locale = (typeof VALID_LOCALES)[number]

export function isValidLocale(value: unknown): value is Locale {
  return VALID_LOCALES.includes(value as Locale)
}

/** Sanitise a locale from untrusted input; falls back to 'en'. */
export function sanitiseLocale(value: unknown): Locale {
  return isValidLocale(value) ? value : 'en'
}

// ── Service slugs ────────────────────────────────────────────────────────────

/**
 * Whitelist of service slugs the wizard infrastructure can route.
 *
 * Phase 0 (multi-service wizard refactor) added `tps-ukraine` alongside the
 * original `re-parole-u4u`. Adding a slug here is a deliberate gate: it
 * authorises both the public API (`/api/wizard/session`) and the in-browser
 * `WizardProvider` to persist sessions / localStorage under that slug.
 *
 * Never accept a service_slug from untrusted input without going through
 * `sanitiseServiceSlug()` — that's what enforces this whitelist.
 */
export const VALID_SERVICE_SLUGS = ['re-parole-u4u', 'tps-ukraine'] as const
export type ServiceSlug = (typeof VALID_SERVICE_SLUGS)[number]

/** Default slug used when no slug is supplied (preserves pre-Phase-0 behaviour). */
export const DEFAULT_SERVICE_SLUG: ServiceSlug = 're-parole-u4u'

export function isValidServiceSlug(value: unknown): value is ServiceSlug {
  return VALID_SERVICE_SLUGS.includes(value as ServiceSlug)
}

/** Sanitise a service slug from untrusted input; falls back to default. */
export function sanitiseServiceSlug(value: unknown): ServiceSlug {
  return isValidServiceSlug(value) ? value : DEFAULT_SERVICE_SLUG
}

// ── File types ───────────────────────────────────────────────────────────────

/** Allowed MIME types for document upload (translation + evidence). */
export const VALID_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type ValidFileMimeType = (typeof VALID_FILE_MIME_TYPES)[number]

export function isValidFileMimeType(mimeType: string): mimeType is ValidFileMimeType {
  return (VALID_FILE_MIME_TYPES as readonly string[]).includes(mimeType)
}

/** Allowed file extensions (double-checked alongside MIME type to prevent spoofing). */
export const VALID_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'] as const

export function isValidFileExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return (VALID_FILE_EXTENSIONS as readonly string[]).some(ext => lower.endsWith(ext))
}

// ── Payload size ─────────────────────────────────────────────────────────────

/** Max allowed size for state_json (wizard session state). */
export const STATE_JSON_MAX_BYTES = 64 * 1024 // 64 KB

/**
 * Returns true if the JSON-serialised representation of `value` is within
 * the allowed limit. Returns false on serialisation failure.
 */
export function isStateJsonWithinLimit(value: unknown): boolean {
  try {
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
    return bytes <= STATE_JSON_MAX_BYTES
  } catch {
    return false
  }
}

// ── Step number ──────────────────────────────────────────────────────────────

/** Wizard steps are 0–12. */
export function isValidStep(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 12
}
