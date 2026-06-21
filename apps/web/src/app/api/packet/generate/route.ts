/**
 * POST /api/packet/generate
 *
 * Generate a structured preparation packet for a wizard session.
 *
 * ZIP structure (9 files):
 *   01-overview.txt            — what this package is, disclaimer, how to use
 *   02-applicant-summary.txt   — applicant's manual data (name/address/phone/email)
 *   03-personal-explanation.txt — applicant's explanation text
 *   04-evidence-index.txt       — list of evidence applicant has
 *   05-form-i131-guide.txt      — step-by-step: Item 1.e, Ukraine RE-PAROLE, edition
 *   06-filing-instructions.txt  — mail OR online instructions based on filingMethod
 *   07-document-checklist.txt   — complete checklist incl. vaccines, TB test, I-94
 *   08-fees-and-links.txt       — fee calculator, G-1055, I-912, processing times
 *   09-disclaimer.txt           — not legal advice, verify with USCIS, consult attorney
 *
 * Body: { session_id: string }
 * Response: { ok: true, signed_url: string } | { ok: false, error: string }
 *
 * Logs to audit_log: event_type='packet_generated'
 * Logs to generated_packets if table exists.
 *
 * USCIS FACTS (verified 2026-05-04):
 *   - Paper (mail): Part 2, Item 1.e + handwrite "Ukraine RE-PAROLE" at top of first page
 *   - Online (my.uscis.gov): Box 10.C — "Certain Ukrainians paroled on/after Feb 11, 2022"
 *   - Top of PAPER form only: handwrite "Ukraine RE-PAROLE"
 *   - Medical: vaccines + TB/IGRA test required
 *   - EAD: DO NOT file I-765 before I-131 approval
 *   - Fee waiver: Form I-912 for paper filing
 *   - Fees: never hardcode — link to feecalculator + g-1055
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import JSZip from 'jszip'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'
import { isUUID } from '@/lib/security/validation'
import { buildReParoleI131 } from '@/lib/reparole/packetBuilder'
import type { ReParoleAnswers } from '@/lib/reparole/answers'

const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days
const PACKETS_BUCKET = 'packets'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvidenceItem {
  name?: string
  type?: string
  size?: number
}

interface ManualAnswers {
  firstName?: string
  lastName?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  phone?: string
  email?: string
  explanation?: string
  [key: string]: string | undefined
}

interface WizardMember {
  id?: string
  alias?: string
  age_group?: string
  statuses?: string[]
  manualAnswers?: ManualAnswers
}

interface WizardStateJson {
  filingMethod?: 'mail' | 'online' | 'unsure' | null
  packageSize?: number
  members?: WizardMember[]
  manual?: ManualAnswers
  evidence?: EvidenceItem[]
  current_step?: number
  selected_tier?: number
}

// ─── ReParoleAnswers adapter ──────────────────────────────────────────────────

/**
 * Convert the wizard's loose `WizardStateJson` shape into the strict
 * `ReParoleAnswers` contract needed by the I-131 field map.
 *
 * Returns null when essential fields are missing — caller skips the PDF
 * and the user still receives the 9-file text guide. This is a graceful
 * additive feature: if the wizard data is incomplete, we don't fail the
 * packet, we just don't include the filled PDF.
 *
 * The wizard's `manual` answers use loose camelCase; the I-131 field
 * map uses snake_case. This mapper bridges the two without leaking
 * either convention into the other module.
 */
