/**
 * apps/web/src/lib/packet/pdf.ts
 *
 * Messenginfo Translation Engine v5.0 — Bureau-Style PDF Generator
 * Uses pdf-lib. Returns Buffer (Node.js compatible).
 *
 * Output pages:
 *   1. Translation header + extracted field table
 *   2. Certification block (8 CFR §103.2(b)(3)) + typed signature
 *
 * Audit/source trace data is stored in DB only (extracted_fields, audit_logs).
 * It is NEVER included in the customer-facing PDF.
 *
 * Hard rules:
 *   - NO "CERTIFIED COPY" — removed
 *   - NO "Certified Translation by Messenginfo" — forbidden
 *   - Certification block references 8 CFR §103.2(b)(3)
 *   - Human signs; AI drafted
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import type { PacketInput } from './types'
import { toWinAnsiSafe } from '@/lib/tps/transliterate'

const BRAND_BLUE  = rgb(0.11, 0.36, 0.73)
const TEXT_DARK   = rgb(0.08, 0.08, 0.08)
const MUTED       = rgb(0.40, 0.40, 0.40)
const RULE_COLOR  = rgb(0.82, 0.82, 0.82)
const WARN_ORANGE = rgb(0.85, 0.45, 0.00)

const MARGIN     = 52
const PAGE_W     = 612   // US Letter
const PAGE_H     = 792
const LINE_H     = 16
const SECTION_GAP = 20

type Ctx = {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  mono: PDFFont
}

function clampText(str: string | null | undefined, maxLen = 60): string {
  const s = String(str ?? '')
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '...' : s
}

/**
 * Make a string WinAnsi-safe for pdf-lib drawText.
 *
 * Strategy upgrade (2026-05-11):
 *   Previously this function replaced any non-CP1252 char with '?'. That
 *   silently destroyed Cyrillic — a real Ukrainian name "Шевченко" became
 *   "????????" on the bureau-cert page. Now we delegate to the shared
 *   KMU-55 transliterator in lib/tps/transliterate.ts so any Cyrillic
 *   leaking through becomes a readable Latin equivalent ("Shevchenko").
 *
 *   The translation engine itself emits Latin in `normalized_value`
 *   (Ukrainian → English is its whole job), so this path is mostly
 *   defensive — but the cert block uses raw signer names where Cyrillic
 *   could conceivably slip in, and any future code that calls drawText
 *   with applicant-facing strings is protected too.
 */
function sanitizeWinAnsi(str: string | null | undefined): string {
  return toWinAnsiSafe(String(str ?? ''))
}

function drawHRule(page: PDFPage, y: number) {
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: RULE_COLOR })
}

