/**
 * documentClassPolicy.test.ts — Document-class OCR policy guards.
 *
 * Tests encode the benchmark findings from 2026-06-02 adjudication.
 * These are NOT implementation tests — they are POLICY INVARIANTS.
 * If any of these fail, a benchmark finding has been violated.
 */
import { describe, test, expect } from 'vitest'
import {
  isHardCase,
  isAutoFillAllowed,
  applyHardCaseReviewOverride,
  applyCertificateRoleGuard,
  checkImageQuality,
  docintelIdToDocumentClass,
  tpsHintToDocumentClass,
  isUkrainianIdentityDoc,
} from '../documentClassPolicy'

describe('document class policy — hard case invariants', () => {
  test('birth_cert_handwritten is hard case', () => {
    expect(isHardCase('birth_certificate_handwritten')).toBe(true)
  })

  test('birth_cert_soviet is hard case', () => {
    expect(isHardCase('birth_certificate_soviet_bilingual')).toBe(true)
  })

  test('marriage_apostille is hard case', () => {
    expect(isHardCase('marriage_apostille')).toBe(true)
  })

  test('unknown_document is hard case', () => {
    expect(isHardCase('unknown_document')).toBe(true)
  })

  test('internal_passport_booklet is NOT a hard case', () => {
    expect(isHardCase('internal_passport_booklet')).toBe(false)
  })

  test('military_id is NOT a hard case', () => {
    expect(isHardCase('military_id')).toBe(false)
  })
})

describe('document class policy — auto-fill invariants', () => {
  test('internal_passport allows auto-fill', () => {
    expect(isAutoFillAllowed('internal_passport_booklet')).toBe(true)
  })

  test('military_id allows auto-fill', () => {
    expect(isAutoFillAllowed('military_id')).toBe(true)
  })

  test('birth_cert_handwritten does NOT allow auto-fill', () => {
    expect(isAutoFillAllowed('birth_certificate_handwritten')).toBe(false)
  })

  test('birth_cert_soviet does NOT allow auto-fill', () => {
    expect(isAutoFillAllowed('birth_certificate_soviet_bilingual')).toBe(false)
  })

  test('marriage_apostille does NOT allow auto-fill', () => {
    expect(isAutoFillAllowed('marriage_apostille')).toBe(false)
  })

  test('unknown_document does NOT allow auto-fill', () => {
    expect(isAutoFillAllowed('unknown_document')).toBe(false)
  })
})

describe('hard-case review override — model review_required not trusted on certificates', () => {
  test('forces review on birth_cert_handwritten even if model says false', () => {
    const result = applyHardCaseReviewOverride('birth_certificate_handwritten', {
      review_required: false,
    })
    expect(result.review_required).toBe(true)
  })

  test('forces review on birth_cert_soviet even if model says false', () => {
    const result = applyHardCaseReviewOverride('birth_certificate_soviet_bilingual', {
      review_required: false,
    })
    expect(result.review_required).toBe(true)
  })

  test('forces review on marriage_apostille even if model says false', () => {
    const result = applyHardCaseReviewOverride('marriage_apostille', {
      review_required: false,
    })
    expect(result.review_required).toBe(true)
  })

  test('override_reason is set on hard-case override', () => {
    const result = applyHardCaseReviewOverride('birth_certificate_handwritten', {
      review_required: false,
    })
    expect((result as any).override_reason).toContain('hard_case_class')
  })

  test('non-hard-case passport passes model output unchanged', () => {
    const result = applyHardCaseReviewOverride('internal_passport_booklet', {
      review_required: false,
      some_field: 'abc',
    })
    expect(result.review_required).toBe(false)
  })
})

