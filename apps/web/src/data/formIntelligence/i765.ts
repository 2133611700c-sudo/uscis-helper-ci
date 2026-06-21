export const i765Intelligence = {
  formId: "I-765",
  officialUrl: "https://www.uscis.gov/i-765",
  formPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-765.pdf",
  instructionsPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-765instr.pdf",
  editionDate: "not_confirmed_in_this_pass",
  filingMethod: "category_dependent",
  topics: ["ead", "work-permit", "employment-authorization"],
  extractableFromPassport: ["full_legal_name", "date_of_birth", "country_of_birth", "country_of_citizenship", "passport_number"],
  extractableFromI94: ["i94_number", "class_of_admission"],
  extractableFromEad: ["a_number", "ead_category", "card_number_if_visible"],
  manualFields: ["eligibility_category", "current_address", "mailing_address", "phone", "email", "ssn_questions", "immigration_history"],
  notes: [
    "Use official instructions for category logic.",
    "Do not assume concurrent-filing eligibility without official support."
  ]
} as const;
