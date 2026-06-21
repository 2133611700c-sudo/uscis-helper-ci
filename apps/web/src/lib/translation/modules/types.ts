/**
 * Document Module Framework — Core Types
 * Messenginfo v6.0
 *
 * A DocumentModule is the single authoritative definition for one document type.
 * The module registry loads modules; the classifier routes incoming documents to them.
 *
 * Naming conventions:
 *   - All field keys use internal DB names (series, number, given_names, issued_by)
 *   - INTERNAL_TO_SPEC in passportBookletContract.ts maps these to user-facing labels
 *   - No real PII or sample passport data in this file
 */

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of a document module.
 *
 *   active      — fully supported; auto-draft allowed if reviewPolicy.allowAutoPdf
 *   draft       — skeleton defined; NOT for auto-PDF; routes to manual review
 *   manual_only — exists only to surface the manual-review path; no auto-draft ever
 *   disabled    — do not use; hidden from all user-facing flows
 */
export type DocumentModuleStatus = 'active' | 'draft' | 'manual_only' | 'disabled'

// ── Value types ───────────────────────────────────────────────────────────────

export type FieldValueType =
  | 'text'
  | 'date'          // MM/DD/YYYY format (normalized from Ukrainian)
  | 'date_range'
  | 'sex'           // 'Male' | 'Female'
  | 'series'        // 2-letter Cyrillic + 6 digits
  | 'number'        // numeric identifier
  | 'authority'     // issuing agency name — goes through glossary
  | 'boolean'
  | 'multi_line'    // place_of_birth, address, etc.

// ── Review policy ────────────────────────────────────────────────────────────

/**
 * Controls when human review, PDF generation, and manual escalation are triggered.
 */
export interface ReviewPolicy {
  /** Every critical field requires explicit user Confirm before certification */
  requireUserConfirmation: boolean
  /** Critical fields must have OCR evidence (ocr_bbox or combined_ocr_bbox) */
  requireEvidenceForCriticalFields: boolean
  /** Auto-PDF allowed ONLY after all review + certification gates pass */
  allowAutoPdf: boolean
  /** Route to manual review if any critical field is missing after extraction */
  manualReviewIfMissingCritical: boolean
  /** Route to manual review if overall OCR confidence < 0.65 */
  manualReviewIfLowConfidence: boolean
  /** Route to manual review if layout is unrecognized for this document type */
  manualReviewIfUnsupportedLayout: boolean
  /** Minimum OCR confidence below which manualReviewIfLowConfidence fires */
  lowConfidenceThreshold: number
}

// ── Fallback behavior when a field is missing ─────────────────────────────────

export type FallbackBehavior =
  | 'review_required'   // create placeholder row with review_required=true
  | 'block'             // block PDF render until field is present
  | 'skip'              // omit field from PDF silently (optional fields)
  | 'manual_review'     // escalate entire document to manual review

// ── Evidence requirement ──────────────────────────────────────────────────────

export type EvidenceRequirement =
  | 'required'          // ocr_bbox or combined_ocr_bbox must be present
  | 'preferred'         // warn if absent, do not block
  | 'optional'          // evidence not required for this field

// ── Field spec ────────────────────────────────────────────────────────────────

/**
 * One field within a document module.
 * Uses internal DB field names (not spec/USCIS-facing labels).
 */
export interface FieldSpec {
  /** Internal DB key (e.g. 'series', 'given_names', 'issued_by') */
  key: string

  /** Display labels for the Evidence Review UI */
  label: FieldLabelSet

  /** Is this field required for PDF generation? */
  required: boolean

  /** Value type drives validation and normalization */
  valueType: FieldValueType

  /**
   * Ukrainian/Russian labels as they appear on the physical document.
   * Used by the field mapper to identify the correct OCR tokens.
   */
  sourceLabels: string[]

  /** Validator IDs to run on extracted value */
  validators: string[]

  /** Always requires user confirmation in Evidence Review UI */
  reviewRequired: boolean

  /** OCR bounding box evidence requirement */
  evidenceRequired: EvidenceRequirement

  /** What happens if the field is not extracted at all */
  fallbackIfMissing: FallbackBehavior
}

// ── Label set ────────────────────────────────────────────────────────────────

export interface FieldLabelSet {
  en: string
  ru: string
  uk: string
}

// ── Extraction config ────────────────────────────────────────────────────────

/**
 * Configuration for the OCR extraction phase of this module.
 */
export interface ModuleExtractionConfig {
  /** OCR provider to use */
  ocrProvider: 'google_vision' | 'manual'
  /** Field mapper to use (maps OCR tokens → field values) */
  fieldMapper: 'deepseek_text' | 'manual'
  /** Glossary JSON files to load before field mapping */
  glossaryFiles: string[]
  /**
   * All field keys the mapper should attempt to extract.
   * Critical + optional, in extraction priority order.
   */
  fieldTargets: string[]
  /** Maximum extraction time in ms before timeout + manual review */
  timeoutMs: number
}

// ── Render config ────────────────────────────────────────────────────────────

/**
 * Configuration for the PDF render phase.
 */
export interface ModuleRenderConfig {
  /** PDF template identifier */
  templateId: string
  /** Fields to include in the rendered PDF, in display order */
  renderFields: string[]
  /** Certification template to use */
  certificationTemplate: string
  /** Whether to include a second page for certification */
  twoPageLayout: boolean
}

// ── Unsupported condition ────────────────────────────────────────────────────

/**
 * A reason why a document cannot be auto-processed.
 * Drives the manual review routing decision.
 */
export interface UnsupportedCondition {
  code: string
  description: string
  action: 'route_to_manual_review' | 'warn' | 'block'
}

// ── Document module ──────────────────────────────────────────────────────────

/**
 * Complete definition of one document type supported (or planned) by Messenginfo.
 *
 * Instantiated in <module>.module.ts files.
 * Registered in registry.ts.
 * Loaded by classifier.ts and route adapters.
 */
export interface DocumentModule {
  /** Canonical document type identifier */
  documentType: string

  /** User-facing display name (not in OCR output) */
  displayName: FieldLabelSet

  /** Module lifecycle status */
  status: DocumentModuleStatus

  /** Source languages this module has been tested with */
  supportedLanguages: Array<'uk' | 'ru' | 'en'>

  /**
   * Fields that MUST be present and confirmed for PDF generation.
   * Missing critical fields route to manual review if policy requires.
   */
  criticalFields: FieldSpec[]

  /**
   * Fields extracted if present but not required for PDF gate.
   * Absence does not block render.
   */
  optionalFields: FieldSpec[]

  /**
   * Source label → field key mapping for quick lookup.
   * Populated from criticalFields[].sourceLabels.
   */
  expectedLabels: Record<string, string[]>

  /** Glossary module identifiers to load during extraction */
  glossaryModules: string[]

  /** Validator IDs available for this module */
  validators: string[]

  /** Extraction pipeline configuration */
  extraction: ModuleExtractionConfig

  /** PDF render configuration */
  render: ModuleRenderConfig

  /** Human-review and automation policy */
  reviewPolicy: ReviewPolicy

  /** Reasons this module cannot be auto-processed */
  unsupportedConditions: UnsupportedCondition[]

  /**
   * Safe user-facing status message when auto-processing is not possible.
   * Must not include OCR/bbox/source trace wording.
   */
  userStatusMessage?: string
}
