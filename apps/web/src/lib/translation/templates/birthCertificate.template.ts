/**
 * Birth Certificate PDF Template — Messenginfo v6.0 (self_cert_birth_v1)
 *
 * Renders the customer-facing translated birth certificate PDF content.
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
 *   - "Middle Name" for the Patronymic field
 *
 * ALLOWED:
 *   - Clean English translation of all 14 critical fields
 *   - [illegible] only if explicitly confirmed during Evidence Review
 *   - Certification of Translation Accuracy block (self_cert_birth_v1)
 *   - Signature section (human translator name + date)
 *
 * Field display order follows Phase 9 spec exactly.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BirthCertRenderField {
  /** Field key matching birthCertificateModule.criticalFields[].key */
  field: string
  /** English label for PDF display */
  label: string
  /** Normalized English value, or '[illegible]' if confirmed, or null if missing */
  value: string | null
  /** True if this field was flagged review_required and confirmed by user */
  confirmed: boolean
  /** True if value is '[illegible]' — must be user-confirmed, not auto-set */
  is_illegible: boolean
}

export interface BirthCertRenderInput {
  session_id: string
  fields: BirthCertRenderField[]
  translator_name: string
  translator_address?: string
  translation_date: string     // ISO date string
  certification_version: string // e.g. 'self_cert_birth_v1'
}

export interface BirthCertRenderOutput {
  title: string
  field_lines: string[]
  certification_block: string
  forbidden_phrase_violations: string[]   // empty if clean
}

// ── Field display labels ───────────────────────────────────────────────────────
// CRITICAL: child_patronymic must NEVER be labeled "Middle Name"

const FIELD_LABELS: Record<string, string> = {
  document_type:              'Document Type',
  certificate_series:         'Certificate Series',
  certificate_number:         'Certificate Number',
  act_record_number:          'Act Record Number',
  act_record_date:            'Date of Act Record',
  child_surname:              "Child's Surname",
  child_given_name:           "Child's Given Name",
  child_patronymic:           "Child's Patronymic",      // NEVER "Middle Name"
  date_of_birth:              'Date of Birth',
  place_of_birth:             'Place of Birth',
  father_full_name:           "Father's Full Name",
  mother_full_name:           "Mother's Full Name",
  issuing_authority:          'Issuing Authority',
  date_of_issue:              'Date of Issue',
  // Optional
  citizenship:                'Citizenship',
  sex:                        'Sex',
  registration_place:         'Registration Place',
  repeated_certificate_marker:'Repeated Certificate',
  readable_stamp_text:        'Stamp Text',
  document_language_layer:    'Document Language',
  archive_or_duplicate_note:  'Archive / Duplicate Note',
}

// ── Render order (Phase 9 spec) ───────────────────────────────────────────────

const RENDER_ORDER: readonly string[] = [
  'document_type',
  'certificate_series',
  'certificate_number',
  'act_record_number',
  'act_record_date',
  'child_surname',
  'child_given_name',
  'child_patronymic',
  'date_of_birth',
  'place_of_birth',
  'father_full_name',
  'mother_full_name',
  'issuing_authority',
  'date_of_issue',
]

// ── Forbidden phrases (mirrors content guard list) ────────────────────────────

const FORBIDDEN_PHRASES = [
  'source trace',
  'SOURCE TRACE',
  'ocr_id',
  'ocr_ids',
  'bbox',
  'bounding box',
  'confidence',
  'raw JSON',
  'internal QA',
  'debug',
  'CERTIFIED COPY',
  'certified by AI',
  'Translator Note',
  'guaranteed',
  'USCIS accepted',
  'round seal',
  'middle name',       // Patronymic must never be "Middle Name"
  'Middle Name',
]

// ── Main render function ───────────────────────────────────────────────────────

/**
 * Render the birth certificate translation for PDF output.
 *
 * Validates:
 *   - No forbidden phrases in output
 *   - child_patronymic labeled as "Patronymic" not "Middle Name"
 *   - [illegible] only appears for user-confirmed illegible fields
 *   - certificate_number and act_record_number both present if available
 *
 * Returns field_lines for PDF body and certification_block for page 2.
 * Also returns any forbidden_phrase_violations (must be empty before rendering).
 */
