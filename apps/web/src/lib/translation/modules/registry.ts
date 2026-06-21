/**
 * Document Module Registry — Messenginfo v6.0
 *
 * The single place where all document modules are registered.
 * Routes incoming document types to the correct module, or to
 * manualReview if the type is unknown, disabled, or draft.
 *
 * Safety guarantee:
 *   - Unknown document type  → manualReview module (never throws)
 *   - draft module           → manualReview module
 *   - disabled module        → manualReview module
 *   - manual_only module     → manualReview module (pass-through)
 *   - active module          → returned as-is
 *
 * This registry NEVER throws a user-facing 500 for an unknown document type.
 */
import type { DocumentModule } from './types'
import { passportBookletModule } from './passportBooklet.module'
import { birthCertificateModule } from './birthCertificate.module'
import { marriageCertificateModule } from './marriageCertificate.module'
import { divorceCertificateModule } from './divorceCertificate.module'
import { deathCertificateModule } from './deathCertificate.module'
import { internationalPassportModule } from './internationalPassport.module'
import { ukrainianIdCardModule } from './ukrainianIdCard.module'
import { manualReviewModule } from './manualReview.module'

// ── Module registry table ─────────────────────────────────────────────────────
// Add new modules here. Order determines listing order only — routing uses the
// documentType key, not position.

const MODULE_REGISTRY: ReadonlyMap<string, DocumentModule> = new Map([
  [passportBookletModule.documentType, passportBookletModule],
  [birthCertificateModule.documentType, birthCertificateModule],
  [marriageCertificateModule.documentType, marriageCertificateModule],
  [divorceCertificateModule.documentType, divorceCertificateModule],
  [deathCertificateModule.documentType, deathCertificateModule],
  [internationalPassportModule.documentType, internationalPassportModule],
  [ukrainianIdCardModule.documentType, ukrainianIdCardModule],
  [manualReviewModule.documentType, manualReviewModule],
])

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if the module is allowed to serve requests autonomously
 * (not redirected to manual review).
 * active = allowed; all other statuses → manualReview.
 */
function isModuleActive(module: DocumentModule): boolean {
  return module.status === 'active'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up a registered module by document type.
 * Returns null if the type is not in the registry.
 * Does NOT apply fallback logic — use getDocumentModule() for that.
 */
export function findDocumentModule(documentType: string): DocumentModule | null {
  return MODULE_REGISTRY.get(documentType) ?? null
}

/**
 * Get the module for a document type, applying safety routing:
 *   - unknown type  → manualReview
 *   - draft module  → manualReview
 *   - disabled      → manualReview
 *   - manual_only   → manualReview (pass-through, same instance)
 *   - active        → the module itself
 *
 * Never throws. Safe to call from any route handler.
 */
export function getDocumentModule(documentType: string): DocumentModule {
  const module = MODULE_REGISTRY.get(documentType)

  if (!module) {
    return manualReviewModule
  }

  if (!isModuleActive(module)) {
    return manualReviewModule
  }

  return module
}

/**
 * List all registered modules, excluding the manualReview sentinel.
 * Returns modules in registration order.
 * Includes draft and disabled modules (for admin/inventory purposes).
 */
export function listDocumentModules(): DocumentModule[] {
  return Array.from(MODULE_REGISTRY.values()).filter(
    m => m.documentType !== manualReviewModule.documentType,
  )
}

/**
 * List only active modules (status === 'active').
 * These are the only types that can produce auto-PDF.
 */
export function listActiveModules(): DocumentModule[] {
  return listDocumentModules().filter(isModuleActive)
}

/**
 * Returns true if the document type resolves to an active module
 * AND that module's reviewPolicy allows auto-PDF generation.
 *
 * Any unknown/draft/disabled document type → false (never auto-draft).
 */
export function isAutoDraftSupported(documentType: string): boolean {
  const module = MODULE_REGISTRY.get(documentType)
  if (!module || !isModuleActive(module)) return false
  return module.reviewPolicy.allowAutoPdf
}

/**
 * Returns the fallback module used for all unresolvable document types.
 * Always the manualReview module.
 */
export function getFallbackModule(): DocumentModule {
  return manualReviewModule
}

/**
 * Classify an input to a module.
 *
 * @param documentType  - The document type string from OCR or user input
 * @param confidence    - Classification confidence (0–1). Below CONFIDENCE_THRESHOLD → manualReview
 *
 * Routing rules (in order):
 *   1. confidence < CONFIDENCE_THRESHOLD → manualReview
 *   2. documentType not in registry      → manualReview
 *   3. module.status !== 'active'        → manualReview
 *   4. otherwise                         → the active module
 */
const CONFIDENCE_THRESHOLD = 0.85

export function classifyToModule(
  documentType: string,
  confidence: number = 1.0,
): DocumentModule {
  if (confidence < CONFIDENCE_THRESHOLD) {
    return manualReviewModule
  }

  return getDocumentModule(documentType)
}

/**
 * Returns the list of all registered document type strings,
 * including manual_review_required and draft types.
 * Useful for validation in route handlers.
 */
export function getRegisteredDocumentTypes(): string[] {
  return Array.from(MODULE_REGISTRY.keys())
}
