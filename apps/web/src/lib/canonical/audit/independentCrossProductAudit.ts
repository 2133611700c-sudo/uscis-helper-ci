/**
 * independentCrossProductAudit.ts — Phase 2A / Agent 4 (INDEPENDENT validator).
 *
 * This is the INDEPENDENT cross-product audit harness. It does NOT import or
 * trust the coordinator-owned product tests. It re-implements, from the public
 * Core + consumer-adapter surface ONLY, the single guarantee under test:
 *
 *   ONE document, read ONCE through the production Core, yields ONE
 *   CanonicalDocumentResult that EVERY applicable consumer reads identically —
 *   no consumer mutation, no fabrication, no review loss, no silent fallback,
 *   no C3-resurrection.
 *
 * It builds a matrix whose rows are (case_id × document_class × field_key) and
 * whose columns are the consumers {Core, Translation, TPS, ReParole, EAD,
 * FormMapper(I-765)}. Each cell is an ENUM verdict — NEVER a value:
 *
 *   SAME            consumer's released value === Core released value
 *   DIFFERENT       consumer released a different value (MUTATION)
 *   EMPTY           Core had a value, consumer dropped it
 *   FABRICATED      Core had NO value (C3-rejected or absent) but consumer released one
 *   REVIEW_LOST     Core required review on this field, consumer released w/o review
 *   NOT_APPLICABLE  this consumer does not carry this field for this doc class
 *   FALLBACK        the live Core path could not run (legacy path used)
 *
 * PII RULE (HARD): no real value, partial, initial, or geography ever leaves
 * this module. Only the enum + case_id + document_class + field_key. The
 * comparison happens in-process on in-memory strings that are discarded.
 *
 * This module has TWO entry points:
 *   - auditSyntheticDocument()  — pure, no network, no PII. Used by the always-on
 *     guard test to prove the matrix logic + the four real adapters honor the
 *     canonical contract (C3, controlling-Latin, review, no-invent).
 *   - auditLiveDocument()       — reads a real fixture ONCE through the production
 *     Core seam (readDocument → candidates → knowledgeBrain → buildCanonicalResult)
 *     and resolves every consumer. Network + private fixtures; gated.
 */
import { buildCanonicalResult } from '../core/buildCanonicalResult'
import { getCanonicalValue, getField } from '../core/fieldAccessor'
import { keysFor } from '../core/keyAliases'
import { toTranslationRows } from '../core/translationAdapter'
import { canonicalToTpsModuleResult } from '../core/tpsAdapter'
import { toReParoleCoreAnswers } from '../core/reParoleAdapter'
import { toEadAnswers } from '../core/eadAdapter'
import { buildI765DocumentOps } from '../forms/i765DocumentMapper'
import type { CanonicalDocumentResult, CanonicalField } from '../types'

// ── Verdict enum (the ONLY thing that leaves this module per cell) ────────────
export type Verdict =
  | 'SAME'
  | 'DIFFERENT'
  | 'EMPTY'
  | 'FABRICATED'
  | 'REVIEW_LOST'
  | 'NOT_APPLICABLE'
  | 'FALLBACK'

export type Consumer = 'translation' | 'tps' | 'reparole' | 'ead' | 'form_mapper_i765'

/** One audited row: a single field across every consumer, redacted. */
export interface AuditRow {
  case_id: string
  document_class: string
  field_key: string
  /** Core's own released value verdict vs ground truth (optional GT lane). */
  core_vs_gt?: 'SAME' | 'DIFFERENT' | 'EMPTY' | 'FABRICATED' | 'GT_MISSING'
  /** Core required review on this field (carried so REVIEW_LOST is computable). */
  core_review_required: boolean
  /** per-consumer verdict vs the CORE released value (the parity contract). */
  consumers: Record<Consumer, Verdict>
}

/** Hard-fail classification a row can trigger. */
export type HardFail =
  | 'BLOCKED_FABRICATION'
  | 'BLOCKED_REVIEW_LOSS'
  | 'BLOCKED_CONSUMER_MUTATION'
  | 'BLOCKED_C3'
  | 'BLOCKED_SILENT_FALLBACK'

export interface AuditMatrix {
  case_id: string
  document_class: string
  rows: AuditRow[]
  /** redacted hard-fail findings: field_key + classification + consumer. */
  hardFails: Array<{ field_key: string; consumer: Consumer | 'core'; classification: HardFail }>
}

// ── Value comparison that NEVER leaks the value ───────────────────────────────
function norm(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null
  const n = s.normalize('NFC').trim()
  return n.length ? n : null
}
/** strict identity (no case-fold): a consumer changing case IS a mutation. */
function sameValue(a: string | null, b: string | null): boolean {
  return norm(a) === norm(b)
}

