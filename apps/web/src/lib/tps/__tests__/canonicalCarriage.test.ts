/**
 * canonicalCarriage.test.ts — proves end-to-end canonical_document_id carriage
 * for the TPS wizard: capture from the extract RESPONSE → store per upload slot
 * → resend in the generate-packet body. These are the exact helpers the wizard
 * (TPSWizardV2.tsx handleUpload / handleGenerate) uses.
 */

import { describe, it, expect } from 'vitest'
import {
  captureCanonicalDocumentId,
  selectCanonicalDocumentIdForGenerate,
  type CanonicalCarriageSlot,
} from '../canonicalCarriage'

describe('captureCanonicalDocumentId (CAPTURE point)', () => {
  it('captures the id from an extract response that returned one', () => {
    const extractResponse = { ok: true, document_id: 'doc_1', canonical_document_id: 'canon_abc123' }
    expect(captureCanonicalDocumentId(extractResponse)).toBe('canon_abc123')
  })

  it('returns null when the server did NOT return an id (shadow persist failure) — never fabricate', () => {
    expect(captureCanonicalDocumentId({ ok: true, document_id: 'doc_1' })).toBeNull()
    expect(captureCanonicalDocumentId({ ok: true, canonical_document_id: null })).toBeNull()
    expect(captureCanonicalDocumentId({ ok: true, canonical_document_id: '' })).toBeNull()
    expect(captureCanonicalDocumentId({ ok: true, canonical_document_id: '   ' })).toBeNull()
  })

  it('is defensive against malformed responses', () => {
    expect(captureCanonicalDocumentId(null)).toBeNull()
    expect(captureCanonicalDocumentId(undefined)).toBeNull()
    expect(captureCanonicalDocumentId('not-json')).toBeNull()
    expect(captureCanonicalDocumentId({ canonical_document_id: 42 })).toBeNull()
  })
})

describe('selectCanonicalDocumentIdForGenerate (RESEND point)', () => {
  it('end-to-end: captured id flows into the generate body', () => {
    // CAPTURE: mocked extract response for the passport slot.
    const captured = captureCanonicalDocumentId({ ok: true, canonical_document_id: 'canon_e2e' })
    const uploads: Record<string, CanonicalCarriageSlot> = {
      passport: { status: 'done', canonical_document_id: captured },
    }
    // RESEND: build the generate body the wizard POSTs.
    const id = selectCanonicalDocumentIdForGenerate(uploads)
    const body = { ...(id ? { canonical_document_id: id } : {}) }
    expect(body.canonical_document_id).toBe('canon_e2e')
  })

  it('omits the field entirely when no upload returned an id (shadow stays valid)', () => {
    const uploads: Record<string, CanonicalCarriageSlot> = {
      passport: { status: 'done', canonical_document_id: null },
      i94: { status: 'done' },
    }
    const id = selectCanonicalDocumentIdForGenerate(uploads)
    expect(id).toBeUndefined()
    const body = { ...(id ? { canonical_document_id: id } : {}) }
    expect('canonical_document_id' in body).toBe(false)
  })

  it('prefers the passport (primary identity doc) over the booklet', () => {
    const uploads: Record<string, CanonicalCarriageSlot> = {
      booklet: { status: 'done', canonical_document_id: 'canon_booklet' },
      passport: { status: 'done', canonical_document_id: 'canon_passport' },
    }
    expect(selectCanonicalDocumentIdForGenerate(uploads)).toBe('canon_passport')
  })

  it('falls back to the booklet when the passport carried no id', () => {
    const uploads: Record<string, CanonicalCarriageSlot> = {
      passport: { status: 'done', canonical_document_id: null },
      booklet: { status: 'done', canonical_document_id: 'canon_booklet' },
    }
    expect(selectCanonicalDocumentIdForGenerate(uploads)).toBe('canon_booklet')
  })

  it('falls back to any other completed slot when neither passport nor booklet has one', () => {
    const uploads: Record<string, CanonicalCarriageSlot> = {
      i94: { status: 'done', canonical_document_id: 'canon_i94' },
    }
    expect(selectCanonicalDocumentIdForGenerate(uploads)).toBe('canon_i94')
  })

  it('ignores ids from slots whose upload did not complete', () => {
    const uploads: Record<string, CanonicalCarriageSlot> = {
      passport: { status: 'uploading', canonical_document_id: 'canon_partial' },
      booklet: { status: 'error', canonical_document_id: 'canon_failed' },
    }
    expect(selectCanonicalDocumentIdForGenerate(uploads)).toBeUndefined()
  })
})
