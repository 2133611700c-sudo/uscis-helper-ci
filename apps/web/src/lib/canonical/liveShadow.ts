/**
 * canonical/liveShadow.ts — single-stack live shadow for the TPS route.
 *
 * Behind ONE_BRAIN_SHADOW (default OFF), the route builds the canonical result
 * from the SAME live `TpsExtractedField[]` and logs how the canonical review
 * policy would differ from the live module's own review flags. This is the
 * real-traffic signal we need before migration: "switching to the canonical brain
 * would flag these N additional fields for review."
 *
 * Pure + PII-free (counts + field keys only, never values). It must NEVER throw in
 * a way that affects extraction — the caller wraps it in try/catch AND it guards
 * internally.
 */
import type { TpsExtractedField } from '@/lib/tps/types'
import { readCanonicalDocumentFromTps } from './adapter'
import type { CanonicalProduct } from './types'

export interface TpsShadowMeta {
  documentSessionId: string
  docType: string
  /** ISO-8601 UTC — caller stamps it. */
  createdAt: string
  product?: CanonicalProduct
}

/**
 * Compare the canonical review decision against the live module flags. Because the
 * adapter never LOWERS a module's flag (invariant 1), `-review` should always be 0;
 * `+review` surfaces where the stricter canonical policy (critical fields,
 * disagreement, no-silent-correction, low confidence) adds review.
 */
export function summarizeTpsReviewShift(fields: TpsExtractedField[], meta: TpsShadowMeta): string {
  const liveReviewByKey = new Map<string, boolean>()
  for (const f of fields) {
    // OR across duplicate keys — a field reviewed in any module reading counts as reviewed live.
    liveReviewByKey.set(f.field, (liveReviewByKey.get(f.field) ?? false) || !!f.review_required)
  }
  const canonical = readCanonicalDocumentFromTps({
    documentSessionId: meta.documentSessionId,
    product: meta.product ?? 'tps',
    docType: meta.docType,
    fields,
    createdAt: meta.createdAt,
  })
  const addedReview: string[] = []
  const droppedReview: string[] = []
  for (const cf of canonical.fields) {
    const live = liveReviewByKey.get(cf.key) ?? false
    if (cf.reviewRequired && !live) addedReview.push(cf.key)
    if (!cf.reviewRequired && live) droppedReview.push(cf.key)
  }
  return (
    `tps_shadow doc=${meta.docType} fields=${canonical.fields.length} ` +
    `requiresReview=${canonical.requiresReview} ` +
    `+review=${addedReview.length}${addedReview.length ? `[${addedReview.join(',')}]` : ''} ` +
    `-review=${droppedReview.length}${droppedReview.length ? `[${droppedReview.join(',')}]` : ''}`
  )
}
