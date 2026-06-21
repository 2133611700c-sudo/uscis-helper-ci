# Federal Register / USCIS Daily Monitor

**System:** Cowork Scheduled Task (Anthropic Claude desktop app)
**Task ID:** `federal-register-uscis-monitor`
**Schedule:** Daily, 09:04 Pacific
**Task file:** `~/Documents/Claude/Scheduled/federal-register-uscis-monitor/SKILL.md`
**Status:** ✅ OPERATIONAL — live-verified 2026-05-09

---

## Purpose

Scans official US government sources daily for immigration regulatory changes that affect Messenginfo users (Ukrainian, Russian-speaking immigrants navigating US immigration).

## Sources monitored

| Source | URL | Notes |
|--------|-----|-------|
| Federal Register API | `federalregister.gov/api/v1/articles.json` | Primary — machine-readable |
| USCIS Newsroom | `uscis.gov/newsroom/news-releases` | Primary |
| USCIS Alerts | `uscis.gov/newsroom/alerts` | Primary |
| DHS News | `dhs.gov/news` | Primary |
| eCFR title 8 | `ecfr.gov/recent-changes` | Secondary (fallback only) |

## Topics tracked

- Ukraine TPS, U4U, re-parole, humanitarian parole, parole in place
- Forms: I-765, I-821, I-821D, I-131, I-131A, I-912, I-290B
- Employment authorization, EAD, biometrics, fees, work permit, advance parole
- Populations: Ukrainian, Russian-speaking, Eastern European (immigration context)

## Correct Federal Register API slugs (verified 2026-05-09)

```
conditions[agencies][]=u-s-citizenship-and-immigration-services
conditions[agencies][]=homeland-security-department
```

**IMPORTANT:** Old slugs `department-of-homeland-security` and `us-citizenship-and-immigration-services` return HTTP 400. Use the above.

## Live run proof (2026-05-09)

```
HTTP 200 OK
Window: 2026-05-02 → 2026-05-09
Total DHS/USCIS articles: 153
Relevant after keyword filter: 2

  DOC# 2026-09247 | 2026-05-11 | Info collection notice (focus groups)   → LOW
  DOC# 2026-09246 | 2026-05-11 | Info collection notice (service delivery) → LOW
  
No TPS/EAD/fee/Ukraine action items found this week.
```

## Output format

Each run produces a structured briefing with:
- Source check status (fetched / failed)
- Relevant items with: title, source URL, published date, effective date, doc#
- "What changed" / "What was known before" / "Affected Messenginfo services" / "Recommended action"
- Risk level: LOW / MEDIUM / HIGH
- Fetch error section (even if empty)
- No-update statement if zero relevant items

## Risk level definitions

| Level | Trigger | Required action |
|-------|---------|-----------------|
| LOW | Informational, no user-facing impact | No action |
| MEDIUM | Affects user workflow or form instructions | Update within 1 week |
| HIGH | Deadline, fee change, or program suspension | Update immediately |

## Visibility note

This task runs in the **Cowork scheduled task system** (Claude desktop app). It is **not** visible in ChatGPT, OpenAI, or other external automation dashboards — those are separate systems. To verify the task is scheduled, check: `~/Documents/Claude/Scheduled/federal-register-uscis-monitor/SKILL.md`.

## Failure handling

The previous monitor failed in 32 seconds (2026-05-09) due to incorrect agency slugs returning HTTP 400. Fix applied: slugs corrected in SKILL.md. If a fetch fails, the task records the exact error and continues to next source — it does not silently skip.

## Maintenance

If the monitor fails again:
1. Check agency slugs via: `https://www.federalregister.gov/api/v1/agencies.json`
2. Search for "citizenship" or "homeland" to get current slugs
3. Update SKILL.md accordingly
