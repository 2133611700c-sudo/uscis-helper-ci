/**
 * sourcePriority — Controlling-spelling resolver for Central Brain.
 *
 * Wraps the existing fieldArbiter priority tables and exposes a clean API
 * for Central Brain to convert per-slot extraction results into ranked
 * ExtractedCandidates that fieldArbiter.resolveField() can process.
 *
 * Source hierarchy (matches CENTRAL_BRAIN_SPEC + fieldArbiter IDENTITY_PRIORITY):
 *   DL Latin > I-94 > EAD > Passport MRZ > Booklet crossref > AI Brain > Manual
 *
 * This file does NOT duplicate priority tables — it imports from fieldArbiter
 * and adds the slot→sourceDoc+sourceType mapping layer.
 */

import type { SlotId } from '@/lib/tps/ocr/documentContracts'
import type { TpsExtractionSource } from '@/lib/tps/types'
import { type ExtractedCandidate, type SourceDoc, type SourceType } from '@/lib/tps/fieldArbiter'

/** Maps a slot id to the `sourceDoc` key used by fieldArbiter priority tables. */
export function slotToSourceDoc(slot: SlotId): SourceDoc {
  switch (slot) {
    case 'passport': return 'passport'
    case 'booklet': return 'booklet'
    case 'i94': return 'i94'
    case 'ead':
    case 'ead_old':
    case 'i797_or_ead': return 'ead'
    case 'tps_notice':
    case 'i797': return 'i797'
    case 'dl': return 'dl'
    default: return 'manual'
  }
}

/** Maps a TpsExtractionSource to the `sourceType` key used by fieldArbiter. */
export function extractionSourceToType(src: TpsExtractionSource): SourceType {
  switch (src) {
    case 'ocr_mrz': return 'ocr_mrz'
    case 'ocr_visual':
    case 'ocr_keyword': return 'ocr_keyword'
    case 'dual_ocr_crossref': return 'dual_ocr_crossref'
    case 'ai_brain': return 'ai_brain'
    case 'user_corrected': return 'user_corrected'
    case 'user_input':
    case 'inferred':
    default: return 'manual'
  }
}

export interface SlottedField {
  field: string
  value: string
  raw_value?: string
  slot: SlotId
  extraction_source: TpsExtractionSource
  confidence: number
}

/**
 * Convert a SlottedField to an ExtractedCandidate suitable for fieldArbiter.resolveField().
 */
export function toExtractedCandidate(sf: SlottedField): ExtractedCandidate {
  return {
    field: sf.field,
    value: sf.value,
    sourceDoc: slotToSourceDoc(sf.slot),
    sourceType: extractionSourceToType(sf.extraction_source),
    confidence: sf.confidence,
    reviewRequired: false,
  }
}

/**
 * Given multiple values for the same field from different slots,
 * return whether a Latin-script value from a US document should
 * control spelling over a transliterated value.
 *
 * US documents (DL, I-94, EAD) carry official Latin spellings used
 * by USCIS. These beat KMU-55 transliteration from Cyrillic sources.
 */
export function hasControllingLatinSpelling(
  candidates: SlottedField[],
): { applies: boolean; winner: SlottedField | null } {
  const latinSources: SlotId[] = ['dl', 'i94', 'ead', 'ead_old']
  const latin = candidates.find((c) => latinSources.includes(c.slot) && c.value)
  return latin ? { applies: true, winner: latin } : { applies: false, winner: null }
}
