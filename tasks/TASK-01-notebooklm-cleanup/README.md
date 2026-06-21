# TASK-01 — NotebookLM Cleanup

**For**: Claude in Chrome (browser automation extension)
**Account**: 0665638312@gmail.com (must be logged in before starting)
**Notebook**: "USCIS Helper — Source Intelligence"
**Duration**: 30-60 minutes
**Outcome**: 78 sources → 51 clean sources, 7 in QUARANTINE notebook, 6 P0 videos re-imported with video_id in titles

---

## FOLDER LAYOUT

```
TASK-01-notebooklm-cleanup/
├── README.md                          ← THIS FILE
├── AGENT-PROMPT.md                    ← Paste this into Claude in Chrome
├── context/
│   └── PROJECT-STATE.md              ← Why this cleanup matters
├── data/
│   ├── delete-list.csv               ← 27 sources to delete (with reasons)
│   ├── quarantine-list.csv           ← 7 sources to move
│   └── reimport-p0-videos.csv        ← 6 P0 videos with video_ids
└── output-spec/
    ├── EVIDENCE-RULES.md             ← Screenshot requirements
    └── FINAL-REPORT-TEMPLATE.md      ← Format agent must use
```

---

## EXECUTION

1. Open Chrome, log into NotebookLM (0665638312@gmail.com)
2. Open Claude in Chrome extension
3. Tell it: "Read AGENT-PROMPT.md from this folder and execute. Use the CSV files in data/ as your work lists."
4. Wait for cleanup-report.md.

---

## SUCCESS CRITERIA

- Source count: 78 → 51 (-27)
- QUARANTINE notebook contains exactly 7 sources
- 6 P0 videos in main notebook with `[video_id]` prefix in title
- Final screenshot shows clean source list
- All actions documented with before/after screenshots

---

## SAFETY

- NEVER delete a source not in `data/delete-list.csv` or `data/quarantine-list.csv`
- NEVER delete other notebooks (only operate inside "USCIS Helper — Source Intelligence")
- If a source from delete-list isn't found → log "NOT FOUND" and continue
