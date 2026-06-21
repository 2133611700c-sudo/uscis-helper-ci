/**
 * Certification Record — Messenginfo v5.0
 * 8 CFR §103.2(b)(3) self-certification template.
 * AI drafts. Human signs. Never call it certified until record is complete.
 */
import { CertificationRecord } from './types'

export const CERTIFICATION_VERSION = 'v1.0-8cfr-2026'

export const CERTIFICATION_STATEMENT = `I, [SIGNER_NAME], residing at [SIGNER_ADDRESS], certify that I am competent to translate from [SOURCE_LANGUAGE] to English, and that the attached translation is accurate and complete to the best of my knowledge and belief. This certification is made pursuant to 8 CFR §103.2(b)(3). I accept full responsibility for the accuracy of this translation.`

export function buildCertificationStatement(
  signerName: string,
  signerAddress: string,
  sourceLanguage: string
): string {
  return CERTIFICATION_STATEMENT
    .replace('[SIGNER_NAME]', signerName)
    .replace('[SIGNER_ADDRESS]', signerAddress || '[address on file]')
    .replace('[SOURCE_LANGUAGE]', sourceLanguage)
}

export function validateCertificationRecord(record: CertificationRecord): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!record.signer_full_name?.trim()) errors.push('signer_full_name is required')
  if (!record.signature_typed_name?.trim()) errors.push('signature_typed_name is required')
  if (!record.language_pair_confirmed) errors.push('language_pair_confirmed must be true')
  if (!record.signed_at) errors.push('signed_at timestamp is required')
  if (!record.statement?.includes('8 CFR §103.2(b)(3)')) {
    errors.push('statement must reference 8 CFR §103.2(b)(3)')
  }

  // Name must match
  if (
    record.signer_full_name &&
    record.signature_typed_name &&
    record.signer_full_name.trim().toLowerCase() !== record.signature_typed_name.trim().toLowerCase()
  ) {
    errors.push('signer_full_name and signature_typed_name must match exactly')
  }

  return { valid: errors.length === 0, errors }
}

export function buildCertificationRecord(params: {
  signerName: string
  signerAddress?: string
  signerPhone?: string
  signerEmail?: string
  sourceLanguage: string
  signatureTypedName: string
}): CertificationRecord {
  return {
    signer_full_name: params.signerName,
    language_pair_confirmed: true,
    statement: buildCertificationStatement(
      params.signerName,
      params.signerAddress ?? '',
      params.sourceLanguage
    ),
    signature_typed_name: params.signatureTypedName,
    signed_at: new Date().toISOString(),
    address: params.signerAddress,
    phone: params.signerPhone,
    email: params.signerEmail,
    certification_version: CERTIFICATION_VERSION,
  }
}
