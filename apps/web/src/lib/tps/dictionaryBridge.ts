/**
 * dictionaryBridge — Unified normalization bridge for Central Brain.
 *
 * Exposes a single normalize() entry point that combines:
 *   - @uscis-helper/knowledge: oblast normalization, transliteration, blocklist
 *   - Translation engine nominativeCaseRestorer: genitive → nominative before KMU-55
 *   - Translation engine agencyGlossary: Ukrainian agency abbreviation resolution
 *
 * Previously TPS and Translation Engine had parallel glossaries.
 * This bridge makes TPS use the canonical translation-engine modules.
 * Do NOT create a new dictionary here — re-export existing ones.
 */

import {
  normalizeOblastToNominative,
  GLOBAL_BLOCKLIST,
  GEO_CORRECTIONS,
  SETTLEMENT_TYPES,
  snapCity,
  translateCivilRegistryTerm,
  lookupAuthority,
} from '@uscis-helper/knowledge'
import { restoreNominative } from '@/lib/translation/glossary/nominativeCaseRestorer'
import { resolveIssuedBy } from '@/lib/translation/glossary/agencyGlossary'

export type NormalizeField =
  | 'province_of_birth'
  | 'city_of_birth'
  | 'middle_name'
  | 'family_name'
  | 'given_name'
  | 'issued_by'
  | string

export interface NormalizeResult {
  value: string | null
  source: 'knowledge' | 'translation_engine' | 'passthrough' | 'blocked' | 'gazetteer'
  notes: string[]
  // P2.1 (SMART_NORMALIZE_ENABLED): gazetteer signal. Optional — additive, does
  // not break existing callers. review_required=true means "fuzzy/unknown, do NOT
  // trust the value as final" (NO silent correction). suggested_value is a hint only.
  review_required?: boolean
  suggested_value?: string | null
}

/**
 * Normalize a province_of_birth value from a Ukrainian document.
 * Input may be genitive ("Вінницької обл.") → output "Vinnytsia Oblast".
 */
export function normalizeProvince(raw: string): NormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) return { value: null, source: 'knowledge', notes: ['empty input'] }

  const result = normalizeOblastToNominative(trimmed)
  if (result) {
    // result.transliterated already includes "Oblast" (e.g. "Vinnytsia Oblast")
    return {
      value: result.transliterated,
      source: 'knowledge',
      notes: [`nominative_uk=${result.nominative_uk}`],
    }
  }
  return { value: trimmed, source: 'passthrough', notes: ['oblast not recognized, passed through'] }
}

/**
 * Normalize a city_of_birth value.
 * Applies GEO_CORRECTIONS (OCR typo corrections) and strips settlement descriptors.
 */
export function normalizeCity(raw: string): NormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) return { value: null, source: 'knowledge', notes: ['empty input'] }

  // Check if in global blocklist
  if (GLOBAL_BLOCKLIST.has(trimmed.toLowerCase())) {
    return { value: null, source: 'blocked', notes: [`"${trimmed}" is in GLOBAL_BLOCKLIST`] }
  }

  // Apply GEO_CORRECTIONS (wrong Ukrainian form → correct English)
  for (const correction of GEO_CORRECTIONS) {
    if (correction.wrong === trimmed) {
      return {
        value: correction.correct,
        source: 'knowledge',
        notes: [`geo_correction: ${correction.wrong} → ${correction.correct}`],
      }
    }
  }

  // Strip settlement type prefixes (м. Київ → Kyiv)
  let cleaned = trimmed
  for (const [abbr] of Object.entries(SETTLEMENT_TYPES)) {
    const escapedAbbr = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`^${escapedAbbr}\\s+`, 'u')
    if (re.test(cleaned)) {
      cleaned = cleaned.replace(re, '').trim()
      break
    }
  }

  // ── P2.1 SMART_NORMALIZE_ENABLED (default OFF): gazetteer snap ──────────────
  // Runs AFTER GEO_CORRECTIONS + settlement strip, BEFORE downstream KMU-55.
  // Moves the previously-orphaned snapCity (was only in dead orchestrator.ts)
  // into the live door. Hard rule: matched=false → review_required, NEVER a
  // silent replacement (a fuzzy guess is a suggestion, not truth).
  if (process.env.SMART_NORMALIZE_ENABLED === '1' && cleaned) {
    const snapped = snapCity(cleaned)
    if (snapped.matched) {
      // Exact gazetteer hit — trust it.
      return {
        value: snapped.value,
        source: 'gazetteer',
        notes: [`snapCity exact: "${cleaned}" → "${snapped.value}"`],
        review_required: false,
      }
    }
    // Fuzzy or unknown — keep RAW cleaned value, force review, surface suggestion.
    return {
      value: cleaned,
      source: 'passthrough',
      notes: [`snapCity no exact match (${snapped.reason}); review_required`],
      review_required: true,
      suggested_value: snapped.suggestedValue ?? null,
    }
  }

  return { value: cleaned, source: 'passthrough', notes: [] }
}

