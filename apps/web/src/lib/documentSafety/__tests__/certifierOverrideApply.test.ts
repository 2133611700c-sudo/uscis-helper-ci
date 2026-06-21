/**
 * certifierOverrideApply.test.ts — stub verification.
 * Certifier-authority logic removed (operator-flow supersedes). Module is a no-op:
 * always returns fields untouched, block null.
 */
import { describe, it, expect } from 'vitest'
import { applyCertifierOverrides, type FieldWithMaybeOverride } from '../certifierOverrideApply'

const ctx = {
  enabled: true,
  docType: 'ua_international_passport',
  documentClass: 'internal_passport_booklet',
  sessionId: 'sess-1',
  timestampUtc: '2026-06-10T20:00:00.000Z',
}

describe('applyCertifierOverrides — operator-flow stub', () => {
  it('always returns block null', async () => {
    const fields: FieldWithMaybeOverride[] = [{ field: 'given_name', normalized_value: 'Ivan' }]
    const out = await applyCertifierOverrides(fields, ctx)
    expect(out.block).toBeNull()
  })

  it('returns fields reference unchanged', async () => {
    const fields: FieldWithMaybeOverride[] = [{ field: 'surname', normalized_value: 'Ivanenko', review_required: true }]
    const before = JSON.stringify(fields)
    const out = await applyCertifierOverrides(fields, ctx)
    expect(JSON.stringify(out.fields)).toBe(before)
  })

  it('no-op when enabled is false too', async () => {
    const fields: FieldWithMaybeOverride[] = [{ field: 'dob', normalized_value: '01.01.1990' }]
    const out = await applyCertifierOverrides(fields, { ...ctx, enabled: false })
    expect(out.block).toBeNull()
    expect(out.fields).toHaveLength(1)
  })
})
