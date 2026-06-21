/**
 * Translation document HTML generator.
 *
 * Exports:
 *  - generateTranslationDoc()  — primary: takes DocDef + FieldDef[] from docDefinitions.ts
 *  - generateTranslationHTML() — legacy helper (kept for compatibility)
 *  - hasCyrillic() / transliterateCyrillic() — transliteration utilities
 *  - downloadTranslationTemplate() — browser download helper
 *
 * IMPORTANT: This is a DRAFT TEMPLATE.
 * The user reviews, completes the certification section, and signs before submitting.
 * Messenginfo does not certify translations.
 */

import type { DocDef, FieldDef, SourceLang } from './docDefinitions'

// ---------------------------------------------------------------------------
// Language display names (used in output headers)
// ---------------------------------------------------------------------------

const LANG_NAMES: Record<string, string> = {
  uk: 'Ukrainian', ru: 'Russian', en: 'English', es: 'Spanish',
  pl: 'Polish',    de: 'German',  fr: 'French',  ar: 'Arabic',
  zh: 'Chinese',   ko: 'Korean',  pt: 'Portuguese',
}

function langName(code: string): string {
  return LANG_NAMES[code] ?? code.toUpperCase()
}

// ---------------------------------------------------------------------------
// Primary generator: takes DocDef + FieldDef[] + values → 4 HTML files
// Returns [translationDraft, certStatement, checklist, instructions]
// ---------------------------------------------------------------------------