export function renderBirthCertificate(input: BirthCertRenderInput): BirthCertRenderOutput {
  const fieldMap = new Map(input.fields.map(f => [f.field, f]))

  // Build field lines in canonical order
  const field_lines: string[] = []

  for (const key of RENDER_ORDER) {
    const f = fieldMap.get(key)
    const label = FIELD_LABELS[key] ?? key

    if (!f || f.value === null) {
      field_lines.push(`${label}: [not provided]`)
      continue
    }

    if (f.is_illegible && !f.confirmed) {
      // [illegible] must be user-confirmed — auto-set is forbidden
      field_lines.push(`${label}: [illegible — pending confirmation]`)
      continue
    }

    field_lines.push(`${label}: ${f.value}`)
  }

  // Build certification block (self_cert_birth_v1)
  // v5 §17/§24 + final-plan 2.4: USCIS-safe EU format "12 May 1990"
  const dateFormatted = new Date(input.translation_date).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const certification_block = [
    '─'.repeat(60),
    'CERTIFICATION OF TRANSLATION ACCURACY',
    '─'.repeat(60),
    '',
    'I, the undersigned, certify that I am competent to translate from',
    'Ukrainian to English, and that the above is a true and accurate',
    'translation of the Ukrainian birth certificate (Свідоцтво про народження)',
    'to the best of my knowledge and ability.',
    '',
    `Translator: ${input.translator_name}`,
    input.translator_address ? `Address: ${input.translator_address}` : '',
    `Date: ${dateFormatted}`,
    '',
    'Signature: ________________________',
    '',
    `Certification Version: ${input.certification_version}`,
    '',
    'This translation was prepared with AI assistance and reviewed by the named',
    'human translator. The translator accepts responsibility for accuracy under',
    '8 CFR §103.2(b)(3). Verify current USCIS requirements at uscis.gov.',
  ].filter(Boolean).join('\n')

  // Scan for forbidden phrases
  const allText = [
    'English Translation of Ukrainian Birth Certificate',
    ...field_lines,
    certification_block,
    ...RENDER_ORDER.map(k => FIELD_LABELS[k] ?? k),
  ].join('\n')

  const forbidden_phrase_violations: string[] = []
  for (const phrase of FORBIDDEN_PHRASES) {
    if (allText.includes(phrase)) {
      forbidden_phrase_violations.push(`Forbidden phrase detected: "${phrase}"`)
    }
  }

  return {
    title: 'English Translation of Ukrainian Birth Certificate',
    field_lines,
    certification_block,
    forbidden_phrase_violations,
  }
}

// ── Gate: block render if critical fields missing or not confirmed ─────────────

export interface RenderGateResult {
  allowed: boolean
  missing_critical_fields: string[]
  unconfirmed_critical_fields: string[]
  reason?: string
}

/** Critical fields that MUST be confirmed before PDF is allowed */
const CRITICAL_RENDER_FIELDS: readonly string[] = RENDER_ORDER

/**
 * Check whether birth certificate PDF render is allowed.
 * Blocks if any critical field is missing or not user-confirmed.
 */
export function checkBirthCertRenderGate(
  input: BirthCertRenderInput,
): RenderGateResult {
  const fieldMap = new Map(input.fields.map(f => [f.field, f]))

  const missing_critical_fields: string[] = []
  const unconfirmed_critical_fields: string[] = []

  for (const key of CRITICAL_RENDER_FIELDS) {
    const f = fieldMap.get(key)
    if (!f || f.value === null) {
      missing_critical_fields.push(key)
    } else if (!f.confirmed) {
      unconfirmed_critical_fields.push(key)
    }
  }

  const allowed =
    missing_critical_fields.length === 0 &&
    unconfirmed_critical_fields.length === 0

  return {
    allowed,
    missing_critical_fields,
    unconfirmed_critical_fields,
    reason: !allowed
      ? `Render blocked: ${missing_critical_fields.length} missing, ` +
        `${unconfirmed_critical_fields.length} unconfirmed critical fields.`
      : undefined,
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export { FIELD_LABELS, RENDER_ORDER, FORBIDDEN_PHRASES }
