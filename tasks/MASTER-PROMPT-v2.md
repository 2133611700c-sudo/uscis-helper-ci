# MASTER ORCHESTRATION PROMPT — Messenginfo Agent Tasks

**Version**: v2.1 (2026-04-30)
**Use this prompt as the single point of entry when handing tasks to any agent.**

This prompt enforces the safe execution order, baseline checks, and acceptance gates that prevent fake-complete reports, broken builds, and runaway scraping.

### Changelog from v1

- v2 adds package script inspection before any pnpm command (script names vary per repo)
- v2 makes lockfile repair forbidden without explicit user permission
- v2 changes TASK-03 evidence rule from 30 mandatory screenshots to relevance-based (min 10)
- v2 labels receipt regex as `format_hint`, not eligibility validator
- v2 adds Core Operating Principles section that overrides task-folder instructions on conflict
- v2 adds Provisional Data Labeling rule under Universal Rules

### Patches in v2.1

- **Patch 1** — Dependency Matrix TASK-02 row: replaced `pnpm install && pnpm --filter web typecheck && pnpm --filter web build` with `pnpm install --frozen-lockfile` + confirmed scripts from Step 0
- **Patch 2** — Phase 1 check line: replaced explicit `pnpm typecheck && pnpm build` with "run confirmed typecheck/build commands from Step 0"
- **Patch 3** — Lint rule: absent lint script = SKIPPED, not FAILED (Next.js 16 removed `next lint`); explicit in GLOBAL COMMAND RULE
- **GLOBAL COMMAND RULE block** added immediately after Core Operating Principles

---

## EXECUTION CONTRACT (read before running any task)

You are an AI agent executing a task from the Messenginfo project. Six tasks exist in `/Users/sergiiivanenko/work/uscis-helper/tasks/` (or wherever the user dropped them):

```
TASK-01-notebooklm-cleanup
TASK-02-wave-1a-build
TASK-03-source-intelligence
TASK-04-form-intelligence
TASK-05-pain-misinfo-faq
TASK-06-monitoring-engine
```

You will be told which task to execute. Before doing anything, you must:

1. **Read every file in the assigned task folder** (README.md, AGENT-PROMPT.md, all of context/, data/, output-spec/) — no exceptions.
2. **Confirm prerequisites are met** (see Dependency Matrix below).
3. **Run the BASELINE CHECK** for your task (see per-task gates below).
4. **Commit to a feature branch** — never push to main directly.
5. **Stop at every HARD STOP** listed in the task's AGENT-PROMPT.md.
6. **Produce evidence** for every destructive or external action (screenshots, diffs, exact counts, file paths).
7. **Write the final report** in the format specified by the task's `output-spec/FINAL-REPORT-TEMPLATE.md` — no improvisation.

If you cannot satisfy any of these, stop and tell the user before proceeding.

### CORE OPERATING PRINCIPLES (top-of-mind for every command)

These four principles override anything else in the task folders if there is a conflict:

1. **Inspect before invoking.** Before running any `pnpm`/`npm`/`yarn` script, read the relevant `package.json` (root + sub-packages) and confirm the script exists. Use the underlying command (`npx tsc`, `next build`, etc.) only when a wrapper script is absent. Never invent commands.

2. **Evidence by relevance, not volume.** Screenshots and logs are evidence of what you found, not proof of effort. Skip screenshots for empty/irrelevant results — use a ledger row (`NO_RELEVANT_RESULTS`) instead. The required minimum per task is listed in its safety gate; add more only when there is something worth showing.

3. **All external/legal data is provisional.** Form fees, edition dates, policy claims, regex format hints — all `provisional` until verified against a live official source (USCIS / Federal Register / eCFR / CBP / DOJ) within the last 30 days. Label as such in the data files. Never ship "definitive" claims based on training memory.

4. **Lockfiles are not yours to repair.** If `pnpm install --frozen-lockfile` fails, stop and report. Do not run `pnpm install` without `--frozen-lockfile` to "fix" the lockfile. Do not delete `node_modules`. Do not modify the lockfile manually. The user decides whether to repair it.

---

### GLOBAL COMMAND RULE

If any later section (including AGENT-PROMPT.md files in task folders) mentions `pnpm typecheck`, `pnpm build`, `pnpm lint`, or `pnpm install`, interpret it through Step 0:

