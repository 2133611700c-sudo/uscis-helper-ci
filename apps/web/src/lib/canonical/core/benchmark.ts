/**
 * canonical/core/benchmark.ts — reader & Core benchmark scorer (v1).
 *
 * Scores a produced field set (a raw reader's candidates OR the Core's output)
 * against hand-verified ground truth. The LOCKED metric is
 * `critical_wrong_count` — a critical field auto-filled (NOT review-flagged) with
 * a value that does not match truth. That number must be 0. Coverage is secondary.
 *
 * Pure. No real documents needed to run the scorer; real documents + ground truth
 * are needed to PRODUCE meaningful inputs.
 */
import { criticalityOf } from '../policy'

export interface GroundTruthField {
  value: string
  /** Override; defaults to criticalityOf(key) === 'critical'. */
  critical?: boolean
}
export interface GroundTruth {
  document_id: string
  doc_type: string
  fields: Record<string, GroundTruthField>
}

/** A produced field to score. `reviewRequired` defaults to false (raw readers). */
export interface ProducedField {
  key: string
  value: string | null
  reviewRequired?: boolean
}

export interface ScoredField {
  key: string
  critical: boolean
  truth: string
  got: string | null
  correct: boolean
  reviewFlagged: boolean
  /** critical + wrong + NOT review-flagged = a real failure. */
  autoWrong: boolean
}

export interface BenchmarkScore {
  total: number
  coverage: number // produced-with-value / truth-fields
  correct: number
  critical_total: number
  critical_correct: number
  critical_missing: number
  /** THE metric: critical fields auto-filled wrong (not flagged). Must be 0. */
  critical_wrong_count: number
  review_rate: number // produced fields flagged for review / produced fields
  fields: ScoredField[]
}

function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase()
}

export function scoreAgainstTruth(produced: ProducedField[], truth: GroundTruth): BenchmarkScore {
  const got = new Map<string, ProducedField>()
  for (const p of produced) got.set(p.key, p)

  const fields: ScoredField[] = []
  let correct = 0
  let producedWithValue = 0
  let reviewFlagged = 0
  let critical_total = 0
  let critical_correct = 0
  let critical_missing = 0
  let critical_wrong_count = 0

  for (const [key, tf] of Object.entries(truth.fields)) {
    const isCritical = tf.critical ?? criticalityOf(key) === 'critical'
    const p = got.get(key)
    const gotVal = p && (p.value ?? '').trim() !== '' ? (p.value as string) : null
    const isCorrect = gotVal !== null && norm(gotVal) === norm(tf.value)
    const flagged = !!p?.reviewRequired

    if (gotVal !== null) producedWithValue++
    if (flagged) reviewFlagged++
    if (isCorrect) correct++
    if (isCritical) {
      critical_total++
      if (isCorrect) critical_correct++
      else if (gotVal === null) critical_missing++
      // wrong value, auto-filled (not flagged) = the failure the metric forbids
      const autoWrong = !isCorrect && gotVal !== null && !flagged
      if (autoWrong) critical_wrong_count++
    }
    fields.push({
      key,
      critical: isCritical,
      truth: tf.value,
      got: gotVal,
      correct: isCorrect,
      reviewFlagged: flagged,
      autoWrong: isCritical && !isCorrect && gotVal !== null && !flagged,
    })
  }

  const total = Object.keys(truth.fields).length
  const producedTotal = produced.length || 1
  return {
    total,
    coverage: total === 0 ? 1 : producedWithValue / total,
    correct,
    critical_total,
    critical_correct,
    critical_missing,
    critical_wrong_count,
    review_rate: reviewFlagged / producedTotal,
    fields,
  }
}

/** Minimal shape validation for a hand-entered ground-truth JSON. */
export function parseGroundTruth(json: unknown): GroundTruth {
  const g = json as Partial<GroundTruth>
  if (!g || typeof g.document_id !== 'string' || typeof g.doc_type !== 'string' || typeof g.fields !== 'object' || g.fields === null) {
    throw new Error('invalid ground truth: need { document_id, doc_type, fields:{key:{value}} }')
  }
  for (const [k, v] of Object.entries(g.fields)) {
    if (!v || typeof (v as GroundTruthField).value !== 'string') {
      throw new Error(`invalid ground truth field "${k}": need { value: string }`)
    }
  }
  return g as GroundTruth
}
