/**
 * PacketIdentityAnchor Tests — Messenginfo v6.0
 *
 * Tests createEmptyAnchor, hasHigherOrEqualPriority, normalizeLatinNameForComparison,
 * mergeIdentityIntoAnchor, and checkAnchorReadiness.
 */
import { describe, it, expect } from 'vitest'
import {
  createEmptyAnchor,
  hasHigherOrEqualPriority,
  normalizeLatinNameForComparison,
  mergeIdentityIntoAnchor,
  checkAnchorReadiness,
  IDENTITY_ANCHOR_PRIORITY,
  type MergeIdentityInput,
} from '../packetIdentityAnchor'

// ── IDENTITY_ANCHOR_PRIORITY ──────────────────────────────────────────────────

describe('IDENTITY_ANCHOR_PRIORITY', () => {
  it('has 4 entries', () => {
    expect(IDENTITY_ANCHOR_PRIORITY).toHaveLength(4)
  })

  it('ua_international_passport is first (highest priority)', () => {
    expect(IDENTITY_ANCHOR_PRIORITY[0]).toBe('ua_international_passport')
  })

  it('ua_id_card is second', () => {
    expect(IDENTITY_ANCHOR_PRIORITY[1]).toBe('ua_id_card')
  })

  it('user_override is last (lowest priority)', () => {
    expect(IDENTITY_ANCHOR_PRIORITY[3]).toBe('user_override')
  })
})

// ── createEmptyAnchor ─────────────────────────────────────────────────────────

describe('createEmptyAnchor', () => {
  it('creates anchor with the given packetId', () => {
    const a = createEmptyAnchor('pkt-001')
    expect(a.packetId).toBe('pkt-001')
  })

  it('creates anchor with all name fields null', () => {
    const a = createEmptyAnchor('pkt-001')
    expect(a.surnameLatin).toBeNull()
    expect(a.givenNamesLatin).toBeNull()
    expect(a.surnameCyrillic).toBeNull()
    expect(a.givenNamesCyrillic).toBeNull()
    expect(a.patronymicCyrillic).toBeNull()
  })

  it('creates anchor with no conflict flags set', () => {
    const a = createEmptyAnchor('pkt-001')
    expect(a.mrzMismatchDetected).toBe(false)
    expect(a.latinNameConflict).toBe(false)
    expect(a.dateOfBirthConflict).toBe(false)
    expect(a.reviewCleared).toBe(false)
  })

  it('creates anchor with empty contributingDocuments', () => {
    const a = createEmptyAnchor('pkt-001')
    expect(Object.keys(a.contributingDocuments)).toHaveLength(0)
  })

  it('creates anchor with null document numbers', () => {
    const a = createEmptyAnchor('pkt-001')
    expect(a.internationalPassportNumber).toBeNull()
    expect(a.idCardDocumentNumber).toBeNull()
  })
})

// ── hasHigherOrEqualPriority ──────────────────────────────────────────────────

describe('hasHigherOrEqualPriority', () => {
  it('international passport > id_card', () => {
    expect(hasHigherOrEqualPriority('ua_international_passport', 'ua_id_card')).toBe(true)
  })

  it('international passport > booklet', () => {
    expect(hasHigherOrEqualPriority('ua_international_passport', 'ua_internal_passport_booklet')).toBe(true)
  })

  it('international passport > user_override', () => {
    expect(hasHigherOrEqualPriority('ua_international_passport', 'user_override')).toBe(true)
  })

  it('id_card < international_passport (not higher)', () => {
    expect(hasHigherOrEqualPriority('ua_id_card', 'ua_international_passport')).toBe(false)
  })

  it('same source has equal priority', () => {
    expect(hasHigherOrEqualPriority('ua_id_card', 'ua_id_card')).toBe(true)
    expect(hasHigherOrEqualPriority('ua_international_passport', 'ua_international_passport')).toBe(true)
  })

  it('booklet < id_card', () => {
    expect(hasHigherOrEqualPriority('ua_internal_passport_booklet', 'ua_id_card')).toBe(false)
  })
})

// ── normalizeLatinNameForComparison ───────────────────────────────────────────

describe('normalizeLatinNameForComparison', () => {
  it('uppercases the string', () => {
    expect(normalizeLatinNameForComparison('Kovalenko')).toBe('KOVALENKO')
  })

  it('replaces hyphens with spaces', () => {
    expect(normalizeLatinNameForComparison('KOVAL-ENKO')).toBe('KOVAL ENKO')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeLatinNameForComparison('OLEKSII  MYKHAILO')).toBe('OLEKSII MYKHAILO')
  })

  it('trims leading and trailing whitespace', () => {
    expect(normalizeLatinNameForComparison('  KOVALENKO  ')).toBe('KOVALENKO')
  })

  it('treats hyphenated and spaced versions as equal', () => {
    const a = normalizeLatinNameForComparison('KOVAL-ENKO')
    const b = normalizeLatinNameForComparison('KOVAL ENKO')
    expect(a).toBe(b)
  })
})

