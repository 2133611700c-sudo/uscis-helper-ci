/**
 * certificationPdf.verify.test.ts — zero-trust output check of the live flat PDF:
 * the certification statement, signer Name/Address/Date, the embedded signature
 * image, and the ABSENCE of the pre-review [CONFIRM] marker.
 * Cert-block text uses StandardFonts, so it is hex-decodable from the stream.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { inflateSync, inflateRawSync } from 'node:zlib'
import { generateTranslationPDF } from '../pdf'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function pdfText(buf: Buffer): string {
  const out: string[] = []
  let i = 0
  while (i < buf.length) {
    const s = buf.indexOf('stream', i); if (s < 0) break
    if (buf.toString('latin1', s - 3, s) === 'end') { i = s + 6; continue }
    let a = s + 6; if (buf[a] === 0x0d) a++; if (buf[a] === 0x0a) a++
    const e = buf.indexOf('endstream', a); if (e < 0) break
    let b = e; if (buf[b - 1] === 0x0a) b--; if (buf[b - 1] === 0x0d) b--
    const chunk = buf.subarray(a, b)
    try { out.push(inflateSync(chunk).toString('latin1')) }
    catch { try { out.push(inflateRawSync(chunk).toString('latin1')) } catch { out.push(chunk.toString('latin1')) } }
    i = e + 9
  }
  let decoded = ''
  for (const m of out.join('\n').matchAll(/<([0-9A-Fa-f]{2,})>/g)) { const h = m[1]; if (h.length % 2 === 0) decoded += Buffer.from(h, 'hex').toString('latin1') }
  return decoded
}

const ef = (field: string, normalized_value: string) => ({
  field, source_label: '', source_zone: 'identity_page', bbox: [0,0,0,0] as [number,number,number,number],
  raw_value: '', normalized_value, language_layer: 'latin', confidence: 0.9, review_required: false, passes: ['t'],
})

describe('certification PDF — zero-trust output', () => {
  let text = ''; let buf: Buffer
  beforeAll(async () => {
    buf = await generateTranslationPDF({
      scopeTitle: 'Birth Certificate', documentType: 'birth',
      fields: [ef('surname', 'IVANENKO')], sourceTraces: [],
      certificationRecord: {
        signer_full_name: 'Ivan Ivanenko', address: '1213 Gordon St, Los Angeles, CA 90038',
        language_pair_confirmed: true, statement: '', signature_typed_name: 'Ivan Ivanenko',
        signed_at: '2026-05-30T00:00:00Z', certification_version: 'self_cert_8cfr_v1',
      },
      sessionId: 'verify', signatureDataUrl: PNG,
    } as any)
    text = pdfText(buf)
  })

  it('contains the 8 CFR certification statement', () => {
    expect(text.toLowerCase()).toContain('competent to translate')
    expect(text.toLowerCase()).toContain('accurate and complete')
  })
  it('contains Name, Address and Date', () => {
    expect(text).toContain('Ivan Ivanenko')
    expect(text).toContain('1213 Gordon St')
    expect(text).toMatch(/202[0-9]/) // a date year
  })
  it('embeds the signature image (XObject)', () => {
    expect(buf.toString('latin1')).toContain('/Image')
  })
  it('contains NO [CONFIRM] marker in the final output', () => {
    expect(text).not.toContain('[CONFIRM]')
  })
})
