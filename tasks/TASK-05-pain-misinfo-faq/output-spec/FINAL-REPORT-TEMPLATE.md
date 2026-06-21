# Pain Points / Misinfo / FAQ — Final Report TEMPLATE

Save as `docs/reports/pain-misinfo-faq-report.md`.

---

# Pain Points / Misinformation / FAQ Report

**Date**: [ISO timestamp]
**Branch**: [branch name]
**Commit**: [SHA]

## Files created

| File | Lines | Entries |
|---|---|---|
| `apps/web/data/painPoints/types.ts` | [N] | (types only) |
| `apps/web/data/painPoints.ts` | [N] | 35 pain points |
| `apps/web/data/misinformation.ts` | [N] | 15 misinformation entries |
| `apps/web/data/faqAnswers.ts` | [N] | 120 FAQ entries (30 × 4 langs) |
| `apps/web/lib/painPoints.ts` | [N] | (helper functions) |
| `docs/research/pain-points-source-map.md` | [N] | (provenance) |

## Coverage by service

| service_card_slug | pain_points | misinformation | faqs (EN) |
|---|---|---|---|
| parole-expires-soon | [N] | [N] | [N] |
| re-parole-u4u | [N] | [N] | [N] |
| tps-ukraine | [N] | [N] | [N] |
| ead-work-permit | [N] | [N] | [N] |
| i-94 | [N] | [N] | [N] |
| uscis-case-status | [N] | [N] | [N] |
| payment-problem | [N] | [N] | [N] |
| biometrics | [N] | [N] | [N] |
| rfe-denial | [N] | [N] | [N] |
| translate-document | [N] | [N] | [N] |
| form-draft-helper | [N] | [N] | [N] |
| official-sources | [N] | [N] | [N] |

## Severity distribution (pain points)

| severity | count |
|---|---|
| critical | [N] |
| high | [N] |
| medium | [N] |
| low | [N] |

## TypeScript compile status

```
$ pnpm --filter web typecheck
[paste output — must show no errors]
```

## URL verification

All Tier 1 source URLs HEAD-checked:
- Total unique URLs: [N]
- HTTP 200/301/302: [N]
- HTTP 4xx/5xx (dead): [N]

[List any dead URLs]

## Language parity

Each FAQ topic has entries in all 4 languages (EN/RU/UK/ES):
- Topics with full 4-language coverage: [N] (target: 30)
- Topics missing languages: [N] (target: 0)

[List any missing entries]

## Copyright safety check

- Direct quotes > 15 words from any source: [N] (target: 0)
- Personal data found in entries: [N] (target: 0)
- Tier 1 truth_source_url for all misinformation entries: [yes/no]
- All source URLs are Tier 1 for `truth_source_url` field: [yes/no]

[List any flagged content for manual review]

## Helper function verification

```
$ node -e "..." (test from HELPER-FUNCTIONS-SPEC.md)
[paste output]
```

## Pending for Wave 1.5

- All entries are `review_status: 'draft'`
- Attorney review needed before bumping to `'approved'`
- Service page UI integration (Wave 1.5)
- Misinformation banner UI components (Wave 1.5)
- FAQ page UI (Wave 1.5)

## Pending for Wave 3

- Telegram bot answers consume FAQ entries directly
- User-submitted question intake (currently FAQ is static)
- 90-day re-verification cron (in TASK-06 monitoring)

## Issues / decisions

[Any unresolved items or decisions made autonomously]

---

**Built by**: Claude Code (TASK-05 Agent)
