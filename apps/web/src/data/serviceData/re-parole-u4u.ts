import type { ServiceData } from './types'

/**
 * Re-Parole U4U service data.
 *
 * VERIFIED 2026-05-04 from official USCIS sources (uscis.gov):
 *
 * I-131 EDITION:
 *   - Edition 01/20/25 is CURRENT (verified live uscis.gov/i-131 on 2026-05-04,
 *     USCIS page last reviewed 03/30/2026).
 *   - "Feb-27-2024" was the U4U program announcement date — NOT a form edition.
 *     DO NOT use the Feb-27-2024 date anywhere as an I-131 form edition.
 *
 * PAPER FILING:
 *   - Part 2, Item 1.e — select even if applicant is inside the US.
 *   - Handwrite "Ukraine RE-PAROLE" at the top of the first page.
 *   - Source: USCIS U4U Re-Parole Guide (last reviewed 10/11/2024)
 *
 * ONLINE FILING (my.uscis.gov):
 *   - Application category: Box 10.C
 *   - Dropdown: "I am outside the United States, and I am applying for an Advance Parole Document"
 *   - Answer "Yes" to re-parole question.
 *   - Fee waiver (I-912) NOT available for online filing.
 *   - Source: USCIS Form I-131 page (last reviewed 03/30/2026)
 *
 * FILING WINDOW:
 *   - No earlier than 180 days (6 months) before current parole expires.
 *
 * U4U PROGRAM STATUS:
 *   - Form I-134A (sponsor intake): PAUSED since Jan 28, 2025 (Executive Order).
 *   - Form I-131 Re-Parole: ACTIVE — separate process, continues case-by-case.
 *   - DO NOT state "program-resumed on Jun-9-2025" — that claim is not on USCIS.gov.
 *
 * FEE STRUCTURE (effective Oct 16, 2025):
 *   - Two separate fees: I-131 filing fee + parole grant fee (on conditional approval).
 *   - NEVER hardcode dollar amounts. Always link to uscis.gov/feecalculator + uscis.gov/g-1055.
 *
 * MEDICAL ATTESTATION:
 *   - Required: proof of vaccinations + TB/IGRA test where applicable.
 *   - Follow current USCIS instructions for medical requirements.
 *
 * EAD (FORM I-765):
 *   - DO NOT file I-765 for (c)(11) before I-131 is approved and USCIS authorizes EAD.
 *   - Category for re-parolees: (c)(11), Part 2 Item 27.
 *
 * FEE WAIVER:
 *   - Form I-912 available for paper filing only.
 *   - Verify eligibility at uscis.gov/i-912.
 *
 * PROCESSING TIMES:
 *   - Vary significantly. Check uscis.gov/processing-times.
 *   - Do NOT hardcode fixed month estimates in user-facing text.
 */
