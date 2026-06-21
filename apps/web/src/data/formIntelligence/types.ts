// apps/web/src/data/formIntelligence/types.ts
// Auto-generated from TASK-04 template — do not hand-edit structure

export type FieldSourceType =
  | 'passport'
  | 'i94'
  | 'ead'
  | 'parole_doc'
  | 'uscis_notice'
  | 'manual_entry'
  | 'computed'
  | 'not_confirmed'

export type FilingMethod = 'online' | 'paper' | 'both'

export type WarningSeverity = 'info' | 'caution' | 'critical'

export interface FormField {
  id: string                    // canonical id, e.g. 'fullLegalName'
  label: string                 // user-friendly EN label
  required: boolean
  source_type: FieldSourceType
  source_doc_field?: string     // e.g. 'passport.surname'
  format?: string               // e.g. 'YYYY-MM-DD', 'A123456789'
  notes?: string
  official_section?: string     // e.g. 'Part 1, Item 1.a'
  sensitive?: boolean           // true for SSN, sensitive PII
}

export interface FormFee {
  amount_usd: number | 'varies'
  label: string
  fee_waiver_eligible: boolean
  fee_waiver_form?: 'I-912' | string
  notes?: string
  effective_date: string        // ISO
  provisional: boolean          // true until confirmed against live G-1055 within 30 days
  hr1_surcharge?: number
  hr1_surcharge_waivable?: boolean
}

export interface FormDocument {
  document: string
  required: boolean
  notes?: string
}

export interface FormWarning {
  text: string
  source: string
  severity: WarningSeverity
}

export interface OfficialSource {
  title: string
  url: string
}

export interface FormIntelligence {
  form_id: string                       // 'I-131'
  form_slug: string                     // 'i131'
  official_url: string
  form_pdf_url: string
  instructions_pdf_url: string
  edition_date: string                  // from PDF header e.g. '01/20/25'
  edition_last_verified: string         // ISO date when we confirmed from live PDF
  topics: string[]                      // matches serviceCards topic
  who_may_use: string[]
  filing_method: FilingMethod[]
  fees: FormFee[]
  fields: FormField[]
  documents_needed: FormDocument[]
  manual_entry_fields: string[]         // subset of field IDs that need user typing
  warnings: FormWarning[]
  official_sources: OfficialSource[]
  common_mistakes_from_research: string[]
}
