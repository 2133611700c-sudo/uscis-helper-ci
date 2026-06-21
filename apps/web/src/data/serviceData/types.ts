/**
 * Service-level data types for verified USCIS service info.
 *
 * Per BUG-002: kept separate from formIntelligence/* (which is form-level
 * snapshot data). These types describe what user-facing content needs.
 */

export interface ServiceFormInfo {
  id: string
  edition: string
  item_for_u4u: string
  item_label: string
  top_of_form_text?: string
}

export interface ServiceEadInfo {
  form: string
  category: string
  part: string
}

export interface ServiceFilingInfo {
  window_days?: number
  window_description?: string
  methods: ('online' | 'mail')[]
  online_url: string
  addresses_url: string
  processing_times_url: string
}

export interface ServiceFeesInfo {
  calculator_url: string
  schedule_url: string
  fee_waiver_url?: string
  note_key: string
}

export interface ServiceSource {
  label: string
  url: string
  last_verified: string
}

export interface ServiceFilingMethod {
  formPart?: string
  handwrite?: string
  handwritePosition?: string
  feeWaiverAllowed: boolean
  feeWaiverNoteKey?: string
  portal?: string
  applicationCategory?: string
  userDropdown?: string
  reParoleAnswer?: string
  sourceNote: string
}

export interface ServiceFilingMethods {
  paper: ServiceFilingMethod
  online: ServiceFilingMethod
}

export interface ServiceVerifiedSource {
  id: string
  label: string
  url: string
  uscisLastReviewed: string
  messenginfoVerified: string
}

export interface MsLSettlementData {
  filingPaper: { handwrite: string; alternateHandwrite: string; position: string }
  filingOnline: { applicationCategory: string; note: string }
  hr1FeesExempt: boolean
  exemptSince: string
  verifyEligibilityUrl: string
  verifyEligibilityUrlEs: string
  note: string
  sourceUrl: string
  sourceNote: string
}

export interface FeeArchitectureData {
  dhsBaseFee: { noteKey: string; feeCalculatorUrl: string; feeScheduleUrl: string; feeWaiverEligible: boolean; feeWaiverForm: string; feeWaiverRequiresPaper: boolean }
  hr1ParoleGrantFee: { noteKey: string; chargedAfterApproval: boolean; chargedAtFiling: boolean; feeWaiverEligible: boolean; msLExempt: boolean; msLExemptSince: string; sourceUrl: string }
  hr1EadRenewal: { noteKey: string; feeWaiverEligible: boolean; msLExempt: boolean; canRequestViaI131Part9: boolean; sourceUrl: string }
  paperPayment: { noteKey: string; checksProhibitedSince: string; allowedMethods: string[]; exemptionForm: string; exemptionEdition: string; sourceUrl: string }
}

export interface EadSequenceData {
  warningKey: string
  correctSequence: string[]
  sourceNote: string
}

export interface ChecklistItem {
  id: string
  titleKey: string
  descKey: string
  recommended?: boolean
  required?: boolean
  conditional?: boolean
  showIf?: string
  url?: string
}

export interface MedicalAttestationData {
  location: string
  paperAccountNote: string
  noteKey: string
  sourceNote: string
}

export interface ServiceData {
  slug: string
  full_data: boolean
  verification_status: 'verified' | 'partial' | 'unverified'
  verified_at: string
  form: ServiceFormInfo
  ead?: ServiceEadInfo
  filing: ServiceFilingInfo
  fees: ServiceFeesInfo
  sources: ServiceSource[]
  filingMethods?: ServiceFilingMethods
  verifiedSources?: ServiceVerifiedSource[]
  messenginfoVerifiedOn?: string
  msLSettlement?: MsLSettlementData
  feeArchitecture?: FeeArchitectureData
  eadSequence?: EadSequenceData
  paperFilingChecklist?: ChecklistItem[]
  medicalAttestation?: MedicalAttestationData
  // Optional message keys for status/notice banners
  statusWarningKey?: string
  feeNoticeKey?: string
  processingWarningKey?: string
  medicalNoteKey?: string
  eadWarningKey?: string
  feeWaiverNoteKey?: string
}
