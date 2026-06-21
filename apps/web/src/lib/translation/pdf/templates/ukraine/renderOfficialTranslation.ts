/** Generic D6 renderer for ANY official UA schema (marriage/birth/divorce/death/...).
 *  Sections from schema.layoutSections; labels from sourceLabelEn; uncertain→blank/[CONFIRM];
 *  seals=[bracketed]; English PDF, non-WinAnsi stripped. */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { OfficialFormSchema } from '../../../forms/ukraine/schemas/types'
import { pdfSafe } from '../../renderValue'

export interface FieldValue { value: string; review: boolean; canRead: boolean }
const GROUP_TITLE: Record<string, string> = {
  groom: 'HUSBAND', bride: 'WIFE', child: 'CHILD', parents: 'PARENTS', deceased: 'DECEASED',
  person: 'PERSON', marriage: 'MARRIAGE', dissolution: 'DISSOLUTION', actRecord: 'ACT RECORD',
  issuing: 'STATE REGISTRATION', previous: 'NAME BEFORE CHANGE', new: 'NAME AFTER CHANGE',
  holder: 'HOLDER', document: 'DOCUMENT',
}
// PDF-safe rendering with NO silent data loss: KMU-55 transliterate Cyrillic,
// map typographic symbols, mark anything still unrenderable. (was: silent strip)
const safe = pdfSafe

export interface ExtraEntry { key: string; label: string; value: string; review: boolean }

export async function renderOfficialTranslation(
  schema: OfficialFormSchema, values: Record<string, FieldValue>,
  opts: { signerName?: string; signerAddress?: string; signedAt?: string; extras?: ExtraEntry[] } = {},
): Promise<{ pdf: Buffer; unresolved: string[] }> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const W = 595, H = 842, M = 54; const page = pdf.addPage([W, H])
  const dark = rgb(0.1, 0.09, 0.08), gray = rgb(0.45, 0.45, 0.45), warn = rgb(0.72, 0.4, 0), rule = rgb(0.78, 0.78, 0.78)
  let y = H - M; const unresolved: string[] = []
  const C = (t: string, s: number, f = font, c = dark) => { const x = safe(t); page.drawText(x, { x: (W - f.widthOfTextAtSize(x, s)) / 2, y, size: s, font: f, color: c }); y -= s + 6 }
  const L = (t: string, s = 10, f = font, c = dark, x = M) => { page.drawText(safe(t), { x, y, size: s, font: f, color: c }); y -= s + 5 }
  const HR = () => { y -= 2; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rule }); y -= 9 }

  C('UKRAINE', 13, bold); C('[ State Emblem (Coat of Arms) of Ukraine ]', 8, ital, gray)
  C(schema.titleEn, 16, bold); y -= 2
  C('English translation - AI-assisted draft, pending human review & signature', 8, ital, gray); HR()

  const groups = [...new Set(schema.fields.map((f) => f.fieldGroup))]
  for (const g of groups) {
    const flds = schema.fields.filter((f) => f.fieldGroup === g)
    if (!flds.length) continue
    L(GROUP_TITLE[g] ?? g.toUpperCase(), 10, bold, gray)
    for (const f of flds) {
      const v = values[f.key]
      if (v && v.canRead && v.value && !v.review) L(`  ${f.sourceLabelEn}: ${v.value}`, 10)
      else if (v && v.canRead && v.value) { L(`  ${f.sourceLabelEn}: ${v.value}    [CONFIRM]`, 10, font, warn); unresolved.push(f.key) }
      else { L(`  ${f.sourceLabelEn}: ____________________  [enter from document]`, 10, font, warn); unresolved.push(f.key) }
    }
    y -= 3
  }
  // ADDITIONAL ENTRIES — recognized lines that have no slot in the official
  // schema. Surfaced (never dropped) so the mirror reproduces every read line.
  // Marked [CONFIRM] because they are outside the verified normative structure.
  const extras = (opts.extras ?? []).filter((e) => e.value && e.value.trim())
  if (extras.length) {
    L('ADDITIONAL ENTRIES', 10, bold, gray)
    for (const e of extras) { L(`  ${e.label}: ${e.value}    [CONFIRM]`, 10, font, warn); unresolved.push(e.key) }
    y -= 3
  }
  HR(); L('[ Official seal / stamp - emblem and text not reproduced ]', 9, ital, gray)
  L('[ Signature of the issuing official - not reproduced ]', 9, ital, gray); y -= 4; HR()
  L("TRANSLATOR'S CERTIFICATION (8 CFR 103.2(b)(3))", 11, bold)
  L(`I, ${opts.signerName ?? '________________'}, certify that I am competent to translate from Ukrainian`, 10)
  const docName = schema.titleEn.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  L(`into English and that the foregoing is a true and accurate English translation of the`, 10)
  L(`attached Ukrainian ${docName}, to the best of my knowledge and ability.`, 10); y -= 4
  const dateStr = opts.signedAt ? opts.signedAt.slice(0, 10) : '____________'
  L(`Signature: ____________________   Date: ${dateStr}`, 10)
  L(`Address: ${opts.signerAddress ?? '____________________'}`, 10); y -= 8
  L(`Official structure basis: ${safe(schema.officialSource.act)} - ${schema.officialSource.url}`, 7, ital, gray)
  page.drawRectangle({ x: M - 14, y: 30, width: W - 2 * (M - 14), height: H - 60, borderColor: rule, borderWidth: 1 })
  return { pdf: Buffer.from(await pdf.save()), unresolved }
}