/**
 * Normalize a Ukrainian name field (family_name, given_name, middle_name).
 * For Cyrillic input: restore nominative case first, then transliterate.
 * For Latin input (controlling spelling from DL/I-94): pass through as-is.
 */
export function normalizeName(raw: string, field: NormalizeField): NormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) return { value: null, source: 'passthrough', notes: ['empty input'] }

  // Detect if primarily Cyrillic
  const cyrillicCount = (trimmed.match(/[а-яА-ЯіІїЇєЄґҐ]/gu) ?? []).length
  const latinCount = (trimmed.match(/[a-zA-Z]/g) ?? []).length

  if (cyrillicCount > latinCount) {
    // Ukrainian Cyrillic input: restore nominative case, then transliterate via KMU-55
    const nominative = restoreNominative(trimmed)
    return {
      value: nominative,
      source: 'translation_engine',
      notes: [`cyrillic_input, nominative_restored=${nominative !== trimmed}`],
    }
  }

  // Latin input (controlling spelling) — pass through
  return { value: trimmed, source: 'passthrough', notes: ['latin_controlling_spelling'] }
}

/**
 * Normalize an issued_by field (document issuing authority).
 * Resolves Ukrainian agency abbreviations using translation engine glossary.
 */
export function normalizeIssuedBy(raw: string): NormalizeResult {
  const trimmed = raw.trim()
  if (!trimmed) return { value: null, source: 'translation_engine', notes: ['empty input'] }

  const result = resolveIssuedBy(trimmed)
  if (result.resolved) {
    return {
      value: result.resolved,
      source: 'translation_engine',
      notes: [`agency_resolved: glossary_confidence=${result.glossary_confidence}`],
    }
  }
  return { value: trimmed, source: 'passthrough', notes: ['agency not resolved, passed through'] }
}

/**
 * Unified normalize entry point for Central Brain.
 * Routes to the appropriate normalizer based on field name.
 */
export function normalize(field: NormalizeField, rawValue: string): NormalizeResult {
  switch (field) {
    case 'province_of_birth': return normalizeProvince(rawValue)
    case 'city_of_birth': return normalizeCity(rawValue)
    case 'family_name':
    case 'given_name':
    case 'middle_name': return normalizeName(rawValue, field)
    case 'issued_by': return normalizeIssuedBy(rawValue)
    default: return { value: rawValue.trim() || null, source: 'passthrough', notes: [] }
  }
}

/**
 * P2.3 (SMART_NORMALIZE_ENABLED): resolve a document issuing authority from its
 * raw Cyrillic into the canonical English name using the sourced registry —
 * civil-registry terms first (РАЦС/ЗАГС/ДРАЦС), then the authority registry
 * (МВС/міліція/…). Returns the registry's official English + its review flag
 * and warning verbatim (e.g. ЗАГС → review on pre-2013 docs; міліція → Militsiya,
 * NEVER Police). On no match → passthrough (caller keeps its transliteration).
 *
 * Pure. `documentDate` (optional) drives the registry's era-gating. This is the
 * canonical resolver; the legacy per-module authority maps in militaryId.ts /
 * birthCertificate.ts are slated to be removed in P5.
 */
export function resolveAuthority(rawCyrillic: string, documentDate?: string): NormalizeResult {
  const trimmed = (rawCyrillic ?? '').trim()
  if (!trimmed) return { value: null, source: 'passthrough', notes: ['empty input'] }

  const civil = translateCivilRegistryTerm(trimmed, documentDate)
  if (civil.matched) {
    return {
      value: civil.official_en,
      source: 'knowledge',
      notes: [`civil_registry: ${civil.reason}`, ...(civil.warning ? [civil.warning] : [])],
      review_required: civil.review_required,
    }
  }

  const auth = lookupAuthority(trimmed, documentDate)
  if (auth.matched) {
    return {
      value: auth.official_en,
      source: 'knowledge',
      notes: [`authority: ${auth.reason}`, ...(auth.warning ? [auth.warning] : [])],
      review_required: auth.review_required,
    }
  }

  return { value: trimmed, source: 'passthrough', notes: ['no registry match'] }
}
