/**
 * Document Module Adapters — Messenginfo v6.0
 *
 * Bridge functions that connect the Document Module Framework to the
 * existing route handlers. These replace hardcoded CRITICAL_FIELDS arrays
 * in certify/route.ts, render/route.ts, and ocr-from-storage/route.ts.
 *
 * Design contract:
 *   - All functions accept a raw documentType string (from DB doc_type column)
 *   - Unknown or draft types fall back to the passport booklet module for
 *     backward compatibility during the transition period (since all existing
 *     sessions are ua_internal_passport_booklet)
 *   - No function throws — every input returns a safe non-empty result
 *
 * Migration path:
 *   Phase 1 (current): adapters read from module registry; routes call adapters
 *   Phase 2 (next sprint): remove the fallback once all sessions have doc_type
 *
 * These adapters intentionally do NOT expose ReviewPolicy or validator lists
 * directly to route handlers — those are only used by the module framework
 * internals. Routes only need the field key lists and the auto-draft flag.
 */
import type { ReviewPolicy } from './types'
import { getDocumentModule, isAutoDraftSupported as registryIsAutoDraftSupported } from './registry'
import { resolveDocumentModule } from './classifier'
import { passportBookletModule } from './passportBooklet.module'

// ── Internal: resolve doc type safely ─────────────────────────────────────────

/**
 * Resolve a raw doc_type string to a module.
 * Uses classifier (which handles aliases) first.
 * Falls back to passportBookletModule if resolution produces manualReview —
 * this handles legacy sessions where doc_type is 'ua_passport_internal'
 * but the module isn't yet in the alias table, or where the type is simply
 * unknown but the session is clearly a passport session (pre-framework).
 *
 * NOTE: This backward-compat fallback is intentional and safe because:
 *   - All existing production sessions are Ukrainian passport booklet sessions
 *   - The fallback preserves the gate behavior (11 critical fields)
 *   - Remove this fallback once all doc_types are normalized in the DB
 */
function resolveModuleForRoute(documentType: string | null | undefined) {
  const raw = documentType ?? ''
  const module = resolveDocumentModule(raw, 1.0)

  // If resolution fell through to manualReview for a non-empty type,
  // it means the type is unknown to the classifier but might still be
  // a passport session. Use the passport module as backward-compat fallback.
  if (module.status === 'manual_only' && raw !== '' && raw !== 'manual_review_required') {
    return passportBookletModule
  }

  return module
}

// ── Public adapter functions ──────────────────────────────────────────────────

/**
 * Returns the critical field keys for a document type.
 * Used by certify/route.ts and render/route.ts to replace hardcoded arrays.
 *
 * For unknown types, falls back to passport booklet critical fields.
 * Returns the module's criticalFields in definition order.
 */
export function getCriticalFieldsForDocumentType(documentType: string | null | undefined): string[] {
  const module = resolveModuleForRoute(documentType)
  return module.criticalFields.map(f => f.key)
}

/**
 * Returns only the critical field keys whose evidenceRequired is 'required'
 * (not 'preferred' or 'optional').
 * Used by the evidence coverage check in render/route.ts.
 */
export function getEvidenceRequiredFieldsForDocumentType(documentType: string | null | undefined): string[] {
  const module = resolveModuleForRoute(documentType)
  return module.criticalFields
    .filter(f => f.evidenceRequired === 'required')
    .map(f => f.key)
}

/**
 * Returns all field keys (critical + optional) that should be extracted
 * for a document type.
 * Used by ocr-from-storage to determine what fields to request from DeepSeek.
 */
export function getAllFieldTargetsForDocumentType(documentType: string | null | undefined): string[] {
  const module = resolveModuleForRoute(documentType)
  return module.extraction.fieldTargets
}

/**
 * Returns the critical field keys as a Set (for O(1) membership testing).
 * Used in ocr-from-storage to check if a field requires bbox evidence.
 */
export function getCriticalFieldSetForDocumentType(documentType: string | null | undefined): Set<string> {
  return new Set(getCriticalFieldsForDocumentType(documentType))
}

/**
 * Returns the review policy for a document type.
 * Useful for checking flags like allowAutoPdf, lowConfidenceThreshold, etc.
 */
export function getReviewPolicyForDocumentType(documentType: string | null | undefined): ReviewPolicy {
  const module = resolveModuleForRoute(documentType)
  return module.reviewPolicy
}

/**
 * Returns true if auto-PDF generation is allowed for this document type.
 * Wraps registry.isAutoDraftSupported with alias resolution.
 */
export function isAutoDraftSupported(documentType: string | null | undefined): boolean {
  const raw = documentType ?? ''
  // Use classifier to resolve alias first
  const module = resolveDocumentModule(raw, 1.0)
  // Then check the resolved module's policy directly (don't re-route through registry)
  if (module.status !== 'active') return false
  return module.reviewPolicy.allowAutoPdf
}

/**
 * Returns the user-facing status message for a document type.
 * Used when routing a document to manual review to explain why.
 */
export function getUserStatusMessageForDocumentType(documentType: string | null | undefined): string {
  const module = resolveModuleForRoute(documentType)
  return module.userStatusMessage ?? 'Your document is being prepared for review.'
}
