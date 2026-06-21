/**
 * Divorce Certificate Template Tests — Messenginfo v6.0
 *
 * Tests renderDivorceCertificate, checkDivorceCertRenderGate,
 * DIVORCE_CERT_CRITICAL_FIELD_KEYS, DIVORCE_CERT_RENDER_ORDER,
 * and the forbidden phrase scanner.
 */
import { describe, it, expect } from 'vitest'
import {
  renderDivorceCertificate,
  checkDivorceCertRenderGate,
  DIVORCE_CERT_CRITICAL_FIELD_KEYS,
  DIVORCE_CERT_RENDER_ORDER,
  DIVORCE_CERT_FIELD_LABELS,
  type DivorceCertRenderField,
  type DivorceCertRenderInput,
} from '../divorceCertificate.template'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeField(
  field: string,
  value: string | null = 'Sample Value',
  confirmed = true,
  is_illegible = false,
): DivorceCertRenderField {
  return { field, label: DIVORCE_CERT_FIELD_LABELS[field] ?? field, value, confirmed, is_illegible }
}

function makeAllCriticalFields(
  overrides: Partial<Record<string, Partial<DivorceCertRenderField>>> = {},
): DivorceCertRenderField[] {
  return DIVORCE_CERT_CRITICAL_FIELD_KEYS.map(key => ({
    ...makeField(key),
    ...(overrides[key] ?? {}),
  }))
}

const BASE_INPUT: DivorceCertRenderInput = {
  session_id: 'test-session-002',
  translator_name: 'John Smith',
  translation_date: '09 May 2026',
  certification_version: 'self_cert_divorce_v1',
  fields: makeAllCriticalFields(),
}

// ── DIVORCE_CERT_CRITICAL_FIELD_KEYS ──────────────────────────────────────────

describe('DIVORCE_CERT_CRITICAL_FIELD_KEYS', () => {
  it('has exactly 15 entries', () => {
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).toHaveLength(15)
  })

  it('contains document_type', () => {
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).toContain('document_type')
  })

  it('contains basis_of_divorce', () => {
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).toContain('basis_of_divorce')
  })

  it('contains date_of_divorce (separate from act_record_date)', () => {
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).toContain('date_of_divorce')
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).toContain('act_record_date')
    // They must be distinct
    const dateOfDivorceIdx = (DIVORCE_CERT_CRITICAL_FIELD_KEYS as string[]).indexOf('date_of_divorce')
    const actRecordDateIdx = (DIVORCE_CERT_CRITICAL_FIELD_KEYS as string[]).indexOf('act_record_date')
    expect(dateOfDivorceIdx).not.toBe(actRecordDateIdx)
  })

  it('does not contain court_decision_number (optional only)', () => {
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).not.toContain('court_decision_number')
  })

  it('does not contain court_name (optional only)', () => {
    expect(DIVORCE_CERT_CRITICAL_FIELD_KEYS).not.toContain('court_name')
  })
})

// ── DIVORCE_CERT_FIELD_LABELS — patronymic safety ─────────────────────────────

describe('DIVORCE_CERT_FIELD_LABELS patronymic safety', () => {
  it('spouse_1_patronymic label does not contain "Middle Name"', () => {
    expect(DIVORCE_CERT_FIELD_LABELS['spouse_1_patronymic']?.toLowerCase()).not.toContain('middle name')
  })

  it('spouse_2_patronymic label does not contain "Middle Name"', () => {
    expect(DIVORCE_CERT_FIELD_LABELS['spouse_2_patronymic']?.toLowerCase()).not.toContain('middle name')
  })

  it('spouse_1_patronymic label contains "Patronymic"', () => {
    expect(DIVORCE_CERT_FIELD_LABELS['spouse_1_patronymic']).toContain('Patronymic')
  })

  it('spouse_2_patronymic label contains "Patronymic"', () => {
    expect(DIVORCE_CERT_FIELD_LABELS['spouse_2_patronymic']).toContain('Patronymic')
  })

  it('basis_of_divorce label is "Basis of Divorce"', () => {
    expect(DIVORCE_CERT_FIELD_LABELS['basis_of_divorce']).toBe('Basis of Divorce')
  })

  it('date_of_divorce label is distinct from act_record_date label', () => {
    expect(DIVORCE_CERT_FIELD_LABELS['date_of_divorce']).not.toBe(DIVORCE_CERT_FIELD_LABELS['act_record_date'])
  })
})

