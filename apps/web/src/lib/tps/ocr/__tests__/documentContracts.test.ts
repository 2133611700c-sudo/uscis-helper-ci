/**
 * Document Slot Contract firewall — unit tests.
 *
 * Locks down:
 *   - Forbidden fields are hard-rejected per slot (passport cannot
 *     produce a_number, ead cannot produce passport_expiration_date,
 *     etc.)
 *   - Allowed fields pass through unchanged.
 *   - slot_mismatch fires when Brain's document_type doesn't match
 *     what the slot expects.
 *   - Unknown slot returns UNKNOWN_SLOT for every field.
 *   - 'unknown' Brain classification does NOT trigger mismatch — the
 *     field-level filter alone is the safety net.
 */

import { describe, it, expect } from 'vitest'

import {
  applyContract,
  DOCUMENT_CONTRACTS,
  type ContractCheckResult,
} from '../documentContracts'

describe('applyContract — passport slot', () => {
  it('passes allowed passport fields through', () => {
    const r = applyContract(
      'passport',
      ['family_name', 'given_name', 'dob', 'passport_number', 'passport_expiration_date'],
      'passport',
    )
    expect(r.slot).toBe('passport')
    expect(r.slot_mismatch).toBe(false)
    expect(r.accepted_field_keys.sort()).toEqual(
      ['dob', 'family_name', 'given_name', 'passport_expiration_date', 'passport_number'],
    )
    expect(r.rejected_fields).toEqual([])
  })

  it('hard-rejects a_number on passport slot (the hallucination case)', () => {
    const r = applyContract('passport', ['family_name', 'a_number'], 'passport')
    expect(r.accepted_field_keys).toEqual(['family_name'])
    expect(r.rejected_fields).toContainEqual({
      field: 'a_number',
      reason: 'FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT',
    })
  })

  it('hard-rejects i94_admission_number on passport slot', () => {
    const r = applyContract('passport', ['i94_admission_number'], 'passport')
    expect(r.accepted_field_keys).toEqual([])
    expect(r.rejected_fields[0].reason).toBe('FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT')
  })

  it('flags slot_mismatch when EAD is uploaded into passport slot', () => {
    const r = applyContract('passport', ['family_name'], 'ead')
    expect(r.slot_mismatch).toBe(true)
    expect(r.detected_document_type).toBe('ead')
  })

  it('does NOT flag slot_mismatch when Brain returns "unknown"', () => {
    const r = applyContract('passport', ['family_name'], 'unknown')
    expect(r.slot_mismatch).toBe(false)
  })
})

describe('applyContract — i94 slot', () => {
  it('passes allowed I-94 fields', () => {
    const r = applyContract(
      'i94',
      ['i94_admission_number', 'last_entry_date', 'i94_class_of_admission'],
      'i94',
    )
    expect(r.accepted_field_keys.sort()).toEqual(
      ['i94_admission_number', 'i94_class_of_admission', 'last_entry_date'],
    )
    expect(r.rejected_fields).toEqual([])
  })

  it('rejects a_number on I-94 slot', () => {
    const r = applyContract('i94', ['a_number'], 'i94')
    expect(r.rejected_fields[0].reason).toBe('FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT')
  })

  it('flags slot_mismatch when passport is uploaded into I-94 slot', () => {
    const r = applyContract('i94', ['i94_admission_number'], 'passport')
    expect(r.slot_mismatch).toBe(true)
  })
})

describe('applyContract — booklet slot', () => {
  it('passes booklet DOB when parser/validator produced it', () => {
    const r = applyContract('booklet', ['family_name', 'dob', 'city_of_birth'], 'passport')
    expect(r.accepted_field_keys.sort()).toEqual(['city_of_birth', 'dob', 'family_name'])
    expect(r.rejected_fields).toEqual([])
    expect(r.slot_mismatch).toBe(false)
  })
})

