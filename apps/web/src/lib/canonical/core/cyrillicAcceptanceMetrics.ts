/**
 * cyrillicAcceptanceMetrics — HONEST acceptance scoring for real Ukrainian documents.
 *
 * WHY THIS EXISTS: the legacy benchmark scorer's locked metric `critical_wrong_count`
 * counts ONLY a wrong, non-empty, non-review-flagged value. An EMPTY critical field
 * (`got === null`) can therefore never be a "failure" there — so a document that reads
 * 0/5 critical fields scores "0 fabricated". That is true-but-useless: it proves the
 * system did not INVENT, NOT that it READ. (See docs/audit/DOCUMENT_COVERAGE_REALITY.md.)
 *
 * This engine makes EMPTY a FIRST-CLASS axis, strictly separate from fabrication, and
 * computes the full acceptance metric set per the owner spec. It is PURE and PII-free
 * by construction: the aggregate output carries only counts/rates + opaque ids + doc
 * types — NEVER a field value. (Per-field detail is returned separately for a private,
 * gitignored report; it is never emitted to logs or git.)
 *
 * Reuses GroundTruth/ProducedField from benchmark.ts.
 */
import type { GroundTruth, ProducedField } from './benchmark'
import { criticalityOf } from '../policy'
import { transliterateKMU55, transliterateRussian, detectNameScript } from '@uscis-helper/knowledge'

/** A produced field, extended for acceptance: original Cyrillic + C3 finalValue. */
export interface AcceptanceProducedField extends ProducedField {
  /** The raw Cyrillic the reader preserved (for the transliteration check). */
  rawCyrillic?: string | null
  /** C3 final value: null = intentionally rejected; string = released; undefined = C3 off. */
  finalValue?: string | null
  /** A controlling Latin spelling (MRZ / I-94 / EAD) for this field, if any. */
  controllingLatin?: string | null
}

/** Per-field acceptance verdict (PRIVATE detail — never emitted to git/logs). */
export interface AcceptanceFieldVerdict {
  key: string
  critical: boolean
  /** EMPTY | FABRICATED | WRONG | EXACT | REVIEW (doubtful, parked) | NA */
  verdict: 'EXACT' | 'WRONG' | 'EMPTY' | 'FABRICATED' | 'REVIEW' | 'NA'
  cer: number | null // character error rate for this field (0..1), null if not comparable
  wrongTransliteration: boolean
  mrzConflict: boolean
  /** C3 released a NON-NULL value that is WRONG — the worst case. */
  falseFinal: boolean
}

/** PII-FREE aggregate metrics for ONE document. Safe to emit to git/logs. */
export interface DocumentAcceptanceMetrics {
  document_id: string // opaque id (no PII)
  doc_type: string
  critical_total: number
  coverage_rate: number // produced-with-value / truth fields (all)
  critical_field_exact_match: number // exact critical / critical_total (0..1)
  character_error_rate: number // mean CER over comparable critical fields (0..1)
  fabricated_critical_fields: number // emitted a WRONG/invented value, NOT review-flagged
  empty_critical_fields: number // truth has value, got empty — FIRST-CLASS, never "success"
  false_final_critical: number // C3 released a non-null WRONG critical value
  review_required_rate: number // critical fields flagged review / critical_total
  wrong_transliteration_rate: number // critical names whose Latin != KMU-55(raw)/controlling
  mrz_conflict_rate: number // critical fields conflicting with a controlling Latin/MRZ
}

/** The minimum-acceptance gate per the owner spec. */
export interface AcceptanceVerdict {
  production_ready: boolean
  reasons: string[]
}

const CRITICAL_NAME_KEYS = /name|surname|patronymic|given|spouse|father|mother|child|deceased/i

function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase()
}

/** Levenshtein distance (iterative, O(n·m)) for the character error rate. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let cur = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[n]
}

/** CER = edit distance / max(len). 0 = perfect, 1 = fully wrong. */
export function characterErrorRate(got: string, truth: string): number {
  const g = got.normalize('NFC'), t = truth.normalize('NFC')
  const denom = Math.max(g.length, t.length)
  return denom === 0 ? 0 : levenshtein(g, t) / denom
}

/** Is a produced Latin value a wrong transliteration of the raw Cyrillic? Compares
 *  against KMU-55 (Ukrainian) or BGN/PCGN (Russian) by detected script, and against
 *  any controlling Latin (MRZ/I-94/EAD) which OVERRIDES. Only meaningful for names. */