// ── mergeIdentityIntoAnchor ───────────────────────────────────────────────────

function makePassportInput(overrides: Partial<MergeIdentityInput> = {}): MergeIdentityInput {
  return {
    sessionId: 'sess-001',
    documentType: 'ua_international_passport',
    source: 'ua_international_passport',
    surnameLatin: 'KOVALENKO',
    givenNamesLatin: 'OLEKSII',
    surnameCyrillic: 'КОВАЛЕНКО',
    givenNamesCyrillic: 'ОЛЕКСІЙ',
    patronymicCyrillic: 'ІВАНОВИЧ',
    dateOfBirth: '3 January 1991',
    internationalPassportNumber: 'FC1234567',
    ...overrides,
  }
}

describe('mergeIdentityIntoAnchor — first document', () => {
  it('populates surnameLatin from first international passport', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.surnameLatin).toBe('KOVALENKO')
  })

  it('populates givenNamesLatin', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.givenNamesLatin).toBe('OLEKSII')
  })

  it('sets latinNameSource to ua_international_passport', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.latinNameSource).toBe('ua_international_passport')
  })

  it('populates dateOfBirth', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.dateOfBirth).toBe('3 January 1991')
  })

  it('populates internationalPassportNumber', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.internationalPassportNumber).toBe('FC1234567')
  })

  it('adds sessionId to contributingDocuments', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.contributingDocuments['sess-001']).toBe('ua_international_passport')
  })

  it('sets no conflict flags when first document', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.latinNameConflict).toBe(false)
    expect(merged.dateOfBirthConflict).toBe(false)
  })
})

describe('mergeIdentityIntoAnchor — priority rules', () => {
  it('id_card surname does NOT overwrite international passport surname (lower priority)', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ surnameLatin: 'KOVALENKO' }))
    const idCardInput: MergeIdentityInput = {
      sessionId: 'sess-002',
      documentType: 'ua_id_card',
      source: 'ua_id_card',
      surnameLatin: 'DIFFERENT',
    }
    const merged = mergeIdentityIntoAnchor(a, idCardInput)
    // ID card is lower priority — should NOT overwrite surname
    expect(merged.surnameLatin).toBe('KOVALENKO')
    // But conflict should be detected
    expect(merged.latinNameConflict).toBe(true)
  })

  it('id_card does overwrite booklet (higher priority)', () => {
    let a = createEmptyAnchor('pkt-001')
    const bookletInput: MergeIdentityInput = {
      sessionId: 'sess-000',
      documentType: 'ua_internal_passport_booklet',
      source: 'ua_internal_passport_booklet',
      surnameLatin: 'KOVALENKO',
    }
    a = mergeIdentityIntoAnchor(a, bookletInput)
    const idCardInput: MergeIdentityInput = {
      sessionId: 'sess-001',
      documentType: 'ua_id_card',
      source: 'ua_id_card',
      surnameLatin: 'KOVALENKO',  // same — no conflict
    }
    const merged = mergeIdentityIntoAnchor(a, idCardInput)
    expect(merged.surnameLatin).toBe('KOVALENKO')
    expect(merged.latinNameSource).toBe('ua_id_card')
    expect(merged.latinNameConflict).toBe(false)
  })

  it('international passport overwrites id_card (higher priority)', () => {
    let a = createEmptyAnchor('pkt-001')
    const idCardInput: MergeIdentityInput = {
      sessionId: 'sess-001',
      documentType: 'ua_id_card',
      source: 'ua_id_card',
      surnameLatin: 'FIRST',
    }
    a = mergeIdentityIntoAnchor(a, idCardInput)
    // Now merge international passport — same name, no conflict
    const merged = mergeIdentityIntoAnchor(a, makePassportInput({ surnameLatin: 'FIRST' }))
    expect(merged.surnameLatin).toBe('FIRST')
    expect(merged.latinNameSource).toBe('ua_international_passport')
  })
})

