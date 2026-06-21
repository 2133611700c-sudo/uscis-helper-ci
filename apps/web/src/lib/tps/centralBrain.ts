/**
 * centralBrain — Server-side coordinator for TPS document merge.
 *
 * Replaces the client-side useMemo merge in TPSWizardV2 with a proper
 * server-side pipeline that:
 *   1. Applies slot contracts (documentContracts.applyContract)
 *   2. Runs hallucination guard on each extracted value
 *   3. Applies unified normalization (dictionaryBridge)
 *   4. Resolves cross-document priority (fieldArbiter via sourcePriority)
 *   5. Cross-validates identity fields across documents
 *   6. Returns a structured MergedPacket with full audit trail
 *
 * INPUT:  Record<SlotId, TpsExtractedField[]>  +  Record<string, string> (manual)
 * OUTPUT: CentralBrainResult with mergedPacket, conflicts, warnings, readiness
 *
 * ADDITIVE: existing wizard merge continues to work. This is a replacement
 * path exposed via /api/tps/brain/merge for wizard v3+.
 */

import { applyContract, DOCUMENT_CONTRACTS } from '@/lib/tps/ocr/documentContracts'
import type { SlotId } from '@/lib/tps/ocr/documentContracts'
import type { TpsExtractedField } from '@/lib/tps/types'
import {
  resolveField,
  FIELD_CLASS,
  type ExtractedCandidate,
} from '@/lib/tps/fieldArbiter'
import {
  toExtractedCandidate,
  hasControllingLatinSpelling,
  type SlottedField,
} from '@/lib/tps/sourcePriority'
import { guardField, crossValidateField } from '@/lib/tps/hallucinationGuard'
import { normalize } from '@/lib/tps/dictionaryBridge'
import { requiredFieldKeys } from '@/lib/tps/readinessPolicy'

// ── Output types ──────────────────────────────────────────────────────────────

export interface MergedField {
  field: string
  value: string
  /** Original OCR text before normalization — used by translation mode to recover settlement type prefixes (смт → "urban-type settlement") */
  raw_value?: string
  source_slot: SlotId | 'manual'
  source_type: string
  confidence: number
  controlling_spelling_applied: boolean
  cross_validated: boolean
  plausibility_passed: boolean
  hallucination_risk: 'none' | 'low' | 'high'
  normalization_source: string
  conflicts: ConflictEntry[]
}

export interface ConflictEntry {
  field: string
  winning_value: string
  losing_value: string
  winning_slot: string
  losing_slot: string
  reason: string
}

export interface RejectedField {
  field: string
  slot: SlotId
  raw_value: string
  reason: string
}

export interface ReadinessGate {
  ready: boolean
  missing_required: string[]
  hallucination_blocks: string[]
  contract_violations: Array<{ field: string; slot: SlotId; reason: string }>
}

export interface CentralBrainResult {
  merged: Record<string, MergedField>
  conflicts: ConflictEntry[]
  warnings: string[]
  rejected: RejectedField[]
  readiness: ReadinessGate
}

// Required fields for document-merge readiness. Single source of truth lives in
// readinessPolicy (stage 'merge') — no local literal, so this can never drift
// from mailReadyGate / isMinimallyComplete again.
const REQUIRED_FOR_GENERATE: ReadonlySet<string> = new Set(requiredFieldKeys('merge'))

// ── Main entry point ──────────────────────────────────────────────────────────

export interface CentralBrainInput {
  /** Per-slot extracted fields from OCR/Brain modules. */
  uploads: Partial<Record<SlotId, TpsExtractedField[]>>
  /** Manually entered field values (user typed or user_corrected). */
  manual: Record<string, string>
}

