# TPS Field Mapping — v1 (Plan Only)

**Status:** plan-only. No auto-fill code yet. This document defines the chain
`source_document → extracted_field → TPSAnswers → USCIS form field` so that
future cycles can implement each agent against an explicit contract.

**Source layer:** `docs/uscis/forms/tps/forms_manifest.json`
(7 PDFs, all `current_from_official_page`, captured 2026-05-10).

**Field inventories:** `field_inventory_i821.json/md`, `_i765.json/md`,
`_i765ws.json/md`, `_i912.json/md`. Re-run `inventory_fields.py` whenever the
USCIS edition changes (the manifest will surface mismatches first).

---

## 1. Source documents the user uploads

| Source document    | Why we ask for it                          | OCR engine                          |
|--------------------|--------------------------------------------|-------------------------------------|
| Ukrainian passport | Identity, nationality, DOB, sex            | Google Vision + `mrzParser.ts`      |
| I-94 record        | Date of last entry, class of admission, admission # | Vision + `i94Parser.ts` (new) |
| Prior EAD card     | A-number, category on card, expiry         | Vision + `eadCardParser.ts` (new)   |
| I-797 receipt(s)   | Receipt #, prior TPS or filing history     | Vision + simple regex parser        |
| Residence evidence | Continuous residence + physical presence   | Vision OCR, classifier per file     |
| User text input    | Anything we cannot derive (e.g., address, phone) | Wizard form fields              |

---

## 2. Extracted-field schema (output of agent 1)

A document-agnostic bag the OCR layer hands over to the classifier and prefiller.

```ts
interface ExtractedFields {
  // Passport
  passport_surname?: string
  passport_given_names?: string
  passport_number?: string
  passport_nationality?: string   // ISO 3-letter (UKR)
  passport_dob?: string           // YYYY-MM-DD
  passport_sex?: 'M' | 'F' | 'X'
  passport_issue_date?: string
  passport_expiry_date?: string
  passport_issuing_authority?: string
  passport_mrz_line1?: string
  passport_mrz_line2?: string
  passport_mrz_checksum_valid?: boolean

  // I-94
  i94_admission_number?: string       // 11 digits
  i94_class_of_admission?: string     // e.g. 'UH' (U4U)
  i94_date_of_entry?: string          // YYYY-MM-DD
  i94_admit_until?: string

  // Prior EAD
  ead_card_number?: string
  ead_uscis_number?: string           // a.k.a. A-number sometimes
  ead_category_on_card?: string       // 'A12' or 'C19' for TPS
  ead_valid_from?: string
  ead_expires?: string

  // I-797 receipt
  receipt_numbers?: string[]          // 'EAC...' / 'MSC...'

  // Residence/presence evidence
  residence_evidence_files?: Array<{
    filename: string
    document_type_guess: 'lease' | 'utility' | 'paystub' | 'tax_return' | 'medical' | 'school' | 'bank' | 'affidavit' | 'other'
    date_range?: { from?: string, to?: string }
  }>
}
```

---

## 3. TPSAnswers — the wizard-internal contract

Single source of truth for what we know about the applicant. Populated from
`ExtractedFields` + wizard answers. Lives in `wizard_sessions.state_json`
under `service_slug = 'tps-ukraine'`.

```ts
interface TPSAnswers {
  // Identity (from passport)
  family_name: string
  given_name: string
  middle_name?: string
  other_names?: string[]
  dob: string             // YYYY-MM-DD
  country_of_birth: string
  country_of_nationality: string  // 'Ukraine'
  sex: 'M' | 'F' | 'X'
  a_number?: string
  uscis_online_account?: string
  passport_number: string
  passport_country: string
  passport_expiry: string

  // Entry / presence
  last_entry_date: string         // ≤ 2023-08-16 required for initial path
  i94_admission_number: string
  i94_class_of_admission: string
  current_immigration_status?: string

  // US address (user-input — we cannot OCR this)
  us_address_street: string
  us_address_apt?: string
  us_address_city: string
  us_address_state: string
  us_address_zip: string
  mailing_same_as_physical?: boolean
  mailing_address?: { ... }
  phone: string
  email: string

  // TPS specifics
  filing_path: 'initial' | 're_registration' | 'pending_auto_extended' | 'late_initial' | 'ead_only'
  prior_tps_receipt_numbers?: string[]
  has_prior_tps_denial: boolean

  // EAD (I-765) bundling
  wants_ead: boolean
  ead_category: 'A12' | 'C19' | null   // A12 = initial TPS, C19 = re-registration TPS
  prior_ead_card_number?: string

  // Fee waiver (I-912)
  wants_fee_waiver: boolean
  fee_waiver_basis?: 'means_tested' | 'household_income' | 'financial_hardship'

  // Risk flags / manual review triggers
  risk_arrest_or_criminal_record: boolean
  risk_prior_denial: boolean
  risk_left_us_without_advance_parole: boolean
  risk_inconsistent_dates: boolean   // computed by QA agent

  // Output selection
  selected_outputs: Array<'i821' | 'i765' | 'i912'>
}
```

