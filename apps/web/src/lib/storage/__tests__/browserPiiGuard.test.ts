import { describe, it, expect } from 'vitest'
import {
  DRAFT_TTL_MS,
  PROHIBITED_FIELD_KEYS,
  ALLOWED_FIELD_KEYS,
  MAX_PERSISTED_VALUE_LEN,
  sanitizeFieldForStorage,
  sanitizeFieldMapForStorage,
  sanitizeFieldListForStorage,
  isDraftExpired,
} from '../persistedDraftPolicy'

/**
 * Browser-PII containment guard.
 *
 * These tests are a static gate: they FAIL if the persisted-draft sanitizer
 * stops stripping a prohibited PII-bearing key, or if an allowlist starts
 * including one. This prevents a future wizard edit from silently persisting
 * raw OCR text / evidence / confidence / source traces in browser storage.
 */
describe('browser PII guard — persistedDraftPolicy', () => {
  // A realistic TPS / Re-Parole per-field record with all the extraction
  // internals the wizard holds in memory.
  const tpsField = {
    value: 'IVAN',
    requires_review: false,
    doc_slot: 'passport',
    source: 'mrz',
    source_document_id: 'passport_page_1',
    source_zone: 'mrz_line_2',
    raw_value: 'IVAN<<PETROVYCH',
    confidence: 0.97,
  }

  // A realistic Translation extractedFields[] record.
  const translationField = {
    field: 'family_name',
    value: 'Petrov',
    raw_cyrillic: 'Петров',
    confidence: 0.91,
    kind: 'name',
    review_required: false,
    ensemble_candidate: null,
    review_reasons: ['low_confidence'],
  }

  it('strips every prohibited key from a TPS field', () => {
    const clean = sanitizeFieldForStorage('tps', tpsField)
    for (const prohibited of PROHIBITED_FIELD_KEYS) {
      expect(clean).not.toHaveProperty(prohibited)
    }
    // Keeps only the allowed scalars.
    expect(clean).toEqual({ value: 'IVAN', requires_review: false, doc_slot: 'passport' })
  })

  it('strips every prohibited key from a Re-Parole field', () => {
    const clean = sanitizeFieldForStorage('reparole', tpsField)
    expect(clean).not.toHaveProperty('raw_value')
    expect(clean).not.toHaveProperty('source')
    expect(clean).not.toHaveProperty('confidence')
    expect(Object.keys(clean).sort()).toEqual(['doc_slot', 'requires_review', 'value'])
  })

  it('drops confidence / kind / source traces from a Translation field but keeps the operator carriage (raw_cyrillic)', () => {
    const clean = sanitizeFieldForStorage('translation', translationField)
    expect(clean).not.toHaveProperty('confidence')
    expect(clean).not.toHaveProperty('kind')
    expect(clean).not.toHaveProperty('ensemble_candidate')
    expect(clean).not.toHaveProperty('review_reasons')
    // raw_cyrillic is the single documented carriage exception (operator hand-off).
    expect(clean).toEqual({
      field: 'family_name',
      value: 'Petrov',
      raw_cyrillic: 'Петров',
      review_required: false,
    })
  })

  it('raw_cyrillic is NOT allowed for non-translation wizards', () => {
    const clean = sanitizeFieldForStorage('tps', { value: 'X', raw_cyrillic: 'Х' })
    expect(clean).not.toHaveProperty('raw_cyrillic')
  })

  it('every allowlist excludes all prohibited keys (except documented translation carriage)', () => {
    for (const wizard of Object.keys(ALLOWED_FIELD_KEYS) as Array<keyof typeof ALLOWED_FIELD_KEYS>) {
      for (const allowed of ALLOWED_FIELD_KEYS[wizard]) {
        if (wizard === 'translation' && allowed === 'raw_cyrillic') continue
        expect(PROHIBITED_FIELD_KEYS).not.toContain(allowed)
      }
    }
  })

  it('sanitizeFieldMapForStorage strips prohibited keys across a slot field map (TPS / Re-Parole)', () => {
    const map = { family_name: tpsField, given_name: { ...tpsField, value: 'PETRO' } }
    const clean = sanitizeFieldMapForStorage('tps', map)
    for (const key of Object.keys(clean)) {
      for (const prohibited of PROHIBITED_FIELD_KEYS) {
        expect(clean[key]).not.toHaveProperty(prohibited)
      }
    }
  })

  it('sanitizeFieldListForStorage strips prohibited keys across the Translation extractedFields list', () => {
    const list = [translationField, { ...translationField, field: 'given_name', value: 'Ivan' }]
    const clean = sanitizeFieldListForStorage('translation', list)
    for (const f of clean) {
      expect(f).not.toHaveProperty('confidence')
      expect(f).not.toHaveProperty('kind')
      expect(f).not.toHaveProperty('review_reasons')
    }
  })

  it('handles null / undefined / non-object inputs without throwing', () => {
    expect(sanitizeFieldForStorage('tps', null)).toEqual({})
    expect(sanitizeFieldForStorage('tps', undefined)).toEqual({})
    expect(sanitizeFieldMapForStorage('tps', null)).toEqual({})
    expect(sanitizeFieldListForStorage('translation', null)).toEqual([])
  })

  it('TTL: a draft older than DRAFT_TTL_MS is expired; a fresh one is not', () => {
    const now = Date.now()
    expect(isDraftExpired(new Date(now - DRAFT_TTL_MS - 1000).toISOString(), now)).toBe(true)
    expect(isDraftExpired(new Date(now - 60_000).toISOString(), now)).toBe(false)
    expect(isDraftExpired(now - DRAFT_TTL_MS - 1, now)).toBe(true)
    // Missing timestamp is back-compat tolerant (not treated as expired).
    expect(isDraftExpired(null, now)).toBe(false)
    expect(isDraftExpired(undefined, now)).toBe(false)
  })

  it('DRAFT_TTL_MS is 24 hours', () => {
    expect(DRAFT_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })

  // ── Hardening: nested objects/arrays cannot bypass the allowlist; size cap ──
  it('a nested OBJECT under an allowlisted key (value) is dropped, not persisted', () => {
    const out = sanitizeFieldForStorage('tps', {
      value: { secret_full_name: 'IVAN', dob: '1980-01-01' },
      requires_review: false,
    })
    expect(out.value).toBeNull()
    expect(JSON.stringify(out)).not.toMatch(/IVAN|1980/)
  })

  it('a nested ARRAY under an allowlisted key (value) is dropped', () => {
    const out = sanitizeFieldForStorage('translation', {
      field: 'surname',
      value: ['IVANENKO', { evidence: 'mrz' }],
      review_required: true,
    })
    expect(out.value).toBeNull()
    expect(JSON.stringify(out)).not.toMatch(/IVANENKO|evidence|mrz/)
    expect(out.review_required).toBe(true)
  })

  it('top-level persisted payload contains ONLY allowlisted keys (no extras, no proto pollution)', () => {
    for (const wizard of ['tps', 'reparole', 'translation'] as const) {
      const out = sanitizeFieldForStorage(wizard, {
        value: 'x', field: 'surname', review_required: false, requires_review: false,
        doc_slot: 'passport', raw_cyrillic: 'Іваненко',
        evidence: ['e'], raw_value: 'r', normalized_value: 'n', confidence: 0.9,
        sourceTraces: [{}], source: 'mrz',
      })
      for (const k of Object.keys(out)) {
        expect(ALLOWED_FIELD_KEYS[wizard]).toContain(k)
      }
    }
  })

  it('raw_cyrillic is allowed ONLY for translation and ONLY as a length-capped string', () => {
    expect(sanitizeFieldForStorage('tps', { value: 'x', raw_cyrillic: 'Іван' })).not.toHaveProperty('raw_cyrillic')
    expect(sanitizeFieldForStorage('reparole', { value: 'x', raw_cyrillic: 'Іван' })).not.toHaveProperty('raw_cyrillic')
    const long = 'я'.repeat(5000)
    const out = sanitizeFieldForStorage('translation', { field: 'surname', value: 'x', raw_cyrillic: long })
    expect(typeof out.raw_cyrillic).toBe('string')
    expect((out.raw_cyrillic as string).length).toBe(MAX_PERSISTED_VALUE_LEN)
  })

  it('string field values are length-capped (no unbounded PII blob)', () => {
    const out = sanitizeFieldForStorage('tps', { value: 'a'.repeat(9999), requires_review: false })
    expect((out.value as string).length).toBe(MAX_PERSISTED_VALUE_LEN)
  })
})
