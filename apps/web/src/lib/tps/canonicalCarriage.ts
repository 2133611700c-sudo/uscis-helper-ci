/**
 * canonicalCarriage.ts — TPS canonical_document_id carriage helpers.
 *
 * architecture/canonical-continuity. End-to-end carriage of the canonical
 * document id for TPS ONLY:
 *
 *   1. CAPTURE — read the id from the OCR extract RESPONSE. The server returns
 *      `canonical_document_id` ONLY when its shadow persist of the canonical
 *      document succeeded. If absent/empty we return null and NEVER fabricate
 *      one — a wrong/stale id is worse than none.
 *
 *   2. RESEND — when building the generate-packet body, pick the id of the
 *      PRIMARY identity document used to build the canonical read. Preference
 *      mirrors how extract was invoked per slot: passport
 *      (ua_international_passport) first, then the internal booklet, then any
 *      other slot that returned an id. Only ids the server actually returned
 *      are eligible; uploads with a missing shadow persist carry null and are
 *      skipped. If none captured an id we send nothing — shadow mode stays
 *      valid (the field is OPTIONAL; enforce-mode enforcement lives
 *      server-side).
 *
 * Pure functions, no PII logging — operate on ids/keys only.
 */

/** Minimal view of an upload slot the resend selector needs. */
export interface CanonicalCarriageSlot {
  status?: 'idle' | 'uploading' | 'done' | 'error'
  canonical_document_id?: string | null
}

/**
 * CAPTURE: extract the canonical document id from an OCR extract response body.
 * Returns the id verbatim when present and non-empty, else null. Never throws.
 */
export function captureCanonicalDocumentId(extractResponse: unknown): string | null {
  if (!extractResponse || typeof extractResponse !== 'object') return null
  const id = (extractResponse as { canonical_document_id?: unknown }).canonical_document_id
  return typeof id === 'string' && id.trim() ? id : null
}

/**
 * RESEND: pick the canonical document id to carry in the generate-packet body.
 * Considers only slots whose upload completed (`status === 'done'`) and that
 * carry a non-empty captured id. Returns undefined when none qualify so the
 * caller can OMIT the field entirely (keeps shadow mode working when absent).
 */
export function selectCanonicalDocumentIdForGenerate(
  uploads: Record<string, CanonicalCarriageSlot | undefined>,
): string | undefined {
  // Primary-identity priority: international passport, then internal booklet.
  const slotPriority = ['passport', 'booklet']
  for (const slot of slotPriority) {
    const u = uploads[slot]
    if (u?.status === 'done' && typeof u.canonical_document_id === 'string' && u.canonical_document_id) {
      return u.canonical_document_id
    }
  }
  // Fallback: any other completed slot that returned an id.
  for (const u of Object.values(uploads)) {
    if (u?.status === 'done' && typeof u.canonical_document_id === 'string' && u.canonical_document_id) {
      return u.canonical_document_id
    }
  }
  return undefined
}
