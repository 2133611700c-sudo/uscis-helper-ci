import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sanitizeBrainRawForAudit } from '../ocrAuditSanitize'

// Recursively collect every (lowercased) key in a structure so we can assert
// no forbidden key survives at ANY nesting level.
function collectKeys(v: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) {
    for (const el of v) collectKeys(el, acc)
  } else if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      acc.add(k.toLowerCase())
      collectKeys(val, acc)
    }
  }
  return acc
}

// Recursively collect every string VALUE so we can assert no PII string leaks.
function collectStrings(v: unknown, acc: string[] = []): string[] {
  if (Array.isArray(v)) {
    for (const el of v) collectStrings(el, acc)
  } else if (v && typeof v === 'object') {
    for (const val of Object.values(v)) collectStrings(val, acc)
  } else if (typeof v === 'string') {
    acc.push(v)
  }
  return acc
}

const FORBIDDEN_KEYS = [
  'source_value',
  'final_value',
  'input_raw',
  'output_normalized',
  'source_line',
  'value',
  'raw_value',
  'raw',
  'text',
  'name',
  'address',
  'dob',
  'document_number',
]

// Realistic PII strings the sanitizer must never echo back.
const PII_NAME = 'Олександр Петренко'
const PII_NAME_2 = 'Volodymyr Zelenskyy'
const PII_DOC = 'FC1234567'
const PII_DATE = '1985-03-14'
const PII_ADDR = 'вул. Хрещатик 22, кв 8, Київ'
const PII_RAW_OCR = 'ПРІЗВИЩЕ ПЕТРЕНКО ІМʼЯ ОЛЕКСАНДР дата народження 14.03.1985'

function richBrainRaw() {
  return {
    provider: 'google_docai',
    crossref_status: 'crossref_ok',
    vision_arbiter_status: 'agree',
    brain_status: 'ran',
    brain_trigger: 'threshold',
    brain_document_type: 'passport',
    brain_document_type_confidence: 0.92,
    brain_needs_manual_review: false,
    brain_warnings: ['low_light'],
    field_count: 4,
    text_length: 1234,
    latency: 321,
    brain_fields: [
      {
        field: 'surname',
        present: true,
        source_value: PII_NAME, // PII
        final_value: 'Petrenko', // PII
        confidence: 0.95,
        requires_review: false,
        source_line: PII_RAW_OCR, // PII (raw OCR line)
        inferred: false,
        validation_status: 'passed',
      },
      {
        field: 'given_name',
        present: true,
        source_value: PII_NAME_2, // PII
        final_value: PII_NAME_2, // PII
        confidence: 0.6,
        requires_review: true,
        source_line: null,
        inferred: true,
        validation_status: 'rejected:low_confidence',
      },
      { field: 'patronymic', present: false },
    ],
    validated_skipped: [{ field: 'dob', reason: 'date not parseable' }],
    contract_rejected_fields: ['city_of_birth'],
    normalization_rejected_fields: ['province'],
    normalization_diagnostics: [
      {
        field: 'document_number',
        status: 'normalized',
        reason: 'passport_format',
        manual_required: false,
        input_raw: PII_DOC, // PII (raw OCR text)
        output_normalized: PII_DOC, // PII
      },
      {
        field: 'date_of_birth',
        status: 'rejected',
        reason: 'unparseable',
        manual_required: true,
        input_raw: PII_DATE, // PII
        output_normalized: null,
      },
    ],
    // Adversarial: alternate-name PII keys at deep nesting + an array of values.
    extra: {
      address: PII_ADDR, // PII (alt key)
      value: PII_NAME, // PII (alt key)
      rawValue: PII_DOC, // PII (alt key)
      nested: { name: PII_NAME, dob: PII_DATE, ocr_text: PII_RAW_OCR },
      candidates: [PII_NAME, PII_DOC, PII_ADDR], // bare PII array (free text → dropped)
    },
  }
}

