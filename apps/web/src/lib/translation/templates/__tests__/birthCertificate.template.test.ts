/**
 * Birth Certificate Template Tests
 *
 * Verifies PDF render output:
 *   - All 14 critical fields present in render
 *   - No forbidden phrases in output
 *   - child_patronymic labeled as Patronymic, not Middle Name
 *   - certificate_number and act_record_number both present separately
 *   - Render gate blocks when critical fields missing or unconfirmed
 */
import { describe, it, expect } from 'vitest'
import {
  renderBirthCertificate,
  checkBirthCertRenderGate,
  FIELD_LABELS,
  RENDER_ORDER,
  FORBIDDEN_PHRASES,
  type BirthCertRenderField,
  type BirthCertRenderInput,
} from '../birthCertificate.template'

function mockField(field: string, value: string, confirmed = true): BirthCertRenderField {
  return { field, label: FIELD_LABELS[field] ?? field, value, confirmed, is_illegible: false }
}

function makeFullInput(): BirthCertRenderInput {
  return {
    session_id: 'test-session-001',
    translator_name: 'Test Translator',
    translation_date: '2026-05-09',
    certification_version: 'self_cert_birth_v1',
    fields: [
      mockField('document_type', 'Ukrainian Birth Certificate'),
      mockField('certificate_series', 'І-КВ'),
      mockField('certificate_number', '123456'),
      mockField('act_record_number', '789'),
      mockField('act_record_date', '15 February 1985'),
      mockField('child_surname', 'Koval'),
      mockField('child_given_name', 'Ivan'),
      mockField('child_patronymic', 'Mykhailovych'),
      mockField('date_of_birth', '10 March 1984'),
      mockField('place_of_birth', 'Kyiv, Ukraine'),
      mockField('father_full_name', 'Mykhailo Koval'),
      mockField('mother_full_name', 'Olena Koval'),
      mockField('issuing_authority', 'Civil Registry Office, Kyiv'),
      mockField('date_of_issue', '20 March 1984'),
    ],
  }
}

// ── FIELD_LABELS ──────────────────────────────────────────────────────────────

describe('FIELD_LABELS', () => {
  it('child_patronymic is labeled as Patronymic', () => {
    expect(FIELD_LABELS['child_patronymic']).toContain('Patronymic')
  })

  it('child_patronymic is NOT labeled as Middle Name', () => {
    expect(FIELD_LABELS['child_patronymic'].toLowerCase()).not.toContain('middle name')
  })

  it('act_record_number is labeled as Act Record Number', () => {
    expect(FIELD_LABELS['act_record_number']).toContain('Act Record Number')
  })

  it('certificate_number is labeled as Certificate Number', () => {
    expect(FIELD_LABELS['certificate_number']).toContain('Certificate Number')
  })

  it('act_record_number and certificate_number have different labels', () => {
    expect(FIELD_LABELS['act_record_number']).not.toBe(FIELD_LABELS['certificate_number'])
  })
})

// ── RENDER_ORDER ──────────────────────────────────────────────────────────────

describe('RENDER_ORDER', () => {
  it('has 14 entries', () => {
    expect(RENDER_ORDER.length).toBe(14)
  })

  it('certificate_number and act_record_number are both present at different positions', () => {
    const certIdx = RENDER_ORDER.indexOf('certificate_number')
    const actIdx = RENDER_ORDER.indexOf('act_record_number')
    expect(certIdx).toBeGreaterThanOrEqual(0)
    expect(actIdx).toBeGreaterThanOrEqual(0)
    expect(certIdx).not.toBe(actIdx)
  })

  it('child_patronymic appears between child_given_name and date_of_birth', () => {
    const patronIdx = RENDER_ORDER.indexOf('child_patronymic')
    const givenIdx = RENDER_ORDER.indexOf('child_given_name')
    const dobIdx = RENDER_ORDER.indexOf('date_of_birth')
    expect(patronIdx).toBeGreaterThan(givenIdx)
    expect(patronIdx).toBeLessThan(dobIdx)
  })
})

// ── renderBirthCertificate — clean output ─────────────────────────────────────

