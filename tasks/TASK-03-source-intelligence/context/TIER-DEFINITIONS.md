# Tier definitions

## Tier 1 — Authoritative (ground truth)

Government sources only. If a creator's claim contradicts Tier 1, the creator is wrong.

- USCIS: https://www.uscis.gov/
- USCIS forms: https://www.uscis.gov/forms
- USCIS Policy Manual: https://www.uscis.gov/policy-manual
- USCIS fee schedule: https://www.uscis.gov/g-1055
- USCIS Case Status: https://egov.uscis.gov/
- CBP I-94: https://i94.cbp.dhs.gov/
- DOJ EOIR Accredited Reps: https://www.justice.gov/eoir/recognized-organizations-and-accredited-representatives-roster
- Federal Register: https://www.federalregister.gov/
- eCFR (Code of Federal Regulations): https://www.ecfr.gov/
- USCIS Newsroom: https://www.uscis.gov/news

## Tier 1.5 — Vetted nonprofits

USCIS-funded or DOJ-recognized organizations. High trust but occasional errors.

- USCRI (United States Committee for Refugees and Immigrants): https://refugees.org/
- Lawyers for Good Government (L4GG)
- Nova Ukraine
- Catholic Charities (USCCB Migration & Refugee Services)
- HIAS

## Tier 2 — Established attorneys

Identifiable by:
- Bar admission visible on site
- Real law firm address
- Honest disclaimers ("I am an attorney, this is not legal advice for your specific case")

Examples in scope:
- @Immigraciya_in_usa (Муратова)
- @immigrationlawyerusa (Манилич)
- @arvian_immigration

Claims usually correct, occasional outdated info.

## Tier 3 — Community creators

Influencers, community members, paralegals, immigrants sharing experience.

May be excellent at explaining things in plain language, but accuracy varies. Audit determines whether to trust.

## Tier 5 — Scam pattern (auto-reject)

Red flags:
- Promises of guaranteed approval
- "Pay me $XXX to file your form" without bar credentials or DOJ accreditation
- Claims that contradict Tier 1 on multiple occasions
- "Insider knowledge" framing
- Requests to bypass official channels

Examples already flagged: DENIS LULACHEVSKII, @AlexandraU4U.

If a Tier 3 channel shows multiple Tier 5 patterns, reclassify.

## Verification rule

For a creator claim to be marked `verified`:
1. Claim must be found in a Tier 1 source
2. The Tier 1 URL must be saved alongside the claim
3. The Tier 1 source must be currently live (HTTP 200) at time of verification

For `unverified`:
- Tier 1 source doesn't address this specific claim — neither confirms nor contradicts

For `contradicted`:
- Tier 1 source says something different
- Capture both the claim and the Tier 1 contradiction in the report

For `outdated`:
- Claim was correct at time of video but Tier 1 has since changed
- Common with TPS/parole policy changes
