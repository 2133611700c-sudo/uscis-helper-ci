/**
 * Manual review router unit tests.
 *
 * Pure-function tests — no DB, no network, no PII.
 */
import { describe, it, expect } from 'vitest'
import { shouldRouteToManualReview, ROUTER_THRESHOLDS } from '../router'

describe('shouldRouteToManualReview', () => {
  it('routes empty/unknown documentType to manual review', () => {
    const res = shouldRouteToManualReview({ documentType: '' })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('unknown_document_type')
    expect(res.userMessageKey).toBe('mr.unknown_document_type')
  })

  it('routes null documentType to manual review', () => {
    const res = shouldRouteToManualReview({ documentType: null })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('unknown_document_type')
  })

  it('routes draft module status to manual review with unsupported_document_type', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_diploma',
      moduleStatus: 'draft',
      classifierConfidence: 0.95,
    })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('unsupported_document_type')
  })

  it('routes manual_only module status to manual review', () => {
    const res = shouldRouteToManualReview({
      documentType: 'manual_review_required',
      moduleStatus: 'manual_only',
      classifierConfidence: 1,
    })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('unsupported_document_type')
  })

  it('routes low classifier confidence to manual review', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: ROUTER_THRESHOLDS.classifierConfidence - 0.01,
    })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('low_classification_confidence')
  })

  it('routes low OCR confidence to manual review', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      ocrConfidence: ROUTER_THRESHOLDS.ocrConfidence - 0.01,
    })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('low_ocr_confidence')
  })

  it('routes image quality failed (max retries reached) to manual review', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      imageQuality: { failed: true, retries: ROUTER_THRESHOLDS.maxImageQualityRetries },
    })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('image_quality_failed')
  })

  it('does NOT route image quality failed if retries still available', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      imageQuality: { failed: true, retries: 0 },
    })
    expect(res.reasons).not.toContain('image_quality_failed')
  })

  it('routes missing critical fields to manual review', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      criticalFieldResults: [
        { fieldKey: 'series', present: true, hasEvidence: true },
        { fieldKey: 'number', present: false, hasEvidence: false },
      ],
    })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('missing_critical_fields')
  })

  it('routes missing source evidence (present-but-no-evidence) to manual review', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      criticalFieldResults: [
        { fieldKey: 'series', present: true, hasEvidence: false },
      ],
    })
    expect(res.manualReviewRequired).toBe(true)
    expect(res.reasons).toContain('missing_source_evidence')
  })

  it('routes content signal: long legal text', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      contentSignals: { longLegalText: true },
    })
    expect(res.reasons).toContain('long_legal_text')
  })

  it('routes content signal: complex table', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      contentSignals: { complexTable: true },
    })
    expect(res.reasons).toContain('complex_table_document')
  })

  it('routes content signal: identity_conflict with HIGH priority', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      contentSignals: { identityConflict: true },
    })
    expect(res.reasons).toContain('identity_conflict')
    expect(res.priority).toBe('high')
  })

  it('routes user-requested help with LOW priority when alone', () => {
    const res = shouldRouteToManualReview({
      documentType: '',
      userRequestedHelp: true,
    })
    // 'unknown_document_type' fires too because docType is empty,
    // so test alone-case explicitly:
    const aloneRes = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      userRequestedHelp: true,
    })
    expect(aloneRes.reasons).toEqual(['user_requested_human_help'])
    expect(aloneRes.priority).toBe('low')
    expect(res.manualReviewRequired).toBe(true)
  })

  it('does NOT route when supported active module passes all gates', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 0.95,
      ocrConfidence: 0.95,
      imageQuality: { failed: false, retries: 0 },
      criticalFieldResults: [
        { fieldKey: 'series', present: true, hasEvidence: true },
        { fieldKey: 'number', present: true, hasEvidence: true },
      ],
      contentSignals: {},
      userRequestedHelp: false,
    })
    expect(res.manualReviewRequired).toBe(false)
    expect(res.reasons).toEqual([])
    expect(res.priority).toBe('normal')
    expect(res.userMessageKey).toBe('mr.not_required')
  })

  it('bumps to HIGH priority for paid user with any reason', () => {
    const res = shouldRouteToManualReview({
      documentType: '',
      paidUser: true,
    })
    expect(res.priority).toBe('high')
  })

  it('bumps to HIGH priority for repeated OCR failures', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      ocrConfidence: 0.4,
      ocrFailureCount: 5,
    })
    expect(res.priority).toBe('high')
  })

  it('extraction errors surface as system_error', () => {
    const res = shouldRouteToManualReview({
      documentType: 'ua_internal_passport_booklet',
      moduleStatus: 'active',
      classifierConfidence: 1,
      extractionErrors: ['timeout'],
    })
    expect(res.reasons).toContain('system_error')
  })

  it('deduplicates reasons', () => {
    const res = shouldRouteToManualReview({
      documentType: '',
      moduleStatus: 'draft', // would also imply unsupported_document_type
    })
    const uniques = Array.from(new Set(res.reasons))
    expect(res.reasons).toEqual(uniques)
  })
})
