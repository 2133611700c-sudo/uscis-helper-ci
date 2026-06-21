/**
 * canonical/core/knowledgeNormalize.ts — D2 knowledge as an AUTHORITY LAYER (ADR-017 §D2).
 *
 * The dictionary is NOT an auto-replace of the reader's value. It returns a DECISION with
 * provenance + a rule id + an action, and it NEVER silently substitutes a critical value on a
 * conflict — a conflict surfaces a `candidateValue` for human review, the read value is kept.
 *
 * Action contract:
 *   - accept   : deterministic, safe transform of the read (KMU-55 of clean Cyrillic, oblast
 *                genitive→nominative, known authority, gazetteer EXACT, date parse). finalValue set.
 *   - preserve : Latin / controlling spelling (MRZ) — keep as-is, only case cleanup. finalValue set.
 *   - suggest  : the dictionary has a DIFFERENT value than the read but cannot prove it (gazetteer
 *                fuzzy, generated patronymic). finalValue=null; candidateValue offered; review.
 *   - review   : cannot validate / suspicious (Russian spelling on a UA doc, patronymic fragment,
 *                unknown authority, unparsed date). finalValue=null; review. (candidate optional)
 *   - block    : nothing usable. finalValue=null.
 *
 * Pure: no I/O, no env, no flags. The arbiter (gated on KNOWLEDGE_BRAIN_ENABLED) decides what to do
 * with the decision; OFF ⇒ this is never called ⇒ byte-identical.
 */
import {
  transliterateKMU55,
  convertDateToUSCIS,
  formatLatinName,
  reconcilePatronymic,
  isValidPatronymic,
  snapCity,
  settlementDesignatorEn,
  normalizeName,
  normalizePlace,
  normalizeAuthority,
  normalizeSex,
  type OutputMode,
  type Sex,
  type NormalizedField,
  type NormalizationContext,
} from '@uscis-helper/knowledge'
import { stripCountryCode } from '@/lib/docintel/transliterationPolicy'

export type KnowledgeAction = 'accept' | 'preserve' | 'suggest' | 'review' | 'block'

export interface KnowledgeDecision {
  action: KnowledgeAction
  /** Value safe to use as the FINAL value (accept/preserve only). null ⇒ do not finalize from D2. */
  finalValue: string | null
  /** The dictionary's proposal when it must NOT silently replace the read (suggest/review). */
  candidateValue: string | null
  /** Machine-readable rule that fired (provenance + audit). */
  ruleId: string
  reasonCodes: string[]
  /** Where the decision came from (kmu55 / gazetteer_exact / mrz_preserved / authority_dict / ...). */
  provenance: string
  /** Deterministic confidence in the transform, 0..1. */
  evidenceStrength: number
}

export interface KnowledgeNormalizeCtx {
  documentClass?: string | null
  sourceDoc?: string
  sex?: Sex | null
  givenNameCyrillic?: string | null
  isHistorical?: boolean
  mode?: OutputMode
  /** the document is a Ukrainian identity doc (enables Russian-spelling suspicion on names). */
  ukrainianDoc?: boolean
  /**
   * Phase 2.0 (bug-B fix): The SOURCE that produced the Latin value — distinguishes
   * controlling Latin (mrz/ead/i94 = preserve as-is) from derived KMU-55 Latin (re-process).
   * When absent and the value is Latin, we use `preserve` only for true authority sources.
   */
  sourceBasis?: 'mrz_latin' | 'ead_latin' | 'i94_latin' | 'reader_latin' | 'raw_cyrillic' | 'unknown'
}

/**
 * The knowledge dictionary (D2 authority: oblast genitive→nominative, ЗАГС/РАЦС
 * agency terms, Міліція era-gating, смт, historical names, patronymic, KMU-55)
 * is ON BY DEFAULT (owner-activated 2026-06-12). It is SAFE to default-on: a
 * dictionary CONFLICT never silently rewrites — it keeps the read value, surfaces
 * a suggestedValue, and forces review (arbitration.ts applyKnowledge). Only
 * deterministic safe transforms are accepted outright. Set KNOWLEDGE_BRAIN_ENABLED=0
 * to disable without a code change (rollback).
 */