export function mergeToCentralBrain(input: CentralBrainInput): CentralBrainResult {
  const { uploads, manual } = input
  const warnings: string[] = []
  const rejected: RejectedField[] = []
  const conflicts: ConflictEntry[] = []
  const contractViolations: ReadinessGate['contract_violations'] = []

  // Step 1: collect SlottedFields per logical field key, applying contracts
  const byField: Record<string, SlottedField[]> = {}

  for (const [rawSlot, fields] of Object.entries(uploads)) {
    const slot = rawSlot as SlotId
    if (!fields || fields.length === 0) continue
    const contract = DOCUMENT_CONTRACTS[slot]
    if (!contract) {
      warnings.push(`No contract for slot "${slot}" — skipping`)
      continue
    }

    for (const f of fields) {
      const value = f.normalized_value ?? f.raw_value
      if (!value) continue

      // Contract check
      const contractResult = applyContract(slot, [f.field], null)
      if (contractResult.rejected_fields.length > 0) {
        const reason = contractResult.rejected_fields[0].reason
        rejected.push({ field: f.field, slot, raw_value: f.raw_value, reason })
        contractViolations.push({ field: f.field, slot, reason })
        continue
      }

      // Hallucination guard
      const slottedField: SlottedField = {
        field: f.field,
        value,
        raw_value: f.raw_value,
        slot,
        extraction_source: f.extraction_source,
        confidence: f.confidence ?? 0.8,
      }
      const guard = guardField(slottedField)
      if (guard.should_block) {
        rejected.push({ field: f.field, slot, raw_value: f.raw_value, reason: guard.reasons.join('; ') })
        warnings.push(`[hallucinationGuard] blocked ${f.field} from ${slot}: ${guard.reasons.join('; ')}`)
        continue
      }
      if (guard.risk !== 'none') {
        warnings.push(`[hallucinationGuard] ${guard.risk} risk on ${f.field} from ${slot}: ${guard.reasons.join('; ')}`)
      }

      // Normalize
      const norm = normalize(f.field, value)
      const normalizedValue = norm.value ?? value

      const sf: SlottedField = { ...slottedField, value: normalizedValue }
      if (!byField[f.field]) byField[f.field] = []
      byField[f.field].push(sf)
    }
  }

  // Step 2: add manual fields (lowest priority, always override via user_corrected)
  for (const [field, rawValue] of Object.entries(manual)) {
    if (!rawValue) continue
    const sf: SlottedField = {
      field,
      value: rawValue,
      slot: 'photo' as SlotId, // sentinel — manual has no real slot
      extraction_source: 'user_input',
      confidence: 1.0,
    }
    if (!byField[field]) byField[field] = []
    byField[field].push(sf)
  }

  // Step 3: cross-validate identity fields + resolve priority
  const merged: Record<string, MergedField> = {}

  for (const [field, candidates] of Object.entries(byField)) {
    if (candidates.length === 0) continue

    // Cross-document validation for STRONG_IDENTITY fields
    const cls = FIELD_CLASS[field]
    let crossValidated = false
    if (cls === 'STRONG_IDENTITY' && candidates.length > 1) {
      const crossResult = crossValidateField(field, candidates)
      if (crossResult.risk === 'high') {
        for (const reason of crossResult.reasons) {
          conflicts.push({
            field,
            winning_value: candidates[0].value,
            losing_value: candidates[1]?.value ?? '',
            winning_slot: candidates[0].slot,
            losing_slot: candidates[1]?.slot ?? 'unknown',
            reason,
          })
        }
        warnings.push(`[crossValidate] ${field}: ${crossResult.reasons.join('; ')}`)
      }
      crossValidated = !crossResult.should_block
    } else {
      crossValidated = true
    }

    // Controlling spelling check
    const csResult = hasControllingLatinSpelling(candidates)
    const controllingApplied = csResult.applies

    // Resolve via fieldArbiter
    const arbCandidates: ExtractedCandidate[] = candidates.map(toExtractedCandidate)
    const resolved = resolveField(field, arbCandidates)

    // resolved.chosenValue / chosenSourceDoc / chosenSourceType
    const chosenValue = resolved.chosenValue ?? ''
    const winningCandidate = candidates.find(
      (c) => c.value === chosenValue,
    ) ?? candidates[0]

    // Plausibility
    const plausCheck = guardField(winningCandidate)
    const plausibilityPassed = plausCheck.risk !== 'high'

    merged[field] = {
      field,
      value: chosenValue,
      raw_value: winningCandidate.raw_value,
      source_slot: winningCandidate.slot,
      source_type: resolved.chosenSourceType ?? winningCandidate.extraction_source,
      confidence: winningCandidate.confidence,
      controlling_spelling_applied: controllingApplied,
      cross_validated: crossValidated,
      plausibility_passed: plausibilityPassed,
      hallucination_risk: plausCheck.risk,
      normalization_source: 'centralBrain',
      conflicts: conflicts.filter((c) => c.field === field),
    }
  }

  // Step 4: compute readiness gate
  const missingRequired: string[] = []
  for (const req of REQUIRED_FOR_GENERATE) {
    if (!merged[req]?.value) missingRequired.push(req)
  }
  const hallucinationBlocks = Object.values(merged)
    .filter((m) => m.hallucination_risk === 'high')
    .map((m) => m.field)

  const readiness: ReadinessGate = {
    ready: missingRequired.length === 0 && hallucinationBlocks.length === 0,
    missing_required: missingRequired,
    hallucination_blocks: hallucinationBlocks,
    contract_violations: contractViolations,
  }

  return { merged, conflicts, warnings, rejected, readiness }
}
