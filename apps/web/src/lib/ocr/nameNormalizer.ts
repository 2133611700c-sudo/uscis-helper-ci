/**
 * nameNormalizer.ts
 *
 * OCR name safety layer for Ukrainian internal passport processing.
 *
 * Problems solved:
 *   1. Cyrillic/Latin lookalike substitution: Vision OCR returns 'TAPAC' instead of 'ТАРАС'
 *      because Т→T, А→A, Р→P, С→C look identical in many fonts.
 *   2. Abnormal casing: 'ShEVChENKO' — artifact of OCR confidence weighting.
 *   3. Mixed-script tokens: a single word containing both Cyrillic and Latin Unicode ranges.
 *
 * Policy:
 *   - Flag suspicious values → review_required = true
 *   - Apply safe casing normalization where reliable
 *   - Never silently trust a repaired value without user confirmation
 *   - Preserve controlling Latin spelling if user has one (one_document_exception)
 */

// ── Unicode range helpers ─────────────────────────────────────────────────────

/** Cyrillic block: U+0400–U+04FF + U+0500–U+052F */
const CYRILLIC_RE = /[Ѐ-ԯ]/
/** Basic Latin letters (A-Z, a-z only, no digits/punct) */
const LATIN_LETTER_RE = /[A-Za-z]/

/** Lookalike Latin chars that map visually to common Cyrillic letters */
const LATIN_LOOKALIKES: ReadonlyMap<string, string> = new Map([
  // uppercase
  ['A', 'А'], ['B', 'В'], ['C', 'С'], ['E', 'Е'], ['H', 'Н'],
  ['I', 'І'], ['K', 'К'], ['M', 'М'], ['O', 'О'], ['P', 'Р'],
  ['T', 'Т'], ['X', 'Х'], ['Y', 'У'],
  // lowercase
  ['a', 'а'], ['c', 'с'], ['e', 'е'], ['i', 'і'], ['o', 'о'],
  ['p', 'р'], ['x', 'х'], ['y', 'у'],
])

// ── Abbreviations that must NOT be title-cased ────────────────────────────────
// Add to this list freely — checked case-insensitively.
const PROTECTED_ABBREVIATIONS: ReadonlySet<string> = new Set([
  'MVS', 'MIA', 'SBU', 'ID', 'USA', 'USSR', 'UKR', 'UAH',
  'USCIS', 'DHS', 'DOJ', 'ICE', 'I-94', 'I-130', 'I-485',
  'EAD', 'RFE', 'DACA', 'TPS', 'U4U',
  'DMS',   // Державна міграційна служба abbreviation in English
  'РНОКПП', // Ukrainian tax number abbreviation
])

// ── Detection: mixed-script token ────────────────────────────────────────────

/** True if a single word contains both Cyrillic and Latin characters. */
export function hasMixedScript(token: string): boolean {
  return CYRILLIC_RE.test(token) && LATIN_LETTER_RE.test(token)
}

// ── Detection: lookalike substitution ────────────────────────────────────────

/**
 * True if the string contains Latin lookalike chars that are visually
 * indistinguishable from Cyrillic — e.g. 'TAPAC' instead of 'ТАРАС'.
 *
 * Only meaningful in a Ukrainian context where the expected script is Cyrillic.
 * We check: does the string contain ONLY Latin letters (no Cyrillic at all)
 * but ALL those letters exist in the lookalike map?
 */
export function isLikelyCyrillicLookalike(token: string): boolean {
  if (!token) return false
  // If already contains Cyrillic, it's not a pure lookalike replacement
  if (CYRILLIC_RE.test(token)) return false

  const letters = token.replace(/[^A-Za-z]/g, '')
  if (letters.length < 2) return false

  // All extracted Latin letters must be in the lookalike set
  const allAreLokalikes = [...letters].every(ch => LATIN_LOOKALIKES.has(ch))
  return allAreLokalikes
}

// ── Detection: abnormal casing (ShEVChENKO pattern) ──────────────────────────