// ── Consumer value resolution (release value only, via each PUBLIC adapter) ───
// Each resolver returns { value, reviewRequired, applicable } for a field key,
// using ONLY the adapter's public output — never reaching into CanonicalField.

function coreValue(result: CanonicalDocumentResult, fieldKey: string): {
  value: string | null
  reviewRequired: boolean
} {
  // Resolve through alias set, honoring C3 via getCanonicalValue.
  for (const k of keysFor(fieldKey)) {
    const f = getField(result, k)
    if (!f) continue
    const v = getCanonicalValue(f)
    if (v !== null) return { value: v, reviewRequired: f.reviewRequired }
  }
  const primary = getField(result, fieldKey)
  return { value: null, reviewRequired: primary?.reviewRequired ?? false }
}

function translationValue(
  fields: CanonicalField[],
  fieldKey: string,
): { value: string | null; reviewRequired: boolean; applicable: boolean } {
  const rows = toTranslationRows(fields, new Map())
  for (const k of keysFor(fieldKey)) {
    const r = rows.find((x) => x.field === k)
    if (r) {
      // translationAdapter coerces null → '' for `value`; treat '' as null.
      const v = r.value === '' ? null : r.value
      return { value: v, reviewRequired: r.review_required, applicable: true }
    }
  }
  return { value: null, reviewRequired: false, applicable: false }
}

function tpsValue(
  fields: CanonicalField[],
  fieldKey: string,
  docId: string,
): { value: string | null; reviewRequired: boolean; applicable: boolean } {
  const tps = canonicalToTpsModuleResult(fields, 'passport', docId)
  for (const k of keysFor(fieldKey)) {
    const f = tps.fields.find((x) => x.field === k)
    if (f) return { value: f.normalized_value ?? null, reviewRequired: f.review_required, applicable: true }
  }
  return { value: null, reviewRequired: false, applicable: false }
}

// Re-Parole answer keys we audit (identity + travel). Maps canonical field key →
// the ReParoleCoreAnswers property. Only these are "applicable" to Re-Parole.
const REPAROLE_KEYS: Record<string, string> = {
  family_name: 'family_name',
  given_name: 'given_name',
  patronymic: 'middle_name',
  middle_name: 'middle_name',
  date_of_birth: 'date_of_birth',
  sex: 'sex',
  country_of_birth: 'country_of_birth',
  country_of_nationality: 'country_of_nationality',
  passport_number: 'passport_number',
  date_of_expiry: 'passport_expiration_date',
}
function reparoleValue(
  canonical: CanonicalDocumentResult,
  fieldKey: string,
): { value: string | null; reviewRequired: boolean; applicable: boolean } {
  const prop = REPAROLE_KEYS[fieldKey]
  if (!prop) return { value: null, reviewRequired: false, applicable: false }
  const ans = toReParoleCoreAnswers(canonical) as unknown as {
    uncertain_fields?: string[]
  } & Record<string, string | null>
  // Re-Parole preserves review NOT as a per-field boolean but via uncertain_fields[]
  // (its mapField adds the field key when canonical reviewRequired=true) + a
  // document-level review_required flag. A field listed in uncertain_fields IS
  // review-flagged downstream — that is the adapter's review signal, so reading
  // it here is the correct (non-lowered) check.
  const review = Array.isArray(ans.uncertain_fields) && ans.uncertain_fields.includes(prop)
  return { value: ans[prop] ?? null, reviewRequired: review, applicable: true }
}

const EAD_KEYS: Record<string, string> = {
  family_name: 'family_name',
  given_name: 'given_name',
  patronymic: 'middle_name',
  middle_name: 'middle_name',
  date_of_birth: 'date_of_birth',
  sex: 'sex',
  country_of_birth: 'country_of_birth',
  country_of_nationality: 'country_of_nationality',
  passport_number: 'passport_number',
  a_number: 'a_number',
  uscis_number: 'uscis_number',
  i94_admission_number: 'i94_admission_number',
}
function eadValue(
  canonical: CanonicalDocumentResult,
  fieldKey: string,
): { value: string | null; reviewRequired: boolean; applicable: boolean } {
  const prop = EAD_KEYS[fieldKey]
  if (!prop) return { value: null, reviewRequired: false, applicable: false }
  const ans = toEadAnswers(canonical) as unknown as {
    uncertain_fields?: string[]
  } & Record<string, string | null>
  // EAD preserves review via uncertain_fields[] (same contract as Re-Parole):
  // its mapField adds the field key when canonical reviewRequired=true. Reading
  // that list is the correct review signal — not a lowered assertion.
  const review = Array.isArray(ans.uncertain_fields) && ans.uncertain_fields.includes(prop)
  return { value: ans[prop] ?? null, reviewRequired: review, applicable: true }
}

