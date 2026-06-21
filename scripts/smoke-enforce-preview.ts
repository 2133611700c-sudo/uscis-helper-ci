/**
 * scripts/smoke-enforce-preview.ts
 *
 * Turnkey enforce-mode smoke for the canonical-continuity PREVIEW deploy.
 *
 *   pnpm tsx scripts/smoke-enforce-preview.ts
 *
 * Required env:
 *   PREVIEW_BASE_URL   e.g. https://uscis-helper-xxxx.vercel.app  (NO trailing slash)
 *
 * SAFETY CONTRACT (read before running):
 *   - This harness makes ONLY read-only HTTP calls. Every assertion below
 *     exercises a code path that returns its status code BEFORE any DB write,
 *     payment charge, PDF render, or email send. Nothing is mutated.
 *   - It deliberately does NOT call the OCR extract endpoint (that runs PAID
 *     Google Vision and would INSERT a canonical_documents row). Extract-driven
 *     end-to-end is an owner-manual + integration-test step — see the runbook.
 *   - The HTTP override route now EXISTS
 *     (apps/web/src/app/api/canonical/[id]/override/route.ts). This script
 *     exercises it. The read-only override checks (O0: bogus id → 404) run
 *     unconditionally and mutate nothing. The MUTATING 200→409 flow (O1/O2/O3)
 *     runs ONLY when SMOKE_CANONICAL_ID is explicitly set to a sentinel
 *     canonical UUID, so an accidental run never writes overrides to a real
 *     customer document.
 *
 * WHAT THIS PROVES (the live-preview enforce gate):
 *   T1  translation/generate-pdf  — missing canonical_document_id → 422 CANONICAL_ID_REQUIRED
 *   T2  translation/generate-pdf  — bogus canonical_document_id    → 404 CANONICAL_NOT_FOUND
 *   T3  translation/render        — missing canonical_document_id → 422 CANONICAL_ID_REQUIRED
 *   T4  translation/render        — bogus canonical_document_id    → 404 CANONICAL_NOT_FOUND
 *
 * If enforce mode were NOT set (e.g. still shadow), T1/T3 would NOT 422 — they
 * would fall through to the payment/review gates (402/403/400). So a green run
 * here is positive evidence the preview env has CANONICAL_CONTINUITY_MODE=enforce.
 *
 * Exit 0 = all PASS. Exit 1 = any FAIL. PII-free output.
 */

const BASE = (process.env.PREVIEW_BASE_URL ?? '').replace(/\/+$/, '')

if (!BASE) {
  console.error('FAIL: PREVIEW_BASE_URL is not set.')
  console.error('  export PREVIEW_BASE_URL=https://uscis-helper-xxxx.vercel.app')
  process.exit(1)
}
if (!/^https:\/\//.test(BASE)) {
  console.error(`FAIL: PREVIEW_BASE_URL must be https. Got: ${BASE}`)
  process.exit(1)
}

// A syntactically valid UUID that will not exist in the canonical_documents table.
// resolveCanonicalDocument() returns null for it → route returns 404 (read-only SELECT).
const BOGUS_UUID = '00000000-0000-4000-8000-000000000000'

interface Check {
  id: string
  name: string
  pass: boolean
  detail: string
}

const checks: Check[] = []

