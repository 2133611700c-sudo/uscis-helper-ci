/**
 * Translation QA Validator — Messenginfo v5.0
 * Runs all required validators before final render is allowed.
 * Returns PASS / FAIL / REVIEW_REQUIRED with actionable details.
 */
import { ExtractedField, CertificationRecord, PacketState, QAResult } from './types'

// content-guard: detection-list — these are phrases we DETECT and block, not product claims
// Phase C: UPL-safe additions — no legal advice, no immigration outcome claims
const FORBIDDEN_PHRASES = [
  // Original set
  'USCIS accepted', 'guaranteed', 'approved translation',
  'certified by AI', 'instant certified translation',
  '100% accepted', 'CERTIFIED COPY', 'Round seal',
  'Uploaded image', 'Police Department',
  // Phase 7: PDF-specific forbidden phrases
  'CERTIFIED COPY', 'certified copy', 'Page 1', 'Page 2',
  'Translator Note', 'internal QA', 'source trace', 'ocr_id',
  // Phase C: UPL-safe — no legal advice or immigration outcome claims
  'USCIS requires', 'USCIS will accept', 'USCIS will reject',
  'guaranteed acceptance', 'guaranteed to be accepted',
  'will cause denial', 'will cause RFE', 'RFE will',
  'legal advice', 'must file', 'case strategy',
  'You must file', 'USCIS requires you',
  'This is legally sufficient', 'This guarantees acceptance',
]

const CRITICAL_FIELDS_BY_DOCTYPE: Record<string, string[]> = {
  ua_passport_booklet: ['surname','given_names','date_of_birth','place_of_birth','series','number','issued_by','date_of_issue'],
  ua_birth_certificate: ['full_name','date_of_birth','place_of_birth','registration_number'],
  ua_marriage_certificate: ['spouse_1_name','spouse_2_name','date_of_marriage','registration_number'],
}

export function runQaValidators(state: PacketState, finalText?: string): QAResult {
  const failures: string[] = []
  const warnings: string[] = []
  const required_actions: string[] = []

  // 1a. Global source traces check — source_traces array must be present and non-empty
  //     when there are extracted fields. Every render requires audit trail.
  if (state.extracted_fields.length > 0 && state.source_traces.length === 0) {
    failures.push('No source traces provided — every extracted field must have a source trace (bbox + zone)')
    required_actions.push('Re-run extraction so source_traces is populated for all fields')
  }

  // 1b. Per-field source trace check for critical fields
  for (const field of state.extracted_fields) {
    const isCritical = (CRITICAL_FIELDS_BY_DOCTYPE[state.document_type ?? ''] ?? []).includes(field.field)
    const hasTrace = field.source_zone && field.bbox && field.bbox.length === 4
    if (isCritical && !hasTrace) {
      failures.push(`Critical field '${field.field}' has no source trace (bbox/zone missing)`)
      required_actions.push(`Re-extract '${field.field}' with full source trace`)
    }
  }

  // 2. Confidence check
  for (const field of state.extracted_fields) {
    if (field.confidence < 0.70 && !field.review_required) {
      failures.push(`Field '${field.field}' confidence ${field.confidence.toFixed(2)} < 0.70 but review_required not set`)
    }
    if (field.confidence >= 0.70 && field.confidence < 0.85 && !field.user_corrected) {
      warnings.push(`Field '${field.field}' confidence ${field.confidence.toFixed(2)} — user confirmation recommended`)
    }
  }

  // 3. Scope completeness
  if (state.uploaded_pages < state.total_pages_declared) {
    if (!state.scope_title.includes('Provided') && !state.scope_title.includes('pages')) {
      failures.push(
        `Partial upload (${state.uploaded_pages}/${state.total_pages_declared} pages) ` +
        `but scope_title does not reflect partial scope: '${state.scope_title}'`
      )
      required_actions.push('Update scope_title to reflect partial page set')
    }
  }

  // 4. Payment gate
  if (!state.payment_confirmed) {
    failures.push('Final render requested without payment_confirmed = true')
    required_actions.push('Complete Stripe payment before rendering final PDF')
  }

  // 5. Certification record
  if (!state.certification_record) {
    failures.push('Certification record missing — signer identity and typed signature required')
    required_actions.push('Collect certification record from user before final render')
  } else {
    const cert = state.certification_record
    if (!cert.signer_full_name) failures.push('Certification: signer_full_name missing')
    if (!cert.signature_typed_name) failures.push('Certification: signature_typed_name missing')
    if (!cert.language_pair_confirmed) failures.push('Certification: language_pair_confirmed is false')
    if (!cert.signed_at) failures.push('Certification: signed_at timestamp missing')
  }

  // 6. Forbidden phrases in final text
  if (finalText) {
    for (const phrase of FORBIDDEN_PHRASES) {
      if (finalText.toLowerCase().includes(phrase.toLowerCase())) {
        failures.push(`Forbidden phrase found in final output: "${phrase}"`)
        required_actions.push(`Remove or rewrite all instances of "${phrase}"`)
      }
    }
  }

  // 7. User correction classification
  for (const correction of state.user_corrections) {
    if (!correction.correction_class) {
      warnings.push(`User correction on '${correction.field}' has no correction_class — classify before adding to translation memory`)
    }
  }

  const status: QAResult['status'] =
    failures.length > 0 ? 'FAIL' :
    warnings.length > 0 ? 'REVIEW_REQUIRED' :
    'PASS'

  return { status, failures, warnings, required_actions }
}

export function validateServiceClaims(text: string): { ok: boolean; violations: string[] } {
  const violations: string[] = []
  for (const phrase of FORBIDDEN_PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push(phrase)
    }
  }
  return { ok: violations.length === 0, violations }
}