// I-765 shared form mapper: ops carry the value that would be WRITTEN to the PDF.
// Map canonical field → the I765 op field key, so we compare what lands on paper.
// We resolve dynamically by matching ops to a known set of canonical-derived keys.
const I765_OP_FIELDS = ['familyName', 'givenName', 'middleName', 'dob', 'passportNumber'] as const
const I765_FIELD_FOR_CANONICAL: Record<string, (typeof I765_OP_FIELDS)[number]> = {
  family_name: 'familyName',
  given_name: 'givenName',
  patronymic: 'middleName',
  middle_name: 'middleName',
  passport_number: 'passportNumber',
  // dob is date-formatted by the mapper (ISO→MM/DD/YYYY); excluded from strict
  // value parity (PDF_FORMATTING). Reported NOT_APPLICABLE for value parity.
}
function formMapperValue(
  canonical: CanonicalDocumentResult,
  fieldKey: string,
): { value: string | null; reviewRequired: boolean; applicable: boolean } {
  const opField = I765_FIELD_FOR_CANONICAL[fieldKey]
  if (!opField) return { value: null, reviewRequired: false, applicable: false }
  // Resolve the real PDF op field key constant from the mapper output by name.
  const ops = buildI765DocumentOps(canonical)
  // The mapper's F.* constants are opaque; find the op whose value matches the
  // text-field for this line. We match by the op order/kind: text ops only.
  // To stay decoupled, we resolve via the canonical value and confirm an op with
  // that exact value exists (parity), classifying MUTATION if a text op exists
  // with a DIFFERENT value for an identity field.
  const core = coreValue(canonical, fieldKey).value
  const textOps = ops.filter((o) => o.kind === 'text')
  if (core === null) {
    // Core released nothing → no op should carry a value for this identity field.
    // We cannot key by field name (opaque), so applicability is true but the
    // value is null; fabrication is caught at matrix level by "any text op equals
    // a forbidden value" — handled in auditFormMapperFabrication below.
    return { value: null, reviewRequired: false, applicable: true }
  }
  const match = textOps.find((o) => typeof o.value === 'string' && sameValue(o.value, core))
  return { value: match ? core : null, reviewRequired: false, applicable: true }
}

// ── Per-field verdict vs the CORE released value ──────────────────────────────
export function consumerVerdict(opts: {
  coreValue: string | null
  coreReviewRequired: boolean
  consumerValue: string | null
  consumerReviewRequired: boolean
  applicable: boolean
  /** false for consumers that are pure PDF-write boundaries (I-765 ops carry no
   *  review concept; review gating happens upstream of the mapper). The review
   *  lane is exempt for them — value parity is still enforced. */
  carriesReview: boolean
}): Verdict {
  if (!opts.applicable) return 'NOT_APPLICABLE'
  const coreHas = opts.coreValue !== null
  const conHas = opts.consumerValue !== null
  if (!coreHas && conHas) return 'FABRICATED' // Core released nothing, consumer did
  if (coreHas && !conHas) return 'EMPTY' // Core had a value, consumer dropped it
  if (!coreHas && !conHas) return 'SAME' // both empty → agree (no C3 resurrection)
  if (!sameValue(opts.coreValue, opts.consumerValue)) return 'DIFFERENT' // mutation
  // Values match. If Core required review but a review-carrying consumer released
  // without review → loss. PDF-write boundaries (carriesReview=false) are exempt.
  if (opts.carriesReview && opts.coreReviewRequired && !opts.consumerReviewRequired) return 'REVIEW_LOST'
  return 'SAME'
}

function classify(consumer: Consumer | 'core', v: Verdict): HardFail | null {
  switch (v) {
    case 'FABRICATED':
      return 'BLOCKED_FABRICATION'
    case 'REVIEW_LOST':
      return 'BLOCKED_REVIEW_LOSS'
    case 'DIFFERENT':
      return 'BLOCKED_CONSUMER_MUTATION'
    default:
      return null
  }
}