function toReParoleAnswers(state: WizardStateJson): ReParoleAnswers | null {
  const m = state.manual ?? {}
  // Primary applicant. If the user added family members in `state.members`,
  // the first member's manualAnswers wins over the top-level `manual` so
  // multi-applicant flows fill the form for the primary applicant.
  const first = state.members?.[0]?.manualAnswers ?? {}
  const get = (k: string): string => (first[k] ?? m[k] ?? '').toString().trim()
  const firstName = get('firstName')
  const lastName = get('lastName')
  if (!firstName || !lastName) {
    // Without family + given name the I-131 has no useful Part 2; skip.
    return null
  }
  const sexRaw = (get('sex') || get('gender')).toUpperCase()
  const sex: 'M' | 'F' | '' =
    sexRaw === 'M' || sexRaw.startsWith('MAL') ? 'M'
    : sexRaw === 'F' || sexRaw.startsWith('FEM') ? 'F'
    : ''
  return {
    family_name: lastName,
    given_name: firstName,
    middle_name: get('middleName') || undefined,
    mailing_street: get('address') || get('street'),
    mailing_apt_ste_flr: get('apt') || undefined,
    mailing_city: get('city'),
    mailing_state: get('state'),
    mailing_zip: get('zip'),
    physical_same_as_mailing: true,
    a_number: get('aNumber') || get('a_number') || undefined,
    country_of_birth: get('countryOfBirth') || 'Ukraine',
    country_of_nationality: get('countryOfCitizenship') || get('nationality') || 'Ukraine',
    sex,
    dob: get('dob') || get('dateOfBirth'),
    ssn: get('ssn') || undefined,
    uscis_online_account_number: get('uscisOnlineAccountNumber') || undefined,
    class_of_admission: get('classOfAdmission') || 'UH',
    i94_admission_number: get('i94Number') || get('i94') || undefined,
    daytime_phone: get('phone') || get('daytimePhone'),
    mobile_phone: get('mobilePhone') || undefined,
    email: get('email'),
    filing_method: state.filingMethod ?? 'unsure',
  }
}

// ─── File builders ────────────────────────────────────────────────────────────

function build01Overview(sessionId: string): string {
  return [
    'RE-PAROLE U4U — PREPARATION PACKET',
    '====================================',
    `Session: ${sessionId}`,
    `Generated: ${new Date().toUTCString()}`,
    '',
    'WHAT IS THIS PACKET?',
    '--------------------',
    'This packet was generated by Messenginfo (messenginfo.com) as a document',
    'preparation aid for your U4U re-parole application.',
    '',
    'This packet contains:',
    '  01-overview.txt           — This file',
    '  02-applicant-summary.txt  — Your personal data summary',
    '  03-personal-explanation.txt — Your written explanation',
    '  04-evidence-index.txt     — Documents you indicated you have',
    '  05-form-i131-guide.txt    — How to complete Form I-131 (verified facts)',
    '  06-filing-instructions.txt — Step-by-step filing instructions',
    '  07-document-checklist.txt — Complete document checklist',
    '  08-fees-and-links.txt     — Fees and official USCIS links',
    '  09-disclaimer.txt         — Important legal disclaimer',
    '',
    'HOW TO USE THIS PACKET',
    '----------------------',
    '1. Read 09-disclaimer.txt first.',
    '2. Review 05-form-i131-guide.txt for the correct form item (Part 2, Item 1.e).',
    '3. Follow 06-filing-instructions.txt for your chosen filing method.',
    '4. Use 07-document-checklist.txt to gather all required documents.',
    '5. Check 08-fees-and-links.txt for current USCIS fee amounts before filing.',
    '',
    'IMPORTANT',
    '---------',
    'This packet is a preparation aid only. It is NOT legal advice.',
    'Always verify current requirements at uscis.gov before filing.',
    'Consult a licensed immigration attorney for legal questions.',
  ].join('\n')
}

function build02ApplicantSummary(state: WizardStateJson): string {
  const manual = state.manual ?? {}
  const members = state.members ?? []

  const lines = [
    'APPLICANT SUMMARY',
    '=================',
    '',
    'PRIMARY APPLICANT DATA',
    '----------------------',
  ]

  const fullName = [manual.firstName, manual.lastName].filter(Boolean).join(' ')
  if (fullName) lines.push(`Name:    ${fullName}`)
  if (manual.address) lines.push(`Address: ${manual.address}`)
  if (manual.city || manual.state || manual.zip) {
    lines.push(`City/State/ZIP: ${[manual.city, manual.state, manual.zip].filter(Boolean).join(', ')}`)
  }
  if (manual.phone) lines.push(`Phone:   ${manual.phone}`)
  if (manual.email) lines.push(`Email:   ${manual.email}`)

  if (!fullName && !manual.address && !manual.phone && !manual.email) {
    lines.push('(No applicant data was entered in this session.)')
    lines.push('Please fill in your personal information before filing.')
  }

  if (members.length > 0) {
    lines.push('')
    lines.push('FAMILY MEMBERS IN THIS APPLICATION')
    lines.push('----------------------------------')
    for (const m of members) {
      const memberName = m.alias ?? m.id ?? 'Member'
      const ageGroup = m.age_group ? ` (${m.age_group})` : ''
      lines.push(`- ${memberName}${ageGroup}`)
    }
  }

  lines.push('')
  lines.push('Filing method: ' + (state.filingMethod?.toUpperCase() ?? 'NOT SPECIFIED'))
  lines.push('Package size (number of applicants): ' + (state.packageSize ?? (members.length || 1)))

  return lines.join('\n')
}

