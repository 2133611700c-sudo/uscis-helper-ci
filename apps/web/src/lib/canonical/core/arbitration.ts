/**
 * canonical/core/arbitration.ts — the Core's judge (minimal authority policy, v1).
 *
 * Principle rules (knowable a priori, written now — see ONE_BRAIN_DECISION.md §5):
 *   1. valid MRZ controls passport MRZ fields.
 *   2. invalid MRZ → review (red flag), NOT silent fallback.
 *   3. a critical field with NO MRZ anchor → review (don't auto-trust an LLM on a
 *      critical legal field without a math anchor).
 *   4. a material conflict among candidates on a critical/high field → review.
 *   5. a fuzzy candidate → review.
 *   6. no candidate → no field (Law 1: no source → no recognized field).
 *
 * Empirical knobs (confidence thresholds, when-to-trust-Gemini-without-MRZ) come
 * LATER from the reader benchmark — not hard-coded by belief.
 *
 * Pure. Reuses lib/canonical/policy.ts (criticalityOf, materiallyDifferent,
 * sourceRank, buildConfidence).
 */
import type { CanonicalField, FieldEvidence } from '../types'
import { criticalityOf, materiallyDifferent, sourceRank, buildConfidence, REVIEW_THRESHOLD } from '../policy'
import type { FieldCandidate } from './types'
import { normalizeCanonicalValue } from './knowledgeNormalize'
import type { Sex } from '@uscis-helper/knowledge'

/**
 * Doc-level context for the knowledge layer (ADR-017 §D2). When the caller passes this
 * (gated on KNOWLEDGE_BRAIN_ENABLED), the deterministic dictionary is applied to each
 * arbitrated value. Undefined → arbitration is byte-identical to before (no knowledge).
 */
export interface KnowledgeArbitrationCtx {
  documentClass?: string | null
  /** old document → authority names are historical (Міліція, not Police). */
  isHistorical?: boolean
  /** the doc is a Ukrainian identity doc (enables Russian-spelling suspicion on names). default true. */
  ukrainianDoc?: boolean
}

/** Fields the passport MRZ controls when its check digits are valid. */
export const PASSPORT_MRZ_FIELDS: ReadonlySet<string> = new Set([
  'passport_number',
  'date_of_birth',
  'dob',
  'date_of_expiry',
  'passport_expiration_date',
  'sex',
  'family_name',
  'given_name',
  'nationality',
  'country_of_nationality',
])

function toEvidence(c: FieldCandidate): FieldEvidence {
  return { value: c.value, source: c.source, confidence: c.confidence, provider: c.provider }
}

/**
 * Resolve ONE field from its candidates per the minimal authority policy.
 * Returns null when there is no usable candidate (no source → no field).
 * Phase 2.0: carries rawCyrillic from the winning candidate into CanonicalField.
 */
export function arbitrateField(key: string, candidates: FieldCandidate[]): CanonicalField | null {
  const usable = candidates.filter((c) => (c.value ?? '').trim() !== '')
  if (usable.length === 0) return null

  const crit = criticalityOf(key)
  const evidence = usable.map(toEvidence)
  const reasons: string[] = []
  const mrz = usable.find((c) => c.source === 'mrz')

  // ── MRZ-controlled field with an MRZ candidate ────────────────────────────
  if (PASSPORT_MRZ_FIELDS.has(key) && mrz) {
    if (mrz.mrzCheckValid === true) {
      // valid MRZ = math authority → it wins; disagreement does not override it.
      // MRZ source has no Cyrillic (it is Latin by definition).
      return field(key, mrz.value, mrz.source, crit, false, [], evidence, mrz.confidence ?? 0.99, undefined)
    }
    // invalid MRZ = red flag (bad photo / OCR / tampering) → must be reviewed.
    reasons.push('mrz_check_failed')
    return field(key, mrz.value, mrz.source, crit, true, reasons, evidence, 0.3, undefined)
  }

  // ── No MRZ anchor: pick the highest-authority candidate ────────────────────
  const primary = [...usable].sort((a, b) => {
    const r = sourceRank(b.source) - sourceRank(a.source)
    if (r !== 0) return r
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })[0]

  // critical field with no math anchor → cannot be auto-trusted.
  if (crit === 'critical') reasons.push('critical_no_mrz_anchor')

  // material conflict on a critical/high field → review.
  const distinct = new Set(usable.map((c) => normalize(c.value)))
  if (distinct.size > 1 && (crit === 'critical' || crit === 'high')) reasons.push('provider_conflict')

  // fuzzy candidate → review.
  if (primary.fuzzy) reasons.push('fuzzy_match')

  // confidence-based review for critical/high.
  const conf = primary.confidence ?? 0
  if ((crit === 'critical' || crit === 'high') && conf < REVIEW_THRESHOLD && !reasons.includes('low_confidence')) {
    reasons.push('low_confidence')
  }

  // carry through reader-level review signals — if the reader already flagged
  // this candidate as needing review, the Core inherits that signal.
  if (primary.reviewRequired && primary.reviewReasons?.length) {
    for (const r of primary.reviewReasons) if (!reasons.includes(r)) reasons.push(r)
  } else if (primary.reviewRequired) {
    reasons.push('reader_review_required')
  }

  return field(key, primary.value, primary.source, crit, reasons.length > 0, reasons, evidence, conf, primary.rawCyrillic)
}