describe('mergeIdentityIntoAnchor — conflict detection', () => {
  it('detects latin name conflict when same-priority sources disagree', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ surnameLatin: 'KOVALENKO' }))
    // Second international passport with different surname
    const merged = mergeIdentityIntoAnchor(a, makePassportInput({
      sessionId: 'sess-002',
      surnameLatin: 'KOWALENKO',
    }))
    expect(merged.latinNameConflict).toBe(true)
    expect(merged.reviewCleared).toBe(false)
  })

  it('no conflict when normalized names match (hyphen vs space)', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ surnameLatin: 'KOVAL-ENKO' }))
    const merged = mergeIdentityIntoAnchor(a, makePassportInput({
      sessionId: 'sess-002',
      surnameLatin: 'KOVAL ENKO',
    }))
    expect(merged.latinNameConflict).toBe(false)
  })

  it('detects date of birth conflict', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ dateOfBirth: '3 January 1991' }))
    const merged = mergeIdentityIntoAnchor(a, makePassportInput({
      sessionId: 'sess-002',
      dateOfBirth: '4 January 1991',
    }))
    expect(merged.dateOfBirthConflict).toBe(true)
    expect(merged.reviewCleared).toBe(false)
  })

  it('sets mrzMismatchDetected when input has mrzMismatchDetected=true', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput({ mrzMismatchDetected: true }))
    expect(merged.mrzMismatchDetected).toBe(true)
    expect(merged.reviewCleared).toBe(false)
  })

  it('mrzMismatchDetected is sticky (stays true once set)', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ mrzMismatchDetected: true }))
    // Second merge without mrzMismatchDetected
    const merged = mergeIdentityIntoAnchor(a, makePassportInput({
      sessionId: 'sess-002',
      mrzMismatchDetected: false,
    }))
    expect(merged.mrzMismatchDetected).toBe(true)
  })
})

describe('mergeIdentityIntoAnchor — Cyrillic name handling', () => {
  it('populates Cyrillic fields', () => {
    const a = createEmptyAnchor('pkt-001')
    const merged = mergeIdentityIntoAnchor(a, makePassportInput())
    expect(merged.surnameCyrillic).toBe('КОВАЛЕНКО')
    expect(merged.givenNamesCyrillic).toBe('ОЛЕКСІЙ')
    expect(merged.patronymicCyrillic).toBe('ІВАНОВИЧ')
  })

  it('overwrites Cyrillic fields on subsequent merge (no priority check)', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ surnameCyrillic: 'ПЕРШЕ' }))
    const merged = mergeIdentityIntoAnchor(a, makePassportInput({
      sessionId: 'sess-002',
      surnameCyrillic: 'ДРУГЕ',
    }))
    expect(merged.surnameCyrillic).toBe('ДРУГЕ')
  })
})

// ── checkAnchorReadiness ──────────────────────────────────────────────────────

describe('checkAnchorReadiness', () => {
  it('returns ready=false for empty anchor', () => {
    const a = createEmptyAnchor('pkt-001')
    const r = checkAnchorReadiness(a)
    expect(r.ready).toBe(false)
    expect(r.blockers).toContain('no_identity_document_processed')
  })

  it('returns ready=true after one document with no conflicts', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput())
    const r = checkAnchorReadiness(a)
    expect(r.ready).toBe(true)
    expect(r.blockers).toHaveLength(0)
  })

  it('returns ready=false when mrz mismatch detected', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ mrzMismatchDetected: true }))
    const r = checkAnchorReadiness(a)
    expect(r.ready).toBe(false)
    expect(r.blockers).toContain('mrz_mismatch_requires_review')
  })

  it('returns ready=false when latin name conflict unresolved', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ surnameLatin: 'KOVALENKO' }))
    a = mergeIdentityIntoAnchor(a, makePassportInput({
      sessionId: 'sess-002',
      surnameLatin: 'DIFFERENT',
    }))
    const r = checkAnchorReadiness(a)
    expect(r.ready).toBe(false)
    expect(r.blockers).toContain('latin_name_conflict_requires_resolution')
  })

  it('returns ready=false when date of birth conflict unresolved', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ dateOfBirth: '3 January 1991' }))
    a = mergeIdentityIntoAnchor(a, makePassportInput({
      sessionId: 'sess-002',
      dateOfBirth: '4 January 1991',
    }))
    const r = checkAnchorReadiness(a)
    expect(r.ready).toBe(false)
    expect(r.blockers).toContain('date_of_birth_conflict_requires_resolution')
  })

  it('returns ready=true when reviewCleared=true overrides mismatch flag', () => {
    let a = createEmptyAnchor('pkt-001')
    a = mergeIdentityIntoAnchor(a, makePassportInput({ mrzMismatchDetected: true }))
    a = { ...a, reviewCleared: true }
    const r = checkAnchorReadiness(a)
    expect(r.ready).toBe(true)
  })
})
