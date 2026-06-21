/**
 * customerStatus.test.ts — the public order endpoint must collapse internal
 * queue states into the 3-step customer view and never leak intermediate
 * operator states (operator_completed/approved_for_render stay "in_review"
 * until the email is actually sent → completed).
 */
import { describe, it, expect } from 'vitest'
import { toCustomerStatus } from '@/lib/translation/manualReview/customerStatus'

describe('toCustomerStatus', () => {
  it('queued/pending → received', () => {
    expect(toCustomerStatus('queued')).toBe('received')
    expect(toCustomerStatus('pending')).toBe('received')
  })
  it('all operator-side states → in_review (no internal leak)', () => {
    for (const s of ['assigned', 'in_review', 'needs_user_clarification', 'operator_completed', 'approved_for_render']) {
      expect(toCustomerStatus(s), s).toBe('in_review')
    }
  })
  it('completed → completed; rejected/cancelled/garbage → closed', () => {
    expect(toCustomerStatus('completed')).toBe('completed')
    expect(toCustomerStatus('rejected')).toBe('closed')
    expect(toCustomerStatus('cancelled')).toBe('closed')
    expect(toCustomerStatus('weird')).toBe('closed')
  })
})