export function isKnowledgeBrainEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.KNOWLEDGE_BRAIN_ENABLED !== '0'
}

const CYRILLIC = /[Ѐ-ӿ]/
/** Letters that exist in Russian but NOT in Ukrainian orthography. */
const RUSSIAN_ONLY_LETTERS = /[ыэёъ]/i
/**
 * High-frequency Russian spellings of given names whose Ukrainian form differs but which share all
 * letters (no orthographic signal). Conservative seed — expand with ground-truth, do NOT treat as
 * exhaustive. Presence ⇒ SUSPECT (review), never an auto-rewrite.
 */
const RU_SPELLED_GIVEN = new Set([
  'сергей', 'андрей', 'алексей', 'николай', 'дмитрий', 'евгений', 'геннадий', 'юрий', 'валерий',
  'анатолий', 'григорий', 'михаил', 'наталья', 'татьяна', 'екатерина', 'елена', 'софья', 'мария',
])

function looksRussianSpelled(value: string): boolean {
  if (RUSSIAN_ONLY_LETTERS.test(value)) return true
  return RU_SPELLED_GIVEN.has(value.trim().toLowerCase())
}

function k(key: string): string {
  return (key || '').toLowerCase()
}

const accept = (finalValue: string, ruleId: string, provenance: string, evidence = 0.9): KnowledgeDecision =>
  ({ action: 'accept', finalValue, candidateValue: null, ruleId, reasonCodes: [], provenance, evidenceStrength: evidence })
const preserve = (finalValue: string, ruleId: string): KnowledgeDecision =>
  ({ action: 'preserve', finalValue, candidateValue: null, ruleId, reasonCodes: [], provenance: 'controlling_latin', evidenceStrength: 0.95 })
const suggest = (candidate: string | null, ruleId: string, provenance: string, reasons: string[]): KnowledgeDecision =>
  ({ action: 'suggest', finalValue: null, candidateValue: candidate, ruleId, reasonCodes: reasons, provenance, evidenceStrength: 0.4 })
const review = (candidate: string | null, ruleId: string, provenance: string, reasons: string[]): KnowledgeDecision =>
  ({ action: 'review', finalValue: null, candidateValue: candidate, ruleId, reasonCodes: reasons, provenance, evidenceStrength: 0.2 })

/** Map a knowledge NormalizedField → a decision: clean ⇒ accept, review_required ⇒ suggest. */
function fromField(nf: NormalizedField, ruleId: string, provenance: string): KnowledgeDecision {
  if (nf.review_required) {
    return suggest(nf.normalized_value, ruleId, provenance, [nf.review_reason ?? 'knowledge_uncertain'])
  }
  return accept(nf.normalized_value, ruleId, provenance)
}

/**
 * Decide what D2 says about ONE arbitrated field value. Pure; never throws; never returns a silent
 * critical substitution (conflict ⇒ suggest/review with a candidate, not a final).
 */