export const reParoleU4UData: ServiceData = {
  slug: 're-parole-u4u',
  full_data: true,
  verification_status: 'verified',
  verified_at: '2026-05-04',

  form: {
    id: 'I-131',
    // Edition verified live from uscis.gov/i-131 on 2026-05-04 (USCIS last reviewed 03/30/2026).
    // "Feb-27-2024" was the U4U program announcement — NOT the form edition.
    edition: '01/20/25',
    // Paper filing: Part 2, Item 1.e — select even if inside the US.
    // Online filing: Box 10.C via my.uscis.gov.
    item_for_u4u: '1.e',
    item_label:
      'I am outside the United States, and I am applying for Advance Parole Document (select even if you are inside the US — per USCIS re-parole instructions)',
    top_of_form_text: 'Ukraine RE-PAROLE',
  },

  ead: {
    form: 'I-765',
    category: '(c)(11)',
    part: '2',
  },

  filing: {
    window_days: 180,
    window_description:
      'Submit no earlier than 180 days (6 months) before current parole expires',
    methods: ['online', 'mail'],
    online_url: 'https://my.uscis.gov',
    addresses_url: 'https://www.uscis.gov/i-131-addresses',
    processing_times_url: 'https://egov.uscis.gov/processing-times/',
  },

  fees: {
    calculator_url: 'https://www.uscis.gov/feecalculator',
    schedule_url: 'https://www.uscis.gov/g-1055',
    fee_waiver_url: 'https://www.uscis.gov/i-912',
    note_key: 'services.re-parole-u4u.fees.note',
  },

  // Status: I-134A (sponsor intake) paused Jan 2025. I-131 Re-Parole = ACTIVE, separate process.
  // Do NOT reference any Jun-2025 court-order-based resumption claim — not on USCIS.gov.
  statusWarningKey: 'servicePages.re-parole-u4u.statusWarning',
  // Fee notice: two-fee structure — filing fee + parole grant fee (Oct 2025)
  feeNoticeKey: 'servicePages.re-parole-u4u.feeNotice',
  // Processing time: varies — link to uscis.gov/processing-times
  processingWarningKey: 'servicePages.re-parole-u4u.processingWarning',
  // Medical attestation: vaccines + TB IGRA test
  medicalNoteKey: 'servicePages.re-parole-u4u.medicalNote',
  // EAD warning: do NOT file I-765 before I-131 approval
  eadWarningKey: 'servicePages.re-parole-u4u.eadWarning',
  // Fee waiver: Form I-912 for paper filing
  feeWaiverNoteKey: 'servicePages.re-parole-u4u.feeWaiverNote',

  msLSettlement: {
    filingPaper: {
      handwrite: 'Ms. L Settlement Class Member',
      alternateHandwrite: 'Ms. L. Settlement QAFM',
      position: 'top of first page of Form I-131',
    },
    filingOnline: {
      applicationCategory: 'Box 10.G',
      note: 'Select Box 10.G — NOT Box 10.C — when filing online as Ms. L. Settlement member',
    },
    hr1FeesExempt: true,
    exemptSince: '2026-02-05',
    verifyEligibilityUrl: 'https://together.gov',
    verifyEligibilityUrlEs: 'https://juntos.gov',
    note: 'Eligibility is verified through the Family Reunification Task Force. Cannot be self-declared.',
    sourceUrl: 'https://www.uscis.gov/g-1055',
    sourceNote: 'USCIS G-1055 (last reviewed 04/23/2026)',
  },

  feeArchitecture: {
    dhsBaseFee: {
      noteKey: 'fees.baseFee.note',
      feeCalculatorUrl: 'https://www.uscis.gov/fees',
      feeScheduleUrl: 'https://www.uscis.gov/g-1055',
      feeWaiverEligible: true,
      feeWaiverForm: 'I-912',
      feeWaiverRequiresPaper: true,
    },
    hr1ParoleGrantFee: {
      noteKey: 'fees.paroleGrant.note',
      chargedAfterApproval: true,
      chargedAtFiling: false,
      feeWaiverEligible: false,
      msLExempt: true,
      msLExemptSince: '2026-02-05',
      sourceUrl: 'https://www.uscis.gov/g-1055',
    },
    hr1EadRenewal: {
      noteKey: 'fees.eadRenewal.note',
      feeWaiverEligible: false,
      msLExempt: true,
      canRequestViaI131Part9: true,
      sourceUrl: 'https://www.uscis.gov/g-1055',
    },
    paperPayment: {
      noteKey: 'fees.payment.note',
      checksProhibitedSince: '2025-10-28',
      allowedMethods: ['G-1450 (credit/debit card)', 'G-1650 (ACH)'],
      exemptionForm: 'G-1651',
      exemptionEdition: '06/03/25',
      sourceUrl: 'https://www.uscis.gov/g-1651',
    },
  },

  eadSequence: {
    warningKey: 'ead.sequence.warning',
    correctSequence: [
      'eadSequence.step1',
      'eadSequence.step2',
      'eadSequence.step3',
      'eadSequence.step4',
    ],
    sourceNote: 'USCIS U4U Re-Parole Guide (last reviewed 10/11/2024)',
  },

  paperFilingChecklist: [
    { id: 'g1145', titleKey: 'checklist.g1145.title', descKey: 'checklist.g1145.desc', recommended: true },
    { id: 'ar11', titleKey: 'checklist.ar11.title', descKey: 'checklist.ar11.desc', required: true, url: 'https://www.uscis.gov/ar-11' },
    { id: 'keepCopy', titleKey: 'checklist.keepCopy.title', descKey: 'checklist.keepCopy.desc', required: true },
    { id: 'applicantAccount', titleKey: 'checklist.applicantAccount.title', descKey: 'checklist.applicantAccount.desc', required: true },
    { id: 'childPassport', titleKey: 'checklist.childPassport.title', descKey: 'checklist.childPassport.desc', conditional: true, showIf: 'hasMemberUnder18' },
  ],

  medicalAttestation: {
    location: 'USCIS online account (my.uscis.gov)',
    paperAccountNote: 'Even paper filers should create a USCIS account and link their case',
    noteKey: 'medical.attestation.note',
    sourceNote: 'USCIS U4U archived instructions',
  },

  filingMethods: {
    paper: {
      formPart: 'Part 2, Item 1.e',
      handwrite: 'Ukraine RE-PAROLE',
      handwritePosition: 'top of first page of Form I-131',
      feeWaiverAllowed: true,
      sourceNote: 'USCIS U4U Re-Parole Guide (last reviewed 10/11/2024)',
    },
    online: {
      portal: 'https://my.uscis.gov',
      applicationCategory: 'Box 10.C — Certain Ukrainians paroled on/after Feb 11, 2022',
      userDropdown: 'I am outside the United States, and I am applying for an Advance Parole Document',
      reParoleAnswer: 'Yes',
      feeWaiverAllowed: false,
      feeWaiverNoteKey: 'servicePages.re-parole-u4u.filing.online.noFeeWaiver',
      sourceNote: 'USCIS Form I-131 page (last reviewed 03/30/2026)',
    },
  },

  verifiedSources: [
    {
      id: 'i131',
      label: 'Form I-131',
      url: 'https://www.uscis.gov/i-131',
      uscisLastReviewed: '2026-03-30',
      messenginfoVerified: '2026-05-04',
    },
    {
      id: 'u4u-reparole',
      label: 'U4U Re-Parole Guide',
      url: 'https://www.uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-certain-ukrainian-citizens-and-their-immediate-family-members',
      uscisLastReviewed: '2024-10-11',
      messenginfoVerified: '2026-05-04',
    },
    {
      id: 'i765',
      label: 'Form I-765 (EAD)',
      url: 'https://www.uscis.gov/i-765',
      uscisLastReviewed: '2026-04-30',
      messenginfoVerified: '2026-05-04',
    },
    {
      id: 'g1055',
      label: 'G-1055 Fee Schedule',
      url: 'https://www.uscis.gov/g-1055',
      uscisLastReviewed: '2026-04-23',
      messenginfoVerified: '2026-05-04',
    },
    {
      id: 'i134a-alert',
      label: 'U4U I-134A Pause Notice',
      url: 'https://www.uscis.gov/newsroom/alerts/update-on-form-i-134a',
      uscisLastReviewed: '2025-01-28',
      messenginfoVerified: '2026-05-04',
    },
  ],
  messenginfoVerifiedOn: '2026-05-04',

  sources: [
    {
      label: 'USCIS · Form I-131',
      url: 'https://www.uscis.gov/i-131',
      last_verified: '2026-05-04',
    },
    {
      label: 'USCIS · Re-Parole Process for Certain Ukrainian Citizens',
      url: 'https://www.uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-certain-ukrainian-citizens-and-their-immediate-family-members',
      last_verified: '2026-05-04',
    },
    {
      label: 'USCIS · Forms Updates',
      url: 'https://www.uscis.gov/forms/forms-updates',
      last_verified: '2026-05-04',
    },
    {
      label: 'USCIS · Fee Calculator',
      url: 'https://www.uscis.gov/feecalculator',
      last_verified: '2026-05-04',
    },
    {
      label: 'USCIS · G-1055 Fee Schedule',
      url: 'https://www.uscis.gov/g-1055',
      last_verified: '2026-05-04',
    },
    {
      label: 'USCIS · Form I-912 Fee Waiver',
      url: 'https://www.uscis.gov/i-912',
      last_verified: '2026-05-04',
    },
    {
      label: 'CBP · I-94 Lookup',
      url: 'https://i94.cbp.dhs.gov/',
      last_verified: '2026-05-04',
    },
  ],
}

export const SERVICE_DATA: Record<string, ServiceData> = {
  're-parole-u4u': reParoleU4UData,
}

export function getServiceData(slug: string): ServiceData | undefined {
  return SERVICE_DATA[slug]
}
