/**
 * Bureau-Style Renderer -Messenginfo v5.0
 * Generates clean translation output. No internal QA notes.
 * No "CERTIFIED COPY". No forbidden phrases.
 * Final PDF locked behind payment + certification record.
 */
import { PacketState, ExtractedField, DocumentType } from './types'

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  ua_passport_booklet:    'Ukrainian Internal Passport (Booklet)',
  ua_passport_internal:   'Ukrainian Internal Passport (Booklet)',  // alias
  ua_passport_id_card:    'Ukrainian Passport (ID Card)',
  ua_passport_biometric:  'Ukrainian Biometric (Foreign) Passport',
  ua_birth_certificate:   'Ukrainian Birth Certificate',
  ua_marriage_certificate:'Ukrainian Marriage Certificate',
  ua_death_certificate:   'Ukrainian Death Certificate',
  ua_drivers_license:     'Ukrainian Driver\'s License',
  ua_diploma:             'Ukrainian University Diploma',
  ua_school_certificate:  'Ukrainian School Certificate',
  ua_military:            'Ukrainian Military Document',
  other:                  'Ukrainian Official Document',
}

export function buildScopeTitle(
  docType: DocumentType,
  uploadedPages: number,
  totalPages: number
): string {
  const label = DOC_TYPE_LABELS[docType] ?? 'Ukrainian Official Document'
  if (uploadedPages > 0 && uploadedPages < totalPages) {
    return `English Translation of the Provided ${label} Pages (pages 1-${uploadedPages} of ${totalPages})`
  }
  return `English Translation of ${label}`
}

export function renderTranslationHeader(state: PacketState): string {
  // v5 §17/§24 + final-plan 2.4: USCIS-safe EU format "12 May 1990"
  // (locale en-GB; day-month-year; no leading zero forced).
  const today = new Date().toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  return [
    'MESSENGINFO',
    'Document Translation Record',
    '',
    `Document Type: ${DOC_TYPE_LABELS[state.document_type ?? 'other']}`,
    `Translation Scope: ${state.scope_title}`,
    `Language Pair: Ukrainian -> English`,
    `Translation Date: ${today}`,
    `Session: ${state.session_id}`,
  ].join('\n')
}

export function renderFieldTable(fields: ExtractedField[]): string {
  const rows = fields
    .filter(f => f.normalized_value)
    .map(f => `${f.field.replace(/_/g, ' ').toUpperCase().padEnd(28)} ${f.normalized_value}`)
  return rows.join('\n')
}

export function renderCertificationBlock(state: PacketState): string {
  const cert = state.certification_record
  if (!cert) throw new Error('Cannot render certification block: CertificationRecord missing')

  // v5 §17/§24 + final-plan 2.4: USCIS-safe EU format "12 May 1990"
  const date = new Date(cert.signed_at).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return [
    '─'.repeat(60),
    'TRANSLATOR CERTIFICATION',
    '─'.repeat(60),
    '',
    cert.statement,
    '',
    `Translator: ${cert.signer_full_name}`,
    cert.address ? `Address: ${cert.address}` : '',
    `Date: ${date}`,
    '',
    `Signature (typed): ${cert.signature_typed_name}`,
    '',
    `Certification Version: ${cert.certification_version}`,
    '',
    'Messenginfo is not a law firm. This translation was prepared as an AI-assisted',
    'draft and reviewed and signed by the named human translator. The translator',
    'accepts full responsibility for accuracy under 8 CFR §103.2(b)(3).',
    'Verify current USCIS requirements at uscis.gov before filing.',
  ].filter(Boolean).join('\n')
}

export function renderSourceTraceTable(state: PacketState): string {
  const header = ['FIELD', 'SOURCE_ZONE', 'RAW_VALUE', 'NORMALIZED', 'CONF', 'REVIEW']
    .join(' | ')
  const sep = '─'.repeat(80)
  const rows = state.source_traces.map(t =>
    [
      t.field.padEnd(24),
      t.source_zone.padEnd(20),
      String(t.raw_value).slice(0, 20).padEnd(20),
      String(t.normalized_value).slice(0, 20).padEnd(20),
      t.confidence.toFixed(2),
      t.review_required ? 'YES' : 'NO',
    ].join(' | ')
  )
  return [sep, 'SOURCE TRACE (QA/Audit - not part of translation)', sep, header, sep, ...rows, sep].join('\n')
}

export function buildWatermarkedPreview(state: PacketState): string {
  return [
    '[DRAFT - NOT CERTIFIED - FOR REVIEW ONLY]',
    '',
    renderTranslationHeader(state),
    '',
    '─'.repeat(60),
    'EXTRACTED FIELDS (DRAFT)',
    '─'.repeat(60),
    renderFieldTable(state.extracted_fields),
    '',
    '[Payment and translator certification required for final document]',
    '[This draft is for review purposes only and is not a certified translation]',
  ].join('\n')
}

/**
 * buildFinalDocument — translation body used for QA text-checking.
 * The audit appendix (source trace table) is NOT included here because
 * the QA validator checks this text for forbidden phrases, and the
 * table heading intentionally contains audit-internal labels.
 * The PDF generator (generateTranslationPDF) includes source traces
 * independently via its sourceTraces parameter.
 */
export function buildFinalDocument(state: PacketState): string {
  if (!state.payment_confirmed) throw new Error('Payment not confirmed')
  if (!state.certification_record) throw new Error('Certification record missing')

  return [
    renderTranslationHeader(state),
    '',
    '─'.repeat(60),
    'ENGLISH TRANSLATION',
    '─'.repeat(60),
    '',
    renderFieldTable(state.extracted_fields),
    '',
    '',
    renderCertificationBlock(state),
  ].join('\n')
}
