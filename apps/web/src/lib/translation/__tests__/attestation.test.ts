/**
 * attestation.test.ts — the internal audit record for a certified translation.
 */
import { describe, it, expect } from 'vitest'
import { buildAttestationRecord, contentHash } from '../attestation'

const AT = '2026-05-30T12:00:00.000Z'

describe('buildAttestationRecord', () => {
  it('records both checkboxes, signature presence, identity presence, hash, version', () => {
    const r = buildAttestationRecord({
      dataReviewed: true, accuracyAttested: true,
      signerName: 'Ivan', signerAddress: '1213 Gordon St',
      signedAt: AT, signatureMethod: 'drawn_on_screen', signatureDataUrl: 'data:image/png;base64,iVB',
      certificationVersion: 'self_cert_8cfr_v1', content: { surname: 'IVANENKO' }, recordedAt: AT,
    })
    expect(r.data_reviewed).toBe(true)
    expect(r.accuracy_attested).toBe(true)
    expect(r.signature_present).toBe(true)
    expect(r.certifier_name_present).toBe(true)
    expect(r.certifier_address_present).toBe(true)
    expect(r.certification_version).toBe('self_cert_8cfr_v1')
    expect(r.document_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(r.recorded_at).toBe(AT)
  })

  it('reflects missing attestations honestly', () => {
    const r = buildAttestationRecord({ recordedAt: AT })
    expect(r.data_reviewed).toBe(false)
    expect(r.accuracy_attested).toBe(false)
    expect(r.signature_present).toBe(false)
    expect(r.certifier_name_present).toBe(false)
    expect(r.certifier_address_present).toBe(false)
  })

  it('back-compat reviewConfirmed satisfies both checkboxes', () => {
    const r = buildAttestationRecord({ reviewConfirmed: true, recordedAt: AT })
    expect(r.data_reviewed).toBe(true)
    expect(r.accuracy_attested).toBe(true)
    expect(r.review_confirmed).toBe(true)
  })

  it('wet signature counts as present without a data URL', () => {
    expect(buildAttestationRecord({ signatureMethod: 'manual_wet_signature', recordedAt: AT }).signature_present).toBe(true)
  })

  it('document_hash is stable for the same content and differs for different content', () => {
    expect(contentHash({ a: 1 })).toBe(contentHash({ a: 1 }))
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }))
  })
})