---

## 4. Mapping: TPSAnswers → USCIS form fields

Each row links one wizard answer to one or more PDF field names. The actual
field names below are placeholders patterned on what's in
`field_inventory_*.json`. The next cycle picks the exact names per page/part.

### 4.1 Form I-821 (Application for Temporary Protected Status)

| TPSAnswers key                | I-821 part | Field name pattern                              | Type     | Notes |
|-------------------------------|------------|--------------------------------------------------|----------|-------|
| filing_path                   | Pt 1       | `Pt1_TypeOfApplication_Initial[0]` / `..._Reregistration[0]` | radio | Initial vs re-registration |
| family_name                   | Pt 1       | `Pt1Line1a_FamilyName[0]`                        | text     |       |
| given_name                    | Pt 1       | `Pt1Line1b_GivenName[0]`                         | text     |       |
| middle_name                   | Pt 1       | `Pt1Line1c_MiddleName[0]`                        | text     | optional |
| other_names                   | Pt 1       | `Pt1Line2_OtherNames[0..n]`                      | text[]   | multi  |
| a_number                      | Pt 1       | `Pt1Line5_ANumber[0]`                            | text     |       |
| uscis_online_account          | Pt 1       | `Pt1Line6_OnlineAccount[0]`                      | text     |       |
| dob                           | Pt 1       | `Pt1Line7_DOB[0]`                                | date     | mm/dd/yyyy |
| country_of_birth              | Pt 1       | `Pt1Line8_CountryOfBirth[0]`                     | text     |       |
| country_of_nationality        | Pt 1       | `Pt1Line9_CountryOfNationality[0]`               | text     |       |
| sex                           | Pt 1       | `Pt1Line10_Sex_Male[0]` / `..._Female[0]`        | radio    |       |
| us_address_*                  | Pt 2       | `Pt2Line11_*[0]`                                 | text     |       |
| phone                         | Pt 2       | `Pt2Line13a_DaytimePhone[0]`                     | text     |       |
| email                         | Pt 2       | `Pt2Line15_Email[0]`                             | text     |       |
| last_entry_date               | Pt 3       | `Pt3Line2_LastEntryDate[0]`                      | date     |       |
| i94_admission_number          | Pt 3       | `Pt3Line3_I94Number[0]`                          | text     |       |
| i94_class_of_admission        | Pt 3       | `Pt3Line4_ClassOfAdmission[0]`                   | text     |       |
| passport_number               | Pt 3       | `Pt3Line6_PassportNumber[0]`                     | text     |       |
| passport_country              | Pt 3       | `Pt3Line6_PassportCountry[0]`                    | text     |       |
| passport_expiry               | Pt 3       | `Pt3Line6_PassportExpiry[0]`                     | date     |       |
| prior_tps_receipt_numbers     | Pt 4       | `Pt4_ReceiptNumber[0..n]`                        | text[]   | re-reg only |
| risk_arrest_or_criminal_record| Pt 5/6     | `Pt5Line*_Yes[0]` / `_No[0]`                     | radio    | each Yes triggers manual_review |
| signature                     | Pt 7       | `Pt7Line1_ApplicantSignature[0]`                 | sig      | left blank — user signs |

### 4.2 Form I-765 (Application for Employment Authorization)

Critical: `ead_category` decides everything downstream. For TPS:
- `A12` → initial TPS applicant (TPS grant pending or first-time)
- `C19` → re-registration TPS applicant (already have TPS)

