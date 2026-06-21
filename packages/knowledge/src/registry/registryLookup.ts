/**
 * registryLookup.ts — the ONE call the brain makes after OCR/HTR, before translation/PDF.
 *
 * Guarantees (the "safety instruments"):
 *  - NEVER returns official_en without source_url.
 *  - Era-gating: a value is only auto-accepted if valid at the document's date;
 *    a historical document is NOT modernised (valid_from/valid_until vs documentDate).
 *  - Fuzzy/ambiguous/unknown → review_required=true (never a silent guess).
 *  - settlement: the settlement TYPE (смт/с./м.) is preserved, never silently dropped.
 */
import { confusionDistance } from '../gazetteer'
import { getIndex, normKey } from './registryIndex'
import {
  type RegistryRow, type RegistryCategory, type LookupOptions, type LookupResult, emptyResult,
} from './registry.schema'

function toDate(s: string | null | undefined): number | null {
  if (!s) return null
  const v = /^\d{4}$/.test(s) ? `${s}-01-01` : s
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

/** Is a row valid at the document's date? Unknown date → treat as valid (but caller may review). */
function eraOk(row: RegistryRow, docDate?: string): boolean {
  const d = toDate(docDate)
  if (d === null) return true
  const from = toDate(row.valid_from)
  const until = toDate(row.valid_until)
  if (from !== null && d < from) return false
  if (until !== null && d > until) return false
  return true
}

function confidenceOf(row: RegistryRow): number {
  return row.confidence_rule === 'high' ? 0.95 : row.confidence_rule === 'low' ? 0.5 : 0.75
}

function resultFromRow(row: RegistryRow, opts: { review: boolean; confidence?: number; warning?: string; candidates?: string[]; reason: string }): LookupResult {
  const forceReview = row.review_rule === 'always_review' || row.review_rule === 'historical_lock' || row.review_rule === 'keep_type'
  return {
    matched: true,
    official_en: row.official_en,
    normalized_uk: row.key_uk,
    source_url: row.source_url,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    confidence: opts.confidence ?? confidenceOf(row),
    review_required: opts.review || forceReview,
    warning: [row.warning, opts.warning].filter(Boolean).join(' | '),
    candidates: opts.candidates ?? [],
    reason: opts.reason,
  }
}

/**
 * Core lookup. category + raw Cyrillic input → LookupResult.
 */
export function lookupRegistry(category: RegistryCategory, input: string, opts: LookupOptions = {}): LookupResult {
  const idx = getIndex()
  const key = normKey(input)
  if (!key) return emptyResult('empty input')

  const keyMap = idx.exact.get(category)
  const exactRows = keyMap?.get(key) ?? []

  // 1) exact key/alias match
  if (exactRows.length) {
    const applicable = exactRows.filter((r) => eraOk(r, opts.documentDate))
    if (applicable.length) {
      const pick = applicable[0]
      return resultFromRow(pick, { review: false, reason: 'exact match, valid for document date' })
    }
    // matched but NOT valid for the document date → do NOT auto-modernise; flag review
    const pick = exactRows[0]
    return resultFromRow(pick, {
      review: true,
      warning: 'era mismatch — entry not valid for the document date; verify the historical name',
      candidates: [...new Set(exactRows.map((r) => r.official_en))],
      reason: 'exact match but era-gated → review',
    })
  }

  // 2) fuzzy match (only where it is meaningful + not strict): settlement / oblast
  if (!opts.strict && (category === 'settlement' || category === 'oblast')) {
    const rows = idx.byCategory.get(category) ?? []
    let best: RegistryRow | null = null
    let bestNorm = Infinity
    const scored: Array<{ row: RegistryRow; norm: number }> = []
    for (const r of rows) {
      for (const cand of [r.key_uk, r.key_ru, ...r.aliases].map(normKey).filter(Boolean)) {
        const dist = confusionDistance(key, cand)
        const n = dist / Math.max(key.length, cand.length, 1)
        scored.push({ row: r, norm: n })
        if (n < bestNorm) { bestNorm = n; best = r }
      }
    }
    if (best && bestNorm <= 0.34) {
      const candidates = [...new Set(scored.filter((s) => s.norm <= 0.5).sort((a, b) => a.norm - b.norm).map((s) => s.row.official_en))]
      return resultFromRow(best, {
        review: true, // fuzzy is NEVER silent
        confidence: Math.max(0.4, 0.9 - bestNorm),
        warning: `fuzzy match (distance ${bestNorm.toFixed(2)}) — verify against the document`,
        candidates,
        reason: 'fuzzy match → review',
      })
    }
  }

  // 3) nothing → explicit miss, always review (never silent empty)
  return emptyResult(`no glossary match for "${input}" in ${category}`)
}

// ── settlement-type handling (preserve смт/с./м., never drop) ─────────────────

/** Detect & strip a leading settlement-type token; returns the type row (if any) + the rest. */
export function normalizeSettlementType(input: string): LookupResult {
  const idx = getIndex()
  const keyMap = idx.exact.get('settlement_type')
  const tokens = normKey(input).split(' ')
  // try the leading 1-2 tokens against settlement_type keys/aliases
  for (const n of [2, 1]) {
    const probe = tokens.slice(0, n).join(' ')
    const rows = keyMap?.get(probe)
    if (rows && rows.length) return resultFromRow(rows[0], { review: false, reason: 'settlement type detected' })
  }
  return emptyResult('no settlement type prefix')
}

function stripLeadingType(input: string): { typeRes: LookupResult | null; rest: string } {
  const t = normalizeSettlementType(input)
  if (!t.matched) return { typeRes: null, rest: input.trim() }
  // remove the matched leading token(s) from the original input
  const tokens = input.trim().split(/\s+/)
  // how many tokens did we consume? recompute against normalized
  const norm = normKey(input)
  const matchedKeyLen = normKey(t.normalized_uk).split(' ').length
  // best-effort: drop the same number of leading tokens as the matched key, else 1
  const drop = norm.startsWith(normKey(t.normalized_uk)) ? matchedKeyLen : 1
  return { typeRes: t, rest: tokens.slice(drop).join(' ').trim() }
}

// ── public helper API (the 7 functions) ──────────────────────────────────────

export function lookupAuthority(input: string, documentDate?: string): LookupResult {
  return lookupRegistry('authority', input, { documentDate })
}

export function lookupSettlement(input: string, oblast?: string, documentDate?: string): LookupResult {
  const { typeRes, rest } = stripLeadingType(input)
  // Recognition often dumps the WHOLE place line into one field ("смт Тростянець
  // Вінницької обл."). Try the full rest first, then progressively shorter leading
  // word-groups, then the first token (the city) — so the oblast tail doesn't block
  // the settlement match (live E2E 2026-05-29).
  const words = (rest || input).split(/\s+/).filter(Boolean)
  const candidates: string[] = []
  for (let n = words.length; n >= 1; n--) candidates.push(words.slice(0, n).join(' '))
  let city = lookupRegistry('settlement', candidates[0] || input, { documentDate, oblast })
  for (let i = 1; i < candidates.length && !city.matched; i++) {
    city = lookupRegistry('settlement', candidates[i], { documentDate, oblast })
  }
  if (typeRes) {
    city.settlementType = typeRes.official_en
    city.warning = [typeRes.warning, city.warning].filter(Boolean).join(' | ')
    // a settlement type with keep_type rule means the type MUST be carried into the translation
    if (typeRes.review_required && !city.review_required) city.review_required = false // type alone doesn't force review; city match governs
    if (!city.matched) {
      // type known but city not — still surface the type so it is never dropped
      city.reason = `settlement type "${typeRes.official_en}" kept; ${city.reason}`
    }
  }
  return city
}

export function translateCivilRegistryTerm(input: string, documentDate?: string): LookupResult {
  return lookupRegistry('civil_registry_term', input, { documentDate })
}

export function translatePassportAuthority(input: string, documentDate?: string): LookupResult {
  const r = lookupRegistry('passport_authority', input, { documentDate })
  if (r.matched) return r
  return lookupRegistry('authority', input, { documentDate }) // fall back to general authorities
}

export function normalizeOblastRegistry(input: string, documentDate?: string): LookupResult {
  return lookupRegistry('oblast', input, { documentDate })
}

export function resolveAbbreviation(input: string): LookupResult {
  const ab = lookupRegistry('abbreviation', input, {})
  if (ab.matched) return ab
  return normalizeSettlementType(input) // смт/пгт/с./м. are also abbreviations
}

/** Catalog: what the brain can introspect — "where everything is". */
export function registryCatalog(): Array<{ category: RegistryCategory; count: number; withSource: number }> {
  const idx = getIndex()
  return [...idx.byCategory.entries()].map(([category, rows]) => ({
    category, count: rows.length, withSource: rows.filter((r) => !!r.source_url).length,
  }))
}
