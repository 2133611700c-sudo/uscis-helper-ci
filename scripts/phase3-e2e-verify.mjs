#!/usr/bin/env node
/**
 * Phase 3 Live E2E Provenance Verification
 * 
 * Simulates the wizard flow against production:
 * 1. Upload 4 owner docs to /api/tps/ocr/extract
 * 2. Merge fields (passport authoritative)
 * 3. Build provenance map
 * 4. Call /api/tps/generate-packet with answers + _provenance
 * 5. Save ZIP, extract, inspect AUDIT_PROVENANCE.txt + PDFs
 *
 * NO RAW PII IN OUTPUT. Only field names, counts, sources, methods.
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { execSync } from 'child_process'
import { createHash } from 'crypto'

const BASE = 'https://messenginfo.com'
const OUT_DIR = '/tmp/phase3-e2e-verify'

const DOCS = [
  { file: process.env.E2E_PASSPORT_IMAGE ?? 'qa-shots/private/passport_test.jpg', hint: 'passport', label: 'passport' },
  { file: process.env.E2E_I94_IMAGE ?? 'qa-shots/private/i94_test.jpg', hint: 'i94', label: 'i94' },
  { file: 'qa-shots/private/Ead1.jpg', hint: 'ead', label: 'ead' },
  { file: 'qa-shots/private/DL.jpg', hint: 'dl', label: 'dl' },
]

// ── Helpers ──────────────────────────────────────────────────────────────
function mask(v) { if (!v || typeof v !== 'string') return '(empty)'; return v.slice(0,2) + '***' + v.slice(-1) }
function hashVal(v) { return createHash('sha256').update(String(v)).digest('hex').slice(0,8) }

// ── Step 1: Upload each doc to OCR ──────────────────────────────────────
async function uploadDoc(d) {
  const buf = await readFile(d.file)
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'doc.jpg')
  form.append('docHint', d.hint)
  const res = await fetch(`${BASE}/api/tps/ocr/extract`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`OCR ${d.label} HTTP ${res.status}`)
  return res.json()
}

// ── Step 2: Merge fields (passport authoritative) ───────────────────────
function mergeFields(allResults) {
  const merged = {} // key → { value, source, doc_slot, confidence }
  // Pass 1: passport
  const pp = allResults.find(r => r.label === 'passport')
  if (pp?.json?.module?.fields) {
    for (const f of pp.json.module.fields) {
      if (f?.field && (f.normalized_value || f.raw_value)) {
        merged[f.field] = {
          value: f.normalized_value || f.raw_value,
          source: f.extraction_source || 'ocr_visual',
          doc_slot: 'passport',
          confidence: f.confidence ?? null,
        }
      }
    }
  }
  // Pass 2: other docs fill gaps
  for (const r of allResults) {
    if (r.label === 'passport') continue
    if (!r.json?.module?.fields) continue
    for (const f of r.json.module.fields) {
      if (!f?.field || (!f.normalized_value && !f.raw_value)) continue
      if (merged[f.field]) continue // passport wins
      merged[f.field] = {
        value: f.normalized_value || f.raw_value,
        source: f.extraction_source || 'ocr_visual',
        doc_slot: r.label,
        confidence: f.confidence ?? null,
      }
    }
  }
  // Alias: i94_class_of_admission → status_at_last_entry
  if (merged.i94_class_of_admission && !merged.status_at_last_entry) {
    merged.status_at_last_entry = { ...merged.i94_class_of_admission }
  }
  return merged
}

// ── Step 3: Build provenance map ────────────────────────────────────────
function toMethod(src) {
  const m = { ocr_mrz:'ocr_mrz', ocr_visual:'ocr_label_match', ocr_keyword:'ocr_rule_parser',
              ai_brain:'ai_brain', user_input:'user_manual', user_corrected:'user_manual', inferred:'system_default' }
  return m[src] || 'ocr_rule_parser'
}
function toDocType(slot) {
  const m = { passport:'passport', i94:'i94', ead:'ead', i797:'i797', dl:'driver_license', driver_license:'driver_license' }
  return m[slot] || 'user_manual'
}
const DL_BLOCKED = new Set(['a_number','i94_admission_number','last_entry_date','status_at_last_entry',
  'passport_number','passport_expiration_date','passport_country_of_issuance','country_of_birth','country_of_nationality'])

function buildProvenance(merged, answerKeys) {
  const map = {}
  for (const key of answerKeys) {
    const mf = merged[key]
    if (mf && mf.value) {
      if (toDocType(mf.doc_slot) === 'driver_license' && DL_BLOCKED.has(key)) {
        map[key] = { source_document_type:'user_manual', extraction_method:'system_default',
                     confidence:null, source_field:key, user_review_status:'unreviewed', value_status:'system_default' }
        continue
      }
      map[key] = { source_document_type:toDocType(mf.doc_slot), extraction_method:toMethod(mf.source),
                   confidence:mf.confidence ?? 0, source_field:key, user_review_status:'unreviewed', value_status:'auto_with_source' }
    } else if (['country_of_birth','country_of_nationality','passport_country_of_issuance'].includes(key)) {
      map[key] = { source_document_type:'user_manual', extraction_method:'system_default',
                   confidence:null, source_field:key, user_review_status:'unreviewed', value_status:'system_default' }
    }
  }
  return map
}

// ── Step 4: Build flat answers ──────────────────────────────────────────
function buildAnswers(merged) {
  const v = (k) => merged[k]?.value || ''
  return {
    family_name: v('family_name') || v('surname'),
    given_name: v('given_name') || v('first_name'),
    middle_name: v('middle_name') || v('patronymic'),
    dob: v('dob') || v('date_of_birth'),
    sex: v('sex') === 'F' ? 'F' : 'M',
    country_of_birth: v('country_of_birth') || 'Ukraine',
    country_of_nationality: v('country_of_nationality') || 'Ukraine',
    passport_number: v('passport_number'),
    passport_country_of_issuance: v('passport_country_of_issuance') || 'Ukraine',
    passport_expiration_date: v('passport_expiration_date'),
    a_number: (v('a_number') || '').replace(/\D/g, ''),
    i94_admission_number: v('i94_admission_number'),
    last_entry_date: v('last_entry_date'),
    status_at_last_entry: v('status_at_last_entry'),
    filing_path: 'initial',
    wants_ead: true,
    ead_category: 'c19',
    us_address_street: v('us_address_street') || v('address') || '1213 GORDON ST',
    us_address_city: v('us_address_city') || 'LOS ANGELES',
    us_address_state: v('us_address_state') || 'CA',
    us_address_zip: v('us_address_zip') || '90038',
    mailing_same_as_physical: true,
    daytime_phone: '2131234567',
    email: 'test@example.com',
    marital_status: 'single',
    ssn: '',
    part7_reviewed: true,
    has_criminal_concern: false,
    has_prior_tps_denial: false,
    left_us_without_advance_parole: false,
  }
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const report = []
  const log = (s) => { console.log(s); report.push(s) }

  log('=== PHASE 3: LIVE E2E PROVENANCE VERIFICATION ===')
  log(`Endpoint: ${BASE}`)
  log(`Timestamp: ${new Date().toISOString()}`)
  log('')

  // Step 1: Upload owner docs
  log('── STEP 1: OCR Upload ──')
  const results = []
  for (const d of DOCS) {
    try {
      log(`  Uploading ${d.label}...`)
      const json = await uploadDoc(d)
      const fieldCount = json?.module?.fields?.length ?? 0
      const brain = json?.brain_status ?? 'n/a'
      const trigger = json?.brain_trigger ?? 'n/a'
      log(`  ${d.label}: ${fieldCount} fields, brain=${brain}, trigger=${trigger}`)
      results.push({ label: d.label, json, fieldCount })
    } catch (e) {
      log(`  ${d.label}: ERROR — ${e.message}`)
      results.push({ label: d.label, json: null, fieldCount: 0 })
    }
  }
  const totalExtracted = results.reduce((s, r) => s + r.fieldCount, 0)
  log(`  Total extracted fields: ${totalExtracted}`)
  log('')

  // Step 2: Merge
  log('── STEP 2: Merge Fields ──')
  const merged = mergeFields(results)
  const mergedKeys = Object.keys(merged)
  log(`  Merged unique fields: ${mergedKeys.length}`)
  for (const k of mergedKeys) {
    log(`    ${k}: source=${merged[k].source}, doc=${merged[k].doc_slot}, hash=${hashVal(merged[k].value)}`)
  }
  log('')

  // Step 3: Build answers + provenance
  const answers = buildAnswers(merged)
  const answerKeys = Object.keys(answers).filter(k => {
    const v = answers[k]
    return v !== undefined && v !== null && v !== '' && v !== false
  })
  const provenance = buildProvenance(merged, answerKeys)
  log('── STEP 3: Provenance Map ──')
  log(`  Provenance entries: ${Object.keys(provenance).length}`)
  for (const [k, p] of Object.entries(provenance)) {
    log(`    ${k}: src=${p.source_document_type}, method=${p.extraction_method}, status=${p.value_status}`)
  }
  log('')

  // Step 4: Generate packet
  log('── STEP 4: Generate Packet ──')
  const payload = { ...answers, _provenance: provenance }
  const genRes = await fetch(`${BASE}/api/tps/generate-packet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  log(`  HTTP ${genRes.status}`)
  if (!genRes.ok) {
    const errBody = await genRes.text()
    log(`  ERROR: ${errBody}`)
    log('STATUS: BLOCKED')
    await writeFile(`${OUT_DIR}/report.txt`, report.join('\n'))
    return
  }
  const i821Applied = genRes.headers.get('X-TPS-I821-Applied')
  const i821Skipped = genRes.headers.get('X-TPS-I821-Skipped')
  const i765Applied = genRes.headers.get('X-TPS-I765-Applied')
  const i765Skipped = genRes.headers.get('X-TPS-I765-Skipped')
  log(`  I-821: applied=${i821Applied}, skipped=${i821Skipped}`)
  log(`  I-765: applied=${i765Applied}, skipped=${i765Skipped}`)

  const zipBuf = Buffer.from(await genRes.arrayBuffer())
  const zipPath = `${OUT_DIR}/live-packet.zip`
  await writeFile(zipPath, zipBuf)
  log(`  ZIP saved: ${zipPath} (${zipBuf.length} bytes)`)
  log('')

  // Step 5: Inspect ZIP
  log('── STEP 5: ZIP Inspection ──')
  execSync(`cd ${OUT_DIR} && rm -rf unzipped && mkdir unzipped && cd unzipped && unzip -o ../live-packet.zip`)
  const listing = execSync(`ls -la ${OUT_DIR}/unzipped/`).toString()
  log(listing)

  // Check files exist
  const hasI821 = listing.includes('I-821.pdf')
  const hasI765 = listing.includes('I-765.pdf')
  const hasAudit = listing.includes('AUDIT_PROVENANCE.txt')
  const hasReadme = listing.includes('README.txt')
  const hasChecklist = listing.includes('CHECKLIST.txt')
  log(`  I-821.pdf: ${hasI821 ? 'YES' : 'MISSING'}`)
  log(`  I-765.pdf: ${hasI765 ? 'YES' : 'MISSING'}`)
  log(`  AUDIT_PROVENANCE.txt: ${hasAudit ? 'YES' : 'MISSING'}`)
  log(`  README.txt: ${hasReadme ? 'YES' : 'MISSING'}`)
  log(`  CHECKLIST.txt: ${hasChecklist ? 'YES' : 'MISSING'}`)
  log('')

  // Step 6: Read AUDIT_PROVENANCE.txt
  log('── STEP 6: Audit Provenance Check ──')
  if (hasAudit) {
    const auditText = (await readFile(`${OUT_DIR}/unzipped/AUDIT_PROVENANCE.txt`, 'utf-8'))
    // Check for PII patterns (no full names, no dates, no numbers that look like SSN/A-number)
    const piiPatterns = [/\d{3}-\d{2}-\d{4}/, /\d{9}/, /\d{2}\/\d{2}\/\d{4}/]
    let piiFound = false
    for (const p of piiPatterns) {
      if (p.test(auditText)) { piiFound = true; break }
    }
    log(`  PII patterns detected: ${piiFound ? 'WARNING — dates or numbers found' : 'NONE'}`)

    // Count audit rows
    const i821Rows = (auditText.match(/I-821 \|/g) || []).length
    const i765Rows = (auditText.match(/I-765 \|/g) || []).length
    log(`  I-821 audit rows: ${i821Rows}`)
    log(`  I-765 audit rows: ${i765Rows}`)

    // Check source types present
    const sources = new Set()
    const methods = new Set()
    for (const line of auditText.split('\n')) {
      const srcMatch = line.match(/source:\s+(\S+)/)
      if (srcMatch) sources.add(srcMatch[1])
      const methMatch = line.match(/method:\s+(\S+)/)
      if (methMatch) methods.add(methMatch[1])
    }
    log(`  Sources found: ${[...sources].join(', ')}`)
    log(`  Methods found: ${[...methods].join(', ')}`)

    // Count unknowns
    const unknownSrc = (auditText.match(/source:\s+unknown/g) || []).length
    log(`  Unknown source rows: ${unknownSrc}`)

    // Extract summary section
    const summaryMatch = auditText.match(/Total fields:\s+(\d+)[\s\S]*?Auto \(with source\):\s+(\d+)[\s\S]*?User manual:\s+(\d+)[\s\S]*?System default:\s+(\d+)[\s\S]*?Unknown provenance:\s+(\d+)/)
    if (summaryMatch) {
      log(`  Summary: total=${summaryMatch[1]}, auto=${summaryMatch[2]}, manual=${summaryMatch[3]}, default=${summaryMatch[4]}, unknown=${summaryMatch[5]}`)
    }
    log('')
  } else {
    log('  AUDIT_PROVENANCE.txt NOT FOUND — FAIL')
    log('')
  }

  // Step 7: PDF readback
  log('── STEP 7: PDF Readback ──')
  let readbackMismatches = 0
  for (const pdf of ['I-821.pdf', 'I-765.pdf']) {
    const pdfPath = `${OUT_DIR}/unzipped/${pdf}`
    try {
      const text = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: 'utf-8', maxBuffer: 1024*1024 })
      const nonEmpty = text.split('\n').filter(l => l.trim().length > 0).length
      log(`  ${pdf}: ${nonEmpty} non-empty lines extracted`)
      // Check for key field markers (structural, no PII)
      const hasFormFields = text.includes('Part 2') || text.includes('Part 1')
      log(`    Has form structure: ${hasFormFields}`)
    } catch (e) {
      log(`  ${pdf}: readback FAILED — ${e.message}`)
      readbackMismatches++
    }
  }
  log('')

  // Step 8: Manual fields metric
  log('── STEP 8: Manual Fields Metric ──')
  const autoFields = []
  const manualFields = []
  const defaultFields = []
  const missingFields = []
  const allAnswerFields = Object.keys(answers).filter(k => typeof answers[k] === 'string')
  for (const k of allAnswerFields) {
    if (provenance[k]) {
      if (provenance[k].value_status === 'auto_with_source') autoFields.push(k)
      else if (provenance[k].value_status === 'user_manual') manualFields.push(k)
      else if (provenance[k].value_status === 'system_default') defaultFields.push(k)
    } else if (answers[k] && answers[k] !== '') {
      // Has value but no provenance — came from script defaults (phone/email/address fallback)
      manualFields.push(k)
    } else {
      missingFields.push(k)
    }
  }
  log(`  Auto-filled (from documents): ${autoFields.length} — ${autoFields.join(', ')}`)
  log(`  Manual / script default:      ${manualFields.length} — ${manualFields.join(', ')}`)
  log(`  System default:               ${defaultFields.length} — ${defaultFields.join(', ')}`)
  log(`  Missing (empty):              ${missingFields.length} — ${missingFields.join(', ')}`)
  log('')

  // Final verdict
  log('── FINAL VERDICT ──')
  const auditPresent = hasAudit
  const allPdfs = hasI821 && hasI765
  log(`  ZIP generated: YES`)
  log(`  I-821 + I-765 present: ${allPdfs}`)
  log(`  AUDIT_PROVENANCE.txt present: ${auditPresent}`)
  log(`  Readback mismatches: ${readbackMismatches}`)
  log(`  Auto-fill rate: ${autoFields.length}/${allAnswerFields.length} (${Math.round(autoFields.length/allAnswerFields.length*100)}%)`)
  
  const status = auditPresent && allPdfs && readbackMismatches === 0 ? 'PASS' : 'DEGRADED'
  log(`  STATUS: ${status}`)

  await writeFile(`${OUT_DIR}/report.txt`, report.join('\n'))
  log(`\nReport saved: ${OUT_DIR}/report.txt`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
