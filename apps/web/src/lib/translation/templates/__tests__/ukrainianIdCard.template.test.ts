/**
 * Ukrainian ID Card Template Tests — Messenginfo v6.0
 *
 * Tests for ukrainianIdCard.template.ts:
 *   - ID_CARD_FIELD_LABELS (15 fields, suppressed absent)
 *   - ID_CARD_RENDER_ORDER (15 fields, no rnokpp/MRZ)
 *   - ID_CARD_SUPPRESSED_FIELDS (rnokpp, mrz_line_1, mrz_line_2)
 *   - document_number AND record_number both in render (distinct labels)
 *   - checkIdCardRenderGate
 *   - renderUkrainianIdCard
 *   - auditIdCardRenderOutputForSuppressedFields
 *
 * Privacy invariant: rnokpp, mrz_line_1, mrz_line_2 must NEVER appear
 * in any rendered output.
 *
 * Critical: document_number and record_number must both appear in render
 * output with distinct labels — they are different fields.
 */
import { describe, it, expect } from 'vitest'
import {
  ID_CARD_FIELD_LABELS,
  ID_CARD_RENDER_ORDER,
  ID_CARD_SUPPRESSED_FIELDS,
  ID_CARD_RENDER_GATE_FIELDS,
  checkIdCardRenderGate,
  renderUkrainianIdCard,
  auditIdCardRenderOutputForSuppressedFields,
  type IdCardRenderInput,
  type IdCardRenderField,
} from '../ukrainianIdCard.template'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeField(field: string, value: string = 'Test Value'): IdCardRenderField {
  return { field, label: ID_CARD_FIELD_LABELS[field] ?? field, value, confirmed: true, is_illegible: false }
}

function makeCompleteInput(): IdCardRenderInput {
  return {
    session_id: 'sess-002',
    review_date: '9 May 2026',
    reviewer_name: 'Test Reviewer',
    fields: ID_CARD_RENDER_ORDER.map(f => makeField(f)),
  }
}

// ── ID_CARD_FIELD_LABELS ───────────────────────────────────────────────────────

describe('ID_CARD_FIELD_LABELS', () => {
  it('has exactly 15 entries (render fields only)', () => {
    expect(Object.keys(ID_CARD_FIELD_LABELS)).toHaveLength(15)
  })

  it('does NOT include rnokpp', () => {
    expect(ID_CARD_FIELD_LABELS).not.toHaveProperty('rnokpp')
  })

  it('does NOT include mrz_line_1', () => {
    expect(ID_CARD_FIELD_LABELS).not.toHaveProperty('mrz_line_1')
  })

  it('does NOT include mrz_line_2', () => {
    expect(ID_CARD_FIELD_LABELS).not.toHaveProperty('mrz_line_2')
  })

  it('patronymic_cyrillic is NOT labeled Middle Name', () => {
    const label = ID_CARD_FIELD_LABELS['patronymic_cyrillic'] ?? ''
    expect(label.toLowerCase()).not.toContain('middle name')
    expect(label).toContain('Patronymic')
  })

  it('document_number has a distinct label from record_number', () => {
    expect(ID_CARD_FIELD_LABELS['document_number']).not.toBe(
      ID_CARD_FIELD_LABELS['record_number'],
    )
  })

  it('record_number label contains УНЗР', () => {
    expect(ID_CARD_FIELD_LABELS['record_number']).toContain('УНЗР')
  })

  it('has both Latin and Cyrillic surname labels', () => {
    expect(ID_CARD_FIELD_LABELS['surname_latin']).toBeTruthy()
    expect(ID_CARD_FIELD_LABELS['surname_cyrillic']).toBeTruthy()
  })

  it('has both Latin and Cyrillic given name labels', () => {
    expect(ID_CARD_FIELD_LABELS['given_names_latin']).toBeTruthy()
    expect(ID_CARD_FIELD_LABELS['given_names_cyrillic']).toBeTruthy()
  })
})

// ── ID_CARD_RENDER_ORDER ───────────────────────────────────────────────────────

