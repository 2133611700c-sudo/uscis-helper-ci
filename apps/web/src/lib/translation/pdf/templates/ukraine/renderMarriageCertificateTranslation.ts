/**
 * renderMarriageCertificateTranslation — D6 PDF structured by the OFFICIAL
 * schema (KMU No.1025), NOT by eye. Sections follow schema.layoutSections;
 * labels from schema.sourceLabelEn; official source printed for traceability.
 * Uncertain → blank/[CONFIRM] (never guessed); seals = [bracketed notes].
 * English PDF: any stray non-WinAnsi (Cyrillic) char is stripped via safe().
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { marriageCertificateSchema as SCHEMA } from '../../../forms/ukraine/schemas/marriage-certificate.schema'
import { pdfSafe } from '../../renderValue'

export interface FieldValue { value: string; review: boolean; canRead: boolean }
const SECTION: Record<string, { title: string; groups: string[] }> = {
  groom: { title: 'HUSBAND', groups: ['groom'] },
  bride: { title: 'WIFE', groups: ['bride'] },
  marriage: { title: 'MARRIAGE', groups: ['marriage', 'actRecord'] },
  issuing: { title: 'STATE REGISTRATION', groups: ['issuing'] },
}
// PDF-safe rendering with NO silent data loss (was: silent strip). See renderValue.ts.
const safe = pdfSafe

export async function renderMarriageCertificateTranslation(
  values: Record<string, FieldValue>,
  opts: { signerName?: string; signerAddress?: string } = {},
): Promise<{ pdf: Buffer; unresolved: string[] }> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const W = 595, H = 842, M = 54
  const page = pdf.addPage([W, H])
  const dark = rgb(0.1, 0.09, 0.08), gray = rgb(0.45, 0.45, 0.45), warn = rgb(0.72, 0.4, 0), rule = rgb(0.78, 0.78, 0.78)
  let y = H - M
  const unresolved: string[] = []
  const C = (t: string, s: number, f = font, c = dark) => { const x = safe(t); page.drawText(x, { x: (W - f.widthOfTextAtSize(x, s)) / 2, y, size: s, font: f, color: c }); y -= s + 6 }
  const L = (t: string, s = 10, f = font, c = dark, x = M) => { page.drawText(safe(t), { x, y, size: s, font: f, color: c }); y -= s + 5 }
  const HR = () => { y -= 2; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rule }); y -= 9 }

  C('UKRAINE', 13, bold); C('[ State Emblem (Coat of Arms) of Ukraine ]', 8, ital, gray)
  C(SCHEMA.titleEn, 16, bold); y -= 2
  C('English translation - AI-assisted draft, pending human review & signature', 8, ital, gray); HR()

  for (const sec of SCHEMA.layoutSections) {
    const def = SECTION[sec as keyof typeof SECTION]
    if (!def) continue
    const flds = SCHEMA.fields.filter((f) => def.groups.includes(f.fieldGroup))
    if (!flds.length) continue
    L(def.title, 10, bold, gray)
    for (const f of flds) {
      const v = values[f.key]
      if (v && v.canRead && v.value && !v.review) L(`  ${f.sourceLabelEn}: ${v.value}`, 10)
      else if (v && v.canRead && v.value) { L(`  ${f.sourceLabelEn}: ${v.value}    [CONFIRM]`, 10, font, warn); unresolved.push(f.key) }
      else { L(`  ${f.sourceLabelEn}: ____________________  [enter from document]`, 10, font, warn); unresolved.push(f.key) }
    }
    y -= 3
  }
  HR()
  L('[ Official round seal - emblem and text not reproduced ]', 9, ital, gray)
  L('[ Signature of the head of the civil-registration body ]', 9, ital, gray); y -= 4
  HR()
  L("TRANSLATOR'S CERTIFICATION (8 CFR 103.2(b)(3))", 11, bold)
  L(`I, ${opts.signerName ?? '________________'}, certify that I am competent to translate from Ukrainian`, 10)
  L('into English and that the above is accurate and complete to the best of my knowledge.', 10); y -= 4
  L('Signature: ____________________   Date: ____________', 10)
  L(`Address: ${opts.signerAddress ?? '____________________'}`, 10); y -= 8
  L(`Official structure basis: KMU Resolution 1025 (2010) - ${SCHEMA.officialSource.url}`, 7, ital, gray)

  page.drawRectangle({ x: M - 14, y: 30, width: W - 2 * (M - 14), height: H - 60, borderColor: rule, borderWidth: 1 })
  return { pdf: Buffer.from(await pdf.save()), unresolved }
}
