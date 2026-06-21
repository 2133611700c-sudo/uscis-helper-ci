/**
 * canonical/index.ts — Phase 2 canonical contract (one recognition brain).
 *
 * Types + pure policy. No product reads from this yet; it is introduced
 * additively so the canonical core can be built and shadow-tested before any
 * migration off the two existing stacks.
 */
export type {
  Criticality,
  SourceKind,
  FieldConfidence,
  FieldEvidence,
  CanonicalField,
  CanonicalProduct,
  CanonicalHashChain,
  CanonicalDocumentResult,
} from './types'

export {
  CRITICAL_FIELDS,
  REVIEW_THRESHOLD,
  criticalityOf,
  computeFinalConfidence,
  buildConfidence,
  materiallyDifferent,
  sourceRank,
  higherAuthority,
  resolveDisagreement,
  decideReviewRequired,
} from './policy'

// P2.2 adapter — build a CanonicalDocumentResult from the existing TPS reader.
export {
  toCanonicalField,
  mergeCanonicalByKey,
  readCanonicalDocumentFromTps,
} from './adapter'
export type { ReadCanonicalInput } from './adapter'

// P2.3 shadow — diff two CanonicalDocumentResults; ONE_BRAIN_SHADOW flag (OFF).
export { diffCanonical, isShadowEnabled, summarizeParity } from './shadow'
export type { ParityReport, FieldParity, ParityStatus } from './shadow'

// Translation-stack adapter — the second half of P2.2 (enables the two-brain diff).
export {
  toCanonicalFieldFromTranslation,
  readCanonicalDocumentFromTranslation,
} from './adapterTranslation'
export type { ReadCanonicalTranslationInput } from './adapterTranslation'

// Live single-stack shadow summary (used behind ONE_BRAIN_SHADOW in the TPS route).
export { summarizeTpsReviewShift } from './liveShadow'
export type { TpsShadowMeta } from './liveShadow'

// Manual Override Contract — user correction (lowest authority, preserves prior).
export { applyManualOverride } from './manualOverride'

// Document-Type Confidence Gate + Provider Output Quarantine.
export { applyDocumentTypeGate, partitionQuarantine, DOC_TYPE_GATE_THRESHOLD } from './documentGate'
export type { QuarantinePartition } from './documentGate'

// Cross-Document Contradiction Detector (passport vs I-94 vs EAD vs DL).
export { findCrossDocumentContradictions, hasBlockingContradiction } from './contradictions'
export type { Contradiction, ContradictionCandidate } from './contradictions'
