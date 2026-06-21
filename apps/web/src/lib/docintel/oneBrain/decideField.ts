/**
 * docintel/oneBrain/decideField — OneBrain field-decision SCAFFOLD (L2).
 *
 * ┌─ PARKED 2026-06-04 ──────────────────────────────────────────────────────┐
 * │ Deliberately NOT progressed (see docs/adr/ADR-016-hard-case-human-review │
 * │ -and-onebrain-park.md). Reasons:                                          │
 * │  • 0 live callers; the working safety architecture is already            │
 * │    reader → arbitrate → anti-fabrication/self-consistency gate (review).  │
 * │    decideField solves a problem we do not have yet.                       │
 * │  • Its numeric thresholds are PLACEHOLDERS and cannot be calibrated: GT   │
 * │    today is ~1 person / a few docs (BLOCKED_INSUFFICIENT_N).              │
 * │ Revisit gate: resume only when GT spans ≥ ~50 fields across DIFFERENT     │
 * │ people. Until then keep inert — do NOT wire it, do NOT trust the numbers. │
 * │ Kept (not deleted) as a design reference only.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Pure, deterministic per-field decision center. Contract:
 * docs/architecture/ONEBRAIN_DECIDE_FIELD_CONTRACT.md.
 *
 * SCAFFOLD STATUS: this module is NOT wired into any live path yet. Nothing in
 * production calls it, so prod behavior is byte-identical regardless of the flag.
 * The flag `ONEBRAIN_DECIDE_FIELD_ENABLED` (default OFF) is reserved for L2-wiring
 * (a later, separate step). decideField changes no runtime behavior on its own.
 *
 * Thresholds here are PLACEHOLDERS — numeric calibration is deferred to L3 (needs
 * the owner GT batch + GT-language intent). L2 fixes the SHAPE and the rules, not
 * the numbers. No dictionary ever overwrites `value` (rule 1). No model/HTR/consensus
 * change. consensus.ts is untouched.
 */

import crypto from 'node:crypto'

export type Criticality = 'critical' | 'high' | 'low'
export type Decision = 'accept' | 'accept_low_confidence' | 'force_review' | 'reject'

export interface ReaderRead {
  reader: string
  model?: string
  run?: number
  raw: string | null
  iso_date?: string | null
  confidence: number
  can_read: boolean
}
export interface DictionarySignal {
  kind: string
  matched?: boolean
  normalized_value?: string | null
  suggested_value?: string | null
  review_required?: boolean
  reason?: string
}
export interface ValidationSignal {
  rule: string
  status: 'valid' | 'invalid' | 'na'
  detail?: string
}
export interface SelfConsistency {
  status: 'agree' | 'mismatch' | 'incomplete' | 'insufficient_identity_fields' | 'not_run'
  instability?: boolean
  identity_hash_prefix?: string
  runs?: number
}
export interface StrongAnchor {
  kind: 'mrz' | 'i94' | 'ead' | 'i797' | 'none'
  present: boolean
  value?: string | null
  valid?: boolean
}
export interface EvalContext {
  gt_present?: boolean
  owner_verified_field?: boolean
  verified_scope?: string[]
  candidate_not_verified?: boolean
}
export interface FieldDecisionInput {
  field_id: string
  criticality: Criticality
  reads: ReaderRead[]
  quality?: { assessment?: string; blur_score?: number; rotated_applied?: boolean; low_quality_scan?: boolean }
  dictionary_signals?: DictionarySignal[]
  validation_signals?: ValidationSignal[]
  self_consistency?: SelfConsistency
  strong_anchor?: StrongAnchor
  eval_context?: EvalContext
}
export interface FieldDecision {
  field_id: string
  value: string | null
  normalized_value: string | null
  confidence: number
  decision: Decision
  review_required: boolean
  review_reasons: string[]
  source_trace: Array<Record<string, unknown>>
  dictionary_signals: DictionarySignal[]
  validation_signals: ValidationSignal[]
  safety_flags: string[]
  audit_hash: string
}

// PLACEHOLDER thresholds — calibrate in L3 against owner GT.
const ACCEPT_THRESHOLD: Record<Criticality, number> = { critical: 0.97, high: 0.9, low: 0.8 }
const INSTABILITY_STATUSES = new Set(['mismatch', 'incomplete', 'insufficient_identity_fields'])

/** Accuracy scoring helper (rule 4): a field is penalized ONLY if owner-verified and not candidate. */
export function scoredForAccuracy(ev?: EvalContext): boolean {
  if (!ev) return false
  if (ev.candidate_not_verified) return false
  return ev.owner_verified_field === true
}