describe('sanitizeBrainRawForAudit', () => {
  it('drops every forbidden key at every nesting level', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw())
    const keys = collectKeys(out)
    for (const f of FORBIDDEN_KEYS) {
      expect(keys.has(f)).toBe(false)
    }
  })

  it('never echoes any PII string value anywhere in the output', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw())
    const strings = collectStrings(out)
    const joined = JSON.stringify(out)
    for (const pii of [PII_NAME, PII_NAME_2, PII_DOC, PII_DATE, PII_ADDR, PII_RAW_OCR]) {
      expect(strings).not.toContain(pii)
      expect(joined).not.toContain(pii)
    }
    // Petrenko/Zelenskyy substrings must not survive as final_value either.
    expect(joined).not.toContain('Petrenko')
  })

  it('keeps the technical per-field keys', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw()) as Record<string, unknown>
    const fields = out.brain_fields as Array<Record<string, unknown>>
    expect(Array.isArray(fields)).toBe(true)
    const surname = fields.find((f) => f.field === 'surname')!
    expect(surname.field).toBe('surname')
    expect(surname.present).toBe(true)
    expect(surname.confidence).toBe(0.95)
    expect(surname.requires_review).toBe(false)
    expect(surname.inferred).toBe(false)
    expect(surname.validation_status).toBe('passed')
  })

  it('derives has_source_line boolean from a dropped source_line (keeps signal, not text)', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw()) as Record<string, unknown>
    const fields = out.brain_fields as Array<Record<string, unknown>>
    const surname = fields.find((f) => f.field === 'surname')!
    // source_line was present (raw OCR) → boolean true, text gone.
    expect(surname.has_source_line).toBe(true)
    expect(surname.source_line).toBeUndefined()
  })

  it('keeps top-level technical context + counts', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw()) as Record<string, unknown>
    expect(out.provider).toBe('google_docai')
    expect(out.crossref_status).toBe('crossref_ok')
    expect(out.brain_status).toBe('ran')
    expect(out.brain_trigger).toBe('threshold')
    expect(out.brain_document_type).toBe('passport')
    expect(out.brain_document_type_confidence).toBe(0.92)
    expect(out.field_count).toBe(4)
    expect(out.text_length).toBe(1234)
    expect(out.latency).toBe(321)
  })

  it('keeps diagnostics field-name + reason/status/manual_required but drops input_raw/output_normalized', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw()) as Record<string, unknown>
    const diag = out.normalization_diagnostics as Array<Record<string, unknown>>
    expect(diag).toHaveLength(2)
    const dn = diag.find((d) => d.field === 'document_number')!
    expect(dn.field).toBe('document_number')
    expect(dn.status).toBe('normalized')
    expect(dn.reason).toBe('passport_format')
    expect(dn.manual_required).toBe(false)
    expect(dn).not.toHaveProperty('input_raw')
    expect(dn).not.toHaveProperty('output_normalized')
  })

  it('keeps reject-list field-name arrays', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw()) as Record<string, unknown>
    expect(out.contract_rejected_fields).toEqual(['city_of_birth'])
    expect(out.normalization_rejected_fields).toEqual(['province'])
    const skipped = out.validated_skipped as Array<Record<string, unknown>>
    expect(skipped[0]).toMatchObject({ field: 'dob', reason: 'date not parseable' })
  })

  it('strips deeply-nested alternate-key PII and bare PII arrays', () => {
    const out = sanitizeBrainRawForAudit(richBrainRaw()) as Record<string, unknown>
    const joined = JSON.stringify(out)
    expect(joined).not.toContain(PII_ADDR)
    expect(joined).not.toContain(PII_NAME)
    expect(joined).not.toContain(PII_DOC)
  })

  it('handles the failure-branch shape (no brain_fields, has error code)', () => {
    const out = sanitizeBrainRawForAudit({
      provider: 'google_vision',
      brain_status: 'error',
      brain_error_code: 'timeout',
      validated_skipped: [],
      normalization_diagnostics: [
        { field: 'surname', status: 'rejected', reason: 'empty', input_raw: PII_NAME },
      ],
    }) as Record<string, unknown>
    expect(out.brain_error_code).toBe('timeout')
    expect(JSON.stringify(out)).not.toContain(PII_NAME)
  })

  it('is total: never throws and returns null/object for edge inputs', () => {
    expect(sanitizeBrainRawForAudit(null)).toBeNull()
    expect(sanitizeBrainRawForAudit(undefined)).toBeNull()
    expect(sanitizeBrainRawForAudit('a raw string')).toEqual({})
    expect(sanitizeBrainRawForAudit(42)).toEqual({})
    expect(sanitizeBrainRawForAudit([{ field: 'x', source_value: PII_NAME }])).toEqual({
      entries: [{ field: 'x' }],
    })
  })

  it('does not preserve Unicode name values even under allow-listed-looking keys', () => {
    const out = sanitizeBrainRawForAudit({
      field: 'surname',
      // An unknown free-text key carrying a name must be dropped.
      note: PII_NAME,
      // status is allow-listed but its value is a short token, kept.
      status: 'passed',
    }) as Record<string, unknown>
    expect(out.field).toBe('surname')
    expect(out.status).toBe('passed')
    expect(JSON.stringify(out)).not.toContain(PII_NAME)
  })
})