describe('ID_CARD_RENDER_ORDER', () => {
  it('has exactly 15 fields', () => {
    expect(ID_CARD_RENDER_ORDER).toHaveLength(15)
  })

  it('does NOT contain rnokpp', () => {
    expect(ID_CARD_RENDER_ORDER).not.toContain('rnokpp')
  })

  it('does NOT contain mrz_line_1', () => {
    expect(ID_CARD_RENDER_ORDER).not.toContain('mrz_line_1')
  })

  it('does NOT contain mrz_line_2', () => {
    expect(ID_CARD_RENDER_ORDER).not.toContain('mrz_line_2')
  })

  it('contains document_number', () => {
    expect(ID_CARD_RENDER_ORDER).toContain('document_number')
  })

  it('contains record_number', () => {
    expect(ID_CARD_RENDER_ORDER).toContain('record_number')
  })

  it('document_number and record_number are at different positions', () => {
    const docIdx = ID_CARD_RENDER_ORDER.indexOf('document_number')
    const recIdx = ID_CARD_RENDER_ORDER.indexOf('record_number')
    expect(docIdx).not.toBe(recIdx)
    expect(docIdx).toBeGreaterThanOrEqual(0)
    expect(recIdx).toBeGreaterThanOrEqual(0)
  })

  it('starts with document_type', () => {
    expect(ID_CARD_RENDER_ORDER[0]).toBe('document_type')
  })

  it('contains both Latin and Cyrillic fields', () => {
    expect(ID_CARD_RENDER_ORDER).toContain('surname_latin')
    expect(ID_CARD_RENDER_ORDER).toContain('surname_cyrillic')
    expect(ID_CARD_RENDER_ORDER).toContain('given_names_latin')
    expect(ID_CARD_RENDER_ORDER).toContain('given_names_cyrillic')
    expect(ID_CARD_RENDER_ORDER).toContain('patronymic_cyrillic')
  })

  it('all render fields have a label', () => {
    for (const field of ID_CARD_RENDER_ORDER) {
      expect(ID_CARD_FIELD_LABELS[field]).toBeTruthy()
    }
  })
})

// ── ID_CARD_SUPPRESSED_FIELDS ──────────────────────────────────────────────────

describe('ID_CARD_SUPPRESSED_FIELDS', () => {
  it('has exactly 3 suppressed fields', () => {
    expect(ID_CARD_SUPPRESSED_FIELDS).toHaveLength(3)
  })

  it('includes rnokpp', () => {
    expect(ID_CARD_SUPPRESSED_FIELDS).toContain('rnokpp')
  })

  it('includes mrz_line_1', () => {
    expect(ID_CARD_SUPPRESSED_FIELDS).toContain('mrz_line_1')
  })

  it('includes mrz_line_2', () => {
    expect(ID_CARD_SUPPRESSED_FIELDS).toContain('mrz_line_2')
  })

  it('suppressed fields are NOT in render order', () => {
    for (const suppressed of ID_CARD_SUPPRESSED_FIELDS) {
      expect(ID_CARD_RENDER_ORDER).not.toContain(suppressed)
    }
  })

  it('document_number is NOT suppressed (must appear in render)', () => {
    expect(ID_CARD_SUPPRESSED_FIELDS).not.toContain('document_number')
  })

  it('record_number is NOT suppressed (must appear in render)', () => {
    expect(ID_CARD_SUPPRESSED_FIELDS).not.toContain('record_number')
  })
})

// ── checkIdCardRenderGate ──────────────────────────────────────────────────────

