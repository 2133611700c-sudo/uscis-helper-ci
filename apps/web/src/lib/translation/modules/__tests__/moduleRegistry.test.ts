/**
 * Module Registry Tests
 *
 * Verifies the routing safety guarantees:
 *   - unknown types → manualReview
 *   - draft modules → manualReview
 *   - active modules → returned as-is
 *   - auto-draft only for active + allowAutoPdf
 */
import { describe, it, expect } from 'vitest'
import {
  findDocumentModule,
  getDocumentModule,
  listDocumentModules,
  listActiveModules,
  isAutoDraftSupported,
  getFallbackModule,
  classifyToModule,
  getRegisteredDocumentTypes,
} from '../registry'
import { passportBookletModule } from '../passportBooklet.module'
import { birthCertificateModule } from '../birthCertificate.module'
import { marriageCertificateModule } from '../marriageCertificate.module'
import { divorceCertificateModule } from '../divorceCertificate.module'
import { manualReviewModule } from '../manualReview.module'

// ── findDocumentModule ────────────────────────────────────────────────────────

describe('findDocumentModule', () => {
  it('returns the passport module for its exact documentType key', () => {
    const m = findDocumentModule('ua_internal_passport_booklet')
    expect(m).toBe(passportBookletModule)
  })

  it('returns the birth certificate module for its exact documentType key', () => {
    const m = findDocumentModule('ua_birth_certificate')
    expect(m).toBe(birthCertificateModule)
  })

  it('returns the manualReview module for its exact documentType key', () => {
    const m = findDocumentModule('manual_review_required')
    expect(m).toBe(manualReviewModule)
  })

  it('returns the marriage certificate module for its exact documentType key', () => {
    const m = findDocumentModule('ua_marriage_certificate')
    expect(m).toBe(marriageCertificateModule)
  })

  it('returns the divorce certificate module for its exact documentType key', () => {
    const m = findDocumentModule('ua_divorce_certificate')
    expect(m).toBe(divorceCertificateModule)
  })

  it('returns null for a truly unknown document type', () => {
    const m = findDocumentModule('ua_unknown_document_xyz')
    expect(m).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(findDocumentModule('')).toBeNull()
  })

  it('is case-sensitive — aliased forms return null', () => {
    // 'ua_passport_booklet' is an alias handled by classifier, not registry
    expect(findDocumentModule('ua_passport_booklet')).toBeNull()
    expect(findDocumentModule('UA_INTERNAL_PASSPORT_BOOKLET')).toBeNull()
  })
})

// ── getDocumentModule ─────────────────────────────────────────────────────────

describe('getDocumentModule', () => {
  it('returns passport module for active document type', () => {
    const m = getDocumentModule('ua_internal_passport_booklet')
    expect(m).toBe(passportBookletModule)
  })

  it('returns manualReview for an unknown document type', () => {
    const m = getDocumentModule('unknown_type_xyz')
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReviewModule for ua_birth_certificate (demoted to draft 2026-05-09)', () => {
    // Birth certificate module was demoted from 'active' to 'draft' on 2026-05-09 —
    // synthetic-only E2E does not justify self-serve auto-PDF.
    // Per registry.getDocumentModule(): non-active modules route to manualReview.
    expect(birthCertificateModule.status).toBe('draft')
    const m = getDocumentModule('ua_birth_certificate')
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReviewModule for ua_marriage_certificate (demoted to draft 2026-05-09)', () => {
    expect(marriageCertificateModule.status).toBe('draft')
    const m = getDocumentModule('ua_marriage_certificate')
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReviewModule for ua_divorce_certificate (demoted to draft 2026-05-09)', () => {
    expect(divorceCertificateModule.status).toBe('draft')
    const m = getDocumentModule('ua_divorce_certificate')
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReview for manual_only module (pass-through)', () => {
    const m = getDocumentModule('manual_review_required')
    expect(m).toBe(manualReviewModule)
  })

  it('never throws for any input', () => {
    const inputs = ['', 'null', '   ', 'some/path', '🚀', '0']
    for (const input of inputs) {
      expect(() => getDocumentModule(input)).not.toThrow()
    }
  })

  it('always returns a DocumentModule (never null)', () => {
    const m = getDocumentModule('nonexistent_type')
    expect(m).toBeDefined()
    expect(m.documentType).toBeDefined()
    expect(m.criticalFields).toBeDefined()
  })
})

// ── listDocumentModules ───────────────────────────────────────────────────────

describe('listDocumentModules', () => {
  it('returns an array of modules', () => {
    const modules = listDocumentModules()
    expect(Array.isArray(modules)).toBe(true)
    expect(modules.length).toBeGreaterThan(0)
  })

  it('includes the passport module', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).toContain('ua_internal_passport_booklet')
  })

  it('includes the birth certificate module', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).toContain('ua_birth_certificate')
  })

  it('includes the marriage certificate module', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).toContain('ua_marriage_certificate')
  })

  it('includes the divorce certificate module', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).toContain('ua_divorce_certificate')
  })

  it('does NOT include the manualReview sentinel', () => {
    const types = listDocumentModules().map(m => m.documentType)
    expect(types).not.toContain('manual_review_required')
  })

  it('has no duplicate documentType keys', () => {
    const types = listDocumentModules().map(m => m.documentType)
    const unique = new Set(types)
    expect(unique.size).toBe(types.length)
  })
})

// ── listActiveModules ─────────────────────────────────────────────────────────

