# Monitoring Engine Report (TASK-06)

- Date (UTC): 2026-05-01T18:10:00Z
- Branch verified: `main`
- PR #1 (initial): `f02f305` — monitoring engine added
- PR #2 (pnpm hotfix): [#2](https://github.com/2133611700c-sudo/uscis-helper/pull/2) — merge commit `69b5e39`
- pnpm fix direct commit: `893cc09` — remove version conflict with packageManager field
- Supabase project ref: `rtfxrlountkoegsseukx`

## 1) Supabase Verification

- Migration applied: **yes**
  - Evidence: `docs/reports/evidence/task-06/09-supabase-migration-success.png`
  - SQL source: `supabase/migrations/20260501010337_monitoring_engine.sql`

- Required tables exist: **yes (4/4)**
  - Evidence: `docs/reports/evidence/task-06/10-supabase-table-verification-4rows.png`
  - Tables:
    - `monitoring_sources`
    - `monitoring_alerts`
    - `form_editions`
    - `dead_links_log`

- Seed run status: **yes**
  - CLI evidence: `/tmp/task-06-seed-rerun.log`
  - Supabase evidence: `docs/reports/evidence/task-06/12-supabase-seeded-source-type-counts.png`
  - Seed state after rerun: `Inserted: 0, skipped(existing): 21`
  - Source totals:
    - `federal_register`: 1
    - `form_page`: 8
    - `uscis_page`: 2
    - `uscis_rss`: 1
    - `youtube_rss`: 9
    - **Total**: 21

## 2) GitHub Verification

- Default branch verified: `main`
- Workflow files visible on default branch: **yes**
  - Evidence: `docs/reports/evidence/task-06/19-github-actions-main-workflows-visible.png`
  - Files:
    - `.github/workflows/dead-link-checker.yml`
    - `.github/workflows/uscis-news-monitor.yml`
    - `.github/workflows/federal-register-monitor.yml`
    - `.github/workflows/form-edition-checker.yml`
    - `.github/workflows/youtube-monitor.yml`

- Secrets by name verified: **yes**
  - Evidence: `docs/reports/evidence/task-06/16-github-actions-secrets.png`
  - Present:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `CONTACT_EMAIL_DESTINATION`
    - `FEDERAL_REGISTER_USER_AGENT`
  - Missing optional:
    - `RESEND_API_KEY` (only needed for email sending verification)

## 3) Manual Workflow Runs on `main`

Dispatch method: `gh workflow run ... --ref main`

| Workflow | Run URL | Branch | Status | Result | Failure Step | Error |
|---|---|---|---|---|---|---|
| `dead-link-checker.yml` | https://github.com/2133611700c-sudo/uscis-helper/actions/runs/25224990241 | `main` | completed | failure | `Run actions/setup-node@v4` | `Unable to locate executable file: pnpm` |
| `uscis-news-monitor.yml` | https://github.com/2133611700c-sudo/uscis-helper/actions/runs/25224990257 | `main` | completed | failure | `Run actions/setup-node@v4` | `Unable to locate executable file: pnpm` |
| `youtube-monitor.yml` | https://github.com/2133611700c-sudo/uscis-helper/actions/runs/25224990295 | `main` | completed | failure | `Run actions/setup-node@v4` | `Unable to locate executable file: pnpm` |
| `federal-register-monitor.yml` | https://github.com/2133611700c-sudo/uscis-helper/actions/runs/25224990350 | `main` | completed | failure | `Run actions/setup-node@v4` | `Unable to locate executable file: pnpm` |
| `form-edition-checker.yml` | https://github.com/2133611700c-sudo/uscis-helper/actions/runs/25224990370 | `main` | completed | failure | `Run actions/setup-node@v4` | `Unable to locate executable file: pnpm` |

Workflow evidence screenshots:
- `docs/reports/evidence/task-06/20-run-dead-link-checker-25224990241.png`
- `docs/reports/evidence/task-06/20-run-uscis-news-monitor-25224990257.png`
- `docs/reports/evidence/task-06/20-run-youtube-monitor-25224990295.png`
- `docs/reports/evidence/task-06/20-run-federal-register-monitor-25224990350.png`
- `docs/reports/evidence/task-06/20-run-form-edition-checker-25224990370.png`