describe('checkIdCardRenderGate', () => {
  it('allows rendering when all 15 render fields are present and confirmed', () => {
    const input = makeCompleteInput()
    const result = checkIdCardRenderGate(input)
    expect(result.allowed).toBe(true)
    expect(result.missing_critical_fields).toHaveLength(0)
    expect(result.unconfirmed_critical_fields).toHaveLength(0)
    expect(result.suppressed_fields_blocked).toHaveLength(0)
  })

  it('blocks when document_number is missing', () => {
    const input = makeCompleteInput()
    input.fields = input.fields.filter(f => f.field !== 'document_number')
    const result = checkIdCardRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.missing_critical_fields).toContain('document_number')
  })

  it('blocks when record_number is missing', () => {
    const input = makeCompleteInput()
    input.fields = input.fields.filter(f => f.field !== 'record_number')
    const result = checkIdCardRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.missing_critical_fields).toContain('record_number')
  })

  it('blocks when rnokpp is in the input (suppressed)', () => {
    const input = makeCompleteInput()
    input.fields.push({
      field: 'rnokpp',
      label: 'РНОКПП',
      value: '1234567890',
      confirmed: true,
      is_illegible: false,
    })
    const result = checkIdCardRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.suppressed_fields_blocked).toContain('rnokpp')
  })

  it('blocks when mrz_line_1 is in the input (suppressed)', () => {
    const input = makeCompleteInput()
    input.fields.push({
      field: 'mrz_line_1',
      label: 'MRZ Line 1',
      value: 'I<UKRTEST',
      confirmed: true,
      is_illegible: false,
    })
    const result = checkIdCardRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.suppressed_fields_blocked).toContain('mrz_line_1')
  })

  it('blocks when unconfirmed surname_latin', () => {
    const input = makeCompleteInput()
    const f = input.fields.find(f => f.field === 'surname_latin')!
    f.confirmed = false
    const result = checkIdCardRenderGate(input)
    expect(result.allowed).toBe(false)
    expect(result.unconfirmed_critical_fields).toContain('surname_latin')
  })

  it('allows [illegible] field (not missing)', () => {
    const input = makeCompleteInput()
    const docType = input.fields.find(f => f.field === 'document_type')!
    docType.value = null
    docType.is_illegible = true
    const result = checkIdCardRenderGate(input)
    expect(result.missing_critical_fields).not.toContain('document_type')
  })
})

// ── renderUkrainianIdCard ──────────────────────────────────────────────────────

describe('renderUkrainianIdCard', () => {
  it('renders title correctly', () => {
    const output = renderUkrainianIdCard(makeCompleteInput())
    expect(output.title).toContain('Ukrainian ID Card')
    expect(output.title).toContain('Identity Anchor')
  })

  it('renders exactly 15 field lines', () => {
    const output = renderUkrainianIdCard(makeCompleteInput())
    expect(output.field_lines).toHaveLength(15)
  })

  it('renders document_number with correct label', () => {
    const input = makeCompleteInput()
    const docNum = input.fields.find(f => f.field === 'document_number')!
    docNum.value = '012345678'
    const output = renderUkrainianIdCard(input)
    const line = output.field_lines.find(l => l.includes('Document Number'))!
    expect(line).toContain('012345678')
    expect(line).toContain('Document Number')
  })

  it('renders record_number with УНЗР label distinct from document_number', () => {
    const input = makeCompleteInput()
    const recNum = input.fields.find(f => f.field === 'record_number')!
    recNum.value = '20010103000010'
    const output = renderUkrainianIdCard(input)
    const recLine = output.field_lines.find(l => l.includes('УНЗР'))!
    expect(recLine).toContain('20010103000010')
    expect(recLine).toContain('УНЗР')
    // Verify it's different from document_number line
    const docLine = output.field_lines.find(
      l => l.startsWith('Document Number:')
    )!
    expect(recLine).not.toBe(docLine)
  })

  it('renders patronymic_cyrillic — never labeled Middle Name', () => {
    const output = renderUkrainianIdCard(makeCompleteInput())
    const patronymicLine = output.field_lines.find(l => l.includes('Patronymic'))!
    expect(patronymicLine).toBeDefined()
    expect(patronymicLine.toLowerCase()).not.toContain('middle name')
  })

  it('renders both Latin and Cyrillic surname fields', () => {
    const input = makeCompleteInput()
    const latinSurname = input.fields.find(f => f.field === 'surname_latin')!
    latinSurname.value = 'KOVALENKO'
    const cyrillicSurname = input.fields.find(f => f.field === 'surname_cyrillic')!
    cyrillicSurname.value = 'КОВАЛЕНКО'
    const output = renderUkrainianIdCard(input)
    const latinLine = output.field_lines.find(l => l.includes('Surname (Latin)'))!
    const cyrillicLine = output.field_lines.find(l => l.includes('Surname (Cyrillic)'))!
    expect(latinLine).toContain('KOVALENKO')
    expect(cyrillicLine).toContain('КОВАЛЕНКО')
  })

  it('PRIVACY: output does not contain rnokpp key verbatim', () => {
    const input = makeCompleteInput()
    // Even if rnokpp sneaks into input, it gets filtered
    input.fields.push({
      field: 'rnokpp',
      label: 'РНОКПП',
      value: '9876543210',
      confirmed: true,
      is_illegible: false,
    })
    const output = renderUkrainianIdCard(input)
    const allText = [output.title, ...output.field_lines, output.identity_anchor_note].join('\n')
    expect(allText).not.toContain('9876543210')
  })

  it('PRIVACY: output does not contain mrz_line_2 verbatim key', () => {
    const input = makeCompleteInput()
    input.fields.push({
      field: 'mrz_line_2',
      label: 'MRZ Line 2',
      value: '9101036M3105319UKR1234567890<0',
      confirmed: true,
      is_illegible: false,
    })
    const output = renderUkrainianIdCard(input)
    // Line2 value must not appear in rendered output
    const allText = output.field_lines.join('\n')
    expect(allText).not.toContain('9101036M3105319')
  })

  it('renders [illegible] for illegible fields', () => {
    const input = makeCompleteInput()
    const pob = input.fields.find(f => f.field === 'place_of_birth')!
    pob.value = null
    pob.is_illegible = true
    const output = renderUkrainianIdCard(input)
    const pobLine = output.field_lines.find(l => l.includes('Place of Birth'))!
    expect(pobLine).toContain('[illegible]')
  })

  it('identity_anchor_note mentions УНЗР distinction', () => {
    const output = renderUkrainianIdCard(makeCompleteInput())
    expect(output.identity_anchor_note).toContain('УНЗР')
  })

  it('identity_anchor_note mentions suppressed fields', () => {
    const output = renderUkrainianIdCard(makeCompleteInput())
    expect(output.identity_anchor_note.toLowerCase()).toContain('suppressed')
  })

  it('has no forbidden phrase violations for clean input', () => {
    const output = renderUkrainianIdCard(makeCompleteInput())
    expect(output.forbidden_phrase_violations).toHaveLength(0)
  })

  it('detects forbidden phrase Middle Name if injected', () => {
    const input = makeCompleteInput()
    const patronymic = input.fields.find(f => f.field === 'patronymic_cyrillic')!
    patronymic.value = 'Middle Name: IVANOVYCH'
    const output = renderUkrainianIdCard(input)
    expect(output.forbidden_phrase_violations.length).toBeGreaterThan(0)
  })

  it('detects rnokpp in field values', () => {
    const input = makeCompleteInput()
    // Inject rnokpp keyword into a rendered field value
    const docType = input.fields.find(f => f.field === 'document_type')!
    docType.value = 'ID Card (check rnokpp field)'
    const output = renderUkrainianIdCard(input)
    expect(output.forbidden_phrase_violations.length).toBeGreaterThan(0)
  })
})

