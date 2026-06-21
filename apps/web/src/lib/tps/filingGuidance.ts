/**
 * filingGuidance — official USCIS-sourced filing addresses + fee guidance.
 *
 * Source-of-truth contract (per official_source_rule):
 *   - LOCKBOX addresses are extracted verbatim from the USCIS TPS Ukraine
 *     country page (https://www.uscis.gov/humanitarian/temporary-protected-
 *     status/TPS-Ukraine) as of the SNAPSHOT_DATE below. They are reproduced
 *     here only because the address is THE actionable piece of information
 *     a user needs after they print their forms — and forcing them to dig
 *     through a PDF Instructions for the address is the exact failure mode
 *     audit #2 flagged. Each address ships with a link back to the source.
 *   - FEE amounts are NOT hardcoded. The USCIS fee schedule (G-1055) is the
 *     authoritative source and is rendered dynamically by uscis.gov via a
 *     JS-loaded API. We instead enumerate WHICH fees apply for the user's
 *     scenario and link to the official calculator. The README and the UI
 *     surface these links so the user can verify the current dollar amount
 *     themselves.
 *
 * SNAPSHOT_DATE: 2026-05-10 (curl with Chrome UA, raw HTML saved to
 *   docs/uscis/sources/2026-05-10/tps-ukraine.html)
 *
 * Re-snapshot cadence: at minimum on every Federal Register notice
 * extending or re-designating TPS Ukraine, and whenever the user reports
 * a stale address.
 */

export const SNAPSHOT_DATE = '2026-05-12'
/**
 * H.R.1 FEE RULE (effective 2026-05-29, doc 2026-08333, 91 FR 22952):
 * The following fees are mandated by H.R.1 and CANNOT be waived or reduced
 * via Form I-912 or any other USCIS fee-waiver mechanism:
 *   • H.R.1 TPS employment authorization fee
 *   • Asylum application filing fee ($100 minimum)
 *   • Annual Asylum Fee ($100/year per pending application)
 *   • Form I-94 fee ($24)
 * Standard USCIS base fees (I-821, biometrics, I-765) remain waivable via I-912.
 * Source snapshot: USCIS_RULE_SNAPSHOT_2026-05-12.report.yaml
 */
export const HR1_FEE_RULE_EFFECTIVE = '2026-05-29'
export const HR1_FEE_RULE_DOC = '2026-08333'
export const OFFICIAL_TPS_UKRAINE_PAGE =
  'https://www.uscis.gov/humanitarian/temporary-protected-status/TPS-Ukraine'
export const OFFICIAL_FEE_SCHEDULE_PAGE = 'https://www.uscis.gov/g-1055'

// ── Lockbox addresses ───────────────────────────────────────────────────────

/**
 * The two TPS Ukraine lockboxes, as posted on the official country page.
 * Each lockbox has a USPS variant and a private-courier (FedEx/UPS/DHL)
 * variant — they are NOT interchangeable because the courier address is
 * a street address (USPS won't deliver large packages there reliably).
 */
export interface LockboxAddress {
  id: 'chicago' | 'phoenix'
  display_name: string
  usps: string[]      // multi-line address — render as-is
  courier: string[]   // multi-line address for FedEx/UPS/DHL
}

const CHICAGO: LockboxAddress = {
  id: 'chicago',
  display_name: 'USCIS Chicago Lockbox',
  usps: [
    'U.S. Citizenship and Immigration Services',
    'Attn: TPS Ukraine',
    'P.O. Box 4464',
    'Chicago, IL 60680-4464',
  ],
  courier: [
    'U.S. Citizenship and Immigration Services',
    'Attn: TPS Ukraine (Box 4464)',
    '131 S. Dearborn St., 3rd Floor',
    'Chicago, IL 60603-5517',
  ],
}

const PHOENIX: LockboxAddress = {
  id: 'phoenix',
  display_name: 'USCIS Phoenix Lockbox',
  usps: [
    'U.S. Citizenship and Immigration Services',
    'Attn: TPS Ukraine',
    'P.O. Box 24047',
    'Phoenix, AZ 85074-4047',
  ],
  courier: [
    'U.S. Citizenship and Immigration Services',
    'Attn: TPS Ukraine (Box 24047)',
    '2108 E. Elliot Rd.',
    'Tempe, AZ 85284-1806',
  ],
}

/**
 * State-of-residence → lockbox mapping for TPS Ukraine paper filings.
 * Verbatim from https://www.uscis.gov/humanitarian/temporary-protected-
 * status/TPS-Ukraine (snapshot 2026-05-10).
 */
const STATE_TO_LOCKBOX: Record<string, 'chicago' | 'phoenix'> = {
  // Chicago lockbox states
  AL: 'chicago', AK: 'chicago', AS: 'chicago', AZ: 'chicago', AR: 'chicago',
  CO: 'chicago', CT: 'chicago', DE: 'chicago', DC: 'chicago', FL: 'chicago',
  GA: 'chicago', GU: 'chicago', HI: 'chicago', ID: 'chicago', IL: 'chicago',
  IN: 'chicago', IA: 'chicago', KS: 'chicago', KY: 'chicago', LA: 'chicago',
  ME: 'chicago', MD: 'chicago', MA: 'chicago', NY: 'chicago', OH: 'chicago',
  // Phoenix lockbox states
  CA: 'phoenix', MI: 'phoenix', MN: 'phoenix', MS: 'phoenix', MO: 'phoenix',
  MT: 'phoenix', NE: 'phoenix', NV: 'phoenix', NH: 'phoenix', NJ: 'phoenix',
  NM: 'phoenix', NC: 'phoenix', ND: 'phoenix', MP: 'phoenix', OK: 'phoenix',
  OR: 'phoenix', PA: 'phoenix', PR: 'phoenix', RI: 'phoenix', SC: 'phoenix',
  SD: 'phoenix', TN: 'phoenix', TX: 'phoenix', UT: 'phoenix', VT: 'phoenix',
  VI: 'phoenix', VA: 'phoenix', WA: 'phoenix', WV: 'phoenix', WI: 'phoenix',
  WY: 'phoenix',
}

