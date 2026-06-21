/**
 * Identity Anchor Auto-Feed — v5 §14 / Phase 7.
 *
 * Builds (and re-applies) the controlling Latin spelling on the
 * PacketState anchor AFTER the user has confirmed the relevant fields on
 * the EvidenceReviewPage. Never auto-feeds from raw OCR.
 *
 * Source modules that may contribute an anchor (priority order):
 *   1. ua_international_passport  — TD3 MRZ + visual zone Latin
 *   2. ua_id_card                 — TD1 MRZ + visual zone Latin
 *
 * Trigger contract:
 *   - Caller must be the EvidenceReview confirmation handler.
 *   - Caller passes ONLY user-confirmed fields (user_corrected=true OR
 *     evidence_type !== undefined AND review_required=false after confirm).
 *   - Confidence floor enforced here as a defensive second check.
 *
 * Conflict policy:
 *   - If a controlling spelling already exists for `key`, and the new
 *     value disagrees, we DO NOT overwrite. We report a conflict instead.
 *     The wizard surfaces a clarifier card; the operator can resolve via
 *     manual review.
 *   - We never silently switch. We never feed from low-confidence OCR.
 */

import type { ExtractedField, PacketState } from '../types'

/** Modules whose confirmed fields may seed the controlling spelling. */
const ANCHOR_SOURCE_MODULES = new Set<string>([
  'ua_international_passport',
  'ua_id_card',
  // canonical alias (DocumentType union value)
  'ua_passport_biometric',
])

/** Field keys we copy from anchor → controlling_spelling. */
const ANCHOR_FIELD_KEYS = new Set<string>([
  'surname',
  'given_name',
  'given_names',         // intl-passport variant
  'patronymic',
  'surname_latin',       // intl-passport / id_card
  'given_names_latin',   // intl-passport / id_card
])

/** Minimum confidence floor for auto-feed (defensive). */
const MIN_CONFIDENCE = 0.85

export type AnchorConflict = {
  /** controlling_spelling key (canonicalised: surname / given_name / patronymic) */
  key: string
  /** Existing value already in PacketState.controlling_spelling */
  existing: string
  /** Candidate value from the confirmed anchor field */
  candidate: string
  /** Source module */
  source: string
}

export type AnchorRefusal = {
  field: string
  reason:
    | 'unconfirmed'
    | 'low_confidence'
    | 'wrong_module'
    | 'unknown_field_key'
    | 'empty_value'
}

export interface AnchorAutoFeedResult {
  /** New PacketState — caller persists. Original is not mutated. */
  packet: PacketState
  /** Keys that were written (or already correct). */
  applied: string[]
  /** Conflicts (existing != candidate); caller should surface review_required. */
  conflicts: AnchorConflict[]
  /** Fields ignored, with reason — useful for audit. */
  refused: AnchorRefusal[]
}

interface AnchorAutoFeedInput {
  packet: PacketState
  /**
   * The active source module's documentType (e.g. 'ua_international_passport').
   * Anything outside ANCHOR_SOURCE_MODULES is rejected.
   */
  sourceModuleType: string
  /**
   * User-confirmed fields from EvidenceReview. Caller MUST guarantee
   * each field has been explicitly confirmed by the user (i.e. the
   * "Confirm" action on the review page was clicked for that field).
   */
  confirmedFields: ExtractedField[]
}

function canonicaliseKey(rawKey: string): string | null {
  switch (rawKey) {
    case 'surname':
    case 'surname_latin':
      return 'surname'
    case 'given_name':
    case 'given_names':
    case 'given_names_latin':
      return 'given_name'
    case 'patronymic':
    case 'patronymic_cyrillic':
      return 'patronymic'
    default:
      return null
  }
}

/**
 * Apply confirmed identity-anchor fields to PacketState.controlling_spelling.
 * Pure function: returns a new PacketState; does not mutate input.
 */
export function applyIdentityAnchor(input: AnchorAutoFeedInput): AnchorAutoFeedResult {
  const { packet, sourceModuleType, confirmedFields } = input

  const applied: string[] = []
  const conflicts: AnchorConflict[] = []
  const refused: AnchorRefusal[] = []
  const newSpelling: Record<string, string> = { ...packet.controlling_spelling }

  if (!ANCHOR_SOURCE_MODULES.has(sourceModuleType)) {
    for (const f of confirmedFields) {
      refused.push({ field: f.field, reason: 'wrong_module' })
    }
    return {
      packet: { ...packet },
      applied,
      conflicts,
      refused,
    }
  }

  for (const f of confirmedFields) {
    const key = canonicaliseKey(f.field)
    if (!key) {
      // Outside the anchor field set entirely (e.g. nationality, document_number).
      if (!ANCHOR_FIELD_KEYS.has(f.field)) {
        refused.push({ field: f.field, reason: 'unknown_field_key' })
      }
      continue
    }

    // Defensive: caller MUST hand us only confirmed fields. We refuse anything
    // that still flags review_required, even if the caller insisted.
    if (f.review_required) {
      refused.push({ field: f.field, reason: 'unconfirmed' })
      continue
    }
    // Belt-and-braces: confidence floor.
    if (typeof f.confidence !== 'number' || f.confidence < MIN_CONFIDENCE) {
      refused.push({ field: f.field, reason: 'low_confidence' })
      continue
    }

    const candidate = (f.normalized_value ?? '').trim()
    if (!candidate) {
      refused.push({ field: f.field, reason: 'empty_value' })
      continue
    }

    const existing = (newSpelling[key] ?? '').trim()
    if (existing && existing !== candidate) {
      conflicts.push({
        key,
        existing,
        candidate,
        source: sourceModuleType,
      })
      // Do NOT overwrite. Caller surfaces a clarifier.
      continue
    }

    newSpelling[key] = candidate
    if (!applied.includes(key)) applied.push(key)
  }

  return {
    packet: { ...packet, controlling_spelling: newSpelling },
    applied,
    conflicts,
    refused,
  }
}