export function isWrongTransliteration(
  key: string, got: string | null, rawCyrillic: string | null | undefined, controllingLatin: string | null | undefined,
): boolean {
  if (!got || !got.trim()) return false // empty is not a "wrong transliteration" — it's EMPTY
  if (!CRITICAL_NAME_KEYS.test(key)) return false
  // A controlling spelling (MRZ/I-94/EAD) is authoritative: got must match it.
  if (controllingLatin && controllingLatin.trim()) {
    return norm(got) !== norm(controllingLatin)
  }
  if (!rawCyrillic || !rawCyrillic.trim()) return false // can't check without the source
  const script = detectNameScript(rawCyrillic)
  const expected = script === 'ru' ? transliterateRussian(rawCyrillic) : transliterateKMU55(rawCyrillic)
  return norm(got) !== norm(expected)
}

/**
 * Score one document's produced fields against ground truth — the HONEST way.
 * EMPTY, FABRICATED, WRONG, and EXACT are distinct verdicts; EMPTY is NEVER success.
 */
export function scoreDocumentAcceptance(
  produced: AcceptanceProducedField[], truth: GroundTruth,
): { metrics: DocumentAcceptanceMetrics; verdicts: AcceptanceFieldVerdict[] } {
  const got = new Map<string, AcceptanceProducedField>()
  for (const p of produced) got.set(p.key, p)

  const verdicts: AcceptanceFieldVerdict[] = []
  let producedWithValue = 0
  let criticalTotal = 0, criticalExact = 0, criticalEmpty = 0, criticalFabricated = 0
  let criticalReview = 0, wrongTranslit = 0, mrzConflict = 0, falseFinal = 0
  let cerSum = 0, cerCount = 0

  for (const [key, tf] of Object.entries(truth.fields)) {
    const isCritical = tf.critical ?? criticalityOf(key) === 'critical'
    const p = got.get(key)
    const gotVal = p && (p.value ?? '').trim() !== '' ? (p.value as string) : null
    const flagged = !!p?.reviewRequired
    const truthPresent = (tf.value ?? '').trim() !== ''
    if (gotVal !== null) producedWithValue++

    const exact = gotVal !== null && norm(gotVal) === norm(tf.value)
    const wrongTl = isWrongTransliteration(key, gotVal, p?.rawCyrillic, p?.controllingLatin)
    const mrzConf = !!(p?.controllingLatin && p.controllingLatin.trim() && gotVal && norm(gotVal) !== norm(p.controllingLatin))
    // C3 released a non-null value that is WRONG → the worst case (false final).
    const releasedWrong = p?.finalValue != null && typeof p.finalValue === 'string'
      && p.finalValue.trim() !== '' && norm(p.finalValue) !== norm(tf.value)

    let verdict: AcceptanceFieldVerdict['verdict']
    if (!truthPresent) {
      verdict = gotVal === null ? 'NA' : 'FABRICATED' // truth empty + we emitted = fabrication
    } else if (gotVal === null) {
      verdict = 'EMPTY' // truth has value, we read nothing — NEVER success
    } else if (exact) {
      verdict = 'EXACT'
    } else if (flagged) {
      verdict = 'REVIEW' // wrong but honestly parked for human review
    } else {
      verdict = 'WRONG' // wrong AND auto-released = fabrication-class failure
    }

    let cer: number | null = null
    if (truthPresent && gotVal !== null) {
      cer = characterErrorRate(gotVal, tf.value)
    }

    if (isCritical) {
      criticalTotal++
      if (verdict === 'EXACT') criticalExact++
      if (verdict === 'EMPTY') criticalEmpty++
      // FABRICATED = a wrong/invented value auto-released (not flagged): WRONG or FABRICATED verdicts.
      if (verdict === 'WRONG' || verdict === 'FABRICATED') criticalFabricated++
      if (flagged) criticalReview++
      if (wrongTl) wrongTranslit++
      if (mrzConf) mrzConflict++
      if (releasedWrong) falseFinal++
      if (cer !== null) { cerSum += cer; cerCount++ }
    }

    verdicts.push({ key, critical: isCritical, verdict, cer, wrongTransliteration: wrongTl, mrzConflict: mrzConf, falseFinal: releasedWrong })
  }

  const totalTruth = Object.keys(truth.fields).length || 1
  const metrics: DocumentAcceptanceMetrics = {
    document_id: truth.document_id,
    doc_type: truth.doc_type,
    critical_total: criticalTotal,
    coverage_rate: producedWithValue / totalTruth,
    critical_field_exact_match: criticalTotal === 0 ? 0 : criticalExact / criticalTotal,
    character_error_rate: cerCount === 0 ? 0 : cerSum / cerCount,
    fabricated_critical_fields: criticalFabricated,
    empty_critical_fields: criticalEmpty,
    false_final_critical: falseFinal,
    review_required_rate: criticalTotal === 0 ? 0 : criticalReview / criticalTotal,
    wrong_transliteration_rate: criticalTotal === 0 ? 0 : wrongTranslit / criticalTotal,
    mrz_conflict_rate: criticalTotal === 0 ? 0 : mrzConflict / criticalTotal,
  }
  return { metrics, verdicts }
}