function build03Explanation(state: WizardStateJson): string {
  const lines = [
    'PERSONAL EXPLANATION',
    '====================',
    '',
    'Your written statement is included below. Use this as the basis for your',
    'supporting statement when filing. Review and edit as needed before submission.',
    '',
  ]

  const manual = state.manual ?? {}
  const members = state.members ?? []

  // Check primary manual data first
  if (manual.explanation) {
    lines.push('PRIMARY APPLICANT:')
    lines.push('------------------')
    lines.push(manual.explanation)
    lines.push('')
  }

  // Check members
  for (const m of members) {
    const explanation = m.manualAnswers?.explanation ?? ''
    if (explanation) {
      lines.push(`${m.alias ?? m.id ?? 'Applicant'}:`)
      lines.push('------------------')
      lines.push(explanation)
      lines.push('')
    }
  }

  if (!manual.explanation && !members.some(m => m.manualAnswers?.explanation)) {
    lines.push('(No personal explanation was entered in this session.)')
    lines.push('')
    lines.push('RECOMMENDED: Write a brief statement explaining your situation.')
    lines.push('Include: when you arrived, your current circumstances, and why you')
    lines.push('need continued presence in the United States. Keep it factual.')
  }

  return lines.join('\n')
}

function build04EvidenceIndex(state: WizardStateJson): string {
  const lines = [
    'EVIDENCE INDEX',
    '==============',
    '',
    'Documents you indicated you have for this application:',
    '',
  ]

  const evidence = state.evidence ?? []

  if (evidence.length === 0) {
    lines.push('(No evidence items were recorded in this session.)')
    lines.push('')
    lines.push('Typical required evidence for U4U re-parole includes:')
    lines.push('  - Copy of previous parole approval notice')
    lines.push('  - Current I-94 record (download at i94.cbp.dhs.gov)')
    lines.push('  - Ukrainian passport (biographical page + visa pages)')
    lines.push('  - Passport-style photos (2"x2", 2 per applicant)')
    lines.push('  - Medical documentation (vaccines, TB/IGRA test — see checklist)')
  } else {
    for (const item of evidence) {
      const name = item.name ?? 'Unnamed document'
      const type = item.type ? ` [${item.type}]` : ''
      const size = item.size ? ` (${Math.round(item.size / 1024)} KB)` : ''
      lines.push(`  - ${name}${type}${size}`)
    }
  }

  lines.push('')
  lines.push('See 07-document-checklist.txt for the complete required document list.')

  return lines.join('\n')
}

function build05FormGuide(method: string): string {
  const lines = [
    'FORM I-131 — COMPLETION GUIDE',
    '==============================',
    '',
    'VERIFIED USCIS FACTS (verified 2026-05-04 from uscis.gov)',
    '----------------------------------------------------------',
    '',
    'FORM EDITION',
    '------------',
    'Use edition: 01/20/25',
    'Verified: uscis.gov/i-131 (USCIS last reviewed 03/30/2026)',
    'Download: https://www.uscis.gov/i-131',
    'Forms updates: https://www.uscis.gov/forms/forms-updates',
    '',
    'PROGRAM STATUS',
    '--------------',
    'Form I-134A (sponsor intake): PAUSED since January 28, 2025 (Executive Order).',
    'Form I-131 Re-Parole: ACTIVE — separate process, reviewed case-by-case.',
    'Verify current program status at uscis.gov before filing.',
    '',
    'FILING METHOD — PAPER vs ONLINE',
    '--------------------------------',
    'Paper (mail) filing and online (my.uscis.gov) filing use DIFFERENT item selections.',
    'Use the correct selection for YOUR chosen filing method.',
    '',
    'ITEM TO CHECK — PAPER FORM (mail filing only)',
    '----------------------------------------------',
    'Part 2, Item 1.e:',
    '  "I am outside the United States, and I am applying for Advance Parole Document"',
    '',
    '  IMPORTANT: Select this option EVEN IF you are currently inside the United States.',
    '  This is per official USCIS instructions for U4U re-parole applicants.',
    '',
  ]

  if (method === 'mail' || method === 'unsure') {
    lines.push(
      'WRITE AT TOP OF FORM — PAPER FILING ONLY',
      '-----------------------------------------',
      'Handwrite in pen at the very top of the first page of the form:',
      '  "Ukraine RE-PAROLE"',
      '',
    )
  }

  lines.push(
    'ITEM TO SELECT — ONLINE FILING (my.uscis.gov only)',
    '----------------------------------------------------',
    'Box 10.C: "Certain Ukrainians paroled on/after Feb 11, 2022"',
    'Source: uscis.gov/i-131 (verified 2026-05-04)',
    '',
    'FILING WINDOW',
    '-------------',
    'File no earlier than 180 days (6 months) before your current parole expires.',
    'Source: https://www.uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-certain-ukrainian-citizens-and-their-immediate-family-members',
    '',
    'FORM I-131 OFFICIAL SOURCE',
    '--------------------------',
    'https://www.uscis.gov/i-131',
  )

  return lines.join('\n')
}

