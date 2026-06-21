/**
 * canonical/shadow.ts — P2.3: ONE_BRAIN_SHADOW parity.
 *
 * The two-brain problem is proven or disproven by NUMBERS, not faith: run a
 * document through two readers, express both as CanonicalDocumentResult, and diff
 * them field-by-field. This module is the pure diff + the OFF-by-default flag.
 *
 * It NEVER changes any product output — shadow is observe-only. Wiring it into a
 * live route (to log parity on real traffic behind the flag) is a later, separate
 * step; here we ship the tested core.
 */
import type { CanonicalDocumentResult, CanonicalField, Criticality } from './types'
import { criticalityOf, materiallyDifferent } from './policy'

export type ParityStatus = 'agree' | 'disagree' | 'left_only' | 'right_only'

export interface FieldParity {
  key: string
  status: ParityStatus
  leftValue: string | null
  rightValue: string | null
  criticality: Criticality
}

export interface ParityReport {
  total: number
  agree: number
  disagree: number
  leftOnly: number
  rightOnly: number
  /** Disagreements on a critical OR high field — the ones that matter legally. */
  criticalDisagreements: number
  /** agree / (agree+disagree+leftOnly+rightOnly); 1.0 when there is nothing to compare. */
  parityRate: number
  fields: FieldParity[]
}

function valueOf(f: CanonicalField | undefined): string | null {
  if (!f) return null
  return f.normalizedValue ?? f.rawValue ?? null
}

/**
 * Diff two CanonicalDocumentResults field-by-field. `left` is conventionally the
 * incumbent (live) brain and `right` the candidate (canonical), but the diff is
 * symmetric. An optional canonicalizer treats transliteration-equivalent values
 * as equal (same comparator family as the no-silent-correction rule).
 */
export function diffCanonical(
  left: CanonicalDocumentResult,
  right: CanonicalDocumentResult,
  canonicalize?: (s: string) => string,
): ParityReport {
  const leftByKey = new Map(left.fields.map((f) => [f.key, f]))
  const rightByKey = new Map(right.fields.map((f) => [f.key, f]))
  const keys = Array.from(new Set([...leftByKey.keys(), ...rightByKey.keys()])).sort()

  const fields: FieldParity[] = []
  let agree = 0
  let disagree = 0
  let leftOnly = 0
  let rightOnly = 0
  let criticalDisagreements = 0

  for (const key of keys) {
    const l = leftByKey.get(key)
    const r = rightByKey.get(key)
    const lv = valueOf(l)
    const rv = valueOf(r)
    const crit = criticalityOf(key)
    let status: ParityStatus

    if (l && !r) {
      status = 'left_only'
      leftOnly++
    } else if (!l && r) {
      status = 'right_only'
      rightOnly++
    } else if (lv === null && rv === null) {
      status = 'agree'
      agree++
    } else if (lv === null || rv === null) {
      // present on both sides but one has no value → a real disagreement
      status = 'disagree'
      disagree++
      if (crit === 'critical' || crit === 'high') criticalDisagreements++
    } else if (materiallyDifferent(lv, rv, canonicalize)) {
      status = 'disagree'
      disagree++
      if (crit === 'critical' || crit === 'high') criticalDisagreements++
    } else {
      status = 'agree'
      agree++
    }

    fields.push({ key, status, leftValue: lv, rightValue: rv, criticality: crit })
  }

  const denom = agree + disagree + leftOnly + rightOnly
  const parityRate = denom === 0 ? 1 : agree / denom
  return { total: keys.length, agree, disagree, leftOnly, rightOnly, criticalDisagreements, parityRate, fields }
}

/**
 * ONE_BRAIN_SHADOW flag — default OFF. Gates shadow LOGGING only; it can never
 * change product output. Reads the env by default; injectable for tests.
 */
export function isShadowEnabled(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): boolean {
  const v = env.ONE_BRAIN_SHADOW
  return v === '1' || v === 'true'
}

/**
 * One-line, PII-free parity summary safe to log (counts + keys only, never values).
 */
export function summarizeParity(r: ParityReport): string {
  const criticalKeys = r.fields
    .filter((f) => f.status === 'disagree' && (f.criticality === 'critical' || f.criticality === 'high'))
    .map((f) => f.key)
    .join(',')
  return (
    `parity=${(r.parityRate * 100).toFixed(1)}% agree=${r.agree} disagree=${r.disagree} ` +
    `L_only=${r.leftOnly} R_only=${r.rightOnly} critical_disagree=${r.criticalDisagreements}` +
    (criticalKeys ? ` [${criticalKeys}]` : '')
  )
}
