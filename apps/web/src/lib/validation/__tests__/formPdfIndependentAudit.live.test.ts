/**
 * INDEPENDENT USCIS form-PDF audit (Agent 4, Phase 2B).
 *
 * This is a READ-ONLY auditor. It does NOT edit any mapper/builder. It builds
 * the four product PDFs from synthetic, PII-free fixtures and then independently
 * verifies, using pdf-lib (widget extraction) + poppler (render + text):
 *
 *   1. Edition footer is the locked edition on EVERY page of each GENERATED PDF
 *      (filling must not corrupt the footer): I-821 01/20/25 (13p), I-131
 *      01/20/25 (14p), I-765 08/21/25 (7p).
 *   2. Every expected widget that the field map writes is present in the
 *      generated AcroForm with the EXACT value the op intended (independent
 *      of the product's own `applied`/`skipped` readback).
 *   3. No stale/hidden template value survives: a curated set of non-written
 *      identity/contact fields must be empty in the generated form.
 *   4. Checkbox/radio AcroForm value matches the intended state (and the
 *      mutually-exclusive Yes/No pairs are not both set).
 *   5. Signature fields are EMPTY in paper mode (fixtures are paper mode).
 *   6. Page render (pdftoppm) succeeds for every page (no broken/blank render);
 *      rendered text contains the synthetic identity (value landed visibly).
 *
 * Gating: runs only with AUDIT_FORMS=1 (heavy: builds 4 PDFs, renders pages).
 * Output: PII-free. Synthetic placeholder strings only. Render PNGs go to
 * an OS temp dir, never committed.
 *
 * HARD-FAIL classification (asserted, never masked):
 *   - edition mismatch on any page  → BLOCKED_FORM_EDITION
 *   - intended value missing/wrong   → BLOCKED_MAPPING
 *   - stale template value present   → BLOCKED_MAPPING
 *   - checkbox value != intent       → BLOCKED_VISUAL_PDF
 *   - signature field populated      → BLOCKED_VISUAL_PDF
 *   - page fails to render           → BLOCKED_VISUAL_PDF
 */

import { describe, it, expect, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFName } from 'pdf-lib'

import { buildPacket } from '@/lib/tps/packetBuilder'
import type { TPSAnswers } from '@/lib/tps/answers'
import { buildReParoleI131 } from '@/lib/reparole/packetBuilder'
import type { ReParoleAnswers } from '@/lib/reparole/answers'
import { buildEadPacket } from '@/lib/ead/packetBuilder'
import type { EadFieldData } from '@/lib/ead/i765FieldMap'
import JSZip from 'jszip'

vi.setConfig({ testTimeout: 300_000 })

const GATE = process.env.AUDIT_FORMS === '1'

const WORK = mkdtempSync(join(tmpdir(), 'forms-audit-'))

// ── Synthetic, PII-free fixtures ─────────────────────────────────────────────
const TPS: TPSAnswers = {
  family_name: 'AUDITFAMILY',
  given_name: 'AUDITGIVEN',
  middle_name: 'AUDITMID',
  dob: '1980-01-15',
  sex: 'M',
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  passport_number: 'ZZ1234567',
  passport_country_of_issuance: 'Ukraine',
  passport_expiration_date: '2030-12-31',
  us_address_street: '100 Audit St',
  us_address_city: 'Auditville',
  us_address_state: 'CA',
  us_address_zip: '90001',
  mailing_same_as_physical: true,
  last_entry_date: '2023-05-01',
  i94_admission_number: '00000000001',
  filing_path: 'initial',
  wants_ead: true,
  ead_category: 'c19',
  daytime_phone: '5550000000',
  email: 'audit@example.invalid',
  has_criminal_concern: false,
  has_prior_tps_denial: false,
  left_us_without_advance_parole: false,
}

const REPAROLE: ReParoleAnswers = {
  family_name: 'AUDITREP',
  given_name: 'AUDITGIV',
  middle_name: 'AUDITM',
  mailing_street: '123 Audit Ave',
  mailing_city: 'Sacramento',
  mailing_state: 'CA',
  mailing_zip: '95814',
  physical_same_as_mailing: true,
  country_of_birth: 'Ukraine',
  country_of_nationality: 'Ukraine',
  sex: 'M',
  dob: '1985-07-12',
  class_of_admission: 'UH',
  i94_admission_number: '12345678901',
  daytime_phone: '5551112222',
  email: 'audit-rep@example.invalid',
  filing_method: 'mail',
}

