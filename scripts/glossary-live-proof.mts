/**
 * scripts/glossary-live-proof.mts
 *
 * Live proof: agency glossary resolves real OCR field values correctly.
 * Session 92567d4f — issued_by raw = "ДМС ЧЕРКАСЬКОЇ ОБЛ .", doc year 2010.
 *
 * Run: npx tsx scripts/glossary-live-proof.mts
 */
import { resolveIssuedBy, resolveAgencyAbbr, scanTextForAgencyAbbr } from '../apps/web/src/lib/translation/glossary/agencyGlossary'

console.log('=== GLOSSARY LIVE PROOF ===\n')

// ── Case 1: Real OCR value from session 92567d4f ────────────────────────────
// raw_value from DB: "ДМС ЧЕРКАСЬКОЇ ОБЛ .", date_of_issue normalized: "04/12/2010" → doc year 2010
console.log('CASE 1: Real OCR — session 92567d4f')
console.log('  raw_value   : "ДМС ЧЕРКАСЬКОЇ ОБЛ ."')
console.log('  doc year    : 2010')
const case1 = resolveIssuedBy('ДМС ЧЕРКАСЬКОЇ ОБЛ .', 2010)
console.log('  resolved    :', case1.resolved)
console.log('  confidence  :', case1.glossary_confidence)
console.log('  review_req  :', case1.review_required)
console.log('  reason      :', case1.reason ?? 'none')
const case1Pass = case1.resolved.includes('Migration') && !case1.review_required && case1.glossary_confidence === 'high'
console.log('  ✅ PASS' , case1Pass ? '' : '❌ FAIL')
console.log()

// ── Case 2: РВ УМВС — must NOT produce "Police" ────────────────────────────
console.log('CASE 2: РВ УМВС (pre-2015 militsiya) — must NOT say "Police"')
const case2 = resolveAgencyAbbr('РВ УМВС', 2008)
console.log('  resolved    :', case2.resolved_en)
console.log('  review_req  :', case2.review_required)
const case2Pass = !!(case2.resolved_en && !case2.resolved_en.match(/police/i) && !case2.review_required)
console.log('  ✅ PASS' , case2Pass ? '' : '❌ FAIL — "Police" appeared or review_required wrong')
console.log()

// ── Case 3: ВМ before 2015 → "Militia Department" ─────────────────────────
console.log('CASE 3: ВМ, doc year 2010 — must resolve to "Militia Department"')
const case3 = resolveAgencyAbbr('ВМ', 2010)
console.log('  resolved    :', case3.resolved_en)
console.log('  review_req  :', case3.review_required)
const case3Pass = case3.resolved_en === 'Militia Department' && !case3.review_required
console.log('  ✅ PASS' , case3Pass ? '' : '❌ FAIL')
console.log()

// ── Case 4: Unknown Cyrillic uppercase → review_required ──────────────────
console.log('CASE 4: "УМКН відділення" — unknown abbr → review_required')
const case4 = resolveIssuedBy('УМКН відділення', 2010)
console.log('  resolved    :', case4.resolved)
console.log('  review_req  :', case4.review_required)
console.log('  reason      :', case4.reason ?? 'none')
const case4Pass = case4.review_required === true
console.log('  ✅ PASS' , case4Pass ? '' : '❌ FAIL — should be review_required=true')
console.log()

// ── Case 5: НПУ on pre-2015 doc → anachronistic flag ──────────────────────
console.log('CASE 5: НПУ (National Police) on 2010 doc — anachronistic, review_required')
const case5 = resolveAgencyAbbr('НПУ', 2010)
console.log('  review_req  :', case5.review_required)
console.log('  reason      :', case5.reason)
const case5Pass = case5.review_required === true && case5.reason === 'police_abbr_on_pre2015_doc'
console.log('  ✅ PASS' , case5Pass ? '' : '❌ FAIL')
console.log()

// ── Case 6: Scan text — ДМС detected in full field string ─────────────────
console.log('CASE 6: scanTextForAgencyAbbr on real OCR text')
const case6 = scanTextForAgencyAbbr('ДМС ЧЕРКАСЬКОЇ ОБЛ .', 2010)
console.log('  matches     :', JSON.stringify(case6.map(r => ({ abbr: r.abbreviation, en: r.resolved_en }))))
const case6Pass = case6.some(r => r.abbreviation === 'ДМС')
console.log('  ✅ PASS' , case6Pass ? '' : '❌ FAIL — ДМС not detected in scan')
console.log()

// ── Summary ────────────────────────────────────────────────────────────────
const allPass = case1Pass && case2Pass && case3Pass && case4Pass && case5Pass && case6Pass
console.log('══════════════════════════════════')
console.log(allPass ? '✅ ALL 6 CASES PASS — glossary pilot-ready' : '❌ FAILURES PRESENT — see above')
console.log('══════════════════════════════════')
