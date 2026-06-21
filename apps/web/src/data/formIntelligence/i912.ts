export const i912Intelligence = {
  formId: "I-912",
  officialUrl: "https://www.uscis.gov/i-912",
  formPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-912.pdf",
  instructionsPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-912instr.pdf",
  editionDate: "not_confirmed_in_this_pass",
  filingMethod: "submit_with_eligible_form_or_fee_waiver_request",
  topics: ["fee-waiver"],
  extractableFromPassport: ["full_legal_name", "date_of_birth"],
  extractableFromI94: [],
  extractableFromEad: [],
  manualFields: ["household_size", "income", "means_tested_benefits", "financial_hardship_explanation", "mailing_address", "signature"],
  notes: [
    "Financial evidence is sensitive.",
    "Use official instructions before exposing any automated fee-waiver flow."
  ]
} as const;
