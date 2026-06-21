# Messenginfo — USCIS/Federal Register Daily Monitor
**Date:** 2026-06-17 (Wednesday)
**Sources checked:**
- Federal Register API (DHS + USCIS, ≥2026-06-10): ❌ **NOT fetched** — web_fetch provenance restriction blocked the API URL; Chrome extension not connected; bash/curl not permitted. Substituted with targeted WebSearch (federalregister.gov domain).
- USCIS Newsroom News Releases (https://www.uscis.gov/newsroom/news-releases): ⚠️ Page returned empty (client-rendered, JS). Substituted with WebSearch.
- USCIS Alerts (https://www.uscis.gov/newsroom/alerts): ⚠️ Page returned empty (client-rendered, JS). Substituted with WebSearch.
- DHS News (https://www.dhs.gov/news): ❌ NOT fetched (not in provenance set; Chrome unavailable). Substituted with WebSearch.
- USCIS Ukraine TPS page (https://www.uscis.gov/humanitarian/temporary-protected-status/TPS-Ukraine): ✅ Success (web_fetch).

**Relevant items found:** 1 (within 7-day window, monitored topics)

> ⚠️ **Run integrity caveat.** This run could NOT execute the prescribed primary fetches. The Federal Register API URL is blocked by web_fetch's provenance rule, the Chrome browser tools were not connected, and direct HTTP via shell is not permitted by safety rules. Findings below rely on WebSearch (a degraded, non-authoritative substitute). **Absence of a Federal Register item in this report is NOT proof none was published June 10–17, 2026** — only that none surfaced via search. Re-run once Chrome is connected to get an authoritative FR API sweep. See Fetch Errors.

---

## 1. Court vacates USCIS benefit-hold / adjudication-pause policies (Dorcas v. USCIS) — final judgment + appeal
**Source:** USCIS Alert "Court Order on Hold Policies" — https://www.uscis.gov/newsroom/alerts/court-order-on-hold-policies ; CourtListener docket 1:26-cv-00132 — https://www.courtlistener.com/docket/72369535/dorcas-international-institute-of-rhode-island-v-united-states-citizenship/ ; First Circuit appeal docket 26-1703 — https://www.courtlistener.com/docket/73477958/dorcas-international-institute-of-rhode-island-v-united-states-citizenship/
**Published:** District court order 2026-06-05; final judgment 2026-06-11; government notice of appeal 2026-06-12
**Effective date:** Vacatur effective on entry of final judgment (2026-06-11); status now subject to appeal/stay proceedings before the First Circuit
**Document #:** N/A (federal litigation, not a Federal Register document)

### What changed
The U.S. District Court for the District of Rhode Island vacated three USCIS directives (PM 602-0192, PM 602-0194, and PA 2025-26) that had placed an indefinite hold on adjudication of immigration benefits — including Employment Authorization Documents (EADs/I-765), adjustment of status, and naturalization — for nationals of approximately 39 designated "high-risk"/travel-ban countries. Final judgment was entered June 11, 2026 and the government filed a notice of appeal to the First Circuit on June 12, 2026. Reporting indicates the district court paused (stayed) its own ruling while the First Circuit takes up the case, so the on-the-ground effect remains in flux.

### What was known before
The hold policies (issued late 2025) froze EAD, green-card, and naturalization adjudications based on nationality. No prior briefing on file covered this litigation.

### Affected Messenginfo services
- **No direct impact on Messenginfo's core users.** Ukraine is **not** on the 39-country list. Russia is **not** on the 39-country Dorcas list either (Russia appears on a separate, broader visa-issuance freeze, which is a different action and not part of this ruling).
- Indirect relevance only: the case concerns EAD/I-765 adjudication generally (a monitored topic), so it is logged for trend awareness.

### Recommended action
- No user-facing content change for Ukrainian/Russian-speaking TPS or parole users.
- Monitor the First Circuit appeal (docket 26-1703) and any stay order — it confirms USCIS's broader willingness to pause EAD adjudication by nationality, which could foreshadow future actions touching monitored populations.

### Risk level
**LOW** — Does not affect Messenginfo's monitored populations (Ukraine/Russia not on the 39-country list). Logged for situational awareness on EAD adjudication policy.

---

## Contextual items (NOT new this week — ongoing operational status)

**Ukraine TPS EAD auto-extension expired April 19, 2026.** The automatic extension of Ukraine TPS EADs (originals expiring 2025-04-19 or 2023-10-19) ran only through **April 19, 2026** and has now lapsed. Beneficiaries who timely re-registered (window was Jan 17 – Mar 18, 2025) and applied for a new EAD receive a card valid through **Oct. 19, 2026**. Source: https://www.uscis.gov/humanitarian/temporary-protected-status/TPS-Ukraine — *Action: confirm Messenginfo TPS-Ukraine pages no longer present the April 19, 2026 auto-extension as currently valid. Flagged MEDIUM for content review, not a new regulatory event.*

**Ukraine TPS designation runs through Oct. 19, 2026.** No new Federal Register action extending, re-designating, or terminating Ukraine TPS surfaced this week. With the designation expiring in ~4 months and no published extension yet, this is the single highest-value item to watch in coming weeks.

**HR-1 immigration fees / inflation adjustment** (FR 2025-13738 July 2025; FR 2025-20622 inflation adjustment effective Jan 1, 2026) — already in effect, previously known. No change this week. EAD-related fees noted: $550 initial / $275 renewal for the I-765 surcharge categories; the TPS EAD renewal/extension fee cannot be waived.

---

## Fetch Errors
- **Federal Register API** (`https://www.federalregister.gov/api/v1/articles.json?...gte=2026-06-10...`): web_fetch returned `URL not in provenance set. web_fetch can only retrieve URLs that appeared in a user message or a prior web_fetch result.` The API URL never appears in user-supplied content, so it cannot be fetched by web_fetch. Chrome browser tools (the May 24 fallback) returned `Claude in Chrome is not connected`. Direct curl is prohibited by safety rules. **Result: primary FR sweep not performed; WebSearch used as substitute.**
- **USCIS News Releases & Alerts pages**: web_fetch returned empty bodies (client-rendered/JS). WebSearch used as substitute.
- **DHS News page**: not in provenance set; Chrome unavailable; not fetched. WebSearch used as substitute.

**Remediation for next run:** ensure the Chrome extension is connected so the FR API and USCIS/DHS pages can be retrieved authoritatively (as in the 2026-05-24 run).

---

## Summary Assessment
Within the monitored topics, the only item landing in the June 10–17 window is the **Dorcas v. USCIS** litigation (final judgment June 11, appeal June 12). It touches EAD adjudication generally but **does not affect Messenginfo's Ukrainian/Russian-speaking users** — neither Ukraine nor Russia is on the 39-country list at issue. Net: **no action required** on user-facing content this week from new events.

The more pressing watch item is structural, not new: **Ukraine TPS expires Oct. 19, 2026 with no extension published**, and the **EAD auto-extension already lapsed (April 19, 2026)** — Messenginfo's TPS-Ukraine content should be checked so it does not still present the lapsed auto-extension as valid.

**This report is degraded.** The authoritative Federal Register sweep did not run. Treat the "1 relevant item" count as a floor, not a confirmed total, until a Chrome-connected re-run validates the FR API for June 10–17, 2026.
