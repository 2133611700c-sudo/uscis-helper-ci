/**
 * Manual Review Module Tests
 *
 * Verifies the fallback module's safety guarantees:
 *   - allowAutoPdf is always false
 *   - criticalFields is empty (no auto-extraction)
 *   - all unsupported conditions route to manual_review
 */
import { describe, it, expect } from 'vitest'
import { manualReviewModule } from '../manualReview.module'

describe('manualReviewModule structure', () => {
  it('has documentType = manual_review_required', () => {
    expect(manualReviewModule.documentType).toBe('manual_review_required')
  })

  it('has status = manual_only', () => {
    expect(manualReviewModule.status).toBe('manual_only')
  })

  it('has displayName in en, ru, uk', () => {
    expect(manualReviewModule.displayName.en).toBeTruthy()
    expect(manualReviewModule.displayName.ru).toBeTruthy()
    expect(manualReviewModule.displayName.uk).toBeTruthy()
  })

  it('supports uk, ru, en languages', () => {
    expect(manualReviewModule.supportedLanguages).toContain('uk')
    expect(manualReviewModule.supportedLanguages).toContain('ru')
    expect(manualReviewModule.supportedLanguages).toContain('en')
  })
})

describe('manualReviewModule safety: no auto-extraction', () => {
  it('has zero critical fields', () => {
    expect(manualReviewModule.criticalFields.length).toBe(0)
  })

  it('has zero optional fields', () => {
    expect(manualReviewModule.optionalFields.length).toBe(0)
  })

  it('has zero validators', () => {
    expect(manualReviewModule.validators.length).toBe(0)
  })

  it('has zero glossary modules', () => {
    expect(manualReviewModule.glossaryModules.length).toBe(0)
  })

  it('has empty expectedLabels', () => {
    expect(Object.keys(manualReviewModule.expectedLabels).length).toBe(0)
  })
})

describe('manualReviewModule reviewPolicy', () => {
  it('has allowAutoPdf = false (CRITICAL: never generate PDF automatically)', () => {
    expect(manualReviewModule.reviewPolicy.allowAutoPdf).toBe(false)
  })

  it('has requireUserConfirmation = true', () => {
    expect(manualReviewModule.reviewPolicy.requireUserConfirmation).toBe(true)
  })

  it('has requireEvidenceForCriticalFields = false (operator handles manually)', () => {
    expect(manualReviewModule.reviewPolicy.requireEvidenceForCriticalFields).toBe(false)
  })

  it('has manualReviewIfMissingCritical = true', () => {
    expect(manualReviewModule.reviewPolicy.manualReviewIfMissingCritical).toBe(true)
  })

  it('has lowConfidenceThreshold = 1.0 (always manual regardless of confidence)', () => {
    expect(manualReviewModule.reviewPolicy.lowConfidenceThreshold).toBe(1.0)
  })
})

describe('manualReviewModule extraction config', () => {
  it('uses manual OCR provider', () => {
    expect(manualReviewModule.extraction.ocrProvider).toBe('manual')
  })

  it('uses manual field mapper', () => {
    expect(manualReviewModule.extraction.fieldMapper).toBe('manual')
  })

  it('has zero field targets', () => {
    expect(manualReviewModule.extraction.fieldTargets.length).toBe(0)
  })

  it('has timeoutMs = 0 (no auto timeout)', () => {
    expect(manualReviewModule.extraction.timeoutMs).toBe(0)
  })
})

describe('manualReviewModule render config', () => {
  it('has templateId = manual_review', () => {
    expect(manualReviewModule.render.templateId).toBe('manual_review')
  })

  it('has zero render fields', () => {
    expect(manualReviewModule.render.renderFields.length).toBe(0)
  })

  it('has no certification template (none)', () => {
    expect(manualReviewModule.render.certificationTemplate).toBe('none')
  })

  it('does not use two-page layout', () => {
    expect(manualReviewModule.render.twoPageLayout).toBe(false)
  })
})

describe('manualReviewModule unsupportedConditions', () => {
  it('has at least 9 unsupported conditions', () => {
    expect(manualReviewModule.unsupportedConditions.length).toBeGreaterThanOrEqual(9)
  })

  it('includes unknown_document_type', () => {
    const codes = manualReviewModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('unknown_document_type')
  })

  it('includes low_classification_confidence', () => {
    const codes = manualReviewModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('low_classification_confidence')
  })

  it('includes missing_critical_fields', () => {
    const codes = manualReviewModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('missing_critical_fields')
  })

  it('includes image_quality_failed', () => {
    const codes = manualReviewModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('image_quality_failed')
  })

  it('includes handwriting_heavy', () => {
    const codes = manualReviewModule.unsupportedConditions.map(c => c.code)
    expect(codes).toContain('handwriting_heavy')
  })

  it('all conditions route to manual_review', () => {
    for (const c of manualReviewModule.unsupportedConditions) {
      expect(c.action).toBe('route_to_manual_review')
    }
  })

  it('all conditions have non-empty descriptions', () => {
    for (const c of manualReviewModule.unsupportedConditions) {
      expect(c.description.length).toBeGreaterThan(0)
    }
  })

  it('all condition codes are unique', () => {
    const codes = manualReviewModule.unsupportedConditions.map(c => c.code)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })
})

describe('manualReviewModule userStatusMessage', () => {
  it('has a defined userStatusMessage', () => {
    expect(manualReviewModule.userStatusMessage).toBeTruthy()
  })

  it('does not mention internal technical terms (OCR, bbox, source trace)', () => {
    const msg = manualReviewModule.userStatusMessage ?? ''
    expect(msg.toLowerCase()).not.toContain('ocr')
    expect(msg.toLowerCase()).not.toContain('bbox')
    expect(msg.toLowerCase()).not.toContain('source trace')
    expect(msg.toLowerCase()).not.toContain('bounding box')
  })
})
