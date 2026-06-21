/**
 * Document Type Classifier — Messenginfo v6.0
 *
 * Normalizes raw document type strings from OCR/user input to canonical
 * module documentType keys, then routes to the correct module via the registry.
 *
 * Safety contract:
 *   - ANY input (including null/undefined/empty) resolves to a module — never throws
 *   - Unknown aliases → manualReview
 *   - Low confidence  → manualReview
 *   - Draft modules   → manualReview (even if alias resolves correctly)
 *   - The classifier never accesses PII or document content directly
 *
 * Alias table keeps classifier separate from registry — registry owns modules,
 * classifier owns normalization.
 */
import type { DocumentModule } from './types'
import { classifyToModule, getFallbackModule } from './registry'

// ── Alias normalization table ─────────────────────────────────────────────────
// Maps raw strings (from OCR, user input, or legacy code) to canonical
// documentType keys as defined in each module.
//
// Rules:
//   - Keys: lowercase, trimmed, normalized (spaces/underscores/hyphens collapsed)
//   - Values: exact documentType string from the target module
//   - Add new aliases when a new module is registered
//   - Never add aliases that map to disabled modules

const DOCUMENT_TYPE_ALIASES: ReadonlyMap<string, string> = new Map([
  // ── ua_internal_passport_booklet ──────────────────────────────────────────
  ['ua_internal_passport_booklet',  'ua_internal_passport_booklet'],
  ['ua_passport_booklet',           'ua_internal_passport_booklet'],
  ['internal_passport',             'ua_internal_passport_booklet'],
  ['passport_booklet',              'ua_internal_passport_booklet'],
  ['ukrainian_passport',            'ua_internal_passport_booklet'],
  ['ua_passport',                   'ua_internal_passport_booklet'],
  ['ua_passport_internal',          'ua_internal_passport_booklet'],   // legacy default in render/route.ts
  ['паспорт',                       'ua_internal_passport_booklet'],
  ['паспорт громадянина україни',   'ua_internal_passport_booklet'],
  ['паспорт гражданина украины',    'ua_internal_passport_booklet'],

  // ── ua_birth_certificate ─────────────────────────────────────────────────
  ['ua_birth_certificate',          'ua_birth_certificate'],
  ['birth_certificate',             'ua_birth_certificate'],
  ['birth certificate',             'ua_birth_certificate'],
  ['свідоцтво про народження',      'ua_birth_certificate'],
  ['свидетельство о рождении',      'ua_birth_certificate'],

  // ── ua_marriage_certificate ───────────────────────────────────────────────
  ['ua_marriage_certificate',       'ua_marriage_certificate'],
  ['marriage_certificate',          'ua_marriage_certificate'],
  ['marriage certificate',          'ua_marriage_certificate'],
  ['свідоцтво про шлюб',            'ua_marriage_certificate'],
  ['свидетельство о браке',         'ua_marriage_certificate'],
  ['ua_marriage',                   'ua_marriage_certificate'],

  // ── ua_divorce_certificate ────────────────────────────────────────────────
  ['ua_divorce_certificate',        'ua_divorce_certificate'],
  ['divorce_certificate',           'ua_divorce_certificate'],
  ['divorce certificate',           'ua_divorce_certificate'],
  ['свідоцтво про розірвання шлюбу', 'ua_divorce_certificate'],
  ['свидетельство о расторжении брака', 'ua_divorce_certificate'],
  ['ua_divorce',                    'ua_divorce_certificate'],

  // ── ua_death_certificate ──────────────────────────────────────────────────
  // Skeleton module: status='draft', so classifier still routes via
  // resolveDocumentModule()→manualReviewModule. Aliases give us a known
  // documentType in admin/audit logs instead of "unknown".
  ['ua_death_certificate',          'ua_death_certificate'],
  ['death_certificate',             'ua_death_certificate'],
  ['death certificate',             'ua_death_certificate'],
  ['certificate of death',          'ua_death_certificate'],
  ['свідоцтво про смерть',          'ua_death_certificate'],
  ['свидетельство о смерти',        'ua_death_certificate'],
  ['смерть',                        'ua_death_certificate'],
  ['ua_death',                      'ua_death_certificate'],

  // ── ua_international_passport ─────────────────────────────────────────────
  ['ua_international_passport',     'ua_international_passport'],
  ['international_passport',        'ua_international_passport'],
  ['ua_intl_passport',              'ua_international_passport'],
  ['закордонний паспорт',           'ua_international_passport'],
  ['загранпаспорт',                 'ua_international_passport'],
  ['закордонний паспорт україни',   'ua_international_passport'],

  // ── ua_id_card ────────────────────────────────────────────────────────────
  ['ua_id_card',                    'ua_id_card'],
  ['id_card',                       'ua_id_card'],
  ['id card',                       'ua_id_card'],
  ['ukrainian id card',             'ua_id_card'],
  ['посвідчення особи',             'ua_id_card'],
  ['id-картка',                     'ua_id_card'],
  ['ідентифікаційна картка',        'ua_id_card'],

  // ── manual_review_required (explicit escalation) ─────────────────────────
  ['manual_review_required',        'manual_review_required'],
  ['manual_review',                 'manual_review_required'],
  ['unknown',                       'manual_review_required'],
])

