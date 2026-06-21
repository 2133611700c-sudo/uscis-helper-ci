# Messenginfo — USCIS/Federal Register Daily Monitor
**Date:** 2026-05-24 (Saturday)
**Sources checked:**
- Federal Register API (DHS + USCIS, ≥2026-05-17): ✅ Success (33 results, 2 pages)
- USCIS Newsroom News Releases (https://www.uscis.gov/newsroom/news-releases): ✅ Success (via Chrome)
- USCIS Alerts (https://www.uscis.gov/newsroom/alerts): ✅ Success (via Chrome)
- DHS Press Releases (https://www.dhs.gov/news-releases/press-releases): ✅ Success (via Chrome)

**Relevant items found:** 4

---

## 1. USCIS Will Grant Adjustment of Status Only in Extraordinary Circumstances
**Source:** USCIS News Release — https://www.uscis.gov/newsroom/news-releases
**Published:** 2026-05-22
**Effective date:** Not specified (policy memo)
**Document #:** N/A (USCIS policy memo)

### What changed
USCIS announced a new policy memo stating that aliens seeking adjustment of status must do so through consular processing via the Department of State outside the country. In-country adjustment of status will be granted only in extraordinary circumstances. This effectively shifts the default pathway from domestic AOS filing to consular processing abroad.

### What was known before
Adjustment of status (I-485) has historically been available for eligible applicants to change status within the US without departing. While consular processing was always an alternative pathway, in-country AOS was widely used by TPS holders, parolees, and others with lawful presence.

### Affected Messenginfo services
- TPS section — users who planned to adjust status domestically may need updated guidance
- FAQ — adjustment of status section needs review
- User-facing copy about the I-485 pathway
- Translation services for documents supporting consular processing may see increased demand

### Recommended action
- Add alert banner to any AOS-related pages noting the policy shift
- Update FAQ to reflect that consular processing is now the default path
- Review whether any TPS or U4U guidance references in-country AOS as a future option
- Monitor for full policy memo text to determine exact scope of "extraordinary circumstances"

### Risk level
**HIGH** — Directly affects user workflow and immigration strategy for Messenginfo users. Update immediately.

---

## 2. Increasing the Fee for Certain Aliens Ordered Removed in Absentia (HR-1 Reconciliation Bill)
**Source:** Federal Register (DHS) — https://www.federalregister.gov/documents/2026/05/20/2026-10082/increasing-the-fee-for-certain-aliens-ordered-removed-in-absentia-as-established-by-the-hr-1
**Published:** 2026-05-20
**Effective date:** Not specified (proposed rule)
**Document #:** 2026-10082

### What changed
DHS is proposing to increase the fee required under Section 100016 of the Budget Reconciliation Act (HR-1) for aliens ordered removed in absentia who fail to depart and are subsequently arrested by ICE. The proposed fee increase is from $5,130 to $18,000. DHS also states it will adjust this fee annually for inflation.

### What was known before
The HR-1 Reconciliation Act established a $5,130 fee for this category. On April 28, 2026, DHS announced an interim final rule implementing various HR-1 immigration fee requirements.

### Affected Messenginfo services
- FAQ — section on immigration court proceedings and consequences of missing hearings
- User guidance about the importance of attending all immigration court dates
- Pricing/fee information pages if they reference removal-related fees

### Recommended action
- Update any user-facing content that references consequences of missing immigration court dates
- If fee tables exist, note this proposed increase (not yet final)
- No immediate product change needed — this is a proposed rule, monitor for final rule

### Risk level
**MEDIUM** — Important context for users about consequences of missed hearings. Not a form-filing impact, but users should be aware. Update within 1 week.

---

## 3. Fee for Fingerprints Collected by CBP
**Source:** Federal Register (DHS/CBP) — https://www.federalregister.gov/documents/2026/05/18/2026-09879/fee-for-fingerprints-collected-by-cbp
**Published:** 2026-05-18
**Effective date:** Not specified
**Document #:** 2026-09879

### What changed
CBP announced it will begin collecting a fee for fingerprints taken from applicants seeking unescorted access to CBP security areas at airports. The fee covers the FBI user fee for fingerprint checks plus a CBP administrative processing fee. This applies to paper applicants and eBadge applicants whose fingerprints from TSA are unreadable.

### What was known before
No prior fee was publicly announced for this specific fingerprint collection scenario.

### Affected Messenginfo services
- No direct Messenginfo service impact identified. This applies to airport security area access applicants, not immigration benefit applicants.

### Recommended action
- No action needed — this is specific to CBP airport security access, not general immigration biometrics (e.g., ASC appointments for I-765/I-821 filers).

### Risk level
**LOW** — Informational only. Does not affect immigration benefit applicants or Messenginfo users.

---

## 4. USCIS Information Collection Extension: Employment Eligibility Verification (I-9) and E-Verify+
**Source:** Federal Register (DHS/USCIS) — https://www.federalregister.gov/documents/2026/05/18/2026-09846/agency-information-collection-activities-extension-without-change-of-a-currently-approved-collection and https://www.federalregister.gov/documents/2026/05/18/2026-09845/agency-information-collection-activities-extension-without-change-of-a-currently-approved-collection
**Published:** 2026-05-18
**Effective date:** Not specified (comment period)
**Document #:** 2026-09846 (I-9) / 2026-09845 (E-Verify+)

### What changed
USCIS published two Federal Register notices seeking public comment on extending (without change) the currently approved information collections for the Employment Eligibility Verification form (I-9) and E-Verify+. These are standard Paperwork Reduction Act renewals — no substantive changes to the forms or processes are proposed.

### What was known before
The I-9 and E-Verify systems have been operational. These are routine PRA extension notices.

### Affected Messenginfo services
- No direct Messenginfo service impact identified. The I-9 is an employer form, not filed by immigration benefit applicants.

### Recommended action
- No action needed — routine PRA extension, no changes to forms or processes.

### Risk level
**LOW** — Informational, no user-facing impact.

---

## Notable items from USCIS Alerts (outside 7-day window but contextually relevant)

**DHS Announces Consequences for Unpaid Annual Asylum Fees, Unveils New H.R. 1 Requirements** (April 28, 2026) — The HR-1 interim final rule implementing new immigration fees. This is the parent action for Federal Register item #2 above. Previously reported.

**DHS Terminates TPS for Yemen** (March 2, 2026) — Pattern of TPS terminations continues. Ukraine TPS not mentioned in any new action this week.

---

## Fetch Errors
No fetch errors. All four sources were successfully accessed (Federal Register via bash/curl, USCIS and DHS pages via Chrome browser tools).

Note: Initial web_fetch attempts for USCIS/DHS pages returned empty content (client-rendered pages requiring JavaScript), so Chrome browser tools were used as fallback. Federal Register API was fetched via bash curl due to URL provenance restrictions on web_fetch.

---

## Summary Assessment

The most significant item this week is the **USCIS policy memo restricting adjustment of status to extraordinary circumstances** (May 22). This is a HIGH-priority item that could directly affect Messenginfo users who are TPS holders or parolees considering future adjustment of status. The shift to consular processing as the default pathway is a major policy change.

The **HR-1 fee increase proposal** (removal in absentia fee from $5,130 to $18,000) is MEDIUM priority — important for user awareness but still in proposed rule stage.

No new actions were found this week specifically targeting Ukraine TPS, Uniting for Ukraine (U4U), re-parole, I-765, I-821, or EAD processing. Ukraine-specific programs remain unchanged from prior status.
