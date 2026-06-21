/**
 * canonical/contradictions.ts — Cross-Document Contradiction Detector
 * (ENGINEERING_MASTER_PLAN.md §5 "Quality, safety, robustness").
 *
 * The same field read from DIFFERENT documents (passport vs I-94 vs EAD vs DL) can
 * disagree — e.g. a DOB that differs between the passport MRZ and the EAD card.
 * Unlike the adapter merge (which picks a provisional highest-authority winner),
 * this REPORTS the conflict for a human: a contradiction on a critical/high field
 * is BLOCKING and must be resolved by review, never silently reconciled.
 *
 * Pure function — no I/O.
 */
import type { CanonicalField, Criticality, SourceKind } from './types'
import { criticalityOf, sourceRank } from './policy'

export interface ContradictionCandidate {
  value: string
  source: SourceKind
  provider: string
}

export interface Contradiction {
  key: string
  criticality: Criticality
  /** Distinct values seen across documents, highest-authority source first. */
  candidates: ContradictionCandidate[]
  /** True for critical/high fields — must be resolved by review. */
  blocking: boolean
}

function norm(s: string, canonicalize?: (s: string) => string): string {
  return (canonicalize ? canonicalize(s) : s).normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase()
}

/**
 * Find cross-document contradictions: per field key, the distinct candidate values
 * across all evidence. A key with ≥2 materially-different values is a contradiction;
 * critical/high keys are blocking. Candidates are ordered by source authority.
 */
export function findCrossDocumentContradictions(
  fields: CanonicalField[],
  canonicalize?: (s: string) => string,
): Contradiction[] {
  const byKey = new Map<string, CanonicalField[]>()
  for (const f of fields) {
    const arr = byKey.get(f.key)
    if (arr) arr.push(f)
    else byKey.set(f.key, [f])
  }

  const out: Contradiction[] = []
  for (const [key, group] of byKey) {
    // Collect one representative per distinct normalized value.
    const seen = new Map<string, ContradictionCandidate>()
    for (const f of group) {
      const evidence = f.evidence.length
        ? f.evidence
        : [{ value: f.normalizedValue ?? f.rawValue ?? '', source: f.source, confidence: null, provider: 'field' }]
      for (const e of evidence) {
        if (!e.value) continue
        const n = norm(e.value, canonicalize)
        if (!seen.has(n)) seen.set(n, { value: e.value, source: e.source, provider: e.provider })
      }
    }
    if (seen.size <= 1) continue // agreement, or a single value
    const criticality = criticalityOf(key)
    const candidates = [...seen.values()].sort((a, b) => sourceRank(b.source) - sourceRank(a.source))
    out.push({
      key,
      criticality,
      candidates,
      blocking: criticality === 'critical' || criticality === 'high',
    })
  }
  return out
}

/** Convenience: does this set of fields contain any BLOCKING contradiction? */
export function hasBlockingContradiction(
  fields: CanonicalField[],
  canonicalize?: (s: string) => string,
): boolean {
  return findCrossDocumentContradictions(fields, canonicalize).some((c) => c.blocking)
}
