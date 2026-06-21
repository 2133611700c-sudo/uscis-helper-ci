/**
 * Packet Identity Anchor — Messenginfo v6.0
 *
 * A PacketIdentityAnchor is the single source of truth for a client's
 * Latin-script name, date of birth, and document identifiers across an
 * immigration packet. It is derived from identity documents — specifically
 * the Ukrainian International Passport and Ukrainian ID Card — and is used
 * to ensure consistent spelling across all translated documents in the packet.
 *
 * Priority rules (highest → lowest) for Latin-script name:
 *   1. ua_international_passport  — official Latin name from MRZ/VIZ
 *   2. ua_id_card                 — official Latin name from card face
 *   3. ua_internal_passport_booklet — transliterated from Cyrillic (informational only)
 *   4. user_override              — explicit correction entered by operator
 *
 * CRITICAL CONSTRAINTS:
 *   - Do NOT re-transliterate Latin names from official passports. If the document
 *     supplies Latin spelling, use it verbatim.
 *   - Conflicts between documents require explicit operator review. Silent overrides
 *     are forbidden.
 *   - RNOKPP (Ukrainian tax ID) is sensitive PII. It is stored only for cross-check
 *     purposes and MUST NOT appear in any log, audit trail, or customer PDF.
 *   - MRZ mismatch with VIZ field values sets review_required=true on the anchor.
 *     The anchor is not locked (not usable as source of truth) until review is cleared.
 */

// ── Priority levels ───────────────────────────────────────────────────────────

export type IdentityAnchorSource =
  | 'ua_international_passport'    // highest authority — official Latin script
  | 'ua_id_card'                   // second authority — official Latin script
  | 'ua_internal_passport_booklet' // transliteration — informational only
  | 'user_override'                // operator-entered correction

export const IDENTITY_ANCHOR_PRIORITY: ReadonlyArray<IdentityAnchorSource> = [
  'ua_international_passport',
  'ua_id_card',
  'ua_internal_passport_booklet',
  'user_override',
]

// ── Name components ───────────────────────────────────────────────────────────

/**
 * Latin-script name as it appears on the official document.
 * Components are stored separately for USCIS form field compatibility.
 */
export interface LatinName {
  /** Surname exactly as on document (e.g. "KOVALENKO") */
  surname: string
  /** Given names exactly as on document (e.g. "OLEKSII MYKHAILO") */
  givenNames: string
  /**
   * Source document type that provided this name.
   * Used to determine priority in merge conflicts.
   */
  source: IdentityAnchorSource
  /**
   * Whether this name was verified against MRZ check digits.
   * false = extracted from VIZ zone only (MRZ check not performed).
   */
  mrzVerified: boolean
}

// ── Core anchor type ──────────────────────────────────────────────────────────

/**
 * Single authoritative identity record for one person in an immigration packet.
 *
 * Contains official Latin-script spelling, date of birth, document identifiers,
 * and conflict/review flags. Used by all document translation modules to
 * maintain consistent spelling.
 *
 * NOTE: rnokpp is intentionally excluded from this type.
 * The RNOKPP is sensitive PII and must not flow through the packet state.
 * It is validated in-place within the ID card / international passport modules
 * and never propagated to the anchor or any log.
 */
export interface PacketIdentityAnchor {
  /** Unique packet ID this anchor belongs to */
  packetId: string

  /**
   * Session IDs of documents that contributed to this anchor.
   * Key = sessionId, Value = documentType that session produced.
   */
  contributingDocuments: Record<string, string>

  // ── Latin name (official) ────────────────────────────────────────────────

  /** Official Latin-script surname. null if no identity document processed yet. */
  surnameLatin: string | null
  /** Official Latin-script given names. null if no identity document processed. */
  givenNamesLatin: string | null
  /** Which document provided the current Latin name */
  latinNameSource: IdentityAnchorSource | null

  // ── Cyrillic name ────────────────────────────────────────────────────────

  /** Full Cyrillic surname (nominative case) */
  surnameCyrillic: string | null
  /** Full Cyrillic given names (nominative case) */
  givenNamesCyrillic: string | null
  /** Cyrillic patronymic (nominative case). Not present in all documents. */
  patronymicCyrillic: string | null

  // ── Date of birth ─────────────────────────────────────────────────────────

  /**
   * Date of birth in USCIS format: "D Month YYYY" (e.g. "3 October 1991").
   * NO leading zero on day. Must match across all documents in packet.
   */
  dateOfBirth: string | null
  /** Source document for date of birth */
  dateOfBirthSource: IdentityAnchorSource | null