// ── checkDivorceCertRenderGate ────────────────────────────────────────────────

describe('checkDivorceCertRenderGate', () => {
  it('allows render when all 15 critical fields are present and confirmed', () => {
    const r = checkDivorceCertRenderGate(BASE_INPUT)
    expect(r.allowed).toBe(true)
    expect(r.missing_critical_fields).toHaveLength(0)
    expect(r.unconfirmed_critical_fields).toHaveLength(0)
  })

  it('blocks when basis_of_divorce is null and not illegible', () => {
    const fields = makeAllCriticalFields({ basis_of_divorce: { value: null, confirmed: true, is_illegible: false } })
    const r = checkDivorceCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(false)
    expect(r.missing_critical_fields).toContain('basis_of_divorce')
  })

  it('allows when basis_of_divorce is null but is_illegible=true', () => {
    const fields = makeAllCriticalFields({ basis_of_divorce: { value: null, confirmed: true, is_illegible: true } })
    const r = checkDivorceCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(true)
  })

  it('blocks when a critical field is unconfirmed', () => {
    const fields = makeAllCriticalFields({ date_of_divorce: { confirmed: false } })
    const r = checkDivorceCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(false)
    expect(r.unconfirmed_critical_fields).toContain('date_of_divorce')
  })

  it('blocks when multiple critical fields are missing', () => {
    const fields = makeAllCriticalFields({
      certificate_number: { value: null, confirmed: true, is_illegible: false },
      act_record_number: { value: null, confirmed: true, is_illegible: false },
      basis_of_divorce: { value: null, confirmed: true, is_illegible: false },
    })
    const r = checkDivorceCertRenderGate({ ...BASE_INPUT, fields })
    expect(r.allowed).toBe(false)
    expect(r.missing_critical_fields.length).toBeGreaterThanOrEqual(3)
  })

  it('blocks when no fields provided', () => {
    const r = checkDivorceCertRenderGate({ ...BASE_INPUT, fields: [] })
    expect(r.allowed).toBe(false)
    expect(r.missing_critical_fields).toHaveLength(15)
  })
})

// ── renderDivorceCertificate — title ──────────────────────────────────────────

describe('renderDivorceCertificate — title', () => {
  it('has correct English title', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.title).toBe('English Translation of Ukrainian Divorce Certificate')
  })
})

// ── renderDivorceCertificate — field_lines ────────────────────────────────────

describe('renderDivorceCertificate — field_lines', () => {
  it('produces at least 15 field lines (one per critical field)', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.field_lines.length).toBeGreaterThanOrEqual(15)
  })

  it('field lines follow DIVORCE_CERT_RENDER_ORDER', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    for (let i = 0; i < DIVORCE_CERT_RENDER_ORDER.length; i++) {
      const key = DIVORCE_CERT_RENDER_ORDER[i]
      const expectedLabel = DIVORCE_CERT_FIELD_LABELS[key] ?? key
      expect(out.field_lines[i]).toMatch(new RegExp(`^${expectedLabel}:`))
    }
  })

  it('renders [illegible] when is_illegible=true', () => {
    const fields = makeAllCriticalFields({ act_record_number: { value: null, confirmed: true, is_illegible: true } })
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    const line = out.field_lines.find(l => l.includes('Act Record Number'))
    expect(line).toContain('[illegible]')
  })

  it('renders [not extracted] when field absent entirely', () => {
    const fields = makeAllCriticalFields().filter(f => f.field !== 'basis_of_divorce')
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    const line = out.field_lines.find(l => l.startsWith('Basis of Divorce'))
    expect(line).toContain('[not extracted]')
  })

  it('does not include optional court fields when they have no value', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.field_lines.some(l => l.startsWith('Court Decision Number'))).toBe(false)
    expect(out.field_lines.some(l => l.startsWith('Court Decision Date'))).toBe(false)
    expect(out.field_lines.some(l => l.startsWith('Court Name'))).toBe(false)
  })

  it('includes court_decision_number when value is present', () => {
    const courtField: DivorceCertRenderField = {
      field: 'court_decision_number',
      label: 'Court Decision Number',
      value: '2023/789',
      confirmed: true,
      is_illegible: false,
    }
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields: [...makeAllCriticalFields(), courtField] })
    expect(out.field_lines.some(l => l.includes('Court Decision Number') && l.includes('2023/789'))).toBe(true)
  })

  it('includes court_name when value is present', () => {
    const courtNameField: DivorceCertRenderField = {
      field: 'court_name',
      label: 'Court Name',
      value: 'Шевченківський районний суд',
      confirmed: true,
      is_illegible: false,
    }
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields: [...makeAllCriticalFields(), courtNameField] })
    expect(out.field_lines.some(l => l.includes('Court Name'))).toBe(true)
  })

  it('basis_of_divorce appears in field lines', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.field_lines.some(l => l.startsWith('Basis of Divorce'))).toBe(true)
  })

  it('date_of_divorce and act_record_date appear as separate lines', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    const divorceLine = out.field_lines.find(l => l.startsWith('Date of Divorce'))
    const actLine = out.field_lines.find(l => l.startsWith('Date of Act Record'))
    expect(divorceLine).toBeDefined()
    expect(actLine).toBeDefined()
    expect(divorceLine).not.toBe(actLine)
  })
})

