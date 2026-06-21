/**
 * Ukrainian Internal Passport (Booklet) — Customer PDF Template
 *
 * Companion to apps/web/src/lib/translation/bureauStyleRenderer.ts. The
 * legacy passport booklet is the ONLY auto-PDF customer-facing module
 * (status='active', allowAutoPdf=true). This template produces the
 * deterministic line layout the customer downloads.
 *
 * v5 §17 + UKRAINE_PASSPORT_BOOKLET_RULES.md.
 *
 * NOTE: Customer PDF MUST NOT contain:
 *   - source_trace / source trace
 *   - bbox / ocr_ids / confidence / raw_value
 *   - "CERTIFIED COPY"
 *   - "Round seal" / "Square seal" (translate seal text content, not shape)
 *   - "Police Department" / "passport police" (legacy MVS/militia for pre-2015)
 *   - "Translator Note" / "internal QA"
 *   - "certified by AI" / "USCIS accepted" / "guaranteed"
 *
 * Forbidden phrases enforced by translationQaValidator + renderForbiddenScan().
 */

export interface PassportBookletRenderField {
  field: string
  label: string
  value: string | null
  confirmed: boolean
}

export interface PassportBookletRenderInput {
  session_id: string
  fields: PassportBookletRenderField[]
  /** Pre-formatted EU date string, e.g. "12 May 1990". */
  translation_date: string
  /** Translator's typed legal name (signer of the certification). */
  signer_full_name: string
  /** Translator's US address. */
  signer_address: string
  /** Source language label, default "Ukrainian/Russian". */
  source_language?: string
}

export interface PassportBookletRenderOutput {
  title: string
  field_lines: string[]
  certification_block: string[]
  forbidden_phrase_violations: string[]
}

export const PASSPORT_BOOKLET_FIELD_LABELS: Record<string, string> = {
  document_type:                    'Document Type',
  passport_series:                  'Series',
  passport_number:                  'Number',
  surname:                          'Surname',
  given_name:                       'Given Name',
  patronymic:                       'Patronymic',  // NEVER "Middle Name"
  date_of_birth:                    'Date of Birth',
  place_of_birth:                   'Place of Birth',
  sex:                              'Sex',
  issuing_authority:                'Issued by',
  date_of_issue:                    'Date of Issue',
  // Extended (v5 §1):
  place_of_residence_registration:  'Registration of Place of Residence',
  marital_status:                   'Marital Status',
  identification_number:            'Identification Number',
}

export const PASSPORT_BOOKLET_FIELD_ORDER: ReadonlyArray<string> = [
  'document_type',
  'passport_series',
  'passport_number',
  'surname',
  'given_name',
  'patronymic',
  'date_of_birth',
  'place_of_birth',
  'sex',
  'issuing_authority',
  'date_of_issue',
  'place_of_residence_registration',
  'marital_status',
  'identification_number',
]

const FORBIDDEN_PHRASES = [
  'source trace', 'source_trace',
  'bbox', 'ocr_id', 'ocr_ids',
  'CERTIFIED COPY', 'certified copy',
  'Round seal', 'Square seal',
  'Police Department', 'passport police',
  'Translator Note', 'internal QA',
  'certified by AI',
  'USCIS accepted', 'USCIS-accepted',
  'guaranteed acceptance',
  'will be accepted by USCIS',
  // Patronymic must never be relabelled "Middle Name"
  'Middle Name',
] as const

/**
 * Render a passport booklet customer PDF (textual layout the actual PDF
 * generator can wrap into pages).
 */
export function renderPassportBooklet(
  input: PassportBookletRenderInput,
): PassportBookletRenderOutput {
  const title = 'CERTIFIED ENGLISH TRANSLATION\n\nUKRAINIAN INTERNAL PASSPORT (BOOKLET)'
  const field_lines: string[] = []

  // Index incoming fields for ordered render.
  const byKey = new Map<string, PassportBookletRenderField>()
  for (const f of input.fields) byKey.set(f.field, f)

  for (const key of PASSPORT_BOOKLET_FIELD_ORDER) {
    const f = byKey.get(key)
    if (!f) continue
    if (!f.value || !f.value.trim()) continue
    const label = f.label || PASSPORT_BOOKLET_FIELD_LABELS[key] || key
    if (label === 'Middle Name') {
      // Defensive — should never happen because the label table prevents it.
      continue
    }
    field_lines.push(`${label}: ${f.value}`)
  }

  const sourceLang = input.source_language ?? 'Ukrainian/Russian'

  const certification_block = [
    '─'.repeat(60),
    'CERTIFICATION OF TRANSLATION ACCURACY',
    '─'.repeat(60),
    '',
    `I, ${input.signer_full_name}, residing at ${input.signer_address || '[address on file]'}, certify that I am competent to translate from ${sourceLang} to English, and that the attached translation is accurate and complete to the best of my knowledge and belief. This certification is made pursuant to 8 CFR §103.2(b)(3). I accept full responsibility for the accuracy of this translation.`,
    '',
    `Translator: ${input.signer_full_name}`,
    `Signature:  ____________________________`,
    `Date:       ${input.translation_date}`,
  ]

  // Forbidden-phrase scan over both blocks.
  const allText = [title, ...field_lines, ...certification_block].join('\n')
  const forbidden_phrase_violations: string[] = []
  for (const phrase of FORBIDDEN_PHRASES) {
    if (allText.toLowerCase().includes(phrase.toLowerCase())) {
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
