/**
 * Marriage Certificate Template Tests — Messenginfo v6.0
 *
 * Tests renderMarriageCertificate, checkMarriageCertRenderGate,
 * MARRIAGE_CERT_CRITICAL_FIELD_KEYS, MARRIAGE_CERT_RENDER_ORDER,
 * and the forbidden phrase scanner.
 */
import { describe, it, expect } from 'vitest'
import {
  renderMarriageCertificate,
  checkMarriageCertRenderGate,
  MARRIAGE_CERT_CRITICAL_FIELD_KEYS,
  MARRIAGE_CERT_RENDER_ORDER,
  MARRIAGE_CERT_FIELD_LABELS,
  type MarriageCertRenderField,
  type MarriageCertRenderInput,
} from '../marriageCertificate.template'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeField(
  field: string,
  value: string | null = 'Sample Value',
  confirmed = true,
  is_illegible = false,
): MarriageCertRenderField {
  return { field, label: MARRIAGE_CERT_FIELD_LABELS[field] ?? field, value, confirmed, is_illegible }
}

function makeAllCriticalFields(
  overrides: Partial<Record<string, Partial<MarriageCertRenderField>>> = {},
): MarriageCertRenderField[] {
  return MARRIAGE_CERT_CRITICAL_FIELD_KEYS.map(key => ({
    ...makeField(key),
    ...(overrides[key] ?? {}),
  }))
}

const BASE_INPUT: MarriageCertRenderInput = {
  session_id: 'test-session-001',
  translator_name: 'Jane Doe',
  translation_date: '09 May 2026',
  certification_version: 'self_cert_marriage_v1',
  fields: makeAllCriticalFields(),
}

// ── MARRIAGE_CERT_CRITICAL_FIELD_KEYS ─────────────────────────────────────────

describe('MARRIAGE_CERT_CRITICAL_FIELD_KEYS', () => {
  it('has exactly 16 entries', () => {
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).toHaveLength(16)
  })

  it('contains document_type', () => {
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).toContain('document_type')
  })

  it('contains both before and after marriage surnames', () => {
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).toContain('spouse_1_surname_before_marriage')
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).toContain('spouse_1_surname_after_marriage')
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).toContain('spouse_2_surname_before_marriage')
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).toContain('spouse_2_surname_after_marriage')
  })

  it('does not contain optional keys', () => {
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).not.toContain('place_of_marriage_registration')
    expect(MARRIAGE_CERT_CRITICAL_FIELD_KEYS).not.toContain('citizenship_spouse_1')
  })
})

// ── MARRIAGE_CERT_FIELD_LABELS — patronymic safety ────────────────────────────

describe('MARRIAGE_CERT_FIELD_LABELS patronymic safety', () => {
  it('spouse_1_patronymic label does not contain "Middle Name"', () => {
    expect(MARRIAGE_CERT_FIELD_LABELS['spouse_1_patronymic']?.toLowerCase()).not.toContain('middle name')
  })

  it('spouse_2_patronymic label does not contain "Middle Name"', () => {
    expect(MARRIAGE_CERT_FIELD_LABELS['spouse_2_patronymic']?.toLowerCase()).not.toContain('middle name')
  })

  it('spouse_1_patronymic label contains "Patronymic"', () => {
    expect(MARRIAGE_CERT_FIELD_LABELS['spouse_1_patronymic']).toContain('Patronymic')
  })

  it('spouse_2_patronymic label contains "Patronymic"', () => {
    expect(MARRIAGE_CERT_FIELD_LABELS['spouse_2_patronymic']).toContain('Patronymic')
  })

  it('before-marriage surname labels are distinct from after-marriage', () => {
    expect(MARRIAGE_CERT_FIELD_LABELS['spouse_1_surname_before_marriage']).toContain('Before')
    expect(MARRIAGE_CERT_FIELD_LABELS['spouse_1_surname_after_marriage']).toContain('After')
  })
})

// ── checkMarriageCertRenderGate ───────────────────────────────────────────────

describe('checkMarriageCertRenderGate', () => {
  it('allows render when all 16 critical fields are present and confirmed', () => {
    const r = checkMarriageCertRenderGate(BASE_INPUT)
    expect(r.allowed).toBe(true)
    expect(r.missing_critical_fields).toHaveLength(0)
    expect(r.unconfirmed_critical_fields).toHaveLength(0)
  })

  it('blocks when a critical field has null value and is not illegible', () => {
    const fields = makeAllCriticalFields({ date_of_marriage: { value: null, confirmed: true, is_illegible: false } })
    const r = checkMarriageCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(false)
    expect(r.missing_critical_fields).toContain('date_of_marriage')
  })

  it('allows when a critical field is null but marked is_illegible=true', () => {
    const fields = makeAllCriticalFields({ act_record_number: { value: null, confirmed: true, is_illegible: true } })
    const r = checkMarriageCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(true)
  })

  it('blocks when a critical field is present but unconfirmed', () => {
    const fields = makeAllCriticalFields({ issuing_authority: { confirmed: false } })
    const r = checkMarriageCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(false)
    expect(r.unconfirmed_critical_fields).toContain('issuing_authority')
  })

  it('blocks when multiple critical fields are missing', () => {
    const fields = makeAllCriticalFields({
      certificate_number: { value: null, confirmed: true, is_illegible: false },
      act_record_number: { value: null, confirmed: true, is_illegible: false },
    })
    const r = checkMarriageCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(false)
    expect(r.missing_critical_fields.length).toBeGreaterThanOrEqual(2)
  })

  it('blocks when no fields provided at all', () => {
    const r = checkMarriageCertRenderGate({ ...BASE_INPUT, fields: [] })
    expect(r.allowed).toBe(false)
    expect(r.missing_critical_fields).toHaveLength(16)
  })
})