function build06FilingInstructions(method: string): string {
  const lines = [
    'FILING INSTRUCTIONS',
    '===================',
    `Filing method selected: ${method.toUpperCase()}`,
    '',
  ]

  if (method === 'mail' || method === 'unsure') {
    lines.push('PAPER / MAIL FILING')
    lines.push('-------------------')
    lines.push('Step 1: Download Form I-131 edition 01/20/25 from https://www.uscis.gov/i-131')
    lines.push('Step 2: Print all 14 pages of the form.')
    lines.push('Step 3: Write "Ukraine RE-PAROLE" in pen at the very top of page 1.')
    lines.push('Step 4: In Part 2, check box for Item 1.e.')
    lines.push('        ("I am outside the United States, applying for Advance Parole Document")')
    lines.push('        Select this EVEN IF you are currently inside the US.')
    lines.push('Step 5: Complete all required fields in ink. Sign and date the form in ink.')
    lines.push('        (No digital signatures for paper filing.)')
    lines.push('Step 6: Attach 2 passport-style photos per applicant (2"x2", white background).')
    lines.push('Step 7: Include all required supporting documents (see checklist).')
    lines.push('Step 8: Include the correct USCIS filing fee (check uscis.gov/feecalculator).')
    lines.push('Step 9: Find correct mailing address at https://www.uscis.gov/i-131-addresses')
    lines.push('        — address depends on your state and may change. Verify before mailing.')
    lines.push('Step 10: Mail via USPS, FedEx, or UPS with tracking. Keep the tracking number.')
    lines.push('')
    lines.push('FEE WAIVER FOR PAPER FILING')
    lines.push('---------------------------')
    lines.push('If you cannot pay the filing fee, you may file Form I-912 (Fee Waiver).')
    lines.push('Fee waiver is available for paper-only filing. Verify eligibility requirements.')
    lines.push('Form I-912: https://www.uscis.gov/i-912')
    lines.push('')
  }

  if (method === 'online' || method === 'unsure') {
    if (method === 'unsure') {
      lines.push('')
      lines.push('— OR —')
      lines.push('')
    }
    lines.push('ONLINE FILING (myUSCIS)')
    lines.push('-----------------------')
    lines.push('Step 1: Create or log in to myUSCIS at https://my.uscis.gov')
    lines.push('Step 2: Select "File a form online" → Form I-131.')
    lines.push('Step 3: Select Box 10.C:')
    lines.push('        "Certain Ukrainians paroled on/after Feb 11, 2022"')
    lines.push('        (Source: uscis.gov/i-131, verified 2026-05-04)')
    lines.push('Step 4: Complete all required fields in the online form.')
    lines.push('Step 5: Complete all required fields in the online form.')
    lines.push('Step 6: Upload scanned copies of all supporting documents (PDF preferred).')
    lines.push('        Include current I-94 (download at https://i94.cbp.dhs.gov)')
    lines.push('Step 7: Pay the USCIS filing fee through the myUSCIS portal.')
    lines.push('        Current amount: check https://www.uscis.gov/feecalculator')
    lines.push('        Do NOT send payment separately.')
    lines.push('Step 8: Submit and save your receipt notice.')
    lines.push('')
    lines.push('Note: The parole grant fee (if charged) is assessed upon conditional approval.')
    lines.push('Fee waiver (Form I-912) is typically available for paper filing only.')
    lines.push('')
  }

  lines.push('AFTER FILING')
  lines.push('------------')
  lines.push('Keep a copy of everything you submitted.')
  lines.push('Track your case at: https://egov.uscis.gov/casestatus/landing.do')
  lines.push('Processing times vary — check current estimates at uscis.gov/processing-times.')

  return lines.join('\n')
}

