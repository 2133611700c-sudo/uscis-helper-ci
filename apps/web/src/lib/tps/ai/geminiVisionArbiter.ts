/**
 * geminiVisionArbiter — TPS/booklet FACADE over the shared Document Intelligence
 * spine (lib/docintel). Kept as a thin, stable API for the OCR route and tests;
 * all real logic now lives in the canonical layer:
 *   - provider:        docintel/providers/geminiVisionProvider
 *   - registry:        docintel/documentRegistry (ua_internal_passport_booklet)
 *   - transliteration: docintel/transliterationPolicy (KMU-55, never LLM)
 *
 * This removes the previous point-solution: the booklet path now rests on the
 * same spine that TPS / ReParole / EAD / Translation share.
 */

import type { TpsExtractedField } from '@/lib/tps/types'
import { defaultVisionProvider } from '@/lib/docintel/providers/geminiVisionProvider'
import { getDocTypeSpec } from '@/lib/docintel/documentRegistry'
import { toCanonicalValue } from '@/lib/docintel/transliterationPolicy'
import type { VisionFieldRead, VisionReadResult } from '@/lib/docintel/types'

export type { VisionFieldRead } from '@/lib/docintel/types'
export type VisionArbiterResult = VisionReadResult

const BOOKLET_ID = 'ua_internal_passport_booklet'

/** Read the handwritten booklet identity page via the shared vision provider. */
export async function readBookletViaVision(
  imageBuffer: Buffer,
  mimeType: string,
  opts: { timeoutMs?: number; attemptsPerModel?: number } = {},
): Promise<VisionArbiterResult> {
  const spec = getDocTypeSpec(BOOKLET_ID)
  if (!spec) return { ok: false, fields: [], model: null, ms: 0, error: 'booklet spec missing' }
  return defaultVisionProvider.readFields(imageBuffer, mimeType, spec, opts)
}

/**
 * TPS adapter: Cyrillic vision reads → TPS candidate fields. Names/places use
 * KMU-55 via the shared transliterationPolicy (never the LLM). Every field is
 * review_required=true (handwritten Cyrillic, candidate-only).
 */
export function visionReadsToFields(
  reads: VisionFieldRead[],
  documentId: string,
): TpsExtractedField[] {
  const spec = getDocTypeSpec(BOOKLET_ID)
  const kindByField = new Map((spec?.fields ?? []).map((f) => [f.field, f.kind]))
  const out: TpsExtractedField[] = []
  for (const r of reads) {
    if (!r.can_read) continue
    const kind = kindByField.get(r.field)
    if (!kind) continue
    const value = toCanonicalValue(r, kind)
    if (!value) continue
    out.push({
      field: r.field,
      raw_value: r.cyrillic || value,
      normalized_value: value,
      confidence: Math.max(0, Math.min(1, r.confidence)),
      // Reuse existing source enum to avoid drift-gate churn; provenance via source_zone.
      extraction_source: 'dual_ocr_crossref',
      review_required: true, // handwritten Cyrillic is ALWAYS user-confirmed
      source_document_id: documentId,
      source_zone: 'gemini_vision',
      bbox: null,
      language_layer: 'cyrillic',
      ocr_word_ids: [],
      passes: ['gemini_vision_read'],
      failures: [],
      user_corrected: false,
    })
  }
  return out
}
