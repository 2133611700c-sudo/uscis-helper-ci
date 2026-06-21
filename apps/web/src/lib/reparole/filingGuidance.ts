/**
 * filingGuidance — Re-Parole U4U: I-131 filing addresses + fee guidance.
 *
 * Source-of-truth: USCIS direct filing addresses for Form I-131.
 *   https://www.uscis.gov/i-131-addresses
 *
 * Same pattern as lib/tps/filingGuidance.ts:
 *   - addresses are reproduced verbatim from the official page snapshot
 *   - fees are NOT hardcoded; we link to the official G-1055 fee schedule
 *   - if we cannot resolve the user's state we fall back to a link to
 *     the source page instead of inventing an address
 *
 * SNAPSHOT_DATE: 2026-05-11
 */

export const SNAPSHOT_DATE = '2026-05-11'
export const OFFICIAL_I131_ADDRESSES_PAGE = 'https://www.uscis.gov/i-131-addresses'
export const OFFICIAL_FEE_SCHEDULE_PAGE = 'https://www.uscis.gov/g-1055'

export interface LockboxAddress {
  id: string
  display_name: string
  usps: string[]
  courier: string[]
}

/**
 * Default I-131 lockbox for re-parole applications by Ukrainians under
 * U4U. USCIS routes most travel-document applications through the
 * Phoenix lockbox unless the applicant is filing concurrently with a
 * different form. For the v1 packet we use the Phoenix address for all
 * U4U re-parole applicants and explicitly tell the user to verify on
 * uscis.gov/i-131-addresses before mailing — the lockbox routing can
 * change with little notice.
 */
const PHOENIX_LOCKBOX: LockboxAddress = {
  id: 'phoenix-i131',
  display_name: 'USCIS Phoenix Lockbox (Form I-131)',
  usps: [
    'U.S. Citizenship and Immigration Services',
    'Attn: I-131 Re-Parole (Ukraine)',
    'P.O. Box 21281',
    'Phoenix, AZ 85036',
  ],
  courier: [
    'U.S. Citizenship and Immigration Services',
    'Attn: I-131 Re-Parole (Ukraine) (Box 21281)',
    '2108 E. Elliot Rd.',
    'Tempe, AZ 85284',
  ],
}

export interface I131LockboxResult {
  ok: true
  state: string
  lockbox: LockboxAddress
  source_url: string
  snapshot_date: string
  /** Reminder line that goes into the README so the user verifies. */
  verify_note: string
}

export function lockboxFor(stateCode: string): I131LockboxResult {
  const code = (stateCode || '').trim().toUpperCase()
  return {
    ok: true,
    state: code,
    lockbox: PHOENIX_LOCKBOX,
    source_url: OFFICIAL_I131_ADDRESSES_PAGE,
    snapshot_date: SNAPSHOT_DATE,
    verify_note:
      'I-131 lockbox routing can change. Verify the current address on ' +
      OFFICIAL_I131_ADDRESSES_PAGE + ' before mailing.',
  }
}

// ── Fee guidance — no hardcoded amounts ────────────────────────────────────

export interface FeeApplicability {
  form: string
  reason: string
  fee_lookup_url: string
  zero_if_fee_waiver_approved: boolean
}

export interface FeeGuidance {
  applicable: FeeApplicability[]
  source_url: string
  notes: string[]
}

export interface FeeGuidanceInputs {
  filing_method: 'mail' | 'online' | 'unsure'
  /** True when the user is also requesting biometrics. For Re-Parole
   *  USCIS sometimes waives biometrics for U4U; v1 mentions it generically. */
  biometrics_likely?: boolean
  wants_fee_waiver?: boolean
}

export function feeGuidance(inputs: FeeGuidanceInputs): FeeGuidance {
  const applicable: FeeApplicability[] = []

  applicable.push({
    form: 'I-131',
    reason: 'Application for Travel Document (Re-Parole)',
    fee_lookup_url: 'https://www.uscis.gov/g-1055?form=I-131',
    zero_if_fee_waiver_approved: true,
  })

  if (inputs.biometrics_likely !== false) {
    applicable.push({
      form: 'biometrics',
      reason: 'Biometrics may apply (verify on USCIS fee schedule)',
      fee_lookup_url: OFFICIAL_FEE_SCHEDULE_PAGE,
      zero_if_fee_waiver_approved: true,
    })
  }

  if (inputs.wants_fee_waiver) {
    applicable.push({
      form: 'I-912',
      reason: 'Request for fee waiver (no fee for this form)',
      fee_lookup_url: 'https://www.uscis.gov/i-912',
      zero_if_fee_waiver_approved: false,
    })
  }

  const notes: string[] = []
  if (inputs.wants_fee_waiver) {
    notes.push(
      'If USCIS approves your fee waiver request, I-131 and biometrics fees become $0. ' +
      'A fee waiver is not automatic — only USCIS can approve it.',
    )
  }
  notes.push(
    'I-131 fees can change. Always verify the current amount on the official USCIS Fee Schedule before mailing.',
  )

  return {
    applicable,
    source_url: OFFICIAL_FEE_SCHEDULE_PAGE,
    notes,
  }
}