- **install** → always `pnpm install --frozen-lockfile`; never plain `pnpm install` without explicit user approval
- **typecheck** → only if confirmed in `package.json` scripts; otherwise substitute `npx tsc --noEmit -p apps/web/tsconfig.json`
- **build** → only if confirmed in `package.json` scripts; otherwise substitute the underlying Next.js command
- **lint** → only if an explicit `lint` script exists in `package.json` **and** an ESLint or Biome config file is present at the project root or in `apps/web/`; if absent → mark as `SKIPPED`, **not** `FAILED`
- **Never run a script that is not confirmed to exist** — invent nothing

This rule overrides AGENT-PROMPT.md, README.md, and any other file in the task folders.

---

## SAFE EXECUTION ORDER

```
1. TASK-02  Wave 1A site build           ← START HERE (skeleton first)
2. TASK-01  NotebookLM cleanup           ← parallel with TASK-02 OK (different tool)
3. TASK-04  Form Intelligence — I-131 ONLY  ← acceptance test, not all 7 forms
4. TASK-05  Pain Points / Misinfo / FAQ
5. TASK-03  Source Intelligence — 1 channel ONLY  ← acceptance test
6. TASK-06  Monitoring Engine            ← LAST (touches Supabase + GitHub Actions)
```

**Do not run tasks out of order. Do not run "all 7 forms" in TASK-04 or "all 20 channels" in TASK-03 on first pass — only the acceptance-test scope.** Full sweeps come after the acceptance run is verified clean.

---

## DEPENDENCY MATRIX (verify before starting)

| Task | Requires | Verify by running |
|---|---|---|
| TASK-02 | Working repo, pnpm, baseline build | `pnpm install --frozen-lockfile` — then run confirmed typecheck/build from Step 0 (see TASK-02 safety gate); all must pass before changes |
| TASK-01 | NotebookLM access (0665638312@gmail.com) | Open notebooklm.google.com, confirm "USCIS Helper — Source Intelligence" notebook visible |
| TASK-04 | TASK-02 deployed; serviceCards.ts exists | `ls apps/web/data/serviceCards.ts && grep -c "officialSourceUrl" apps/web/data/serviceCards.ts` (must be ≥12) |
| TASK-05 | TASK-04 done; formIntelligence/ has at least i131.ts | `ls apps/web/data/formIntelligence/i131.ts apps/web/data/formIntelligence/types.ts` |
| TASK-03 | TASK-01 done (clean NotebookLM) | Confirm main notebook source count is ~51, not ~78 |
| TASK-06 | TASK-04 done (monitoring needs form data); ideally TASK-05 done; SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env set | `test -n "$SUPABASE_URL" && test -n "$SUPABASE_SERVICE_ROLE_KEY"` |

If a prerequisite fails, **stop and report**. Do not "skip" or "work around" the prerequisite.

---

## PER-TASK SAFETY GATES (override the AGENT-PROMPT.md if it conflicts)

### TASK-02 — Wave 1A site build

**Step 0 — Inspect package scripts BEFORE running any pnpm command:**

The repo is a monorepo. Script names (`typecheck`, `lint`, `build`) may differ between root and `apps/web/`. Some scripts may not exist at all. Discover them first:

```bash
cd /Users/sergiiivanenko/work/uscis-helper

# Inspect repo structure
cat package.json | jq '.scripts // {}'
cat apps/web/package.json | jq '.scripts // {}'
pnpm -r list --depth -1 2>/dev/null || pnpm list --depth 0

# Note which scripts exist. Examples:
#   - typecheck: may be `tsc --noEmit` or `pnpm --filter web typecheck` or absent
#   - lint: may exist or may be Next.js built-in only (no separate script)
#   - build: usually `next build` via `pnpm --filter web build`
```

**Use only scripts that exist.** If a script is absent, substitute the underlying command directly (e.g. `npx tsc --noEmit -p apps/web/tsconfig.json` if no `typecheck` script exists). If neither a script nor a clear underlying command is available, mark that check as `SKIPPED` in the baseline report — do not invent commands.

**Baseline check (REQUIRED before any code change):**

```bash
git status                                  # must be clean or known state
git log --oneline -3                        # note current HEAD

# Install — use frozen-lockfile, but DO NOT auto-fix on failure
pnpm install --frozen-lockfile
# If this fails: STOP, report. Do not run `pnpm install` without `--frozen-lockfile`
# to "repair" the lockfile — that's a user decision.

# Run only scripts confirmed to exist in step 0:
pnpm --filter web typecheck   # if exists
pnpm --filter web lint        # if exists AND ESLint/Biome config present; otherwise SKIPPED
pnpm --filter web build       # if exists
```