export interface LockboxLookupResult {
  ok: true
  state: string
  lockbox: LockboxAddress
  source_url: string
  snapshot_date: string
}

export interface LockboxLookupUnknown {
  ok: false
  reason: 'unknown_state'
  state: string
  source_url: string
  snapshot_date: string
}

/**
 * Look up the lockbox for a US state of residence. Accepts the 2-letter
 * state code (CA, NY, TX, …). Returns either the matched lockbox or an
 * `unknown_state` shape — never invents an address.
 */
export function lockboxFor(stateCode: string): LockboxLookupResult | LockboxLookupUnknown {
  const code = (stateCode || '').trim().toUpperCase()
  const id = STATE_TO_LOCKBOX[code]
  if (!id) {
    return {
      ok: false,
      reason: 'unknown_state',
      state: code,
      source_url: OFFICIAL_TPS_UKRAINE_PAGE,
      snapshot_date: SNAPSHOT_DATE,
    }
  }
  return {
    ok: true,
    state: code,
    lockbox: id === 'chicago' ? CHICAGO : PHOENIX,
    source_url: OFFICIAL_TPS_UKRAINE_PAGE,
    snapshot_date: SNAPSHOT_DATE,
  }
}

// ── Fee guidance (NO hardcoded dollar amounts) ──────────────────────────────

export interface FeeApplicability {
  form: string                      // e.g. 'I-821'
  reason: string                    // why this form applies in plain English
  fee_lookup_url: string            // USCIS fee schedule deep-link
  zero_if_fee_waiver_approved: boolean
}

export interface FeeGuidance {
  applicable: FeeApplicability[]
  fee_waiver_requested: boolean
  source_url: string
  notes: string[]
}

export interface FeeGuidanceInputs {
  filing_path: 'initial' | 're_registration' | 'unknown' | 'unselected'
  wants_ead: boolean
  wants_fee_waiver: boolean
  /** Age may affect biometrics fee on initial filings. Optional — when
   *  unknown we mention biometrics generically rather than guessing. */
  age?: number | null
}

/**
 * Enumerate the USCIS forms whose government fees apply to this scenario.
 * Returns links to the official fee schedule for each — does NOT return
 * dollar amounts (those move; verify on uscis.gov).
 */
export function feeGuidance(inputs: FeeGuidanceInputs): FeeGuidance {
  const applicable: FeeApplicability[] = []

  // I-821 — applies for both initial and re-registration. The amount is
  // different but we don't show the dollar number here; we tell the user
  // which row of the fee schedule to look at.
  applicable.push({
    form: 'I-821',
    reason:
      inputs.filing_path === 're_registration'
        ? 'TPS re-registration application'
        : 'TPS application',
    fee_lookup_url: 'https://www.uscis.gov/g-1055?form=I-821',
    zero_if_fee_waiver_approved: true,
  })

  // Biometrics — typically applies to applicants aged 14 and older.
  // Without a known age we mention it generically. Initial filings always
  // require biometrics; re-registration sometimes does and sometimes not
  // depending on USCIS practice that year — verify on the country page.
  const ageKnown = typeof inputs.age === 'number'
  const biometricsApplies = !ageKnown || inputs.age! >= 14
  if (biometricsApplies) {
    applicable.push({
      form: 'biometrics',
      reason:
        ageKnown
          ? `Biometrics (age ${inputs.age!}, 14 or older)`
          : 'Biometrics may apply (age 14+ generally)',
      fee_lookup_url: 'https://www.uscis.gov/g-1055',
      zero_if_fee_waiver_approved: true,
    })
  }

  // I-765 — only if user wants a TPS-based EAD.
  if (inputs.wants_ead) {
    applicable.push({
      form: 'I-765',
      reason: 'Work permit (Employment Authorization Document)',
      fee_lookup_url: 'https://www.uscis.gov/g-1055?form=I-765',
      zero_if_fee_waiver_approved: true,
    })
  }

  // I-912 — only when fee waiver requested. The form itself has no fee.
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
      'If USCIS approves your fee waiver request (I-912), the standard I-821, biometrics, and I-765 ' +
      'base fees become $0. A fee waiver is not automatic — only USCIS can approve it.',
    )
    notes.push(
      'H.R.1 ALERT (effective 2026-05-29, doc 2026-08333): Fees mandated by H.R.1 (TPS employment ' +
      'authorization fee, I-94 fee, asylum fees) CANNOT be waived or reduced via I-912 — they are ' +
      'non-waivable by statute. Verify which fees apply to your case on uscis.gov/feecalculator.',
    )
  }
  notes.push(
    'The exact dollar amounts can change. Always verify the current fee on the official USCIS Fee Schedule (G-1055) ' +
    'before mailing: https://www.uscis.gov/g-1055',
  )
  notes.push(
    'EAD VALIDITY RULE (H.R.1, effective 2026-05-29): TPS-based EADs issued or renewed on or after ' +
    '2026-05-29 are valid for 1 year (or remaining TPS period, whichever is shorter). ' +
    'Verify current EAD validity rules on the official USCIS TPS Ukraine page.',
  )

  return {
    applicable,
    fee_waiver_requested: inputs.wants_fee_waiver,
    source_url: OFFICIAL_FEE_SCHEDULE_PAGE,
    notes,
  }
}
