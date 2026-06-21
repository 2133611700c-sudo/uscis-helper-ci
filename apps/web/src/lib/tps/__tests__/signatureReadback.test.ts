import { describe, test, expect } from 'vitest'
import { buildPacket } from '../packetBuilder'
import { PDFDocument } from 'pdf-lib'
import type { TPSAnswers } from '../answers'

const BASE = {
  filing_path: 'initial',
  filing_method: 'paper',
  wants_ead: true,
  family_name: 'TESTENKO',
  given_name: 'IVAN',
  middle_name: 'Petrovych',
  dob: '01/15/1990',
  sex: 'M',
  country_of_nationality: 'Ukraine',
  passport_number: 'FE123456',
  passport_country_of_issuance: 'Ukraine',
  passport_expiration_date: '01/15/2030',
  us_address_street: '123 Main St',
  us_address_city: 'Los Angeles',
  us_address_state: 'CA',
  us_address_zip: '90001',
  daytime_phone: '2135550000',
  email: 'test@test.com',
  marital_status: 'single',
  country_of_birth: 'Ukraine',
  mailing_same_as_physical: true,
  last_entry_date: '03/15/2022',
  ead_category: 'C19',
  has_criminal_concern: false,
  has_prior_tps_denial: false,
  left_us_without_advance_parole: false,
} as unknown as TPSAnswers

describe('Signature PDF readback proof', () => {
  test('screen mode: /s/ IVAN TESTENKO appears in I-821 signature field', async () => {
    const answers: TPSAnswers = {
      ...BASE,
      _signature_mode: 'screen',
      _signature_name: 'IVAN TESTENKO',
      _signature_date: '05/24/2026',
    }
    const result = await buildPacket(answers)
    const pdf = await PDFDocument.load(result.zipBytes.buffer ? result.zipBytes : new Uint8Array(result.zipBytes))

    // Actually parse the ZIP to get I-821.pdf
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(result.zipBytes)
    const i821Bytes = await zip.file('I-821.pdf')!.async('uint8array')
    const i821 = await PDFDocument.load(i821Bytes)
    const form = i821.getForm()

    const sigField = form.getTextField('form1[0].Page11[0].Part8_Item6a_Signature[0]')
    const sigValue = sigField.getText()
    expect(sigValue).toBe('/s/ IVAN TESTENKO')

    const dateField = form.getTextField('form1[0].Page11[0].Part8_Item6b_DateofSignature[0]')
    const dateValue = dateField.getText()
    expect(dateValue).toBe('05/24/2026')
  })

  test('screen mode: /s/ IVAN TESTENKO appears in I-765 signature field', async () => {
    const answers: TPSAnswers = {
      ...BASE,
      _signature_mode: 'screen',
      _signature_name: 'IVAN TESTENKO',
      _signature_date: '05/24/2026',
    }
    const result = await buildPacket(answers)

    // Debug: check which fields were skipped
    console.log('I-765 skips:', result.i765.firstSkips)

    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(result.zipBytes)
    const i765Bytes = await zip.file('I-765.pdf')!.async('uint8array')
    const i765 = await PDFDocument.load(i765Bytes)
    const form = i765.getForm()

    const sigField = form.getTextField('form1[0].Page4[0].Pt3Line7a_Signature[0]')
    expect(sigField.getText()).toBe('/s/ IVAN TESTENKO')

    const dateField = form.getTextField('form1[0].Page4[0].Pt3Line7b_DateofSignature[0]')
    expect(dateField.getText()).toBe('05/24/2026')
  })

  test('paper mode: signature fields are empty', async () => {
    const answers: TPSAnswers = {
      ...BASE,
      _signature_mode: 'paper',
    }
    const result = await buildPacket(answers)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(result.zipBytes)

    const i821Bytes = await zip.file('I-821.pdf')!.async('uint8array')
    const i821 = await PDFDocument.load(i821Bytes)
    const i821Form = i821.getForm()
    const i821Sig = i821Form.getTextField('form1[0].Page11[0].Part8_Item6a_Signature[0]')
    expect(i821Sig.getText() || '').toBe('')

    const i765Bytes = await zip.file('I-765.pdf')!.async('uint8array')
    const i765 = await PDFDocument.load(i765Bytes)
    const i765Form = i765.getForm()
    const i765Sig = i765Form.getTextField('form1[0].Page4[0].Pt3Line7a_Signature[0]')
    expect(i765Sig.getText() || '').toBe('')
  })
})
