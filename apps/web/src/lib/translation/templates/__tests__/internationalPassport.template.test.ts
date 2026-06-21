/**
 * International Passport Template Tests — Messenginfo v6.0
 *
 * Tests for internationalPassport.template.ts:
 *   - INTL_PASSPORT_FIELD_LABELS (13 fields, suppressed absent)
 *   - INTL_PASSPORT_RENDER_ORDER (13 fields, no PII)
 *   - INTL_PASSPORT_SUPPRESSED_FIELDS (personal_number, mrz_line_1, mrz_line_2)
 *   - checkIntlPassportRenderGate
 *   - renderInternationalPassport
 *   - auditRenderOutputForSuppressedFields
 *
 * Privacy invariant: personal_number, mrz_line_1, mrz_line_2 must NEVER
 * appear in any rendered output.
 */
import { describe, it, expect } from 'vitest'
import {
  INTL_PASSPORT_FIELD_LABELS,
  INTL_PASSPORT_RENDER_ORDER,
  INTL_PASSPORT_SUPPRESSED_FIELDS,
  INTL_PASSPORT_RENDER_GATE_FIELDS,
  checkIntlPassportRenderGate,
  renderInternationalPassport,
  auditRenderOutputForSuppressedFields,
  type IntlPassportRenderInput,
  type IntlPassportRenderField,
} from '../internationalPassport.template'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeField(field: string, value: string = 'Test Value'): IntlPassportRenderField {
  return { field, label: INTL_PASSPORT_FIELD_LABELS[field] ?? field, value, confirmed: true, is_illegible: false }
}

function makeCompleteInput(): IntlPassportRenderInput {
  return {
    session_id: 'sess-001',
    review_date: '9 May 2026',
    reviewer_name: 'Test Reviewer',
    fields: INTL_PASSPORT_RENDER_ORDER.map(f => makeField(f)),
  }
}

// ── INTL_PASSPORT_FIELD_LABELS ─────────────────────────────────────────────────

describe('INTL_PASSPORT_FIELD_LABELS', () => {
  it('has exactly 13 entries (render fields only)', () => {
    expect(Object.keys(INTL_PASSPORT_FIELD_LABELS)).toHaveLength(13)
  })

  it('does NOT include personal_number', () => {
    expect(INTL_PASSPORT_FIELD_LABELS).not.toHaveProperty('personal_number')
  })

  it('does NOT include mrz_line_1', () => {
    expect(INTL_PASSPORT_FIELD_LABELS).not.toHaveProperty('mrz_line_1')
  })

  it('does NOT include mrz_line_2', () => {
    expect(INTL_PASSPORT_FIELD_LABELS).not.toHaveProperty('mrz_line_2')
  })

  it('patronymic_cyrillic is NOT labeled Middle Name', () => {
    const label = INTL_PASSPORT_FIELD_LABELS['patronymic_cyrillic'] ?? ''
    expect(label.toLowerCase()).not.toContain('middle name')
    expect(label).toContain('Patronymic')
  })

  it('issuing_state_code has a label', () => {
    expect(INTL_PASSPORT_FIELD_LABELS['issuing_state_code']).toBeTruthy()
  })

  it('document_number has a label', () => {
    expect(INTL_PASSPORT_FIELD_LABELS['document_number']).toBeTruthy()
  })
})

// ── INTL_PASSPORT_RENDER_ORDER ─────────────────────────────────────────────────

describe('INTL_PASSPORT_RENDER_ORDER', () => {
  it('has exactly 13 fields', () => {
    expect(INTL_PASSPORT_RENDER_ORDER).toHaveLength(13)
  })

  it('does NOT contain personal_number', () => {
    expect(INTL_PASSPORT_RENDER_ORDER).not.toContain('personal_number')
  })

  it('does NOT contain mrz_line_1', () => {
    expect(INTL_PASSPORT_RENDER_ORDER).not.toContain('mrz_line_1')
  })

  it('does NOT contain mrz_line_2', () => {
    expect(INTL_PASSPORT_RENDER_ORDER).not.toContain('mrz_line_2')
  })

  it('contains document_type as first field', () => {
    expect(INTL_PASSPORT_RENDER_ORDER[0]).toBe('document_type')
  })

  it('contains issuing_authority', () => {
    expect(INTL_PASSPORT_RENDER_ORDER).toContain('issuing_authority')
  })

  it('contains issuing_state_code', () => {
    expect(INTL_PASSPORT_RENDER_ORDER).toContain('issuing_state_code')
  })

  it('all render fields have a label', () => {
    for (const field of INTL_PASSPORT_RENDER_ORDER) {
      expect(INTL_PASSPORT_FIELD_LABELS[field]).toBeTruthy()
    }
  })
})

