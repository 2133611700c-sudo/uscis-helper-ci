import { describe, it, expect } from 'vitest'
import { buildEadPacket } from '../packetBuilder'
import type { EadFieldData } from '../i765FieldMap'

/**
 * Integration test for the EAD packet builder — actually runs pdf-lib against
 * the shared USCIS I-765 PDF, verifies the integrity check passes and the
 * expected fields land. Catches what the field-map unit test can't:
 *  - I-765 PDF integrity hash mismatch (shared TPS asset path)
 *  - pdf-lib crashing on a field name (acroform mismatch)
 *  - 'applied' count anomalies
 */

const SAMPLE: EadFieldData = {
  appType: 'new',
  category: 'c11',
  firstName: 'Olena',
  lastName: 'Testenko',
  middleName: '',
  dob: '1985-06-25',
  countryOfBirth: 'Ukraine',
  alienNumber: 'A123456789',
  gender: 'female',
  usAddress: '1213 Gordon St, Los Angeles, CA 90038',
}

describe('EAD packetBuilder — pdf-lib integration', () => {
  it('produces a non-empty PDF buffer with expected edition + applied fields', async () => {
    const result = await buildEadPacket(SAMPLE)
    // Looks like a real PDF (PDF-1.x magic) and is reasonably sized.
    expect(result.pdfBytes.byteLength).toBeGreaterThan(50_000)
    const head = Buffer.from(result.pdfBytes.slice(0, 8)).toString('utf8')
    expect(head.startsWith('%PDF-')).toBe(true)
    // Edition pinned to current USCIS I-765
    expect(result.edition).toBe('08/21/25')
    // Should apply most ops; if applied===0 the PDF's AcroForm field names drifted.
    expect(result.applied).toBeGreaterThan(8)
  }, 30_000)

  it('omits Item 27 segments when category is "other" (PDF still generates)', async () => {
    const result = await buildEadPacket({ ...SAMPLE, category: 'other' })
    expect(result.pdfBytes.byteLength).toBeGreaterThan(50_000)
    expect(result.applied).toBeGreaterThan(5)
  }, 30_000)
})
