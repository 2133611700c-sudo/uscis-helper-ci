import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { primaryGeminiModel } from '../providers/geminiVisionProvider'
import {
  applyAntiFabricationGate,
  isIdentityCriticalField,
  ANTI_FABRICATION_REASONS,
  HANDWRITTEN_FABRICATION_RISK_CLASSES,
} from '../antiFabricationGate'
import { readDocument } from '../documentFieldReader'
import type { ExtractedDocField, VisionProvider, VisionReadResult } from '../types'

function field(p: Partial<ExtractedDocField> & Pick<ExtractedDocField, 'field'>): ExtractedDocField {
  return {
    kind: 'name', raw_cyrillic: null, value: 'X', confidence: 0.99,
    review_required: false, source: 'vision', provider: 'stub', ...p,
  }
}

describe('isIdentityCriticalField', () => {
  it('matches identity fields incl. role-grounded variants', () => {
    for (const f of ['family_name', 'given_name', 'child_patronymic', 'middle_name',
      'child_dob', 'date_of_birth', 'place_of_birth_city', 'place_city',
      'issuing_authority', 'father_full_name', 'spouse_1_full_name']) {
      expect(isIdentityCriticalField(f)).toBe(true)
    }
  })
  it('does NOT match non-identity fields', () => {
    for (const f of ['act_record_number', 'passport_number', 'series_number', 'date_of_issue']) {
      expect(isIdentityCriticalField(f)).toBe(false)
    }
  })
})

describe('trigger scope', () => {
  it('allowlist = handwritten birth classes only (excludes printed marriage + unknown)', () => {
    expect(HANDWRITTEN_FABRICATION_RISK_CLASSES.has('birth_certificate_handwritten')).toBe(true)
    expect(HANDWRITTEN_FABRICATION_RISK_CLASSES.has('birth_certificate_soviet_bilingual')).toBe(true)
    expect(HANDWRITTEN_FABRICATION_RISK_CLASSES.has('marriage_apostille')).toBe(false)
    expect(HANDWRITTEN_FABRICATION_RISK_CLASSES.has('unknown_document')).toBe(false)
    expect(HANDWRITTEN_FABRICATION_RISK_CLASSES.has('internal_passport_booklet')).toBe(false)
  })

  it('printed marriage_apostille (ua_marriage_certificate) is NOT forced', () => {
    const input = [field({ field: 'spouse_1_full_name', value: 'X', review_required: false })]
    expect(applyAntiFabricationGate(input, 'ua_marriage_certificate')).toEqual(input)
  })

  it('unknown_document is NOT forced', () => {
    const input = [field({ field: 'family_name', value: 'X', review_required: false })]
    expect(applyAntiFabricationGate(input, 'some_unmapped_doc_id')).toEqual(input)
  })
})

describe('applyAntiFabricationGate (pure)', () => {
  it('handwritten birth cert: forces review on identity, keeps value, adds reasons', () => {
    const out = applyAntiFabricationGate([
      field({ field: 'child_family_name', value: 'Ivanenko', review_required: false }),
      field({ field: 'act_record_number', value: '87', review_required: false }),
    ], 'ua_birth_certificate')
    const name = out.find((f) => f.field === 'child_family_name')!
    expect(name.review_required).toBe(true)
    expect(name.value).toBe('Ivanenko') // value unchanged
    expect(name.review_reasons).toEqual([...ANTI_FABRICATION_REASONS])
    const act = out.find((f) => f.field === 'act_record_number')!
    expect(act.review_required).toBe(false) // non-identity untouched
    expect(act.review_reasons).toBeUndefined()
  })

  it('model review_required=false on identity cannot survive the gate', () => {
    const out = applyAntiFabricationGate(
      [field({ field: 'child_given_name', value: 'Serhei', review_required: false })],
      'ua_birth_certificate',
    )
    expect(out[0].review_required).toBe(true)
  })

  it('non-hard-case (passport): fields untouched (MRZ identity not blanket-forced)', () => {
    const input = [
      field({ field: 'family_name', value: 'IVANENKO', review_required: false }),
      field({ field: 'passport_number', value: 'FA000000', review_required: false }),
    ]
    const out = applyAntiFabricationGate(input, 'ua_international_passport')
    expect(out).toEqual(input)
  })

  it('never lowers an already-true flag', () => {
    const out = applyAntiFabricationGate(
      [field({ field: 'family_name', value: 'X', review_required: true })],
      'ua_birth_certificate',
    )
    expect(out[0].review_required).toBe(true)
  })
})

// ── gating + route coverage ───────────────────────────────────────────────
function stub(): VisionProvider {
  return {
    name: 'stub',
    async readFields(): Promise<VisionReadResult> {
      return {
        ok: true, model: primaryGeminiModel(), ms: 1,
        fields: [
          { field: 'child_family_name', cyrillic: 'Іваненко', can_read: true, confidence: 0.99, reason: '' },
          { field: 'act_record_number', cyrillic: '87', can_read: true, confidence: 0.99, reason: '' },
        ],
      }
    },
  }
}