describe('applyContract — ead slot', () => {
  it('passes a_number / category / expiration', () => {
    const r = applyContract(
      'ead',
      ['a_number', 'ead_category_on_card', 'ead_expiration_date'],
      'ead',
    )
    expect(r.accepted_field_keys.sort()).toEqual(
      ['a_number', 'ead_category_on_card', 'ead_expiration_date'],
    )
  })

  it('rejects passport_expiration_date on EAD slot', () => {
    const r = applyContract('ead', ['passport_expiration_date'], 'ead')
    expect(r.rejected_fields[0].reason).toBe('FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT')
  })

  it('rejects I-94 fields on EAD slot', () => {
    const r = applyContract(
      'ead',
      ['i94_admission_number', 'last_entry_date'],
      'ead',
    )
    expect(r.rejected_fields.map((x) => x.field).sort()).toEqual(
      ['i94_admission_number', 'last_entry_date'],
    )
  })

  it('flags slot_mismatch when passport is uploaded into EAD slot', () => {
    const r = applyContract('ead', ['a_number'], 'passport')
    expect(r.slot_mismatch).toBe(true)
  })
})

describe('applyContract — edge cases', () => {
  it('returns UNKNOWN_SLOT when slot id is missing', () => {
    const r = applyContract(null, ['family_name'], 'passport')
    expect(r.slot).toBe(null)
    expect(r.rejected_fields[0].reason).toBe('UNKNOWN_SLOT')
  })

  it('returns UNKNOWN_SLOT when slot id is unknown', () => {
    const r = applyContract('strange_slot', ['family_name'], 'passport')
    expect(r.slot).toBe(null)
    expect(r.rejected_fields[0].reason).toBe('UNKNOWN_SLOT')
  })

  it('rejects every passport-identity field on the photo slot', () => {
    const r = applyContract(
      'photo',
      ['family_name', 'dob', 'a_number'],
      'unknown',
    )
    expect(r.accepted_field_keys).toEqual([])
    expect(r.rejected_fields).toHaveLength(3)
  })

  it('tps_notice slot accepts a_number and address but rejects EAD/I-94', () => {
    const r = applyContract(
      'tps_notice',
      ['a_number', 'address', 'ead_category_on_card', 'i94_admission_number'],
      'i797',
    )
    expect(r.accepted_field_keys.sort()).toEqual(['a_number', 'address'])
    expect(r.rejected_fields.map((x) => x.field).sort()).toEqual(
      ['ead_category_on_card', 'i94_admission_number'],
    )
    expect(r.slot_mismatch).toBe(false)
  })
})

describe('DOCUMENT_CONTRACTS — invariant checks', () => {
  it('every slot has non-empty allowed and forbidden lists (except photo allowed)', () => {
    for (const slot of Object.keys(DOCUMENT_CONTRACTS) as Array<keyof typeof DOCUMENT_CONTRACTS>) {
      const c = DOCUMENT_CONTRACTS[slot]
      expect(c.slot).toBe(slot)
      // photo carries no extracted fields by design.
      if (slot !== 'photo') {
        expect(c.allowed_fields.length).toBeGreaterThan(0)
      }
      expect(c.forbidden_fields.length).toBeGreaterThan(0)
    }
  })

  it('a_number must be forbidden on the passport slot (regression lock)', () => {
    expect(DOCUMENT_CONTRACTS.passport.forbidden_fields).toContain('a_number')
  })

  it('passport_expiration_date must be forbidden on EAD/I-94 slots', () => {
    expect(DOCUMENT_CONTRACTS.ead.forbidden_fields).toContain('passport_expiration_date')
    expect(DOCUMENT_CONTRACTS.i94.forbidden_fields).toContain('passport_expiration_date')
  })

  it('result shape is ContractCheckResult', () => {
    const r: ContractCheckResult = applyContract('passport', ['family_name'], 'passport')
    expect(r).toHaveProperty('slot')
    expect(r).toHaveProperty('slot_mismatch')
    expect(r).toHaveProperty('accepted_field_keys')
    expect(r).toHaveProperty('rejected_fields')
  })
})
