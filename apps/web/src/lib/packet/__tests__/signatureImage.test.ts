/**
 * signatureImage.test.ts — the drawn finger/stylus signature is embedded as an
 * image in the certification block. Without it, the PDF carries no image XObject;
 * a corrupt data URL must not crash the render (falls back to the typed signature).
 */
import { describe, it, expect } from 'vitest'
import { generateTranslationPDF } from '../pdf'

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const ef = (field: string, normalized_value: string) => ({
  field, source_label: '', source_zone: 'identity_page', bbox: [0, 0, 0, 0] as [number, number, number, number],
  raw_value: '', normalized_value, language_layer: 'latin', confidence: 0.9, review_required: false, passes: ['test'],
})

const baseInput = (signatureDataUrl?: string | null) => ({
  scopeTitle: 'Birth Certificate', documentType: 'birth',
  fields: [ef('surname', 'IVANENKO')],
  sourceTraces: [],
  certificationRecord: {
    signer_full_name: 'Test Translator', address: '1213 Gordon St, Los Angeles, CA 90038',
    language_pair_confirmed: true, statement: 'x', signature_typed_name: 'Test Translator',
    signed_at: '2026-05-30T00:00:00Z', certification_version: 'v1',
  },
  sessionId: 'test-session',
  signatureDataUrl,
})

describe('certification PDF — drawn signature image', () => {
  it('embeds an image XObject when a PNG signature is provided', async () => {
    const buf = await generateTranslationPDF(baseInput(PNG) as any)
    expect(buf.toString('latin1', 0, 5)).toBe('%PDF-')
    expect(buf.toString('latin1')).toContain('/Image')
  })

  it('carries NO image XObject when no signature is provided', async () => {
    const buf = await generateTranslationPDF(baseInput(null) as any)
    expect(buf.toString('latin1')).not.toContain('/Subtype /Image')
  })

  it('does not crash on a corrupt signature data URL (falls back to typed)', async () => {
    const buf = await generateTranslationPDF(baseInput('data:image/png;base64,not-real-base64!!') as any)
    expect(buf.toString('latin1', 0, 5)).toBe('%PDF-')
  })
})
