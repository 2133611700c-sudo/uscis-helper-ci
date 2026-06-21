/**
 * attestation.ts — the internal audit record for a signed translation.
 *
 * 8 CFR §103.2(b)(3) self-certification: we persist WHAT the user attested and
 * WHEN, so the order has a tamper-evident trail (which checkboxes, signature
 * present, signer identity present, a content hash, the certification version).
 * This is internal — it is NOT shown on the customer PDF.
 *
 * Stored inside the `certification_record` jsonb (no schema migration needed).
 */
import { createHash } from 'node:crypto'

export interface AttestationInput {
  dataReviewed?: boolean | null
  accuracyAttested?: boolean | null
  reviewConfirmed?: boolean | null
  signerName?: string | null
  signerAddress?: string | null
  signedAt?: string | null
  signatureMethod?: string | null
  signatureDataUrl?: string | null
  certificationVersion?: string | null
  /** Stable content to hash (e.g. the normalized field values). */
  content?: unknown
  /** ISO timestamp of when the record was created (injected for determinism). */
  recordedAt: string
}

export interface AttestationRecord {
  data_reviewed: boolean
  accuracy_attested: boolean
  review_confirmed: boolean
  signature_present: boolean
  signature_method: string | null
  signed_at: string | null
  certifier_name_present: boolean
  certifier_address_present: boolean
  document_hash: string
  certification_version: string | null
  recorded_at: string
}

/** sha256 of a stable JSON serialization of the certified content. */
export function contentHash(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(content ?? null)).digest('hex')
}

/** Build the internal attestation/audit record. Pure — no I/O. */
export function buildAttestationRecord(input: AttestationInput): AttestationRecord {
  const signaturePresent =
    input.signatureMethod === 'manual_wet_signature' ||
    (!!input.signatureDataUrl && String(input.signatureDataUrl).trim().length > 0)
  return {
    data_reviewed: input.dataReviewed === true || input.reviewConfirmed === true,
    accuracy_attested: input.accuracyAttested === true || input.reviewConfirmed === true,
    review_confirmed: input.reviewConfirmed === true,
    signature_present: signaturePresent,
    signature_method: input.signatureMethod ?? null,
    signed_at: input.signedAt ? String(input.signedAt) : null,
    certifier_name_present: !!(input.signerName ?? '').trim(),
    certifier_address_present: !!(input.signerAddress ?? '').trim(),
    document_hash: contentHash(input.content),
    certification_version: input.certificationVersion ?? null,
    recorded_at: input.recordedAt,
  }
}
