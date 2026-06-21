/**
 * buildPacket fixture tests — end-to-end PDF prefill on the server side.
 *
 * Locked guards:
 *   1. Synthetic fixture (no real PII).
 *   2. I-821 must apply >= 20 fields (threshold below today's 26 to allow
 *      USCIS rename churn without breaking CI; alert if it ever drops).
 *   3. I-765 must apply >= 15 fields (today's 21; same buffer).
 *   4. No unexpected skipped fields when the answers are minimally complete.
 *   5. Edition stamps preserved in the rendered PDF text:
 *      I-821 → "Form I-821 Edition 01/20/25"
 *      I-765 → "Form I-765 Edition 08/21/25"
 *   6. Each prefilled value lands somewhere in the extracted PDF text
 *      (smoke that the form-field map actually wrote it).
 *
 * Why this matters: the prod-only bugs we hit (encryption, XFA-hybrid,
 * minified constructor names) all silently passed typecheck and would
 * have passed any UI test that didn't actually open the rendered PDF.
 * This test runs the same code path the production API does.
 */

import { describe, it, expect, vi } from 'vitest'

// Each test calls buildPacket() which reads 2 USCIS PDFs (~1 MB each) from
// disk, runs SHA-256 integrity checks, fills AcroForm fields via pdf-lib,
// and generates a ZIP. Under full-suite parallel load (45 files), I/O
// contention pushes individual tests from ~8 s (solo) to 40–55 s.
vi.setConfig({ testTimeout: 120_000 })
import { execSync } from 'node:child_process'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'

import { buildPacket } from '../packetBuilder'
import type { TPSAnswers } from '../answers'

function expectKnownI821Skips(result: { skipped: number; firstSkips: string[] }) {
  // Known USCIS PDF drift in current i-821 edition:
  // Part7_Item4c_YN[0/1] names are missing in the form dictionary.
  // Allow only these two skips; fail on any other missing field.
  expect(result.skipped).toBeLessThanOrEqual(2)
  for (const s of result.firstSkips) {
    expect(s).toMatch(/Part7_Item4c_YN\[0\]|Part7_Item4c_YN\[1\]/)
  }
}

// Helper: read an AcroForm text-field value directly from the PDF bytes.
// Used to verify split per-digit cells (e.g. I-765 Line7 AlienNumber) where
// pdftotext may not reassemble the digits into a contiguous string.
async function readAcroFieldValue(bytes: Uint8Array, fieldName: string): Promise<string | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const form = doc.getForm()
    const field = form.getFieldMaybe(fieldName)
    if (!field) return null
    // TextField has getText(); fallback to empty string if not a text field.
    if ('getText' in field && typeof (field as { getText: () => string }).getText === 'function') {
      return (field as { getText: () => string }).getText() ?? null
    }
    return null
  } catch {
    return null
  }
}

// ── Synthetic fixture (no real PII — generic placeholder strings) ────────────
const fixtureInitialPath: TPSAnswers = {
  family_name: 'TESTFAMILY',
  given_name: 'TESTGIVEN',
  middle_name: 'TESTMID',
  dob: '1980-01-15',
  sex: 'M',
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  passport_number: 'XX0000000',
  passport_country_of_issuance: 'Ukraine',
  passport_expiration_date: '2030-12-31',
  us_address_street: '100 Test St',
  us_address_city: 'Testville',
  us_address_state: 'CA',
  us_address_zip: '90001',
  mailing_same_as_physical: true,
  last_entry_date: '2023-05-01',
  i94_admission_number: '00000000001',
  filing_path: 'initial',
  wants_ead: true,
  ead_category: 'c19',  // initial = pending TPS → (c)(19)
  daytime_phone: '5550000000',
  email: 'test@example.invalid',
  has_criminal_concern: false,
  has_prior_tps_denial: false,
  left_us_without_advance_parole: false,
}