// ── auditIdCardRenderOutputForSuppressedFields ────────────────────────────────

describe('auditIdCardRenderOutputForSuppressedFields', () => {
  it('returns clean=true for safe rendered lines', () => {
    const lines = [
      'Surname (Latin): KOVALENKO',
      'Document Number: FC1234567',
      'Record Number (УНЗР): 20010103000010',
    ]
    const result = auditIdCardRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('detects rnokpp in output', () => {
    const lines = ['Tax ID (rnokpp): 1234567890']
    const result = auditIdCardRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
    expect(result.violations.some(v => v.includes('rnokpp'))).toBe(true)
  })

  it('detects mrz_line_2 in output', () => {
    const lines = ['mrz_line_2: 9101036M3105319']
    const result = auditIdCardRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
    expect(result.violations.some(v => v.includes('mrz_line_2'))).toBe(true)
  })

  it('detects РНОКПП keyword in output', () => {
    const lines = ['РНОКПП: 1234567890']
    const result = auditIdCardRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
  })

  it('detects Middle Name in output', () => {
    const lines = ['Middle Name: IVANOVYCH']
    const result = auditIdCardRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
  })

  it('detects certified by AI in output', () => {
    const lines = ['certified by AI translation']
    const result = auditIdCardRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(false)
  })

  it('does NOT flag УНЗР (record number is allowed)', () => {
    const lines = ['Record Number (УНЗР): 20010103000010']
    const result = auditIdCardRenderOutputForSuppressedFields(lines)
    expect(result.clean).toBe(true)
  })
})
