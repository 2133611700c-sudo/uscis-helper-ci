/**
 * TPS Ukraine — Procedural requirements reference
 * Sources: Federal Register 90 FR 5936 (17 Jan 2025), Federal Register 2026-08333 (H.R.1/OBBBA),
 *          uscis.gov/i-821, uscis.gov/TPS-Ukraine
 * Verified: May 2026
 *
 * This file stores verified regulatory facts used by the wizard, AI brain,
 * and checklist generator. Update only from official USCIS/Federal Register sources.
 */

// ── ELIGIBILITY DATES ────────────────────────────────────────────────────────

/**
 * TPS Ukraine has two continuous-residence cutoff dates depending on which
 * designation period the applicant falls under:
 *
 * Original designation (FR Vol 87 No 33, 2022): in USA since April 11, 2022
 * New/extended designation (90 FR 5936, Jan 17 2025): in USA since August 16, 2023
 *
 * Applicants who already had TPS keep the April 2022 date (re-registration).
 * New applicants (initial) must show continuous residence since August 16, 2023.
 */
export const TPS_UKRAINE_ELIGIBILITY = {
  /** Original designation — applies to re-registration applicants */
  continuous_residence_original: '2022-04-11',
  /** New designation (90 FR 5936) — applies to new initial filers */
  continuous_residence_new: '2023-08-16',
  /** Current TPS designation period end date */
  designation_end: '2026-10-19',
  /** Re-registration period deadline (passed — late filing requires good cause) */
  rereg_deadline: '2025-03-18',
  source: 'Federal Register 90 FR 5936, 17 Jan 2025',
} as const;

// ── FILING TYPES ─────────────────────────────────────────────────────────────

export type TpsFilingType = 'initial' | 'reregistration' | 'late';

export const TPS_FILING_TYPES: Record<TpsFilingType, {
  description: string;
  requires_good_cause: boolean;
  identity_evidence_required: boolean;
  entry_evidence_required: boolean;
  residence_evidence_required: boolean;
}> = {
  initial: {
    description: 'First-time TPS filing for Ukraine',
    requires_good_cause: false,
    identity_evidence_required: true,
    entry_evidence_required: true,
    residence_evidence_required: true,
  },
  reregistration: {
    description: 'Re-registration for existing TPS holders',
    requires_good_cause: false,
    identity_evidence_required: false,
    entry_evidence_required: false,
    residence_evidence_required: false,
  },
  late: {
    description: 'Late filing — missed registration window',
    requires_good_cause: true,
    identity_evidence_required: true,
    entry_evidence_required: true,
    residence_evidence_required: true,
  },
};

// ── FORMS ────────────────────────────────────────────────────────────────────

export const TPS_FORMS = {
  I821: {
    name: 'Application for Temporary Protected Status',
    required: 'always',
    online: true,
    mail: true,
  },
  I765: {
    name: 'Application for Employment Authorization (EAD)',
    required: 'recommended',
    online: true,
    mail: true,
  },
  I765WS: {
    name: 'I-765 Worksheet',
    required: 'if_i765',
    online: true,
    mail: true,
  },
  I131: {
    name: 'Application for Travel Document',
    required: 'optional',
    online: true,   // EXCEPT when filed with I-912
    mail: true,
    note: 'If filed together with I-912 fee waiver — mail only',
  },
  I912: {
    name: 'Request for Fee Waiver',
    required: 'optional',
    online: false,  // NEVER online
    mail: true,
    note: 'Fee waiver = entire packet must be filed by mail. Cannot be filed online.',
  },
} as const;

// ── FEES (May 2026) ──────────────────────────────────────────────────────────

/**
 * Fee schedule as of May 2026.
 * CRITICAL: H.R.1 (OBBBA) fee is NON-WAIVABLE — I-912 does NOT exempt from it.
 * Source: Federal Register 2026-08333 (H.R.1 / One Big Beautiful Bill Act)
 */
export const TPS_FEES = {
  I821_initial: 50,
  I821_reregistration: 0,
  biometrics: 30,
  I765_initial: 470,
  I765_reregistration: 750,
  I131: 630,
  /** H.R.1 (OBBBA) supplemental fee — NON-WAIVABLE, cannot be offset by I-912 */
  OBBBA_supplemental: 500,  // $500-510, check uscis.gov/fees for exact amount
  OBBBA_non_waivable: true,
  source: 'uscis.gov Fee Schedule; Federal Register 2026-08333 (H.R.1)',
} as const;

// ── EAD CATEGORIES ───────────────────────────────────────────────────────────

/**
 * A12 = TPS granted/approved.
 * C19 = TPS application pending.
 * Common mistake: applicants confuse A12 and C19 on re-registration.
 */
export const EAD_CATEGORIES = {
  A12: {
    code: 'A12',
    meaning: 'TPS approved — full work authorization',
    when: 'I-821 approved',
  },
  C19: {
    code: 'C19',
    meaning: 'TPS application pending — temporary work authorization',
    when: 'I-821 filed but not yet decided',
  },
} as const;

// ── SUBMISSION RULES ─────────────────────────────────────────────────────────

export const SUBMISSION_RULES = {
  /** If I-912 fee waiver is included, ALL forms must go by mail in one envelope */
  fee_waiver_forces_mail: true,
  /** Paper filing requires 2 passport-style photos; online does not */
  photos_required_mail_only: true,
  /** Use paper clips, NOT staples — USCIS scanner damages stapled documents */
  use_paper_clips_not_staples: true,
  /** Receipt number available immediately online, 2–4 weeks by mail */
  receipt_number_online_immediate: true,
} as const;

// ── COMMON MISTAKES ──────────────────────────────────────────────────────────

export const COMMON_MISTAKES = [
  {
    mistake: 'Using A12 when application is pending',
    correct: 'Use C19 while pending, A12 only after approval',
  },
  {
    mistake: 'Filing I-912 online',
    correct: 'I-912 is mail-only; filing online is technically impossible',
  },
  {
    mistake: 'Poor translation quality',
    consequence: 'USCIS sends RFE (Request for Evidence), delays by months',
    correct: 'Certified translation with full translator competency statement',
  },
  {
    mistake: 'Re-registration with full initial evidence package',
    correct: 'Re-reg only needs I-821 + copy of last TPS document (EAD/I-797/I-94)',
  },
  {
    mistake: 'Using stapler on paper filing',
    consequence: 'USCIS scanner can damage or misread stapled documents',
    correct: 'Use paper clips only',
  },
  {
    mistake: 'Waiting for EAD auto-extension without filing new application',
    consequence: 'Gap in work authorization, problems with employer',
    correct: 'File I-765 together with I-821',
  },
] as const;
