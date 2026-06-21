# NotebookLM Cleanup Report — TEMPLATE

Save as `/tmp/notebooklm-cleanup/cleanup-report.md`.

---

# NotebookLM Cleanup Report

**Date**: [ISO timestamp]
**Notebook**: USCIS Helper — Source Intelligence
**Account**: 0665638312@gmail.com

## Summary

| Metric | Before | After | Delta |
|---|---|---|---|
| Sources in main notebook | [N] | [N] | [-N] |
| Sources in QUARANTINE | 0 | 7 | +7 |
| Sources with `[video_id]` prefix | 0 | 6 | +6 |

Target was: 78 → 51 in main, 7 in QUARANTINE.
Actual: [actual delta] — [PASS/PARTIAL/FAIL]

## Section 1 — Deletions

Total deletions attempted: [N]
Successful: [N]
NOT_FOUND: [N]
Failed: [N]

| row_id | title | result |
|---|---|---|
| [from delete-list.csv with status filled in] |

## Section 2 — Quarantine moves

Total moves attempted: 7
Successful: [N]
URL_NOT_FOUND: [N]
Failed: [N]

| row_id | title | result |
|---|---|---|
| [from quarantine-list.csv with status filled in] |

## Section 3 — P0 video re-imports

Total imports attempted: 6
Successful: [N]
ALREADY_PRESENT: [N]
Failed: [N]

| video_id | channel | new title | result |
|---|---|---|---|
| [from reimport-p0-videos.csv with status filled in] |

## Section 4 — Evidence

Screenshots saved: [N]
Directory: `/tmp/notebooklm-cleanup/screenshots/`

Key screenshots:
- `00-initial-state.png` — initial source count visible
- `01-quarantine-created.png` — QUARANTINE notebook exists
- `99-main-final.png` — main notebook clean
- `99-quarantine-final.png` — QUARANTINE has 7 sources

Full screenshot list: see `evidence-log.csv`.

## Section 5 — Errors encountered

[List any unexpected errors, UI issues, session problems]

## Section 6 — Recommendations

[Any sources you noticed that should be deleted or quarantined but weren't on the lists — surface for user to add to next cleanup pass]

---

**Executed by**: Claude in Chrome
**Spec**: TASK-01 v1
