#!/usr/bin/env node
/**
 * Wizard simulation — proves what user sees in Step 5 review.
 * Calls /api/tps/ocr/extract, then applies the wizard's client-side
 * filter + arbiter logic to show the user-visible result.
 */

import fs from 'fs'
import path from 'path'

const BASE_URL = process.argv[2] || 'http://localhost:3000'
const IMAGE = process.env.E2E_BOOKLET_IMAGE ?? '/Users/sergiiivanenko/work/uscis-helper/qa-shots/private/booklet_test_resized.jpg'

// Mirror the wizard's BOOKLET_WAVE1_FIELDS set (AFTER fix).
const BOOKLET_WAVE1_FIELDS = new Set([
  'city_of_birth', 'province_of_birth', 'middle_name', 'family_name',
])

async function main() {
  console.log('=== WIZARD SIMULATION ===')
  console.log(`Server: ${BASE_URL}`)
  console.log(`Image: ${IMAGE}\n`)

  // 1. Upload booklet to API
  const fileBuf = fs.readFileSync(IMAGE)
  const form = new FormData()
  const blob = new Blob([fileBuf], { type: 'image/jpeg' })
  form.append('file', blob, path.basename(IMAGE))
  form.append('docHint', 'booklet')

  const resp = await fetch(`${BASE_URL}/api/tps/ocr/extract`, {
    method: 'POST',
    body: form,
  })
  if (!resp.ok) {
    console.log(`API returned ${resp.status}`)
    process.exit(1)
  }
  const data = await resp.json()
  const fields = data.module?.fields || []

  console.log(`API returned ${fields.length} fields:`)
  for (const f of fields) {
    console.log(`  ${f.field}: norm="${f.normalized_value}" src=${f.extraction_source}`)
  }

  // 2. Apply wizard's BOOKLET_WAVE1_FIELDS filter (this is the bug area)
  console.log('\n--- After wizard BOOKLET_WAVE1_FIELDS filter ---')
  const visibleToWizard = fields.filter(f => BOOKLET_WAVE1_FIELDS.has(f.field))
  console.log(`${visibleToWizard.length} fields survive client filter:`)
  for (const f of visibleToWizard) {
    console.log(`  ${f.field}: "${f.normalized_value}"`)
  }

  // 3. Verdict
  console.log('\n=== USER-VISIBLE RESULT (Step 5 Review) ===')
  const showsSurname = visibleToWizard.find(f => f.field === 'family_name')
  const showsCity = visibleToWizard.find(f => f.field === 'city_of_birth')
  const showsProvince = visibleToWizard.find(f => f.field === 'province_of_birth')
  const showsPatronymic = visibleToWizard.find(f => f.field === 'middle_name')

  const expected = {
    family_name: process.env.E2E_EXPECTED_FAMILY_NAME ?? 'Ivanenko',
    city_of_birth: process.env.E2E_EXPECTED_CITY ?? 'Trostianets',
    province_of_birth: process.env.E2E_EXPECTED_PROVINCE ?? 'Vinnytsia Oblast',
    middle_name: process.env.E2E_EXPECTED_PATRONYMIC ?? 'Tarasovych',
  }
  let pass = true
  for (const [k, exp] of Object.entries(expected)) {
    const got = visibleToWizard.find(f => f.field === k)?.normalized_value
    const match = got === exp
    console.log(`  ${match ? '✅' : '❌'} ${k}: expected="${exp}" got="${got || 'MISSING'}"`)
    if (!match) pass = false
  }
  console.log(`\nFINAL: ${pass ? '✅ ALL 4 FIELDS REACH USER' : '❌ FIELDS MISSING IN UI'}`)
  process.exit(pass ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(2) })
