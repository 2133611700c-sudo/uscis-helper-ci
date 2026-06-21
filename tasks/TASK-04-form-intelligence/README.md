# TASK-04 — Form Intelligence Files

**For**: Claude Code (with PDF extraction + web fetch)
**Working dir**: `/Users/sergiiivanenko/work/uscis-helper`
**Duration**: 2-4 hours
**Outcome**: 7 USCIS forms parsed into structured TS + MD specs ready for Wave 2 product flows
**Prerequisite**: TASK-02 done (Wave 1A live)

---

## FOLDER LAYOUT

```
TASK-04-form-intelligence/
├── README.md                          ← THIS FILE
├── AGENT-PROMPT.md
├── context/
│   └── PROJECT-STATE.md
├── data/
│   ├── target-forms.csv              ← 7 forms in priority order
│   ├── critical-fields-checklist.md  ← Identity/immigration/physical/contact/family
│   ├── common-mistakes-by-form.md    ← Pre-validated mistakes from research
│   └── types.ts.template             ← Shared TypeScript types
└── output-spec/
    ├── FORM-FILE-TEMPLATE.ts         ← Per-form TS file shape
    ├── FORM-SPEC-TEMPLATE.md         ← Per-form MD spec shape
    └── FINAL-REPORT-TEMPLATE.md
```

---

## EXECUTION

1. Open Claude Code in repo
2. Tell it: "Read AGENT-PROMPT.md and execute. Process forms in priority order from data/target-forms.csv. Stop after each form for verification."
3. Review each form output before next form

---

## SUCCESS CRITERIA

- 7 TS files: `apps/web/data/formIntelligence/{slug}.ts`
- 7 MD specs: `docs/forms/{slug}.md`
- 1 shared types file: `apps/web/data/formIntelligence/types.ts`
- All edition_dates match current USCIS PDFs (verified)
- All fees match current G-1055 schedule
- All officialSourceUrl values HEAD-checked alive
- TypeScript compiles
- No verbatim USCIS PDF copy (paraphrased + cited)
