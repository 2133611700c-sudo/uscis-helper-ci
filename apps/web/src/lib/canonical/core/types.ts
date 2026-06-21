/**
 * canonical/core/types.ts — Document Core v1 spine types.
 *
 * See docs/architecture/ONE_BRAIN_DECISION.md. The Core is the single
 * decision-maker; readers (Gemini, MRZ, Vision) only produce CANDIDATES; the
 * arbitration policy is the judge and emits the one CanonicalDocumentResult.
 *
 * v1: types + minimal arbitration + benchmark. NOT wired to any product. No flags.
 */
import type { SourceKind, CanonicalDocumentResult } from '../types'

/**
 * One candidate value for a field, produced by a reader. NEVER final — the Core
 * arbitration decides. `mrzCheckValid` is set only for MRZ candidates.
 */
export interface FieldCandidate {
  key: string
  /** The read value (KMU-55 Latin for names/places, ISO for dates, exact for numbers). */
  value: string
  /**
   * Original Cyrillic as the vision provider read it — the D2 knowledge layer operates
   * on this, NOT on the already-transliterated `value`. Thread from ExtractedDocField.raw_cyrillic.
   * GAP A fix (Phase 2.0): was dropped by docintelToCandidate, now carried forward.
   */
  rawCyrillic?: string
  source: SourceKind
  /** Provider confidence 0..1, or null if unknown. */
  confidence: number | null
  /** MRZ candidates only: did the relevant check digit(s) pass. */
  mrzCheckValid?: boolean
  /** True if this value came from a fuzzy/approximate match (e.g. geography snap). */
  fuzzy?: boolean
  /** Free-form reader/zone id for provenance (v1 "evidence" = provenance). */
  provider: string
  /** The originating reader already flagged this field as needing human review. */
  reviewRequired?: boolean
  /** Reasons the reader set reviewRequired (carried into the arbitrated field). */
  reviewReasons?: string[]
}

/** The Core result, or an explicit "ask for a better photo" (never garbage). */
export type CoreResult =
  | { status: 'ok'; result: CanonicalDocumentResult }
  | { status: 'needs_better_photo'; reason: string }

/**
 * The reader backends the Core orchestrates. Injected so the Core is testable and
 * the real OCR/vision wiring is a thin call (no rewrite of recognition).
 */
export interface CoreReaders {
  /** Image quality gate. ok:false → the Core returns needs_better_photo. */
  qualityGate: (file: unknown) => Promise<{ ok: boolean; reason?: string }> | { ok: boolean; reason?: string }
  /** Primary visual reader (Gemini docintel) — image → field candidates. */
  visualRead: (file: unknown, hint: string | undefined) => Promise<FieldCandidate[]>
  /** MRZ parse — only called when a passport/MRZ is present. Returns MRZ candidates. */
  mrzRead?: (file: unknown) => Promise<FieldCandidate[]>
}

export interface ReadDocumentCoreRequest {
  documentSessionId: string
  /** Which product asked (the result is the SAME regardless; for provenance only). */
  product: CanonicalDocumentResult['product']
  docType: string
  /** ISO-8601 UTC — caller stamps it. */
  createdAt: string
  /** Optional doc-type hint passed to the readers. */
  hint?: string
  /** Opaque payload (image/pdf bytes) consumed by the readers only. */
  file: unknown
  /** True if the document is expected to carry an MRZ (passport) → run mrzRead. */
  expectMrz?: boolean
}
