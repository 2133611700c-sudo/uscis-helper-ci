import { describe, expect, it } from 'vitest'
import type { OcrResult } from '@/lib/ocr/types'
import { runI797Module } from '@/lib/tps/modules/i797'

function mkOcr(lines: string[]): OcrResult {
  return {
    created_at: new Date().toISOString(),
    provider: 'google_vision',
    raw_text: lines.join('\n'),
    pages: [{ page: 1, width: 1000, height: 1000, lines: [], words: [] }],
    words: [],
    lines: lines.map((text, i) => ({
      id: `l_${i}`, text, page: 1,
      bbox: { x: 0.1, y: 0.05 + i * 0.03, width: 0.6, height: 0.025 },
      words: [], confidence: 0.95, source: 'google_vision',
    })),
    processing_ms: 10,
    warnings: [],
  }
}

describe('runI797Module', () => {
  const FULL_I797 = mkOcr([
    'Department of Homeland Security',
    'U.S. Citizenship and Immigration Services',
    'I-797C, Notice of Action',
    'Receipt Number IOE0912345678',
    'Received Date 03/15/2024',
    'Notice Date 03/20/2024',
    'Notice Type: Receipt',
    'Case Type: I-821, Application for TPS',
    'A# 234 567 890',
    'Applicant',
    'Last Name',
    'BONDARENKO',
    'First Name',
    'OLENA',
    '',
    'The above application has been received.',
  ])

  it('extracts receipt number with IOE prefix', () => {
    const out = runI797Module(FULL_I797, { document_id: 'test' })
    expect(out.matched).toBe(true)
    const rn = out.fields.find(f => f.field === 'receipt_number')
    expect(rn).toBeDefined()
    expect(rn!.normalized_value).toBe('IOE0912345678')
  })

  it('extracts A-Number from I-797', () => {
    const out = runI797Module(FULL_I797, { document_id: 'test' })
    const an = out.fields.find(f => f.field === 'a_number')
    expect(an).toBeDefined()
    expect(an!.normalized_value).toBe('234567890')
  })

  it('extracts notice and received dates as ISO', () => {
    const out = runI797Module(FULL_I797, { document_id: 'test' })
    const nd = out.fields.find(f => f.field === 'notice_date')
    const rd = out.fields.find(f => f.field === 'received_date')
    expect(nd!.normalized_value).toBe('2024-03-20')
    expect(rd!.normalized_value).toBe('2024-03-15')
  })

  it('extracts notice type and case/form type', () => {
    const out = runI797Module(FULL_I797, { document_id: 'test' })
    const nt = out.fields.find(f => f.field === 'notice_type')
    const ft = out.fields.find(f => f.field === 'form_type')
    expect(nt!.normalized_value).toBe('receipt')
    expect(ft!.normalized_value).toBe('I-821')
  })

  it('extracts applicant name (cross-check)', () => {
    const out = runI797Module(FULL_I797, { document_id: 'test' })
    const keys = out.fields.map(f => f.field)
    expect(keys).toContain('family_name')
    expect(keys).toContain('given_name')
  })

  it('handles different receipt number prefixes (EAC, WAC, LIN, SRC)', () => {
    for (const prefix of ['EAC', 'WAC', 'LIN', 'SRC']) {
      const ocr = mkOcr([
        'USCIS',
        `Receipt Number: ${prefix}0987654321`,
        'Notice Type: Approval',
      ])
      const out = runI797Module(ocr, { document_id: 'test_prefix' })
      expect(out.matched).toBe(true)
      const rn = out.fields.find(f => f.field === 'receipt_number')
      expect(rn!.normalized_value).toBe(`${prefix}0987654321`)
    }
  })

  it('does NOT match a document without receipt number or USCIS markers', () => {
    const ocr = mkOcr([
      'Some random document',
      'No immigration content here',
      'Amount: $500.00',
    ])
    const out = runI797Module(ocr, { document_id: 'test_nomatch' })
    expect(out.matched).toBe(false)
  })

  it('does NOT extract forbidden fields (passport, i94, DL fields)', () => {
    // Even if the text contains these patterns, the module should not extract them
    const ocr = mkOcr([
      'USCIS I-797C Notice of Action',
      'Receipt Number IOE0912345678',
      'Passport Number EK790396',
      'I-94 Number 12345678901',
      'Last Entry Date 09/09/2022',
      'Address 456 TEST ST',
    ])
    const out = runI797Module(ocr, { document_id: 'test_forbidden' })
    const keys = out.fields.map(f => f.field)
    expect(keys).not.toContain('passport_number')
    expect(keys).not.toContain('i94_admission_number')
    expect(keys).not.toContain('last_entry_date')
    expect(keys).not.toContain('us_address_street')
  })

  it('finds receipt number in header even without explicit label', () => {
    const ocr = mkOcr([
      'IOE0912345678',
      'USCIS',
      'Notice of Action',
    ])
    const out = runI797Module(ocr, { document_id: 'test_fallback' })
    const rn = out.fields.find(f => f.field === 'receipt_number')
    expect(rn).toBeDefined()
    expect(rn!.review_required).toBe(true)
    expect(rn!.source_zone).toBe('i797_receipt_number_fallback')
  })
})
