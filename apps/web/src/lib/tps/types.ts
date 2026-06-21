/**
 * TPS pipeline types — mirror v5 translation engine.
 *
 * Reference: docs/tps/ARCHITECTURE_V1.md §4
 */

import type { OcrBoundingBox } from '@/lib/ocr/types'

/**
 * Document categories the TPS pipeline understands. Maps to the modules
 * in lib/tps/modules/.
 */
export type TpsDocType =
  | 'passport'              // Ukrainian international passport
  | 'i94'                   // CBP I-94 record (printout / screenshot)
  | 'ead'                   // USCIS EAD card
  | 'i797'                  // USCIS receipt notice
  | 'dl'                    // U.S. driver's license / state ID (added 2026-05-20)
  | 'residence_evidence'    // lease / utility / paystub / etc.
  | 'translated_document'   // any Ukrainian doc that needs translation first
  | 'unknown'

/**
 * Critical-field language layer for OCR provenance — needed because
 * Ukrainian docs have multiple zones (Cyrillic visual zone + Latin MRZ).
 */
export type TpsLanguageLayer = 'cyrillic' | 'latin' | 'mrz' | 'numeric' | 'mixed'

/**
 * Provenance of how this field landed in the pipeline.
 */
export type TpsExtractionSource =
  | 'ocr_mrz'         // parsed from MRZ check-digit-validated zone
  | 'ocr_visual'      // OCR raw text near a labelled anchor
  | 'ocr_keyword'     // anchored to a keyword (e.g. "Class of Admission")
  | 'ai_brain'        // DeepSeek Document Brain — feature-flag gated, validators applied
  | 'dual_ocr_crossref' // Vision+DocAI cross-referenced by DeepSeek (booklet handwriting)
  | 'canonical_core'  // Document Core arbitration (ONE_CORE_TPS_ENABLED, B1)
  | 'user_input'      // user typed it directly
  | 'user_corrected'  // user edited an OCR'd value
  | 'inferred'        // derived from another field (e.g. ead_category from filing_path)

/**
 * A single field extracted from an uploaded document. Mirror of v5's
 * `ExtractedField`, with TPS-specific extraction_source instead of
 * translation-specific language_layer / passes.
 */
export interface TpsExtractedField {
  /** Canonical field name in the TPS data contract (e.g. 'passport_number') */
  field: string

  /** Raw OCR string before normalization, e.g. "KOVALENKO" */
  raw_value: string

  /** Canonicalized value for downstream use, e.g. "Kovalenko" or "1985-07-12" */
  normalized_value: string | null

  /** Where this came from — see TpsExtractionSource. */
  extraction_source: TpsExtractionSource

  /** Which source document this came from, e.g. "passport_page_1". */
  source_document_id: string

  /** Which zone of the source document, e.g. "mrz_line_2", "visual_dob". */
  source_zone: string

  /** Normalized bounding box (0..1) on the source document. */
  bbox: OcrBoundingBox | null

  /** Language layer the value was read from. */
  language_layer: TpsLanguageLayer

  /** Provider confidence 0..1; null if not provided. */
  confidence: number | null

  /** True if this field should be flagged for user review (low confidence,
   *  check-digit failure, MRZ↔VIZ mismatch, etc). */
  review_required: boolean

  /** OCR provider word IDs (w_NNNN) that backed this field. */
  ocr_word_ids: string[]

  /** Which validators passed for this field, e.g.
   *  ['mrz_check_digit', 'date_format', 'length_check']. */
  passes: string[]

  /** Validators that failed for this field. */
  failures: string[]

  /** True if user edited this value after OCR. */
  user_corrected: boolean

  /** When user corrects, classifier labels the correction
   *  (see v5 correctionClassifier). */
  correction_class?: 'ocr_correction' | 'explicit_override' | 'suspected_typo'
}

/**
 * Snapshot of TpsExtractedField after the user has reviewed and
 * confirmed/edited it on the review screen. Identical shape; named
 * differently so audit and downstream stages can tell pre- and post-
 * review values apart.
 */
export type TpsSourceTrace = TpsExtractedField

/**
 * Outcome of running a per-document extraction module on an OcrResult.
 */
export interface TpsModuleResult {
  /** Module that produced this result, e.g. 'passport'. */
  module: TpsDocType

  /** True if the module believes the uploaded document matches this
   *  module's expected layout. */
  matched: boolean

  /** Why the module did or did not match (debug info, never PII). */
  match_reason: string

  /** Fields extracted by this module. May be empty if matched=false. */
  fields: TpsExtractedField[]

  /** Top-level warnings: missing zones, low confidence, MRZ check
   *  digit failures, etc. */
  warnings: string[]

  /** If matched=true and severity is high, this routes the session to
   *  manual review. */
  manual_review_required: boolean
  manual_review_reasons: string[]
}

/**
 * Aggregate state held in localStorage / Supabase wizard_sessions
 * during a TPS session.
 */
export interface TpsPacketState {
  session_id: string
  locale: 'uk' | 'ru' | 'en' | 'es'

  /** Each uploaded document with its OCR + module results. */
  uploaded_documents: Array<{
    document_id: string
    doc_type: TpsDocType
    filename: string
    mime_type: string
    size_bytes: number
    uploaded_at: string
    ocr_provider: string
    ocr_processing_ms: number
    module_result: TpsModuleResult
  }>

  /** Flat list of extracted fields across all uploaded documents. */
  extracted_fields: TpsExtractedField[]

  /** Post-review snapshots — locked once user clicks "Дальше" on review. */
  source_traces: TpsSourceTrace[]

  /** Where the user diverged from what OCR found. */
  user_corrections: Array<{
    field: string
    from: string
    to: string
    class: 'ocr_correction' | 'explicit_override' | 'suspected_typo'
  }>

  /** Final TpsAnswers — typed values that drive PDF prefill. */
  tps_answers_complete: boolean

  /** Path decision from the PathClassifier. */
  path_decision:
    | 'initial'
    | 're_registration'
    | 'pending_auto_extended'
    | 'ead_only'
    | 'manual_review_required'
    | 'undecided'

  /** Set once user clicks the explicit "I have reviewed everything"
   *  button on the final screen before packet generation. */
  attestation_record?: {
    applicant_full_name: string
    statement: string
    signature_typed_name: string
    signed_at: string
    attestation_version: 'v1.0-2026'
  }

  qa_result: {
    status: 'PASS' | 'FAIL' | 'PENDING'
    checks: string[]
    failures: string[]
  }

  scope_title:
    | 'TPS Ukraine initial'
    | 'TPS Ukraine re-registration'
    | 'EAD only'
    | 'pending'
    | 'manual review'
}
