/**
 * Field Arbiter v0 — Messenginfo TPS
 *
 * Minimal server-side arbiter. 4 functions only:
 * 1. source ranking
 * 2. strong-field lock
 * 3. rejectedCandidates tracking
 * 4. conflict / review flags
 *
 * NOT a full Central Brain. NOT a translation renderer.
 * Just prevents weak sources from corrupting strong truth.
 */

// ── Field Classes ──────────────────────────────────────────────────────────

export type FieldClass = 'STRONG_IDENTITY' | 'STRONG_DOCUMENT' | 'WEAK_REVIEW'

export const FIELD_CLASS: Record<string, FieldClass> = {
  family_name: 'STRONG_IDENTITY',
  given_name: 'STRONG_IDENTITY',
  dob: 'STRONG_IDENTITY',
  sex: 'STRONG_IDENTITY',
  passport_number: 'STRONG_IDENTITY',

  passport_expiration_date: 'STRONG_DOCUMENT',
  a_number: 'STRONG_DOCUMENT',
  i94_admission_number: 'STRONG_DOCUMENT',
  last_entry_date: 'STRONG_DOCUMENT',
  status_at_last_entry: 'STRONG_DOCUMENT',
  i94_class_of_admission: 'STRONG_DOCUMENT',
  us_address_street: 'STRONG_DOCUMENT',
  us_address_city: 'STRONG_DOCUMENT',
  us_address_state: 'STRONG_DOCUMENT',
  us_address_zip: 'STRONG_DOCUMENT',
  ead_category_on_card: 'STRONG_DOCUMENT',
  country_of_nationality: 'STRONG_DOCUMENT',
  country_of_birth: 'STRONG_DOCUMENT',
  passport_country_of_issuance: 'STRONG_DOCUMENT',

  middle_name: 'WEAK_REVIEW',
  city_of_birth: 'WEAK_REVIEW',
  province_of_birth: 'WEAK_REVIEW',
}

// ── Levenshtein Distance — cross-document fuzzy name matching ──────────────
// Detects OCR errors like "Saghi" vs "Taras" (distance=3 → conflict)
// Same-value check: distance ≤ 1 = same value, 2 = possible OCR error (flag),
// ≥ 3 = material conflict (reject lower-priority source)
export function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  const matrix: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      )
    }
  }
  return matrix[la][lb]
}

// Name plausibility check — rejects obvious garbage
export function isPlausibleName(value: string): boolean {
  if (!value || value.length < 2 || value.length > 50) return false
  // Must contain at least one vowel (real names do)
  if (!/[aeiouAEIOUаеєиіїоуюяАЕЄИІЇОУЮЯ]/i.test(value)) return false
  // Must not contain digits
  if (/\d/.test(value)) return false
  // Must not be all uppercase with mixed garbage
  const words = value.split(/\s+/)
  for (const w of words) {
    if (w.length < 2) continue
    const allUp = w === w.toUpperCase()
    const allLo = w === w.toLowerCase()
    const title = /^[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ]+$/.test(w)
    if (!allUp && !allLo && !title) return false // mixed-case garbage
  }
  return true
}

// ── Source Types ────────────────────────────────────────────────────────────

export type SourceDoc = 'passport' | 'booklet' | 'i94' | 'ead' | 'i797' | 'dl' | 'manual'
export type SourceType = 'ocr_mrz' | 'ocr_rule' | 'ocr_keyword' | 'dual_ocr_crossref' | 'ai_brain' | 'manual' | 'user_corrected'

export interface ExtractedCandidate {
  field: string
  value: string | null
  sourceDoc: SourceDoc
  sourceType: SourceType
  confidence: number | null
  reviewRequired: boolean
}

export interface ResolvedField {
  field: string
  chosenValue: string | null
  chosenSourceDoc: SourceDoc | null
  chosenSourceType: SourceType | null
  locked: boolean
  reviewRequired: boolean
  conflict: boolean
  rejectedCandidates: ExtractedCandidate[]
  notes: string[]
}

// ── Source Priority Rankings ───────────────────────────────────────────────
// Lower number = higher priority. Different rankings per field class.

const IDENTITY_PRIORITY: Record<string, number> = {
  passport_ocr_mrz: 1,        // MRZ is the gold standard
  i94_ocr_keyword: 2,         // CBP official Latin
  ead_ocr_keyword: 3,         // USCIS official Latin
  dl_ocr_keyword: 4,          // US state official Latin
  booklet_dual_ocr_crossref: 5, // dual OCR crossref — better than Brain, below printed sources
  passport_ai_brain: 6,       // Brain guess from passport
  booklet_ai_brain: 7,        // Brain guess from booklet
  ead_ai_brain: 8,            // Brain guess from EAD
  i94_ai_brain: 9,            // Brain guess from I-94
  dl_ai_brain: 10,            // Brain guess from DL
  manual_manual: 11,          // User typed
  manual_user_corrected: 0,   // User explicitly corrected → highest
}