// ── INTL_PASSPORT_SUPPRESSED_FIELDS ────────────────────────────────────────────

describe('INTL_PASSPORT_SUPPRESSED_FIELDS', () => {
  it('has exactly 3 suppressed fields', () => {
    expect(INTL_PASSPORT_SUPPRESSED_FIELDS).toHaveLength(3)
  })

  it('includes personal_number', () => {
    expect(INTL_PASSPORT_SUPPRESSED_FIELDS).toContain('personal_number')
  })

  it('includes mrz_line_1', () => {
    expect(INTL_PASSPORT_SUPPRESSED_FIELDS).toContain('mrz_line_1')
  })

  it('includes mrz_line_2', () => {
    expect(INTL_PASSPORT_SUPPRESSED_FIELDS).toContain('mrz_line_2')
  })

  it('suppressed fields are NOT in render order', () => {
    for (const suppressed of INTL_PASSPORT_SUPPRESSED_FIELDS) {
      expect(INTL_PASSPORT_RENDER_ORDER).not.toContain(suppressed)
    }
  })
})

// ── checkIntlPassportRenderGate ─────────────────────────────────────────────────

describe('checkIntlPassportRenderGate', () => {
  it('allows rendering when all fields present and confirmed', () => {
    const input = makeCompleteInput()
    const result = checkIntlPassportRenderGate(input)
    expect(result.allowed).toBe(true)
    expect(result.missing_critical_fields).toHaveLength(0)
    expect(result.unconfirmed_critical_fields).toHaveLength(0)
    expect(result.suppressed_fields_blocked).toHaveLength(0)
  })

  it('blocks when a critical field is missing', () => {
    const input = makeCompleteInput()
    input.fields = input.fields.filter(f => f.field !== 'document_number')
    const result = checkIntlPassportRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.missing_critical_fields).toContain('document_number')
  })

  it('blocks when a critical field is unconfirmed', () => {
    const input = makeCompleteInput()
    const df = input.fields.find(f => f.field === 'date_of_birth')!
    df.confirmed = false
    const result = checkIntlPassportRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.unconfirmed_critical_fields).toContain('date_of_birth')
  })

  it('blocks when suppressed field is in the input (personal_number)', () => {
    const input = makeCompleteInput()
    input.fields.push({
      field: 'personal_number',
      label: 'Personal Number',
      value: '1234567890',
      confirmed: true,
      is_illegible: false,
    })
    const result = checkIntlPassportRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.suppressed_fields_blocked).toContain('personal_number')
  })

  it('blocks when suppressed mrz_line_1 is in the input', () => {
    const input = makeCompleteInput()
    input.fields.push({
      field: 'mrz_line_1',
      label: 'MRZ Line 1',
      value: 'P<UKRTEST',
      confirmed: true,
      is_illegible: false,
    })
    const result = checkIntlPassportRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.suppressed_fields_blocked).toContain('mrz_line_1')
  })

  it('allows [illegible] value for field (no missing count)', () => {
    const input = makeCompleteInput()
    const docType = input.fields.find(f => f.field === 'document_type')!
    docType.value = null
    docType.is_illegible = true
    const result = checkIntlPassportRenderGate(input)
    expect(result.missing_critical_fields).not.toContain('document_type')
  })
})

// ── renderInternationalPassport ────────────────────────────────────────────────

