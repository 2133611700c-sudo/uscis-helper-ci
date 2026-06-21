/**
 * Regression tests for applyI94StatusAlias — covers the bug found in the
 * 2026-05-20 TPS_CLEAN_SESSION_REAL_UPLOAD_E2E_AUDIT where the wizard left
 * `status_at_last_entry` blank on both I-821 and I-765 even though the I-94
 * OCR module had successfully extracted `i94_class_of_admission`.
 */
import { describe, it, expect } from 'vitest'
import { applyI94StatusAlias } from '../wizardAliases'

interface Fx {
  value: string
  source?: string
  requires_review?: boolean
  doc_slot?: string
}

describe('applyI94StatusAlias', () => {
  it('aliases i94_class_of_admission → status_at_last_entry when status is missing', () => {
    const merged: Record<string, Fx> = {
      i94_class_of_admission: {
        value: 'UHP',
        source: 'ocr_keyword',
        requires_review: false,
        doc_slot: 'i94',
      },
    }
    const out = applyI94StatusAlias(merged)
    expect(out.status_at_last_entry?.value).toBe('UHP')
    // alias forces review_required so the user confirms code expansion
    expect(out.status_at_last_entry?.requires_review).toBe(true)
    // original field stays untouched
    expect(out.i94_class_of_admission?.requires_review).toBe(false)
  })

  it('preserves existing status_at_last_entry — alias never overwrites manual or higher-trust value', () => {
    const merged: Record<string, Fx> = {
      i94_class_of_admission: { value: 'UHP', doc_slot: 'i94' },
      status_at_last_entry: { value: 'Parole', source: 'user_input', doc_slot: 'manual' },
    }
    const out = applyI94StatusAlias(merged)
    expect(out.status_at_last_entry.value).toBe('Parole')
    expect(out.status_at_last_entry.source).toBe('user_input')
  })

  it('is a no-op when i94_class_of_admission is missing', () => {
    const merged: Record<string, Fx> = {
      family_name: { value: 'Doe', source: 'ocr_mrz', doc_slot: 'passport' },
    }
    const out = applyI94StatusAlias(merged)
    expect(out.status_at_last_entry).toBeUndefined()
    expect(out).toBe(merged) // no allocation when nothing to do
  })

  it('is a no-op when i94_class_of_admission has empty value', () => {
    const merged: Record<string, Fx> = {
      i94_class_of_admission: { value: '', doc_slot: 'i94' },
    }
    const out = applyI94StatusAlias(merged)
    expect(out.status_at_last_entry).toBeUndefined()
  })

  it('does not mutate input record', () => {
    const merged: Record<string, Fx> = {
      i94_class_of_admission: { value: 'B-2', doc_slot: 'i94' },
    }
    const snapshot = JSON.parse(JSON.stringify(merged))
    applyI94StatusAlias(merged)
    expect(merged).toEqual(snapshot)
  })

  it('is idempotent — running twice produces the same result as once', () => {
    const merged: Record<string, Fx> = {
      i94_class_of_admission: { value: 'UHP', doc_slot: 'i94' },
    }
    const once = applyI94StatusAlias(merged)
    const twice = applyI94StatusAlias(once)
    expect(twice).toEqual(once)
  })
})