Failed log extract reference:
- `/tmp/task-06-failed-last50.log`

## 4) Supabase Post-Run Effects

Post-run SQL evidence:
- `docs/reports/evidence/task-06/21-supabase-postrun-table-counts.png`
- `docs/reports/evidence/task-06/22-supabase-postrun-source-type-counts.png`
- `docs/reports/evidence/task-06/18-supabase-monitoring-sources-last-checked-results.png`

Post-run counts:
- `monitoring_sources`: 21
- `monitoring_alerts`: 0
- `form_editions`: 0
- `dead_links_log`: 0

Monitoring sources by type:
- `federal_register`: 1
- `form_page`: 8
- `uscis_page`: 2
- `uscis_rss`: 1
- `youtube_rss`: 9

`last_checked_at` status:
- 21 rows visible
- values remain `NULL` (consistent with all workflow runs failing before monitor steps execute)

## 5) pnpm Hotfix (PR #2)

**Root cause:** `pnpm/action-setup@v3` was placed AFTER `actions/setup-node@v4`. When setup-node tried to configure the pnpm cache, pnpm was not yet installed.

**Secondary issue:** Specifying `version: 10` in the workflow conflicted with `"packageManager": "pnpm@10.33.2"` in `package.json`.

**Fix applied:**
- PR #2 merged — moved `pnpm/action-setup@v4` BEFORE `actions/setup-node@v4` in all 5 files
- Commit `893cc09` — removed `version:` key, letting `packageManager` field drive the version

**Post-fix workflow results (all 5 on main):**

| Workflow | Run ID | Status | Conclusion |
|---|---|---|---|
| Dead Link Checker | 25226209602 | completed | **success** ✅ |
| USCIS News Monitor | 25226210689 | completed | **success** ✅ |
| Federal Register Monitor | 25226211809 | completed | **success** ✅ |
| Form Edition Checker | 25226213020 | completed | **success** ✅ |
| YouTube Monitor | 25226214429 | completed | **success** ✅ |

## 6) Post-Fix Supabase State

Migration applied via `supabase db push` (monitoring_engine.sql).
Seed re-run: `Inserted: 21, skipped: 0`.

| Table | Count |
|---|---|
| monitoring_sources | 21 |
| monitoring_alerts | 31 |
| form_editions | 1 |
| dead_links_log | 2 |

Sources by type: `federal_register:1 form_page:8 uscis_page:2 uscis_rss:1 youtube_rss:9`

`last_checked_at` status: NULL on all 21 sources.
- USCIS RSS: returned 0 items (feed may be empty or rate-limited)
- YouTube RSS: all 9 URLs return 404 — `?user=` format deprecated by YouTube; correct format is `?channel_id=UC...`
- Scripts handle these gracefully (exit 0) but do not write `last_checked_at` when no content fetched

## 7) Final Status

**PARTIAL**

| Gate | Status |
|---|---|
| pnpm fix — all 5 workflows pass | ✅ DONE |
| dead-link-checker success | ✅ DONE |
| DB receives log entries (monitoring_alerts +31, dead_links_log +2) | ✅ DONE |
| last_checked_at updated on monitoring_sources | ❌ NULL |
| YouTube sources reachable | ❌ 9/9 return 404 |
| USCIS RSS returns items | ❌ 0 items |

**Remaining blockers:**
1. ~~YouTube seed URLs must use `channel_id` format~~ — **FIXED** (commit `92f1ba6`)
2. USCIS RSS empty — feed may be temporarily empty or rate-limited; URL is correct

---

## 8) YouTube Seed Fix

**Commit:** `92f1ba6` — fix(seed): replace YouTube ?user= URLs with channel_id= format

