/**
 * Phase 2.1a — hard-case autoread flag behavior tests (pure logic, no React render)
 *
 * These tests verify the routing logic behind NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED:
 *   - Flag OFF: birth/marriage go to manual path, no vision-extract call, can proceed to payment
 *   - Flag ON + fields returned: review gate enforced (hardCaseHasFields=true → needsReviewGate=true)
 *   - Flag ON + 0 fields: falls back to manual path (hardCaseHasFields=false → no gate)
 *   - Error path: falls back to manual (no gate)
 *
 * These are pure logic tests — no React import, no browser env, no mocking.
 * The actual component wiring is verified by manual browser test / owner preview.
 */
import { describe, it, expect } from 'vitest'

// ── replicate the relevant DOC_TYPES and flag logic ───────────────────────────

interface DocTypeMeta {
  id: string
  auto: boolean
  autoread?: boolean
  registryId: string | null
}

function makeDocTypes(hardCaseAutoread: boolean): DocTypeMeta[] {
  return [
    { id: 'passport_internal', auto: true,                              registryId: 'ua_internal_passport_booklet' },
    { id: 'passport_foreign',  auto: true,                              registryId: 'ua_international_passport' },
    { id: 'birth',             auto: false, autoread: hardCaseAutoread, registryId: 'ua_birth_certificate' },
    { id: 'marriage',          auto: false, autoread: hardCaseAutoread, registryId: 'ua_marriage_certificate' },
    { id: 'id_card',           auto: true,                              registryId: 'ua_id_card' },
    { id: 'other',             auto: false,                             registryId: null },
  ]
}

function shouldCallVisionExtract(meta: DocTypeMeta | undefined): boolean {
  return (!!meta?.auto || !!meta?.autoread) && !!meta?.registryId
}

function computeNeedsReviewGate(meta: DocTypeMeta | null | undefined, hardCaseHasFields: boolean): boolean {
  return !!meta?.auto || hardCaseHasFields
}

function computeHardCaseHasFields(meta: DocTypeMeta | null | undefined, fields: unknown[]): boolean {
  return !meta?.auto && !!meta?.autoread && fields.length > 0
}

function computeCanProceed(needsReviewGate: boolean, fieldsCount: number, hasUnresolved: boolean): boolean {
  return !needsReviewGate || (fieldsCount > 0 && !hasUnresolved)
}

// ── Flag OFF tests ────────────────────────────────────────────────────────────

describe('Phase 2.1a — Flag OFF (NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED absent)', () => {
  const DOC_TYPES = makeDocTypes(false)

  it('birth cert: shouldCallVisionExtract = false (manual path)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    expect(shouldCallVisionExtract(meta)).toBe(false)
  })

  it('marriage cert: shouldCallVisionExtract = false (manual path)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'marriage')
    expect(shouldCallVisionExtract(meta)).toBe(false)
  })

  it('passport: shouldCallVisionExtract = true (unchanged)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'passport_internal')
    expect(shouldCallVisionExtract(meta)).toBe(true)
  })

  it('other: shouldCallVisionExtract = false (registryId=null)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'other')
    expect(shouldCallVisionExtract(meta)).toBe(false)
  })

  it('birth cert OFF: canProceed=true even with empty fields (manual path, no gate)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    const hardCaseHasFields = false  // never set in manual path
    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    expect(needsReviewGate).toBe(false)
    expect(computeCanProceed(needsReviewGate, 0, false)).toBe(true)
  })
})

// ── Flag ON tests ─────────────────────────────────────────────────────────────

describe('Phase 2.1a — Flag ON (NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED=1)', () => {
  const DOC_TYPES = makeDocTypes(true)

  it('birth cert ON: shouldCallVisionExtract = true', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    expect(shouldCallVisionExtract(meta)).toBe(true)
  })

  it('marriage cert ON: shouldCallVisionExtract = true', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'marriage')
    expect(shouldCallVisionExtract(meta)).toBe(true)
  })

  it('birth + fields returned: hardCaseHasFields=true → review gate enforced', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    const fields = [{ field: 'child_full_name', value: 'Test', review_required: true }]
    const hardCaseHasFields = computeHardCaseHasFields(meta, fields)
    expect(hardCaseHasFields).toBe(true)

    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    expect(needsReviewGate).toBe(true)
  })

  it('birth + fields + unresolved reviews: canProceed=false (review gate blocks payment)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    const fields = [{ field: 'child_full_name', value: 'Test', review_required: true }]
    const hardCaseHasFields = computeHardCaseHasFields(meta, fields)
    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    const hasUnresolved = true  // fields still have review_required

    expect(computeCanProceed(needsReviewGate, fields.length, hasUnresolved)).toBe(false)
  })

  it('birth + fields + all confirmed: canProceed=true (gate passed)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    const fields = [{ field: 'child_full_name', value: 'Test', review_required: false }]  // confirmed
    const hardCaseHasFields = computeHardCaseHasFields(meta, fields)
    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    const hasUnresolved = false  // all confirmed

    expect(computeCanProceed(needsReviewGate, fields.length, hasUnresolved)).toBe(true)
  })

  it('birth + 0 fields (Gemini read nothing): hardCaseHasFields=false → no gate → can proceed', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    const fields: unknown[] = []
    const hardCaseHasFields = computeHardCaseHasFields(meta, fields)
    expect(hardCaseHasFields).toBe(false)  // 0 fields → fall through to manual

    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    expect(needsReviewGate).toBe(false)
    expect(computeCanProceed(needsReviewGate, 0, false)).toBe(true)
  })

  it('birth + error path: hardCaseHasFields=false → no gate → can proceed (specialist handles)', () => {
    // On error we set setHardCaseHasFields(false) → same as 0-field fallback
    const meta = DOC_TYPES.find((d) => d.id === 'birth')
    const hardCaseHasFields = false  // set false on error
    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    expect(needsReviewGate).toBe(false)
    expect(computeCanProceed(needsReviewGate, 0, false)).toBe(true)
  })

  it('passport: unchanged — review gate enforced regardless (auto=true)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'passport_internal')
    const hardCaseHasFields = false  // not applicable for auto=true docs
    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    expect(needsReviewGate).toBe(true)
  })

  it('other: no autoread, no gate (manual-only, registryId=null)', () => {
    const meta = DOC_TYPES.find((d) => d.id === 'other')
    expect(shouldCallVisionExtract(meta)).toBe(false)
    const hardCaseHasFields = false
    const needsReviewGate = computeNeedsReviewGate(meta, hardCaseHasFields)
    expect(needsReviewGate).toBe(false)
  })
})
