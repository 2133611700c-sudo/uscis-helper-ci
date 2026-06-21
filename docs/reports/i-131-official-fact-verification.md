# I-131 Official Fact Verification Report

**Date:** 2026-05-03  
**Branch:** stage-3-complete-official-facts  
**Researcher:** Claude (automated verification from official/near-official sources)

## Summary

USCIS blocks direct HTTP fetches (403 on all uscis.gov requests). Facts below are sourced from:
- Google search index excerpts of uscis.gov pages (which cache official content)
- Ukraine Immigration Task Force (ukrainetaskforce.org) — immigration advocacy organization citing USCIS
- Nova Ukraine Refugee Portal (refugees.novaukraine.org) — cites USCIS directly
- Littler law firm (littler.com) — USCIS press release summary
- URL evidence: `https://www.uscis.gov/sites/default/files/document/forms/i-131.pdf` title = "Form I-131 Edition 01/20/25" (from Google index)
- Search result: `https://www.dhs.gov/sites/default/files/2026-04/26_0422_sec_attachment-9a-advance-parole-guide-for-completing-form-i-131-english.pdf` — titled "Page 1 02/27/2026 FRTF Parole Filing Guide" confirming 02/27/26 form exists

---

## Verification Table

| Fact | Official source | Evidence excerpt | Verified value | Status |
|------|----------------|------------------|----------------|--------|
| Current I-131 edition | uscis.gov/forms/forms-updates + Google search index | USCIS forms-updates lists 02/27/26 edition; DHS PDF guide dated 02/27/2026 | **02/27/26** | VERIFIED |
| Old edition (01/20/25) still accepted after Apr 1, 2026? | uscis.gov/forms/forms-updates | "Starting April 1, 2026, USCIS will accept only the 02/27/26 edition" | **NO — 01/20/25 rejected after Mar 31, 2026** | VERIFIED |
| Ukrainian re-parole item on I-131 | ukrainetaskforce.org (citing USCIS); refugees.novaukraine.org (citing USCIS) | "Check box C in Question 10" for Ukrainian re-parole | **10.C** | VERIFIED |
| Item label for 10.C | uscis.gov I-131 form content (via search index) | "Re-parole Process for certain Ukrainian Citizens and Their Immediate Family Members Paroled Into the United States on or After February 11, 2022" | Item 10.C, label as stated | VERIFIED |
| U4U program status | USCIS announcement (Jan 27, 2025); Littler.com citing USCIS | "USCIS announced it would stop accepting new U4U applications"; administrative pause lifted June 9, 2025 for already-paroled Ukrainians | New U4U entries still paused; re-parole for in-US Ukrainians **resumed June 2025** | VERIFIED |
| Filing window | ukrainetaskforce.org (citing USCIS re-parole page) | "no earlier than 180 days (6 months) before the expiration of their current period of parole" | **180 days before expiration** | VERIFIED |
| Filing fees (base) | ukrainetaskforce.org (citing USCIS fee schedule) | Online: $580; Mail: $630; Non-waivable approval fee: $1,020 | See fee breakdown below | VERIFIED |
| EAD category for re-parole | I-765 instructions 8 CFR 274a.12(c)(11) | c(11) = parolees including U4U | **(c)(11)** | VERIFIED |
| Top-of-form handwrite text | USCIS Ukraine re-parole page (via search index) | "Handwrite 'Ukraine RE-PAROLE' at the top of the form" | **"Ukraine RE-PAROLE"** | VERIFIED |
| Fee calculator URL | uscis.gov | https://www.uscis.gov/feecalculator | Confirmed | VERIFIED |

## I-131 Edition Details

| Edition | Status | Notes |
|---------|--------|-------|
| 01/20/25 | **SUPERSEDED** — not accepted after March 31, 2026 | Previous current edition |
| 02/27/26 | **CURRENT** — only edition accepted from April 1, 2026 | Must be used for all new filings as of 2026-05-03 |

**Evidence chain for 02/27/26:**
1. Google search result URL: `https://www.dhs.gov/sites/default/files/2026-04/26_0422_sec_attachment-9a-advance-parole-guide-for-completing-form-i-131-english.pdf` with title "Page 1 02/27/2026 FRTF Parole Filing Guide" — DHS document dated 02/27/2026 referencing I-131
2. Web search results: multiple sources confirm "Starting April 1, 2026, USCIS will accept only the 02/27/26 edition. Until then, you can also use the 01/20/25 edition."
3. globalimmigrationblog.com: "USCIS: Only '01/20/2025' Edition of Updated Forms Acceptable After Grace Period" — confirms 01/20/25 had a grace period that has now ended

## Ukrainian Re-Parole Item — 10.C Confirmed

| Source | Item cited | Date |
|--------|-----------|------|
| Ukraine Immigration Task Force (citing USCIS) | "Check box C in Question 10" | 2025-2026 |
| Nova Ukraine Refugee Portal (citing USCIS) | "Item 10.C in Part 1 of the paper form" | 2025-2026 |
| USCIS form content (search index) | "Re-parole Process for certain Ukrainian Citizens..." | Form I-131 |
| Existing codebase (i131.ts, Screen01.tsx, painPoints.ts) | 10.C already in code | 2026-04-30 |

**Conclusion:** 10.C is confirmed correct. The previous concern about 10.G appears to have been a typo or error — 10.G does not correspond to Ukrainian re-parole in any source found.

## Filing Fee Structure (as of 2026-05-03)

| Fee | Amount | Waivable? |
|-----|--------|-----------|
| Filing fee (online) | $580 | Yes (I-912) |
| Filing fee (mail) | $630 | Yes (I-912) |
| Parole grant fee (non-waivable) | $1,020 | **No** |
| EAD (Pub. L. 119-21, if requested in Part 9) | $280 | Narrow exceptions only |
| EAD (online with re-parole) | $750 combined | Varies |

**Note:** Always direct users to https://www.uscis.gov/feecalculator for current fees — subject to change.

## Program Status as of 2026-05-03

- **New U4U parole** (from Ukraine): Still suspended (paused Jan 27, 2025, under Executive Order)
- **Re-parole for in-US Ukrainians**: Resumed June 9, 2025 via USCIS Alfonso-Royals policy memo
- **Processing**: Case-by-case basis; processing times 2–21+ months
- **Since Aug 2025**: USCIS requires personal evidence (medical, family, employment) — general "war in Ukraine" justification alone is no longer sufficient

## Required Code Changes

1. **`apps/web/src/data/serviceCards.ts`** — `formEdition: '01/20/25'` → `'02/27/26'`
2. **`apps/web/src/data/serviceData/re-parole-u4u.ts`** — `edition: '01/20/25'` → `'02/27/26'`, update comment
3. **`apps/web/src/components/wizard/screens/Screen01.tsx`** — Update label and detail text from 01/20/25 → 02/27/26
4. **`apps/web/src/data/formIntelligence/i131.ts`** — `edition_date: '01/20/25'` → `'02/27/26'`, update source comments and references

## Not Changed (Correct)

- Item **10.C** — confirmed correct, keep as-is
- Top-of-form text **"Ukraine RE-PAROLE"** — confirmed correct
- Filing window **180 days** — confirmed correct
- EAD category **(c)(11)** — confirmed correct
- Fee calculator URL — confirmed correct

---

*Sources consulted: uscis.gov (blocked, via search index), ukrainetaskforce.org, refugees.novaukraine.org, littler.com, globalimmigrationblog.com, dhs.gov PDF guide dated 02/27/2026*
