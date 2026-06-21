/**
 * translationBridge.ts — connects TPS Robot to Translation Engine v5.
 *
 * One upload → two products:
 * - TPS forms (I-821, I-765) via pdfPrefiller
 * - Translation PDF + Certification via generateTranslationHTML
 *
 * This bridge does NOT rebuild anything. It takes extracted fields
 * from TPSAnswers and feeds them into the existing translation templates.
 *
 * ADR-006: One upload, two products.
 */

// ── Types ────────────────────────────────────────────────────────────────

/** Document types that the TPS pipeline extracts */
export type TPSDocumentType =
  | 'passport'          // International passport (MRZ)
  | 'passportBooklet'   // Ukrainian internal passport
  | 'i94'               // I-94 Arrival/Departure Record
  | 'ead'               // Employment Authorization Document
  | 'i797'              // USCIS Approval Notice
  | 'dl'                // Driver License / State ID

/** Translation template identifier */
export type TranslationTemplate =
  | 'internationalPassport'
  | 'passportBooklet'

/** Contract between TPS wizard and Translation engine */
export interface TranslationBridgePayload {
  document_type: TPSDocumentType
  source_pages: Array<{
    page_index: number
    is_blank: boolean
    image_data_url?: string  // base64 for non-blank pages
  }>
  normalized_fields: Record<string, string>
  controlling_spellings: Record<string, string>
  review_required: string[]
  confidence_map: Record<string, number>
  locale: 'uk' | 'ru' | 'en' | 'es'
}

/** Result from translation generation */
export interface TranslationBridgeResult {
  translation_html: string
  certification_html: string
  document_type: TPSDocumentType
  template_used: TranslationTemplate
  translated_pages: number
  blank_pages: number
  fields_translated: number
  review_warnings: string[]
}

// ── Rules ────────────────────────────────────────────────────────────────

/**
 * Determines if a document type needs translation for TPS packet.
 *
 * Rule: translate ONLY foreign-language evidence documents.
 * I-94, I-797, EAD, DL are already in English → no translation needed.
 * 8 CFR §103.2(b)(3): "Any document in a foreign language must be
 * accompanied by a full English translation."
 */
export function shouldTranslateForTPSPacket(docType: TPSDocumentType): boolean {
  switch (docType) {
    case 'passportBooklet':     return true   // Ukrainian, always needs translation
    case 'passport':            return true   // Ukrainian passport, MRZ is Latin but doc is bilingual
    case 'i94':                 return false  // English (CBP document)
    case 'ead':                 return false  // English (USCIS document)
    case 'i797':                return false  // English (USCIS document)
    case 'dl':                  return false  // English (US state document)
    default:                    return false
  }
}

/**
 * Resolves which translation template to use for a document type.
 * Strict mapping — no guessing.
 */
export function resolveTranslationTemplate(docType: TPSDocumentType): TranslationTemplate | null {
  switch (docType) {
    case 'passportBooklet':     return 'passportBooklet'
    case 'passport':            return 'internationalPassport'
    default:                    return null
  }
}

/**
 * ZIP manifest — canonical file names for translation outputs.
 */
export function translationFileName(docType: TPSDocumentType): string {
  switch (docType) {
    case 'passportBooklet':     return 'Translation_Internal_Passport.pdf'
    case 'passport':            return 'Translation_International_Passport.pdf'
    default:                    return `Translation_${docType}.pdf`
  }
}

export const CERTIFICATION_FILENAME = 'Certification_Translation.pdf'

// ── Rendering ────────────────────────────────────────────────────────────

import {
  renderPassportBooklet,
  PASSPORT_BOOKLET_FIELD_LABELS,
  type PassportBookletRenderInput,
  type PassportBookletRenderField,
} from '@/lib/translation/templates/passportBooklet.template'
import type { TPSAnswers } from './answers'
import { formatDobForTranslation } from './translationExtractor'

/**
 * Maps TPSAnswers fields to passport booklet template fields.
 * Uses controlling spelling priority: DL/MRZ Latin > Cyrillic transliteration.
 */