// ── Writer integration: prove ocrAudit applies the sanitizer ───────────────
const { insertMock, fromMock, createAdminSupabaseClientMock } = vi.hoisted(() => {
  const insert = vi.fn()
  const from = vi.fn(() => ({ insert }))
  const create = vi.fn(() => ({ from }))
  return { insertMock: insert, fromMock: from, createAdminSupabaseClientMock: create }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: createAdminSupabaseClientMock,
}))

import { logOcrRun } from '../ocrAudit'

describe('logOcrRun applies the sanitizer (defence in depth)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('strips forbidden keys even when the caller passes raw PII values', async () => {
    insertMock.mockResolvedValueOnce({ error: null })

    await logOcrRun({
      provider: 'google_docai',
      doc_type_hint: 'passport',
      document_id: 'doc_x',
      text_length: 10,
      page_count: 1,
      field_count: 1,
      rejected_fields: [],
      success: true,
      processing_ms: 5,
      brain_status: 'ran',
      // Caller bypasses the route sanitizer and passes raw PII directly:
      brain_raw: {
        provider: 'google_docai',
        brain_fields: [
          {
            field: 'surname',
            present: true,
            source_value: PII_NAME,
            final_value: 'Petrenko',
            source_line: PII_RAW_OCR,
            confidence: 0.9,
          },
        ],
      },
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>
    const written = JSON.stringify(row.brain_raw)
    for (const f of ['source_value', 'final_value', 'source_line']) {
      expect(written).not.toContain(`"${f}"`)
    }
    expect(written).not.toContain(PII_NAME)
    expect(written).not.toContain(PII_RAW_OCR)
    expect(written).not.toContain('Petrenko')
    // Technical signal preserved.
    expect(written).toContain('surname')
    expect(written).toContain('has_source_line')
  })

  it('does not mutate the user-facing OCR result object (audit path is a projection)', async () => {
    insertMock.mockResolvedValueOnce({ error: null })

    // Simulate the route: a user-facing result and a separate brain_raw audit.
    const userFacingResult = {
      fields: [{ field: 'surname', value: PII_NAME, confidence: 0.95 }],
      raw_text: PII_RAW_OCR,
    }
    const snapshot = JSON.parse(JSON.stringify(userFacingResult))

    await logOcrRun({
      provider: 'google_docai',
      doc_type_hint: 'passport',
      document_id: 'doc_y',
      text_length: 10,
      page_count: 1,
      field_count: 1,
      rejected_fields: [],
      success: true,
      processing_ms: 5,
      brain_status: 'ran',
      brain_raw: { brain_fields: [{ field: 'surname', source_value: PII_NAME }] },
    })

    // The user-facing object is untouched by the audit path.
    expect(userFacingResult).toEqual(snapshot)
    expect(userFacingResult.fields[0].value).toBe(PII_NAME)
    expect(userFacingResult.raw_text).toBe(PII_RAW_OCR)
  })
})
