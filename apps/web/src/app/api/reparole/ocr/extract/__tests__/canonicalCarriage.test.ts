/**
 * canonicalCarriage.test.ts — ReParole end-to-end canonical_document_id carriage.
 *
 * Proves the SAFE carriage contract for Re-Parole:
 *   1. SERVER (extract route): after Core builds the CanonicalDocumentResult it persists
 *      behind CANONICAL_CONTINUITY_MODE and emits `canonical_document_id` in the success
 *      response — the persisted row id on success, `null` on shadow persist failure
 *      (never fabricated). Mirrors the TPS extract route.
 *   2. CLIENT (ReparoleWizardV2): the wizard CAPTURES `canonical_document_id` from the
 *      Core extract response into per-slot wizard state, and RESENDS it (passport-primary,
 *      booklet fallback) in the generate-packet request body — omitting it entirely when
 *      no id was captured (shadow-safe).
 *
 * Style mirrors the sibling uiWiring.test.ts: source inspection (the wizard cannot be
 * mounted in Node without a DOM/React harness, which this project does not provide for
 * this wizard) + pure-logic simulation of the capture/resend behaviour extracted from
 * handleUpload / handleGenerate, plus a route-level decision simulation for the server.
 *
 * No PII is exercised — synthetic ids and field names only.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROUTE_PATH = path.resolve(__dirname, '../route.ts')
const ROUTE_SRC = fs.readFileSync(ROUTE_PATH, 'utf-8')

const WIZARD_PATH = path.resolve(
  __dirname,
  '../../../../../[locale]/services/re-parole-u4u/start/ReparoleWizardV2.tsx',
)
const WIZARD_SRC = fs.readFileSync(WIZARD_PATH, 'utf-8')

// ── 1. SERVER: extract route persists + emits canonical_document_id ───────────
describe('ReParole extract route — canonical persistence + id emission', () => {
  it('imports persistCanonicalDocument from the canonical persistence module', () => {
    expect(ROUTE_SRC).toMatch(/import\s*\{\s*persistCanonicalDocument\s*\}\s*from\s*['"]@\/lib\/canonical\/persistence['"]/)
  })

  it('guards persistence behind the product-scoped canonical mode (off = skip)', () => {
    // Mode is now resolved per-product via getCanonicalMode('reparole'); the legacy
    // global CANONICAL_CONTINUITY_MODE read lives only inside the resolver for back-compat.
    expect(ROUTE_SRC).toMatch(/getCanonicalMode\(\s*['"]reparole['"]\s*\)/)
    expect(ROUTE_SRC).toMatch(/continuityMode\s*!==\s*['"]off['"]/)
  })

  it('persists the built CanonicalDocumentResult and keeps the returned row id', () => {
    expect(ROUTE_SRC).toMatch(/persistCanonicalDocument\(\s*canonical\s*,\s*document_id\s*\)/)
    expect(ROUTE_SRC).toMatch(/reParoleCanonicalDocumentId\s*=\s*persisted\.id/)
  })

  it('includes canonical_document_id in the success response body', () => {
    expect(ROUTE_SRC).toMatch(/canonical_document_id:\s*reParoleCanonicalDocumentId/)
  })

  it('on shadow persist failure returns null id (never fabricates)', () => {
    // initialised to null and only set on success → catch path leaves it null in shadow
    expect(ROUTE_SRC).toMatch(/let\s+reParoleCanonicalDocumentId:\s*string\s*\|\s*null\s*=\s*null/)
    expect(ROUTE_SRC).toMatch(/persist failed \(shadow — non-blocking\)/)
  })

  it('on enforce persist failure returns 503 (never proceeds without canonical)', () => {
    expect(ROUTE_SRC).toMatch(/continuityMode\s*===\s*['"]enforce['"]/)
    expect(ROUTE_SRC).toMatch(/canonical_persistence_failed/)
  })
})

/**
 * Pure simulation of the server's id-emission decision, extracted from the route.
 * Proves: success → persisted id; shadow failure → null; off → null.
 */
type PersistResult = { id: string; resultHash: string; fieldsHash: string }
async function simulateServerEmit(
  mode: string,
  persist: () => Promise<PersistResult>,
): Promise<{ canonical_document_id: string | null; status: number }> {
  let id: string | null = null
  if (mode !== 'off') {
    try {
      const persisted = await persist()
      id = persisted.id
    } catch {
      if (mode === 'enforce') return { canonical_document_id: null, status: 503 }
      // shadow: leave id null, never fabricate
    }
  }
  return { canonical_document_id: id, status: 200 }
}

describe('ReParole extract route — id emission decision (pure)', () => {
  const ok: PersistResult = { id: 'canon-123', resultHash: 'rh', fieldsHash: 'fh' }

  it('shadow + persist success → emits the persisted id', async () => {
    const r = await simulateServerEmit('shadow', async () => ok)
    expect(r.canonical_document_id).toBe('canon-123')
    expect(r.status).toBe(200)
  })

  it('shadow + persist failure → emits null, status 200 (non-blocking, no fabrication)', async () => {
    const r = await simulateServerEmit('shadow', async () => { throw new Error('storage down') })
    expect(r.canonical_document_id).toBeNull()
    expect(r.status).toBe(200)
  })

  it('off → skips persistence, emits null', async () => {
    let called = false
    const r = await simulateServerEmit('off', async () => { called = true; return ok })
    expect(called).toBe(false)
    expect(r.canonical_document_id).toBeNull()
  })

  it('enforce + persist failure → 503 (never carries forward)', async () => {
    const r = await simulateServerEmit('enforce', async () => { throw new Error('storage down') })
    expect(r.status).toBe(503)
    expect(r.canonical_document_id).toBeNull()
  })
})