describe('wrong-person guard — role grounding on certificates', () => {
  test('rejects generic name field on birth_cert_handwritten', () => {
    const result = applyCertificateRoleGuard('birth_certificate_handwritten', {
      family_name: 'Кудрявцев',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('role_not_grounded')
    expect(result.forcedReviewFields).toContain('family_name')
  })

  test('rejects generic name field on birth_cert_soviet', () => {
    const result = applyCertificateRoleGuard('birth_certificate_soviet_bilingual', {
      family_name: 'ТЕСТ',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('role_not_grounded')
  })

  test('rejects generic name field on marriage_apostille', () => {
    const result = applyCertificateRoleGuard('marriage_apostille', {
      family_name: 'ТЕСТ',
    })
    expect(result.safe).toBe(false)
  })

  test('accepts role-grounded child fields on birth cert', () => {
    const result = applyCertificateRoleGuard('birth_certificate_handwritten', {
      child_family_name: 'Іваненко',
      child_given_name: 'Іван',
    })
    expect(result.safe).toBe(true)
    expect(result.forcedReviewFields).toHaveLength(0)
  })

  test('accepts role-grounded spouse fields on marriage', () => {
    const result = applyCertificateRoleGuard('marriage_apostille', {
      spouse1_family_name: 'Іваненко',
    })
    expect(result.safe).toBe(true)
  })

  test('passport is not subject to role guard — passes through', () => {
    const result = applyCertificateRoleGuard('internal_passport_booklet', {
      family_name: 'Іваненко',
    })
    expect(result.safe).toBe(true)
    expect(result.forcedReviewFields).toHaveLength(0)
  })
})

describe('image quality guard', () => {
  test('image too large triggers resize', () => {
    const result = checkImageQuality('internal_passport_booklet', 5_000_000)
    expect(result.action).toBe('resize')
    expect(result.ok).toBe(false)
  })

  test('small marriage apostille (82KB) triggers needs_better_scan', () => {
    const result = checkImageQuality('marriage_apostille', 82_000)
    expect(result.action).toBe('needs_better_scan')
    expect(result.ok).toBe(false)
  })

  test('marriage apostille requires 300KB minimum', () => {
    const result = checkImageQuality('marriage_apostille', 299_999)
    expect(result.action).toBe('needs_better_scan')
  })

  test('marriage apostille at 300KB proceeds', () => {
    const result = checkImageQuality('marriage_apostille', 300_000)
    expect(result.action).toBe('proceed')
    expect(result.ok).toBe(true)
  })

  test('internal passport below 100KB triggers needs_better_scan', () => {
    const result = checkImageQuality('internal_passport_booklet', 50_000)
    expect(result.action).toBe('needs_better_scan')
  })

  test('internal passport at 200KB proceeds', () => {
    const result = checkImageQuality('internal_passport_booklet', 200_000)
    expect(result.action).toBe('proceed')
    expect(result.ok).toBe(true)
  })

  test('reason string is set for too-small images', () => {
    const result = checkImageQuality('marriage_apostille', 82_000)
    expect(result.reason).toContain('image_too_small')
    expect(result.reason).toContain('marriage_apostille')
  })

  test('reason string is set for too-large images', () => {
    const result = checkImageQuality('internal_passport_booklet', 5_000_000)
    expect(result.reason).toContain('image_too_large')
  })
})

describe('document type ID mapping — docintelIdToDocumentClass', () => {
  test('ua_birth_certificate maps to birth_certificate_handwritten (conservative)', () => {
    expect(docintelIdToDocumentClass('ua_birth_certificate')).toBe('birth_certificate_handwritten')
  })

  test('ua_marriage_certificate maps to marriage_apostille', () => {
    expect(docintelIdToDocumentClass('ua_marriage_certificate')).toBe('marriage_apostille')
  })

  test('ua_internal_passport_booklet maps to internal_passport_booklet', () => {
    expect(docintelIdToDocumentClass('ua_internal_passport_booklet')).toBe('internal_passport_booklet')
  })

  test('ua_international_passport maps to internal_passport_booklet (same model policy)', () => {
    expect(docintelIdToDocumentClass('ua_international_passport')).toBe('internal_passport_booklet')
  })

  test('ua_military_id maps to military_id', () => {
    expect(docintelIdToDocumentClass('ua_military_id')).toBe('military_id')
  })

  test('unknown docTypeId maps to unknown_document', () => {
    expect(docintelIdToDocumentClass('something_unknown')).toBe('unknown_document')
  })
})

describe('TPS hint mapping — tpsHintToDocumentClass', () => {
  test('passport maps to internal_passport_booklet', () => {
    expect(tpsHintToDocumentClass('passport')).toBe('internal_passport_booklet')
  })

  test('booklet maps to internal_passport_booklet', () => {
    expect(tpsHintToDocumentClass('booklet')).toBe('internal_passport_booklet')
  })

  test('i94 maps to unknown_document (US form, not Ukrainian doc)', () => {
    expect(tpsHintToDocumentClass('i94')).toBe('unknown_document')
  })

  test('ead maps to unknown_document (US form, not Ukrainian doc)', () => {
    expect(tpsHintToDocumentClass('ead')).toBe('unknown_document')
  })
})

describe('isUkrainianIdentityDoc — route guard', () => {
  test('passport is Ukrainian identity doc', () => {
    expect(isUkrainianIdentityDoc('passport')).toBe(true)
  })

  test('booklet is Ukrainian identity doc', () => {
    expect(isUkrainianIdentityDoc('booklet')).toBe(true)
  })

  test('ua_birth_certificate is Ukrainian identity doc', () => {
    expect(isUkrainianIdentityDoc('ua_birth_certificate')).toBe(true)
  })

  test('ua_marriage_certificate is Ukrainian identity doc', () => {
    expect(isUkrainianIdentityDoc('ua_marriage_certificate')).toBe(true)
  })

  test('i94 is NOT a Ukrainian identity doc — policy does not apply', () => {
    expect(isUkrainianIdentityDoc('i94')).toBe(false)
  })

  test('ead is NOT a Ukrainian identity doc — policy does not apply', () => {
    expect(isUkrainianIdentityDoc('ead')).toBe(false)
  })

  test('dl is NOT a Ukrainian identity doc', () => {
    expect(isUkrainianIdentityDoc('dl')).toBe(false)
  })
})

describe('wiring invariants — guards must produce correct behavior for live routes', () => {
  test('hard-case birth cert forces review even if model returns review_required=false', () => {
    // Simulates what the route does: applyHardCaseReviewOverride on docClass
    const docClass = docintelIdToDocumentClass('ua_birth_certificate')
    const result = applyHardCaseReviewOverride(docClass, { review_required: false, family_name: 'Тест' })
    expect(result.review_required).toBe(true)
  })

  test('generic family_name on certificate is flagged by role guard', () => {
    // Simulates applyCertificateRoleGuard on extracted fields without role grounding
    const docClass = docintelIdToDocumentClass('ua_birth_certificate')
    const roleCheck = applyCertificateRoleGuard(docClass, { family_name: 'TEST' })
    expect(roleCheck.safe).toBe(false)
    expect(roleCheck.forcedReviewFields).toContain('family_name')
  })

  test('low-quality image (50KB) triggers needs_better_scan for birth cert', () => {
    // Simulates checkImageQuality check before Gemini API call
    const docClass = docintelIdToDocumentClass('ua_birth_certificate')
    const result = checkImageQuality(docClass, 50_000)
    expect(result.action).toBe('needs_better_scan')
    expect(result.ok).toBe(false)
  })

  test('model review_required=false is overridden for birth_certificate_handwritten', () => {
    // Direct unit test — confirms the invariant used in the wired route
    const result = applyHardCaseReviewOverride('birth_certificate_handwritten', { review_required: false })
    expect(result.review_required).toBe(true)
    expect((result as any).override_reason).toContain('birth_certificate_handwritten')
  })

  test('marriage cert (ua_marriage_certificate) → marriage_apostille → is hard case', () => {
    const docClass = docintelIdToDocumentClass('ua_marriage_certificate')
    expect(isHardCase(docClass)).toBe(true)
  })

  test('passport (booklet TPS hint) → internal_passport_booklet → NOT hard case', () => {
    const docClass = tpsHintToDocumentClass('booklet')
    expect(isHardCase(docClass)).toBe(false)
  })

  test('passport (booklet TPS hint) → internal_passport_booklet → auto-fill allowed', () => {
    const docClass = tpsHintToDocumentClass('booklet')
    expect(isAutoFillAllowed(docClass)).toBe(true)
  })
})
