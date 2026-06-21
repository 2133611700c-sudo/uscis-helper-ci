export const i589Intelligence = {
  formId: "I-589",
  officialUrl: "https://www.uscis.gov/i-589",
  formPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-589.pdf",
  instructionsPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-589instr.pdf",
  editionDate: "not_confirmed_in_this_pass",
  filingMethod: "case_context_dependent",
  topics: ["asylum", "withholding-of-removal"],
  extractableFromPassport: ["full_legal_name", "date_of_birth", "country_of_birth", "country_of_citizenship", "passport_number"],
  extractableFromI94: ["i94_number", "last_arrival_details_if_visible"],
  extractableFromEad: ["a_number_if_visible"],
  manualFields: ["asylum_claim_narrative", "family_information", "address_history", "travel_history", "interpreter_information", "immigration_history", "criminal_history_if_any"],
  notes: [
    "High-risk form. Do not position this as legal strategy automation.",
    "Mark unsupported fields as not confirmed."
  ]
} as const;