// ── 2. CLIENT: wizard captures from extract response ──────────────────────────
describe('ReparoleWizardV2 — CAPTURE canonical_document_id from extract response', () => {
  it('UploadEntry carries an optional canonical_document_id field', () => {
    expect(WIZARD_SRC).toMatch(/canonical_document_id\?:\s*string\s*\|\s*null/)
  })

  it('captures the id only from a Core (_core===true) response with a string id', () => {
    expect(WIZARD_SRC).toMatch(/capturedCanonicalId/)
    expect(WIZARD_SRC).toMatch(/useCoreRoute\s*&&\s*json\?\._core\s*===\s*true\s*&&\s*typeof\s*json\?\.canonical_document_id\s*===\s*['"]string['"]/)
  })

  it('stores the captured id into the upload entry state', () => {
    expect(WIZARD_SRC).toMatch(/canonical_document_id:\s*capturedCanonicalId/)
  })

  it('persists + rehydrates the id through localStorage uploadsMeta', () => {
    expect(WIZARD_SRC).toMatch(/canonical_document_id:\s*u\.canonical_document_id/)
    expect(WIZARD_SRC).toMatch(/canonical_document_id:\s*typeof m\.canonical_document_id === ['"]string['"]/)
  })
})

/**
 * Pure simulation of handleUpload's capture branch.
 */
function simulateCapture(json: Record<string, unknown>, useCoreRoute: boolean): string | null {
  return useCoreRoute && json?._core === true && typeof json?.canonical_document_id === 'string'
    ? (json.canonical_document_id as string)
    : null
}

describe('ReparoleWizardV2 — capture logic (pure)', () => {
  it('Core response with a real id → captures it', () => {
    expect(simulateCapture({ _core: true, canonical_document_id: 'canon-abc' }, true)).toBe('canon-abc')
  })

  it('Core response with null id (shadow persist failed) → captures null', () => {
    expect(simulateCapture({ _core: true, canonical_document_id: null }, true)).toBeNull()
  })

  it('TPS fallback route (non-Core, i94/ead/dl) → never captures an id', () => {
    expect(simulateCapture({ module: { fields: [] } }, false)).toBeNull()
  })
})

// ── 3. CLIENT: wizard resends the id in the generate-packet body ──────────────
describe('ReparoleWizardV2 — RESEND canonical_document_id in generate body', () => {
  it('resolves the id passport-primary with booklet fallback', () => {
    expect(WIZARD_SRC).toMatch(/data\.uploads\.passport\?\.canonical_document_id/)
    expect(WIZARD_SRC).toMatch(/data\.uploads\.booklet\?\.canonical_document_id/)
  })

  it('spreads canonical_document_id into the answers body only when captured', () => {
    expect(WIZARD_SRC).toMatch(/\.\.\.\(canonicalDocumentId\s*\?\s*\{\s*canonical_document_id:\s*canonicalDocumentId\s*\}\s*:\s*\{\}\)/)
  })

  it('POSTs the answers body (with the id) to /api/reparole/generate-packet', () => {
    expect(WIZARD_SRC).toMatch(/\/api\/reparole\/generate-packet/)
    expect(WIZARD_SRC).toMatch(/body:\s*JSON\.stringify\(answers\)/)
  })
})

/**
 * Pure simulation of handleGenerate's resend branch: build the body fragment that the
 * wizard appends, given the per-slot captured ids.
 */
function simulateResend(uploads: {
  passport?: { canonical_document_id?: string | null }
  booklet?: { canonical_document_id?: string | null }
}): { canonical_document_id?: string } {
  const canonicalDocumentId: string | null =
    (typeof uploads.passport?.canonical_document_id === 'string'
      ? uploads.passport.canonical_document_id
      : null) ??
    (typeof uploads.booklet?.canonical_document_id === 'string'
      ? uploads.booklet.canonical_document_id
      : null)
  return { ...(canonicalDocumentId ? { canonical_document_id: canonicalDocumentId } : {}) }
}

describe('ReparoleWizardV2 — resend logic (pure)', () => {
  it('passport id present → body carries the passport id', () => {
    const body = simulateResend({ passport: { canonical_document_id: 'canon-passport' } })
    expect(body.canonical_document_id).toBe('canon-passport')
  })

  it('no passport, booklet present → falls back to the booklet id', () => {
    const body = simulateResend({ booklet: { canonical_document_id: 'canon-booklet' } })
    expect(body.canonical_document_id).toBe('canon-booklet')
  })

  it('passport id present wins over booklet (primary identity doc)', () => {
    const body = simulateResend({
      passport: { canonical_document_id: 'canon-passport' },
      booklet: { canonical_document_id: 'canon-booklet' },
    })
    expect(body.canonical_document_id).toBe('canon-passport')
  })

  it('no id captured (shadow persist failed / off) → field is OMITTED, not null', () => {
    const body = simulateResend({ passport: { canonical_document_id: null } })
    expect('canonical_document_id' in body).toBe(false)
  })

  it('end-to-end: captured server id flows into the resend body', () => {
    const captured = simulateCapture({ _core: true, canonical_document_id: 'canon-e2e' }, true)
    const body = simulateResend({ passport: { canonical_document_id: captured } })
    expect(body.canonical_document_id).toBe('canon-e2e')
  })
})

// ── 4. Body type accepts the optional field ───────────────────────────────────
describe('ReParoleAnswers contract', () => {
  it('answers.ts declares optional canonical_document_id', () => {
    const ANSWERS_SRC = fs.readFileSync(
      path.resolve(__dirname, '../../../../../../lib/reparole/answers.ts'),
      'utf-8',
    )
    expect(ANSWERS_SRC).toMatch(/canonical_document_id\?:\s*string/)
  })
})