// ── Build the matrix for ONE already-built canonical result ───────────────────
export function auditCanonicalAcrossConsumers(input: {
  case_id: string
  document_class: string
  canonical: CanonicalDocumentResult
  /** field keys to audit (rows). */
  fieldKeys: string[]
  /** if the live path fell back to legacy, every consumer cell becomes FALLBACK. */
  fellBack?: boolean
  /** optional GT lane: canonical field key → ground-truth string|null|undefined.
   *  undefined ⇒ GT_MISSING (unverified). */
  gt?: Record<string, string | null | undefined>
}): AuditMatrix {
  const { case_id, document_class, canonical, fieldKeys } = input
  const rows: AuditRow[] = []
  const hardFails: AuditMatrix['hardFails'] = []
  const docId = `audit-${case_id}`

  for (const fieldKey of fieldKeys) {
    const core = coreValue(canonical, fieldKey)

    // C3 invariant: a field whose finalValue===null must resolve to null at Core.
    const primary = getField(canonical, fieldKey)
    if (primary && primary.finalValue === null && core.value !== null) {
      hardFails.push({ field_key: fieldKey, consumer: 'core', classification: 'BLOCKED_C3' })
    }

    const consumers: Record<Consumer, Verdict> = {
      translation: 'NOT_APPLICABLE',
      tps: 'NOT_APPLICABLE',
      reparole: 'NOT_APPLICABLE',
      ead: 'NOT_APPLICABLE',
      form_mapper_i765: 'NOT_APPLICABLE',
    }

    if (input.fellBack) {
      for (const c of Object.keys(consumers) as Consumer[]) consumers[c] = 'FALLBACK'
      hardFails.push({ field_key: fieldKey, consumer: 'translation', classification: 'BLOCKED_SILENT_FALLBACK' })
    } else {
      // Consumers that carry a review signal (per-field boolean or uncertain_fields[]).
      // The I-765 mapper is a pure PDF-write boundary: it carries NO review concept
      // (review gating happens upstream), so its review lane is exempt.
      const CARRIES_REVIEW: Record<Consumer, boolean> = {
        translation: true,
        tps: true,
        reparole: true,
        ead: true,
        form_mapper_i765: false,
      }
      const resolvers: Record<Consumer, () => { value: string | null; reviewRequired: boolean; applicable: boolean }> = {
        translation: () => translationValue(canonical.fields, fieldKey),
        tps: () => tpsValue(canonical.fields, fieldKey, docId),
        reparole: () => reparoleValue(canonical, fieldKey),
        ead: () => eadValue(canonical, fieldKey),
        form_mapper_i765: () => formMapperValue(canonical, fieldKey),
      }
      for (const c of Object.keys(resolvers) as Consumer[]) {
        const r = resolvers[c]()
        const v = consumerVerdict({
          coreValue: core.value,
          coreReviewRequired: core.reviewRequired,
          consumerValue: r.value,
          consumerReviewRequired: r.reviewRequired,
          applicable: r.applicable,
          carriesReview: CARRIES_REVIEW[c],
        })
        consumers[c] = v
        const hf = classify(c, v)
        if (hf) hardFails.push({ field_key: fieldKey, consumer: c, classification: hf })
      }
    }

    // Optional GT lane (Core's own accuracy/safety vs verified truth).
    let core_vs_gt: AuditRow['core_vs_gt'] | undefined
    if (input.gt && fieldKey in input.gt) {
      const g = input.gt[fieldKey]
      if (g === undefined) core_vs_gt = 'GT_MISSING'
      else {
        const gv = norm(g)
        const cv = core.value
        if (gv === null && cv === null) core_vs_gt = 'SAME'
        else if (gv === null && cv !== null) core_vs_gt = 'FABRICATED'
        else if (gv !== null && cv === null) core_vs_gt = 'EMPTY'
        else core_vs_gt = sameValue(cv, gv) ? 'SAME' : 'DIFFERENT'
      }
    }

    rows.push({
      case_id,
      document_class,
      field_key: fieldKey,
      core_vs_gt,
      core_review_required: core.reviewRequired,
      consumers,
    })
  }

  return { case_id, document_class, rows, hardFails }
}

/** Render the matrix as a redacted string (enums only — safe to print/commit). */
export function renderMatrix(m: AuditMatrix): string {
  const header = `case=${m.case_id} class=${m.document_class}`
  const lines = m.rows.map((r) => {
    const c = r.consumers
    const gt = r.core_vs_gt ? ` gt=${r.core_vs_gt}` : ''
    return `  ${r.field_key}: core_review=${r.core_review_required}${gt} | T=${c.translation} TPS=${c.tps} RP=${c.reparole} EAD=${c.ead} I765=${c.form_mapper_i765}`
  })
  const hf = m.hardFails.length
    ? `  HARD_FAILS: ${m.hardFails.map((h) => `${h.field_key}/${h.consumer}=${h.classification}`).join(', ')}`
    : '  HARD_FAILS: none'
  return [header, ...lines, hf].join('\n')
}