describe('readDocument — ANTI_FABRICATION_GATE_ENABLED gating', () => {
  afterEach(() => { delete process.env.ANTI_FABRICATION_GATE_ENABLED })

  it('flag OFF: hard-case identity still review-gated by the handwritten flag (2026-06-11 fix)', async () => {
    // Since the GT-bench silent-wrong fix, EVERY ua_birth_certificate field is
    // handwritten:true ⇒ review_required regardless of this gate. The gate adds
    // REASONS; the handwritten flag guarantees the review itself.
    delete process.env.ANTI_FABRICATION_GATE_ENABLED
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: stub() })
    const n = res.fields.find((f) => f.field === 'child_family_name')!
    expect(n.review_required).toBe(true)
    expect(n.review_reasons ?? []).not.toContain('handwritten_document') // gate OFF adds no reasons
  })

  it('flag ON: hard-case identity forced to review with reasons', async () => {
    process.env.ANTI_FABRICATION_GATE_ENABLED = '1'
    const res = await readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: stub() })
    const n = res.fields.find((f) => f.field === 'child_family_name')!
    expect(n.review_required).toBe(true)
    expect(n.review_reasons).toContain('handwritten_document')
    const act = res.fields.find((f) => f.field === 'act_record_number')!
    // post-fix: act_record_number is handwritten:true ⇒ review (the proven silent-wrong)
    expect(act.review_required).toBe(true)
  })
})

describe('route coverage — all 4 products call readDocument (gate inherited)', () => {
  const WEB = path.join(__dirname, '../../../..') // → apps/web
  const routes = [
    'src/app/api/tps/ocr/extract/route.ts',
    'src/app/api/translation/vision-extract/route.ts',
    'src/app/api/reparole/ocr/extract/route.ts',
    'src/app/api/ead/ocr/extract/route.ts',
  ]
  for (const r of routes) {
    it(`${r} calls readDocument`, () => {
      const src = fs.readFileSync(path.join(WEB, r), 'utf8')
      expect(src).toMatch(/readDocument\s*\(/)
    })
  }
})

// ── CANARY SAFETY CONTRACT ─────────────────────────────────────────────────
// The engineering proof a production canary stands on. Three guarantees:
//   1. ROLLBACK = byte-identical: flag ON → OFF returns EXACTLY the no-flag output.
//      (Removing ANTI_FABRICATION_GATE_ENABLED is a complete, lossless rollback.)
//   2. VALUE IMMUTABILITY: turning the gate ON never alters any field VALUE — it
//      only raises review_required (+ reasons). No fabrication, no rewrite.
//   3. SAFETY DIRECTION: the gate can only ADD review on identity fields; it never
//      removes review and never touches non-identity fields. Worst case = more
//      human review, never a silent wrong value.
describe('canary safety contract (rollback + value immutability)', () => {
  afterEach(() => { delete process.env.ANTI_FABRICATION_GATE_ENABLED })

  async function read() {
    return readDocument(Buffer.from('x'), 'image/jpeg', 'ua_birth_certificate', { provider: stub() })
  }

  it('rollback is byte-identical: OFF → ON → OFF returns the original output', async () => {
    delete process.env.ANTI_FABRICATION_GATE_ENABLED
    const baseline = await read()
    process.env.ANTI_FABRICATION_GATE_ENABLED = '1'
    const enabled = await read()
    delete process.env.ANTI_FABRICATION_GATE_ENABLED
    const rolledBack = await read()
    // enabling MUST change something (else the gate is inert) ...
    expect(JSON.stringify(enabled.fields)).not.toBe(JSON.stringify(baseline.fields))
    // ... and rolling back MUST restore the exact pre-gate output.
    expect(JSON.stringify(rolledBack.fields)).toBe(JSON.stringify(baseline.fields))
  })

  it('value immutability: every field VALUE is identical OFF vs ON (only review changes)', async () => {
    delete process.env.ANTI_FABRICATION_GATE_ENABLED
    const off = await read()
    process.env.ANTI_FABRICATION_GATE_ENABLED = '1'
    const on = await read()
    const offByField = new Map(off.fields.map((f) => [f.field, f.value]))
    for (const f of on.fields) {
      expect(f.value, `value of ${f.field} must not change`).toBe(offByField.get(f.field))
    }
  })

  it('coarse precision is DOCUMENTED: gate fires on ALL birth certs (printed too)', () => {
    // ua_birth_certificate maps conservatively to birth_certificate_handwritten, so the
    // gate cannot today distinguish a printed modern birth cert from a handwritten one —
    // it force-reviews identity on BOTH. That is the false_positive_review surface the
    // canary must watch. Safety (no false negatives) is total; precision is coarse.
    const printedLikeBirthCert = applyAntiFabricationGate(
      [field({ field: 'child_family_name', value: 'X', review_required: false })],
      'ua_birth_certificate',
    )
    expect(printedLikeBirthCert[0].review_required).toBe(true)
  })
})
