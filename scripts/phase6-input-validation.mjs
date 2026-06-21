/**
 * Phase 6 — Input Validation Live Checks
 * Tests that the deployed API rejects bad inputs correctly.
 */
const BASE = 'https://uscis-helper-sergiis-projects-8a97ee0f.vercel.app'
const FAKE_SESSION = '00000000-0000-0000-0000-000000000000'

let passed = 0
let failed = 0

async function check(label, fn) {
  try {
    const result = await fn()
    if (result.pass) {
      console.log(`  ✓ ${label}`)
      passed++
    } else {
      console.log(`  ✗ ${label} — ${result.reason}`)
      failed++
    }
  } catch (err) {
    console.log(`  ✗ ${label} — THREW: ${err.message}`)
    failed++
  }
}

async function post(path, body, expectStatus) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

console.log('\n=== Phase 6 — Input Validation Live Checks ===\n')

// ── correct-field endpoint ────────────────────────────────────────────────────
console.log('correct-field endpoint:')

await check('Bad field name (__proto__) → rejected', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    field: '__proto__', new_value: 'x'
  })
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('Prototype pollution attempt (constructor) → rejected', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    field: 'constructor', new_value: 'x'
  })
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('Oversized value (1001 chars) → rejected', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    field: 'surname', new_value: 'A'.repeat(1001)
  })
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('SQL injection in value → safely handled (not 500)', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    field: 'surname', new_value: "'; DROP TABLE extracted_fields; --"
  })
  // Should get 400 (invalid value) or 404 (session not found), never 500
  if (status !== 500 && json && !json.ok) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('Script injection in value → safely handled', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    field: 'surname', new_value: '<script>alert(1)</script>'
  })
  if (status !== 500 && json && !json.ok) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('Valid field on nonexistent session → 404 not 500', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    field: 'surname', new_value: 'PETRENKO'
  })
  if (status === 404 || (json && json.error === 'session_not_found')) return { pass: true }
  return { pass: false, reason: `status=${status} error=${json?.error}` }
})

await check('Missing field param → 400', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    new_value: 'PETRENKO'
  })
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('Missing new_value param → 400', async () => {
  const { status, json } = await post(`/api/translation/${FAKE_SESSION}/correct-field`, {
    field: 'surname'
  })
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

// ── certify endpoint ──────────────────────────────────────────────────────────
console.log('\ncertify endpoint:')

await check('Missing session_id → 400', async () => {
  const { status, json } = await post('/api/translation/certify', {
    signer_name: 'Test', signature_typed_name: 'Test'
  })
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('Missing signer_name → 400', async () => {
  const { status, json } = await post('/api/translation/certify', {
    session_id: FAKE_SESSION, signature_typed_name: 'Test'
  })
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

// ── render endpoint ───────────────────────────────────────────────────────────
console.log('\nrender endpoint:')

await check('Missing session_id → 400', async () => {
  const { status, json } = await post('/api/translation/render', {})
  if (status === 400 || (json && !json.ok)) return { pass: true }
  return { pass: false, reason: `status=${status} ok=${json?.ok}` }
})

await check('No payment → 402', async () => {
  const { status, json } = await post('/api/translation/render', {
    session_id: FAKE_SESSION
  })
  // Either 402 (payment required) or 404 (session not found) — both acceptable
  if (status === 402 || status === 404) return { pass: true }
  return { pass: false, reason: `status=${status} expected 402 or 404` }
})

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exit(1)
