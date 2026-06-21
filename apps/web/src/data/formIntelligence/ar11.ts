export const ar11Intelligence = {
  formId: "AR-11",
  officialUrl: "https://www.uscis.gov/ar-11",
  formPdfUrl: "https://www.uscis.gov/sites/default/files/document/forms/ar-11.pdf",
  instructionsPdfUrl: "not_confirmed_in_this_pass_404_seen",
  editionDate: "11/02/22",
  filingMethod: "prefer_uscis_online_change_of_address_tool",
  topics: ["address-change"],
  extractableFromPassport: ["full_legal_name"],
  extractableFromI94: [],
  extractableFromEad: ["a_number_if_visible"],
  manualFields: ["old_address", "new_address", "date_of_move", "uscis_case_context"],
  notes: [
    "USCIS strongly encourages online address change instead of paper AR-11.",
    "Not all populations use the same process."
  ]
} as const;
