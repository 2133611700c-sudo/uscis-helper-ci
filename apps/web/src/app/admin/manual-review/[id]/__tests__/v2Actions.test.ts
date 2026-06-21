import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tests for the V2 operator Server Actions (v2Actions.ts).
 *
 * Two layers:
 *   1. Source-level invariants (audit #195): auth is fail-closed and comes from
 *      main's ./legacyOperatorAuth — NOT the discarded #119 lib/auth helper.
 *   2. Behavioral: with orders/index + auth mocked, the actor flows into every
 *      audited transition / override (provenance), and an auth failure aborts
 *      before any mutation.
 */

// ── 1. Source-level invariants ────────────────────────────────────────────────
const src = readFileSync(resolve(__dirname, '../v2Actions.ts'), 'utf8')

describe('v2Actions — auth wiring (audit #195)', () => {
  it('imports requireTranslationOperator + OperatorAuthError from ./legacyOperatorAuth', () => {
    expect(src).toMatch(
      /import\s*\{\s*requireTranslationOperator\s*,\s*OperatorAuthError\s*\}\s*from\s*['"]\.\/legacyOperatorAuth['"]/,
    )
  })

  it('never references the discarded #119 lib/auth helper', () => {
    expect(src).not.toContain('@/lib/auth/requireTranslationOperator')
    expect(src).not.toContain('lib/auth/requireTranslationOperator')
  })

  it('every exported async action calls requireTranslationOperator() FIRST', () => {
    const exportRe = /export async function (\w+)\(/g
    let m: RegExpExecArray | null
    const names: string[] = []
    while ((m = exportRe.exec(src))) names.push(m[1])
    expect(names.length).toBeGreaterThanOrEqual(7)

    for (const name of names) {
      const start = src.indexOf(`export async function ${name}(`)
      const after = src.indexOf('\nexport async function ', start + 1)
      const body = src.slice(start, after === -1 ? src.length : after)
      const authIdx = body.indexOf('requireTranslationOperator(')
      expect(authIdx, `${name} must call requireTranslationOperator`).toBeGreaterThan(-1)
      // auth must precede any DB / override / transition / storage side effect.
      for (const fx of [
        'transitionOrder(',
        'applyOperatorOverride(',
        'createArtifactAndEnqueue(',
        'createAdminSupabaseClient(',
        'renderFromCanonical(',
      ]) {
        const i = body.indexOf(fx)
        if (i !== -1) {
          expect(authIdx, `${name}: auth must precede ${fx}`).toBeLessThan(i)
        }
      }
    }
  })

  it('field edits go through the canonical override channel (never a translated_fields blob)', () => {
    expect(src).toContain('applyOperatorOverride(')
    expect(src).not.toContain('translated_fields')
  })
})

// ── 2. Behavioral (mocked deps) ───────────────────────────────────────────────
class FakeOrderError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.name = 'TranslationOrderError'
    this.code = code
  }
}
class FakeAuthError extends Error {
  code: string
  httpStatus: number
  constructor(code: string) {
    super(`operator_${code}`)
    this.name = 'OperatorAuthError'
    this.code = code
    this.httpStatus = code === 'not_configured' ? 403 : 401
  }
}

const requireOperator = vi.fn()
const getOrderById = vi.fn()
const transitionOrder = vi.fn()
const applyOperatorOverride = vi.fn()

vi.mock('../legacyOperatorAuth', () => ({
  requireTranslationOperator: () => requireOperator(),
  OperatorAuthError: FakeAuthError,
}))

vi.mock('@/lib/translation/orders', () => ({
  getOrderById: (id: string) => getOrderById(id),
  transitionOrder: (i: unknown) => transitionOrder(i),
  applyOperatorOverride: (...a: unknown[]) => applyOperatorOverride(...a),
  createArtifactAndEnqueue: vi.fn(),
  TranslationOrderError: FakeOrderError,
  TRANSLATION_ARTIFACTS_BUCKET: 'translation-artifacts',
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }))
vi.mock('@/lib/translation/orders/renderFromCanonical', () => ({
  renderFromCanonical: vi.fn(),
  CanonicalRenderError: class extends Error {},
}))
vi.mock('@/lib/translation/observability/events', () => ({ emitEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ACTOR = 'translation_operator'

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

describe('v2Actions — provenance + fail-closed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOperator.mockResolvedValue({ actor: ACTOR })
  })

  it('assignOrder records the actor in the audited transition', async () => {
    const { assignOrder } = await import('../v2Actions')
    getOrderById.mockResolvedValue({ id: 'o1', version: 3, status: 'queued', canonicalDocumentId: 'c1' })
    transitionOrder.mockResolvedValue({ status: 'assigned', version: 4 })

    const res = await assignOrder(fd({ id: 'o1', expectedVersion: '3' }))

    expect(res.ok).toBe(true)
    expect(res.version).toBe(4)
    expect(transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'o1', toStatus: 'assigned', actor: ACTOR }),
    )
  })

  it('appendOverride carries actor as operatorId through the override channel', async () => {
    const { appendOverride } = await import('../v2Actions')
    getOrderById.mockResolvedValue({ id: 'o1', version: 5, status: 'in_review', canonicalDocumentId: 'c1' })
    applyOperatorOverride.mockResolvedValue(2)

    const res = await appendOverride(
      fd({ id: 'o1', expectedVersion: '5', fieldKey: 'given_name', value: 'Olha', expectedOverrideVersion: '1' }),
    )

    expect(res.ok).toBe(true)
    expect(applyOperatorOverride).toHaveBeenCalledWith(
      'c1',
      [expect.objectContaining({ fieldKey: 'given_name', value: 'Olha', operatorId: ACTOR, reason: 'operator_override' })],
      { expectedVersion: 1 },
    )
    // base canonical is never mutated — only the override channel is touched.
    expect(transitionOrder).not.toHaveBeenCalled()
  })

  it('appendOverride treats an empty value as an explicit reject (null)', async () => {
    const { appendOverride } = await import('../v2Actions')
    getOrderById.mockResolvedValue({ id: 'o1', version: 5, status: 'in_review', canonicalDocumentId: 'c1' })
    applyOperatorOverride.mockResolvedValue(2)

    await appendOverride(fd({ id: 'o1', expectedVersion: '5', fieldKey: 'patronymic', value: '   ' }))

    expect(applyOperatorOverride).toHaveBeenCalledWith(
      'c1',
      [expect.objectContaining({ fieldKey: 'patronymic', value: null, operatorId: ACTOR })],
      expect.anything(),
    )
  })

  it('fail-closed: an auth error aborts before any mutation (401)', async () => {
    const { assignOrder } = await import('../v2Actions')
    requireOperator.mockRejectedValue(new FakeAuthError('unauthenticated'))

    const res = await assignOrder(fd({ id: 'o1', expectedVersion: '3' }))

    expect(res.ok).toBe(false)
    expect(res.status).toBe(401)
    expect(getOrderById).not.toHaveBeenCalled()
    expect(transitionOrder).not.toHaveBeenCalled()
  })

  it('a stale tab surfaces ORDER_VERSION_CONFLICT as 409', async () => {
    const { beginReview } = await import('../v2Actions')
    getOrderById.mockResolvedValue({ id: 'o1', version: 9, status: 'assigned', canonicalDocumentId: 'c1' })

    const res = await beginReview(fd({ id: 'o1', expectedVersion: '3' }))

    expect(res.ok).toBe(false)
    expect(res.status).toBe(409)
    expect(res.error).toBe('ORDER_VERSION_CONFLICT')
    expect(transitionOrder).not.toHaveBeenCalled()
  })
})