function drawText(
  page: PDFPage,
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}
) {
  const lines = wrapText(text, opts.maxWidth ?? PAGE_W - x - MARGIN, opts.font ?? ctx.font, opts.size ?? 10)
  let curY = y
  for (const line of lines) {
    page.drawText(line, {
      x, y: curY,
      size: opts.size ?? 10,
      font: opts.font ?? ctx.font,
      color: opts.color ?? TEXT_DARK,
    })
    curY -= LINE_H
  }
  return curY
}

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  if (!text) return ['']
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    const w = font.widthOfTextAtSize(test, size)
    if (w > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

/** A planned English-translation row. status drives how it renders (and whether
 *  the draft is certifiable). A field with no value is NEVER dropped — it becomes
 *  a visible MISSING placeholder the client must complete from the document. */
export interface TranslationRow { label: string; value: string; status: 'ok' | 'review' | 'missing' }

export function planTranslationRows(
  fields: Array<{ field: string; normalized_value?: string | null; final_value?: string | null; review_required?: boolean }>,
): { rows: TranslationRow[]; missingCount: number; reviewCount: number; certifiable: boolean } {
  const rows: TranslationRow[] = fields.map((f) => {
    const label = f.field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    // Phase 3 (ADR-017 C3 contract): prefer final_value when C3 has run.
    // final_value=string → C3 accepted (release value). final_value=null → C3 rejected (treat as missing).
    // final_value=undefined → C3 not run (flag OFF); fall back to normalized_value for backward compat.
    const releaseValue = f.final_value !== undefined ? f.final_value : f.normalized_value
    if (!releaseValue) return { label, value: '________________  [enter from document]', status: 'missing' }
    return { label, value: releaseValue, status: f.review_required ? 'review' : 'ok' }
  })
  const missingCount = rows.filter((r) => r.status === 'missing').length
  const reviewCount = rows.filter((r) => r.status === 'review').length
  return { rows, missingCount, reviewCount, certifiable: missingCount === 0 }
}

export async function generateTranslationPDF(input: PacketInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const mono = await pdfDoc.embedFont(StandardFonts.Courier)
  const ctx: Ctx = { doc: pdfDoc, font, bold, mono }

  // ── PAGE 1: Translation ──────────────────────────────────────────────────────
  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  // Header
  page.drawText('MESSENGINFO', { x: MARGIN, y, size: 18, font: bold, color: BRAND_BLUE })
  y -= 20
  page.drawText('Document Translation Record', { x: MARGIN, y, size: 11, font, color: MUTED })
  y -= SECTION_GAP
  drawHRule(page, y); y -= 14

  // Metadata
  // DETERMINISM (#195): anchor the "Translation Date" to the certification's
  // signed_at (the single pinned time source for this document), NOT the render
  // wall-clock. Two renders of the same input must produce byte-identical bytes
  // so the V2 immutable-artifact content-address (SHA-256) is stable.
  const today = new Date(input.certificationRecord.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const meta = [
    ['Translation Scope', clampText(input.scopeTitle, 70)],
    ['Language Pair', 'Ukrainian -> English'],
    ['Translation Date', today],
    ['Session Reference', input.sessionId.slice(0, 16)],
  ]
  for (const [label, value] of meta) {
    page.drawText(label + ':', { x: MARGIN, y, size: 9, font: bold, color: MUTED })
    page.drawText(value, { x: MARGIN + 130, y, size: 9, font, color: TEXT_DARK })
    y -= LINE_H
  }
  y -= SECTION_GAP
  drawHRule(page, y); y -= 16

  // Field table
  page.drawText('ENGLISH TRANSLATION', { x: MARGIN, y, size: 12, font: bold, color: TEXT_DARK })
  y -= SECTION_GAP

  // HONEST RENDER (P0): a field that could not be read is NEVER silently dropped —
  // it is shown as a visible blank line the client must complete from the document.
  // An empty required field makes the draft NOT ready to certify.
  const { rows, missingCount } = planTranslationRows(input.fields as any)
  for (const row of rows) {
    if (y < MARGIN + 40) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN }
    page.drawText(row.label + ':', { x: MARGIN, y, size: 10, font: bold, color: TEXT_DARK })
    const text = row.status === 'missing' ? row.value : sanitizeWinAnsi(clampText(row.value, 80))
    const endY = drawText(page, ctx, text, MARGIN + 180, y, { size: 10, ...(row.status === 'missing' ? { color: WARN_ORANGE } : {}) })
    if (row.status === 'missing') page.drawText('! MISSING', { x: PAGE_W - MARGIN - 70, y, size: 8, font, color: WARN_ORANGE })
    else if (row.status === 'review') page.drawText('! review', { x: PAGE_W - MARGIN - 60, y, size: 8, font, color: WARN_ORANGE })
    y = Math.min(y - LINE_H, endY) - 4
  }

  y -= SECTION_GAP
  if (missingCount > 0) {
    y = drawText(page, ctx, `INCOMPLETE DRAFT — ${missingCount} field(s) could not be read and are shown blank above. Complete them from your original document; this translation is NOT ready to certify until every field is filled and reviewed.`,
      MARGIN, y, { size: 9, color: WARN_ORANGE, maxWidth: PAGE_W - MARGIN * 2 })
    y -= 8
  }
  drawHRule(page, y); y -= 14

  // Disclaimer
  const disclaimer = 'Messenginfo is not a law firm. This is an AI-assisted translation draft reviewed and signed by a named human translator. The translator accepts full responsibility for accuracy under 8 CFR §103.2(b)(3). Verify current USCIS requirements at uscis.gov before filing.'
  y = drawText(page, ctx, disclaimer, MARGIN, y, { size: 8, color: MUTED, maxWidth: PAGE_W - MARGIN * 2 })

  // ── PAGE 2: Certification ────────────────────────────────────────────────────
  page = pdfDoc.addPage([PAGE_W, PAGE_H])
  y = PAGE_H - MARGIN

  page.drawText('TRANSLATOR CERTIFICATION', { x: MARGIN, y, size: 14, font: bold, color: TEXT_DARK })
  y -= 6; drawHRule(page, y); y -= 20

  page.drawText('Self-Certification pursuant to 8 CFR §103.2(b)(3)', { x: MARGIN, y, size: 10, font, color: MUTED })
  y -= SECTION_GAP * 2

  const cert = input.certificationRecord
  const statement = cert.statement || `I, ${cert.signer_full_name}, certify that I am competent to translate from Ukrainian to English, and that the attached translation is accurate and complete to the best of my knowledge and belief, pursuant to 8 CFR §103.2(b)(3).`
  y = drawText(page, ctx, statement, MARGIN, y, { size: 11, maxWidth: PAGE_W - MARGIN * 2 })
  y -= SECTION_GAP * 2

  // Signer block
  const certDate = new Date(cert.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const signerRows = [
    ['Translator Name', cert.signer_full_name],
    ['Date', certDate],
    ...(cert.address ? [['Address', cert.address]] : []),
    ...(cert.phone ? [['Phone', cert.phone]] : []),
    ...(cert.email ? [['Email', cert.email]] : []),
  ]
  for (const [lbl, val] of signerRows) {
    page.drawText(lbl + ':', { x: MARGIN, y, size: 10, font: bold, color: TEXT_DARK })
    page.drawText(sanitizeWinAnsi(val), { x: MARGIN + 140, y, size: 10, font, color: TEXT_DARK })
    y -= LINE_H + 4
  }
  y -= SECTION_GAP

  // Signature line
  drawHRule(page, y)
  y -= 14
  // Drawn signature image (finger/stylus), if provided — rendered above the typed
  // name so the certifier's actual signature appears on the document.
  const sigUrl = input.signatureDataUrl
  if (sigUrl && sigUrl.startsWith('data:image/png;base64,')) {
    try {
      const png = await pdfDoc.embedPng(Buffer.from(sigUrl.split(',', 2)[1], 'base64'))
      const w = 150
      const h = Math.min(48, (png.height / png.width) * w || 40)
      page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h })
      y -= h + 6
    } catch {
      // Corrupt/oversized image → fall back to the typed signature only.
    }
  }
  page.drawText('Signature (typed): ' + cert.signature_typed_name, { x: MARGIN, y, size: 11, font, color: TEXT_DARK })
  y -= LINE_H
  page.drawText('Certification Version: ' + cert.certification_version, { x: MARGIN, y, size: 8, font, color: MUTED })

  // SOURCE TRACE / QA audit data is stored in the DB (extracted_fields, audit_logs).
  // It is intentionally NOT included in the customer-facing PDF.
  // Admin audit exports are a separate internal tool.

  // DETERMINISM (#195): pdf-lib otherwise stamps CreationDate/ModDate with the
  // render wall-clock and a version-dependent Producer, making bytes unstable.
  // Pin all document metadata to the certification's signed_at + fixed strings so
  // the same input always renders identical bytes (stable content-address SHA).
  const pinned = new Date(input.certificationRecord.signed_at)
  pdfDoc.setCreationDate(pinned)
  pdfDoc.setModificationDate(pinned)
  pdfDoc.setProducer('Messenginfo')
  pdfDoc.setCreator('Messenginfo Translation')

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
