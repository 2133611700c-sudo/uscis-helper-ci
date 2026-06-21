import { describe, it, expect, afterEach } from 'vitest'
import {
  identityHash,
  decideStatus,
  applySelfConsistencyOutcome,
  normalizeForCompare,
} from '../selfConsistency'
import { readDocument } from '../documentFieldReader'
import type { ExtractedDocField, VisionProvider, VisionReadResult, VisionFieldRead } from '../types'

const raw = (field: string, cyrillic: string): VisionFieldRead => ({
  field, cyrillic, can_read: true, confidence: 0.99, reason: '',
})

describe('identityHash (raw, pre-normalization)', () => {
  it('same identity → same hash; different identity → different hash', () => {
    const a = [raw('child_family_name', 'Синтетенко'), raw('child_given_name', 'Імечко'), raw('dob', '1986')]
    const b = [raw('child_family_name', 'Синтетенко'), raw('child_given_name', 'Імечко'), raw('dob', '1986')]
    const c = [raw('child_family_name', 'Іншенко'), raw('child_given_name', 'Друженко'), raw('dob', '1975')]
    expect(identityHash(a).hash).toBe(identityHash(b).hash)
    expect(identityHash(a).hash).not.toBe(identityHash(c).hash)
  })
  it('counts only non-empty identity tuple fields', () => {
    expect(identityHash([raw('child_family_name', 'X')]).count).toBe(1)
    expect(identityHash([raw('act_record_number', '87'), raw('issuing_authority', 'ЗАГС')]).count).toBe(0)
  })
  it('normalizeForCompare does NOT KMU-transliterate (stays Cyrillic)', () => {
    expect(normalizeForCompare(" Синтет’ко ")).toBe("синтет'ко")
  })
})

describe('decideStatus', () => {
  const H = (h: string, count = 3) => ({ hash: h, count })
  it('insufficient when <2 identity fields', () => {
    expect(decideStatus(H('x', 1), [H('x')])).toBe('insufficient_identity_fields')
  })
  it('incomplete when a later read failed', () => {
    expect(decideStatus(H('x'), [null])).toBe('incomplete')
  })
  it('mismatch when a later hash differs', () => {
    expect(decideStatus(H('x'), [H('y')])).toBe('mismatch')
  })
  it('agree when all present and equal', () => {
    expect(decideStatus(H('x'), [H('x')])).toBe('agree')
  })
})

const field = (p: Partial<ExtractedDocField> & Pick<ExtractedDocField, 'field'>): ExtractedDocField => ({
  kind: 'name', raw_cyrillic: null, value: 'X', confidence: 0.99,
  review_required: false, source: 'vision', provider: 'stub', ...p,
})

describe('applySelfConsistencyOutcome', () => {
  it('agree → unchanged', () => {
    const f = [field({ field: 'child_family_name' })]
    expect(applySelfConsistencyOutcome(f, 'agree')).toEqual(f)
  })
  it('mismatch → identity review + reason, value unchanged, non-identity untouched', () => {
    const out = applySelfConsistencyOutcome([
      field({ field: 'child_family_name', value: 'Synthsurname', review_required: false }),
      field({ field: 'act_record_number', value: '87', review_required: false }),
    ], 'mismatch')
    const n = out.find((f) => f.field === 'child_family_name')!
    expect(n.review_required).toBe(true)
    expect(n.value).toBe('Synthsurname')
    expect(n.review_reasons).toContain('self_consistency_identity_mismatch')
    expect(out.find((f) => f.field === 'act_record_number')!.review_required).toBe(false)
  })
  it('incomplete/insufficient → identity review + matching reason', () => {
    expect(applySelfConsistencyOutcome([field({ field: 'given_name' })], 'incomplete')[0].review_reasons)
      .toContain('self_consistency_incomplete')
    expect(applySelfConsistencyOutcome([field({ field: 'given_name' })], 'insufficient_identity_fields')[0].review_reasons)
      .toContain('insufficient_identity_fields')
  })
})

// ── readDocument orchestration ─────────────────────────────────────────────
let calls = 0
function stub(identityByCall: string[][]): VisionProvider {
  // identityByCall[i] = [family, given] cyrillic for call i
  return {
    name: 'stub',
    async readFields(): Promise<VisionReadResult> {
      const id = identityByCall[Math.min(calls, identityByCall.length - 1)]
      calls++
      return {
        ok: true, model: 'stub', ms: 1,
        fields: [
          raw('child_family_name', id[0]),
          raw('child_given_name', id[1]),
          raw('dob', '1986'),
          raw('act_record_number', '87'),
        ],
      }
    },
  }
}

describe('readDocument — self-consistency gating', () => {
  afterEach(() => {
    delete process.env.ANTI_FABRICATION_GATE_ENABLED
    delete process.env.SELF_CONSISTENCY_GATE_ENABLED
    delete process.env.SELF_CONSISTENCY_RUNS
    calls = 0
  })

  it('flags OFF → no second read, no self_consistency block', async () => {
    calls = 0
    const p = stub([['Синтетенко', 'Імечко']])
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: p })
    expect(calls).toBe(1)
    expect(res.self_consistency).toBeUndefined()
  })

  it('anti-fabrication OFF + self-consistency ON → no second read', async () => {
    calls = 0
    process.env.SELF_CONSISTENCY_GATE_ENABLED = '1'
    const p = stub([['Синтетенко', 'Імечко']])
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: p })
    expect(calls).toBe(1)
    expect(res.self_consistency).toBeUndefined()
  })

  it('both ON + agree → no instability, identity not extra-flagged by SC', async () => {
    calls = 0
    process.env.ANTI_FABRICATION_GATE_ENABLED = '1'
    process.env.SELF_CONSISTENCY_GATE_ENABLED = '1'
    const p = stub([['Синтетенко', 'Імечко']]) // every call same identity
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: p })
    expect(calls).toBe(2)
    expect(res.self_consistency?.status).toBe('agree')
    expect(res.self_consistency?.instability).toBe(false)
  })

  it('both ON + different identity across reads → mismatch + instability', async () => {
    calls = 0
    process.env.ANTI_FABRICATION_GATE_ENABLED = '1'
    process.env.SELF_CONSISTENCY_GATE_ENABLED = '1'
    const p = stub([['Синтетенко', 'Імечко'], ['Іншенко', 'Друженко']]) // call1 vs call2 differ
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: p })
    expect(res.self_consistency?.status).toBe('mismatch')
    expect(res.self_consistency?.instability).toBe(true)
    const fam = res.fields.find((f) => f.field === 'child_family_name')!
    expect(fam.review_required).toBe(true)
    expect(fam.review_reasons).toContain('self_consistency_identity_mismatch')
  })

  it('passport (not allowlist) → no second read even with both flags', async () => {
    calls = 0
    process.env.ANTI_FABRICATION_GATE_ENABLED = '1'
    process.env.SELF_CONSISTENCY_GATE_ENABLED = '1'
    const p = stub([['СИНТЕТЕНКО', 'ІМЕЧКО']])
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_international_passport', { provider: p })
    expect(calls).toBe(1)
    expect(res.self_consistency).toBeUndefined()
  })

  it('identity_hash_prefix is a short hex prefix (no PII)', async () => {
    calls = 0
    process.env.ANTI_FABRICATION_GATE_ENABLED = '1'
    process.env.SELF_CONSISTENCY_GATE_ENABLED = '1'
    const p = stub([['Синтетенко', 'Імечко']])
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: p })
    expect(res.self_consistency?.identity_hash_prefix).toMatch(/^[0-9a-f]{12}$/)
  })
})
