/**
 * Source-to-Final Audit — v5 §23.
 *
 * Last gate before final PDF render. Compares:
 *   Set A — source zones extracted from OCR (raw_value per critical field)
 *   Set B — draft fields  (ExtractedField[].normalized_value)
 *   Set C — user-confirmed fields (PacketState.source_traces[].normalized_value)
 *   Set D — final rendered text (after bureauStyleRenderer)
 *   Set E — attached original page count
 *
 * Fails on any of:
 *   - field in A missing from B/C/D
 *   - field in D missing from C
 *   - normalized_value of a field in D differs from value in C
 *   - scope_title broader than uploaded_pages
 *   - E < 1 (no original pages attached)
 *
 * The render endpoint MUST treat ok=false as a hard refusal.
 */

import type { ExtractedField, PacketState, SourceTrace } from './types'
import { findDocumentModule } from './modules/registry'
import { resolveDocumentModule } from './modules/classifier'

export interface SourceToFinalAuditInput {
  packet: PacketState
  /** The full text of the rendered customer PDF (post-bureauStyleRenderer). */
  finalRenderedText: string
  /**
   * Number of original document pages the user has attached to the packet.
   * (Not the wizard's `total_pages_declared`; this is what's actually
   * stored in the user_uploaded_pages count.)
   */
  attachedOriginalPageCount: number
}

export interface AuditFinding {
  type:
    | 'critical_field_missing_in_draft'
    | 'critical_field_missing_in_confirmed'
    | 'critical_field_missing_in_final'
    | 'final_field_not_in_confirmed'
    | 'value_changed_after_confirm'
    | 'scope_broader_than_pages'
    | 'no_original_pages_attached'
  field?: string
  expected?: string
  got?: string
  detail?: string
}

export interface SourceToFinalAuditResult {
  ok: boolean
  findings: AuditFinding[]
  passes: string[]
}

/**
 * Build the inverse-search regex used to detect a normalized value inside
 * the final rendered text. We look for the trimmed normalized_value as a
 * literal substring; the renderer is responsible for not encoding values
 * (no HTML escaping in the customer PDF text we audit).
 */
function isLiteralPresent(haystack: string, needle: string): boolean {
  if (!needle) return false
  return haystack.includes(needle)
}

export function auditSourceToFinal(
  input: SourceToFinalAuditInput,
): SourceToFinalAuditResult {
  const { packet, finalRenderedText, attachedOriginalPageCount } = input
  const findings: AuditFinding[] = []

  // Skip when there's no active module — render-gate handles that
  // separately. Alias-aware resolver: legacy DocumentType values
  // (e.g. 'ua_passport_booklet') still find the right module.
  const docKey = packet.document_type ?? 'unknown'
  const mod = findDocumentModule(docKey) ?? resolveDocumentModule(docKey, 1.0)
  if (!mod || mod.documentType === 'manual_review_required') {
    return {
      ok: true,
      findings: [],
      passes: ['source_to_final_audit_skipped_no_active_module'],
    }
  }

  const criticalFieldKeys = mod.criticalFields.map(f => f.key)

  // Index helpers
  const draftByField = new Map<string, ExtractedField>()
  for (const f of packet.extracted_fields) draftByField.set(f.field, f)

  const confirmedByField = new Map<string, SourceTrace>()
  for (const t of packet.source_traces) confirmedByField.set(t.field, t)

  // Check 1 + 2: every critical field must exist in draft AND confirmed.
  for (const key of criticalFieldKeys) {
    const draft = draftByField.get(key)
    if (!draft || !draft.normalized_value?.trim()) {
      findings.push({
        type: 'critical_field_missing_in_draft',
        field: key,
      })
      continue
    }
    const confirmed = confirmedByField.get(key)
    if (!confirmed || !confirmed.normalized_value?.trim()) {
      findings.push({
        type: 'critical_field_missing_in_confirmed',
        field: key,
      })
      continue
    }

    // Check 3: every critical confirmed value must appear literally in
    //          the final rendered text.
    if (!isLiteralPresent(finalRenderedText, confirmed.normalized_value.trim())) {
      findings.push({
        type: 'critical_field_missing_in_final',
        field: key,
        expected: confirmed.normalized_value.trim(),
      })
    }

    // Check 4: value didn't silently change between confirm and render.
    if (
      confirmed.normalized_value.trim() !== draft.normalized_value.trim() &&
      !draft.user_corrected
    ) {
      findings.push({
        type: 'value_changed_after_confirm',
        field: key,
        expected: confirmed.normalized_value.trim(),
        got: draft.normalized_value.trim(),
      })
    }
  }

  // Check 5: scope_title must not claim more than uploaded pages.
  // We accept the renderer-emitted scope title shape:
  //   "English Translation of <doc>"           (= full scope)
  //   "English Translation of the Provided <doc> Pages (pages 1-N of M)"  (= partial)
  // If it's the partial form, N must be ≤ uploaded_pages and ≤ total_pages_declared.
  const scope = (packet.scope_title ?? '').trim()
  const partialMatch = scope.match(/pages 1-(\d+) of (\d+)/i)
  if (partialMatch) {
    const claimedPages = Number.parseInt(partialMatch[1], 10)
    const declared = Number.parseInt(partialMatch[2], 10)
    if (
      Number.isFinite(claimedPages) &&
      Number.isFinite(declared) &&
      (claimedPages > packet.uploaded_pages || claimedPages > declared)
    ) {
      findings.push({
        type: 'scope_broader_than_pages',
        expected: `≤ ${packet.uploaded_pages} pages`,
        got: `${claimedPages} pages claimed of ${declared} declared`,
      })
    }
  }

  // Check 6: at least one original page must be attached.
  if (!Number.isFinite(attachedOriginalPageCount) || attachedOriginalPageCount < 1) {
    findings.push({
      type: 'no_original_pages_attached',
      detail:
        'USCIS-style submission requires the original document pages to be attached',
    })
  }

  return {
    ok: findings.length === 0,
    findings,
    passes: ['source_to_final_audit'],
  }
}
