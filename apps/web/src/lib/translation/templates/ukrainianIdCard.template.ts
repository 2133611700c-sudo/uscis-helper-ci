/**
 * Ukrainian ID Card PDF Template — Messenginfo v6.0 (identity_anchor_id_card)
 *
 * Renders the operator-facing identity anchor record for the Ukrainian ID card
 * (Посвідчення особи / ID-картка).
 *
 * STATUS: draft — allowAutoPdf=false. This template is used internally for
 * identity anchor review; customer PDF is never generated for this module.
 *
 * SUPPRESSED FROM OUTPUT (enforced by render gate):
 *   - rnokpp     — NEVER in any output, log, or customer PDF
 *   - mrz_line_1 — internal validation only
 *   - mrz_line_2 — internal validation only
 *
 * CRITICAL FIELD SEPARATION enforced here:
 *   - document_number: 9-digit printed card number (APPEARS in render output)
 *   - record_number:   УНЗР from MRZ optional data 1 (APPEARS in render output)
 *   These are distinct and both rendered — unlike rnokpp/MRZ which are suppressed.
 *
 * FORBIDDEN phrases in rendered output (content guard enforced):
 *   - SOURCE TRACE / source trace
 *   - ocr_ids / ocr ids / bbox / bounding box
 *   - confidence / raw json / raw_value
 *   - CERTIFIED COPY / certified copy
 *   - round seal / stamp image
 *   - uscis accepted / guaranteed
 *   - certified by AI
 *   - rnokpp (must never appear in output)
 *   - mrz_line_1 / mrz_line_2 (must not appear verbatim)
 *   - "Middle Name" for any Patronymic field
 *
 * ALLOWED:
 *   - English translation of the 15 render fields (excludes 3 suppressed)
 *   - [illegible] only if explicitly confirmed during Evidence Review
 *   - Identity anchor summary header
 *   - document_number AND record_number (both rendered, with distinct labels)
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IdCardRenderField {
  field: string
  label: string
  value: string | null
  confirmed: boolean
  is_illegible: boolean
}

export interface IdCardRenderInput {
  session_id: string
  fields: IdCardRenderField[]
  reviewer_name?: string
  review_date: string
}

export interface IdCardRenderOutput {
  title: string
  field_lines: string[]
  identity_anchor_note: string
  forbidden_phrase_violations: string[]
}

// ── Field display labels ───────────────────────────────────────────────────────
// CRITICAL:
//   - patronymic_cyrillic NEVER labeled "Middle Name"
//   - record_number labeled with УНЗР designation (distinct from document_number)
//   - rnokpp, mrz_line_1, mrz_line_2 NOT in this map (suppressed)

export const ID_CARD_FIELD_LABELS: Record<string, string> = {
  document_type:         'Document Type',
  surname_latin:         'Surname (Latin)',
  given_names_latin:     'Given Names (Latin)',
  surname_cyrillic:      'Surname (Cyrillic)',
  given_names_cyrillic:  'Given Names (Cyrillic)',
  patronymic_cyrillic:   'Patronymic (Cyrillic)',  // NEVER "Middle Name"
  date_of_birth:         'Date of Birth',
  sex:                   'Sex',
  nationality:           'Nationality',
  place_of_birth:        'Place of Birth',
  document_number:       'Document Number',
  record_number:         'Record Number (УНЗР)',  // distinct from document_number
  date_of_issue:         'Date of Issue',
  date_of_expiry:        'Date of Expiry',
  issuing_authority:     'Issuing Authority',
  // rnokpp    — SUPPRESSED
  // mrz_line_1 — SUPPRESSED
  // mrz_line_2 — SUPPRESSED
}

// ── Render field order ─────────────────────────────────────────────────────────
// Matches module renderFields exactly. Suppressed fields are absent.
// Both document_number AND record_number appear here (distinct rendered fields).

export const ID_CARD_RENDER_ORDER: readonly string[] = [
  'document_type',
  'surname_latin',
  'given_names_latin',
  'surname_cyrillic',
  'given_names_cyrillic',
  'patronymic_cyrillic',
  'date_of_birth',
  'sex',
  'nationality',
  'place_of_birth',
  'document_number',
  'record_number',      // УНЗР — distinct from document_number
  'date_of_issue',
  'date_of_expiry',
  'issuing_authority',
  // rnokpp     — SUPPRESSED (sensitive PII, never in output)
  // mrz_line_1 — SUPPRESSED (internal check digit use only)
  // mrz_line_2 — SUPPRESSED (internal check digit use only)
]

// ── Suppressed fields (must NEVER appear in rendered output) ──────────────────

export const ID_CARD_SUPPRESSED_FIELDS: readonly string[] = [
  'rnokpp',
  'mrz_line_1',
  'mrz_line_2',
]

// ── Critical fields for render gate ───────────────────────────────────────────

export const ID_CARD_RENDER_GATE_FIELDS: readonly string[] = ID_CARD_RENDER_ORDER

// ── Forbidden phrases ─────────────────────────────────────────────────────────

const FORBIDDEN_PHRASES: readonly string[] = [
  'source trace',
  'SOURCE TRACE',
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
  'rnokpp',            // field key must not appear verbatim
  'RNOKPP',
  'рнокпп',
  'РНОКПП',
  'mrz_line_1',
  'mrz_line_2',
  'middle name',
  'Middle Name',
]

// ── Render gate ───────────────────────────────────────────────────────────────

export interface IdCardRenderGateResult {
  allowed: boolean
  missing_critical_fields: string[]
  unconfirmed_critical_fields: string[]
  suppressed_fields_blocked: string[]
}

/**
 * Checks whether all 15 render fields are present and confirmed.
 * Also verifies suppressed fields (rnokpp, mrz_line_1, mrz_line_2) are absent.
 *
 * Since status=draft, this template is only used for specialist review,
 * not customer PDF generation. allowAutoPdf=false is enforced upstream.
 */
