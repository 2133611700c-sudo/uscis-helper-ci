import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const baseInput = {
  provider: 'google_docai',
  doc_type_hint: 'passport',
  document_id: 'doc_test_1',
  text_length: 1000,
  page_count: 1,
  field_count: 3,
  rejected_fields: ['city_of_birth'],
  success: true,
  processing_ms: 321,
  brain_status: 'ran',
  brain_raw: {
    crossref_status: 'crossref_ok',
    validated_skipped: [{ field: 'dob', reason: 'date not parseable' }],
  },
}

describe('logOcrRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes brain_raw when schema accepts it', async () => {
    insertMock.mockResolvedValueOnce({ error: null })

    await logOcrRun(baseInput)

    expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenCalledWith('tps_ocr_audit')
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google_docai',
        rejected_fields: ['city_of_birth'],
        brain_raw: expect.objectContaining({
          crossref_status: 'crossref_ok',
        }),
      }),
    )
  })

  it('retries without brain_raw when column is missing', async () => {
    insertMock
      .mockResolvedValueOnce({
        error: {
          message: 'column "brain_raw" of relation "tps_ocr_audit" does not exist',
          details: null,
        },
      })
      .mockResolvedValueOnce({ error: null })

    await logOcrRun(baseInput)

    expect(insertMock).toHaveBeenCalledTimes(2)
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      provider: 'google_docai',
      brain_raw: expect.any(Object),
    })
    expect(insertMock.mock.calls[1][0]).toMatchObject({
      provider: 'google_docai',
      rejected_fields: ['city_of_birth'],
    })
    expect(insertMock.mock.calls[1][0]).not.toHaveProperty('brain_raw')
  })
})
