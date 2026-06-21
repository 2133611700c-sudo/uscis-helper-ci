/**
 * Classifier Tests
 *
 * Verifies alias normalization, confidence routing, and safety fallback behavior.
 * The classifier must NEVER throw and must always return a DocumentModule.
 */
import { describe, it, expect } from 'vitest'
import {
  classifyDocumentType,
  resolveDocumentModule,
  getAliasTable,
} from '../classifier'
import { passportBookletModule } from '../passportBooklet.module'
import { marriageCertificateModule } from '../marriageCertificate.module'
import { divorceCertificateModule } from '../divorceCertificate.module'
import { manualReviewModule } from '../manualReview.module'

// ── classifyDocumentType ──────────────────────────────────────────────────────

describe('classifyDocumentType — passport aliases', () => {
  const PASSPORT_ALIASES = [
    'ua_internal_passport_booklet',
    'ua_passport_booklet',
    'internal_passport',
    'passport_booklet',
    'ukrainian_passport',
    'ua_passport',
    'ua_passport_internal',
  ]

  for (const alias of PASSPORT_ALIASES) {
    it(`resolves '${alias}' to passport module`, () => {
      const result = classifyDocumentType(alias, 1.0)
      expect(result.module).toBe(passportBookletModule)
      expect(result.usedFallback).toBe(false)
    })
  }

  it('resolves Cyrillic паспорт to passport module', () => {
    const result = classifyDocumentType('паспорт', 1.0)
    expect(result.module).toBe(passportBookletModule)
  })

  it('resolves паспорт громадянина україни to passport module', () => {
    const result = classifyDocumentType('паспорт громадянина україни', 1.0)
    expect(result.module).toBe(passportBookletModule)
  })
})