describe('renderBirthCertificate — clean output', () => {
  it('returns a title containing Birth Certificate', () => {
    expect(renderBirthCertificate(makeFullInput()).title).toContain('Birth Certificate')
  })

  it('has no forbidden phrase violations', () => {
    const out = renderBirthCertificate(makeFullInput())
    expect(out.forbidden_phrase_violations).toHaveLength(0)
  })

  it('field_lines contains Certificate Number entry with correct value', () => {
    const out = renderBirthCertificate(makeFullInput())
    const line = out.field_lines.find(l => l.includes('Certificate Number'))
    expect(line).toBeDefined()
    expect(line).toContain('123456')
  })

  it('field_lines contains Act Record Number entry separately', () => {
    const out = renderBirthCertificate(makeFullInput())
    const line = out.field_lines.find(l => l.includes('Act Record Number'))
    expect(line).toBeDefined()
    expect(line).toContain('789')
  })

  it('child_patronymic renders as Patronymic not Middle Name', () => {
    const out = renderBirthCertificate(makeFullInput())
    const patronLine = out.field_lines.find(l => l.toLowerCase().includes('patronymic'))
    expect(patronLine).toBeDefined()
    const hasMiddleName = out.field_lines.some(l => l.toLowerCase().includes('middle name'))
    expect(hasMiddleName).toBe(false)
  })

  it('certification_block contains self_cert_birth_v1', () => {
    expect(renderBirthCertificate(makeFullInput()).certification_block).toContain('self_cert_birth_v1')
  })

  it('certification_block does not contain "certified by AI"', () => {
    const block = renderBirthCertificate(makeFullInput()).certification_block
    expect(block.toLowerCase()).not.toContain('certified by ai')
  })

  it('output does not contain SOURCE TRACE', () => {
    const out = renderBirthCertificate(makeFullInput())
    const allText = [...out.field_lines, out.certification_block].join('\n')
    expect(allText).not.toContain('SOURCE TRACE')
    expect(allText).not.toContain('source trace')
  })

  it('output does not contain CERTIFIED COPY', () => {
    const out = renderBirthCertificate(makeFullInput())
    const allText = [...out.field_lines, out.certification_block].join('\n')
    expect(allText).not.toContain('CERTIFIED COPY')
  })

  it('output does not contain ocr_ids or bbox', () => {
    const out = renderBirthCertificate(makeFullInput())
    const allText = [...out.field_lines, out.certification_block].join('\n')
    expect(allText).not.toContain('ocr_id')
    expect(allText).not.toContain('bbox')
    expect(allText).not.toContain('bounding box')
  })

  it('output does not contain confidence scores', () => {
    const out = renderBirthCertificate(makeFullInput())
    const allText = [...out.field_lines, out.certification_block].join('\n')
    expect(allText).not.toContain('confidence')
  })
})

// ── checkBirthCertRenderGate ──────────────────────────────────────────────────

describe('checkBirthCertRenderGate', () => {
  it('allows render when all 14 critical fields are confirmed', () => {
    const result = checkBirthCertRenderGate(makeFullInput())
    expect(result.allowed).toBe(true)
    expect(result.missing_critical_fields).toHaveLength(0)
    expect(result.unconfirmed_critical_fields).toHaveLength(0)
  })

  it('blocks render when act_record_number is missing', () => {
    const input = makeFullInput()
    input.fields = input.fields.filter(f => f.field !== 'act_record_number')
    const result = checkBirthCertRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.missing_critical_fields).toContain('act_record_number')
  })

  it('blocks render when child_surname is missing', () => {
    const input = makeFullInput()
    input.fields = input.fields.filter(f => f.field !== 'child_surname')
    const result = checkBirthCertRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.missing_critical_fields).toContain('child_surname')
  })

  it('blocks render when certificate_number not confirmed by user', () => {
    const input = makeFullInput()
    const f = input.fields.find(x => x.field === 'certificate_number')
    if (f) f.confirmed = false
    const result = checkBirthCertRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.unconfirmed_critical_fields).toContain('certificate_number')
  })

  it('blocks render when issuing_authority missing', () => {
    const input = makeFullInput()
    input.fields = input.fields.filter(f => f.field !== 'issuing_authority')
    const result = checkBirthCertRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.missing_critical_fields).toContain('issuing_authority')
  })

  it('blocks render when father_full_name is missing', () => {
    const input = makeFullInput()
    input.fields = input.fields.filter(f => f.field !== 'father_full_name')
    const result = checkBirthCertRenderGate(input)
    expect(result.allowed).toBe(false)
  })
})
