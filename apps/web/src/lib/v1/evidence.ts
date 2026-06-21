/**
 * evidence — V1_COMPLETION phase evidence artifacts.
 *
 * A phase may only be marked PASS with a verdict artifact written to
 * artifacts/v1/<phase>/verdict.json. The verdict is PII-FREE: gate results,
 * counts, cost — never document values or recipient data.
 */

export type GateResult = 'PASS' | 'FAIL' | 'SKIP'

export type V1Verdict = {
  phase: string
  commit: string
  timestamp: string
  environment: 'local' | 'ci' | 'staging' | 'production-readonly'
  gates: Record<string, GateResult>
  testCounts: { passed: number; failed: number; skipped: number }
  estimatedCostUsd: number
  actualCostUsd: number
}

export type VerdictInput = Omit<V1Verdict, 'gates'> & { gates: Record<string, GateResult> }

export function buildVerdict(input: VerdictInput): V1Verdict {
  return {
    phase: input.phase,
    commit: input.commit,
    timestamp: input.timestamp,
    environment: input.environment,
    gates: { ...input.gates },
    testCounts: { ...input.testCounts },
    estimatedCostUsd: input.estimatedCostUsd,
    actualCostUsd: input.actualCostUsd,
  }
}

/** True only if every recorded gate is PASS (SKIP/FAIL block a phase PASS). */
export function allGatesPass(v: V1Verdict): boolean {
  const vals = Object.values(v.gates)
  return vals.length > 0 && vals.every((g) => g === 'PASS')
}

/** PII patterns that must never appear in a committed verdict. */
const PII_PATTERNS: RegExp[] = [
  /\bA\d{8,9}\b/, // A-number
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /[Ѐ-ӿ]{2,}/, // Cyrillic run (document values)
]

/** Defense-in-depth: verify a verdict carries no obvious PII before it is committed. */
export function isPiiFree(v: V1Verdict): boolean {
  const serialized = JSON.stringify(v)
  return !PII_PATTERNS.some((re) => re.test(serialized))
}
