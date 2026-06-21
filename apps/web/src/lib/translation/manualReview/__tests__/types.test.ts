/**
 * Manual review types — status/reason validation, transitions, aliases.
 */
import { describe, it, expect } from 'vitest'
import {
  isManualReviewStatus,
  isManualReviewReason,
  isManualReviewPriority,
  isManualReviewEventType,
  canTransition,
  canonicalStatus,
  isStatusEquivalent,
  normalizeReason,
  MANUAL_REVIEW_STATUSES,
  MANUAL_REVIEW_REASONS,
  MANUAL_REVIEW_EVENT_TYPES,
} from '../types'

describe('isManualReviewStatus', () => {
  it('accepts all enumerated statuses', () => {
    for (const s of MANUAL_REVIEW_STATUSES) {
      expect(isManualReviewStatus(s)).toBe(true)
    }
  })
  it('rejects unknown strings', () => {
    expect(isManualReviewStatus('foo')).toBe(false)
    expect(isManualReviewStatus('')).toBe(false)
    expect(isManualReviewStatus(null)).toBe(false)
    expect(isManualReviewStatus(undefined)).toBe(false)
    expect(isManualReviewStatus(42)).toBe(false)
  })
})

describe('isManualReviewReason', () => {
  it('accepts all enumerated reasons', () => {
    for (const r of MANUAL_REVIEW_REASONS) {
      expect(isManualReviewReason(r)).toBe(true)
    }
  })
  it('rejects unknown reasons', () => {
    expect(isManualReviewReason('foo')).toBe(false)
    expect(isManualReviewReason('low_confidence')).toBe(false) // v0 alias must go through normalizeReason
  })
})

describe('isManualReviewPriority', () => {
  it('accepts low|normal|high', () => {
    expect(isManualReviewPriority('low')).toBe(true)
    expect(isManualReviewPriority('normal')).toBe(true)
    expect(isManualReviewPriority('high')).toBe(true)
  })
  it('rejects others', () => {
    expect(isManualReviewPriority('urgent')).toBe(false)
  })
})

describe('isManualReviewEventType', () => {
  it('accepts all enumerated event types', () => {
    for (const e of MANUAL_REVIEW_EVENT_TYPES) {
      expect(isManualReviewEventType(e)).toBe(true)
    }
  })
})

describe('canonicalStatus + isStatusEquivalent', () => {
  it('maps pending → queued', () => {
    expect(canonicalStatus('pending')).toBe('queued')
  })
  it('maps cancelled → rejected', () => {
    expect(canonicalStatus('cancelled')).toBe('rejected')
  })
  it('preserves canonical statuses', () => {
    expect(canonicalStatus('in_review')).toBe('in_review')
    expect(canonicalStatus('completed')).toBe('completed')
    expect(canonicalStatus('approved_for_render')).toBe('approved_for_render')
  })
  it('treats v0 and v1 aliases as equivalent', () => {
    expect(isStatusEquivalent('pending', 'queued')).toBe(true)
    expect(isStatusEquivalent('queued', 'pending')).toBe(true)
    expect(isStatusEquivalent('cancelled', 'rejected')).toBe(true)
  })
  it('does not collapse distinct statuses', () => {
    expect(isStatusEquivalent('queued', 'in_review')).toBe(false)
  })
})

describe('canTransition', () => {
  it('allows queued → assigned', () => {
    expect(canTransition('queued', 'assigned')).toBe(true)
  })
  it('allows pending → assigned (alias)', () => {
    expect(canTransition('pending', 'assigned')).toBe(true)
  })
  it('allows in_review → operator_completed', () => {
    expect(canTransition('in_review', 'operator_completed')).toBe(true)
  })
  it('allows operator_completed → approved_for_render', () => {
    expect(canTransition('operator_completed', 'approved_for_render')).toBe(true)
  })
  it('allows approved_for_render → completed', () => {
    expect(canTransition('approved_for_render', 'completed')).toBe(true)
  })
  it('blocks queued → completed (must go through review)', () => {
    expect(canTransition('queued', 'completed')).toBe(false)
  })
  it('blocks completed → anything (terminal)', () => {
    expect(canTransition('completed', 'queued')).toBe(false)
    expect(canTransition('completed', 'in_review')).toBe(false)
  })
  it('blocks rejected → anything', () => {
    expect(canTransition('rejected', 'queued')).toBe(false)
  })
  it('treats cancelled like rejected', () => {
    expect(canTransition('cancelled', 'queued')).toBe(false)
  })
  it('blocks queued → operator_completed (must go through in_review)', () => {
    expect(canTransition('queued', 'operator_completed')).toBe(false)
  })
})

describe('normalizeReason', () => {
  it('returns v1 reason as-is', () => {
    expect(normalizeReason('low_ocr_confidence')).toBe('low_ocr_confidence')
    expect(normalizeReason('user_requested_human_help')).toBe('user_requested_human_help')
  })
  it('maps v0 low_confidence → low_ocr_confidence', () => {
    expect(normalizeReason('low_confidence')).toBe('low_ocr_confidence')
  })
  it('maps v0 user_requested → user_requested_human_help', () => {
    expect(normalizeReason('user_requested')).toBe('user_requested_human_help')
  })
  it('maps v0 translate_error → system_error', () => {
    expect(normalizeReason('translate_error')).toBe('system_error')
  })
  it('maps v0 ocr_unreadable → image_quality_failed', () => {
    expect(normalizeReason('ocr_unreadable')).toBe('image_quality_failed')
  })
  it('returns null for unknown reasons', () => {
    expect(normalizeReason('foo')).toBeNull()
    expect(normalizeReason('')).toBeNull()
  })
})
