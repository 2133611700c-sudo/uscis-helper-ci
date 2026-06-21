/**
 * fallbackModelReview.test.ts — ADR-018 model matrix guard.
 *
 * Only the configured primary Gemini model is a trusted reader for
 * Cyrillic/mixed-script documents. When the provider chain fell back
 * (primary timeout/5xx → flash), readDocument must force
 * review_required=true + 'fallback_model_used' on EVERY field:
 * gemini-2.5-flash was DISQUALIFIED on certificate docs (read a
 * DIFFERENT person — 2026-06-02 adjudication). Latin-script US forms
 * (EAD/I-94/I-797) are exempt — flash was never disqualified there.
 *
 * Uses an injected mock provider — no network, no PII.
 */
import { describe, it, expect } from 'vitest'
import { readDocument } from '../documentFieldReader'
import { primaryGeminiModel } from '../providers/geminiVisionProvider'
import type { VisionProvider, VisionReadResult } from '../types'

const IMG = Buffer.from('fake-image')

function mockProvider(model: string): VisionProvider {
  return {
    name: 'mock-gemini',
    readFields: async (): Promise<VisionReadResult> => ({
      ok: true,
      model,
      ms: 10,
      fields: [
        { field: 'family_name', cyrillic: 'ШЕВЧЕНКО', iso_date: null, can_read: true, confidence: 0.99, reason: '' },
        { field: 'given_name', cyrillic: 'ТАРАС', iso_date: null, can_read: true, confidence: 0.99, reason: '' },
      ],
    }),
  }
}

describe('ADR-018: fallback model forces review on non-Latin documents', () => {
  it('primary model read does NOT add fallback_model_used', async () => {
    const res = await readDocument(IMG, 'image/jpeg', 'ua_internal_passport_booklet', {
      provider: mockProvider(primaryGeminiModel()),
    })
    expect(res.ok).toBe(true)
    for (const f of res.fields) {
      expect(f.review_reasons ?? []).not.toContain('fallback_model_used')
    }
  })

  it('fallback model (gemini-2.5-flash) forces review_required on ALL fields of a Cyrillic doc', async () => {
    const res = await readDocument(IMG, 'image/jpeg', 'ua_internal_passport_booklet', {
      provider: mockProvider('gemini-2.5-flash'),
    })
    expect(res.ok).toBe(true)
    expect(res.fields.length).toBeGreaterThan(0)
    for (const f of res.fields) {
      expect(f.review_required).toBe(true)
      expect(f.review_reasons).toContain('fallback_model_used')
    }
  })

  it('fallback model on a mixed-script doc (international passport) also forces review', async () => {
    const res = await readDocument(IMG, 'image/jpeg', 'ua_international_passport', {
      provider: mockProvider('gemini-3.5-flash'),
    })
    expect(res.ok).toBe(true)
    for (const f of res.fields) {
      expect(f.review_required).toBe(true)
      expect(f.review_reasons).toContain('fallback_model_used')
    }
  })

  it('fallback model on a Latin-script US doc does NOT force fallback review (flash not disqualified there)', async () => {
    const provider: VisionProvider = {
      name: 'mock-gemini',
      readFields: async (): Promise<VisionReadResult> => ({
        ok: true,
        model: 'gemini-2.5-flash',
        ms: 10,
        fields: [
          { field: 'card_number', cyrillic: 'EAD0012345678901234', iso_date: null, can_read: true, confidence: 0.99, reason: '' },
        ],
      }),
    }
    const res = await readDocument(IMG, 'image/jpeg', 'us_ead', { provider })
    expect(res.ok).toBe(true)
    for (const f of res.fields) {
      expect(f.review_reasons ?? []).not.toContain('fallback_model_used')
    }
  })

  it('high-confidence printed field still gets review when read by fallback model', async () => {
    // confidence 0.99 would normally pass the printed-field gate (< 0.95 → review);
    // the fallback override must win regardless of confidence.
    const res = await readDocument(IMG, 'image/jpeg', 'ua_internal_passport_booklet', {
      provider: mockProvider('gemini-2.5-flash'),
    })
    const fam = res.fields.find((f) => f.field === 'family_name')
    expect(fam?.confidence).toBeGreaterThan(0.95)
    expect(fam?.review_required).toBe(true)
  })
})