function build07DocumentChecklist(state: WizardStateJson): string {
  const method = state.filingMethod ?? 'unsure'

  return [
    'DOCUMENT CHECKLIST',
    '==================',
    '',
    'Use this checklist to gather all required documents before filing.',
    'Check off each item as you prepare it.',
    '',
    'FORM I-131',
    '----------',
    '[ ] Form I-131 edition 01/20/25 (download: https://www.uscis.gov/i-131)',
    '[ ] Part 2, Item 1.e checked (paper) OR correct dropdown selected (online)',
    ...(method === 'mail' || method === 'unsure' ? [
      '[ ] "Ukraine RE-PAROLE" written in pen at top of form (paper filing)',
      '[ ] Form signed in ink (no digital signatures for paper)',
    ] : []),
    '',
    'IDENTITY DOCUMENTS',
    '------------------',
    '[ ] Ukrainian passport — biographical page (photo/scan, clear and complete)',
    '[ ] Ukrainian passport — all pages with visa stamps, entries, or annotations',
    '[ ] Previous parole approval notice or parole document (I-94 or parole stamp)',
    '[ ] Current I-94 record — download at https://i94.cbp.dhs.gov',
    '',
    'MEDICAL DOCUMENTATION',
    '---------------------',
    '[ ] Medical attestation: proof of required vaccinations',
    '[ ] TB/IGRA test results (where applicable per USCIS instructions)',
    '    Note: Follow current USCIS instructions for medical requirements.',
    '    Verify at: https://www.uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-certain-ukrainian-citizens-and-their-immediate-family-members',
    '',
    'PHOTOS',
    '------',
    ...(method === 'mail' || method === 'unsure' ? [
      '[ ] 2 passport-style photos per applicant (2"x2", white background, recent)',
    ] : []),
    ...(method === 'online' ? [
      '[ ] Digital photo may be required — follow myUSCIS instructions',
    ] : []),
    '',
    'SUPPORTING STATEMENT',
    '--------------------',
    '[ ] Written explanation of your situation (see 03-personal-explanation.txt)',
    '    Include: circumstances, timeline, reasons for needing continued stay',
    '',
    'FEES',
    '----',
    '[ ] USCIS filing fee — check current amount at https://www.uscis.gov/feecalculator',
    '[ ] Note: A separate parole grant fee may be charged upon conditional approval',
    ...(method === 'mail' || method === 'unsure' ? [
      '[ ] If unable to pay: Form I-912 Fee Waiver (paper filing only)',
      '    https://www.uscis.gov/i-912',
    ] : []),
    '',
    'EAD / WORK AUTHORIZATION — IMPORTANT',
    '-------------------------------------',
    '[ ] DO NOT file Form I-765 (EAD) until your I-131 has been APPROVED',
    '    and USCIS guidance specifically authorizes EAD filing.',
    '    This re-parole packet is NOT an EAD filing packet.',
    '',
    '    ⚠️ EAD (Form I-765): Do NOT file for employment authorization based on',
    '    this re-parole until your Form I-131 is approved. Filing too early',
    '    may cause rejection.',
    '',
    'ADDITIONAL FOR FAMILY MEMBERS',
    '------------------------------',
    '[ ] Repeat all document steps for each family member included in application',
    '[ ] Each applicant needs their own photos, identity documents, and I-94',
  ].join('\n')
}