// ── Confidence threshold ──────────────────────────────────────────────────────
// Below this → always route to manual review, regardless of type.
const CLASSIFIER_CONFIDENCE_THRESHOLD = 0.85

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Normalize a raw document type string for alias lookup.
 * Lowercases and trims only — does NOT collapse underscores/hyphens,
 * because the alias table stores keys with underscores preserved.
 */
function normalizeDocumentTypeKey(raw: string): string {
  return raw.toLowerCase().trim()
}

/**
 * Resolve a raw document type string to its canonical documentType key,
 * using the alias table. Returns null if no alias found.
 *
 * Lookup order:
 *   1. Exact match after lowercase+trim (handles 'ua_passport_booklet', 'паспорт', etc.)
 *   2. Spaces collapsed version (handles 'ua passport booklet' → same key)
 *   3. Collapse whitespace+hyphens to underscores (handles 'ua-passport-booklet')
 */
function resolveAlias(raw: string): string | null {
  const lowered = normalizeDocumentTypeKey(raw)

  // 1. Exact lowercased match
  const direct = DOCUMENT_TYPE_ALIASES.get(lowered)
  if (direct) return direct

  // 2. Collapse runs of whitespace/hyphens to underscores
  const underscored = lowered.replace(/[\s-]+/g, '_')
  const byUnderscored = DOCUMENT_TYPE_ALIASES.get(underscored)
  if (byUnderscored) return byUnderscored

  // 3. Collapse runs of underscores/hyphens to spaces
  const spaced = lowered.replace(/[_-]+/g, ' ')
  const bySpaced = DOCUMENT_TYPE_ALIASES.get(spaced)
  if (bySpaced) return bySpaced

  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ClassificationResult {
  /** The resolved module */
  module: DocumentModule
  /** The canonical documentType key used */
  canonicalType: string
  /** True if the input was resolved via an alias (not exact match) */
  wasAliased: boolean
  /** True if routing fell back to manualReview */
  usedFallback: boolean
  /** Reason for fallback, if usedFallback is true */
  fallbackReason?: string
}

/**
 * Classify a raw document type string to a DocumentModule.
 *
 * Resolution order:
 *   1. If raw is null/undefined/empty → manualReview (unknown_document_type)
 *   2. If confidence < threshold      → manualReview (low_classification_confidence)
 *   3. Resolve alias → canonical type; if no alias → manualReview (unsupported_document_type)
 *   4. Route canonical type through registry (active → module; draft/disabled → manualReview)
 *
 * Never throws.
 */
export function classifyDocumentType(
  raw: string | null | undefined,
  confidence: number = 1.0,
): ClassificationResult {
  const fallback = getFallbackModule()

  // 1. Null / empty input
  if (!raw || raw.trim() === '') {
    return {
      module: fallback,
      canonicalType: fallback.documentType,
      wasAliased: false,
      usedFallback: true,
      fallbackReason: 'unknown_document_type',
    }
  }

  // 2. Low confidence
  if (confidence < CLASSIFIER_CONFIDENCE_THRESHOLD) {
    const canonical = resolveAlias(raw) ?? raw
    return {
      module: fallback,
      canonicalType: fallback.documentType,
      wasAliased: canonical !== raw,
      usedFallback: true,
      fallbackReason: 'low_classification_confidence',
    }
  }

  // 3. Alias resolution
  const canonical = resolveAlias(raw)
  if (!canonical) {
    return {
      module: fallback,
      canonicalType: fallback.documentType,
      wasAliased: false,
      usedFallback: true,
      fallbackReason: 'unsupported_document_type',
    }
  }

  // 4. Registry routing (handles draft/disabled → manualReview internally)
  const module = classifyToModule(canonical, confidence)
  const usedFallback = module.documentType === fallback.documentType
  const wasAliased = normalizeDocumentTypeKey(raw) !== normalizeDocumentTypeKey(canonical)

  return {
    module,
    canonicalType: canonical,
    wasAliased,
    usedFallback,
    fallbackReason: usedFallback ? 'module_not_active' : undefined,
  }
}

/**
 * Simplified form: returns just the module for a raw document type string.
 * Use classifyDocumentType() if you need the reason or alias metadata.
 */
export function resolveDocumentModule(
  raw: string | null | undefined,
  confidence: number = 1.0,
): DocumentModule {
  return classifyDocumentType(raw, confidence).module
}

/**
 * Returns the normalized alias table for testing/inspection purposes.
 * Do not mutate the result.
 */
export function getAliasTable(): ReadonlyMap<string, string> {
  return DOCUMENT_TYPE_ALIASES
}
