# TASK-03 — Source Intelligence Audit

**For**: Claude in Chrome (browser) + Claude Code (file output)
**Duration**: 4-8 hours, processed channel-by-channel with user approval between channels
**Outcome**: 20 source-reports + verified-claims database + creator-contacts database
**Prerequisite**: TASK-01 complete (clean NotebookLM)

---

## FOLDER LAYOUT

```
TASK-03-source-intelligence/
├── README.md                          ← THIS FILE
├── AGENT-PROMPT.md                    ← Main prompt
├── context/
│   ├── PROJECT-STATE.md
│   └── TIER-DEFINITIONS.md           ← What "verified" means + Tier 1 source list
├── data/
│   ├── target-channels.csv           ← 20 channels in priority order
│   ├── search-terms-matrix.csv       ← 10 topics × 3 languages = 30 queries per channel
│   └── tier1-sources.csv             ← Authoritative sources for verification
└── output-spec/
    ├── PER-CHANNEL-REPORT-TEMPLATE.md
    └── DATABASE-SCHEMAS.md           ← Output CSV/JSON schemas
```

---

## EXECUTION

This task is **stop-and-go**. After EACH channel, agent stops and produces a per-channel report. User reviews, approves, then says "next" to continue.

Reason: 20 channels × 30 search queries = 600 search operations. Errors compound. Catching issues channel-by-channel keeps the data clean.

1. Open Claude in Chrome
2. Tell it: "Read AGENT-PROMPT.md and start with channel #1 from data/target-channels.csv. Stop after channel report 1."
3. Review channel 1 report
4. Say "process channel 2"
5. Repeat through channel 20

---

## SUCCESS CRITERIA

- 20 per-channel reports in `/tmp/source-intel/source-reports/`
- Aggregated `database/verified-claims.csv` (target: 100+ verified claims)
- Aggregated `database/rejected-claims.csv`
- Aggregated `database/creator-contacts.csv`
- Aggregated `database/official-sources.json`
- Every claim marked `verified` has a Tier 1 URL backing it

---

## YT-SOURCE-01 IS ALREADY DONE

Channel `@ukrainiansinusa` (YT-SOURCE-01) was processed in a prior session. Skip in this run unless user explicitly requests refresh. Report file should already exist at `/Users/sergiiivanenko/work/uscis-helper/source-reports/YT-SOURCE-01-report.md`.