// ── renderDivorceCertificate — certification_block ────────────────────────────

describe('renderDivorceCertificate — certification_block', () => {
  it('contains translator name', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('John Smith')
  })

  it('contains translation date', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('09 May 2026')
  })

  it('contains CERTIFICATION OF TRANSLATION ACCURACY header', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('CERTIFICATION OF TRANSLATION ACCURACY')
  })

  it('contains Ukrainian divorce certificate term Свідоцтво про розірвання шлюбу', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.certification_block).toContain('Свідоцтво про розірвання шлюбу')
  })

  it('includes translator address when provided', () => {
    const out = renderDivorceCertificate({ ...BASE_INPUT, translator_address: '456 Oak Ave, Chicago' })
    expect(out.certification_block).toContain('456 Oak Ave, Chicago')
  })

  it('does not include Translator Address line when not provided', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.certification_block).not.toContain('Translator Address')
  })
})

// ── renderDivorceCertificate — forbidden phrase scanner ──────────────────────

describe('renderDivorceCertificate — forbidden phrase scanner', () => {
  it('has no "middle name" violation for valid clean input', () => {
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.forbidden_phrase_violations.some(v => v.toLowerCase().includes('middle name'))).toBe(false)
  })

  it('detects "middle name" in a patronymic field value', () => {
    const fields = makeAllCriticalFields({ spouse_1_patronymic: { value: 'middle name entry' } })
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.toLowerCase().includes('middle name'))).toBe(true)
  })

  it('detects "Middle Name" (case-sensitive phrase) in field value', () => {
    const fields = makeAllCriticalFields({ spouse_2_patronymic: { value: 'Middle Name test' } })
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.includes('Middle Name'))).toBe(true)
  })

  it('detects "confidence" in field value', () => {
    const fields = makeAllCriticalFields({ basis_of_divorce: { value: 'confidence=0.8 text' } })
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.includes('confidence'))).toBe(true)
  })

  it('detects "CERTIFIED COPY" in document_type', () => {
    const fields = makeAllCriticalFields({ document_type: { value: 'CERTIFIED COPY' } })
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.includes('CERTIFIED COPY'))).toBe(true)
  })

  it('detects "certified by AI" phrase', () => {
    const fields = makeAllCriticalFields({ issuing_authority: { value: 'certified by AI system' } })
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.toLowerCase().includes('certified by ai'))).toBe(true)
  })

  it('detects "bbox" in field value', () => {
    const fields = makeAllCriticalFields({ certificate_number: { value: 'bbox[10,20]' } })
    const out = renderDivorceCertificate({ ...BASE_INPUT, fields })
    expect(out.forbidden_phrase_violations.some(v => v.includes('bbox'))).toBe(true)
  })

  it('scanner is case-sensitive: "Certification Version:" (Title Case) does not trigger lowercase forbidden phrase', () => {
    // The forbidden phrase list has lowercase 'certification version'.
    // The template writes "Certification Version:" with Title Case.
    // Because includes() is case-sensitive, this phrase does NOT fire.
    // This documents actual scanner behavior accurately.
    const out = renderDivorceCertificate(BASE_INPUT)
    expect(out.forbidden_phrase_violations.some(v => v.toLowerCase().includes('certification version'))).toBe(false)
  })
})
