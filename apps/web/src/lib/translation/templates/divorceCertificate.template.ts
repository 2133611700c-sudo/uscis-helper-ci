/**
 * Divorce Certificate PDF Template — Messenginfo v6.0 (self_cert_divorce_v1)
 *
 * Renders the customer-facing translated divorce certificate PDF content.
 *
 * FORBIDDEN in output (enforced by content guard):
 *   - SOURCE TRACE / source trace
 *   - QA / internal / debug
 *   - OCR IDs / ocr_ids / bbox / bounding box
 *   - confidence / raw JSON
 *   - CERTIFIED COPY
 *   - Round seal / stamp image
 *   - USCIS accepted / guaranteed
 *   - certified by AI
 *   - Translator Note
 *   - "Middle Name" for any Patronymic field
 *   - Invented court decision details not present in source
 *
 * ALLOWED:
 *   - Clean English translation of all 15 critical fields
 *   - [illegible] only if explicitly confirmed during Evidence Review
 *   - Certification of Translation Accuracy block (self_cert_divorce_v1)
 *   - Signature section (human translator name + date)
 *   - Court decision details ONLY if explicitly present in source document
 *
 * Field display order follows Phase 11 spec exactly.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DivorceCertRenderField {
  field: string
  label: string
  value: string | null
  confirmed: boolean
  is_illegible: boolean
}

export interface DivorceCertRenderInput {
  session_id: string
  fields: DivorceCertRenderField[]
  translator_name: string
  translator_address?: string
  translation_date: string
  certification_version: string
}

export interface DivorceCertRenderOutput {
  title: string
  field_lines: string[]
  certification_block: string
  forbidden_phrase_violations: string[]
}

// ── Field display labels ───────────────────────────────────────────────────────
// CRITICAL: _patronymic fields must NEVER be labeled "Middle Name"

export const DIVORCE_CERT_FIELD_LABELS: Record<string, string> = {
  document_type:                'Document Type',
  certificate_series:           'Certificate Series',
  certificate_number:           'Certificate Number',
  act_record_number:            'Act Record Number',
  act_record_date:              'Date of Act Record',
  spouse_1_surname:             'Spouse 1 Surname',
  spouse_1_given_name:          'Spouse 1 Given Name',
  spouse_1_patronymic:          'Spouse 1 Patronymic',        // NEVER "Middle Name"
  spouse_2_surname:             'Spouse 2 Surname',
  spouse_2_given_name:          'Spouse 2 Given Name',
  spouse_2_patronymic:          'Spouse 2 Patronymic',        // NEVER "Middle Name"
  date_of_divorce:              'Date of Divorce',
  basis_of_divorce:             'Basis of Divorce',
  issuing_authority:            'Issuing Authority',
  date_of_issue:                'Date of Issue',
  // optional — only rendered if explicitly present in source
  court_decision_number:        'Court Decision Number',
  court_decision_date:          'Court Decision Date',
  court_name:                   'Court Name',
  place_of_divorce_registration:'Place of Divorce Registration',
  readable_stamp_text:          'Readable Stamp Text',
  repeated_certificate_marker:  'Repeated Certificate Marker',
  document_language_layer:      'Document Language Layer',
  archive_or_duplicate_note:    'Archive or Duplicate Note',
}

// ── Render field order ────────────────────────────────────────────────────────

export const DIVORCE_CERT_RENDER_ORDER: readonly string[] = [
  'document_type',
  'certificate_series',
  'certificate_number',
  'act_record_number',
  'act_record_date',
  'spouse_1_surname',
  'spouse_1_given_name',
  'spouse_1_patronymic',
  'spouse_2_surname',
  'spouse_2_given_name',
  'spouse_2_patronymic',
  'date_of_divorce',
  'basis_of_divorce',
  'issuing_authority',
  'date_of_issue',
]

// ── Critical fields for render gate ──────────────────────────────────────────

export const DIVORCE_CERT_CRITICAL_FIELD_KEYS: readonly string[] = DIVORCE_CERT_RENDER_ORDER

// ── Forbidden phrases ─────────────────────────────────────────────────────────

const FORBIDDEN_PHRASES: readonly string[] = [
  'source trace',
  'SOURCE TRACE',
  'qa/audit',
  'QA/AUDIT',
  'internal',
  'debug',
  'ocr_ids',
  'ocr ids',
  'bounding box',
  'bbox',
  'confidence',
  'raw json',
  'raw_value',
  'CERTIFIED COPY',
  'certified copy',
  'round seal',
  'stamp image',
  'uscis accepted',
  'USCIS accepted',
  'guaranteed',
  'certified by AI',
  'Certified by AI',
  'translator note',
  'Translator Note',
  'middle name',           // Patronymic must never be "Middle Name"
  'Middle Name',
  'certification version', // internal metadata
]

// ── Render gate ───────────────────────────────────────────────────────────────

export interface DivorceCertRenderGateResult {
  allowed: boolean
  missing_critical_fields: string[]
  unconfirmed_critical_fields: string[]
}

/**
 * Checks whether all 15 critical fields are present and user-confirmed.
 * Returns allowed=false if any critical field is missing or unconfirmed.
 */