describe('renderInternationalPassport', () => {
  it('renders title correctly', () => {
    const output = renderInternationalPassport(makeCompleteInput())
    expect(output.title).toContain('International Passport')
    expect(output.title).toContain('Identity Anchor')
  })

  it('renders 13 field lines (one per render field)', () => {
    const output = renderInternationalPassport(makeCompleteInput())
    expect(output.field_lines).toHaveLength(13)
  })

  it('renders surname_latin with correct label', () => {
    const input = makeCompleteInput()
    const surnameField = input.fields.find(f => f.field === 'surname_latin')!
    surnameField.value = 'KOVALENKO'
    const output = renderInternationalPassport(input)
    const line = output.field_lines.find(l => l.includes('Surname'))!
    expect(line).toContain('KOVALENKO')
    expect(line).toContain('Surname (Latin)')
  })

  it('renders patronymic_cyrillic — never labels it Middle Name', () => {
    const output = renderInternationalPassport(makeCompleteInput())
    const patronymicLine = output.field_lines.find(l => l.includes('Patronymic'))!
    expect(patronymicLine).toBeDefined()
    expect(patronymicLine.toLowerCase()).not.toContain('middle name')
  })

  it('renders [illegible] for illegible fields', () => {
    const input = makeCompleteInput()
    const pob = input.fields.find(f => f.field === 'place_of_birth')!
    pob.value = null
    pob.is_illegible = true
    const output = renderInternationalPassport(input)
    const pobLine = output.field_lines.find(l => l.includes('Place of Birth'))!
    expect(pobLine).toContain('[illegible]')
  })

  it('renders [not extracted] for fields with null value', () => {
    const input = makeCompleteInput()
    const auth = input.fields.find(f => f.field === 'issuing_authority')!
    auth.value = null
    auth.is_illegible = false
    const output = renderInternationalPassport(input)
    const line = output.field_lines.find(l => l.includes('Issuing Authority'))!
    expect(line).toContain('[not extracted]')
  })

  it('identity_anchor_note mentions specialist review', () => {
    const output = renderInternationalPassport(makeCompleteInput())
    expect(output.identity_anchor_note).toContain('SPECIALIST REVIEW')
  })

  it('identity_anchor_note mentions suppression of sensitive fields', () => {
    const output = renderInternationalPassport(makeCompleteInput())
    expect(output.identity_anchor_note.toLowerCase()).toContain('suppressed')
  })

  it('PRIVACY: output does not contain personal_number key verbatim', () => {
    const input = makeCompleteInput()
    // Even if someone sneaks personal_number into input, it gets filtered
    input.fields.push({
      field: 'personal_number',
      label: 'Personal Number',
      value: '9876543210',
      confirmed: true,
      is_illegible: false,
    })
    const output = renderInternationalPassport(input)
    const allText = [output.title, ...output.field_lines, output.identity_anchor_note].join('\n')
    expect(allText).not.toContain('9876543210')
  })

  it('PRIVACY: output does not contain mrz_line_1 verbatim', () => {
    const input = makeCompleteInput()
    input.fields.push({
      field: 'mrz_line_1',
      label: 'MRZ Line 1',
      value: 'P<UKRSECRET<<DATA<<<<<<<<<<<<<<<<<<<<<<<<',
      confirmed: true,
      is_illegible: false,
    })
    const output = renderInternationalPassport(input)
    const allText = [...output.field_lines].join('\n')
    expect(allText).not.toContain('P<UKRSECRET')
  })

  it('has no forbidden phrase violations for clean input', () => {
    const output = renderInternationalPassport(makeCompleteInput())
    expect(output.forbidden_phrase_violations).toHaveLength(0)
  })

  it('detects forbidden phrase if injected into field value', () => {
    const input = makeCompleteInput()
    const docType = input.fields.find(f => f.field === 'document_type')!
    docType.value = 'Passport — middle name check'
    const output = renderInternationalPassport(input)
    expect(output.forbidden_phrase_violations.length).toBeGreaterThan(0)
  })
})

// ── auditRenderOutputForSuppressedFields ──────────────────────────────────────

describe('auditRenderOutputForSuppressedFields', () => {
  it('returns clean=true for safe rendered lines', () => {
    const lines = [
      'Surname (Latin): KOVALENKO',
      'Date of Birth: 3 January 1991',
      'Document Number: FC1234567',
    ]
    const result = auditRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('detects rnokpp in output', () => {
    const lines = ['Personal Number (rnokpp): 1234567890']
    const result = auditRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
    expect(result.violations.some(v => v.includes('rnokpp'))).toBe(true)
  })

  it('detects mrz_line_1 in output', () => {
    const lines = ['mrz_line_1: P<UKRDATA']
    const result = auditRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
    expect(result.violations.some(v => v.includes('mrz_line_1'))).toBe(true)
  })

  it('detects Middle Name in output', () => {
    const lines = ['Middle Name: IVANOVYCH']
    const result = auditRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
  })

  it('detects certified by AI in output', () => {
    const lines = ['certified by AI translation service']
    const result = auditRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
  })
})