const DOCUMENT_PRIORITY: Record<string, Record<string, number>> = {
  a_number: { ead: 1, i797: 2, manual: 10 },
  i94_admission_number: { i94: 1, manual: 10 },
  last_entry_date: { i94: 1, manual: 10 },
  status_at_last_entry: { i94: 1, manual: 10 },
  i94_class_of_admission: { i94: 1, manual: 10 },
  us_address_street: { dl: 1, i797: 2, manual: 10 },
  us_address_city: { dl: 1, i797: 2, manual: 10 },
  us_address_state: { dl: 1, i797: 2, manual: 10 },
  us_address_zip: { dl: 1, i797: 2, manual: 10 },
  passport_expiration_date: { passport: 1, manual: 10 },
  ead_category_on_card: { ead: 1, manual: 10 },
  country_of_nationality: { passport: 1, i94: 2, manual: 10 },
  country_of_birth: { ead: 1, passport: 2, manual: 10 },
  passport_country_of_issuance: { passport: 1, manual: 10 },
}

const WEAK_PRIORITY: Record<string, number> = {
  booklet_dual_ocr_crossref: 1, // dual OCR (Vision+DocAI) + DeepSeek cross-ref — highest automated
  booklet_ocr_keyword: 2,     // booklet rule module (labels matched)
  booklet_ai_brain: 3,        // booklet Brain extraction
  passport_ai_brain: 4,       // passport Brain guess
  manual_manual: 5,
  manual_user_corrected: 0,   // user correction always wins
}

function getPriority(field: string, sourceDoc: string, sourceType: string): number {
  const cls = FIELD_CLASS[field]
  const key = `${sourceDoc}_${sourceType}`

  if (sourceType === 'user_corrected') return 0 // always wins

  if (cls === 'STRONG_IDENTITY') {
    return IDENTITY_PRIORITY[key] ?? 99
  }
  if (cls === 'STRONG_DOCUMENT') {
    const docPriority = DOCUMENT_PRIORITY[field]
    if (docPriority) return docPriority[sourceDoc] ?? 99
    return 99
  }
  if (cls === 'WEAK_REVIEW') {
    return WEAK_PRIORITY[key] ?? 99
  }
  return 99
}

// ── Core Arbiter Function ──────────────────────────────────────────────────