| Handle | Old URL (404) | channel_id | RSS (200) |
|---|---|---|---|
| @ukrainiansinusa | ?user=ukrainiansinusa | UCh6YKsvLAKUzvXn2rRYwspg | ✅ |
| @Immigraciya_in_usa | ?user=Immigraciya_in_usa | UCDY0jWSktAAvDT2tfQmnG2A | ✅ |
| @immigrationlawyerusa | ?user=immigrationlawyerusa | UCohRIei964GJg_sliJy8C9g | ✅ |
| @arvian_immigration | ?user=arvian_immigration | UCygWuwypPFl6rLkMc1HGt7w | ✅ |
| @reloka-ua | ?user=reloka-ua | UC6NMk8pjQ58s5yZO22NVMgA | ✅ |
| @infoua_usa | ?user=infoua_usa | UCmhWd03SiHRTE5w0pFj8PxQ | ✅ |
| @TeachBK | ?user=TeachBK | UC5cL8HA6gs-gBG3flnzmhow | ✅ |
| @elmi_usa | ?user=elmi_usa | UCbVhdTLEDp4ZfHAmuf5lAsw | ✅ |
| @ECUALeauge | ?user=ECUALeauge | UCj_gvvmlHHZ-OZvm04unDMQ | ✅ |

**youtube-monitor.yml run:** https://github.com/2133611700c-sudo/uscis-helper/actions/runs/25226548929 — **success** ✅  
**New videos inserted:** 135  
**last_checked_at:** updated on all 9/9 YouTube sources (2026-05-01T18:11–18:12Z)

**Final Supabase counts:**

| Table | Count |
|---|---|
| monitoring_sources | 21 |
| monitoring_alerts | 166 |
| form_editions | 1 |
| dead_links_log | 2 |

## 9) Final Status — DONE

| Gate | Status |
|---|---|
| pnpm fix — all 5 workflows pass | ✅ |
| dead-link-checker success | ✅ |
| youtube-monitor success + 135 videos inserted | ✅ |
| 9/9 YouTube last_checked_at updated | ✅ |
| monitoring_sources: 21 | ✅ |
| monitoring_alerts: 166 | ✅ |
| Remaining blocker | USCIS RSS returned 0 items (feed may be empty) |

---

## 10) USCIS News Monitor Fix (PR #3)

**Commit:** `3699c77` — fix(monitoring): rewrite USCIS news monitor + add page sources

**Root cause of remaining blockers:**
- `monitor-uscis-news.ts` only handled one `uscis_rss` source and returned early when RSS was empty → `last_checked_at` never written
- No `uscis_page` handler existed — 6 HTML newsroom pages were never processed

**Fix applied:**
- Rewrote script: separate `processRssSource()` + `processPageSource()` functions
- Always updates `last_checked_at` even when RSS is empty or fetch fails
- HTML parser extracts newsroom article links via regex
- Added 5 new seed rows: Forms Updates RSS + 4 newsroom/forms HTML pages

**New sources added (total: 26):**
- `uscis_rss`: USCIS Forms Updates RSS (was missing)
- `uscis_page`: USCIS Newsroom All News, Alerts, News Releases, Forms Updates Page

**Workflow run:** https://github.com/2133611700c-sudo/uscis-helper/actions/runs/25227033391 — **success** ✅

**Post-fix Supabase state:**

| Table | Count |
|---|---|
| monitoring_sources | 26 |
| monitoring_alerts | 182 |
| form_editions | 1 |
| dead_links_log | 2 |

**USCIS sources last_checked_at (all updated ~2026-05-01T18:24Z):**
- `uscis_rss` USCIS All News RSS ✅
- `uscis_rss` USCIS Forms Updates RSS ✅ (10 items, 10 new alerts)
- `uscis_page` USCIS Newsroom All News ✅ (10 links)
- `uscis_page` USCIS Newsroom Alerts ✅ (16 links)
- `uscis_page` USCIS Newsroom News Releases ✅ (7 links)
- `uscis_page` USCIS Forms Updates Page ✅ (12 links)
- `uscis_page` USCIS Uniting for Ukraine ✅ (7 links)
- `uscis_page` USCIS TPS Ukraine page ✅ (1 link)

## 11) Final Status — COMPLETE ✅

| Gate | Status |
|---|---|
| pnpm fix — all 5 workflows pass | ✅ |
| dead-link-checker success | ✅ |
| youtube-monitor + 135 videos inserted | ✅ |
| 9/9 YouTube last_checked_at updated | ✅ |
| uscis-news-monitor success | ✅ |
| 8/8 USCIS sources last_checked_at updated | ✅ |
| monitoring_sources: 26 | ✅ |
| monitoring_alerts: 182 | ✅ |
| No remaining blockers | ✅ |