  // ── Document identifiers ──────────────────────────────────────────────────

  /**
   * International passport number (e.g. "FC123456").
   * null if no international passport processed.
   */
  internationalPassportNumber: string | null

  /**
   * Ukrainian ID card document number (e.g. "000999999").
   * null if no ID card processed.
   * NOTE: this is the document number, NOT the УНЗР record number.
   */
  idCardDocumentNumber: string | null

  // ── Review flags ──────────────────────────────────────────────────────────

  /**
   * true if any MRZ↔VIZ field mismatch was detected.
   * Anchor cannot be used as source of truth until operator clears this flag.
   */
  mrzMismatchDetected: boolean

  /**
   * true if two contributing documents supply conflicting Latin names that
   * differ beyond acceptable normalization (e.g. hyphen vs space).
   * Requires explicit operator resolution — no silent override allowed.
   */
  latinNameConflict: boolean

  /**
   * true if date of birth differs between contributing documents.
   * Block packet completion until resolved.
   */
  dateOfBirthConflict: boolean

  /**
   * Whether this anchor has been reviewed and cleared by an operator.
   * An anchor with any uncleared conflict flag must not be used for
   * final spelling normalization.
   */
  reviewCleared: boolean

  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

// ── Constructor ───────────────────────────────────────────────────────────────

/**
 * Create a new empty PacketIdentityAnchor for a given packet.
 * All name and document fields are null until identity documents are processed.
 */
export function createEmptyAnchor(packetId: string): PacketIdentityAnchor {
  return {
    packetId,
    contributingDocuments: {},
    surnameLatin: null,
    givenNamesLatin: null,
    latinNameSource: null,
    surnameCyrillic: null,
    givenNamesCyrillic: null,
    patronymicCyrillic: null,
    dateOfBirth: null,
    dateOfBirthSource: null,
    internationalPassportNumber: null,
    idCardDocumentNumber: null,
    mrzMismatchDetected: false,
    latinNameConflict: false,
    dateOfBirthConflict: false,
    reviewCleared: false,
    updatedAt: new Date().toISOString(),
  }
}

// ── Priority comparator ───────────────────────────────────────────────────────

/**
 * Returns true if `incoming` has higher or equal priority than `existing`.
 * Used to decide whether to update Latin name when merging a new document.
 */
export function hasHigherOrEqualPriority(
  incoming: IdentityAnchorSource,
  existing: IdentityAnchorSource,
): boolean {
  const incomingIdx = IDENTITY_ANCHOR_PRIORITY.indexOf(incoming)
  const existingIdx = IDENTITY_ANCHOR_PRIORITY.indexOf(existing)
  // Lower index = higher priority
  return incomingIdx <= existingIdx
}

// ── Name normalization for conflict detection ─────────────────────────────────

/**
 * Normalize a Latin name string for conflict comparison.
 * Collapses whitespace, uppercases, replaces hyphens with spaces.
 * Two names are considered non-conflicting if their normalized forms match.
 */
export function normalizeLatinNameForComparison(name: string): string {
  return name
    .toUpperCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Merge helper ──────────────────────────────────────────────────────────────

export interface MergeIdentityInput {
  sessionId: string
  documentType: string
  source: IdentityAnchorSource
  surnameLatin?: string | null
  givenNamesLatin?: string | null
  surnameCyrillic?: string | null
  givenNamesCyrillic?: string | null
  patronymicCyrillic?: string | null
  dateOfBirth?: string | null
  internationalPassportNumber?: string | null
  idCardDocumentNumber?: string | null
  mrzMismatchDetected?: boolean
}

/**
 * Merge a new document's identity fields into an existing anchor.
 *
 * Rules:
 *   - Latin name: updated only if incoming source has higher/equal priority
 *     AND the names differ beyond normalization (conflict flag set if they differ)
 *   - Date of birth: conflict flag set if values differ (after normalization)
 *   - MRZ mismatch: set to true if any input has it true (sticky flag)
 *   - reviewCleared: reset to false whenever any conflict flag changes to true
 *
 * Returns a new PacketIdentityAnchor (immutable update — do not mutate in-place).
 */
export function mergeIdentityIntoAnchor(
  anchor: PacketIdentityAnchor,
  input: MergeIdentityInput,
): PacketIdentityAnchor {
  const next: PacketIdentityAnchor = {
    ...anchor,
    contributingDocuments: {
      ...anchor.contributingDocuments,
      [input.sessionId]: input.documentType,
    },
    updatedAt: new Date().toISOString(),
  }

  // ── Latin name merge ───────────────────────────────────────────────────────
  const incomingSurname = input.surnameLatin ?? null
  const incomingGiven = input.givenNamesLatin ?? null

  if (incomingSurname !== null || incomingGiven !== null) {
    const canUpdate = anchor.latinNameSource === null
      || hasHigherOrEqualPriority(input.source, anchor.latinNameSource)

    if (canUpdate) {
      // Check for conflict with existing value
      if (anchor.surnameLatin !== null && incomingSurname !== null) {
        const existingNorm = normalizeLatinNameForComparison(anchor.surnameLatin)
        const incomingNorm = normalizeLatinNameForComparison(incomingSurname)
        if (existingNorm !== incomingNorm) {
          next.latinNameConflict = true
          next.reviewCleared = false
        }
      }
      if (anchor.givenNamesLatin !== null && incomingGiven !== null) {
        const existingNorm = normalizeLatinNameForComparison(anchor.givenNamesLatin)
        const incomingNorm = normalizeLatinNameForComparison(incomingGiven)
        if (existingNorm !== incomingNorm) {
          next.latinNameConflict = true
          next.reviewCleared = false
        }
      }
      // Update Latin name to the higher-priority source
      next.surnameLatin = incomingSurname ?? anchor.surnameLatin
      next.givenNamesLatin = incomingGiven ?? anchor.givenNamesLatin
      next.latinNameSource = input.source
    } else {
      // Incoming is lower priority — just check for conflict, do not overwrite
      if (anchor.surnameLatin !== null && incomingSurname !== null) {
        const existingNorm = normalizeLatinNameForComparison(anchor.surnameLatin)
        const incomingNorm = normalizeLatinNameForComparison(incomingSurname)
        if (existingNorm !== incomingNorm) {
          next.latinNameConflict = true
          next.reviewCleared = false
        }
      }
    }
  }

  // ── Cyrillic name merge (always accept — no priority conflict) ─────────────
  if (input.surnameCyrillic != null) next.surnameCyrillic = input.surnameCyrillic
  if (input.givenNamesCyrillic != null) next.givenNamesCyrillic = input.givenNamesCyrillic
  if (input.patronymicCyrillic != null) next.patronymicCyrillic = input.patronymicCyrillic

  // ── Date of birth merge ────────────────────────────────────────────────────
  const incomingDob = input.dateOfBirth ?? null
  if (incomingDob !== null) {
    if (anchor.dateOfBirth !== null && anchor.dateOfBirth !== incomingDob) {
      next.dateOfBirthConflict = true
      next.reviewCleared = false
    } else {
      // Accept if no conflict, or if anchor had none yet
      if (anchor.dateOfBirth === null) {
        next.dateOfBirth = incomingDob
        next.dateOfBirthSource = input.source
      }
    }
  }

  // ── Document numbers ───────────────────────────────────────────────────────
  if (input.internationalPassportNumber != null) {
    next.internationalPassportNumber = input.internationalPassportNumber
  }
  if (input.idCardDocumentNumber != null) {
    next.idCardDocumentNumber = input.idCardDocumentNumber
  }

  // ── MRZ mismatch flag (sticky — once set, stays set until operator clears) ──
  if (input.mrzMismatchDetected === true) {
    next.mrzMismatchDetected = true
    next.reviewCleared = false
  }

  return next
}

// ── Readiness check ───────────────────────────────────────────────────────────

export interface AnchorReadinessResult {
  /** true if anchor can be used as source of truth for packet spelling */
  ready: boolean
  /** Reasons the anchor is not ready */
  blockers: string[]
}

/**
 * Check whether the anchor is ready to be used as the authoritative
 * source of spelling for the immigration packet.
 *
 * An anchor is ready when:
 *   - At least one identity document has been processed
 *   - No unresolved MRZ mismatch
 *   - No unresolved Latin name conflict
 *   - No unresolved date of birth conflict
 */
export function checkAnchorReadiness(anchor: PacketIdentityAnchor): AnchorReadinessResult {
  const blockers: string[] = []

  if (anchor.surnameLatin === null && anchor.givenNamesLatin === null) {
    blockers.push('no_identity_document_processed')
  }
  if (anchor.mrzMismatchDetected && !anchor.reviewCleared) {
    blockers.push('mrz_mismatch_requires_review')
  }
  if (anchor.latinNameConflict && !anchor.reviewCleared) {
    blockers.push('latin_name_conflict_requires_resolution')
  }
  if (anchor.dateOfBirthConflict && !anchor.reviewCleared) {
    blockers.push('date_of_birth_conflict_requires_resolution')
  }

  return {
    ready: blockers.length === 0,
    blockers,
  }
}
