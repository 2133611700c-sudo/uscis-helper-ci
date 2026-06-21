/**
 * canonicalValueUnresolved.test.ts — BUG C direct unit (Phase 2.0 bug-C fix).
 *
 * documentFieldReader: when toCanonicalValue() returns null (e.g. a date with no
 * iso_date) BUT the vision read has non-empty r.cyrillic, the field must NOT be
 * silently dropped — it is emitted with value=r.cyrillic, review_required=true,
 * and review_reasons containing 'canonical_value_unresolved'. When r.cyrillic is
 * ALSO empty there is nothing to emit and the field is dropped.
 *
 * Injected mock provider — no network, no PII. The mock reports primaryGeminiModel()
 * so the ADR-018 fallback-review guard does not add unrelated review reasons.
 */
import { describe, it, expect } from 'vitest'
import { readDocument } from '../documentFieldReader'
import { primaryGeminiModel } from '../providers/geminiVisionProvider'
import type { VisionProvider, VisionReadResult, VisionFieldRead } from '../types'

const IMG = Buffer.from('x')

function provider(fields: VisionFieldRead[]): VisionProvider {
  return {
    name: 'mock-gemini',
    readFields: async (): Promise<VisionReadResult> => ({
      ok: true, model: primaryGeminiModel(), ms: 5, fields,
    }),
  }
}

describe('BUG C — canonical_value_unresolved (no silent drop)', () => {
  it('date field with cyrillic but NO iso_date → emitted as review, value = cyrillic', async () => {
    const res = await readDocument(IMG, 'image/jpeg', 'ua_internal_passport_booklet', {
      provider: provider([
        { field: 'dob', cyrillic: '01 січня 1990', iso_date: null, can_read: true, confidence: 0.9, reason: '' },
      ]),
    })
    expect(res.ok).toBe(true)
    const dob = res.fields.find((f) => f.field === 'dob')
    expect(dob).toBeDefined()
    expect(dob!.value).toBe('01 січня 1990')        // raw cyrillic kept as fallback
    expect(dob!.raw_cyrillic).toBe('01 січня 1990')
    expect(dob!.review_required).toBe(true)
    expect(dob!.review_reasons ?? []).toContain('canonical_value_unresolved')
  })

  it('date field with NO iso_date AND empty cyrillic → field dropped (nothing to emit)', async () => {
    const res = await readDocument(IMG, 'image/jpeg', 'ua_internal_passport_booklet', {
      provider: provider([
        { field: 'dob', cyrillic: '', iso_date: null, can_read: true, confidence: 0.9, reason: '' },
      ]),
    })
    expect(res.ok).toBe(true)
    expect(res.fields.find((f) => f.field === 'dob')).toBeUndefined()
  })

  it('name field that transliterates fine → NO canonical_value_unresolved', async () => {
    const res = await readDocument(IMG, 'image/jpeg', 'ua_internal_passport_booklet', {
      provider: provider([
        { field: 'family_name', cyrillic: 'Шевченко', iso_date: null, can_read: true, confidence: 0.9, reason: '' },
      ]),
    })
    const fam = res.fields.find((f) => f.field === 'family_name')
    expect(fam).toBeDefined()
    expect(fam!.value && fam!.value.length).toBeGreaterThan(0)        // resolved to KMU-55 Latin
    expect(fam!.review_reasons ?? []).not.toContain('canonical_value_unresolved')
  })

  it('a valid iso_date resolves normally → NO unresolved reason', async () => {
    const res = await readDocument(IMG, 'image/jpeg', 'ua_internal_passport_booklet', {
      provider: provider([
        { field: 'dob', cyrillic: '01.01.1990', iso_date: '1990-01-01', can_read: true, confidence: 0.9, reason: '' },
      ]),
    })
    const dob = res.fields.find((f) => f.field === 'dob')
    expect(dob).toBeDefined()
    expect(dob!.review_reasons ?? []).not.toContain('canonical_value_unresolved')
  })
})
