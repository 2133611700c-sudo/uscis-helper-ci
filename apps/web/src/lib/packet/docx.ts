/**
 * apps/web/src/lib/packet/docx.ts
 *
 * Generate a translation draft DOCX using the docx package.
 * The DOCX contains the same information as the PDF but in editable Word format.
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  BorderStyle,
  WidthType,
  AlignmentType,
} from 'docx'
import type { PacketInput } from './types'

export async function generateDraftDOCX(input: PacketInput): Promise<Buffer> {
  const certStatement =
    input.certifier_statement ??
    'This document contains a machine-assisted translation of the original source text. ' +
    'The translation has been reviewed for accuracy. Per 8 CFR 103.2(b)(3), USCIS generally ' +
    'requires a complete English translation with a signed self-certification statement. ' +
    'This is a draft template — the signer must review, complete, and sign the self-certification block. ' +
    'Consult a licensed immigration attorney for official USCIS submissions.'

  const orderId = input.orderId ?? input.order_id ?? input.sessionId ?? 'N/A'
  const docType = (input.doc_type ?? input.documentType ?? 'other').toString().replace(/_/g, ' ').toUpperCase()
  const srcLang = (input.source_language ?? 'Ukrainian').toUpperCase()
  const tgtLang = (input.target_language ?? 'English').toUpperCase()
  const translatedAt = input.translated_at
    ? (typeof input.translated_at === 'string' ? input.translated_at : new Date(input.translated_at).toISOString()).split('T')[0]
    : new Date().toISOString().split('T')[0]

  const infoRows = [
    ['Order ID', orderId],
    ['Document Type', docType],
    ['Source Language', srcLang],
    ['Target Language', tgtLang],
    ['Translated At', translatedAt],
  ]

  const doc = new Document({
    sections: [
      {
        children: [
          // Title
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [
              new TextRun({
                text: 'MESSENGINFO — Document Translation Record',
                bold: true,
                color: '1D5CBB',
              }),
            ],
          }),

          new Paragraph({ text: '' }),

          // Info table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: infoRows.map(
              ([label, value]) =>
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 30, type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: label, bold: true })],
                        }),
                      ],
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                      },
                    }),
                    new TableCell({
                      width: { size: 70, type: WidthType.PERCENTAGE },
                      children: [new Paragraph({ text: value })],
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                      },
                    }),
                  ],
                })
            ),
          }),

          new Paragraph({ text: '' }),

          // Certification statement
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Translator Statement', bold: true })],
          }),

          new Paragraph({
            children: [new TextRun({ text: certStatement, italics: true, size: 20 })],
          }),

          new Paragraph({ text: '' }),

          // Fields heading
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Translated Fields', bold: true })],
          }),

          // Fields table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Header row
              new TableRow({
                tableHeader: true,
                children: ['Field', 'Source Text', 'Translation'].map(
                  (header) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: header, bold: true, color: '1D5CBB' })],
                        }),
                      ],
                      shading: { fill: 'EFF6FF' },
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                        right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                      },
                    })
                ),
              }),
              // Data rows
              ...input.fields.map(
                (field) =>
                  new TableRow({
                    children: [
                      (field.field ?? '').replace(/_/g, ' '),
                      field.raw_value ?? '',
                      field.normalized_value ?? '',
                    ].map(
                      (cellText) =>
                        new TableCell({
                          children: [new Paragraph({ text: cellText })],
                          borders: {
                            top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                            left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                            right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                          },
                        })
                    ),
                  })
              ),
            ],
          }),

          new Paragraph({ text: '' }),

          // Footer disclaimer
          new Paragraph({
            children: [
              new TextRun({
                text: 'NOT LEGAL ADVICE. Translator-signed draft only. For informational purposes only. Generated by messenginfo.com',
                color: 'CC1A1A',
                size: 18,
              }),
            ],
          }),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}
