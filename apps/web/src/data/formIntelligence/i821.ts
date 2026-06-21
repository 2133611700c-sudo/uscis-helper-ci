export const i821Intelligence = {
  formId: "I-821",
  officialUrl: "https://www.uscis.gov/i-821",
  formPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-821.pdf",
  instructionsPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/i-821instr.pdf",
  editionDate: "01/20/25",
  filingMethod: "online_or_paper_per_tps_guidance",
  topics: ["tps", "temporary-protected-status"],
  extractableFromPassport: ["full_legal_name", "date_of_birth", "country_of_birth", "country_of_citizenship", "passport_number"],
  extractableFromI94: ["i94_number", "class_of_admission"],
  extractableFromEad: ["a_number_if_visible"],
  manualFields: ["us_mailing_address", "contact_information", "criminal_history_disclosures", "tps_eligibility_facts", "waiver_related_answers"],
  notes: [
    "Official page says users may file I-765 with I-821 when requesting an EAD.",
    "Official page highlights reject-prone required sections."
  ]
} as const;
