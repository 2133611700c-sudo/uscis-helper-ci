import type { TPSAnswers } from './answers'

export interface ReviewSnapshot {
  city_of_birth?: string
  province_of_birth?: string
}

export interface ReviewPayloadMismatch {
  field: 'city_of_birth' | 'province_of_birth'
  review_value: string
  payload_value: string
}

/**
 * Wave1 runtime lock: values visible on Step 5 review must match
 * values submitted for packet generation.
 */
export function checkReviewPayloadParity(
  answers: TPSAnswers,
  reviewSnapshot: ReviewSnapshot | null,
): ReviewPayloadMismatch[] {
  if (!reviewSnapshot) return []

  const mismatches: ReviewPayloadMismatch[] = []
  const pairs: Array<{
    key: 'city_of_birth' | 'province_of_birth'
    review: string
    payload: string
  }> = [
    {
      key: 'city_of_birth',
      review: (reviewSnapshot.city_of_birth || '').trim(),
      payload: (answers.city_of_birth || '').trim(),
    },
    {
      key: 'province_of_birth',
      review: (reviewSnapshot.province_of_birth || '').trim(),
      payload: (answers.province_of_birth || '').trim(),
    },
  ]

  for (const p of pairs) {
    if (!p.review && !p.payload) continue
    if (p.review !== p.payload) {
      mismatches.push({
        field: p.key,
        review_value: p.review,
        payload_value: p.payload,
      })
    }
  }
  return mismatches
}