const ABNORMAL_CASING_RE = /[a-z][A-Z]|[A-Z]{2,}[a-z][A-Z]/

/**
 * True if a token shows OCR-artifact casing like 'ShEVChENKO':
 * — alternating uppercase/lowercase mid-word in non-title-case position
 */
export function hasAbnormalCasing(token: string): boolean {
  if (token.length < 3) return false
  if (PROTECTED_ABBREVIATIONS.has(token.toUpperCase())) return false
  return ABNORMAL_CASING_RE.test(token)
}

// ── Normalizer: safe title-case ───────────────────────────────────────────────

/**
 * Safely title-case a name string.
 *
 * Rules:
 *  - Each word → first letter uppercase, rest lowercase
 *  - Protected abbreviations (MVS, ID, USA…) are preserved as-is
 *  - Hyphenated names: each part title-cased independently
 *  - Does NOT attempt Cyrillic repairs (user must confirm)
 *
 * Examples:
 *   ShEVChENKO        → Shevchenko
 *   TESTENKO          → Testenko
 *   OLENA             → Olena
 *   MVS Kharkiv Oblast → MVS Kharkiv Oblast
 *   DMYTRO-IVAN       → Dmytro-Ivan
 */
export function normalizeName(value: string): string {
  return value
    .split(/\s+/)
    .map(word => normalizeWord(word))
    .join(' ')
}

function normalizeWord(word: string): string {
  if (!word) return word

  // Handle hyphenated parts (e.g. DMYTRO-IVAN)
  if (word.includes('-')) {
    return word.split('-').map(part => normalizeWord(part)).join('-')
  }

  // Preserve protected abbreviations exactly
  if (PROTECTED_ABBREVIATIONS.has(word.toUpperCase())) {
    return word.toUpperCase()
  }

  // Standard title-case for Latin scripts
  if (!CYRILLIC_RE.test(word)) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }

  // For Cyrillic words, apply same title-case logic
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

// ── Main: analyse a name field value ─────────────────────────────────────────

export interface NameAnalysisResult {
  /** Normalized value (safe title-case applied if reliable) */
  normalized: string
  /** Whether the value requires human review */
  review_required: boolean
  /** Reason code if review required */
  review_reason?: string
  /** Warnings for logging (never surfaced as raw PII) */
  warnings: string[]
}

/**
 * Analyse a name-type field value extracted by OCR.
 * Returns a normalized version and a review flag.
 *
 * This is called from the field-mapper after DeepSeek mapping.
 */
export function analyseNameField(rawValue: string): NameAnalysisResult {
  const warnings: string[] = []
  let reviewRequired = false
  let reviewReason: string | undefined

  const tokens = rawValue.trim().split(/\s+/)

  for (const token of tokens) {
    if (hasMixedScript(token)) {
      warnings.push('mixed_script_token')
      reviewRequired = true
      reviewReason = 'mixed_script_ocr_suspected'
    }

    if (isLikelyCyrillicLookalike(token)) {
      warnings.push('latin_lookalike_substitution_suspected')
      reviewRequired = true
      reviewReason = reviewReason ?? 'mixed_script_ocr_suspected'
    }
  }

  // Always normalize casing regardless of suspicion
  // (ShEVChENKO → Shevchenko is always safer than leaving it)
  const normalized = normalizeName(rawValue)

  // Flag abnormal casing even after normalization (so user sees it in review)
  for (const token of tokens) {
    if (hasAbnormalCasing(token)) {
      warnings.push('abnormal_casing_detected')
      reviewRequired = true
      reviewReason = reviewReason ?? 'mixed_script_ocr_suspected'
    }
  }

  return {
    normalized,
    review_required: reviewRequired,
    review_reason: reviewReason,
    warnings,
  }
}

/** Fields that should pass through name analysis */
export const NAME_FIELDS: ReadonlySet<string> = new Set([
  'surname',
  'given_names',
  'patronymic',
  'place_of_birth',
  'issued_by',
])
