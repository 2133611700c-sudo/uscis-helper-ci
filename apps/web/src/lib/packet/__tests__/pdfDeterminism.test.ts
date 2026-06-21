/**
 * pdfDeterminism.test.ts — #195: the translation PDF must be byte-deterministic.
 *
 * The V2 immutable artifact is content-addressed by SHA-256 of the rendered
 * bytes (generated once, stored, exact bytes delivered). That guarantee is only
 * real if rendering the SAME input twice yields IDENTICAL bytes. Previously the
 * renderer stamped the wall-clock (Translation Date + pdf-lib CreationDate/
 * ModDate), so two renders differed. Now everything is anchored to the
 * certification's signed_at + fixed metadata.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { generateTranslationPDF } from '../pdf'

const ef = (field: string, normalized_value: string) => ({
  field, source_label: '', source_zone: 'identity_page', bbox: [0, 0, 0, 0] as [number, number, number, number],
  raw_value: '', normalized_value, language_layer: 'latin', confidence: 0.9, review_required: false, passes: ['t'],
})

const INPUT = {
  scopeTitle: 'Birth Certificate', documentType: 'birth',
  fields: [ef('surname', 'IVANENKO'), ef('given_name', 'IVAN')], sourceTraces: [],
  certificationRecord: {
    signer_full_name: 'Ivan Ivanenko', address: '1213 Gordon St, Los Angeles, CA 90038',
    language_pair_confirmed: true, statement: '', signature_typed_name: 'Ivan Ivanenko',
    signed_at: '2026-05-30T00:00:00Z', certification_version: 'self_cert_8cfr_v1',
  },
  sessionId: 'determinism-fixture',
} as const

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

describe('#195 — translation PDF byte determinism', () => {
  it('renders byte-identical bytes for the same input (stable content-address)', async () => {
    const a = await generateTranslationPDF(INPUT as never)
    const b = await generateTranslationPDF(INPUT as never)
    expect(sha(a)).toBe(sha(b))
    expect(a.length).toBe(b.length)
  })

  it('a different signed_at yields different bytes (the pinned date is really in the output, not ignored)', async () => {
    const a = await generateTranslationPDF(INPUT as never)
    const other = { ...INPUT, certificationRecord: { ...INPUT.certificationRecord, signed_at: '2025-01-02T00:00:00Z' } }
    const b = await generateTranslationPDF(other as never)
    expect(sha(a)).not.toBe(sha(b)) // determinism is from anchoring to signed_at, not from dropping the date
  })
})