export function normalizeCanonicalValue(
  key: string,
  rawValue: string,
  ctx: KnowledgeNormalizeCtx = {},
): KnowledgeDecision {
  const raw = (rawValue ?? '').trim()
  if (raw === '') return { action: 'block', finalValue: null, candidateValue: null, ruleId: 'empty', reasonCodes: ['empty_value'], provenance: 'none', evidenceStrength: 0 }

  const key_ = k(key)
  const cyr = CYRILLIC.test(raw)
  const sourceDoc = ctx.sourceDoc ?? ctx.documentClass ?? 'document'
  const nctx: NormalizationContext = { mode: ctx.mode ?? 'uscis_normalized', is_historical_document: ctx.isHistorical === true }

  try {
    // ── Patronymic (по батькові) — never "Middle Name"; reject OCR fragments ──
    if (key_.includes('patronymic')) {
      if (ctx.sex === 'M' || ctx.sex === 'F') {
        const r = reconcilePatronymic(raw, ctx.givenNameCyrillic ?? null, ctx.sex)
        if (r.source === 'read_valid') return accept(transliterateKMU55(r.value), 'patronymic.read_valid', 'patronymic_reconcile', 0.85)
        if (r.value) return suggest(transliterateKMU55(r.value), `patronymic.${r.source}`, 'patronymic_reconcile', [r.reason])
        return review(null, 'patronymic.unresolved', 'patronymic_reconcile', [r.reason || 'patronymic_unresolved'])
      }
      // No sex context: validate the read; a fragment → review, never silent.
      if (isValidPatronymic(raw)) return accept(transliterateKMU55(raw), 'patronymic.read_valid', 'patronymic_reconcile', 0.7)
      return review(cyr ? transliterateKMU55(raw) : raw, 'patronymic.fragment', 'patronymic_reconcile', ['patronymic_fragment_or_unverified'])
    }

    // ── Person name (surname / given) ─────────────────────────────────────────
    if (key_.includes('surname') || key_.includes('family_name') || key_.includes('given_name')) {
      if (!cyr) {
        // Phase 2.0 bug-B fix: Latin input is only treated as CONTROLLING when it
        // comes from an authoritative source (MRZ/EAD/I-94). Derived KMU-55 Latin
        // is NOT controlling — it may contain transliteration errors. We distinguish
        // by sourceBasis: explicit authority sources → preserve; unknown/reader → preserve
        // with a lower evidence score so a conflict would trigger review.
        const isControllingSource = ctx.sourceBasis === 'mrz_latin' || ctx.sourceBasis === 'ead_latin' || ctx.sourceBasis === 'i94_latin'
        const evidence = isControllingSource ? 0.99 : 0.6  // reader-derived Latin is less authoritative
        const result = preserve(formatLatinName(raw), 'name.latin_preserve')
        return { ...result, evidenceStrength: evidence }
      }
      // Russian spelling on a Ukrainian document = a misread, not a fact to transliterate silently.
      if (ctx.ukrainianDoc !== false && looksRussianSpelled(raw)) {
        return review(transliterateKMU55(raw), 'name.russian_spelling_on_ua', 'spelling_guard', ['russian_spelling_suspected'])
      }
      const fieldType = (key_.includes('surname') || key_.includes('family_name')) ? 'surname' : 'given_name'
      return fromField(normalizeName(raw, fieldType, sourceDoc, nctx), `name.${fieldType}`, 'kmu55_name')
    }

    // ── Full-name composite (father/mother/spouse) ────────────────────────────
    if (key_.includes('full_name')) {
      if (!cyr) {
        const isControllingSource = ctx.sourceBasis === 'mrz_latin' || ctx.sourceBasis === 'ead_latin' || ctx.sourceBasis === 'i94_latin'
        const evidence = isControllingSource ? 0.99 : 0.6
        const result = preserve(formatLatinName(raw), 'fullname.latin_preserve')
        return { ...result, evidenceStrength: evidence }
      }
      if (ctx.ukrainianDoc !== false && looksRussianSpelled(raw)) {
        return review(formatLatinName(transliterateKMU55(raw)), 'fullname.russian_spelling_on_ua', 'spelling_guard', ['russian_spelling_suspected'])
      }
      return accept(formatLatinName(transliterateKMU55(raw)), 'fullname.transliterate', 'kmu55_name', 0.75)
    }

    // ── Place (city / oblast / province / place_of_birth / settlement) ────────
    if (/place|city|province|oblast|settlement|region/.test(key_)) {
      // COUNTRY-CODE STRIP (Agent 1, real intl-passport): the passport place-of-birth
      // cell carries the issuing-country code ("ВІННИЦЬКА ОБЛ./UKR"). The reader's
      // toCanonicalValue('place_city') strips it, but D2 here gazetteers/normalizes
      // the ORIGINAL raw Cyrillic — which still has "/UKR" — and neither snapCity nor
      // normalizePlace removes a country token, so it leaked into the released place.
      // Strip it first (any separator, suffix OR prefix; embedded substrings safe).
      const placeRaw = stripCountryCode(raw)
      // City fields: gazetteer on the RAW Cyrillic. EXACT ⇒ accept; FUZZY ⇒ suggest (never overwrite).
      if ((key_.includes('city') || key_.endsWith('place_of_birth')) && cyr) {
        const snap = snapCity(placeRaw)
        if (snap.matched) {
          // HARD RULE («смт» = "urban-type settlement", NEVER city/town): snapCity
          // strips the settlement designator and returns the bare gazetteer city, so
          // re-attach it from the RAW value. Without this, «смт Вишневе» released as
          // "Vyshneve" — a silent designator drop (GOLDEN vector V1).
          const designator = settlementDesignatorEn(placeRaw)
          const city = transliterateKMU55(snap.value)
          return accept(designator ? `${designator} ${city}` : city, 'place.gazetteer_exact', 'gazetteer_exact', 0.9)
        }
        // A FUZZY near-match (possible misread of a known place) → review. But a
        // GENUINELY-UNKNOWN town (reason 'unknown_geography') is NOT a misread —
        // our seed gazetteer is ~500 of 28k+ settlements; forcing review on every
        // village not in the seed blocked the pay button on legitimate small-town
        // birthplaces. Fall through to normalizePlace (transliterate + dict, accept).
        if (snap.review_required && snap.reason !== 'unknown_geography')
          return suggest(snap.value ? transliterateKMU55(snap.value) : null, 'place.gazetteer_fuzzy', 'gazetteer_fuzzy', ['place_fuzzy_unconfirmed'])
      }
      return fromField(normalizePlace(placeRaw, key, sourceDoc, nctx), 'place.normalize', 'place_dict')
    }

    // ── Issuing authority (Міліція → Militsiya; unknown → do not invent) ───────
    // NOTE: exclude date keys — 'date_of_issue'/'issue_date' contain 'issu' but are
    // DATES, not authorities. Without the !date guard a valid issue DATE was misrouted
    // to authority.unknown → false review instead of accept (GOLDEN vector V2).
    if (key_.includes('authority') || (key_.includes('issu') && !key_.includes('date'))) {
      const a = normalizeAuthority(raw, sourceDoc, nctx)
      if (!a.review_required && a.rule_applied && a.rule_applied !== 'no_match' && a.rule_applied !== 'passthrough') {
        return accept(a.normalized_value, `authority.${a.rule_applied}`, 'authority_dict')
      }
      // Unknown authority: do NOT invent a final; offer the transliteration as a candidate, review.
      return review(cyr ? transliterateKMU55(raw) : raw, 'authority.unknown', 'authority_dict', ['authority_unverified'])
    }

    // ── Sex ───────────────────────────────────────────────────────────────────
    if (key_ === 'sex' || key_.includes('gender')) {
      const s = normalizeSex(raw, sourceDoc)
      return s.review_required ? review(s.normalized_value, 'sex.uncertain', 'sex_dict', [s.review_reason ?? 'sex_uncertain']) : accept(s.normalized_value, 'sex.normalize', 'sex_dict')
    }

    // ── Dates (DOB / issue / expiry) → USCIS MM/DD/YYYY ───────────────────────
    if (key_.includes('dob') || key_.includes('date')) {
      // Phase 2.0 bug-A fix: toCanonicalValue emits ISO YYYY-MM-DD; normalizedValue
      // arriving here may already be ISO. convertDateToUSCIS only handles DD.MM.YYYY
      // and Ukrainian month-name formats, so ISO → false review. Accept these first.
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        // Already USCIS MM/DD/YYYY — accept as-is.
        return accept(raw, 'date.already_uscis', 'date_pass', 0.95)
      }
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoMatch) {
        // ISO YYYY-MM-DD → USCIS MM/DD/YYYY (deterministic, no false review).
        return accept(`${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`, 'date.iso_to_uscis', 'date_parse', 0.9)
      }
      const conv = convertDateToUSCIS(raw)
      if (conv) return accept(conv, 'date.uscis', 'date_parse', 0.9)
      return review(null, 'date.unparsed', 'date_parse', ['date_unparsed'])
    }

    // ── Default: transliterate Cyrillic (safe representation), preserve Latin ──
    if (cyr) return accept(transliterateKMU55(raw), 'default.kmu55', 'kmu55_default', 0.8)
    return preserve(raw, 'default.passthrough')
  } catch {
    // Knowledge must never break recognition — keep the read, force review.
    return review(null, 'error.preserved', 'error', ['knowledge_normalize_error'])
  }
}