// Helper: extract text from a PDF buffer using poppler's pdftotext.
function pdfToText(bytes: Uint8Array): string {
  const path = join(tmpdir(), `packet-test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  writeFileSync(path, bytes)
  try {
    return execSync(`pdftotext -layout "${path}" - 2>/dev/null`, { encoding: 'utf-8' })
  } catch {
    return ''
  } finally {
    if (existsSync(path)) unlinkSync(path)
  }
}

describe('buildPacket — TPS Ukraine initial-path fixture', () => {
  it('produces a ZIP with I-821.pdf, I-765.pdf, INSTRUCTION.txt and applies fields without skips', async () => {
    const result = await buildPacket(fixtureInitialPath)

    expect(result.zipBytes.byteLength).toBeGreaterThan(100_000)
    expect(result.i821.applied).toBeGreaterThanOrEqual(20)
    expectKnownI821Skips(result.i821)
    expect(result.i765.applied).toBeGreaterThanOrEqual(15)
    expect(result.i765.skipped).toBe(0)

    // Unzip and assert structure
    const zip = await JSZip.loadAsync(result.zipBytes)
    expect(zip.file('I-821.pdf')).not.toBeNull()
    expect(zip.file('I-765.pdf')).not.toBeNull()
    expect(zip.file('INSTRUCTION.txt')).not.toBeNull()
  })

  it('preserves the official USCIS edition stamps inside the rendered PDFs', async () => {
    const result = await buildPacket(fixtureInitialPath)
    const zip = await JSZip.loadAsync(result.zipBytes)

    const i821Bytes = await zip.file('I-821.pdf')!.async('uint8array')
    const i765Bytes = await zip.file('I-765.pdf')!.async('uint8array')

    const i821Text = pdfToText(i821Bytes)
    const i765Text = pdfToText(i765Bytes)

    // Edition stamps must survive the prefill + flatten round trip.
    expect(i821Text).toMatch(/Form I-821 Edition 01\/20\/25/)
    expect(i765Text).toMatch(/Form I-765 Edition 08\/21\/25/)
  })

  it('writes the applicant identity into both PDFs (proves the field map wired correctly)', async () => {
    const result = await buildPacket(fixtureInitialPath)
    const zip = await JSZip.loadAsync(result.zipBytes)

    const i821Text = pdfToText(await zip.file('I-821.pdf')!.async('uint8array'))
    const i765Text = pdfToText(await zip.file('I-765.pdf')!.async('uint8array'))

    // Family name + given name must appear in both forms.
    expect(i821Text).toMatch(/TESTFAMILY/)
    expect(i821Text).toMatch(/TESTGIVEN/)
    expect(i765Text).toMatch(/TESTFAMILY/)
    expect(i765Text).toMatch(/TESTGIVEN/)

    // I-821 specific fields: passport number, DOB in USCIS format MM/DD/YYYY
    expect(i821Text).toMatch(/XX0000000/)
    expect(i821Text).toMatch(/01\/15\/1980/)

    // I-765 specific: passport number, DOB, daytime phone, email
    expect(i765Text).toMatch(/XX0000000/)
    expect(i765Text).toMatch(/01\/15\/1980/)
    expect(i765Text).toMatch(/test@example\.invalid/)
  })

  it('handles re-registration path with EAD category A12', async () => {
    const reReg: TPSAnswers = { ...fixtureInitialPath, filing_path: 're_registration', ead_category: 'a12' }
    const result = await buildPacket(reReg)
    expect(result.i821.applied).toBeGreaterThanOrEqual(20)
    expectKnownI821Skips(result.i821)
    expect(result.i765.applied).toBeGreaterThanOrEqual(15)
    expect(result.i765.skipped).toBe(0)
  })

  it('routes A-Number + status_at_last_entry into both I-821 and I-765 (OCR EAD/I-94 payload)', async () => {
    // A-Number from EAD card (9 digits, no 'A' prefix) and class of
    // admission "UH" from I-94 — exactly the shape lib/tps/modules emits
    // and applyPreExtracted now writes onto the wizard answers.
    const withOcr: TPSAnswers = {
      ...fixtureInitialPath,
      a_number: '987654321',
      status_at_last_entry: 'UH',
    }
    const result = await buildPacket(withOcr)
    expectKnownI821Skips(result.i821)
    expect(result.i765.skipped).toBe(0)

    const zip = await JSZip.loadAsync(result.zipBytes)
    const i765Text = pdfToText(await zip.file('I-765.pdf')!.async('uint8array'))

    // I-821 Part 2 Item 7 AlienNumber and I-765 Line 7 AlienNumber are both
    // AcroForm split-cell fields. pdftotext does not reassemble per-digit
    // cells reliably. Verify via AcroForm field value — this is the real
    // contract: when a USCIS officer opens the PDF, the field holds the value.
    const i821FieldValue = await readAcroFieldValue(
      await zip.file('I-821.pdf')!.async('uint8array'),
      'form1[0].Page02[0].Part2_Item7_AlienNumber[0]',
    )
    expect(i821FieldValue).toBe('987654321')

    const i765FieldValue = await readAcroFieldValue(
      await zip.file('I-765.pdf')!.async('uint8array'),
      'form1[0].Page2[0].Line7_AlienNumber[0]',
    )
    expect(i765FieldValue).toBe('987654321')

    // Class of admission ("UH") lands in I-765 Line 23 — that one is a
    // regular text field that renders fine to pdftotext.
    expect(i765Text).toMatch(/UH/)
  })

  it('skips I-765 entirely when wants_ead is false', async () => {
    const noEad: TPSAnswers = { ...fixtureInitialPath, wants_ead: false, ead_category: null }
    const result = await buildPacket(noEad)
    expect(result.i821.applied).toBeGreaterThanOrEqual(20)
    expect(result.i765.applied).toBe(0)
    expect(result.i765.skipped).toBe(0)

    const zip = await JSZip.loadAsync(result.zipBytes)
    expect(zip.file('I-821.pdf')).not.toBeNull()
    // No EAD requested -> no I-765 in the ZIP.
    expect(zip.file('I-765.pdf')).toBeNull()
  })
})

// ── Forms manifest edition-drift guard ────────────────────────────────────────

describe('forms manifest edition drift guard', () => {
  it('forms_manifest.json reports every form as current_from_official_page', async () => {
    const path = join(process.cwd(), '..', '..', 'docs/uscis/forms/tps/forms_manifest.json')
    // Try repo-root resolution first (running tests from apps/web), fall
    // back to cwd-resolved path (running from repo root or CI).
    let manifestText: string
    try {
      manifestText = (await import('node:fs')).readFileSync(path, 'utf-8')
    } catch {
      const altPath = join(process.cwd(), 'docs/uscis/forms/tps/forms_manifest.json')
      manifestText = (await import('node:fs')).readFileSync(altPath, 'utf-8')
    }
    const manifest = JSON.parse(manifestText) as {
      forms: Record<string, { edition_match: string }>
    }
    const offenders = Object.entries(manifest.forms)
      .filter(([, m]) => m.edition_match !== 'current_from_official_page')
      .map(([k]) => k)
    expect(offenders).toEqual([])
  })
})

// ── Systematic PDF field readback ─────────────────────────────────────────────
//
// Instead of spot-checking 5-6 fields, this verifies EVERY op that
// buildI821Ops / buildI765Ops emits by reading the AcroForm field back
// from the generated PDF. If a field was "applied" but lands in the wrong
// AcroForm cell, or if the value is silently garbled, this catches it.

import { buildI821Ops } from '../forms/i821FieldMap'
import { buildI765Ops } from '../forms/i765FieldMap'

async function readAllAcroFields(
  pdfBytes: Uint8Array,
): Promise<Map<string, { type: string; value: string | boolean | null }>> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const result = new Map<string, { type: string; value: string | boolean | null }>()
  for (const field of form.getFields()) {
    const name = field.getName()
    if (field instanceof PDFTextField) {
      result.set(name, { type: 'text', value: field.getText() ?? null })
    } else if (field instanceof PDFCheckBox) {
      result.set(name, { type: 'checkbox', value: field.isChecked() })
    } else if (field instanceof PDFDropdown) {
      const sel = field.getSelected()
      result.set(name, { type: 'choice', value: sel.length > 0 ? sel[0] : null })
    }
  }
  return result
}

import { PDFTextField, PDFCheckBox, PDFDropdown } from 'pdf-lib'

describe('systematic PDF field readback — I-821', () => {
  it('every text AND checkbox op from buildI821Ops is readable back with correct value', async () => {
    const result = await buildPacket(fixtureInitialPath)
    const zip = await JSZip.loadAsync(result.zipBytes)
    const pdfBytes = await zip.file('I-821.pdf')!.async('uint8array')
    const fields = await readAllAcroFields(pdfBytes)
    const ops = buildI821Ops(fixtureInitialPath)

    const mismatches: string[] = []
    const checked: string[] = []
    let skippedCheckboxes = 0

    // Known XFA ghost fields that don't exist in AcroForm after XFA strip.
    // These are duplicated Part 7 items that pdf-lib creates ops for
    // but the actual PDF only has one copy of the field.
    const KNOWN_MISSING_CHECKBOX_FIELDS = new Set([
      'form1[0].Page07[0].Part7_Item4c_YN[0]',
      'form1[0].Page07[0].Part7_Item4c_YN[1]',
    ])

    for (const op of ops) {
      if (KNOWN_MISSING_CHECKBOX_FIELDS.has(op.field)) {
        skippedCheckboxes++
        continue
      }
      if (op.kind === 'checkbox') {
        // Checkbox readback: verify checked/unchecked state matches the op
        const entry = fields.get(op.field)
        if (!entry) {
          mismatches.push(`MISSING_CHECKBOX: ${op.field}`)
          continue
        }
        const expected = op.value === true || op.value === 'Yes'
        if (entry.value !== expected) {
          mismatches.push(`CHECKBOX_MISMATCH: ${op.field} (expected=${expected}, actual=${entry.value})`)
        }
        checked.push(op.field)
        continue
      }
      const entry = fields.get(op.field)
      if (!entry) {
        // Field not found in PDF — this is a mapping error.
        // Only flag if the op intended to write a non-empty value.
        if (op.value && String(op.value).length > 0) {
          mismatches.push(`MISSING: ${op.field}`)
        }
        continue
      }
      const expected = String(op.value)
      const actual = String(entry.value ?? '')
      if (actual !== expected) {
        // Mask PII: show field name and length delta, not raw values.
        mismatches.push(
          `MISMATCH: ${op.field} (expected ${expected.length} chars, got ${actual.length})`,
        )
      }
      checked.push(op.field)
    }

    // Evidence: how many fields were systematically verified?
    // With checkbox readback enabled, we verify text + checkbox fields.
    expect(checked.length).toBeGreaterThanOrEqual(50)
    expect(mismatches).toEqual([])
  })
})

describe('systematic PDF field readback — I-765', () => {
  it('every text AND checkbox op from buildI765Ops is readable back with correct value', async () => {
    const result = await buildPacket(fixtureInitialPath)
    const zip = await JSZip.loadAsync(result.zipBytes)
    const pdfBytes = await zip.file('I-765.pdf')!.async('uint8array')
    const fields = await readAllAcroFields(pdfBytes)
    const ops = buildI765Ops(fixtureInitialPath)

    const mismatches: string[] = []
    const checked: string[] = []
    let skippedCheckboxes = 0

    for (const op of ops) {
      if (op.kind === 'checkbox') {
        // I-765 has no known XFA ghost fields — all checkboxes readable
        const entry = fields.get(op.field)
        if (!entry) {
          mismatches.push(`MISSING_CHECKBOX: ${op.field}`)
          continue
        }
        const expected = op.value === true || op.value === 'Yes'
        if (entry.value !== expected) {
          mismatches.push(`CHECKBOX_MISMATCH: ${op.field} (expected=${expected}, actual=${entry.value})`)
        }
        checked.push(op.field)
        continue
      }
      const entry = fields.get(op.field)
      if (!entry) {
        if (op.value && String(op.value).length > 0) {
          mismatches.push(`MISSING: ${op.field}`)
        }
        continue
      }
      const expected = String(op.value)
      const actual = String(entry.value ?? '')
      if (actual !== expected) {
        mismatches.push(
          `MISMATCH: ${op.field} (expected ${expected.length} chars, got ${actual.length})`,
        )
      }
      checked.push(op.field)
    }

    expect(checked.length).toBeGreaterThanOrEqual(10)
    expect(mismatches).toEqual([])
  })
})