/**
 * Arbitrate every field key present in the candidate set.
 *
 * When `knowledge` is passed (caller gates on KNOWLEDGE_BRAIN_ENABLED), the deterministic D2
 * dictionary is applied as an AUTHORITY LAYER on each value (ADR-017 §D2): a safe transform is
 * accepted; a CONFLICT on a value is NEVER silently substituted — it surfaces `suggestedValue`
 * and forces review, the read value is kept. `knowledge` omitted ⇒ byte-identical to before.
 */
export function arbitrateDocument(
  candidates: FieldCandidate[],
  knowledge?: KnowledgeArbitrationCtx | null,
): CanonicalField[] {
  const byKey = new Map<string, FieldCandidate[]>()
  for (const c of candidates) {
    const arr = byKey.get(c.key)
    if (arr) arr.push(c)
    else byKey.set(c.key, [c])
  }
  // Doc-level context for D2 (sex + given name help patronymic / spelling checks).
  // SAFETY NET: the dictionary must NEVER crash recognition. Every step that can
  // throw is isolated so one bad field/rule degrades to the read value, and the
  // document always comes back. (normalizeCanonicalValue already fails-open to a
  // review action; these guards cover everything around it.)
  const sex = knowledge ? safeKnowledge(() => deriveSex(candidates), null, 'deriveSex') : null
  const givenNameCyrillic = knowledge
    ? safeKnowledge(() => deriveGivenNameCyrillic(candidates), null, 'deriveGivenNameCyrillic')
    : null
  const out: CanonicalField[] = []
  for (const [key, group] of byKey) {
    let f: CanonicalField | null = null
    try {
      f = arbitrateField(key, group)
    } catch (e) {
      logKnowledgeError('arbitrateField', key, e)
      continue // can't recover this field's arbitration — skip, never crash the doc
    }
    if (!f) continue
    if (!knowledge) { out.push(f); continue }
    try {
      out.push(applyKnowledge(f, knowledge, sex, givenNameCyrillic))
    } catch (e) {
      logKnowledgeError('applyKnowledge', key, e)
      out.push(f) // fail-open: keep the un-enriched read value, document survives
    }
  }
  return out
}

/** Run a knowledge step; on ANY throw, log (PII-free) and return the fallback. */
function safeKnowledge<T>(fn: () => T, fallback: T, where: string): T {
  try {
    return fn()
  } catch (e) {
    logKnowledgeError(where, '', e)
    return fallback
  }
}

/** PII-free error log: field KEY + message only, never the value. */
function logKnowledgeError(where: string, key: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e)
  // eslint-disable-next-line no-console
  console.warn(`[knowledge-safety] ${where}${key ? ` key=${key}` : ''} failed (fail-open): ${msg}`)
}