export function resolveField(
  field: string,
  candidates: ExtractedCandidate[],
): ResolvedField {
  if (candidates.length === 0) {
    return {
      field,
      chosenValue: null,
      chosenSourceDoc: null,
      chosenSourceType: null,
      locked: false,
      reviewRequired: true,
      conflict: false,
      rejectedCandidates: [],
      notes: ['no_candidates'],
    }
  }

  // Sort by priority (lower = better)
  const notes: string[] = []
  const sorted = [...candidates]
    .filter((c) => c.value !== null && c.value.trim() !== '')
    .sort((a, b) => {
      const pa = getPriority(field, a.sourceDoc, a.sourceType)
      const pb = getPriority(field, b.sourceDoc, b.sourceType)
      return pa - pb
    })

  if (sorted.length === 0) {
    return {
      field,
      chosenValue: null,
      chosenSourceDoc: null,
      chosenSourceType: null,
      locked: false,
      reviewRequired: true,
      conflict: false,
      rejectedCandidates: candidates,
      notes: ['all_candidates_empty'],
    }
  }

  const winner = sorted[0]
  const losers = sorted.slice(1)
  const cls = FIELD_CLASS[field] ?? 'WEAK_REVIEW'

  // Plausibility guard for identity fields: reject if winner fails
  const isIdentity = cls === 'STRONG_IDENTITY'
  if (isIdentity && winner.value && !isPlausibleName(winner.value)) {
    // Winner itself is garbage — try next plausible candidate
    const plausible = sorted.find((c) => c.value && isPlausibleName(c.value))
    if (plausible) {
      const idx = sorted.indexOf(plausible)
      sorted.splice(idx, 1)
      sorted.unshift(plausible)
      notes.push(`plausibility_rejected:${winner.sourceDoc}=${winner.value}`)
      // Reassign winner
      const oldWinner = winner
      const newWinner = plausible
      losers.push(oldWinner)
      return resolveField(field, [newWinner, ...sorted.slice(1)])
    }
  }

  // Lock: MRZ identity fields are immutable
  const locked = cls === 'STRONG_IDENTITY' && winner.sourceType === 'ocr_mrz'

  // Conflict detection with Levenshtein fuzzy matching
  // distance 0-1 = same value (case/typo), 2 = possible OCR error, ≥3 = material conflict
  const winVal = (winner.value ?? '').toLowerCase().trim()
  let hasConflict = false
  for (const l of losers) {
    if (!l.value) continue
    const lVal = l.value.toLowerCase().trim()
    if (lVal === winVal) continue // exact match (case-insensitive)
    const dist = levenshtein(winVal, lVal)
    if (dist <= 1) continue // trivial difference (single char typo)
    hasConflict = true
    if (isIdentity && dist >= 3) {
      notes.push(`fuzzy_conflict:${l.sourceDoc}="${l.value}"_dist=${dist}`)
    }
  }

  // Review required: weak fields always, or if conflict exists on non-locked
  const reviewRequired =
    cls === 'WEAK_REVIEW' ||
    (hasConflict && !locked) ||
    winner.reviewRequired

  if (locked) notes.push('mrz_locked')
  if (hasConflict) notes.push('conflict_detected')
  if (cls === 'WEAK_REVIEW') notes.push('weak_field_review_required')

  // Rejected losers: different values (Levenshtein > 1)
  const rejectedCandidates = losers.filter((l) => {
    if (!l.value) return false
    const lVal = l.value.toLowerCase().trim()
    if (lVal === winVal) return false
    return levenshtein(winVal, lVal) > 1
  })

  // If locked and there are conflicts, annotate rejection reason
  if (locked && rejectedCandidates.length > 0) {
    notes.push(`mrz_lock_rejected:${rejectedCandidates.map((r) => `${r.sourceDoc}=${r.value}`).join(',')}`)
  }

  return {
    field,
    chosenValue: winner.value,
    chosenSourceDoc: winner.sourceDoc,
    chosenSourceType: winner.sourceType,
    locked,
    reviewRequired,
    conflict: hasConflict,
    rejectedCandidates,
    notes,
  }
}

// ── Batch Resolver ─────────────────────────────────────────────────────────

export interface ArbiterInput {
  /** Fields from each uploaded document slot */
  uploads: Record<string, ExtractedCandidate[]>
  /** Manual overrides from user */
  manual: Record<string, string>
}

export interface ArbiterOutput {
  resolvedFields: Record<string, ResolvedField>
  /** Total conflicts across all fields */
  conflictCount: number
  /** Fields that require user review */
  reviewRequired: string[]
  /** Fields locked by MRZ */
  lockedFields: string[]
  /** All rejected candidates for audit trail */
  allRejected: Record<string, ExtractedCandidate[]>
}

export function resolveAllFields(input: ArbiterInput): ArbiterOutput {
  // Collect all candidates per field from all uploads
  const candidatesByField: Record<string, ExtractedCandidate[]> = {}

  for (const [_slot, fields] of Object.entries(input.uploads)) {
    for (const candidate of fields) {
      if (!candidate.field) continue
      const list = candidatesByField[candidate.field] ?? []
      list.push(candidate)
      candidatesByField[candidate.field] = list
    }
  }

  // Add manual overrides as candidates with lowest priority
  for (const [field, value] of Object.entries(input.manual)) {
    if (!value || !value.trim()) continue
    const list = candidatesByField[field] ?? []
    list.push({
      field,
      value: value.trim(),
      sourceDoc: 'manual',
      sourceType: 'manual',
      confidence: null,
      reviewRequired: false,
    })
    candidatesByField[field] = list
  }

  // Resolve each field
  const resolvedFields: Record<string, ResolvedField> = {}
  const allRejected: Record<string, ExtractedCandidate[]> = {}
  let conflictCount = 0
  const reviewRequired: string[] = []
  const lockedFields: string[] = []

  for (const [field, candidates] of Object.entries(candidatesByField)) {
    const resolved = resolveField(field, candidates)
    resolvedFields[field] = resolved
    if (resolved.conflict) conflictCount++
    if (resolved.reviewRequired) reviewRequired.push(field)
    if (resolved.locked) lockedFields.push(field)
    if (resolved.rejectedCandidates.length > 0) {
      allRejected[field] = resolved.rejectedCandidates
    }
  }

  return {
    resolvedFields,
    conflictCount,
    reviewRequired,
    lockedFields,
    allRejected,
  }
}