// ── renderMarriageCertificate — title ────────────────────────────────────────

describe('renderMarriageCertificate — title', () => {
  it('has correct English title', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.title).toBe('English Translation of Ukrainian Marriage Certificate')
  })
})

// ── renderMarriageCertificate — field_lines ───────────────────────────────────

describe('renderMarriageCertificate — field_lines', () => {
  it('produces at least 16 field lines (one per critical field)', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.field_lines.length).toBeGreaterThanOrEqual(16)
  })

  it('field lines follow MARRIAGE_CERT_RENDER_ORDER', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    // First 16 lines should match render order
    for (let i = 0; i < MARRIAGE_CERT_RENDER_ORDER.length; i++) {
      const key = MARRIAGE_CERT_RENDER_ORDER[i]
      const expectedLabel = MARRIAGE_CERT_FIELD_LABELS[key] ?? key
      expect(out.field_lines[i]).toMatch(new RegExp(`^${expectedLabel}:`))
    }
  })

  it('renders [illegible] when is_illegible=true', () => {
    const fields = makeAllCriticalFields({ act_record_number: { value: null, confirmed: true, is_illegible: true } })
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields })
    const line = out.field_lines.find(l => l.includes('Act Record Number'))
    expect(line).toContain('[illegible]')
  })

  it('renders [not extracted] when field absent entirely', () => {
    // Remove date_of_marriage from fields
    const fields = makeAllCriticalFields().filter(f => f.field !== 'date_of_marriage')
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields })
    const line = out.field_lines.find(l => l.startsWith('Date of Marriage'))
    expect(line).toContain('[not extracted]')
  })

  it('does not include optional fields when they have no value', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    // BASE_INPUT has no optional fields → optional keys should not appear
    const optionalLabels = ['Place of Marriage Registration', 'Citizenship — Spouse 1']
    for (const label of optionalLabels) {
      expect(out.field_lines.some(l => l.startsWith(label))).toBe(false)
    }
  })

  it('includes optional field when value is present', () => {
    const optionalField: MarriageCertRenderField = {
      field: 'place_of_marriage_registration',
      label: 'Place of Marriage Registration',
      value: 'м. Київ',
      confirmed: true,
      is_illegible: false,
    }
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields: [...makeAllCriticalFields(), optionalField] })
    expect(out.field_lines.some(l => l.includes('Place of Marriage Registration'))).toBe(true)
  })
})

// ── renderMarriageCertificate — certification_block ──────────────────────────

describe('renderMarriageCertificate — certification_block', () => {
  it('contains translator name', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('Jane Doe')
  })

  it('contains translation date', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('09 May 2026')
  })

  it('contains CERTIFICATION OF TRANSLATION ACCURACY header', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('CERTIFICATION OF TRANSLATION ACCURACY')
  })

  it('contains Ukrainian certificate term Свідоцтво про шлюб', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('Свідоцтво про шлюб')
  })

  it('includes translator address when provided', () => {
    const out = renderMarriageCertificate({ ...BASE_INPUT, translator_address: '123 Main St, NY' })
    expect(out.certification_block).toContain('123 Main St, NY')
  })

  it('does not include Translator Address line when not provided', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.certification_block).not.toContain('Translator Address')
  })
})

// ── renderMarriageCertificate — forbidden phrase scanner ─────────────────────

describe('renderMarriageCertificate — forbidden phrase scanner', () => {
  it('has no violations for valid clean input', () => {
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.forbidden_phrase_violations).toHaveLength(0)
  })

  it('detects "middle name" in field value', () => {
    const fields = makeAllCriticalFields({ spouse_1_patronymic: { value: 'middle name fallback' } })
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.toLowerCase().includes('middle name'))).toBe(true)
  })

  it('detects "confidence" in field value', () => {
    const fields = makeAllCriticalFields({ act_record_number: { value: 'confidence=0.9' } })
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.includes('confidence'))).toBe(true)
  })

  it('detects "bbox" in field value', () => {
    const fields = makeAllCriticalFields({ certificate_number: { value: 'bbox[100,200]' } })
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.includes('bbox'))).toBe(true)
  })

  it('detects "CERTIFIED COPY" in field value', () => {
    const fields = makeAllCriticalFields({ document_type: { value: 'CERTIFIED COPY' } })
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.includes('CERTIFIED COPY'))).toBe(true)
  })

  it('detects "certified by AI" in field value', () => {
    const fields = makeAllCriticalFields({ issuing_authority: { value: 'certified by AI' } })
    const out = renderMarriageCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.toLowerCase().includes('certified by ai'))).toBe(true)
  })

  it('scanner is case-sensitive: "Certification Version:" (Title Case) does not trigger lowercase forbidden phrase', () => {
    // The forbidden phrase list uses lowercase 'certification version'.
    // The template writes "Certification Version:" with Title Case.
    // Because includes() is case-sensitive, this phrase does NOT fire.
    // This is the actual scanner behavior — tests document it accurately.
    const out = renderMarriageCertificate(BASE_INPUT)
    expect(out.forbidden_phrase_violations.some(v => v.toLowerCase().includes('certification version'))).toBe(false)
  })
})
