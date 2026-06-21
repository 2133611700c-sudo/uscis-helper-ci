# Messenginfo Agent Tasks — 6 folders, no manual work

Each folder is a self-contained task for an AI agent (Claude Code, Cursor, Claude in Chrome). The agent reads `README.md` then `AGENT-PROMPT.md`, then everything in `context/` `data/` `output-spec/`, then executes.

You don't write code. You don't run greps. You don't fill CSVs. The folder contains all required input.

## Your job

For each task in execution order:

1. Open the right agent (see "Tool" column below)
2. Hand it the folder
3. Tell it: *"Read README.md and AGENT-PROMPT.md from this folder, then execute the task. All context is here."*
4. Wait for the final report
5. Skim the report. If it says PASS → next task. If it says STOP → fix the flagged issue, then continue.

That's it. No code. No copy-paste of prompts. No manual data entry.

---

## Execution order

```
TASK-01  NotebookLM cleanup        ──┐
                                     ├── parallel (different tools)
TASK-02  Wave 1A site build        ──┘

           ↓ (TASK-02 must be done before)

TASK-04  Form Intelligence

           ↓ (TASK-04 must be done before)

TASK-05  Pain Points / Misinfo / FAQ

           ↓ (TASK-04 must be done; TASK-05 strongly preferred)

TASK-06  Daily Monitoring Engine

           ↓ (anytime after TASK-01; long-running)

TASK-03  Source Intelligence Audit  (4-8 hours, channel-by-channel)
```

---

## Task summary

| # | Task | Tool | Time | Output |
|---|---|---|---|---|
| **TASK-01** | NotebookLM cleanup | **Claude in Chrome** | 30-60 min | 78→51 sources, 7 quarantined, 6 P0 videos with video_id |
| **TASK-02** | Wave 1A site build | **Claude Code / Cursor** | 30-60 min | messenginfo.com with 80 routes, 4 locales, 12 services |
| **TASK-03** | Source intelligence audit | **Claude in Chrome + Code** | 4-8 hr (split) | 20 channel reports + verified-claims DB |
| **TASK-04** | Form Intelligence Files | **Claude Code** | 2-4 hr | 7 USCIS forms parsed: TS + MD specs |
| **TASK-05** | Pain points / misinfo / FAQ | **Claude Code** | 1-2 hr | 35 + 15 + 120 entries, helper functions |
| **TASK-06** | Monitoring engine | **Claude Code** | 2-3 hr | 5 GitHub Actions + 4 Supabase tables + scripts |

---

## Per-task quick start

### TASK-01 (NotebookLM cleanup)
1. Log into NotebookLM as `0665638312@gmail.com`
2. Open Claude in Chrome extension
3. *"Read TASK-01-notebooklm-cleanup/README.md and AGENT-PROMPT.md, then execute. Use the CSVs in data/."*

### TASK-02 (Wave 1A build) — START HERE FIRST
1. Open Cursor / Claude Code in `/Users/sergiiivanenko/work/uscis-helper`
2. *"Read TASK-02-wave-1a-build/README.md and AGENT-PROMPT.md, then execute."*

### TASK-03 (Source Intelligence)
1. Open Claude in Chrome (logged into both Google accounts)
2. *"Read TASK-03-source-intelligence/AGENT-PROMPT.md. Process channels one at a time. Stop after each report and wait for me to say 'next'."*
3. Reply "next" 19 more times across multiple sessions

### TASK-04 (Form Intelligence)
1. Claude Code in repo
2. *"Read TASK-04-form-intelligence/README.md and AGENT-PROMPT.md, then execute. Process forms one at a time."*

### TASK-05 (Pain / Misinfo / FAQ)
1. Claude Code in repo (after TASK-04)
2. *"Read TASK-05-pain-misinfo-faq/README.md and AGENT-PROMPT.md, then execute."*

### TASK-06 (Monitoring)
1. Claude Code in repo (after TASK-04, ideally after TASK-05)
2. *"Read TASK-06-monitoring-engine/README.md and AGENT-PROMPT.md, then execute."*
3. After agent commits, set GitHub secrets via the generated `set-github-secrets.sh`
4. Wait for first daily digest email (next morning)

---

## Folder structure (every task)

```
TASK-NN-name/
├── README.md            ← What success looks like
├── AGENT-PROMPT.md      ← The prompt the agent executes
├── context/             ← Background the agent must read
├── data/                ← Input data: CSVs, templates, schemas
└── output-spec/         ← Templates for outputs + verification
```

Agent reads everything, writes outputs to repo / `/tmp/`, produces a final report.

---

## Parallelization rules

**Can run at the same time:**
- TASK-01 (Chrome) + TASK-02 (Code) — different tools, no conflicts

**Cannot run at the same time:**
- TASK-04 + TASK-05 — both write to `apps/web/data/`
- TASK-03 + TASK-01 — both touch NotebookLM
- TASK-06 alone — touches `.github/workflows/`, `scripts/`, `supabase/migrations/` (no conflict with others as long as those tasks aren't running)

**Continuous after install:**
- TASK-06 — once installed, GitHub Actions run on schedule. No further action.

---

## Realistic time investment

- **Agent work**: 12-20 hours total
- **Your monitoring**: ~80 minutes (5-15 min per task to review reports)
- **Calendar time**: 1-2 weeks (TASK-03 spreads naturally across days)

---

## What you do NOT do

- ❌ Write any code
- ❌ Edit any CSV manually
- ❌ Run greps yourself
- ❌ Decide design tokens
- ❌ Translate i18n strings
- ❌ Map fields to source documents
- ❌ Set up cron schedules

All of that is encoded in the folders. Agents do it.

---

## What you DO do

- ✅ Hand each folder to the right agent
- ✅ Read final reports (skim — they have a clear PASS/FAIL section at the top)
- ✅ Reply "next" to TASK-03 between channels
- ✅ Run `gh secret set ...` after TASK-06 (one-time secret setup)
- ✅ Sign up for Resend at some point (optional — TASK-06 works without it)

---

## If an agent gets stuck

Each AGENT-PROMPT.md has a "HARD STOPS" section at the bottom listing exact conditions under which the agent must stop and ask you. If you see "STOP: ask user" in the agent's output:

1. Read what it's asking
2. If you can answer → answer
3. If you can't → bring the question back to me, I'll answer

Don't let the agent bypass HARD STOPS. They exist to prevent silent damage (committed secrets, broken builds, deleted data).

---

## Source of truth

All decisions about scope, brand, design tokens, legal boundaries are encoded in `context/` folders inside each task. If you ever wonder "why does the agent want X?" — the answer is in `context/PROJECT-STATE.md` or `context/SAFETY-RULES.md` of the relevant task.

If something needs to change globally (e.g. brand identity decision changes), update the relevant context file BEFORE running the affected task.