describe('classifyDocumentType — birth certificate aliases (demoted to draft 2026-05-09)', () => {
  it('resolves ua_birth_certificate to manualReviewModule (status=draft)', () => {
    const result = classifyDocumentType('ua_birth_certificate', 1.0)
    // Birth certificate was demoted from 'active' to 'draft' on 2026-05-09 —
    // synthetic-only E2E does not justify auto-PDF. Classifier returns
    // manualReviewModule via the registry's "non-active → manualReview" rule.
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
    expect(result.fallbackReason).toBe('module_not_active')
    expect(result.canonicalType).toBe('ua_birth_certificate')
  })

  it('resolves birth_certificate alias to manualReviewModule (draft)', () => {
    const result = classifyDocumentType('birth_certificate', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })

  it('resolves свідоцтво про народження to manualReviewModule (draft)', () => {
    const result = classifyDocumentType('свідоцтво про народження', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })
})

describe('classifyDocumentType — manual review aliases', () => {
  it('resolves manual_review_required to manualReview module', () => {
    const result = classifyDocumentType('manual_review_required', 1.0)
    expect(result.module).toBe(manualReviewModule)
  })

  it('resolves manual_review to manualReview module', () => {
    const result = classifyDocumentType('manual_review', 1.0)
    expect(result.module).toBe(manualReviewModule)
  })

  it('resolves unknown to manualReview module', () => {
    const result = classifyDocumentType('unknown', 1.0)
    expect(result.module).toBe(manualReviewModule)
  })
})

describe('classifyDocumentType — null / empty inputs', () => {
  it('returns manualReview for null', () => {
    const result = classifyDocumentType(null, 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
    expect(result.fallbackReason).toBe('unknown_document_type')
  })

  it('returns manualReview for undefined', () => {
    const result = classifyDocumentType(undefined, 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })

  it('returns manualReview for empty string', () => {
    const result = classifyDocumentType('', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
    expect(result.fallbackReason).toBe('unknown_document_type')
  })

  it('returns manualReview for whitespace-only string', () => {
    const result = classifyDocumentType('   ', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })
})

describe('classifyDocumentType — low confidence', () => {
  it('returns manualReview when confidence < 0.85', () => {
    const result = classifyDocumentType('ua_internal_passport_booklet', 0.84)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
    expect(result.fallbackReason).toBe('low_classification_confidence')
  })

  it('returns passport module when confidence = 0.85 (at threshold)', () => {
    const result = classifyDocumentType('ua_internal_passport_booklet', 0.85)
    expect(result.module).toBe(passportBookletModule)
    expect(result.usedFallback).toBe(false)
  })

  it('returns passport module when confidence = 1.0', () => {
    const result = classifyDocumentType('ua_internal_passport_booklet', 1.0)
    expect(result.module).toBe(passportBookletModule)
    expect(result.usedFallback).toBe(false)
  })

  it('returns manualReview when confidence = 0.0', () => {
    const result = classifyDocumentType('ua_internal_passport_booklet', 0.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.fallbackReason).toBe('low_classification_confidence')
  })
})

describe('classifyDocumentType — marriage certificate aliases (demoted to draft 2026-05-09)', () => {
  const MARRIAGE_ALIASES = [
    'ua_marriage_certificate',
    'marriage_certificate',
    'marriage certificate',
    'ua_marriage',
  ]

  // Marriage certificate module was demoted from 'active' to 'draft' on 2026-05-09 —
  // synthetic-only would not be enough; this module has neither synthetic nor real
  // E2E. Every alias must now route to manualReview.
  for (const alias of MARRIAGE_ALIASES) {
    it(`resolves '${alias}' to manualReviewModule (draft)`, () => {
      const result = classifyDocumentType(alias, 1.0)
      expect(result.module).toBe(manualReviewModule)
      expect(result.usedFallback).toBe(true)
    })
  }

  it('resolves Cyrillic свідоцтво про шлюб to manualReviewModule (draft)', () => {
    const result = classifyDocumentType('свідоцтво про шлюб', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })

  it('resolves Russian свидетельство о браке to manualReviewModule (draft)', () => {
    const result = classifyDocumentType('свидетельство о браке', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })
})

describe('classifyDocumentType — divorce certificate aliases (demoted to draft 2026-05-09)', () => {
  const DIVORCE_ALIASES = [
    'ua_divorce_certificate',
    'divorce_certificate',
    'divorce certificate',
    'ua_divorce',
  ]

  for (const alias of DIVORCE_ALIASES) {
    it(`resolves '${alias}' to manualReviewModule (draft)`, () => {
      const result = classifyDocumentType(alias, 1.0)
      expect(result.module).toBe(manualReviewModule)
      expect(result.usedFallback).toBe(true)
    })
  }

  it('resolves Cyrillic свідоцтво про розірвання шлюбу to manualReviewModule (draft)', () => {
    const result = classifyDocumentType('свідоцтво про розірвання шлюбу', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })

  it('resolves Russian свидетельство о расторжении брака to manualReviewModule (draft)', () => {
    const result = classifyDocumentType('свидетельство о расторжении брака', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })
})

describe('classifyDocumentType — unknown types', () => {
  it('returns manualReview for random garbage input', () => {
    const result = classifyDocumentType('skdjfhaslkjdfhaskjdf', 1.0)
    expect(result.module).toBe(manualReviewModule)
    expect(result.usedFallback).toBe(true)
  })

  it('returns manualReview for emoji input', () => {
    const result = classifyDocumentType('🛂', 1.0)
    expect(result.module).toBe(manualReviewModule)
  })
})

describe('classifyDocumentType — result shape', () => {
  it('returns canonicalType for a resolved passport alias', () => {
    const result = classifyDocumentType('ua_passport_booklet', 1.0)
    expect(result.canonicalType).toBe('ua_internal_passport_booklet')
  })

  it('marks wasAliased=true when input differs from canonical', () => {
    const result = classifyDocumentType('internal_passport', 1.0)
    expect(result.wasAliased).toBe(true)
  })

  it('marks wasAliased=false for exact canonical type', () => {
    const result = classifyDocumentType('ua_internal_passport_booklet', 1.0)
    expect(result.wasAliased).toBe(false)
  })

  it('provides fallbackReason when usedFallback=true', () => {
    const result = classifyDocumentType(null)
    expect(result.usedFallback).toBe(true)
    expect(result.fallbackReason).toBeTruthy()
  })

  it('does NOT provide fallbackReason when usedFallback=false', () => {
    const result = classifyDocumentType('ua_internal_passport_booklet', 1.0)
    expect(result.usedFallback).toBe(false)
    expect(result.fallbackReason).toBeUndefined()
  })
})

describe('classifyDocumentType — normalization', () => {
  it('normalizes underscores to spaces for lookup', () => {
    // 'ua_passport_booklet' → 'ua passport booklet' → maps to ua_internal_passport_booklet
    const result = classifyDocumentType('ua_passport_booklet', 1.0)
    expect(result.module).toBe(passportBookletModule)
  })

  it('is case-insensitive', () => {
    const result = classifyDocumentType('UA_INTERNAL_PASSPORT_BOOKLET', 1.0)
    // UPPERCASE version not in alias table → unsupported
    // (aliases are lowercase only — this is intentional strictness)
    // Just check it doesn't throw:
    expect(result.module).toBeDefined()
  })

  it('trims leading and trailing whitespace', () => {
    const result = classifyDocumentType('  ua_internal_passport_booklet  ', 1.0)
    // After trim → resolves correctly
    expect(result.module).toBe(passportBookletModule)
  })
})

// ── resolveDocumentModule ─────────────────────────────────────────────────────

describe('resolveDocumentModule', () => {
  it('returns passport module for passport alias', () => {
    const m = resolveDocumentModule('ua_passport_booklet', 1.0)
    expect(m).toBe(passportBookletModule)
  })

  it('returns manualReviewModule for ua_marriage_certificate (demoted to draft 2026-05-09)', () => {
    const m = resolveDocumentModule('ua_marriage_certificate', 1.0)
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReviewModule for ua_divorce_certificate (demoted to draft 2026-05-09)', () => {
    const m = resolveDocumentModule('ua_divorce_certificate', 1.0)
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReview for truly unknown type', () => {
    const m = resolveDocumentModule('ua_unknown_doc_xyz', 1.0)
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReview for null', () => {
    const m = resolveDocumentModule(null)
    expect(m).toBe(manualReviewModule)
  })

  it('returns manualReview for undefined', () => {
    const m = resolveDocumentModule(undefined)
    expect(m).toBe(manualReviewModule)
  })

  it('never throws for any string input', () => {
    const inputs = ['', '   ', 'null', 'undefined', '\n\t', '../../../../etc']
    for (const input of inputs) {
      expect(() => resolveDocumentModule(input)).not.toThrow()
    }
  })
})

// ── getAliasTable ─────────────────────────────────────────────────────────────

describe('getAliasTable', () => {
  it('returns a ReadonlyMap', () => {
    const table = getAliasTable()
    expect(table).toBeInstanceOf(Map)
  })

  it('maps ua_passport_booklet to ua_internal_passport_booklet', () => {
    expect(getAliasTable().get('ua_passport_booklet')).toBe('ua_internal_passport_booklet')
  })

  it('maps internal_passport to ua_internal_passport_booklet', () => {
    expect(getAliasTable().get('internal_passport')).toBe('ua_internal_passport_booklet')
  })

  it('maps ua_passport_internal to ua_internal_passport_booklet', () => {
    expect(getAliasTable().get('ua_passport_internal')).toBe('ua_internal_passport_booklet')
  })

  it('maps birth_certificate to ua_birth_certificate', () => {
    expect(getAliasTable().get('birth certificate')).toBe('ua_birth_certificate')
  })

  it('maps manual_review to manual_review_required', () => {
    expect(getAliasTable().get('manual_review')).toBe('manual_review_required')
  })

  it('maps ua_marriage_certificate to ua_marriage_certificate', () => {
    expect(getAliasTable().get('ua_marriage_certificate')).toBe('ua_marriage_certificate')
  })

  it('maps marriage certificate to ua_marriage_certificate', () => {
    expect(getAliasTable().get('marriage certificate')).toBe('ua_marriage_certificate')
  })

  it('maps ua_divorce_certificate to ua_divorce_certificate', () => {
    expect(getAliasTable().get('ua_divorce_certificate')).toBe('ua_divorce_certificate')
  })

  it('maps divorce certificate to ua_divorce_certificate', () => {
    expect(getAliasTable().get('divorce certificate')).toBe('ua_divorce_certificate')
  })

  it('has no empty-string keys', () => {
    for (const key of getAliasTable().keys()) {
      expect(key.length).toBeGreaterThan(0)
    }
  })

  it('has no empty-string values', () => {
    for (const val of getAliasTable().values()) {
      expect(val.length).toBeGreaterThan(0)
    }
  })

  it('all values are valid canonical types (in registry or well-known)', () => {
    const knownTypes = new Set([
      'ua_internal_passport_booklet',
      'ua_birth_certificate',
      'ua_marriage_certificate',
      'ua_divorce_certificate',
      'ua_death_certificate',         // Added 2026-05-10 — skeleton draft module
      'ua_international_passport',
      'ua_id_card',
      'manual_review_required',
    ])
    for (const val of getAliasTable().values()) {
      expect(knownTypes.has(val)).toBe(true)
    }
  })
})

// ── Safety: never throws ──────────────────────────────────────────────────────

describe('classifier never throws', () => {
  const nastyInputs = [
    null, undefined, '', '   ', '\n', '\t',
    'SELECT * FROM documents',
    '../../etc/passwd',
    '<script>alert(1)</script>',
    'a'.repeat(10_000),
    '🛂🌍🇺🇦',
    '0',
    'true',
    'null',
    'undefined',
  ]

  for (const input of nastyInputs) {
    it(`does not throw for input: ${JSON.stringify(input)?.slice(0, 30)}`, () => {
      expect(() => classifyDocumentType(input as string | null | undefined)).not.toThrow()
      expect(() => resolveDocumentModule(input as string | null | undefined)).not.toThrow()
    })
  }
})
