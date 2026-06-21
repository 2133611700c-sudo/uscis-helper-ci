# Per-Channel Report — TEMPLATE

Save as `/tmp/source-intel/source-reports/{source_id}-report.md`.

---

# {SOURCE_ID} — {Channel name}

**Date**: [ISO timestamp]
**Status**: COMPLETE | PARTIAL | FAILED

## Channel metadata

| Field | Value |
|---|---|
| Handle | @... |
| URL | https://www.youtube.com/@... |
| Subscribers | [N] |
| Total videos | [N] |
| Primary language | RU/UA/EN |
| Tier classification | 1.5/2/3/5 |
| Country (if visible) | ... |

## Description (paraphrased — DO NOT copy verbatim)

[2-3 sentence summary of what the channel claims to do]

## External links found

| Type | Value |
|---|---|
| Telegram | ... |
| Website | ... |
| Instagram | ... |
| Facebook | ... |
| Email | ... |
| Phone | ... |

## Search results summary

30 search queries executed (10 topics × 3 languages):

| Topic | RU results | UK results | EN results | Top video views |
|---|---|---|---|---|
| re-parole | [N] | [N] | [N] | [views] |
| tps | ... | ... | ... | ... |
| ... | | | | |

## Videos imported to NotebookLM

| video_id | title (paraphrased) | views | date | claims_count |
|---|---|---|---|---|
| IUzAH3RQ7oY | Re-parole filing guide | 12K | 2026-03-15 | 8 |

## Claims extracted

For each video, raw Gemini response saved to `/tmp/source-intel/claims-raw/{source_id}-{video_id}.md`.

Summary of claims by topic:
- re-parole: [N] claims
- tps: [N] claims
- ead: [N] claims
- ...

## Verified claims (for full table see `/tmp/source-intel/verified-claims/{source_id}-*.csv`)

| claim (paraphrased) | status | tier1_url |
|---|---|---|
| Re-parole filing requires personal evidence as of Aug 2025 | verified | https://www.uscis.gov/humanitarian/uniting-for-ukraine |
| TPS extends to October 2026 | verified | https://www.federalregister.gov/... |
| ... | ... | ... |

## Verification stats

| Status | Count |
|---|---|
| verified | [N] |
| unverified | [N] |
| contradicted | [N] |
| outdated | [N] |

## Tier classification — final

Based on this audit:
- Original tier: [from target-channels.csv]
- Recommended tier: [based on contradicted count]
- Reasoning: [if changed]

## Trust score

- 0-3 contradicted claims out of 10+: TRUSTWORTHY
- 4-6 contradicted out of 10+: USE WITH CAUTION
- 7+ contradicted out of 10+: DO NOT LINK

This channel: [TRUSTWORTHY / USE WITH CAUTION / DO NOT LINK]

## Action items

- [ ] Add to monitoring list (TASK-06): yes/no
- [ ] Candidate for partnership outreach: yes/no
- [ ] Add disclaimer when linking: yes/no
- [ ] Reclassify tier: yes/no

## Evidence

- Screenshots: `/tmp/source-intel/screenshots/{source_id}/` ([N] files)
- Contacts JSON: `/tmp/source-intel/contacts/{source_id}.json`
- Video queue: `/tmp/source-intel/video-queue/{source_id}-videos.csv`
- Raw claims: `/tmp/source-intel/claims-raw/{source_id}-*.md`
- Verified claims: `/tmp/source-intel/verified-claims/{source_id}-*.csv`

## Notes / oddities

[Anything weird the agent encountered — "channel went private", "clear scam pattern", "creator is a known attorney with bar license visible", etc.]

---

**Status**: Channel report complete. Awaiting user "next" instruction before proceeding to next channel.