**If baseline fails:** STOP. Report exit codes and last 30 lines of output. Do not attempt to "fix" baseline failures as part of this task — that's a separate decision the user must make. In particular: do not run `pnpm install` without `--frozen-lockfile` to repair a broken lockfile, do not bypass typecheck errors, do not delete `node_modules` without permission.

**If baseline passes:** create feature branch, then proceed.

**Phased execution (do NOT do everything in one commit):**

Phase 1 — Foundation (commit after each):
- (a) Design tokens in `tailwind.config.ts` only
- (b) i18n routing config (4 locales)
- (c) `serviceCards.ts` data layer
- After each → run confirmed typecheck/build commands from Step 0 → commit

Phase 2 — Components:
- (d) Layout components (Header, Footer, MobileBottomBar)
- (e) Brand Logo component
- (f) Home section components
- After each → typecheck + build → commit

Phase 3 — Pages:
- (g) Homepage assembling sections
- (h) Service page template
- (i) Static pages (privacy, terms, contact, about, faq, services index)
- After each → typecheck + build → commit

Phase 4 — Polish:
- (j) i18n message files (en first, then ru/uk/es)
- (k) Brand assets (icons, manifest, og)
- (l) vercel.json + sitemap + robots
- (m) Brand safety greps + key parity diffs
- After each → typecheck + build → commit

**Acceptance gate before pushing to GitHub:**

```bash
# Run only scripts confirmed to exist (per Step 0 inspection)
# All confirmed scripts must succeed
pnpm --filter web typecheck   # if exists
pnpm --filter web lint        # if exists AND ESLint/Biome config present; otherwise SKIPPED
pnpm --filter web build       # required — must succeed

# Brand safety — must return 0 lines
grep -RE "USCIS Helper" apps/web/app apps/web/components apps/web/messages | wc -l
grep -RE "AI-powered|AI-assisted|AI lawyer|AI legal advice" apps/web/app apps/web/components apps/web/messages | wc -l
grep -RE "Certified Translation" apps/web/messages | wc -l

# i18n key parity — must return empty diffs
jq -r 'paths(scalars) | join(".")' apps/web/messages/en.json | sort > /tmp/en.keys
for loc in ru uk es; do
  jq -r 'paths(scalars) | join(".")' apps/web/messages/$loc.json | sort > /tmp/$loc.keys
  diff /tmp/en.keys /tmp/$loc.keys
done
```

If any check fails → STOP, do not push. Fix or report.

**Acceptance gate after Vercel deploy:**

Run all 17 checks from `output-spec/VERIFICATION-CHECKLIST.md`. Save output to `/tmp/wave-1a-verification.txt`. If fewer than 80 routes return HTTP 200, the task is INCOMPLETE — do not mark as PASS in final report.

---

### TASK-01 — NotebookLM cleanup

**Evidence requirement (no exceptions):**
- Screenshot before AND after every deletion (at minimum: first 3 deletions, then every 5th)
- Screenshot of every quarantine move
- Screenshot of every P0 video re-import (showing the new title with `[video_id]` prefix visible)
- Initial state screenshot (`00-initial-state.png`)
- Final state screenshot (`99-main-final.png` and `99-quarantine-final.png`)

**Counting rule (cannot be skipped):**
- Initial source count: record exact number
- Final source count: record exact number
- Quarantine count: must be exactly 7
- P0 video count with `[video_id]` prefix: must be exactly 6

If you cannot produce screenshot evidence for an action, that action did not happen — log it as `NOT_DONE` in the report, do not claim success.

**Hard stop:** If NotebookLM UI has changed and you cannot find the expected buttons/menus, stop immediately. Do not click around to "figure it out" — describe what you see and ask.

---

### TASK-04 — Form Intelligence (acceptance run: I-131 ONLY)

**Override the AGENT-PROMPT.md instruction to "process all 7 forms".** First run handles only I-131.

**Reason:** USCIS PDF parsing breaks in subtle ways. We need to confirm the extraction pipeline works on one form before committing 7 forms of effort.

