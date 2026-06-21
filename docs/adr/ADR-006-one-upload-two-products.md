# ADR-006: One upload, two products (forms + translation)
Status: Accepted
Date: 2026-05-23

## Context
Currently TPS wizard and Translation wizard are separate flows. User uploads documents twice. For a 60-year-old user on a phone, this is unacceptable.

USCIS requires two things for TPS filing:
1. Filled forms (I-821, I-765) — needs key extracted fields
2. Full translation of any non-English document submitted as evidence — needs ALL filled pages translated

These are different requirements served by the same uploaded document.

## Decision
One upload → two products. The TPS wizard collects documents ONCE. The robot generates BOTH forms AND translation from the same upload.

The ZIP package includes:
- I-821 PDF (filled)
- I-765 PDF (filled)
- Translation PDF for each non-English document (using @uscis-helper/knowledge dictionary)
- Certification page (8 CFR §103.2(b)(3) compliant)
- Filing instructions (multilingual)
- Audit provenance

## User experience
User sees: "Сфотографуйте ВСІ сторінки паспорта" → uploads photos → robot does everything → user pays → downloads complete package.

NO choice between "only form" vs "only translation" vs "both". Robot always does both. Translation is included in the package price.

For internal passport booklet: user uploads ALL pages. Robot determines which are filled vs blank. Blank pages get "This page is blank / Ця сторінка порожня" in translation. Filled pages get full field-by-field translation.

## Pricing
Phase 1 (MVP): single package price includes forms + translation of primary document.
Phase 2: per-document translation upsell for additional documents (birth certificate, marriage certificate, etc.)
Phase 3: dynamic pricing based on number of filled pages detected by robot.

## Technical implementation
Bridge module: after TPS packet generation, call generateTranslationHTML with the same extracted fields from TPSAnswers + raw OCR data. Output goes into the same ZIP.

Key files:
- `apps/web/src/lib/tps/packetBuilder.ts` — add translation step
- `apps/web/src/lib/translation/generateTranslationHTML.ts` — existing renderer
- `packages/knowledge/` — shared normalization layer (ADR-002)

## Alternatives rejected
- Separate translation wizard (current state): user uploads twice, confusion
- Three-option choice after OCR ("form" / "translation" / "both"): decision fatigue for target user
- Per-page pricing at upload time: user doesn't know how many pages are "filled"

## Consequences
- Package value increases (forms + translation in one)
- User effort decreases (one upload, one payment)
- Robot needs to handle multi-page document uploads
- Translation quality depends on same knowledge dictionary as forms (consistency enforced by ADR-002)

## Supersedes
- Any plan for separate translation wizard for TPS documents