export function checkDivorceCertRenderGate(
  input: DivorceCertRenderInput,
): DivorceCertRenderGateResult {
  const fieldMap = new Map(input.fields.map(f => [f.field, f]))

  const missing_critical_fields: string[] = []
  const unconfirmed_critical_fields: string[] = []

  for (const key of DIVORCE_CERT_CRITICAL_FIELD_KEYS) {
    const f = fieldMap.get(key)
    if (!f || (f.value === null && !f.is_illegible)) {
      missing_critical_fields.push(key)
    } else if (!f.confirmed) {
      unconfirmed_critical_fields.push(key)
    }
  }

  return {
    allowed: missing_critical_fields.length === 0 && unconfirmed_critical_fields.length === 0,
    missing_critical_fields,
    unconfirmed_critical_fields,
  }
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Renders the divorce certificate translation as a structured output.
 * Court decision details are included ONLY if explicitly present (value non-null).
 */
export function renderDivorceCertificate(
  input: DivorceCertRenderInput,
): DivorceCertRenderOutput {
  const title = 'English Translation of Ukrainian Divorce Certificate'
  const fieldMap = new Map(input.fields.map(f => [f.field, f]))

  // Build field lines in spec order
  const field_lines: string[] = []

  for (const key of DIVORCE_CERT_RENDER_ORDER) {
    const f = fieldMap.get(key)
    const label = DIVORCE_CERT_FIELD_LABELS[key] ?? key
    const value = f?.is_illegible ? '[illegible]' : (f?.value ?? '[not extracted]')
    field_lines.push(`${label}: ${value}`)
  }

  // Add optional fields only if explicitly present — court details included ONLY if non-null
  const optionalKeys = [
    'court_decision_number',
    'court_decision_date',
    'court_name',
    'place_of_divorce_registration',
    'readable_stamp_text',
    'repeated_certificate_marker',
    'archive_or_duplicate_note',
  ]
  for (const key of optionalKeys) {
    const f = fieldMap.get(key)
    if (f?.value) {
      const label = DIVORCE_CERT_FIELD_LABELS[key] ?? key
      const value = f.is_illegible ? '[illegible]' : f.value
      field_lines.push(`${label}: ${value}`)
    }
  }

  // Build certification block
  const certification_block = [
    'CERTIFICATION OF TRANSLATION ACCURACY',
    '',
    `I, ${input.translator_name}, certify that I am competent to translate from Ukrainian and/or Russian into English, and that the above is a true and accurate translation of the Ukrainian divorce certificate (Свідоцтво про розірвання шлюбу) presented to me.`,
    '',
    `Translation Date: ${input.translation_date}`,
    `Certification Version: ${input.certification_version}`,
    ...(input.translator_address ? [`Translator Address: ${input.translator_address}`] : []),
    '',
    `Signature: ___________________________`,
    `Name: ${input.translator_name}`,
  ].join('\n')

  // Forbidden phrase scan
  const allText = [title, ...field_lines, certification_block].join('\n')
  const forbidden_phrase_violations: string[] = []

  for (const phrase of FORBIDDEN_PHRASES) {
    if (allText.includes(phrase)) {
      forbidden_phrase_violations.push(`Forbidden phrase found: "${phrase}"`)
    }
  }

  return {
    title,
    field_lines,
    certification_block,
    forbidden_phrase_violations,
  }
}