function mapTPSToBookletFields(
  answers: TPSAnswers,
  controllingSpellings: Record<string, string>,
): PassportBookletRenderField[] {
  const get = (key: string): string =>
    controllingSpellings[key] || (answers as unknown as Record<string, string>)[key] || ''

  const placeOfBirth = [get('city_of_birth'), get('province_of_birth'), 'Ukraine']
    .filter(Boolean).join(', ')

  const rawDob = get('dob')
  const rawDateOfIssue = get('passport_date_of_issue')
  const fieldMap: Record<string, string> = {
    document_type: 'Internal Passport (Booklet) of Ukraine',
    passport_number: get('passport_number'),
    surname: get('family_name'),
    given_name: get('given_name'),
    patronymic: get('patronymic') || get('middle_name'),
    date_of_birth: rawDob ? (formatDobForTranslation(rawDob) ?? rawDob) : '',
    place_of_birth: placeOfBirth,
    sex: get('sex') === 'M' ? 'Male' : get('sex') === 'F' ? 'Female' : get('sex'),
    issuing_authority: get('issuing_authority'),
    date_of_issue: rawDateOfIssue ? (formatDobForTranslation(rawDateOfIssue) ?? rawDateOfIssue) : '',
    marital_status: get('marital_status'),
  }

  return Object.entries(fieldMap)
    .filter(([, v]) => v && v.trim())
    .map(([key, value]) => ({
      field: key,
      label: PASSPORT_BOOKLET_FIELD_LABELS[key] || key,
      value,
      confirmed: true,
    }))
}

/**
 * Generates translation text for a passport document in TPS packet.
 * Returns { translation_text, certification_text } ready for PDF rendering.
 *
 * This function delegates to the EXISTING passportBooklet.template.ts
 * from Translation Engine v5 — no new rendering logic.
 */
export function generateTPSTranslation(
  answers: TPSAnswers,
  docType: TPSDocumentType,
  signerName: string,
  signerAddress: string,
  signatureDataUrl: string | null,
  controllingSpellings: Record<string, string> = {},
): {
  translation_text: string
  certification_text: string
  translation_html: string
  certification_html: string
  violations: string[]
  _rawFields?: Record<string, string>
  _signerName?: string
  _signerAddress?: string
} | null {
  const template = resolveTranslationTemplate(docType)
  if (!template) return null

  if (template === 'passportBooklet') {
    const fields = mapTPSToBookletFields(answers, controllingSpellings)
    const input: PassportBookletRenderInput = {
      session_id: `tps-${Date.now()}`,
      fields,
      translation_date: new Date().toLocaleDateString('en-US', {
        day: 'numeric', month: 'long', year: 'numeric',
      }),
      signer_full_name: signerName || `${answers.given_name || ''} ${answers.family_name || ''}`.trim(),
      signer_address: signerAddress || [
        answers.us_address_street,
        answers.us_address_city,
        answers.us_address_state,
        answers.us_address_zip,
      ].filter(Boolean).join(', '),
      source_language: 'Ukrainian',
    }

    const result = renderPassportBooklet(input)

    const translationLines = [
      result.title,
      '',
      ...result.field_lines,
    ]

    const certLines = result.certification_block

    // Replace blank signature line with image if user signed on screen
    let certText = certLines.join('\n')
    if (signatureDataUrl) {
      certText = certText.replace(
        'Signature:  ____________________________',
        `Signature:  [SIGNED ELECTRONICALLY — image embedded]`,
      )
    }

    return {
      translation_text: translationLines.join('\n'),
      certification_text: certText,
      translation_html: renderTranslationHTML(result, input, signatureDataUrl),
      certification_html: renderCertificationHTML(input, certText, signatureDataUrl),
      violations: result.forbidden_phrase_violations,
      _rawFields: Object.fromEntries(
        fields.filter((f) => f.value !== null).map((f) => [f.field, f.value as string]),
      ),
      _signerName: input.signer_full_name,
      _signerAddress: input.signer_address,
    }
  }

  if (template === 'internationalPassport') {
    // International passport (загранпаспорт): fields come from MRZ (Latin names already).
    // Uses passportBooklet renderer with international document title.
    const get = (key: string): string =>
      controllingSpellings[key] || (answers as unknown as Record<string, string>)[key] || ''

    const rawDob = get('dob')
    const rawExpiry = get('passport_expiration_date')
    const rawIssue = get('passport_date_of_issue')

    const fieldMap: Record<string, string> = {
      document_type:    'International Passport of Ukraine',
      passport_number:  get('passport_number'),
      surname:          get('family_name'),
      given_name:       get('given_name'),
      patronymic:       get('patronymic') || get('middle_name'),
      date_of_birth:    rawDob ? (formatDobForTranslation(rawDob) ?? rawDob) : '',
      sex:              get('sex') === 'M' ? 'Male' : get('sex') === 'F' ? 'Female' : get('sex'),
      issuing_authority: get('issuing_authority') || get('issued_by'),
      date_of_issue:    rawIssue ? (formatDobForTranslation(rawIssue) ?? rawIssue) : '',
      date_of_issue_expiry: rawExpiry ? (formatDobForTranslation(rawExpiry) ?? rawExpiry) : '',
    }

    const fields: PassportBookletRenderField[] = Object.entries(fieldMap)
      .filter(([, v]) => v && v.trim())
      .map(([key, value]) => ({
        field: key,
        label: PASSPORT_BOOKLET_FIELD_LABELS[key] ?? key.replace(/_/g, ' '),
        value,
        confirmed: true,
      }))

    if (!fields.some((f) => f.field === 'surname')) return null

    const input: PassportBookletRenderInput = {
      session_id: `tps-intl-${Date.now()}`,
      fields,
      translation_date: new Date().toLocaleDateString('en-US', {
        day: 'numeric', month: 'long', year: 'numeric',
      }),
      signer_full_name: signerName || `${answers.given_name || ''} ${answers.family_name || ''}`.trim(),
      signer_address: signerAddress || [
        answers.us_address_street,
        answers.us_address_city,
        answers.us_address_state,
        answers.us_address_zip,
      ].filter(Boolean).join(', '),
      source_language: 'Ukrainian',
    }

    const result = renderPassportBooklet(input)
    const certLines = result.certification_block
    let certText = certLines.join('\n')
    if (signatureDataUrl) {
      certText = certText.replace(
        'Signature:  ____________________________',
        `Signature:  [SIGNED ELECTRONICALLY — image embedded]`,
      )
    }

    return {
      translation_text: [result.title, '', ...result.field_lines].join('\n'),
      certification_text: certText,
      translation_html: renderTranslationHTML(result, input, signatureDataUrl),
      certification_html: renderCertificationHTML(input, certText, signatureDataUrl),
      violations: result.forbidden_phrase_violations,
      _rawFields: fieldMap,
      _signerName: input.signer_full_name,
      _signerAddress: input.signer_address,
    }
  }

  return null
}

