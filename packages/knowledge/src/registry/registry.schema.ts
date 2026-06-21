/**
 * registry.schema.ts — Glossary Registry (D-GLOSSARY) single source of truth.
 *
 * ONE source → TWO representations:
 *   - registry.csv      : human-editable table (open in Excel/Sheets; one row = one term)
 *   - runtime index     : compiled by registryIndex.ts for fast agent lookup
 *
 * EVERY row MUST carry source_url (provenance). The lookup layer NEVER returns a
 * translated value without its source_url, and NEVER auto-modernises a historical
 * document (era-gating via valid_from/valid_until + documentDate).
 */

export type RegistryCategory =
  | 'authority'
  | 'settlement'
  | 'settlement_type'
  | 'oblast'
  | 'abbreviation'
  | 'civil_registry_term'
  | 'passport_authority'
  | 'military_authority'
  | 'document_type'
  | 'field_label'

export const REGISTRY_CATEGORIES: RegistryCategory[] = [
  'authority', 'settlement', 'settlement_type', 'oblast', 'abbreviation',
  'civil_registry_term', 'passport_authority', 'military_authority', 'document_type', 'field_label',
]

/** Exact CSV column order (registry.csv header must match this). */
export const REGISTRY_COLUMNS = [
  'category', 'key_uk', 'key_ru', 'official_en', 'aliases',
  'valid_from', 'valid_until', 'source_url', 'source_authority', 'source_act',
  'confidence_rule', 'review_rule', 'warning', 'notes',
] as const

/** One parsed registry record (one term). */
export interface RegistryRow {
  category: RegistryCategory
  key_uk: string
  key_ru: string
  official_en: string
  aliases: string[]              // parsed from pipe-separated CSV cell
  valid_from: string | null      // ISO yyyy-mm-dd or null (= always valid from)
  valid_until: string | null     // ISO yyyy-mm-dd or null (= still valid)
  source_url: string             // MANDATORY — CI fails without it
  source_authority: string       // e.g. "Мінюст", "ДМС", "Мінрегіон"
  source_act: string             // e.g. "КМУ №1025 (10.11.2010)"
  confidence_rule: 'high' | 'medium' | 'low' | string
  review_rule: 'auto' | 'always_review' | 'historical_lock' | 'keep_type' | string
  warning: string
  notes: string
}

export interface LookupOptions {
  documentDate?: string   // ISO date or year ("1986") — drives era-gating
  oblast?: string         // scope settlement search to an oblast
  strict?: boolean        // strict = no fuzzy match (exact/alias only)
}

export interface LookupResult {
  matched: boolean
  official_en: string
  normalized_uk: string
  source_url: string
  valid_from: string | null
  valid_until: string | null
  confidence: number      // 0..1
  review_required: boolean
  warning: string
  candidates: string[]    // alternative official_en values when ambiguous/fuzzy
  settlementType?: string // for settlement lookups: "urban-type settlement" | "city" | "village"
  reason: string          // short audit string explaining the decision
}

export function emptyResult(reason: string): LookupResult {
  return { matched: false, official_en: '', normalized_uk: '', source_url: '', valid_from: null,
    valid_until: null, confidence: 0, review_required: true, warning: '', candidates: [], reason }
}