function record(id: string, name: string, pass: boolean, detail: string) {
  checks.push({ id, name, pass, detail })
  const tag = pass ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${id} ${name} — ${detail}`)
}

/** Minimal review-gate-free body. We only care about the canonical pre-gate, which
 *  runs before payment/review, so we send the smallest body the route will parse. */
function pdfBody(canonicalId?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    session_id: 'SMOKE-enforce-preview',
    doc_type: 'ua_birth_certificate',
    profile: { name: '', email: '', phone: '', addr: '' },
    selectedPlan: 'basic',
    spanishCopy: false,
    locale: 'en',
    signatureDataUrl: null,
    signatureMethod: 'manual_wet_signature',
    signedAt: new Date().toISOString(),
    certificationTextVersion: 'smoke',
    fields: [],
  }
  if (canonicalId !== undefined) body.canonical_document_id = canonicalId
  return body
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON (e.g. a PDF) — leave json null */
  }
  return { status: res.status, json, text }
}

async function assertEnforceGate(
  id: string,
  path: string,
  body: Record<string, unknown>,
  expectStatus: number,
  expectErrorCode: string,
) {
  const name = `${path} → ${expectStatus} ${expectErrorCode}`
  try {
    const { status, json } = await postJson(path, body)
    const code = json?.error ?? '(none)'
    const pass = status === expectStatus && code === expectErrorCode
    record(
      id,
      name,
      pass,
      `got status=${status} error=${code}` +
        (pass ? '' : ` (expected status=${expectStatus} error=${expectErrorCode})`),
    )
  } catch (e: any) {
    record(id, name, false, `request threw: ${e?.message ?? e}`)
  }
}

/** GET helper for the override list route. */
async function getJson(
  path: string,
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${BASE}${path}`, { method: 'GET' })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text }
}

/**
 * Override route checks.
 * O0 (always, read-only): POST to a bogus canonical id → 404 CANONICAL_NOT_FOUND.
 *   loadCanonicalDocumentById returns null for the bogus UUID BEFORE any write.
 * O1/O2/O3 (mutating, gated on SMOKE_CANONICAL_ID): real append → 200, stale → 409,
 *   GET list is PII-free. Skipped unless a sentinel canonical id is provided.
 */
async function overrideChecks() {
  const sentinelOverride = {
    field_key: 'family_name',
    override_value: 'TESTIVANENKO', // PII-free synthetic sentinel
    source: 'user_edit',
    confirmed: true,
    actor: 'smoke',
  }

  // O0 — bogus id, read-only (load returns null → 404 before any write)
  {
    const { status, json } = await postJson(
      `/api/canonical/${BOGUS_UUID}/override`,
      { session_id: 'SMOKE-enforce-preview', expected_version: 0, overrides: [sentinelOverride] },
    )
    const code = json?.error ?? '(none)'
    record(
      'O0',
      `override POST bogus id → 404 CANONICAL_NOT_FOUND`,
      status === 404 && code === 'CANONICAL_NOT_FOUND',
      `got status=${status} error=${code}`,
    )
  }

  const canonicalId = process.env.SMOKE_CANONICAL_ID
  if (!canonicalId) {
    console.log(
      '[SKIP] O1/O2/O3 mutating override flow — set SMOKE_CANONICAL_ID=<sentinel canonical uuid> to enable',
    )
    return
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(canonicalId)) {
    record('O1', 'override mutating flow', false, `SMOKE_CANONICAL_ID is not a UUID: ${canonicalId}`)
    return
  }

  // O1 — append one confirmed user_edit at expected_version=0 → 200, capture new_version
  const post1 = await postJson(`/api/canonical/${canonicalId}/override`, {
    session_id: process.env.SMOKE_SESSION_ID ?? undefined,
    expected_version: 0,
    overrides: [sentinelOverride],
  })
  record(
    'O1',
    'override POST expected_version=0 → 200 ok',
    post1.status === 200 && post1.json?.ok === true && typeof post1.json?.new_version === 'number',
    `got status=${post1.status} new_version=${post1.json?.new_version ?? '(none)'}`,
  )

  // O2 — repeat with the now-stale expected_version=0 → 409 OVERRIDE_VERSION_CONFLICT
  const post2 = await postJson(`/api/canonical/${canonicalId}/override`, {
    session_id: process.env.SMOKE_SESSION_ID ?? undefined,
    expected_version: 0,
    overrides: [sentinelOverride],
  })
  record(
    'O2',
    'override POST stale expected_version=0 → 409 OVERRIDE_VERSION_CONFLICT',
    post2.status === 409 && post2.json?.error === 'OVERRIDE_VERSION_CONFLICT',
    `got status=${post2.status} error=${post2.json?.error ?? '(none)'}`,
  )

  // O3 — GET list is PII-free: field_keys present, NO override_value in payload
  const sessionQs = process.env.SMOKE_SESSION_ID
    ? `?session_id=${encodeURIComponent(process.env.SMOKE_SESSION_ID)}`
    : ''
  const get1 = await getJson(`/api/canonical/${canonicalId}/override${sessionQs}`)
  const hasFieldKeys = Array.isArray(get1.json?.field_keys) && get1.json.field_keys.length > 0
  const leaksValue =
    get1.text.includes('override_value') || get1.text.includes('TESTIVANENKO')
  record(
    'O3',
    'override GET → field_keys present, NO override_value',
    get1.status === 200 && hasFieldKeys && !leaksValue,
    `got status=${get1.status} field_keys=${JSON.stringify(get1.json?.field_keys)} leaks=${leaksValue}`,
  )
}

