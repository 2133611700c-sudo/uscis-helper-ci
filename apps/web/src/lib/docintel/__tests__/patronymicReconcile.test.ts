import { describe, it, expect, afterEach } from 'vitest'
import { primaryGeminiModel } from '../providers/geminiVisionProvider'
import { reconcilePatronymicFields } from '../patronymicReconcile'
import { readDocument } from '../documentFieldReader'
import type { ExtractedDocField, VisionProvider, VisionReadResult } from '../types'

// P2.2 — reconcilePatronymic wired into the live reader behind
// SMART_NORMALIZE_ENABLED. Validation pass: well-formed kept, malformed → review,
// no silent correction, never lowers an existing flag.

function field(partial: Partial<ExtractedDocField> & Pick<ExtractedDocField, 'field'>): ExtractedDocField {
  return {
    kind: 'name',
    raw_cyrillic: null,
    value: null,
    confidence: 0.99,
    review_required: false,
    source: 'vision',
    provider: 'stub',
    ...partial,
  }
}

describe('reconcilePatronymicFields (pure)', () => {
  it('keeps a well-formed patronymic and does NOT add review', () => {
    const out = reconcilePatronymicFields([
      field({ field: 'child_given_name', raw_cyrillic: 'Іван', value: 'Ivan' }),
      field({ field: 'child_patronymic', raw_cyrillic: 'Петрович', value: 'Petrovych' }),
    ])
    const p = out.find((f) => f.field === 'child_patronymic')!
    expect(p.value).toBe('Petrovych')
    expect(p.review_required).toBe(false)
  })

  it('forces review on a malformed/garbled patronymic, keeping the raw value', () => {
    const out = reconcilePatronymicFields([
      field({ field: 'middle_name', raw_cyrillic: 'ович', value: 'ovych', review_required: false }),
    ])
    const p = out[0]
    expect(p.review_required).toBe(true)
    expect(p.value).toBe('ovych') // not blanked, not silently replaced
  })

  it('forces review when the read cannot be resolved (short garbage)', () => {
    const out = reconcilePatronymicFields([
      field({ field: 'child_patronymic', raw_cyrillic: 'Петрови', value: 'Petrovy' }),
    ])
    expect(out[0].review_required).toBe(true)
  })

  it('never lowers an already-true review flag on a valid patronymic', () => {
    const out = reconcilePatronymicFields([
      field({ field: 'middle_name', raw_cyrillic: 'Іванівна', value: 'Ivanivna', review_required: true }),
    ])
    expect(out[0].review_required).toBe(true)
  })

  it('leaves non-patronymic fields untouched', () => {
    const fam = field({ field: 'family_name', raw_cyrillic: 'ович', value: 'ovych', review_required: false })
    const out = reconcilePatronymicFields([fam])
    expect(out[0]).toEqual(fam)
  })

  it('ignores a patronymic field with no read', () => {
    const empty = field({ field: 'middle_name', raw_cyrillic: null, value: null })
    const out = reconcilePatronymicFields([empty])
    expect(out[0]).toEqual(empty)
  })
})

// ── Gating: documentFieldReader only runs the pass when the flag is '1' ───────
function stubProvider(): VisionProvider {
  return {
    name: 'stub',
    async readFields(): Promise<VisionReadResult> {
      return {
        ok: true,
        model: primaryGeminiModel(),
        ms: 1,
        fields: [
          { field: 'family_name', cyrillic: 'Іваненко', can_read: true, confidence: 0.99, reason: '' },
          { field: 'given_name', cyrillic: 'Іван', can_read: true, confidence: 0.99, reason: '' },
          // garbled patronymic at HIGH confidence: review would be false without P2.2.
          // NB: keep a distinctive UA letter (і) so the SOURCE-SCRIPT review gate
          // (decoupled 2026-06-20, audit #195: ambiguous script → review by default)
          // does NOT fire here — this test isolates the SMART_NORMALIZE_ENABLED gate,
          // not script ambiguity. 'овіч' is still a garbled (invalid) patronymic.
          { field: 'patronymic', cyrillic: 'овіч', can_read: true, confidence: 0.99, reason: '' },
        ],
      }
    },
  }
}

describe('readDocument — SMART_NORMALIZE_ENABLED gating for patronymic', () => {
  afterEach(() => {
    delete process.env.SMART_NORMALIZE_ENABLED
  })

  it('flag OFF: garbled high-confidence patronymic is NOT review-flagged (unchanged behavior)', async () => {
    delete process.env.SMART_NORMALIZE_ENABLED
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_id_card', { provider: stubProvider() })
    const p = res.fields.find((f) => f.field === 'patronymic')!
    expect(p.review_required).toBe(false)
  })

  it('flag ON: garbled patronymic IS review-flagged', async () => {
    process.env.SMART_NORMALIZE_ENABLED = '1'
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_id_card', { provider: stubProvider() })
    const p = res.fields.find((f) => f.field === 'patronymic')!
    expect(p.review_required).toBe(true)
  })
})