export function generateTranslationDoc(
  doc: DocDef,
  allFields: FieldDef[],
  values: Record<string, string>,
  srcLang: SourceLang,
  targetLang: SourceLang = 'en',
  eraNote?: string,
): [string, string, string, string] {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const src  = langName(srcLang)
  const tgt  = langName(targetLang)
  const docTitleSrc = (doc.label as Record<string, string>)[srcLang]    ?? doc.label.en ?? doc.id
  const docTitleTgt = (doc.label as Record<string, string>)[targetLang] ?? doc.label.en ?? doc.id
  const applicantName = (values['full_name'] ?? values['child_name'] ?? '').trim()

  // ── Build field rows ──────────────────────────────────────────────────────
  const rows = allFields
    .filter(f => {
      const v = values[f.key]
      return v && v.trim().length > 0
    })
    .map(f => {
      const origVal = values[f.key] ?? ''
      // Field label on the original document (source language side)
      const srcLabel  = (f.orig as Record<string, string>)[srcLang]    ?? f.orig.en    ?? f.en
      // Field label in the translation output (target language side)
      const tgtLabel  = (f.orig as Record<string, string>)[targetLang] ?? f.orig.en    ?? f.en
      // Transliterate Cyrillic → Latin when target is English (pass srcLang for correct map)
      const tgtValue = (targetLang === 'en' && hasCyrillic(origVal))
        ? transliterateCyrillic(origVal, srcLang)
        : origVal
      const origHtml = hasCyrillic(origVal)
        ? `${escapeHtml(origVal)}`
        : escapeHtml(origVal)
      return `
        <tr>
          <td class="c1">${escapeHtml(srcLabel)}</td>
          <td class="c2">${origHtml}</td>
          <td class="c3">${escapeHtml(tgtLabel)}</td>
          <td class="c4">${escapeHtml(tgtValue) || '—'}</td>
        </tr>`
    })
    .join('')

  // ── Era note banner ───────────────────────────────────────────────────────
  const eraBanner = eraNote
    ? `<div class="era-note">📝 Translator note: ${escapeHtml(eraNote)}</div>`
    : ''

  // ─────────────────────────────────────────────────────────────────────────
  // FILE 1 — Translation Draft (professional layout)
  // ─────────────────────────────────────────────────────────────────────────
  const file1 = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Translation — ${escapeHtml(docTitleTgt)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;background:#fff;max-width:780px;margin:0 auto;padding:48px 40px 60px}
.doc-header{text-align:center;border-bottom:2.5px solid #000;padding-bottom:16px;margin-bottom:18px}
.doc-title{font-size:17pt;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.doc-meta{font-size:11pt;color:#333;display:flex;justify-content:center;gap:32px;flex-wrap:wrap}
.doc-meta span{white-space:nowrap}
.draft-banner{background:#fff8e1;border:1.5px solid #f59e0b;border-radius:3px;padding:8px 14px;font-size:10pt;color:#92400e;text-align:center;margin-bottom:16px}
.era-note{background:#eff6ff;border:1px solid #93c5fd;border-radius:3px;padding:8px 14px;font-size:10.5pt;color:#1e40af;margin-bottom:16px}
.sec-label{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;color:#666;border-bottom:1px solid #bbb;padding-bottom:4px;margin:18px 0 8px}
table{width:100%;border-collapse:collapse;margin-bottom:18px}
th{background:#f0f0f0;font-size:10pt;font-weight:bold;padding:7px 10px;text-align:left;border:1.5px solid #aaa}
td{padding:6px 10px;border:1px solid #ccc;font-size:11pt;vertical-align:top}
.c1{width:22%;color:#555;font-style:italic}
.c2{width:28%;color:#222;font-weight:600}
.c3{width:22%;color:#555;font-style:italic}
.c4{width:28%;color:#000;font-weight:700}
.cert{border:2px solid #000;padding:18px 20px;margin-top:28px;border-radius:2px}
.cert h2{font-size:13pt;font-weight:bold;text-transform:uppercase;text-align:center;letter-spacing:.05em;margin-bottom:12px}
.cert p{font-size:11pt;line-height:1.7;margin-bottom:12px}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;margin-top:16px}
.sig-line{border-bottom:1.5px solid #000;min-height:26px}
.sig-lbl{font-size:9.5pt;color:#555;margin-top:3px}
.footer{margin-top:30px;padding-top:10px;border-top:1px solid #ccc;font-size:9pt;color:#777;text-align:center;line-height:1.6}
@page{margin:1in}
@media print{body{margin:0;padding:0}table,tr,.cert,.sec-label{page-break-inside:avoid}.draft-banner{display:none}}
</style>
</head>
<body>

<div class="doc-header">
  <div class="doc-title">Translation of ${escapeHtml(docTitleTgt)}</div>
  <div class="doc-meta">
    <span>From: <strong>${escapeHtml(src)}</strong> (${escapeHtml(docTitleSrc)})</span>
    <span>Into: <strong>${escapeHtml(tgt)}</strong></span>
    <span>Date: <strong>${today}</strong></span>
  </div>
</div>

<div class="draft-banner">⚠ DRAFT TEMPLATE — Review all fields. Sign the certification section before submitting to any authority.</div>
${eraBanner}

<div class="sec-label">Document Fields</div>
<table>
<thead>
  <tr>
    <th>Field (${escapeHtml(src)})</th>
    <th>Original Value</th>
    <th>Field (${escapeHtml(tgt)})</th>
    <th>Translation / Value</th>
  </tr>
</thead>
<tbody>
${rows || '<tr><td colspan="4" style="text-align:center;color:#999;padding:14px">No fields entered.</td></tr>'}
</tbody>
</table>

<div class="cert">
  <h2>Translator's Certification</h2>
  <p>I, <span style="text-decoration:underline">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>, certify that I am fluent in English and <strong>${escapeHtml(src)}</strong>, and that the attached document is an accurate translation of the <strong>${escapeHtml(docTitleTgt)}</strong> attached hereto.</p>
  <p><strong>Document:</strong> ${escapeHtml(docTitleTgt)}&nbsp;&nbsp;&nbsp;<strong>Applicant:</strong> ${escapeHtml(applicantName) || '—'}&nbsp;&nbsp;&nbsp;<strong>Date:</strong> ${today}</p>
  <div class="sig-grid">
    <div><div class="sig-line">&nbsp;</div><div class="sig-lbl">Signature (handwritten)</div></div>
    <div><div class="sig-line">&nbsp;</div><div class="sig-lbl">Date signed</div></div>
    <div><div class="sig-line">&nbsp;</div><div class="sig-lbl">Printed full name</div></div>
    <div><div class="sig-line">&nbsp;</div><div class="sig-lbl">Phone or email (optional)</div></div>
    <div style="grid-column:1/-1"><div class="sig-line">&nbsp;</div><div class="sig-lbl">Mailing address — Street, City, State, ZIP</div></div>
  </div>
</div>

<div class="footer">
  Messenginfo.com · Translation preparation tool · Not a law firm · Does not provide legal advice<br>
  8 CFR 103.2(b)(3) · uscis.gov
</div>

</body></html>`

  // ─────────────────────────────────────────────────────────────────────────
  // FILE 2 — Standalone Certification Statement page
  // ─────────────────────────────────────────────────────────────────────────
  const file2 = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Certification Statement</title>
<style>
body{font-family:'Times New Roman',Times,serif;font-size:12pt;max-width:720px;margin:60px auto;padding:20px;color:#000;line-height:1.8}
h1{font-size:15pt;font-weight:bold;text-transform:uppercase;text-align:center;margin-bottom:28px;letter-spacing:.05em}
p{margin-bottom:16px}
.sig-line{border-top:1.5px solid #000;width:320px;margin-top:50px;padding-top:6px;font-size:11pt;color:#555}
.footer{font-size:10pt;color:#888;margin-top:40px;padding-top:10px;border-top:1px solid #ccc}
@page{margin:1in}
@media print{body{margin:0;padding:0}p,.sig-line{page-break-inside:avoid}}
</style>
</head>
<body>
<h1>Translator's Certification Statement</h1>
<p style="font-size:11pt;color:#555;margin-bottom:14px">Per <strong>8 CFR 103.2(b)(3)</strong> · UC Berkeley / USCIS suggested format</p>
<p>I, _________________________________________, certify that I am fluent in English and <strong>${escapeHtml(src)}</strong>, and that the attached document is an accurate translation of the <strong>${escapeHtml(docTitleTgt)}</strong> attached hereto.</p>
<p>I understand that any willfully false statement herein may result in penalties under applicable U.S. law.</p>
<p><strong>Applicant name:</strong> ${escapeHtml(applicantName) || '___________________________'}<br/>
<strong>Date of certification:</strong> ${today}</p>
<div class="sig-line">Signature of Translator (HANDWRITTEN — do not type)</div>
<p style="margin-top:18px">Printed name: ___________________________<br/>
Date: ___________________________<br/>
Title / Organization (if any): ___________________________<br/>
Phone or email: ___________________________<br/>
Mailing address: ___________________________</p>
<div class="footer">Per 8 CFR 103.2(b)(3) · Messenginfo.com · Not a law firm</div>
</body></html>`

  // ─────────────────────────────────────────────────────────────────────────
  // FILE 3 — Submission Checklist
  // ─────────────────────────────────────────────────────────────────────────
  const file3 = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Submission Checklist</title>
<style>
body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;padding:20px;color:#111}
h1{font-size:16pt;margin-bottom:6px}
.sub{font-size:11pt;color:#555;margin-bottom:18px}
.item{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #eee;align-items:flex-start}
.box{width:20px;height:20px;border:2px solid #333;flex-shrink:0;border-radius:3px;margin-top:1px}
strong{color:#000}
.footer{font-size:9.5pt;color:#888;margin-top:20px;padding-top:10px;border-top:1px solid #ddd}
@page{margin:1in}
@media print{body{margin:0;padding:0}.item{page-break-inside:avoid}}
</style>
</head>
<body>
<h1>Submission Checklist — ${escapeHtml(docTitleTgt)}</h1>
<div class="sub">Prepared ${today} · Applicant: ${escapeHtml(applicantName) || '—'}</div>
<div class="item"><div class="box"></div><div>Translation draft — all fields visible, printed legibly on white paper</div></div>
<div class="item"><div class="box"></div><div><strong>Certification statement — signed by hand</strong> (date + printed name required; no electronic signature)</div></div>
<div class="item"><div class="box"></div><div>Copy of the original document attached (front and back if applicable)</div></div>
<div class="item"><div class="box"></div><div>All text including stamps and seals is visible on the copy</div></div>
<div class="item"><div class="box"></div><div>Main USCIS form completed with matching names and dates</div></div>
<div class="item"><div class="box"></div><div>Correct USCIS filing fee included (verify at uscis.gov/feecalculator)</div></div>
<div class="item"><div class="box"></div><div>Correct USCIS mailing address verified at uscis.gov/forms before sending</div></div>
<div class="item"><div class="box"></div><div>Return envelope or postage included if required</div></div>
<div class="footer">Messenginfo.com · 8 CFR 103.2(b)(3)</div>
</body></html>`

  // ─────────────────────────────────────────────────────────────────────────
  // FILE 4 — Filing Instructions
  // ─────────────────────────────────────────────────────────────────────────
  const file4 = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Filing Instructions</title>
<style>
body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;padding:20px;line-height:1.8;color:#111}
h1{font-size:16pt;margin-bottom:6px}
.sub{font-size:11pt;color:#555;margin-bottom:20px}
h2{font-size:13pt;color:#1e40af;margin-top:22px;border-bottom:2px solid #e0e7ff;padding-bottom:4px}
p{margin-top:8px;font-size:11pt}
.footer{font-size:9.5pt;color:#888;margin-top:28px;padding-top:10px;border-top:1px solid #ddd}
@page{margin:1in}
@media print{body{margin:0;padding:0}h2,p{page-break-inside:avoid}}
</style>
</head>
<body>
<h1>Filing Instructions — ${escapeHtml(docTitleTgt)}</h1>
<div class="sub">Prepared ${today}</div>
<h2>Step 1 — Print all pages</h2>
<p>Print at 100% scale on white Letter/A4 paper. Do not scale to fit — USCIS may reject reduced-size documents.</p>
<h2>Step 2 — Sign the certification</h2>
<p><strong>Handwrite</strong> your signature on the certification page. Include printed name, date, and mailing address. Electronic signatures are not accepted for paper filings.</p>
<h2>Step 3 — Assemble the packet</h2>
<p>Recommended order: (1) Signed certification → (2) Translation draft → (3) Copy of the original ${escapeHtml(docTitleTgt)}. Do not staple to the main USCIS form — paperclip the supporting document group.</p>
<h2>Step 4 — Verify address and mail</h2>
<p>Check the current USCIS lockbox address at <strong>uscis.gov/forms</strong> before mailing — addresses vary by state and form type. Send via USPS Priority Mail or a trackable courier. Keep your receipt.</p>
<div class="footer">Messenginfo.com · Translation preparation tool · Not a law firm · 8 CFR 103.2(b)(3)</div>
</body></html>`

  return [file1, file2, file3, file4]
}

export type DocumentType =
  | 'passport'
  | 'birth-certificate'
  | 'marriage-certificate'
  | 'divorce-certificate'
  | 'diploma-transcript'
  | 'military-document'
  | 'driver-license'
  | 'other-document'

// ---------------------------------------------------------------------------
// Field definitions per document type
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, Record<string, string>> = {
  passport: {
    full_name: 'Full Legal Name (Last, First, Middle)',
    date_of_birth: 'Date of Birth',
    place_of_birth: 'Place of Birth (City, Country)',
    nationality: 'Nationality / Citizenship',
    gender: 'Gender',
    document_number: 'Passport / Document Number',
    issue_date: 'Date of Issue',
    expiry_date: 'Date of Expiry',
    issuing_authority: 'Issuing Authority',
  },
  'birth-certificate': {
    full_name: "Child's Full Legal Name",
    date_of_birth: 'Date of Birth',
    place_of_birth: 'Place of Birth (City, Region, Country)',
    father_name: "Father's Full Name",
    mother_name: "Mother's Full Name",
    document_number: 'Certificate / Registration Number',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority (Office / City)',
  },
  'marriage-certificate': {
    spouse1_name: 'Spouse 1 — Full Legal Name',
    spouse2_name: 'Spouse 2 — Full Legal Name',
    date_of_marriage: 'Date of Marriage',
    place_of_marriage: 'Place of Marriage (City, Country)',
    document_number: 'Certificate / Registration Number',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority',
  },
  'divorce-certificate': {
    spouse1_name: 'Former Spouse 1 — Full Legal Name',
    spouse2_name: 'Former Spouse 2 — Full Legal Name',
    date_of_divorce: 'Date of Divorce',
    place_of_divorce: 'Place of Divorce (City, Country)',
    document_number: 'Certificate / Registration Number',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority / Court',
  },
  'diploma-transcript': {
    full_name: "Graduate's Full Legal Name",
    degree_title: 'Degree / Qualification Title',
    institution: 'Name of Institution',
    graduation_date: 'Date of Graduation',
    document_number: 'Diploma / Certificate Number',
    issuing_authority: 'Issuing Authority',
  },
  'military-document': {
    full_name: "Service Member's Full Legal Name",
    date_of_birth: 'Date of Birth',
    document_number: 'Document Number / Military ID',
    service_branch: 'Branch of Service',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority',
  },
  'driver-license': {
    full_name: "Driver's Full Legal Name",
    date_of_birth: 'Date of Birth',
    address: 'Address on Document',
    document_number: 'License Number',
    issue_date: 'Date of Issue',
    expiry_date: 'Date of Expiry',
    issuing_authority: 'Issuing Authority (State / Country)',
  },
  'death-certificate': {
    full_name: "Deceased's Full Legal Name",
    date_of_birth: 'Date of Birth',
    date_of_death: 'Date of Death',
    place_of_death: 'Place of Death (City, Country)',
    cause_of_death: 'Cause of Death (if shown)',
    document_number: 'Certificate / Registration Number',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority (Registry Office)',
  },
  'adoption-certificate': {
    child_name: "Child's Full Legal Name (after adoption)",
    child_birth_name: "Child's Birth Name (before adoption)",
    date_of_birth: "Child's Date of Birth",
    place_of_birth: "Child's Place of Birth",
    adoptive_parent1: 'Adoptive Parent 1 — Full Legal Name',
    adoptive_parent2: 'Adoptive Parent 2 — Full Legal Name (if applicable)',
    date_of_adoption: 'Date of Adoption Decision',
    document_number: 'Certificate / Court Decision Number',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority / Court',
  },
  'name-change-certificate': {
    former_name: 'Former Full Legal Name',
    new_name: 'New Full Legal Name',
    date_of_birth: 'Date of Birth',
    reason_for_change: 'Reason for Name Change (if shown)',
    document_number: 'Certificate / Decision Number',
    decision_date: 'Date of Decision / Registration',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority',
  },
  'police-record': {
    full_name: 'Full Legal Name',
    date_of_birth: 'Date of Birth',
    place_of_birth: 'Place of Birth',
    record_type: 'Record Type (e.g., No Criminal Record)',
    document_number: 'Reference / Document Number',
    issue_date: 'Date of Issue',
    valid_until: 'Valid Until (if shown)',
    issuing_authority: 'Issuing Authority (Police Department / Ministry)',
  },
  'medical-record': {
    full_name: "Patient's Full Legal Name",
    date_of_birth: 'Date of Birth',
    diagnosis: 'Diagnosis or Medical Condition (if shown)',
    treatment_dates: 'Treatment Dates or Period',
    attending_physician: 'Attending Physician / Issuing Doctor',
    document_number: 'Record / Reference Number',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Medical Institution',
  },
  'property-document': {
    owner_name: 'Property Owner — Full Legal Name',
    property_address: 'Property Address',
    property_description: 'Property Description (Type, Area, etc.)',
    document_type_label: 'Document Type (Title / Deed / Certificate)',
    document_number: 'Document / Registration Number',
    registration_date: 'Date of Registration',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority (Registry / Notary)',
  },
  'employment-record': {
    full_name: "Employee's Full Legal Name",
    date_of_birth: 'Date of Birth',
    employer_name: 'Employer / Organization Name',
    position: 'Position / Job Title',
    employment_start: 'Employment Start Date',
    employment_end: 'Employment End Date (or "present")',
    document_number: 'Record / Reference Number',
    issue_date: 'Date of Issue',
    issuing_authority: 'Issuing Authority (HR Department / Employer)',
  },
}

const DEFAULT_FIELD_LABELS: Record<string, string> = {
  full_name: 'Full Legal Name',
  date_of_birth: 'Date of Birth',
  document_number: 'Document Number',
  issuing_authority: 'Issuing Authority',
  issue_date: 'Date of Issue',
  expiry_date: 'Date of Expiry',
}

const DOC_TYPE_TITLES: Record<string, string> = {
  passport: 'Passport',
  'birth-certificate': 'Birth Certificate',
  'marriage-certificate': 'Marriage Certificate',
  'divorce-certificate': 'Divorce Certificate',
  'diploma-transcript': 'Diploma / Academic Transcript',
  'military-document': 'Military Document',
  'driver-license': "Driver's License",
  'death-certificate': 'Death Certificate',
  'adoption-certificate': 'Adoption Certificate',
  'name-change-certificate': 'Name Change Certificate',
  'police-record': 'Police / Criminal Record',
  'medical-record': 'Medical Record / Certificate',
  'property-document': 'Property Document',
  'employment-record': 'Employment Record',
  'other-document': 'Official Document',
}

// ---------------------------------------------------------------------------
// Cyrillic → Latin transliteration (KMU 2010 for Ukrainian; GOST-based for Russian)
// Used to auto-convert user-entered Cyrillic field values into English for the output.
// ---------------------------------------------------------------------------

/** Maps uppercase Ukrainian Cyrillic → Latin (KMU 2010, Cabinet of Ministers Resolution #55, 2010). */
const UK_MAP: Record<string, string> = {
  А:'A',  Б:'B',  В:'V',  Г:'H',  Ґ:'G',  Д:'D',  Е:'E',  Є:'Ye',
  Ж:'Zh', З:'Z',  И:'Y',  І:'I',  Ї:'Yi', Й:'Y',  К:'K',  Л:'L',
  М:'M',  Н:'N',  О:'O',  П:'P',  Р:'R',  С:'S',  Т:'T',  У:'U',
  Ф:'F',  Х:'Kh', Ц:'Ts', Ч:'Ch', Ш:'Sh', Щ:'Shch', Ь:'', Ю:'Yu', Я:'Ya',
}

/** Maps uppercase Russian Cyrillic → Latin (simplified GOST 7.79-2000 System B). */
const RU_MAP: Record<string, string> = {
  А:'A',  Б:'B',  В:'V',  Г:'G',  Д:'D',  Е:'Ye', Ё:'Yo', Ж:'Zh',
  З:'Z',  И:'I',  Й:'Y',  К:'K',  Л:'L',  М:'M',  Н:'N',  О:'O',
  П:'P',  Р:'R',  С:'S',  Т:'T',  У:'U',  Ф:'F',  Х:'Kh', Ц:'Ts',
  Ч:'Ch', Ш:'Sh', Щ:'Shch', Ъ:'', Ы:'Y',  Ь:'',  Э:'E',  Ю:'Yu', Я:'Ya',
}

const CYRILLIC_RE = /[Ѐ-ӿ]/

export function hasCyrillic(str: string): boolean {
  return CYRILLIC_RE.test(str)
}

/**
 * Transliterate a string containing Cyrillic characters to Latin.
 * - Detects Ukrainian vs Russian by presence of Ukrainian-only letters (Є І Ї Ґ).
 * - Preserves ALL-CAPS formatting: ЮРЧЕНКО → YURCHENKO.
 * - Applies KMU 2010 rule: Й after a vowel → "I" (ЮРІЙ → YURII, not YURIY).
 * - Non-Cyrillic characters (digits, hyphens, spaces, apostrophes) are kept as-is
 *   except for Ukrainian apostrophe (' ʼ ') which is dropped per KMU 2010.
 */
/**
 * Optional srcLang parameter ('uk' | 'ru') overrides auto-detection.
 * Without it: Russian-only letters (Ё Ъ Ы Э) → RU_MAP; everything else → UK_MAP.
 * This ensures ЮРЧЕНКО (no unique Ukrainian letters) still uses KMU 2010 (UK).
 */
export function transliterateCyrillic(str: string, srcLang?: string): string {
  let MAP: Record<string, string>
  if (srcLang === 'ru') {
    MAP = RU_MAP
  } else if (srcLang === 'uk') {
    MAP = UK_MAP
  } else {
    // Default to UK_MAP unless string contains Russian-only letters (Ё Ъ Ы Э)
    const hasRussianOnly = /[ЁЪЫЭёъыэ]/.test(str)
    MAP = hasRussianOnly ? RU_MAP : UK_MAP
  }
  const UA_VOWELS = new Set(['А','Е','Є','И','І','Ї','О','У','Ю','Я'])
  const RU_VOWELS = new Set(['А','Е','Ё','И','О','У','Ы','Э','Ю','Я'])
  const isUkMap = MAP === UK_MAP

  // Returns the nearest preceding Cyrillic letter (uppercase), or null at word boundary.
  // Word boundary = start of string, space, hyphen, or any non-Cyrillic char.
  function prevCyrUpper(s: string, idx: number): string | null {
    for (let j = idx - 1; j >= 0; j--) {
      const c = s[j]
      if (CYRILLIC_RE.test(c)) return c.toUpperCase()
      // Non-Cyrillic (space, hyphen, digit, Latin) = word boundary
      return null
    }
    return null
  }

  let result = ''
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    // Drop Ukrainian apostrophes (word-internal softener before Є Ю Я Ї).
    // Covers: ASCII apostrophe (U+0027), left/right curly quotes (U+2018/U+2019),
    // Ukrainian modifier letter apostrophe (U+02BC), and prime (U+2032).
    // Using charCode checks to avoid any source-encoding ambiguity.
    const cc = ch.charCodeAt(0)
    if (cc === 0x27 || cc === 0x2018 || cc === 0x2019 || cc === 0x02BC || cc === 0x2032) continue

    const upper = ch.toUpperCase()
    if (!(upper in MAP)) { result += ch; continue }

    const isCyrUpper = ch === upper && /\p{Lu}/u.test(ch)

    // ── Position-dependent transliteration rules ───────────────────────────
    let latin: string

    if ((upper === 'Й' || upper === 'Ї') && i > 0) {
      // KMU 2010: Й/Ї after vowel → 'I'  (ЮРІЙ→YURII, Київ→Kyiv)
      const prev = str[i - 1].toUpperCase()
      latin = UA_VOWELS.has(prev) ? 'I' : (MAP[upper] ?? (upper === 'Й' ? 'Y' : 'Yi'))

    } else if (upper === 'Я' && isUkMap) {
      // KMU 2010: Я at word start → Ya; everywhere else → Ia
      // (ЯРОСЛАВ→YAROSLAV, ТЕТЯНА→TETIANA, ЗАПОРІЖЖЯ→ZAPORIZHZHIA)
      const prev = prevCyrUpper(str, i)
      latin = (prev === null) ? 'Ya' : 'Ia'

    } else if (upper === 'Е' && !isUkMap) {
      // GOST 7.79-2000: Е after consonant → E; start/vowel/ь/ъ → Ye
      // (ПЕТРОВ→PETROV, СЕРГЕЙ→SERGEI, ЕЛЕНА→YELENA)
      const prev = prevCyrUpper(str, i)
      const afterSoftHard = prev === 'Ь' || prev === 'Ъ'
      const afterVowel = prev !== null && RU_VOWELS.has(prev)
      latin = (prev === null || afterSoftHard || afterVowel) ? 'Ye' : 'E'

    } else {
      latin = MAP[upper] ?? ''
    }
    if (!latin) continue // soft sign, hard sign → drop

    // Preserve casing:
    // - Lowercase Cyrillic → all-lowercase Latin (е → e, ш → sh)
    // - Uppercase Cyrillic followed by lowercase Cyrillic = title case →
    //     capitalize only the first Latin char (Ш+е = Sh, Х+а = Kh)
    // - Uppercase Cyrillic followed by uppercase or end-of-string = all-caps →
    //     uppercase entire Latin sequence (ШЕ = SHE, ХА = KHA)
    if (!isCyrUpper) {
      result += latin.toLowerCase()
    } else {
      // Peek at the next Cyrillic character to decide title vs all-caps
      const nextIsCyrLower = (i + 1 < str.length) && /\p{Ll}/u.test(str[i + 1]) && CYRILLIC_RE.test(str[i + 1])
      if (nextIsCyrLower) {
        // Title case: e.g. Ш + е → Sh (not SH)
        result += latin.charAt(0).toUpperCase() + latin.slice(1).toLowerCase()
      } else {
        // All caps: e.g. Ш in ШЕВЧЕНКО → SH
        result += latin.toUpperCase()
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// HTML generator
// ---------------------------------------------------------------------------

export function generateTranslationHTML(
  docType: string,
  fields: Record<string, string>,
  originalLanguage = 'Ukrainian',
): string {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const docTitle = DOC_TYPE_TITLES[docType] ?? 'Official Document'
  const fieldLabels = FIELD_LABELS[docType] ?? DEFAULT_FIELD_LABELS

  // Build translation rows — only include fields with values
  const filledFields = Object.entries(fields).filter(([_, v]) => v && v.trim().length > 0)

  const rows = filledFields
    .map(([key, value]) => {
      const label = fieldLabels[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

      // Auto-transliterate Cyrillic values to Latin for USCIS compliance.
      // If the user entered Cyrillic, show the transliterated English value prominently
      // and the original text in small italic below it for reference.
      let displayValue: string
      if (hasCyrillic(value)) {
        // Infer srcLang from originalLanguage string for correct transliteration map
        const inferredSrcLang = originalLanguage.toLowerCase().startsWith('russian') ? 'ru' : 'uk'
        const transliterated = transliterateCyrillic(value, inferredSrcLang)
        displayValue =
          `${escapeHtml(transliterated)}<div class="orig-value">Original: ${escapeHtml(value)}</div>`
      } else {
        displayValue = escapeHtml(value)
      }

      return `
        <tr>
          <td class="field-label">${escapeHtml(label)}</td>
          <td class="field-value">${displayValue}</td>
        </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Translation of ${escapeHtml(docTitle)} — Messenginfo Draft</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      background: #fff;
      max-width: 740px;
      margin: 0 auto;
      padding: 40px 30px 60px;
    }
    .header {
      border-bottom: 2px solid #000;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .header h1 {
      font-size: 16pt;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
    }
    .header-meta {
      font-size: 11pt;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 20px;
    }
    .header-meta span { color: #333; }
    .header-meta strong { color: #000; }
    .draft-banner {
      background: #fff8e1;
      border: 1.5px solid #f59e0b;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 18px;
      font-size: 10pt;
      color: #92400e;
      text-align: center;
    }
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #555;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
      margin: 18px 0 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
    }
    th {
      background: #f5f5f5;
      font-size: 10pt;
      font-weight: bold;
      padding: 6px 10px;
      text-align: left;
      border: 1px solid #ccc;
    }
    td {
      padding: 7px 10px;
      border: 1px solid #ddd;
      font-size: 11pt;
      vertical-align: top;
    }
    .field-label { width: 45%; color: #333; font-style: italic; }
    .field-value { width: 55%; color: #000; font-weight: 500; }
    .orig-value { font-size: 9.5pt; color: #666; font-weight: 400; font-style: italic; margin-top: 2px; }
    .certification-block {
      border: 1.5px solid #000;
      padding: 16px 18px;
      margin-top: 24px;
      border-radius: 2px;
    }
    .certification-block h2 {
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 10px;
      text-align: center;
      letter-spacing: 0.04em;
    }
    .certification-block p {
      font-size: 11pt;
      margin-bottom: 12px;
      line-height: 1.6;
    }
    .sign-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 24px;
      margin-top: 14px;
    }
    .sign-line {
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      min-height: 28px;
    }
    .sign-label {
      font-size: 9.5pt;
      color: #444;
      margin-top: 3px;
    }
    .footer {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 9pt;
      color: #666;
      text-align: center;
      line-height: 1.5;
    }
    @page { margin: 1in; }
    @media print {
      body { margin: 0; padding: 0; }
      table, tr, .cert, .section { page-break-inside: avoid; }
      .draft-banner { display: none; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <h1>Translation of ${escapeHtml(docTitle)}</h1>
    <div class="header-meta">
      <div><span>Document Type: </span><strong>${escapeHtml(docTitle)}</strong></div>
      <div><span>Original Language: </span><strong>${escapeHtml(originalLanguage)}</strong></div>
      <div><span>Target Language: </span><strong>English</strong></div>
      <div><span>Date of Translation: </span><strong>${today}</strong></div>
    </div>
  </div>

  <!-- Draft Warning -->
  <div class="draft-banner">
    ⚠ DRAFT TEMPLATE — Prepared by Messenginfo as a reference.
    Messenginfo does not certify translations.
    You must review, complete the certification section below, and sign before submitting to USCIS.
  </div>

  <!-- Fields Table -->
  <div class="section-title">Document Fields — English Translation</div>
  <table>
    <thead>
      <tr>
        <th>Field (English)</th>
        <th>Translation / Value</th>
      </tr>
    </thead>
    <tbody>
      ${rows.length > 0 ? rows : '<tr><td colspan="2" style="color:#999;text-align:center;padding:12px;">No fields entered.</td></tr>'}
    </tbody>
  </table>

  <!-- Certification Block -->
  <div class="certification-block">
    <h2>Translator Certification</h2>
    <p>
      Pursuant to <strong>8 CFR 103.2(b)(3)</strong>, I certify that I am fluent in English and
      <strong>${escapeHtml(originalLanguage)}</strong>, and that the attached document is an accurate
      translation of the ${escapeHtml(docTitle)} attached hereto.
    </p>

    <div class="sign-grid">
      <div>
        <div class="sign-line">&nbsp;</div>
        <div class="sign-label">Signature of Translator</div>
      </div>
      <div>
        <div class="sign-line">&nbsp;</div>
        <div class="sign-label">Date</div>
      </div>
      <div>
        <div class="sign-line">&nbsp;</div>
        <div class="sign-label">Printed Full Name</div>
      </div>
      <div>
        <div class="sign-line">&nbsp;</div>
        <div class="sign-label">Phone / Email (optional)</div>
      </div>
      <div style="grid-column: 1 / -1;">
        <div class="sign-line">&nbsp;</div>
        <div class="sign-label">Mailing Address</div>
      </div>
      <div style="grid-column: 1 / -1;">
        <div class="sign-line">&nbsp;</div>
        <div class="sign-label">City, State, ZIP Code</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>
      Prepared with Messenginfo · messenginfo.com · For informational use only.<br>
      Messenginfo is not a law firm and does not provide legal advice or translation certification services.<br>
      Translation requirements: 8 CFR 103.2(b)(3) · Last verified: 2026-05-04 · uscis.gov
    </p>
  </div>

</body>
</html>`
}

// ---------------------------------------------------------------------------
// Trigger browser download of the generated HTML
// ---------------------------------------------------------------------------

export function downloadTranslationTemplate(
  docType: string,
  fields: Record<string, string>,
  originalLanguage = 'Ukrainian',
): void {
  const html = generateTranslationHTML(docType, fields, originalLanguage)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const docLabel = DOC_TYPE_TITLES[docType] ?? 'document'
  a.download = `translation-draft-${docLabel.toLowerCase().replace(/\s+/g, '-')}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
