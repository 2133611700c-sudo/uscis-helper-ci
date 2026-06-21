/**
 * dateRoleGuard.test.ts — deterministic date safety (conflation + sequence).
 * Synthetic dates only.
 */
import { describe, it, expect } from 'vitest'
import { applyDateRoleGuard, type DateGuardField } from '../dateRoleGuard'

describe('applyDateRoleGuard — role conflation', () => {
  it('same date in dob and date_of_issue → both review + date_role_conflict', () => {
    const fields: DateGuardField[] = [
      { field: 'dob', kind: 'ai_vision', value: '1990-07-25', review_required: false },
      { field: 'date_of_issue', kind: 'ai_vision', value: '1990-07-25', review_required: false },
      { field: 'child_surname', kind: 'ai_vision', value: 'Ivanenko', review_required: false },
    ]
    const out = applyDateRoleGuard(fields)
    expect(out.conflicts).toContain('date_role_conflict')
    expect(out.fields.find((f) => f.field === 'dob')!.review_required).toBe(true)
    expect(out.fields.find((f) => f.field === 'date_of_issue')!.review_required).toBe(true)
    expect(out.fields.find((f) => f.field === 'child_surname')!.review_required).toBe(false)
  })

  it('distinct dates → no conflict', () => {
    const out = applyDateRoleGuard([
      { field: 'dob', kind: 'ai_vision', value: '1990-06-14', review_required: false },
      { field: 'date_of_issue', kind: 'ai_vision', value: '1990-08-01', review_required: false },
    ])
    expect(out.conflicts).toEqual([])
    expect(out.fields.every((f) => f.review_required === false)).toBe(true)
  })
})

describe('applyDateRoleGuard — sequence conflict', () => {
  it('issue date before birth date → both review + date_sequence_conflict', () => {
    const out = applyDateRoleGuard([
      { field: 'dob', kind: 'ai_vision', value: '1990-06-14', review_required: false },
      { field: 'date_of_issue', kind: 'ai_vision', value: '1990-05-01', review_required: false }, // earlier!
    ])
    expect(out.conflicts).toContain('date_sequence_conflict')
    expect(out.fields.find((f) => f.field === 'dob')!.review_required).toBe(true)
  })

  it('issue after birth → fine', () => {
    const out = applyDateRoleGuard([
      { field: 'dob', value: '1990-06-14', kind: 'ai_vision' },
      { field: 'date_of_issue', value: '2010-03-02', kind: 'ai_vision' },
    ])
    expect(out.conflicts).toEqual([])
  })
})

describe('applyDateRoleGuard — safety contract', () => {
  it('never lowers an existing review flag', () => {
    const out = applyDateRoleGuard([
      { field: 'dob', value: '1990-06-14', kind: 'ai_vision', review_required: true },
      { field: 'date_of_issue', value: '2010-03-02', kind: 'ai_vision', review_required: true },
    ])
    expect(out.fields.every((f) => f.review_required === true)).toBe(true)
  })

  it('never edits a value', () => {
    const out = applyDateRoleGuard([
      { field: 'dob', value: '1990-07-25', kind: 'ai_vision' },
      { field: 'date_of_issue', value: '1990-07-25', kind: 'ai_vision' },
    ])
    expect(out.fields.find((f) => f.field === 'dob')!.value).toBe('1990-07-25')
  })

  it('fewer than 2 dates → no-op', () => {
    const out = applyDateRoleGuard([{ field: 'dob', value: '1990-06-14', kind: 'ai_vision' }])
    expect(out.conflicts).toEqual([])
  })
})