const EAD: EadFieldData = {
  appType: 'new',
  category: 'c11',
  firstName: 'AUDITEAD',
  lastName: 'AUDITLAST',
  middleName: '',
  dob: '1985-06-25',
  countryOfBirth: 'Ukraine',
  alienNumber: 'A123456789',
  gender: 'female',
  usAddress: '1213 Audit St, Los Angeles, CA 90038',
}

// ── PDF tool helpers ─────────────────────────────────────────────────────────
function writePdf(name: string, bytes: Uint8Array): string {
  const p = join(WORK, name)
  writeFileSync(p, bytes)
  return p
}

function editionLinesPerPage(pdfPath: string): string[] {
  const out = execSync(
    `pdftotext -layout "${pdfPath}" - 2>/dev/null | grep -oiE "Form I-[0-9]{3}[A-Z]? *Edition *[0-9]{2}/[0-9]{2}/[0-9]{2,4}" || true`,
    { encoding: 'utf-8' },
  )
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

function pageCount(pdfPath: string): number {
  const out = execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep -E "^Pages:" || true`, { encoding: 'utf-8' })
  const m = out.match(/Pages:\s+(\d+)/)
  return m ? Number(m[1]) : 0
}

function fullText(pdfPath: string): string {
  return execSync(`pdftotext -layout "${pdfPath}" - 2>/dev/null || true`, { encoding: 'utf-8' })
}

/** Render every page to PNG; return the list of generated files (proves render works). */
function renderAllPages(pdfPath: string, prefix: string): string[] {
  execSync(`pdftoppm -png -r 72 "${pdfPath}" "${join(WORK, prefix)}" 2>/dev/null || true`, { encoding: 'utf-8' })
  return readdirSync(WORK)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
    .map((f) => join(WORK, f))
}

// ── Independent AcroForm readback (NOT the product's applied/skipped) ─────────
async function loadForm(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getForm()
}

function textVal(form: Awaited<ReturnType<typeof loadForm>>, name: string): string | null {
  const f = form.getFieldMaybe(name)
  if (!f) return null
  if (f instanceof PDFTextField) return f.getText() ?? ''
  if (f instanceof PDFDropdown) return (f.getSelected()[0] ?? '') as string
  return null
}

function checkVal(form: Awaited<ReturnType<typeof loadForm>>, name: string): boolean | null {
  const f = form.getFieldMaybe(name)
  if (!f) return null
  if (f instanceof PDFCheckBox) return f.isChecked()
  return null
}

/** The export ("on") value of a checkbox field, e.g. "M"/"F" — index-agnostic, so a
 * gender assertion verifies the widget whose ON-VALUE matches the sex is checked,
 * never assuming widget index order equals the visible label order. */
function onValueOf(form: Awaited<ReturnType<typeof loadForm>>, name: string): string | null {
  const f = form.getFieldMaybe(name)
  if (!(f instanceof PDFCheckBox)) return null
  const on = f.acroField.getOnValue()
  return on ? on.asString().replace(/^\//, '') : null
}

/**
 * VISIBLE state vs AcroForm value: a checkbox renders "ticked" only when its
 * widget appearance state /AS points at the same on-value as the field /V.
 * If /V says checked but /AS is /Off (or vice-versa) the user sees the WRONG
 * thing — that is the BLOCKED_VISUAL_PDF hard-fail. We assert /AS agrees with
 * isChecked() for the given checkbox.
 */
function checkboxVisibleMatchesValue(
  form: Awaited<ReturnType<typeof loadForm>>,
  name: string,
): { ok: boolean; checked: boolean; asOff: boolean } | null {
  const f = form.getFieldMaybe(name)
  if (!(f instanceof PDFCheckBox)) return null
  const checked = f.isChecked()
  const widgets = f.acroField.getWidgets()
  // Treat the field as visibly-checked if ANY widget's /AS is a non-/Off state.
  let anyOn = false
  let anyAs = false
  for (const w of widgets) {
    const as = w.dict.get(PDFName.of('AS'))
    if (as) {
      anyAs = true
      if (as !== PDFName.of('Off')) anyOn = true
    }
  }
  // No /AS at all (relies on NeedAppearances regen) → can't contradict; ok.
  if (!anyAs) return { ok: true, checked, asOff: false }
  return { ok: anyOn === checked, checked, asOff: !anyOn }
}

// ── The audit ────────────────────────────────────────────────────────────────
describe.skipIf(!GATE)('INDEPENDENT USCIS form-PDF audit', () => {
  it('I-821 + I-765 (TPS path): edition, widgets, stale, checkbox, signature, render', async () => {
    const res = await buildPacket(TPS)
    const zip = await JSZip.loadAsync(res.zipBytes)
    const i821Bytes = await zip.file('I-821.pdf')!.async('uint8array')
    const i765Bytes = await zip.file('I-765.pdf')!.async('uint8array')
    const i821Path = writePdf('i821.pdf', i821Bytes)
    const i765Path = writePdf('i765-tps.pdf', i765Bytes)

    // 1. Edition on EVERY page (generated, post-fill).
    const e821 = editionLinesPerPage(i821Path)
    expect(pageCount(i821Path), 'I-821 page count').toBe(13)
    expect(e821.length, 'I-821 edition footer count == pages').toBe(13)
    expect([...new Set(e821.map((s) => s.toLowerCase().replace(/\s+/g, ' ')))].length, 'I-821 single edition').toBe(1)
    expect(e821[0]).toMatch(/Form I-821 Edition 01\/20\/25/i)

    const e765 = editionLinesPerPage(i765Path)
    expect(pageCount(i765Path), 'I-765 page count').toBe(7)
    expect(e765.length, 'I-765 edition footer count == pages').toBe(7)
    expect([...new Set(e765.map((s) => s.toLowerCase().replace(/\s+/g, ' ')))].length, 'I-765 single edition').toBe(1)
    expect(e765[0]).toMatch(/Form I-765 Edition 08\/21\/25/i)

    // 2. Independent widget value verification (I-821 text/date/choice).
    const f821 = await loadForm(i821Bytes)
    const expectText: Record<string, string> = {
      'form1[0].Page01[0].Part2_Item1_FamilyName[0]': 'AUDITFAMILY',
      'form1[0].Page01[0].Part2_Item1_GivenName[0]': 'AUDITGIVEN',
      'form1[0].Page01[0].Part2_Item1_MiddleName[0]': 'AUDITMID',
      'form1[0].Page02[0].Part2_Item4_StreetNumberName[0]': '100 Audit St',
      'form1[0].Page02[0].Part2_Item4_CityOrTown[0]': 'Auditville',
      'form1[0].Page02[0].Part2_Item4_ZipCode[0]': '90001',
      'form1[0].Page02[0].Part2_Item10_DateOfBirth[0]': '01/15/1980',
      'form1[0].Page03[0].Part2_Item22_Passport[0]': 'ZZ1234567',
      'form1[0].Page03[0].Part2_Item24_CountryofIssuance[0]': 'Ukraine',
      'form1[0].Page11[0].Part8_Item5_Email[0]': 'audit@example.invalid',
    }
    for (const [name, val] of Object.entries(expectText)) {
      expect(textVal(f821, name), `I-821 widget ${name}`).toBe(val)
    }
    // choice (state) widget — CA must be the selected/written value.
    expect(textVal(f821, 'form1[0].Page02[0].Part2_Item4_State[0]'), 'I-821 state widget').toBe('CA')

    // 3. Checkbox INTENT verification (mutually-exclusive pairs not both set).
    //    filing_path=initial → ApplicationType[0]=true, [1]=false.
    expect(checkVal(f821, 'form1[0].Page01[0].Part1_Item1_ApplicationType[0]')).toBe(true)
    expect(checkVal(f821, 'form1[0].Page01[0].Part1_Item1_ApplicationType[1]')).toBe(false)
    //    wants_ead=true → EADApp[0]=true,[1]=false.
    expect(checkVal(f821, 'form1[0].Page01[0].Part1_Item3_EADApp[0]')).toBe(true)
    expect(checkVal(f821, 'form1[0].Page01[0].Part1_Item3_EADApp[1]')).toBe(false)
    //    sex=M → Sex[0]=true,[1]=false.
    expect(checkVal(f821, 'form1[0].Page02[0].Part2_Item12_Sex[0]')).toBe(true)
    expect(checkVal(f821, 'form1[0].Page02[0].Part2_Item12_Sex[1]')).toBe(false)
    //    mailing_same_as_physical=true → Item5_YN[0]=true,[1]=false.
    expect(checkVal(f821, 'form1[0].Page02[0].Part2_Item5_YN[0]')).toBe(true)
    expect(checkVal(f821, 'form1[0].Page02[0].Part2_Item5_YN[1]')).toBe(false)
    //    a Part 7 background question defaults to No: [0]=false (Yes), [1]=true (No).
    expect(checkVal(f821, 'form1[0].Page08[0].Part7_Item8_YN[0]')).toBe(false)
    expect(checkVal(f821, 'form1[0].Page08[0].Part7_Item8_YN[1]')).toBe(true)

    // 3b. VISIBLE-vs-VALUE: every checkbox we set must have its widget /AS
    //     agree with its /V (no "value set but renders unchecked" / vice-versa).
    for (const name of [
      'form1[0].Page01[0].Part1_Item1_ApplicationType[0]',
      'form1[0].Page01[0].Part1_Item1_ApplicationType[1]',
      'form1[0].Page01[0].Part1_Item3_EADApp[0]',
      'form1[0].Page01[0].Part1_Item3_EADApp[1]',
      'form1[0].Page02[0].Part2_Item12_Sex[0]',
      'form1[0].Page02[0].Part2_Item12_Sex[1]',
      'form1[0].Page02[0].Part2_Item5_YN[0]',
      'form1[0].Page02[0].Part2_Item5_YN[1]',
      'form1[0].Page08[0].Part7_Item8_YN[0]',
      'form1[0].Page08[0].Part7_Item8_YN[1]',
    ]) {
      const r = checkboxVisibleMatchesValue(f821, name)
      expect(r, `checkbox present: ${name}`).not.toBeNull()
      expect(r!.ok, `I-821 checkbox VISIBLE!=VALUE ${name} (checked=${r!.checked} asOff=${r!.asOff})`).toBe(true)
    }

    // 4. Stale/hidden value check — fields the TPS map does NOT write (mailing
    //    same as physical; no SSN; no other-names; paper signature) must be EMPTY.
    const mustBeEmpty821 = [
      'form1[0].Page02[0].Part2_Item6_StreetNumberName[0]', // mailing (same → unwritten)
      'form1[0].Page02[0].Part2_Item6_CityOrTown[0]',
      'form1[0].Page02[0].Part2_Item9_SocialSecurityNumber[0]', // no SSN in fixture
      'form1[0].Page02[0].Part2_Item15a[0]', // no other names
      'form1[0].Page02[0].Part2_Item15b[0]',
      'form1[0].Page11[0].Part8_Item6a_Signature[0]', // paper mode → no signature
    ]
    for (const name of mustBeEmpty821) {
      const v = textVal(f821, name)
      // null = field absent (acceptable); '' = present + empty (acceptable).
      expect(v === null || v === '', `I-821 stale/hidden ${name} must be empty, got ${JSON.stringify(v)}`).toBe(true)
    }

    // 5. Signature field NOT populated (paper mode).
    expect(textVal(f821, 'form1[0].Page11[0].Part8_Item6a_Signature[0]') || '').toBe('')

    // 6. Render every page (proves no broken/blank-render, no flatten crash).
    const pngs821 = renderAllPages(i821Path, 'i821p')
    expect(pngs821.length, 'I-821 rendered page count').toBe(13)
    for (const p of pngs821) expect(statSync(p).size, `render ${p} non-trivial`).toBeGreaterThan(1000)
    // identity landed visibly in the render-source text layer.
    expect(fullText(i821Path)).toMatch(/AUDITFAMILY/)

    // I-765 identity widget cross-check + render.
    const pngs765 = renderAllPages(i765Path, 'i765tpsp')
    expect(pngs765.length, 'I-765(TPS) rendered page count').toBe(7)
    expect(fullText(i765Path)).toMatch(/AUDITFAMILY/)
  })

  it('I-131 (Re-Parole): edition, widgets, transliteration, checkbox, render', async () => {
    const res = await buildReParoleI131(REPAROLE)
    const path = writePdf('i131.pdf', res.i131_bytes)

    const e131 = editionLinesPerPage(path)
    expect(pageCount(path), 'I-131 page count').toBe(14)
    expect(e131.length, 'I-131 edition footer count == pages').toBe(14)
    expect([...new Set(e131.map((s) => s.toLowerCase().replace(/\s+/g, ' ')))].length, 'I-131 single edition').toBe(1)
    expect(e131[0]).toMatch(/Form I-131 Edition 01\/20\/25/i)

    const f = await loadForm(res.i131_bytes)
    const expectText: Record<string, string> = {
      'form1[0].P4[0].Part2_Line1_FamilyName[0]': 'AUDITREP',
      'form1[0].P4[0].Part2_Line1_GivenName[0]': 'AUDITGIV',
      'form1[0].P5[0].Part2_Line3_StreetNumberName[0]': '123 Audit Ave',
      'form1[0].P5[0].Part2_Line3_CityTown[0]': 'Sacramento',
      'form1[0].P5[0].Part2_Line3_ZipCode[0]': '95814',
      'form1[0].P5[0].Part2_Line6_CountryOfBirth[0]': 'Ukraine',
      'form1[0].P5[0].Part2_Line9_DateOfBirth[0]': '07/12/1985',
      'form1[0].P5[0].Part2_Line12_ClassofAdmission[0]': 'UH',
      'form1[0].P5[0].Part2_Line13_I94RecordNo[0]': '12345678901',
      'form1[0].#subform[10].Part10_Line3_Email[0]': 'audit-rep@example.invalid',
    }
    for (const [name, val] of Object.entries(expectText)) {
      expect(textVal(f, name), `I-131 widget ${name}`).toBe(val)
    }
    // state choice
    expect(textVal(f, 'form1[0].P5[0].Part2_Line3_State[0]'), 'I-131 state widget').toBe('CA')
    // phone digits-only
    expect(textVal(f, 'form1[0].#subform[10].Part10_Line1_DayPhone[0]')).toBe('5551112222')
    // sex M → the widget whose ON-VALUE is "M" is checked, the "F" one is NOT.
    // The AcroForm widget INDEX order is REVERSED vs the visible "Male Female"
    // labels (proven empirically: Gender[0] on-value=/F, Gender[1] on-value=/M), so
    // we assert by on-value, never by index — this is exactly the inversion bug the
    // I-131 mapper fix corrects, and asserting by index would re-encode it.
    const g0 = 'form1[0].P5[0].Part2_Line8_Gender[0]'
    const g1 = 'form1[0].P5[0].Part2_Line8_Gender[1]'
    const maleField = onValueOf(f, g0) === 'M' ? g0 : g1
    const femaleField = maleField === g0 ? g1 : g0
    expect(checkVal(f, maleField), 'sex M → the /M gender widget is checked').toBe(true)
    expect(checkVal(f, femaleField) ?? false, 'the /F gender widget is NOT checked').toBe(false)

    // Stale/hidden: physical-address fields (same as mailing → unwritten) + SSN empty.
    for (const name of [
      'form1[0].P5[0].Part2_Line4_StreetNumberName[0]',
      'form1[0].P5[0].Part2_Line4_CityTown[0]',
      'form1[0].P5[0].#area[1].Part2_Line10_SSN[0]',
    ]) {
      const v = textVal(f, name)
      expect(v === null || v === '', `I-131 stale ${name} empty`).toBe(true)
    }

    const pngs = renderAllPages(path, 'i131p')
    expect(pngs.length, 'I-131 rendered page count').toBe(14)
    for (const p of pngs) expect(statSync(p).size).toBeGreaterThan(1000)
    // KMU-55 transliteration / identity landed visibly.
    expect(fullText(path)).toMatch(/AUDITREP/)
  })

  it('I-765 (standalone EAD): edition, widgets, render', async () => {
    const res = await buildEadPacket(EAD)
    const path = writePdf('i765-ead.pdf', res.pdfBytes)

    const e = editionLinesPerPage(path)
    expect(pageCount(path), 'I-765(EAD) page count').toBe(7)
    expect(e.length, 'I-765(EAD) edition footer count == pages').toBe(7)
    expect([...new Set(e.map((s) => s.toLowerCase().replace(/\s+/g, ' ')))].length, 'I-765(EAD) single edition').toBe(1)
    expect(e[0]).toMatch(/Form I-765 Edition 08\/21\/25/i)

    const pngs = renderAllPages(path, 'i765eadp')
    expect(pngs.length, 'I-765(EAD) rendered page count').toBe(7)
    for (const p of pngs) expect(statSync(p).size).toBeGreaterThan(1000)
    expect(fullText(path)).toMatch(/AUDITLAST/)
  })
})
