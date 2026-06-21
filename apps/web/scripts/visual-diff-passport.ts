/**
 * visual-diff-passport — Migration Plan step D harness (ARTIFACT ONLY, no deploy).
 *
 * Renders BOTH PDFs (legacy generic table vs staged passport mirror schema) from
 * the SAME synthetic input for each of the 3 staged passport docTypes, then
 * writes an HTML report with the two PDFs embedded side-by-side plus byte/hash
 * stats (normalized hashes strip /CreationDate, /ModDate, /ID — see
 * dualRenderCompare.ts). The owner opens the report and judges visually;
 * NOTE the two paths differ STRUCTURALLY by design (mirror layout vs generic
 * table), so there is deliberately NO pass/fail threshold here — the report is
 * a human-review artifact, exactly per the migration plan.
 *
 * Run (from repo root):
 *   PASSPORT_SCHEMA_RENDERER_ENABLED=1 pnpm --filter web exec tsx scripts/visual-diff-passport.ts
 * Output: /tmp/visual-diff-report.html (+ the PDFs next to it)
 *
 * PII: synthetic Ivanenko values only — never run this with real client data.
 * Placement note: lives in apps/web/scripts (not tests/visual-diff) because the
 * PDF modules use `@/` path aliases resolvable only inside apps/web.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { renderMirrorTranslationPDF } from '../src/lib/translation/pdf/renderMirrorTranslationPDF'
import type { ExtractedFieldLite } from '../src/lib/translation/pdf/buildMirrorValues'
import { generateTranslationPDF } from '../src/lib/packet/pdf'
import { buildCertificationRecord } from '../src/lib/translation/certificationRecord'
import { buildDualRenderLog } from '../src/lib/translation/pdf/dualRenderCompare'
import type { ExtractedField } from '../src/lib/translation/types'

process.env.PASSPORT_SCHEMA_RENDERER_ENABLED = '1' // in-process only — NOT a prod change

const OUT_DIR = '/tmp/visual-diff-passport'
const REPORT = '/tmp/visual-diff-report.html'

const SYNTH: Record<string, ExtractedFieldLite[]> = {
  ua_internal_passport_booklet: [
    { field: 'family_name', value: 'Ivanenko', review_required: false },
    { field: 'given_name', value: 'Ivan', review_required: false },
    { field: 'patronymic', value: 'Petrovych', review_required: false },
    { field: 'dob', value: '1990-01-01', review_required: false },
    { field: 'city_of_birth', value: 'Vinnytsia', review_required: false },
    { field: 'province_of_birth', value: 'Vinnytsia Oblast', review_required: false },
  ],
  ua_international_passport: [
    { field: 'family_name', value: 'IVANENKO', review_required: false },
    { field: 'given_name', value: 'IVAN', review_required: false },
    { field: 'passport_number', value: 'FA000000', review_required: false },
    { field: 'dob', value: '1990-01-01', review_required: false },
    { field: 'passport_expiration_date', value: '2030-01-01', review_required: false },
  ],
  ua_id_card: [
    { field: 'family_name', value: 'Ivanenko', review_required: false },
    { field: 'given_name', value: 'Ivan', review_required: false },
    { field: 'patronymic', value: 'Petrovych', review_required: false },
    { field: 'dob', value: '1990-01-01', review_required: false },
    { field: 'doc_number', value: '000000001', review_required: false },
  ],
}

const certRecord = buildCertificationRecord({
  signerName: 'Taras Example',
  signerAddress: '1213 Gordon St, Los Angeles, CA 90038',
  signerPhone: '+1 (000) 000-0000',
  signerEmail: 'owner@example.com',
  sourceLanguage: 'Ukrainian',
  signatureTypedName: 'Taras Example',
})

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const sections: string[] = []

  for (const [docType, fields] of Object.entries(SYNTH)) {
    const mirror = await renderMirrorTranslationPDF(docType, fields)
    if (!mirror) throw new Error(`${docType}: schema did not resolve — is the flag set?`)
    const legacy = await generateTranslationPDF({
      scopeTitle: 'English Translation of Ukrainian Document',
      documentType: docType,
      fields: fields.map((f) => ({
        field: f.field, normalized_value: f.value, raw_value: f.value,
        review_required: f.review_required,
      })) as unknown as ExtractedField[],
      sourceTraces: [],
      certificationRecord: certRecord,
      sessionId: 'visual-diff-synthetic',
      signatureDataUrl: null,
    })

    const mirrorPath = path.join(OUT_DIR, `${docType}.mirror.pdf`)
    const legacyPath = path.join(OUT_DIR, `${docType}.legacy.pdf`)
    writeFileSync(mirrorPath, mirror.pdf)
    writeFileSync(legacyPath, legacy)
    const log = buildDualRenderLog(docType, mirror.pdf, legacy)

    sections.push(`
      <section>
        <h2>${docType}</h2>
        <table border="1" cellpadding="6" style="border-collapse:collapse;margin-bottom:10px">
          <tr><th></th><th>schema (mirror)</th><th>legacy (generic)</th></tr>
          <tr><td>bytes</td><td>${log.mirror_bytes}</td><td>${log.legacy_bytes}</td></tr>
          <tr><td>sha256/16</td><td>${log.mirror_sha256}</td><td>${log.legacy_sha256}</td></tr>
          <tr><td>normalized sha</td><td>${log.normalized_mirror_sha256}</td><td>${log.normalized_legacy_sha256}</td></tr>
          <tr><td>unresolved (mirror)</td><td colspan="2">${mirror.unresolved.join(', ') || '—'}</td></tr>
        </table>
        <div style="display:flex;gap:12px">
          <embed src="${mirrorPath}" type="application/pdf" width="49%" height="640"/>
          <embed src="${legacyPath}" type="application/pdf" width="49%" height="640"/>
        </div>
      </section><hr/>`)
    console.log(`[visual-diff] ${docType}: mirror ${log.mirror_bytes}B vs legacy ${log.legacy_bytes}B`)
  }

  writeFileSync(REPORT, `<!doctype html><meta charset="utf-8">
<title>Passport schema vs legacy — visual diff (synthetic)</title>
<h1>Passport schema vs legacy PDF — side by side</h1>
<p>Synthetic Ivanenko data. The layouts differ STRUCTURALLY by design (official mirror vs
generic table) — judge whether the mirror is acceptable for customers, field by field.
No auto pass/fail. Generated by apps/web/scripts/visual-diff-passport.ts.</p>
${sections.join('\n')}`)
  console.log(`[visual-diff] report: ${REPORT}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