function build08FeesAndLinks(): string {
  return [
    'FEES AND OFFICIAL LINKS',
    '=======================',
    '',
    'USCIS FEE STRUCTURE',
    '-------------------',
    'For U4U re-parole, USCIS charges TWO separate fees:',
    '',
    '  1. I-131 FILING FEE',
    '     Paid when you submit your application.',
    '     Amount varies — check the official fee calculator.',
    '',
    '  2. PAROLE GRANT FEE',
    '     Charged upon conditional approval (before final parole grant).',
    '     Amount varies — check the official fee schedule.',
    '',
    'IMPORTANT: Do NOT rely on third-party sources for fee amounts.',
    'USCIS fee schedules change. Always check official sources.',
    '',
    'FEE CALCULATOR (official): https://www.uscis.gov/feecalculator',
    'FEE SCHEDULE G-1055:       https://www.uscis.gov/g-1055',
    '',
    'FEE WAIVER',
    '----------',
    'If you cannot pay the filing fee:',
    '  Form I-912 (Fee Waiver Request)',
    '  Available for paper filing only.',
    '  Verify eligibility requirements before filing.',
    '  Official source: https://www.uscis.gov/i-912',
    '',
    'PROCESSING TIMES',
    '----------------',
    'USCIS processing times vary significantly.',
    'Check current estimates: https://egov.uscis.gov/processing-times/',
    'Plan for substantial waiting periods.',
    '',
    '⏳ Processing time: USCIS processing times change frequently. U4U re-parole',
    'may take many months. Check https://egov.uscis.gov/processing-times/ before',
    'filing and monitor your case status after submission.',
    '',
    'OFFICIAL USCIS LINKS',
    '--------------------',
    'Form I-131:          https://www.uscis.gov/i-131',
    'U4U Re-parole page:  https://www.uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-certain-ukrainian-citizens-and-their-immediate-family-members',
    'Forms updates:       https://www.uscis.gov/forms/forms-updates',
    'Fee Calculator:      https://www.uscis.gov/feecalculator',
    'Fee Schedule G-1055: https://www.uscis.gov/g-1055',
    'Fee Waiver I-912:    https://www.uscis.gov/i-912',
    'myUSCIS portal:      https://my.uscis.gov',
    'Mailing addresses:   https://www.uscis.gov/i-131-addresses',
    'I-94 lookup:         https://i94.cbp.dhs.gov',
    'Processing times:    https://egov.uscis.gov/processing-times/',
    'Case status:         https://egov.uscis.gov/casestatus/landing.do',
    '',
    'LEGAL HELP',
    '----------',
    'For legal advice, contact a licensed immigration attorney or a',
    'DOJ-accredited representative:',
    'https://www.justice.gov/eoir/list-of-pro-bono-legal-service-providers',
  ].join('\n')
}

