# Form Intelligence — Final Report TEMPLATE

Save as `docs/reports/form-intelligence-report.md`.

---

# Form Intelligence Report

**Date**: [ISO timestamp]
**Branch**: [branch name]
**Commit**: [SHA]

## Forms processed

| Form | TS file | MD spec | Edition | Field count | Fees match G-1055 | Status |
|---|---|---|---|---|---|---|
| I-131 | apps/web/data/formIntelligence/i131.ts | docs/forms/i131.md | 04/01/24 | 47 | ✅ | DONE |
| I-765 | ... | ... | ... | ... | ... | ... |
| I-821 | ... | ... | ... | ... | ... | ... |
| I-912 | ... | ... | ... | ... | ... | ... |
| G-1145 | ... | ... | ... | ... | ... | ... |
| AR-11 | ... | ... | ... | ... | ... | ... |
| I-589 | ... | ... | ... | ... | ... | ... |

## Total fields extracted: [N]

## Edition discrepancies

[List any forms where extracted edition_date couldn't be confirmed against current USCIS PDF — needs manual review]

## Fee discrepancies vs G-1055

[List any fees that don't match the official G-1055 schedule — flag for user review before publishing]

## Dead links

[List any official URLs that returned non-200 — these need replacement]

## Service card URL mismatches

For each form, compared form's `official_url` vs `serviceCards.ts` `officialSourceUrl`:

| Form | Service slug | serviceCards URL | Form intel URL | Match |
|---|---|---|---|---|
| I-131 | re-parole-u4u | https://www.uscis.gov/humanitarian/uniting-for-ukraine | https://www.uscis.gov/i-131 | Different (acceptable — landing vs form) |
| ... | | | | |

[Flag any unexpected mismatches for Wave 1.5 review]

## TypeScript compile status

```
$ pnpm --filter web typecheck
[paste output — must show no errors]
```

## Next recommended step

After this task: TASK-05 (Pain Points DB) consumes this data plus forensic audit research to build the pain points / misinformation / FAQ databases that will power Wave 1.5 service page content.

---

**Built by**: Claude Code (TASK-04 Agent)
