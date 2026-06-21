# TASK-05 — Pain Points / Misinformation / FAQ Database

**For**: Claude Code
**Working dir**: `/Users/sergiiivanenko/work/uscis-helper`
**Duration**: 1-2 hours
**Outcome**: 3 structured databases ready to power Wave 1.5 service page content + future Telegram bot answers
**Prerequisite**: TASK-04 done

---

## FOLDER LAYOUT

```
TASK-05-pain-misinfo-faq/
├── README.md                          ← THIS FILE
├── AGENT-PROMPT.md
├── context/
│   └── PROJECT-STATE.md
├── data/
│   ├── pain-points-seed.csv          ← 35 validated pain points
│   ├── misinformation-seed.csv       ← 15 active false claims
│   ├── faq-seed.csv                  ← 30 FAQ topics × 4 langs = 120 entries
│   └── types.ts.template             ← TypeScript schemas
└── output-spec/
    ├── HELPER-FUNCTIONS-SPEC.md      ← Helper fns to expose data to components
    ├── COPYRIGHT-SAFETY-RULES.md     ← Paraphrasing/quote limits
    └── FINAL-REPORT-TEMPLATE.md
```

---

## EXECUTION

1. Open Claude Code in repo
2. Tell it: "Read AGENT-PROMPT.md and execute. Convert seed CSVs into TS data files."
3. Review final report

---

## SUCCESS CRITERIA

- `apps/web/data/painPoints.ts` — 35 entries
- `apps/web/data/misinformation.ts` — 15 entries
- `apps/web/data/faqAnswers.ts` — 120 entries (30 questions × 4 languages)
- `apps/web/data/painPoints/types.ts` — shared schemas
- `apps/web/lib/painPoints.ts` — helper functions
- `docs/research/pain-points-source-map.md` — provenance for each entry
- TypeScript compiles
- All `truth_source_url` HEAD-checked alive
- No copyright violations (no verbatim quotes > 15 words from forensic audits)
