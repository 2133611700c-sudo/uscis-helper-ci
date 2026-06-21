/**
 * canonical/types.ts — Phase 2 contract types (the "one recognition brain" output).
 *
 * Grounded in the constitution docs:
 *   - FIELD_CONFIDENCE_AND_CRITICALITY_POLICY.md (split confidence, criticality)
 *   - EVIDENCE_LEDGER_SPEC.md (hash chain)
 *   - ENGINEERING_MASTER_PLAN.md §2 (target architecture)
 *
 * This file defines the SHAPE only. The decision logic lives in policy.ts. No
 * product is wired to these types yet — they are introduced additively so the
 * canonical core can be built and shadow-tested before any migration.
 *
 * Three laws this contract serves:
 *   1. No evidence → no field (every value carries its evidence + source).
 *   2. No review snapshot → no final PDF (hashes link upload→canonical→snapshot→pdf).
 *   3. One document → one CanonicalDocumentResult → all products.
 */

/** A field's legal criticality — drives the auto-final / review rules. */
export type Criticality = 'critical' | 'high' | 'medium' | 'low'

/**
 * Where a value came from, ordered by authority (see SOURCE_RANK in policy.ts).
 * The controlling Latin spelling (MRZ/I-94/EAD) beats any re-transliteration.
 */
export type SourceKind =
  | 'mrz'
  | 'passport_visual'
  | 'i94'
  | 'ead'
  | 'driver_license'
  | 'gov_ua' // self-name on a .gov.ua source
  | 'document_ocr' // generic OCR/keyword read off the document
  | 'ai_vision' // AI vision reader (Gemini/GPT) derived
  | 'manual_user_entry' // lowest; only after explicit user confirmation

/**
 * Split confidence (FIELD_CONFIDENCE_AND_CRITICALITY_POLICY §A). Each layer is
 * independent; `final` is DERIVED (never set by a provider) and can never exceed
 * its weakest applicable layer. A layer that does not apply to a field is `null`
 * (excluded from the min), not defaulted to 1.
 */
export interface FieldConfidence {
  /** Provider character/word confidence on the raw glyphs. */
  ocr: number | null
  /** Did we map the right region/label to this field key. */
  field_match: number | null
  /** KMU-55 transliteration / glossary mapping confidence. */
  normalization: number | null
  /** Agreement with the controlling source (MRZ/I-94/EAD/...). */
  source_match: number | null
  /** Derived: ≤ min of the applicable layers. Set by computeFinalConfidence. */
  final: number
}

/** One retained candidate value for a field — evidence, never silently dropped. */
export interface FieldEvidence {
  value: string
  source: SourceKind
  /** Provider's own confidence for this candidate, if known. */
  confidence: number | null
  /** Free-form provider/module id for traceability. */
  provider: string
}

/**
 * One canonical field. `rawValue` is always preserved; `normalizedValue` is a
 * suggestion when it materially differs from raw (no-silent-correction). When a
 * value was overridden, the prior value + reason are kept.
 */
export interface CanonicalField {
  key: string
  rawValue: string | null
  /** The normalized/display value. If it materially differs from raw → suggestion. */
  normalizedValue: string | null
  /**
   * Phase 3 (ADR-017 C3 contract): written ONLY by applyOcrFieldSafety (C3).
   * - undefined  → C3 has not run (OCR_FIELD_SAFETY_ENABLED=OFF or field not processed).
   *               Adapters MUST fall back to normalizedValue for backward compat.
   * - null       → C3 ran and rejected / flagged review (value must NOT be released).
   * - string     → C3 accepted; this is the release value. D6/PDF reads this, not normalizedValue.
   *
   * D2 (arbitration) MUST NOT write this field — D2's internal DECISION.finalValue is
   * a different concept (D2's proposal), never stored here.
   */
  finalValue?: string | null
  /** A fuzzy/alternative suggestion surfaced for review (S1-style), never auto-applied. */
  suggestedValue?: string | null
  criticality: Criticality
  confidence: FieldConfidence
  source: SourceKind
  /** True ⇒ a human must confirm before this field can be finalized. */
  reviewRequired: boolean
  /** Machine-readable reasons the field needs review (for UI + audit). */
  reviewReasons: string[]
  /** All candidates seen (provider disagreement keeps every one). */
  evidence: FieldEvidence[]
  /** If a value was rejected in favor of another, why (manual override contract). */
  rejectedReason?: string
  /**
   * Original Cyrillic from the vision provider — threaded from FieldCandidate.rawCyrillic.
   * The D2 knowledge layer uses this, NOT the already-transliterated normalizedValue.
   * GAP A fix (Phase 2.0): carried from docintelToCandidate → arbitration → here.
   */
  rawCyrillic?: string | null
  /** D2 knowledge rule that fired on this value (ADR-017 provenance, optional). */
  knowledgeRule?: string
  /** D2 knowledge provenance tag (kmu55 / gazetteer_exact / authority_dict / ...). */
  knowledgeProvenance?: string
}

/**
 * Semantic version of the CanonicalField type schema.
 * Re-exported from version.ts for convenience; version.ts is the single source.
 */
export { CANONICAL_SCHEMA_VERSION } from './version'

/** The product surfaces a canonical result can feed. */
export type CanonicalProduct = 'tps' | 'translation' | 'reparole' | 'ead' | 'bureau_pdf'

/** The hash chain (EVIDENCE_LEDGER_SPEC §2). Links are filled as they are computed. */
export interface CanonicalHashChain {
  uploadHash: string | null
  normalizedImageHash: string | null
  /** sha256 of the serialized CanonicalDocumentResult (fields only, see policy). */
  canonicalResultHash: string | null
}

/**
 * The single recognition output for one document. Every product reads from this
 * — there is no second brain (Law 3).
 */
export interface CanonicalDocumentResult {
  documentSessionId: string
  product: CanonicalProduct
  docType: string
  fields: CanonicalField[]
  hashes: CanonicalHashChain
  /** ISO-8601 UTC. Caller stamps it (Date is not available in some contexts). */
  createdAt: string
  /** True if ANY field still needs human review before it can be finalized. */
  requiresReview: boolean
}