export function decideField(input: FieldDecisionInput): FieldDecision {
  const reasons: string[] = []
  const safety: string[] = []
  const trace: Array<Record<string, unknown>> = []
  const dicts = input.dictionary_signals ?? []
  const vals = input.validation_signals ?? []
  const sc = input.self_consistency
  const anchor = input.strong_anchor

  // ── value selection (rule 1: dictionaries NEVER provide value) ──
  let value: string | null = null
  let confidence = 0
  let anchored = false
  if (anchor?.present && anchor.valid && anchor.value) {
    value = anchor.value; confidence = 0.99; anchored = true
    trace.push({ anchor: anchor.kind, used_for: 'value' })
  } else {
    const readable = input.reads.filter((r) => r.can_read && (r.raw || r.iso_date))
    const best = readable.sort((a, b) => b.confidence - a.confidence)[0]
    if (best) {
      value = best.iso_date || best.raw || null
      confidence = Math.max(0, Math.min(1, best.confidence))
      trace.push({ reader: best.reader, model: best.model, run: best.run, used_for: 'value' })
    }
  }

  // normalized_value comes ONLY from a dictionary signal — separate from value, never replaces it.
  const kmu = dicts.find((d) => d.kind === 'kmu55' && d.normalized_value)
  const normalized_value = kmu?.normalized_value ?? null
  if (normalized_value) trace.push({ layer: 'kmu55', used_for: 'normalized_value' })

  // ── no trustworthy source → reject ──
  if (value === null) {
    return finalize(input, { value: null, normalized_value: null, confidence: 0,
      decision: 'reject', reasons: ['no_source'], safety, trace, dicts, vals })
  }

  // ── gather review signals ──
  const dictReview = dicts.filter((d) => d.review_required === true)
  for (const d of dictReview) reasons.push(`dictionary_review:${d.kind}`)
  const invalid = vals.filter((v) => v.status === 'invalid')
  for (const v of invalid) reasons.push(`validation_invalid:${v.rule}`)
  if (sc && INSTABILITY_STATUSES.has(sc.status)) {
    safety.push('hard_case_model_instability')
    reasons.push(`self_consistency_${sc.status === 'mismatch' ? 'identity_mismatch' : sc.status}`)
  }
  const lowConf = confidence < ACCEPT_THRESHOLD[input.criticality]
  const hasReviewSignal = dictReview.length > 0 || invalid.length > 0 || (sc ? INSTABILITY_STATUSES.has(sc.status) : false)

  // ── decision ──
  let decision: Decision
  if (anchored) {
    decision = 'accept' // strong anchor controls this field (rule 6)
  } else if (input.criticality === 'critical') {
    // rules 2 & 3: critical never accepts under any review signal and never goes low-confidence w/o anchor
    if (hasReviewSignal || lowConf) { decision = 'force_review'; if (lowConf && !reasons.length) reasons.push('critical_low_confidence') ; if (!reasons.length) reasons.push('critical_no_strong_anchor') }
    else decision = 'accept'
  } else {
    if (hasReviewSignal) decision = 'force_review'
    else if (lowConf) { decision = 'accept_low_confidence'; reasons.push('below_auto_final_threshold') }
    else decision = 'accept'
  }

  return finalize(input, { value, normalized_value, confidence, decision, reasons, safety, trace, dicts, vals })
}

function finalize(
  input: FieldDecisionInput,
  p: { value: string | null; normalized_value: string | null; confidence: number; decision: Decision;
       reasons: string[]; safety: string[]; trace: Array<Record<string, unknown>>;
       dicts: DictionarySignal[]; vals: ValidationSignal[] },
): FieldDecision {
  const review_required = p.decision !== 'accept'
  // audit hash chains identity of the decision — value included for integrity, never logged publicly.
  const audit_hash = crypto.createHash('sha256')
    .update([input.field_id, p.value ?? '', p.normalized_value ?? '', p.decision, p.reasons.join(','), JSON.stringify(p.trace)].join('|'))
    .digest('hex')
  return {
    field_id: input.field_id,
    value: p.value,
    normalized_value: p.normalized_value,
    confidence: p.confidence,
    decision: p.decision,
    review_required,
    review_reasons: Array.from(new Set(p.reasons)),
    source_trace: p.trace,
    dictionary_signals: p.dicts,
    validation_signals: p.vals,
    safety_flags: Array.from(new Set(p.safety)),
    audit_hash,
  }
}
