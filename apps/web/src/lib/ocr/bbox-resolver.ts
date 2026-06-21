/**
 * OCR ID → Bounding Box resolver
 *
 * Given a list of OCR token IDs (from the field mapper output) and the full
 * OcrResult, computes the exact or combined bounding box for that field.
 *
 * Rules:
 *   - 1 ID matched  → bbox_status = 'exact'
 *   - 2+ IDs matched → combine via union → bbox_status = 'combined'
 *   - Any ID unknown → mark that ID as unresolved; if ANY IDs resolved → 'combined' (partial)
 *   - All IDs unknown → bbox_status = 'missing', review_required = true
 */
import type { OcrResult, OcrWord, OcrLine, OcrBoundingBox } from './types'
import { unionBboxes, bboxToTuple } from './types'
import type { BboxStatus, EvidenceType } from '@/lib/translation/types'

export interface ResolvedBbox {
  bbox: [number, number, number, number]  // [x0, y0, x1, y1] normalised 0–1
  bbox_status: BboxStatus
  evidence_type: EvidenceType
  unresolved_ids: string[]               // IDs not found in OCR result (empty = all resolved)
  resolved_count: number
  review_required_by_bbox: boolean       // true if bbox is missing or all IDs were unknown
}

/**
 * Build a lookup map from OCR result for O(1) ID resolution.
 */
export function buildOcrLookup(ocrResult: OcrResult): Map<string, OcrBoundingBox> {
  const map = new Map<string, OcrBoundingBox>()
  for (const word of ocrResult.words) {
    map.set(word.id, word.bbox)
  }
  for (const line of ocrResult.lines) {
    map.set(line.id, line.bbox)
  }
  return map
}

/**
 * Resolve a list of OCR IDs to a combined bounding box.
 */
export function resolveOcrIds(
  ocrIds: string[],
  lookup: Map<string, OcrBoundingBox>
): ResolvedBbox {
  if (!ocrIds || ocrIds.length === 0) {
    return {
      bbox: [0, 0, 1, 1],
      bbox_status: 'missing',
      evidence_type: 'zone_fallback',
      unresolved_ids: [],
      resolved_count: 0,
      review_required_by_bbox: true,
    }
  }

  const resolvedBoxes: OcrBoundingBox[] = []
  const unresolvedIds: string[] = []

  for (const id of ocrIds) {
    const box = lookup.get(id)
    if (box) {
      resolvedBoxes.push(box)
    } else {
      unresolvedIds.push(id)
    }
  }

  if (resolvedBoxes.length === 0) {
    return {
      bbox: [0, 0, 1, 1],
      bbox_status: 'missing',
      evidence_type: 'zone_fallback',
      unresolved_ids: unresolvedIds,
      resolved_count: 0,
      review_required_by_bbox: true,
    }
  }

  const combined = unionBboxes(resolvedBoxes)
  const tuple    = bboxToTuple(combined)

  // Classify
  const isDegenerate = tuple[0] === 0 && tuple[1] === 0 && tuple[2] === 1 && tuple[3] === 1
  let bboxStatus: BboxStatus
  if (isDegenerate || resolvedBoxes.length === 0) {
    bboxStatus = 'missing'
  } else if (resolvedBoxes.length === 1 && unresolvedIds.length === 0) {
    bboxStatus = 'exact'
  } else {
    bboxStatus = 'combined'
  }

  const evidenceType: EvidenceType = bboxStatus === 'missing' ? 'zone_fallback' : 'ocr_bbox'

  return {
    bbox: tuple,
    bbox_status: bboxStatus,
    evidence_type: evidenceType,
    unresolved_ids: unresolvedIds,
    resolved_count: resolvedBoxes.length,
    review_required_by_bbox: bboxStatus === 'missing',
  }
}