| TPSAnswers key             | I-765 part | Field name pattern                            | Type   | Notes |
|----------------------------|------------|------------------------------------------------|--------|-------|
| application_reason         | Pt 1       | `Pt1_InitialPermission[0]` / `_Renewal[0]` / `_Replacement[0]` | radio | initial vs renewal |
| family_name                | Pt 2       | `Pt2Line1a_FamilyName[0]`                      | text   |       |
| given_name                 | Pt 2       | `Pt2Line1b_GivenName[0]`                       | text   |       |
| other_names                | Pt 2       | `Pt2Line2_OtherNames[0..n]`                    | text[] |       |
| us_address_*               | Pt 2       | `Pt2Line5_*[0]`                                | text   |       |
| mailing_address_*          | Pt 2       | `Pt2Line6_*[0]`                                | text   |       |
| country_of_nationality     | Pt 2       | `Pt2Line8_CountryOfCitizenship[0]`             | text   |       |
| country_of_birth           | Pt 2       | `Pt2Line9_CountryOfBirth[0]`                   | text   |       |
| dob                        | Pt 2       | `Pt2Line10_DOB[0]`                             | date   |       |
| sex                        | Pt 2       | `Pt2Line11_Sex_*[0]`                           | radio  |       |
| a_number                   | Pt 2       | `Pt2Line14_ANumber[0]`                         | text   |       |
| uscis_online_account       | Pt 2       | `Pt2Line15_OnlineAccount[0]`                   | text   |       |
| last_entry_date            | Pt 2       | `Pt2Line22_DateOfLastEntry[0]`                 | date   |       |
| i94_admission_number       | Pt 2       | `Pt2Line23_I94Number[0]`                       | text   |       |
| i94_class_of_admission     | Pt 2       | `Pt2Line24_StatusAtLastEntry[0]`               | text   |       |
| current_immigration_status | Pt 2       | `Pt2Line25_CurrentStatus[0]`                   | text   |       |
| **ead_category**           | Pt 2       | `Pt2Line27_EligibilityCategory[0]`             | text   | **'a' then '12' OR 'c' then '19'** |
| prior_ead_card_number      | Pt 2       | `Pt2Line29_LastEAD_Number[0]`                  | text   | renewals only |
| signature                  | Pt 3       | `Pt3Line1_ApplicantSignature[0]`               | sig    | user signs |

### 4.3 Form I-912 (Request for Fee Waiver)

I-912 is OPTIONAL — only filed when user requests fee waiver. Note: HR-1
parole fees on I-131 cannot be waived; standard TPS/EAD fees can.

| TPSAnswers key       | I-912 part | Field name pattern                                | Type   | Notes |
|----------------------|------------|----------------------------------------------------|--------|-------|
| fee_waiver_basis     | Pt 1       | `Pt1_MeansTested[0]` / `_HouseholdIncome[0]` / `_FinancialHardship[0]` | radio | exactly one |
| family_name          | Pt 2       | `Pt2Line1a_FamilyName[0]`                          | text   |       |
| given_name           | Pt 2       | `Pt2Line1b_GivenName[0]`                           | text   |       |
| us_address_*         | Pt 2       | `Pt2Line5_*[0]`                                    | text   |       |
| signature            | Pt 9       | `Pt9_ApplicantSignature[0]`                        | sig    |       |

(Parts 3–8 of I-912 are income/expense/asset tables filled from user input,
not OCR'd documents.)

---

## 5. Confidence and review requirements per field

Every prefilled value carries a confidence and a review flag:

| Source                     | Default confidence | User review required? |
|----------------------------|--------------------|-----------------------|
| Passport MRZ (parsed)      | 0.95               | yes (one-tap confirm) |
| Passport visual zone OCR   | 0.80               | yes                   |
| I-94 OCR                   | 0.85               | yes                   |
| Prior EAD OCR              | 0.80               | yes                   |
| User-typed wizard input    | 1.00               | implicit              |
| Inferred (e.g., ead_category from filing_path) | 1.00 | yes (one-tap confirm) |

QA agent (agent 5) gates the whole packet: if **any** field with `review_required=yes`
is unconfirmed, packet cannot be generated. If any field's confidence is below
0.6, the case is routed to Manual Review Queue v1 (existing prod system).

---

## 6. What's NOT in this cycle

- Actual PDF auto-fill code (cycle 4 in `TPS_NEXT_CYCLES_PLAN.yaml`)
- OCR engine (cycle 3)
- Wizard UI wiring (cycle 5)
- I-131 (Re-Parole) mapping — separate document
- I-601 mapping — out of scope until volume justifies

---

## 7. Refresh procedure

When USCIS publishes a new edition of any form:

1. Re-run `scripts/uscis_forms_refresh.sh` (to be created in cycle 1 of next plan).
2. The manifest will mark mismatched form as `mismatch`.
3. Regenerate the affected field inventory: `python3 inventory_fields.py`.
4. Diff field names against the prior inventory; surface deltas in PR.
5. Update this mapping doc only for changed fields.
6. CI gate: forms_manifest.json must have zero `mismatch` entries before deploy.