async function main() {
  console.log('─'.repeat(72))
  console.log('Canonical-continuity ENFORCE smoke (read-only HTTP)')
  console.log(`Target: ${BASE}`)
  console.log('─'.repeat(72))

  // T1 — generate-pdf, no canonical_document_id → 422
  await assertEnforceGate(
    'T1',
    '/api/translation/generate-pdf',
    pdfBody(/* no id */),
    422,
    'CANONICAL_ID_REQUIRED',
  )

  // T2 — generate-pdf, bogus (non-existent) canonical_document_id → 404
  await assertEnforceGate(
    'T2',
    '/api/translation/generate-pdf',
    pdfBody(BOGUS_UUID),
    404,
    'CANONICAL_NOT_FOUND',
  )

  // T3 — render, no canonical_document_id → 422
  await assertEnforceGate(
    'T3',
    '/api/translation/render',
    { session_id: 'SMOKE-enforce-preview' },
    422,
    'CANONICAL_ID_REQUIRED',
  )

  // T4 — render, bogus canonical_document_id → 404
  await assertEnforceGate(
    'T4',
    '/api/translation/render',
    { session_id: 'SMOKE-enforce-preview', canonical_document_id: BOGUS_UUID },
    404,
    'CANONICAL_NOT_FOUND',
  )

  // O0..O3 — HTTP override route (O0 read-only; O1..O3 gated on SMOKE_CANONICAL_ID)
  await overrideChecks()

  console.log('─'.repeat(72))
  const failed = checks.filter((c) => !c.pass)
  const passed = checks.length - failed.length
  console.log(`SUMMARY: ${passed}/${checks.length} PASS`)

  if (failed.length > 0) {
    console.log('')
    console.log('FAILURES:')
    for (const f of failed) console.log(`  - ${f.id} ${f.name}: ${f.detail}`)
    console.log('')
    console.log('Most likely cause if T1/T3 did NOT return 422:')
    console.log('  CANONICAL_CONTINUITY_MODE is not "enforce" on this preview deploy,')
    console.log('  OR the preview was not REDEPLOYED after setting the env var')
    console.log('  (Vercel applies env changes to the NEXT deploy only).')
  }

  console.log('─'.repeat(72))
  console.log('NOT covered by this read-only HTTP smoke (see runbook):')
  console.log('  - extract → real canonical UUID (PAID Vision, INSERTs a row): owner-manual')
  console.log('  - override 200 then 409 version-conflict: HTTP route now EXISTS; run with')
  console.log('    SMOKE_CANONICAL_ID=<sentinel uuid> (and optional SMOKE_SESSION_ID) to')
  console.log('    exercise O1/O2/O3. Library test canonicalConcurrency.integration still')
  console.log('    covers the atomic RPC guarantee directly.')
  console.log('  - generate-pdf 200 + 7-field cert metadata: needs owner session + a real')
  console.log('    canonical id + signed review payload: owner-manual + Supabase SQL check')
  console.log('─'.repeat(72))

  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('FAIL: smoke harness crashed:', e?.message ?? e)
  process.exit(1)
})
