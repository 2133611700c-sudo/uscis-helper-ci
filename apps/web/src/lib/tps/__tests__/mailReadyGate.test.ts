import { describe, it, expect } from 'vitest'
import { runMailReadyGate } from '../mailReadyGate'
import type { TPSAnswers } from '../answers'

const COMPLETE: Partial<TPSAnswers> = {
  family_name: 'Testenko',
  given_name: 'Ivan',
  dob: '1990-01-01',
  sex: 'M',
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  passport_number: 'FA000000',
  passport_expiration_date: '2030-01-01',
  us_address_street: '1213 Gordon St',
  us_address_city: 'Los Angeles',
  us_address_state: 'CA',
  us_address_zip: '90038',
  daytime_phone: '2133611700',
  email: 'test@example.com',
  last_entry_date: '2022-09-09',
  filing_path: 'initial',
  marital_status: 'single',       // P2 FIX: now required by gate
  part7_reviewed: true,            // P1 FIX: now required by gate
}

describe('mailReadyGate', () => {
  it('passes when all required fields present', () => {
    const result = runMailReadyGate(COMPLETE)
    expect(result.mail_ready).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })

  it('blocks on missing required field', () => {
    const { family_name, ...missing } = COMPLETE
    const result = runMailReadyGate(missing)
    expect(result.mail_ready).toBe(false)
    expect(result.blockers.some(b => b.field === 'family_name')).toBe(true)
  })

  it('blocks on invalid phone', () => {
    const result = runMailReadyGate({ ...COMPLETE, daytime_phone: '123' })
    expect(result.mail_ready).toBe(false)
    expect(result.blockers.some(b => b.reason === 'invalid_phone_format')).toBe(true)
  })

  it('blocks on invalid email', () => {
    const result = runMailReadyGate({ ...COMPLETE, email: 'nope' })
    expect(result.mail_ready).toBe(false)
    expect(result.blockers.some(b => b.reason === 'invalid_email')).toBe(true)
  })

  it('blocks on unresolved spelling conflict', () => {
    const result = runMailReadyGate(COMPLETE, [
      { field: 'family_name', reason: 'TESTENKO vs Testinko' },
    ])
    expect(result.mail_ready).toBe(false)
    expect(result.blockers.some(b => b.reason === 'controlling_spelling_conflict')).toBe(true)
  })

  it('blocks on very low OCR confidence', () => {
    const result = runMailReadyGate(COMPLETE, undefined, [
      { field: 'dob', confidence: 0.3 },
    ])
    expect(result.mail_ready).toBe(false)
  })

  it('warns but does not block on missing recommended field', () => {
    const result = runMailReadyGate(COMPLETE)
    // middle_name is recommended but not required
    expect(result.warnings.some(w => w.field === 'middle_name')).toBe(true)
    expect(result.mail_ready).toBe(true) // warnings don't block
  })

  it('provides user messages in 3 languages', () => {
    const { family_name, ...missing } = COMPLETE
    const result = runMailReadyGate(missing)
    const blocker = result.blockers.find(b => b.field === 'family_name')!
    expect(blocker.user_message.en).toBeTruthy()
    expect(blocker.user_message.ru).toBeTruthy()
    expect(blocker.user_message.uk).toBeTruthy()
  })
})