**Acceptance test scope:**
1. Process I-131 only (Re-parole / Travel Document)
2. Generate `apps/web/data/formIntelligence/types.ts`
3. Generate `apps/web/data/formIntelligence/i131.ts`
4. Generate `docs/forms/i131.md`
5. Verify TypeScript compiles
6. Verify edition_date matches current USCIS PDF header
7. Verify all `official_url` values HEAD-check 200/301/302
8. Verify `common_mistakes_from_research` matches `data/common-mistakes-by-form.md` for I-131
9. Write a short acceptance report

**If I-131 acceptance passes:** stop, hand the report to the user, wait for "proceed with remaining 6 forms" instruction.

**If I-131 acceptance fails:** stop, report what broke, do not proceed.

**Forbidden behaviors:**
- Inventing fields that aren't in the official USCIS PDF
- Using cached/training-data knowledge of I-131 instead of fetching the current PDF
- Marking edition_date as "current" without confirming via the PDF header
- Filling fees from memory instead of confirming via Form G-1055

If you can't extract a field from the PDF, mark `source_type: 'not_confirmed'` with a note. Do not guess.

---

### TASK-05 — Pain Points / Misinfo / FAQ DB

**No special override.** Follow AGENT-PROMPT.md as written, with one addition:

**URL verification gate:**

Before committing, every `truth_source_url` (in misinformation.ts) and every URL in `official_source_urls` (in faqAnswers.ts) must HEAD-check to 200/301/302. Run:

```bash
grep -hoE 'https://[^"]+' \
  apps/web/data/misinformation.ts \
  apps/web/data/faqAnswers.ts \
  apps/web/data/painPoints.ts | \
  sort -u | \
  while read url; do
    code=$(curl -sI -o /dev/null -w "%{http_code}" -m 10 "$url")
    echo "$code $url"
  done > /tmp/url-check.txt

# Any non-2xx/3xx URL must be removed or replaced before commit
grep -vE "^(2[0-9]{2}|3[0-9]{2})" /tmp/url-check.txt
```

If non-2xx/3xx URLs remain in the data, the task is INCOMPLETE.

**Copyright gate:** Before commit, scan output files for direct quotes from forensic audit content longer than 15 words. If found, paraphrase before commit.

---

### TASK-03 — Source Intelligence (acceptance run: 1 channel ONLY)

**Override the AGENT-PROMPT.md instruction "process channels in priority order".** First run handles **only the first available P0 channel** (`@Immigraciya_in_usa` if accessible — `@ukrainiansinusa` is already done).

**Acceptance test scope (1 channel):**
1. Open the channel, take screenshot of channel page
2. Read About tab, extract metadata, screenshot
3. Run all 30 search queries (10 topics × 3 languages), screenshot each result page
4. Select top 3 videos per topic by view count (max ~30 videos selected)
5. Extract video_ids from URLs
6. Import top 3 videos to NotebookLM with `[video_id]` prefix in titles, screenshot each import
7. Query NotebookLM for claims on those 3 videos
8. Verify each claim against Tier 1 sources from `data/tier1-sources.csv`
9. Write per-channel report following `output-spec/PER-CHANNEL-REPORT-TEMPLATE.md`
10. **Stop. Wait for user "next" instruction.**

**Evidence requirement (relevance-based, not exhaustive):**

- Channel page screenshot (`01-{source_id}-channel.png`) — REQUIRED
- About tab screenshot (`02-{source_id}-about.png`) — REQUIRED
- 3 NotebookLM import screenshots showing renamed titles with `[video_id]` prefix — REQUIRED
- 3 claims-extraction screenshots from NotebookLM chat — REQUIRED
- Search result screenshots (`03-{source_id}-search-{topic}-{lang}.png`) — **only when search returns relevant results**
  - For 30 search queries, do NOT take 30 screenshots if half of them return zero or irrelevant videos
  - Take a screenshot only if the search returned at least one immigration-related video
  - For empty/irrelevant searches, log a ledger row instead: `{topic},{lang},NO_RELEVANT_RESULTS` to `/tmp/source-intel/screenshots/{source_id}/search-ledger.csv`
- **Minimum total screenshots: 10** (channel + about + 3 imports + 3 claims + at least 2 relevant search results = 10)
- Maximum useful screenshots: ~20 (more than that wastes time on filing rather than analysis)

If you cannot produce the REQUIRED screenshots above, do not claim that step succeeded. The relevance-based ones are evidence of what you actually found, not proof of attempt.

