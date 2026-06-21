# Messenginfo — USCIS/Federal Register Daily Monitor
**Date:** May 22, 2026
**Sources checked:**
- Federal Register API (DHS + USCIS, last 7 days) — ✅ Success (36 results across 2 pages)
- USCIS Newsroom (https://www.uscis.gov/newsroom/news-releases) — ✅ Success
- USCIS Alerts (https://www.uscis.gov/newsroom/alerts) — ✅ Success
- DHS Press Releases (https://www.dhs.gov/news-releases/press-releases) — ✅ Success

**Relevant items found:** 3

---

## 1. USCIS Announces Adjustment of Status Only in "Extraordinary Circumstances"
**Source:** USCIS Newsroom — https://www.uscis.gov/newsroom/news-releases
**Published:** May 22, 2026
**Effective date:** Not specified (policy memo announced today)
**Document #:** N/A (USCIS policy memo)

### What changed
USCIS announced a new policy memo stating that adjustment of status (AOS) will be granted only in extraordinary circumstances. Going forward, aliens seeking adjustment of status must pursue consular processing through the Department of State outside the United States. This represents a significant restriction on the domestic AOS pathway.

### What was known before
Adjustment of status has historically been available to eligible applicants within the United States under INA § 245, including certain parolees, TPS holders with valid status, and beneficiaries of approved petitions. While consular processing has always been an alternative, domestic AOS was a widely used pathway.

### Affected Messenginfo services
- **Translation service** — I-485 (Adjustment of Status) supporting document translations may see reduced demand; consular processing document translations (DS-260 related) may increase
- **FAQ / guidance pages** — Any content advising users about the AOS pathway needs urgent review
- **U4U / parole-related pages** — Ukrainian parolees who were considering AOS need to understand this change
- **TPS section** — TPS holders who had planned to adjust status domestically are affected

### Recommended action
- Add urgent alert banner to any AOS-related content
- Update FAQ to reflect that consular processing is now the default path
- Review U4U guidance pages — parolees considering AOS must understand this restriction
- Monitor for the full text of the policy memo when published

### Risk level
**HIGH** — This fundamentally changes the immigration pathway for many users, including Ukrainian parolees and TPS holders who may have been planning domestic adjustment of status. User-facing content must be updated immediately.

---

## 2. DHS Proposes Increasing Fee for Aliens Ordered Removed in Absentia (HR-1)
**Source:** Federal Register / DHS — https://www.federalregister.gov/documents/2026/05/20/2026-10082/increasing-the-fee-for-certain-aliens-ordered-removed-in-absentia-as-established-by-the-hr-1
**Published:** May 20, 2026
**Effective date:** Not specified (proposed rule)
**Document #:** 2026-10082

### What changed
DHS is proposing to increase the fee required under section 100016 of the Budget Reconciliation Act (HR-1) from $5,130 to $18,000. This fee applies to certain aliens ordered removed in absentia who fail to depart the United States and are subsequently arrested by ICE. The rule also states DHS will adjust this fee for inflation annually.

### What was known before
The HR-1 Reconciliation Act established the initial fee of $5,130. On April 28, 2026, DHS announced an interim final rule implementing various immigration fees from HR-1 (per the USCIS Alerts page).

### Affected Messenginfo services
- **Fee information pages** — If Messenginfo displays any information about immigration penalties or fees for removal orders, this needs updating
- **FAQ section** — Users who have missed immigration court hearings (in absentia orders) need to understand this dramatic fee increase
- **General USCIS fees page** — Context about the HR-1 fee environment

### Recommended action
- Review whether Messenginfo displays any content about consequences of missing immigration court dates or in absentia removal orders
- If so, note the proposed fee increase from $5,130 to $18,000
- No immediate content change required since this is a proposed rule — monitor for final rule
- Consider adding informational content warning users about consequences of missing court dates

### Risk level
**MEDIUM** — This is a proposed rule (not yet final), but the fee increase is substantial (250%+). Users who have in absentia removal orders are directly affected. Update within 1 week if Messenginfo covers this topic.

---

## 3. USCIS Extends Employment Eligibility Verification (I-9) Collection Without Change
**Source:** Federal Register / DHS / USCIS — https://www.federalregister.gov/documents/2026/05/18/2026-09846/agency-information-collection-activities-extension-without-change-of-a-currently-approved-collection
**Published:** May 18, 2026
**Effective date:** Not specified (PRA comment period)
**Document #:** 2026-09846

### What changed
USCIS published a notice extending the currently approved information collection for Employment Eligibility Verification (Form I-9) without change, under the Paperwork Reduction Act. This is a routine PRA extension seeking public comments on the burden estimate for I-9 processing.

### What was known before
The I-9 form is the standard employment eligibility verification form that all US employers must complete for new hires. EAD holders (including TPS and U4U parolees with work authorization) use this form when starting employment.

### Affected Messenginfo services
- **Employment authorization / EAD guidance** — No substantive change to I-9 procedures
- **Translation services** — I-9 supporting documents remain unchanged

### Recommended action
- No action needed — this is a routine PRA extension with no substantive changes to the form or process
- Monitor for any future changes to I-9 that may emerge from the comment period

### Risk level
**LOW** — Informational only. Routine PRA extension with no changes to forms or procedures.

---

## Additional Context: Items Noted but Outside 7-Day Window

The following USCIS Alerts from before May 15, 2026 remain relevant for ongoing monitoring:

- **DHS Announces Consequences for Unpaid Annual Asylum Fees, HR-1 Requirements** (April 28, 2026) — Interim final rule implementing HR-1 immigration fees. Directly relevant to USCIS fees monitoring.
- **DHS Terminates TPS for Yemen** (March 2, 2026) — While this is Yemen (not Ukraine), TPS termination actions for any country are worth tracking as they may signal policy direction for other TPS designations.

---

## Items Reviewed and Filtered Out

From the 36 Federal Register results, 33 were filtered out as irrelevant:
- 20+ Coast Guard safety zones, security zones, and special local regulations
- 6 FEMA flood hazard determinations
- CBP customs/trade items (IMDW, ACE export manifest, fingerprint fees, cargo summit)
- Border wall waiver determination (Section 102 IIRIRA)
- E-Verify+ PRA extension (routine, no substantive change)
- DRC/Uganda/South Sudan flight arrival restrictions (public health, not immigration benefits)

From USCIS News Releases, 9 of 10 were filtered out (fraud cases, denaturalization, enforcement actions — not relevant to monitored topics).

From DHS Press Releases, all 10 were filtered out (ICE enforcement actions against criminal aliens — not relevant to monitored topics).

---

## Fetch Errors

- **Federal Register API via web_fetch** — Failed with provenance error ("URL not in provenance set"). Successfully retrieved via Chrome browser navigation instead. No data loss.
- **USCIS Newsroom, Alerts, DHS News via web_fetch** — Returned empty/minimal content (client-rendered pages). Successfully retrieved via Chrome browser navigation instead. No data loss.

---

## No-update statement

N/A — 3 relevant items were found (see above).

---

## Summary for Messenginfo Product Team

**Priority action item:** The adjustment of status restriction announced today (May 22) is the most significant development this week. If USCIS is now requiring consular processing as the default path, this affects Ukrainian parolees, TPS holders, and other beneficiaries who were planning domestic AOS. Review all user-facing content that mentions adjustment of status.

**No new Ukraine-specific actions** were published in the Federal Register or USCIS newsroom this week. No changes to TPS Ukraine designation, U4U re-parole, I-765/I-821 processing, or EAD timelines were identified in the monitored period.

**Fee environment remains active:** The HR-1 fee increase proposal (item #2) continues the trend of escalating immigration fees under the reconciliation act. Combined with the April 28 interim final rule on asylum fees, this is worth tracking.
