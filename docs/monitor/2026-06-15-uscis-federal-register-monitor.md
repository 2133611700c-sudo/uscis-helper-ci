# Messenginfo — USCIS/Federal Register Daily Monitor
**Date:** 2026-06-15
**Window scanned:** 2026-06-08 → 2026-06-15 (last 7 days), with the most recent prior item retained for relevance.

**Sources checked:**
- Federal Register API (DHS + USCIS, last 7 days) — **direct API fetch FAILED** in this run (sandbox provenance restriction; see Fetch Errors). Worked around via the Federal Register website (agency feed, 2026 USCIS index) and Federal Register document search — **succeeded**.
- USCIS Newsroom — News Releases (https://www.uscis.gov/newsroom/news-releases) — **fetch returned empty shell** (JavaScript-rendered page); content not retrievable in this autonomous run.
- USCIS Alerts (https://www.uscis.gov/newsroom/alerts) — **fetch returned empty shell** (JavaScript-rendered); not retrievable in this run.
- DHS News (https://www.dhs.gov/news) — **fetch returned empty shell** (JavaScript-rendered); not retrievable in this run.

**Relevant items found:** 1 (plus 2 standing context items noted, both older than 7 days)

---

## Clarification of Discretionary Employment Authorization for Certain Aliens (Proposed Rule / NPRM)
**Source:** Department of Homeland Security — https://www.federalregister.gov/documents/2026/06/05/2026-11285/clarification-of-discretionary-employment-authorization-for-certain-aliens
**Published:** 2026-06-05 (Public Inspection 2026-06-04). NOTE: published 10 days ago — just outside the strict 7-day window, retained here due to high relevance and an active comment period.
**Effective date:** Not specified (this is a proposed rule, not yet final). Comment deadline: 2026-08-04.
**Document #:** 2026-11285 (8 CFR Parts 106, 241, and 274a)

### What changed
DHS proposes to limit and clarify eligibility for *discretionary* employment authorization for three groups: aliens paroled into the U.S. for urgent humanitarian reasons or significant public benefit (the **(c)(11)** EAD category), aliens granted deferred action, and aliens with a final order of removal released on an order of supervision. The rule would specify that applicants who admit to, were arrested for, or were convicted of certain criminal acts do not warrant a favorable exercise of discretion absent significant countervailing public interest. It also proposes to expand automatic-termination grounds under 8 CFR 274a.14 so that an EAD automatically ends when the underlying basis (e.g., parole, deferred action) is terminated or denied. The preamble references H.R. 1 (Public Law 119-21, signed 2025-07-04), which created a fee for parole-based EAD applications and capped parole EAD validity at one year or the duration of parole, whichever is shorter.

### What was known before
Parole-based employment authorization under category (c)(11) has historically been granted with fewer codified discretionary criteria. H.R. 1 (July 2025) already introduced the parole-EAD fee and the one-year/duration validity cap. This proposed rule would codify additional discretionary and termination standards on top of that.

### Affected Messenginfo services
- Uniting for Ukraine / humanitarian parole guidance — any user-facing copy describing how Ukrainian parolees obtain or renew a work permit (I-765, category (c)(11)).
- I-765 instructions / EAD content — discretionary-denial and automatic-termination language may need a caveat.
- FAQ — re-parole and parole-EAD sections (validity tied to parole duration; EAD ends if parole is terminated).

### Recommended action
No immediate user-facing change required — this is a **proposed** rule, not final. Action: flag for internal tracking; do NOT publish anything implying the rule is in effect. Optionally prepare (but do not yet ship) a draft FAQ note that parole-based EADs may be subject to additional discretionary criteria and automatic termination if parole ends, pending a final rule. Re-check Federal Register after the 2026-08-04 comment deadline for movement toward a final rule.

### Risk level
**MEDIUM**
Affects the core workflow of a key Messenginfo population (Ukrainian parolees seeking/renewing EADs), but it is not yet effective. No deadline action for users today; the only date is the 2026-08-04 public-comment deadline.

---

## Standing context items (older than 7 days — not new, listed for situational awareness)
- **USCIS Immigration Fees and Related Procedures Required by H.R.1 Reconciliation Bill** — FR Doc 2026-08333, published 2026-04-29. Relevant to any fee figures Messenginfo references (fees should already be shown as ranges per content rules). https://www.federalregister.gov/documents/2026/04/29/2026-08333/uscis-immigration-fees-and-related-procedures-required-by-hr1-reconciliation-bill
- **Certain DHS Immigration Fees Required by HR-1: FY2026 Adjustments for Inflation** — FR Doc 2025-20304, published 2025-11-19. https://www.federalregister.gov/documents/2025/11/19/2025-20304/certain-dhs-immigration-fees-required-by-hr-1-fiscal-year-2026-adjustments-for-inflation

These are unchanged since prior monitoring and require no new action today; included only because the June 5 NPRM cites the same H.R. 1 fee framework.

---

## Fetch Errors
1. **Federal Register API** — `https://www.federalregister.gov/api/v1/articles.json?...` returned: *"URL not in provenance set. web_fetch can only retrieve URLs that appeared in a user message or a prior web_fetch result."* This is an environment restriction on direct API calls in this autonomous run, not a Federal Register outage. Mitigated by using the Federal Register website (agency feed + 2026 index + document search), which is the same underlying data.
2. **USCIS Newsroom (news-releases)** — fetch succeeded at HTTP level but returned an empty body (page is client-side rendered; raw fetch yields no article content). Not retrievable without a JavaScript-rendering browser. Claude-in-Chrome was unavailable in this run (multiple Chrome devices connected and none can be selected without the user present).
3. **USCIS Alerts** — same empty-shell condition as #2.
4. **DHS News** — same empty-shell condition as #2.

**Coverage note:** Federal Register coverage for the period is solid (it is the authoritative source for rules/notices and was reached via the website). USCIS Newsroom/Alerts and DHS News could NOT be independently confirmed this run due to the rendering/browser limitations above. If a newsroom-only announcement (e.g., a stakeholder message) was posted in the window, it would not appear here. Recommend a manual newsroom check, or enabling a JavaScript-rendering fetch path / single selectable browser for future automated runs.

## No-update statement
Not applicable — one relevant item was found. For the strict 2026-06-08 → 2026-06-15 window, no new Federal Register DHS/USCIS document matching the monitored topics was published; the relevant item (2026-11285) published 2026-06-05.