function build09Disclaimer(): string {
  return [
    'DISCLAIMER',
    '==========',
    '',
    'NOT LEGAL ADVICE',
    '----------------',
    'This packet was generated by Messenginfo (messenginfo.com) as a document',
    'preparation aid only.',
    '',
    'Messenginfo is NOT a law firm and does NOT provide legal advice.',
    'Nothing in this packet constitutes legal advice or creates an',
    'attorney-client relationship.',
    '',
    'NOT AFFILIATED WITH USCIS',
    '-------------------------',
    'Messenginfo is not affiliated with, endorsed by, or connected to USCIS,',
    'DHS, or any U.S. government agency.',
    '',
    'VERIFY BEFORE FILING',
    '--------------------',
    'Immigration law and USCIS policy change frequently.',
    'Always verify current requirements at uscis.gov before filing.',
    'Form editions, fees, and program status may have changed since this',
    'packet was generated.',
    '',
    'CONSULT AN ATTORNEY',
    '-------------------',
    'For questions specific to your situation, consult a licensed immigration',
    'attorney or DOJ-accredited representative.',
    '',
    'DOJ list: https://www.justice.gov/eoir/list-of-pro-bono-legal-service-providers',
    '',
    'YOU FILE YOURSELF',
    '-----------------',
    'This packet is a preparation aid. You are responsible for your own filing.',
    'Messenginfo does not file applications on behalf of users.',
    '',
    `Packet generated: ${new Date().toUTCString()}`,
    'messenginfo.com — Official-source immigration information.',
  ].join('\n')
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit: 5 packets per minute per IP (expensive — ZIP generation + Supabase storage)
  const ip = getClientIP(req)
  const rl = await rateLimit(`packet-generate:${ip}`, 5, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait before generating another packet.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) } }
    )
  }

  try {
    const body = await req.json() as { session_id?: string }
    const { session_id } = body

    if (!session_id || typeof session_id !== 'string') {
      return NextResponse.json({ ok: false, error: 'session_id required' }, { status: 400 })
    }

    // Validate UUID format — reject probing or injection attempts
    if (!isUUID(session_id)) {
      return NextResponse.json({ ok: false, error: 'invalid session_id format' }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()

    // 1. Load wizard session
    const { data: session, error: sessionError } = await supabase
      .from('wizard_sessions')
      .select('id, state_json, locale, service_slug')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 })
    }

    const state = (session.state_json ?? {}) as WizardStateJson
    const method = state.filingMethod ?? 'unsure'

    // 2. Build structured multi-file ZIP
    const zip = new JSZip()
    zip.file('01-overview.txt', build01Overview(session_id))
    zip.file('02-applicant-summary.txt', build02ApplicantSummary(state))
    zip.file('03-personal-explanation.txt', build03Explanation(state))
    zip.file('04-evidence-index.txt', build04EvidenceIndex(state))
    zip.file('05-form-i131-guide.txt', build05FormGuide(method))
    zip.file('06-filing-instructions.txt', build06FilingInstructions(method))
    zip.file('07-document-checklist.txt', build07DocumentChecklist(state))
    zip.file('08-fees-and-links.txt', build08FeesAndLinks())
    zip.file('09-disclaimer.txt', build09Disclaimer())

    // ── 2b. Add filled I-131.pdf when we have enough applicant data ──────
    // Mirror of TPS: read official PDF + apply ReParole field map via the
    // shared pdfPrefiller (Cyrillic → Latin transliteration baked in).
    // If the wizard state lacks required identity fields we skip the PDF
    // and the user still gets the 9-file text guide. So this is additive,
    // not a replacement.
    const reParoleAnswers = toReParoleAnswers(state)
    let i131Stats: { applied: number; skipped: number } = { applied: 0, skipped: 0 }
    let i131Generated = false
    if (reParoleAnswers) {
      try {
        const built = await buildReParoleI131(reParoleAnswers)
        zip.file('10-form-i131.pdf', Buffer.from(built.i131_bytes))
        i131Stats = { applied: built.i131.applied, skipped: built.i131.skipped }
        i131Generated = true
      } catch (err) {
        // Do NOT fail the whole packet generation if PDF prefill blows up.
        // Surface in audit log instead. The text guides are still in the ZIP.
        console.error('[reparole-packet] I-131 fill failed:', err)
      }
    }

    const fileCount = i131Generated ? 10 : 9

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

    // 3. Upload to Supabase Storage
    const storageKey = `${session_id}/packet_${Date.now()}.zip`

    await supabase.storage.createBucket(PACKETS_BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    }).catch(() => {
      // bucket likely already exists — ignore
    })

    const { error: uploadError } = await supabase.storage
      .from(PACKETS_BUCKET)
      .upload(storageKey, zipBuffer, {
        contentType: 'application/zip',
        upsert: true,
      })

    if (uploadError) {
      console.error('[packet/generate] upload error:', uploadError.message)
      return NextResponse.json(
        { ok: false, error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // 4. Create signed URL
    const { data: signedData, error: signError } = await supabase.storage
      .from(PACKETS_BUCKET)
      .createSignedUrl(storageKey, SIGNED_URL_EXPIRY_SECONDS)

    if (signError || !signedData?.signedUrl) {
      console.error('[packet/generate] signed URL error:', signError?.message)
      return NextResponse.json(
        { ok: false, error: 'Could not generate download link' },
        { status: 500 }
      )
    }

    // 5. Log to audit_log — use after() so Next.js keeps lambda alive until insert completes
    //    after() is preferred over @vercel/functions waitUntil() on Next.js 15.3.1+
    after(async () => {
      const { error } = await supabase.from('audit_log').insert({
        action: 'packet_generated',
        target_table: 'wizard_sessions',
        target_id: session_id,
        detail: {
          session_id,
          storage_key: storageKey,
          filing_method: method,
          file_count: fileCount,
          package_size: state.packageSize ?? 1,
          locale: session.locale,
          service_slug: session.service_slug,
          generated_at: new Date().toISOString(),
        },
      })
      if (error) console.error('[audit_log] packet_generated insert failed:', error.message)
    })

    // 6. Log to generated_packets table if it exists (fire and forget)
    void supabase.from('generated_packets').insert({
      session_id,
      storage_key: storageKey,
      filing_method: method,
      file_count: fileCount,
      locale: session.locale,
      service_slug: session.service_slug,
    }).then(({ error }) => {
      if (error && !error.message.includes('does not exist')) {
        console.error('[packet/generate] generated_packets insert error:', error.message)
      }
    })

    return NextResponse.json({
      ok: true,
      signed_url: signedData.signedUrl,
      expires_in_seconds: SIGNED_URL_EXPIRY_SECONDS,
      file_count: fileCount,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[packet/generate] error:', msg)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