export function checkIdCardRenderGate(
  input: IdCardRenderInput,
): IdCardRenderGateResult {
  const fieldMap = new Map(input.fields.map(f => [f.field, f]))

  const missing_critical_fields: string[] = []
  const unconfirmed_critical_fields: string[] = []
  const suppressed_fields_blocked: string[] = []

  // Check render fields
  for (const key of ID_CARD_RENDER_GATE_FIELDS) {
    const f = fieldMap.get(key)
    if (!f || (f.value === null && !f.is_illegible)) {
      missing_critical_fields.push(key)
    } else if (!f.confirmed) {
      unconfirmed_critical_fields.push(key)
    }
  }

  // Verify suppressed fields are not attempting to render
  for (const key of ID_CARD_SUPPRESSED_FIELDS) {
    if (fieldMap.has(key)) {
      suppressed_fields_blocked.push(key)
    }
  }

  return {
    allowed:
      missing_critical_fields.length === 0 &&
      unconfirmed_critical_fields.length === 0 &&
      suppressed_fields_blocked.length === 0,
    missing_critical_fields,
    unconfirmed_critical_fields,
    suppressed_fields_blocked,
  }
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Renders the Ukrainian ID card identity anchor record as structured output.
 * This is NOT a customer-facing certificate. It is an internal specialist review
 * document that establishes bilingual identity (Latin + Cyrillic) for the packet.
 *
 * Suppressed fields (rnokpp, mrz_line_1, mrz_line_2) must NEVER appear
 * in the input fields list — they are filtered even if present.
 *
 * document_number AND record_number (УНЗР) BOTH appear in the output —
 * they are distinct fields with different labels.
 */
export function renderUkrainianIdCard(
  input: IdCardRenderInput,
): IdCardRenderOutput {
  const title = 'Ukrainian ID Card — Identity Anchor Record'

  // Filter out suppressed fields (defensive — they should not be in input)
  const suppressedSet = new Set(ID_CARD_SUPPRESSED_FIELDS)
  const safeFields = input.fields.filter(f => !suppressedSet.has(f.field))
  const fieldMap = new Map(safeFields.map(f => [f.field, f]))

  // Build field lines in spec order
  const field_lines: string[] = []

  for (const key of ID_CARD_RENDER_ORDER) {
    const f = fieldMap.get(key)
    const label = ID_CARD_FIELD_LABELS[key] ?? key
    const value = f?.is_illegible ? '[illegible]' : (f?.value ?? '[not extracted]')
    field_lines.push(`${label}: ${value}`)
  }

  // Identity anchor note (no certification block — certificationTemplate: 'none')
  const identity_anchor_note = [
    'IDENTITY ANCHOR RECORD — FOR SPECIALIST REVIEW ONLY',
    '',
    'This record establishes the official bilingual identity (Latin and Cyrillic)',
    'for the immigration packet identity anchor. It is derived from the Ukrainian',
    'ID card (Посвідчення особи) and is NOT for direct USCIS submission without specialist review.',
    '',
    `Review Date: ${input.review_date}`,
    ...(input.reviewer_name ? [`Reviewer: ${input.reviewer_name}`] : []),
    '',
    'NOTE: Sensitive fields (personal tax number, MRZ raw data) have been suppressed',
    'from this record per data handling policy.',
    '',
    'IMPORTANT: Document Number and Record Number (УНЗР) are distinct fields.',
    'Document Number is the 9-digit printed card number.',
    'Record Number (УНЗР) is the registration number from MRZ optional data.',
  ].join('\n')

  // Forbidden phrase scan
  const allText = [title, ...field_lines, identity_anchor_note].join('\n')
  const forbidden_phrase_violations: string[] = []

  for (const phrase of FORBIDDEN_PHRASES) {
    if (allText.includes(phrase)) {
      forbidden_phrase_violations.push(`Forbidden phrase found: "${phrase}"`)
    }
  }

  return {
    title,
    field_lines,
    identity_anchor_note,
    forbidden_phrase_violations,
  }
}

// ── Suppression guard ─────────────────────────────────────────────────────────

/**
 * Verifies that a set of rendered field lines contains no suppressed field keys
 * or sensitive phrase patterns.
 *
 * Used by content guard to enforce that rnokpp and MRZ lines
 * are absent from any rendered output.
 */
export function auditIdCardRenderOutputForSuppressedFields(
  renderedLines: string[],
): { clean: boolean; violations: string[] } {
  const violations: string[] = []
  const text = renderedLines.join('\n')

  for (const phrase of FORBIDDEN_PHRASES) {
    if (text.includes(phrase)) {
      violations.push(`Suppressed phrase detected in render output: "${phrase}"`)
    }
  }

  return { clean: violations.length === 0, violations }
}