describe('listActiveModules', () => {
  it('only returns modules with status active', () => {
    const active = listActiveModules()
    for (const m of active) {
      expect(m.status).toBe('active')
    }
  })

  it('includes the passport module', () => {
    const types = listActiveModules().map(m => m.documentType)
    expect(types).toContain('ua_internal_passport_booklet')
  })

  it('does NOT include birth certificate (demoted to draft 2026-05-09)', () => {
    const types = listActiveModules().map(m => m.documentType)
    expect(types).not.toContain('ua_birth_certificate')
  })

  it('does NOT include marriage certificate (demoted to draft 2026-05-09)', () => {
    const types = listActiveModules().map(m => m.documentType)
    expect(types).not.toContain('ua_marriage_certificate')
  })

  it('does NOT include divorce certificate (demoted to draft 2026-05-09)', () => {
    const types = listActiveModules().map(m => m.documentType)
    expect(types).not.toContain('ua_divorce_certificate')
  })

  it('does NOT include the manualReview module', () => {
    const types = listActiveModules().map(m => m.documentType)
    expect(types).not.toContain('manual_review_required')
  })
})

// ── isAutoDraftSupported ──────────────────────────────────────────────────────

describe('isAutoDraftSupported', () => {
  it('returns true for passport booklet (active + allowAutoPdf)', () => {
    expect(isAutoDraftSupported('ua_internal_passport_booklet')).toBe(true)
  })

  it('returns false for birth certificate (demoted to draft 2026-05-09)', () => {
    expect(isAutoDraftSupported('ua_birth_certificate')).toBe(false)
  })

  it('returns false for manual_review_required', () => {
    expect(isAutoDraftSupported('manual_review_required')).toBe(false)
  })

  it('returns false for marriage certificate (demoted to draft 2026-05-09)', () => {
    expect(isAutoDraftSupported('ua_marriage_certificate')).toBe(false)
  })

  it('returns false for divorce certificate (demoted to draft 2026-05-09)', () => {
    expect(isAutoDraftSupported('ua_divorce_certificate')).toBe(false)
  })

  it('returns false for truly unknown type', () => {
    expect(isAutoDraftSupported('ua_unknown_doc_xyz')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isAutoDraftSupported('')).toBe(false)
  })
})

// ── getFallbackModule ─────────────────────────────────────────────────────────

describe('getFallbackModule', () => {
  it('returns the manualReview module', () => {
    expect(getFallbackModule()).toBe(manualReviewModule)
  })

  it('has allowAutoPdf = false', () => {
    expect(getFallbackModule().reviewPolicy.allowAutoPdf).toBe(false)
  })

  it('has status manual_only', () => {
    expect(getFallbackModule().status).toBe('manual_only')
  })
})

// ── classifyToModule ──────────────────────────────────────────────────────────

describe('classifyToModule', () => {
  it('returns passport module for exact type at high confidence', () => {
    const m = classifyToModule('ua_internal_passport_booklet', 1.0)
    expect(m).toBe(passportBookletModule)
  })

  it('returns manualReview when confidence < 0.85', () => {
    const m = classifyToModule('ua_internal_passport_booklet', 0.84)
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReview exactly at threshold (< not ≤)', () => {
    // 0.85 is the threshold; exactly 0.85 should pass
    const m = classifyToModule('ua_internal_passport_booklet', 0.85)
    expect(m).toBe(passportBookletModule)
  })

  it('returns manualReview for unknown type even at high confidence', () => {
    const m = classifyToModule('unknown_doc_xyz', 1.0)
    expect(m).toBe(manualReviewModule)
  })

  it('defaults to confidence 1.0 when not provided', () => {
    const m = classifyToModule('ua_internal_passport_booklet')
    expect(m).toBe(passportBookletModule)
  })

  it('returns manualReviewModule for ua_birth_certificate (demoted to draft 2026-05-09)', () => {
    const m = classifyToModule('ua_birth_certificate', 1.0)
    expect(m).toBe(manualReviewModule)
  })
})

// ── getRegisteredDocumentTypes ────────────────────────────────────────────────

describe('getRegisteredDocumentTypes', () => {
  it('returns an array of strings', () => {
    const types = getRegisteredDocumentTypes()
    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBeGreaterThan(0)
    for (const t of types) {
      expect(typeof t).toBe('string')
    }
  })

  it('includes all expected document types', () => {
    const types = getRegisteredDocumentTypes()
    expect(types).toContain('ua_internal_passport_booklet')
    expect(types).toContain('ua_birth_certificate')
    expect(types).toContain('ua_marriage_certificate')
    expect(types).toContain('ua_divorce_certificate')
    expect(types).toContain('manual_review_required')
  })
})

// ── Safety invariants ─────────────────────────────────────────────────────────

describe('registry safety invariants', () => {
  it('every registered module has a non-empty documentType', () => {
    for (const m of listDocumentModules()) {
      expect(m.documentType.length).toBeGreaterThan(0)
    }
  })

  it('every registered module has a defined reviewPolicy', () => {
    for (const m of [...listDocumentModules(), manualReviewModule]) {
      expect(m.reviewPolicy).toBeDefined()
      expect(typeof m.reviewPolicy.allowAutoPdf).toBe('boolean')
    }
  })

  it('no non-active module allows auto-PDF', () => {
    const nonActive = listDocumentModules().filter(m => m.status !== 'active')
    for (const m of nonActive) {
      expect(m.reviewPolicy.allowAutoPdf).toBe(false)
    }
  })

  it('manualReview module always has allowAutoPdf=false', () => {
    expect(manualReviewModule.reviewPolicy.allowAutoPdf).toBe(false)
  })
})
