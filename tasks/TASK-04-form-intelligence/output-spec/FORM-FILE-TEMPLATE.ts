// TEMPLATE — Copy and fill for each form
// Save as apps/web/data/formIntelligence/{slug}.ts

import type { FormIntelligence } from './types'

export const i131: FormIntelligence = {
  form_id: 'I-131',
  form_slug: 'i131',
  official_url: 'https://www.uscis.gov/i-131',
  instructions_pdf_url: 'https://www.uscis.gov/sites/default/files/document/forms/i-131instr.pdf',
  edition_date: '[FILL FROM PDF HEADER]',
  edition_last_verified: '2026-04-30',
  topics: ['re-parole', 'travel-document', 'advance-parole'],
  who_may_use: [
    'Persons paroled into the U.S. who need to apply for re-parole',
    'Persons in the U.S. requesting Advance Parole',
    'Persons applying for a Refugee Travel Document',
    'Persons applying for a Reentry Permit',
  ],
  filing_method: ['paper', 'online'],
  fees: [
    {
      amount_usd: 630,
      fee_waiver_eligible: true,
      fee_waiver_form: 'I-912',
      effective_date: '2024-04-01',
      notes: 'Fee for Advance Parole / re-parole filing. Verify against current G-1055.',
    },
  ],
  fields: [
    {
      id: 'fullLegalNameFamily',
      label: 'Family name (last name)',
      required: true,
      source_type: 'passport',
      source_doc_field: 'passport.surname',
      official_section: 'Part 1, Item 1.a',
    },
    {
      id: 'fullLegalNameGiven',
      label: 'Given name (first name)',
      required: true,
      source_type: 'passport',
      source_doc_field: 'passport.given_name',
      official_section: 'Part 1, Item 1.b',
    },
    // ... fill all extracted fields
  ],
  documents_needed: [
    {
      document: 'Copy of valid passport',
      required: true,
      notes: 'Biographic page',
    },
    {
      document: 'Copy of original Travel Authorization (for U4U re-parole)',
      required: true,
    },
    {
      document: 'Personal evidence supporting need for re-parole (medical, family, employment)',
      required: true,
      notes: 'As of August 2025, USCIS expects personal evidence beyond general country conditions',
    },
    // ... fill all required documents
  ],
  manual_entry_fields: [
    'currentPhysicalAddress',
    'mailingAddress',
    'daytimePhone',
    'emailAddress',
    'parolePurposeStatement',
    // ... fields that need user typing
  ],
  warnings: [
    {
      text: 'Form-only filing without personal evidence is no longer sufficient (Aug 2025 policy shift)',
      source: 'USCIS Uniting for Ukraine page',
      severity: 'critical',
    },
    // ...
  ],
  official_sources: [
    { title: 'USCIS Form I-131', url: 'https://www.uscis.gov/i-131' },
    { title: 'USCIS Uniting for Ukraine', url: 'https://www.uscis.gov/humanitarian/uniting-for-ukraine' },
    { title: 'I-131 Instructions PDF', url: 'https://www.uscis.gov/sites/default/files/document/forms/i-131instr.pdf' },
  ],
  common_mistakes_from_research: [
    'Checking the wrong box — Ukrainian re-parole filers should select Box 10.C',
    'Filing too early — confusion about the 180-day window',
    'Form-only filing in 2026 — USCIS now requires personal evidence',
    'Incorrect parole expiration date entry',
    'Not including the original Travel Authorization document',
  ],
}