// ── HTML Renderers ───────────────────────────────────────────────────────

function renderTranslationHTML(
  result: { title: string; field_lines: string[] },
  input: PassportBookletRenderInput,
  _signatureDataUrl: string | null,
): string {
  const rows = result.field_lines.map((line) => {
    const [label, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    return `<tr><td style="padding:6px 12px;font-weight:600;white-space:nowrap;border-bottom:1px solid #ddd">${label}</td><td style="padding:6px 12px;border-bottom:1px solid #ddd">${value || '—'}</td></tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Translation — ${result.title}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;max-width:700px;margin:40px auto;padding:0 20px;color:#111;line-height:1.5}
h1{font-size:18px;text-align:center;margin-bottom:4px}
.sub{text-align:center;font-size:13px;color:#666;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
.footer{font-size:11px;color:#888;text-align:center;margin-top:40px;border-top:1px solid #ddd;padding-top:12px}
</style></head>
<body>
<h1>ENGLISH TRANSLATION</h1>
<div class="sub">${result.title}<br>Source language: ${input.source_language}<br>Date: ${input.translation_date}</div>
<table>${rows}</table>
<div class="footer">This translation was prepared using Messenginfo document translation tool.<br>
The user reviewed and certified this translation under 8 CFR §103.2(b)(3).</div>
</body></html>`
}

function renderCertificationHTML(
  input: PassportBookletRenderInput,
  certText: string,
  signatureDataUrl: string | null,
): string {
  const sigBlock = signatureDataUrl
    ? `<img src="${signatureDataUrl}" alt="Signature" style="max-width:280px;max-height:80px;display:block;margin:8px 0">`
    : '<div style="border-bottom:1px solid #111;width:280px;height:40px;margin:8px 0"></div>'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Translation Certification</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;max-width:700px;margin:40px auto;padding:0 20px;color:#111;line-height:1.8}
h1{font-size:18px;text-align:center;margin-bottom:24px}
.cert{border:2px solid #111;padding:24px;margin:20px 0;border-radius:4px}
.sig-label{font-size:13px;color:#666;margin-top:16px}
</style></head>
<body>
<h1>CERTIFICATION OF TRANSLATION</h1>
<div class="cert">
<p>I, <strong>${input.signer_full_name || '________________________'}</strong>, certify that I am competent to translate from ${input.source_language} to English, and that the attached translation of the document identified as <strong>Internal Passport of Ukraine</strong> is complete and accurate to the best of my abilities.</p>
<div class="sig-label">Signature:</div>
${sigBlock}
<p><strong>Name:</strong> ${input.signer_full_name || ''}<br>
<strong>Address:</strong> ${input.signer_address || ''}<br>
<strong>Date:</strong> ${input.translation_date}</p>
</div>
<p style="font-size:12px;color:#666">This certification complies with 8 CFR §103.2(b)(3). The translator certifies competence in the source and target languages. This is not a notarized translation. Messenginfo does not certify translations — the user self-certifies as the translator.</p>
</body></html>`
}

// ── Central Brain → Translation (v0) ─────────────────────────────────────────

import type { MergedField, RejectedField } from './centralBrain'
import { extractTranslationFields } from './translationExtractor'
import {
  guardTranslationCandidates,
  collectViolationStrings,
} from './translationCandidateSafetyGuard'

/**
 * Build a booklet translation directly from Central Brain merged output.
 *
 * Uses translationExtractor to get ALL fields for translation — including
 * fields that CB form contract blocks for the booklet slot (given_name, sex,
 * passport_number). These are acceptable for translation since the user
 * reviews before certifying (Review Gate, ADR-008).
 *
 * 8 CFR §103.2(b)(3): AI-generated output is a DRAFT. The signer certifies
 * as translator. Messenginfo does NOT certify translations.
 */
export function translateBookletFromBrain(
  merged: Record<string, MergedField>,
  opts: {
    signerName: string
    signerAddress: string
    signatureDataUrl?: string | null
    /** CB rejected fields — includes booklet-slot fields blocked by form contract */
    rejected?: RejectedField[]
    /** Manual wizard entries — lowest-priority fallback */
    manual?: Record<string, string>
  },
): {
  translation_html: string
  certification_html: string
  violations: string[]
  /** Structured field data for PDF generation. Key = field name, value = English value. */
  _rawFields?: Record<string, string>
  _signerName?: string
  _signerAddress?: string
} | null {
  const tf = extractTranslationFields(
    merged,
    opts.rejected ?? [],
    opts.manual ?? {},
  )

  // Safety guard — blocks forbidden phrases, Cyrillic leaks, label-as-value
  const guardResult = guardTranslationCandidates(tf)
  if (!guardResult.safe) {
    return {
      translation_html: '',
      certification_html: '',
      violations: collectViolationStrings(guardResult),
    }
  }

  const placeOfBirth = [tf.city_of_birth, tf.province_of_birth, 'Ukraine']
    .filter(Boolean).join(', ')

  const fieldMap: Record<string, string> = {
    document_type:     'Internal Passport (Booklet) of Ukraine',
    passport_number:   tf.passport_number ?? '',
    surname:           tf.family_name ?? '',
    given_name:        tf.given_name ?? '',
    patronymic:        tf.patronymic ?? '',
    date_of_birth:     tf.date_of_birth ?? '',
    place_of_birth:    placeOfBirth,
    sex:               tf.sex ?? '',
    issuing_authority: tf.issued_by ?? '',
    date_of_issue:     tf.date_of_issue ?? '',
  }

  const fields: PassportBookletRenderField[] = Object.entries(fieldMap)
    .filter(([, v]) => v && v.trim())
    .map(([key, value]) => ({
      field: key,
      label: PASSPORT_BOOKLET_FIELD_LABELS[key] ?? key,
      value,
      confirmed: true,
    }))

  // Need at least surname + one other meaningful field to produce a useful translation
  if (!fields.some((f) => f.field === 'surname')) return null

  const input: PassportBookletRenderInput = {
    session_id: `brain-${Date.now()}`,
    fields,
    translation_date: new Date().toLocaleDateString('en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    signer_full_name: opts.signerName,
    signer_address: opts.signerAddress,
    source_language: 'Ukrainian',
  }

  const result = renderPassportBooklet(input)
  return {
    translation_html: renderTranslationHTML(result, input, opts.signatureDataUrl ?? null),
    certification_html: renderCertificationHTML(
      input,
      result.certification_block.join('\n'),
      opts.signatureDataUrl ?? null,
    ),
    violations: result.forbidden_phrase_violations,
    _rawFields: fieldMap,
    _signerName: opts.signerName,
    _signerAddress: opts.signerAddress,
  }
}

/**
 * Checks if the TPS packet is complete regarding translations.
 * Returns list of missing translations (empty = all good).
 */
export function checkTranslationCompleteness(
  uploadedDocTypes: TPSDocumentType[],
  generatedTranslations: TPSDocumentType[],
): string[] {
  const missing: string[] = []
  for (const docType of uploadedDocTypes) {
    if (shouldTranslateForTPSPacket(docType)) {
      if (!generatedTranslations.includes(docType)) {
        missing.push(`Missing translation for ${docType}`)
      }
    }
  }
  return missing
}