**Forbidden behaviors:**
- Processing more than one channel without user approval
- Importing duplicate videos to NotebookLM (skip with `ALREADY_PRESENT`)
- Marking a claim as `verified` without a Tier 1 URL backing it
- Copying full transcripts to output files (DMCA risk — paraphrase only)

---

### TASK-06 — Monitoring Engine

**Run last.** No prior task must be in-flight when this runs.

**Pre-flight checks (REQUIRED before any work):**

```bash
# 1. Form intelligence files exist (TASK-04 done)
ls apps/web/data/formIntelligence/types.ts apps/web/data/formIntelligence/i131.ts

# 2. Pain points / misinfo data exists (TASK-05 ideally done)
ls apps/web/data/painPoints.ts apps/web/data/misinformation.ts apps/web/data/faqAnswers.ts

# 3. Supabase env vars set (do NOT print values)
test -n "$SUPABASE_URL" && echo "SUPABASE_URL set" || echo "MISSING SUPABASE_URL"
test -n "$SUPABASE_SERVICE_ROLE_KEY" && echo "SERVICE ROLE KEY set" || echo "MISSING"

# 4. GitHub CLI authenticated
gh auth status
```

If any precheck fails → STOP, ask user to set up the missing piece.

**Phased execution:**

Phase A — Database:
- Apply Supabase migration in a NEW migration file (do not modify existing migrations)
- Verify tables created via SELECT count from each
- Verify RLS policies in place

Phase B — Scripts:
- Create `scripts/monitoring/lib/*` (supabase-client, email, hash)
- Create one monitoring script (start with `check-dead-links.ts` — safest, no external API rate limits)
- Run it locally — verify it inserts rows into `dead_links_log`
- Then create remaining scripts

Phase C — Workflows:
- Create one workflow file (`dead-link-checker.yml`)
- Trigger manually via `gh workflow run dead-link-checker.yml`
- Verify it ran successfully via `gh run list`
- Then create remaining workflows

Phase D — Seed sources:
- Run `seed-sources.ts` to insert initial monitoring_sources rows
- Verify via SELECT count

**Forbidden behaviors:**
- Auto-executing `set-github-secrets.sh` (user must review and run manually)
- Scraping `egov.uscis.gov` or `i94.cbp.dhs.gov` (forbidden by ToS)
- Bypassing rate limits (1 req/2s for USCIS, 30 req/min for Federal Register)
- Committing secrets to git
- Modifying existing Supabase tables (only add new ones)

**YouTube channel_id problem (acknowledge before starting):** The `monitoring-sources-seed.csv` uses `?user=...` URLs which may not work for all channels. The `youtube-monitor.yml` workflow may fail for channels without `?user=` aliases. Two options:
1. Use YouTube Data API `channels.list?forHandle=@handle` to convert handles to channel IDs (requires YOUTUBE_API_KEY)
2. Manually look up channel IDs for each row (visit channel page, view source, find `channel_id`)

Pick option 2 for the acceptance run (manual lookup of 3-5 channels). Document in the final report. Option 1 is a follow-up after Resend setup.

---

## UNIVERSAL RULES (apply to every task)

### Evidence and reporting

For every action that touches external systems (deletes, imports, deploys, API calls):

- **State the action before doing it** ("I am about to delete X")
- **Take evidence at the moment** (screenshot, file diff, exit code, exact count)
- **Verify the result** (re-query the system to confirm the change)
- **Log to the evidence file** for that task

If you cannot produce evidence, the action did not happen.

### Reporting honesty

When writing the final report, distinguish between:

- **DONE** — completed and verified with evidence
- **PARTIAL** — started but did not finish; describe how far you got
- **NOT_DONE** — did not attempt
- **FAILED** — attempted, failed; describe the error

Do not claim DONE without evidence. Do not write "everything is ready" if there are PARTIAL or FAILED items — list them explicitly.

If the task instructed "process all 7 forms" but you only processed I-131 (per the acceptance gate above), the report says: "Acceptance scope: 1 of 7 forms processed (I-131). Remaining 6 forms PENDING user approval to proceed."

### Provisional data labeling

All external/legal data extracted by agents is **provisional** until verified against an official source within the last 30 days:

