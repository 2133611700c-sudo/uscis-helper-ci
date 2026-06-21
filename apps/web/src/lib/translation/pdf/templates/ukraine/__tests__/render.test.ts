import { describe, it, expect } from 'vitest'
import { renderOfficialTranslation } from '../renderOfficialTranslation'
import { marriageCertificateSchema } from '../../../../forms/ukraine/schemas/marriage-certificate.schema'
import { birthCertificateSchema } from '../../../../forms/ukraine/schemas/birth-certificate.schema'
import { divorceCertificateSchema } from '../../../../forms/ukraine/schemas/divorce-certificate.schema'
import { deathCertificateSchema } from '../../../../forms/ukraine/schemas/death-certificate.schema'
import { nameChangeCertificateSchema } from '../../../../forms/ukraine/schemas/name-change-certificate.schema'

const schemas = [marriageCertificateSchema, birthCertificateSchema, divorceCertificateSchema, deathCertificateSchema, nameChangeCertificateSchema]

describe('renderOfficialTranslation — all civil-status schemas', () => {
  for (const s of schemas) {
    it(`${s.docType} → non-empty PDF, all fields unresolved when empty (never guessed)`, async () => {
      const { pdf, unresolved } = await renderOfficialTranslation(s, {}, { signerName: 'T' })
      expect(pdf.length).toBeGreaterThan(800)
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(unresolved.length).toBe(s.fields.length) // empty values → all need human, none guessed
    })
  }
})