/**
 * Apply a D2 decision to one arbitrated field WITHOUT silent substitution.
 * Phase 2.0 (GAP A+B fix): D2 now receives rawCyrillic (original Cyrillic), not the
 * already-transliterated normalizedValue. This makes Cyrillic-dependent rules (gazetteer /
 * RU-vs-UA spelling / normalizeName) fire correctly. When rawCyrillic is absent (e.g. MRZ),
 * we fall back to normalizedValue which is Latin — D2 then uses the preserve path.
 * accept/preserve ⇒ take the deterministic value. suggest/review/block ⇒ keep the read value,
 * surface the dictionary's candidate as `suggestedValue`, and force review.
 */
function applyKnowledge(
  f: CanonicalField,
  ctx: KnowledgeArbitrationCtx,
  sex: Sex | null,
  givenNameCyrillic: string | null,
): CanonicalField {
  // Feed D2 the ORIGINAL Cyrillic (not the already-transliterated Latin).
  // This is the GAP A+B fix: D2 now runs its Cyrillic rules (gazetteer, RU/UA detection,
  // patronymic reconcile) on the actual source text, not on derived Latin.
  const inputForD2 = f.rawCyrillic ?? f.normalizedValue ?? f.rawValue ?? ''

  const d = normalizeCanonicalValue(f.key, inputForD2, {
    documentClass: ctx.documentClass ?? null,
    sourceDoc: ctx.documentClass ?? undefined,
    sex,
    givenNameCyrillic,
    isHistorical: ctx.isHistorical === true,
    ukrainianDoc: ctx.ukrainianDoc,
  })

  if (d.action === 'accept' || d.action === 'preserve') {
    // Safe deterministic transform — take it. Provenance kept for the audit log (Phase 4).
    return { ...f, normalizedValue: d.finalValue, knowledgeRule: d.ruleId, knowledgeProvenance: d.provenance }
  }

  // CONFLICT (suggest/review/block): never overwrite a critical value silently.
  const reasons = mergeReasons(f.reviewReasons, [...d.reasonCodes, `knowledge:${d.action}:${d.ruleId}`])
  return {
    ...f,
    // normalizedValue stays the READ value (no silent substitution)
    suggestedValue: d.candidateValue ?? f.suggestedValue ?? null,
    reviewRequired: true,
    reviewReasons: reasons,
    knowledgeRule: d.ruleId,
    knowledgeProvenance: d.provenance,
  }
}

function mergeReasons(existing: string[], add: string[]): string[] {
  const out = [...existing]
  for (const r of add) if (r && !out.includes(r)) out.push(r)
  return out
}

/** Best-effort subject sex from a 'sex' candidate (for patronymic reconstruction). */
function deriveSex(candidates: FieldCandidate[]): Sex | null {
  const c = candidates.find((x) => x.key === 'sex' || x.key.endsWith('_sex'))
  const v = (c?.value ?? '').trim().toLowerCase()
  if (!v) return null
  if (/^(m|male|ч|чол)/.test(v)) return 'M'
  if (/^(f|female|ж|жін|жои)/.test(v)) return 'F'
  return null
}

/** Best-effort given name in Cyrillic (for patronymic reconstruction). */
function deriveGivenNameCyrillic(candidates: FieldCandidate[]): string | null {
  const c = candidates.find((x) => (x.key === 'given_name' || x.key === 'child_given_name') && /[Ѐ-ӿ]/.test(x.value ?? ''))
  return c?.value ?? null
}

// ── helpers ────────────────────────────────────────────────────────────────
function normalize(s: string): string {
  return (s ?? '').normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase()
}

function field(
  key: string,
  value: string,
  source: CanonicalField['source'],
  criticality: CanonicalField['criticality'],
  reviewRequired: boolean,
  reviewReasons: string[],
  evidence: FieldEvidence[],
  finalConf: number,
  rawCyrillic: string | undefined,
): CanonicalField {
  return {
    key,
    rawValue: value,
    // v1: arbitration picks the value; KMU-55 normalization of a Cyrillic
    // candidate is a downstream step, not the arbiter's job.
    normalizedValue: value,
    // Phase 2.0 (GAP A fix): rawCyrillic is now carried from the winning candidate
    // so D2 and downstream consumers (C3, audit) see the original Cyrillic.
    rawCyrillic: rawCyrillic ?? null,
    criticality,
    confidence: buildConfidence({ ocr: finalConf, field_match: null, normalization: null, source_match: null }),
    source,
    reviewRequired,
    reviewReasons,
    evidence,
  }
}