- **Form fees, edition dates, processing times** — label `provisional` until confirmed via the live USCIS form page (not memory, not training data)
- **Receipt number regex / format checks** — label as `format_hint`, not `eligibility_validator`. The UI must say "format check" not "valid receipt"
- **TPS/parole policy claims** — label `provisional` until confirmed via Federal Register notice with publication date
- **Translation requirements, fee waiver eligibility** — label `provisional` until confirmed via eCFR or USCIS Policy Manual
- **Common mistakes, pain points** — label with `last_verified` date; rely on community research only when no official source addresses the topic

Provisional data is OK to ship as long as it is labeled and dated. Unlabeled "definitive" data based on training memory is NOT OK.

### Forbidden behaviors (every task)

- Modifying `/Users/sergiiivanenko/handy-friend-landing-v6` (read-only)
- Modifying `/Users/sergiiivanenko/work/messenginfo-merge` (read-only)
- Modifying global git config or shell rc files
- Committing secrets to git or printing secret values to logs
- Force-pushing to any branch
- Deleting git history
- Running `rm -rf` outside `/tmp/`
- Bypassing rate limits on external APIs
- Auto-executing scripts that the AGENT-PROMPT marks as "user must run manually"
- Marking work as DONE without evidence
- Inventing data when the official source is unavailable

### Hard stops (every task)

Stop and report immediately if:
- Build, typecheck, or lint fails after your changes (when baseline passed before)
- A no-touch folder shows modifications
- A secret is found committed
- An external API returns 429 (rate limited) more than twice
- A claimed external action cannot be verified
- The task's evidence requirement cannot be met
- A user-only action (creating accounts, entering payments, accepting agreements) is encountered

When you stop: write the stop reason to `/tmp/{task-name}-stop-report.md` and output the path. Do not retry silently.

---

## INVOCATION TEMPLATE

When the user assigns you a task, they will say:

> "Execute TASK-NN. Read the master prompt and the task folder, follow the safety gates."

Your first response should be:

1. **Confirm the task and prerequisites:** "Executing TASK-NN. Verifying prerequisites: [list from Dependency Matrix]."
2. **Run the baseline check** for that task.
3. **Report baseline result** before doing any work.
4. **Wait for user "proceed" if baseline shows any unexpected state**, otherwise begin Phase 1.
5. **Stop at every phase boundary**, run confirmed typecheck/build commands from Step 0, commit, then continue.
6. **Stop at every HARD STOP** and report.
7. **Write final report** in the format specified by the task's `output-spec/FINAL-REPORT-TEMPLATE.md`.

---

## RISK CONTROL SUMMARY

| Risk | Severity | Control |
|---|---|---|
| Agent fakes completion | Critical | Evidence gates: screenshots, diffs, exact counts, file paths required |
| TASK-02 breaks build | High | Baseline typecheck/build before any change; phased commits with checks between phases |
| TASK-03 drowns in 20 channels | Critical | Acceptance run is 1 channel only; user must approve before next |
| TASK-04 invents form fields | Critical | Acceptance run is 1 form only (I-131); USCIS PDF is the only source; `not_confirmed` for missing data |
| TASK-06 pollutes Supabase / GitHub Actions | High | Run last; phased execution; manual workflow triggers before scheduling |
| Receipt regex misses new prefix | Low | Documented as **format hint, not eligibility validation**. UI must label it "format check" not "valid receipt". When regex fails, prompt user to verify their input rather than blocking submission. New USCIS prefixes (rare) will be caught by user feedback. |
| YouTube channel_id mismatch | Medium | Acceptance run uses 3-5 manually-looked-up IDs; full sweep deferred |
| Rate-limit ban | Medium | Documented limits; exponential backoff; max 5 retry attempts |
| Copyright drift | Medium | 15-word quote limit; URL verification gate before commit |

---

## END-OF-TASK CHECKLIST (every task)

Before declaring a task complete:

- [ ] All phases passed their typecheck/build gates (lint counted only if confirmed present)
- [ ] All hard stops were honored (zero silent retries)
- [ ] Evidence files exist for every external action claimed
- [ ] Final report written in the format from `output-spec/FINAL-REPORT-TEMPLATE.md`
- [ ] Final report distinguishes DONE / PARTIAL / NOT_DONE / FAILED for every sub-task
- [ ] Branch pushed; PR not yet merged (user reviews before merge)
- [ ] No secrets committed
- [ ] No no-touch folders modified
- [ ] No-go items (rate limits, copyright, ToS) all respected

If any item is unchecked, the task is not complete. Report what's missing instead of claiming PASS.

---

## END
