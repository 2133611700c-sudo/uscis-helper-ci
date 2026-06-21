# PROJECT STATE — Form Intelligence

## Why this matters

Wave 2 product flows depend on knowing exactly:
- Which fields each USCIS form requires
- Which user document each field comes from (passport, I-94, EAD, etc.)
- Current edition dates (forms get updated and old editions are rejected)
- Current fees (USCIS fee schedule changed Apr 2024)
- Common mistakes for each form (so we can prevent them)

This is research/data work — NOT user-facing UI. Output goes into `apps/web/data/formIntelligence/` for Wave 2 product flows to consume.

## Hard rules from existing site

- Wave 1A site is LIVE at messenginfo.com (do not modify UI)
- `serviceCards.ts` already has `officialSourceUrl` for each card — those are user-facing canonical
- Form intelligence URLs may differ slightly (e.g. PDF link vs landing page link) — that's fine, they serve different purposes

## Why 7 forms in this priority order

1. **I-131** — Re-parole. Highest pain point, biggest 2026 issue (Aug 2025 rule change requiring personal evidence)
2. **I-765** — EAD/work permit. Second-highest pain. TPS EAD deadline July 22, 2026.
3. **I-821** — TPS. Time-sensitive (designation expires October 19, 2026, no renewal expected).
4. **I-912** — Fee waiver. Pairs with I-131 and I-765 to reduce filing cost from $1,020 to ~$0.
5. **G-1145** — E-notification. Free, simple, lead-gen tool. Easy to implement first.
6. **AR-11** — Address change. Free, simple, also lead-gen.
7. **I-589** — Asylum. Most complex, longest fields, do last.

## Source of truth

USCIS form PDFs and instructions PDFs only. Federal Register for designation dates. No third-party sources.

## Output is internal data, not public

Files in `apps/web/data/formIntelligence/` are not directly rendered. They power future Wave 2 components. Don't worry about marketing copy — focus on accuracy and completeness.

## Common mistakes come from research

`data/common-mistakes-by-form.md` has pre-validated mistakes from Facebook + Telegram forensic audits. Use those verbatim — they are real community pain points. Don't invent new mistakes.
