/**
 * eadExtractCanonicalCarriage.test.ts
 *
 * Proves end-to-end canonical_document_id CARRIAGE for EAD at the extract seam.
 *
 * The wizard CAPTURE point reads `canonical_document_id` from the extract
 * response and RESENDs it to /api/ead/generate-packet. These tests lock the
 * server contract the capture depends on:
 *
 *   1. ead_extract_emits_canonical_id_on_persist_success
 *        — persistCanonicalDocument succeeds → response.canonical_document_id = persisted.id
 *   2. ead_extract_emits_null_on_shadow_persist_failure
 *        — persist throws in shadow mode → response.canonical_document_id = null (NEVER fabricated)
 *   3. ead_extract_omits_persist_when_continuity_off
 *        — CANONICAL_CONTINUITY_MODE=off → no persist call, canonical_document_id = null
 *
 * SAFE-carriage invariant: a wrong/stale id is worse than none, so on shadow
 * persist failure the route returns null and the wizard sends nothing.
 *
 * PII rule: synthetic fixtures only (TESTIVANENKO). No real applicant data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock the heavy dependencies of the route (Gemini, image IO, Supabase) ──────
const persistMock = vi.fn()

vi.mock('@/lib/security/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, resetAt: new Date(Date.now() + 60_000) })),
  getClientIP: () => '127.0.0.1',
}))

vi.mock('@/lib/ocr/image-preprocess', () => ({
  preprocessImage: vi.fn(async () => ({
    ok: true,
    buffer: Buffer.from('img'),
    mimeType: 'image/jpeg',
  })),
}))

vi.mock('@/lib/docintel/documentFieldReader', () => ({
  readDocument: vi.fn(async () => ({
    ok: true,
    fields: [{ key: 'family_name', value: 'TESTIVANENKO', confidence: 1, page: 1 }],
  })),
}))

vi.mock('@/lib/canonical/core/translationAdapter', () => ({
  docintelToCandidate: (f: { key: string; value: string }) => ({ key: f.key, value: f.value }),
}))

vi.mock('@/lib/canonical/core/knowledgeBrain', () => ({
  buildKnowledgeContext: () => ({}),
  applyKnowledgeBrainIfEnabled: (candidates: Array<{ key: string; value: string }>) =>
    candidates.map((c) => ({
      key: c.key,
      finalValue: c.value,
      reviewRequired: false,
    })),
}))

vi.mock('@/lib/canonical/core/eadAdapter', () => ({
  toEadAnswers: () => ({
    family_name: 'TESTIVANENKO',
    given_name: null,
    date_of_birth: null,
    sex: null,
    country_of_birth: null,
    passport_number: null,
    a_number: null,
    review_required: false,
    uncertain_fields: [],
    core_status: 'ok',
    invented_fields_count: 0,
  }),
}))

vi.mock('@/lib/canonical/persistence', () => ({
  persistCanonicalDocument: (...args: unknown[]) => persistMock(...args),
}))

import { POST } from '../ocr/extract/route'

function makeExtractRequest(): Request {
  const fd = new FormData()
  fd.append('file', new Blob([Buffer.from('img')], { type: 'image/jpeg' }), 'doc.jpg')
  fd.append('docHint', 'passport')
  return new Request('http://localhost/api/ead/ocr/extract', { method: 'POST', body: fd })
}

describe('EAD extract — canonical_document_id carriage (server contract)', () => {
  const origMode = process.env.CANONICAL_CONTINUITY_MODE

  beforeEach(() => {
    persistMock.mockReset()
  })

  afterEach(() => {
    if (origMode === undefined) delete process.env.CANONICAL_CONTINUITY_MODE
    else process.env.CANONICAL_CONTINUITY_MODE = origMode
  })

  it('ead_extract_emits_canonical_id_on_persist_success', async () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'shadow'
    persistMock.mockResolvedValue({
      id: 'canon-ead-123',
      resultHash: 'rh',
      fieldsHash: 'fh012345',
    })

    const res = await POST(makeExtractRequest() as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.canonical_document_id).toBe('canon-ead-123')
    expect(persistMock).toHaveBeenCalledTimes(1)
  })

  it('ead_extract_emits_null_on_shadow_persist_failure', async () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'shadow'
    persistMock.mockRejectedValue(new Error('supabase down'))

    const res = await POST(makeExtractRequest() as never)
    const json = await res.json()

    // SAFE carriage: never fabricate an id — emit null on shadow failure.
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.canonical_document_id).toBeNull()
  })

  it('ead_extract_omits_persist_when_continuity_off', async () => {
    process.env.CANONICAL_CONTINUITY_MODE = 'off'
    persistMock.mockResolvedValue({ id: 'should-not-be-used', resultHash: 'rh', fieldsHash: 'fh' })

    const res = await POST(makeExtractRequest() as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.canonical_document_id).toBeNull()
    expect(persistMock).not.toHaveBeenCalled()
  })
})