/**
 * The minimum-acceptance gate (owner spec §6):
 *   fabricated_critical_fields = 0
 *   false_final_critical = 0
 *   critical_field_exact_match >= 0.95
 * empty_critical_fields is REPORTED separately (a high-empty doc is "not_ready" too —
 * it reads nothing — but it is NOT conflated with fabrication).
 */
export function acceptanceVerdict(
  m: DocumentAcceptanceMetrics, minExactMatch = 0.95,
): AcceptanceVerdict {
  const reasons: string[] = []
  if (m.fabricated_critical_fields > 0) reasons.push(`fabricated_critical_fields=${m.fabricated_critical_fields} (must be 0)`)
  if (m.false_final_critical > 0) reasons.push(`false_final_critical=${m.false_final_critical} (must be 0)`)
  if (m.critical_field_exact_match < minExactMatch) {
    reasons.push(`critical_field_exact_match=${(m.critical_field_exact_match * 100).toFixed(1)}% (< ${(minExactMatch * 100).toFixed(0)}%)`)
  }
  // An all-empty document is NOT production-ready (it doesn't read), even with 0 fabrication.
  if (m.critical_total > 0 && m.empty_critical_fields === m.critical_total) {
    reasons.push('all critical fields EMPTY (reads nothing)')
  }
  return { production_ready: reasons.length === 0, reasons }
}

/** Aggregate per-document metrics into a per-doc-TYPE roll-up (PII-free). */
export interface TypeAcceptanceRollup {
  doc_type: string
  documents: number
  critical_fields_total: number
  critical_exact_match: number // weighted across docs
  empty_critical_fields: number
  fabricated_critical_fields: number
  wrong_transliterations: number
  mrz_conflicts: number
  review_required: number
  production_ready: boolean
  not_ready_reasons: string[]
}

export function rollupByType(perDoc: DocumentAcceptanceMetrics[], minExactMatch = 0.95): TypeAcceptanceRollup[] {
  const byType = new Map<string, DocumentAcceptanceMetrics[]>()
  for (const m of perDoc) {
    const arr = byType.get(m.doc_type) ?? []
    arr.push(m)
    byType.set(m.doc_type, arr)
  }
  const out: TypeAcceptanceRollup[] = []
  for (const [doc_type, ms] of byType) {
    let critTotal = 0, exact = 0, empty = 0, fab = 0, wt = 0, mrz = 0, rev = 0
    for (const m of ms) {
      critTotal += m.critical_total
      exact += Math.round(m.critical_field_exact_match * m.critical_total)
      empty += m.empty_critical_fields
      fab += m.fabricated_critical_fields
      wt += Math.round(m.wrong_transliteration_rate * m.critical_total)
      mrz += Math.round(m.mrz_conflict_rate * m.critical_total)
      rev += Math.round(m.review_required_rate * m.critical_total)
    }
    const exactRate = critTotal === 0 ? 0 : exact / critTotal
    const reasons: string[] = []
    if (fab > 0) reasons.push(`fabricated=${fab}`)
    if (ms.some((m) => m.false_final_critical > 0)) reasons.push('false_final_critical>0')
    if (exactRate < minExactMatch) reasons.push(`critical_exact_match=${(exactRate * 100).toFixed(1)}% (<${(minExactMatch * 100).toFixed(0)}%)`)
    if (critTotal > 0 && empty === critTotal) reasons.push('all critical EMPTY')
    out.push({
      doc_type, documents: ms.length, critical_fields_total: critTotal,
      critical_exact_match: exactRate, empty_critical_fields: empty, fabricated_critical_fields: fab,
      wrong_transliterations: wt, mrz_conflicts: mrz, review_required: rev,
      production_ready: reasons.length === 0, not_ready_reasons: reasons,
    })
  }
  return out
}
