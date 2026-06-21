# Messenginfo — USCIS/Federal Register Daily Monitor
**Date:** 2026-05-12
**Sources checked:**
- Federal Register API (7-day window: 2026-05-05 to 2026-05-12): ❌ FAILED — URL not in provenance set (web_fetch restriction); supplemented with WebSearch + targeted page fetches
- USCIS Newsroom (https://www.uscis.gov/newsroom/news-releases): ⚠️ Fetched but returned empty body (JavaScript-rendered page)
- USCIS Alerts (https://www.uscis.gov/newsroom/alerts): ⚠️ Fetched but returned empty body (JavaScript-rendered page)
- DHS News (https://www.dhs.gov/news): ⚠️ Fetched but returned empty body (JavaScript-rendered page)
- WebSearch supplement: ✅ Used to identify and retrieve specific Federal Register documents
- Targeted Federal Register document fetches: ✅ Two documents fully retrieved and analyzed

**Relevant items found:** 2

---

## Signatures on Immigration Benefit Requests — Interim Final Rule

**Source:** USCIS / Federal Register — https://www.federalregister.gov/documents/2026/05/11/2026-09289/signatures-on-immigration-benefit-requests
**Published:** 2026-05-11 (91 FR 25479, pages 25479–25489)
**Effective date:** 2026-07-10
**Document #:** 2026-09289 / Docket USCIS-2026-0166 / RIN 1615-AD17

### What changed
USCIS published an interim final rule amending 8 CFR 103.2(a)(7)(ii)(A) to codify its authority to **deny** (not just reject) an immigration benefit request after acceptance if it is later found to lack a valid signature. Under the new rule, USCIS may also **retain the filing fee** upon denial, treating the case as fully adjudicated. Previously, post-acceptance discovery of an invalid signature was handled inconsistently; this rule explicitly grants officers discretionary authority to reject or deny. Invalid signatures include copy-pasted digital images, typed names, signature-software outputs, and stamped signatures. USCIS will not allow applicants to "cure" an invalid signature; there is no correction window once a denial is issued. The rule applies to all USCIS benefit requests submitted on or after July 10, 2026. Exceptions: Form N-600 and N-600K may only be rejected (not denied) for signature defects, because denial would permanently bar re-filing.

### What was known before
Prior USCIS policy (since 2018) stated that post-acceptance discovery of an invalid signature would result in denial, but this was policy guidance only — not codified in regulation. Implementation was inconsistent across officers. The prior regulation authorized rejection at intake for missing signatures but was silent on the post-acceptance scenario. A downstream effect of this rule is more Form I-290B appeals expected (at $800 per appeal), as denials — unlike rejections — trigger appeal rights.

### Affected Messenginfo services
- **Translation service — any form that requires an original applicant signature**: This rule raises the risk profile for any form package Messenginfo helps users prepare. If a translated/assembled packet contains a photocopied or digitally pasted signature and USCIS accepts it at intake but discovers the defect later, the user loses both the benefit and the filing fee.
- **FAQ / instructions pages**: Any guidance Messenginfo provides on how to sign forms (I-765, I-821, I-131, I-912, etc.) should explicitly warn against digital or copy-pasted signatures.
- **User-facing copy — I-290B**: Users denied on signature grounds will need to file I-290B appeals ($800 fee); Messenginfo translation services for appeal packets may see increased demand after July 10, 2026.

### Recommended action
- Add a signature-validity warning to all form preparation guides and FAQs: "USCIS may deny your application and keep your filing fee if your signature is a copy, typed name, or digital image — even if USCIS initially accepted your application."
- Review any illustrated instructions showing how to sign documents; confirm they depict wet/ink or compliant e-signatures only.
- Add a note to I-290B translation service pages about the anticipated increase in signature-related denials after July 10, 2026.
- No immediate user-deadline impact; effective date is July 10, 2026 — update content within 3 weeks.

### Risk level
**MEDIUM**
Affects user workflow and form preparation guidance. No immediate filing deadline. Content update needed before July 10, 2026.

---

## USCIS Immigration Fees and Related Procedures Required by H.R.1 Reconciliation Bill — Interim Final Rule

**Source:** USCIS / Federal Register — https://www.federalregister.gov/documents/2026/04/29/2026-08333/uscis-immigration-fees-and-related-procedures-required-by-hr1-reconciliation-bill
**Published:** 2026-04-29 (91 FR 22952, pages 22952–22973) — *Note: published 13 days ago, outside the strict 7-day window, but effective date is May 29, 2026 (17 days away) and directly impacts Ukrainian TPS users. Included due to imminent deadline.*
**Effective date:** 2026-05-29
**Document #:** 2026-08333 / Docket USCIS-2026-0133 / RIN 1615-AD09

### What changed
This interim final rule codifies and implements immigration fee requirements from H.R.1 (One Big Beautiful Bill Act, P.L. 119-21, signed July 4, 2025), effective May 29, 2026. Three changes are directly relevant to Messenginfo's user population:

**1. TPS-based EAD validity capped at 1 year.** Employment Authorization Documents issued under TPS (8 CFR 274a.12(a)(12) and (c)(19)) are now valid for 1 year or the remaining period of TPS designation — whichever is shorter. This replaces the prior practice of issuing EADs valid for the full TPS designation period (up to 18 months). TPS holders, including Ukrainians, will need to renew EADs annually regardless of how long their TPS designation runs. USCIS acknowledges this may cause temporary gaps in employment authorization if renewal delays occur.

**2. H.R.1 fees cannot be waived.** The new H.R.1-mandated fees (asylum application fee $100, Annual Asylum Fee $100/year, Form I-94 fee $24, TPS employment authorization fees) are explicitly non-waivable. Existing USCIS fee waiver authority under 8 CFR 106.3(a) (Form I-912) does NOT apply to these fees. Standard USCIS filing fees for forms like I-821 and I-765 remain waivable, but only the base USCIS fee portion — not the additive H.R.1 fees.

**3. Asylum fee nonpayment (AAF) triggers EAD termination.** If an asylum applicant fails to pay the Annual Asylum Fee after a 30-day notice, their pending I-589 is rejected, their asylum-based EAD (I-765 under c(8)) is terminated, and DHS may initiate removal. This primarily affects asylum-track applicants, not TPS holders, but overlapping populations (e.g., Ukrainians with both pending asylum and TPS) may be affected.

### What was known before
H.R.1 immigration fees were announced in prior Federal Register notices starting July 22, 2025 (90 FR 34511) and adjusted for inflation in November 2025. Those prior notices described the fees but did not codify AAF nonpayment consequences in regulation. Ukraine TPS was last extended January 17, 2025 (FR doc 2025-00771) through October 19, 2026 — that extension issued EADs with an October 19, 2026 expiration date. Under the new 1-year EAD cap, any EADs issued or renewed after May 29, 2026 will be limited to 1-year validity, meaning Ukrainian TPS holders whose EADs expire October 2026 will need another renewal around May 2027 rather than holding through the full TPS designation.

### Affected Messenginfo services
- **Translation service — I-765 (EAD renewal)**: Ukrainian TPS users will need to renew EADs more frequently. Messenginfo may see increased demand for I-765 translation/preparation services.
- **FAQ — TPS renewal section**: Must be updated to reflect that EADs are now capped at 1 year, not the full TPS designation period.
- **FAQ — fee waiver section**: Must clarify that I-912 fee waivers do NOT apply to H.R.1-mandated fees. Users expecting to waive TPS employment authorization fees will be surprised; must set correct expectations.
- **Translation service — I-912 (Fee Waiver)**: Update instructions to note that fee waiver only covers base USCIS fees, not H.R.1-added fees.
- **Any content mentioning EAD expiration dates**: References to "EAD valid through October 19, 2026" need to note that new/renewed EADs post-May 29 will expire 1 year from issuance, not at the end of the TPS period.
- **Translation service — I-821 (TPS re-registration)**: No direct fee change for I-821 itself, but the user journey around it changes: EAD renewal cadence changes, and users should expect annual rather than 18-month renewal cycles.

### Recommended action
- **Immediate (before May 29)**: Add alert banner to TPS Ukraine page and EAD/I-765 pages: "Starting May 29, 2026, TPS-based EADs are limited to 1-year validity. If you receive a new or renewed EAD after May 29, it will expire 1 year from the issue date, not at the end of the TPS period."
- **Immediate**: Update fee waiver FAQ: "Form I-912 fee waivers do not apply to fees mandated by H.R.1 (the One Big Beautiful Bill Act). These fees are non-waivable by law."
- **Within 1 week**: Audit all pages that cite "EAD valid through October 19, 2026" — add a conditional note for EADs issued after May 29, 2026.
- **Monitor**: Watch for USCIS guidance on how it will process EAD renewals for TPS holders affected by the 1-year cap — a gap in employment authorization is possible if renewals are delayed.

### Risk level
**HIGH**
Effective date May 29, 2026 — 17 days away. Directly affects Ukrainian TPS holders' EAD validity and fee expectations. User-facing content changes are time-sensitive.

---

## Fetch Errors

| Source | Status | Detail |
|--------|--------|--------|
| Federal Register API (7-day query) | ❌ FAILED | URL blocked by web_fetch provenance restriction — API URL was not pre-authorized in conversation context |
| USCIS Newsroom (news-releases) | ⚠️ EMPTY | Page fetched but returned no content — JavaScript-rendered page not accessible via web_fetch |
| USCIS Alerts | ⚠️ EMPTY | Page fetched but returned no content — JavaScript-rendered page not accessible via web_fetch |
| DHS News | ⚠️ EMPTY | Page fetched but returned no content — JavaScript-rendered page not accessible via web_fetch |

**Mitigation used:** WebSearch with domain filter (uscis.gov, federalregister.gov, dhs.gov) + direct targeted page fetches of identified documents. Two full Federal Register documents were retrieved and analyzed (1,014 lines and 1,318 lines respectively). Coverage is substantive but may not capture all items that would have appeared in the full Federal Register API response or on JavaScript-rendered USCIS pages.

**Recurring issue note:** USCIS newsroom pages are JavaScript-rendered and consistently return empty bodies via web_fetch. The Federal Register API URL requires pre-authorization. A more reliable alternative for the Federal Register query is to use WebSearch with site:federalregister.gov filters, as used today.

---

## Summary Table

| Item | Doc # | Published | Effective | Risk |
|------|--------|-----------|-----------|------|
| Signatures on Immigration Benefit Requests (IFR) | 2026-09289 | 2026-05-11 | 2026-07-10 | MEDIUM |
| USCIS H.R.1 Fees / TPS EAD 1-Year Cap (IFR) | 2026-08333 | 2026-04-29 | 2026-05-29 | HIGH |
