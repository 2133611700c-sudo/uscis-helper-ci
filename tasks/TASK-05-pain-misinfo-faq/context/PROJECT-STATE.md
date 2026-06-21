# PROJECT STATE — Pain Points / Misinformation / FAQ DB

## Why this matters

Wave 1A site is live with 12 service cards but the cards link only to official USCIS sources. Real users have specific pain points and confusions that USCIS pages don't address in plain language.

This task converts existing forensic audit research into structured data that:
1. Powers "common mistakes" sections on Wave 1.5 service pages
2. Drives "warning banners" for active misinformation (e.g. TPS=EAD until October)
3. Seeds FAQ pages in 4 languages
4. Will later feed a Telegram bot that answers community questions

## Input research already exists

The user has these research artifacts (referenced in chat history of prior sessions):

- **Facebook forensic audit** — 12 evidence entries, 16 pain categories, 8 misinfo claims (UA Community 50K, Immigrant Porada 20K, Наши в США 142K)
- **Telegram forensic audits** (3 sessions) — 54 cross-account evidence entries from 15+ groups (TPS та Дозвіл 7,467; Адаптація UA 27,479; Помощь U4U/HP 12,353; Юридические послуги США 81,648; @eadu4u 6,941)
- **Market research** — California UPL + CCPA + competitor pricing
- **35 validated pain points** (top: re-parole→EAD denied 927 comments, $1,020 payment bug 2,115 comments, RFE wave Aug 2025, TPS EAD July 22 2026 cutoff 2,142 comments, sponsor abuse, October 19 2026 expiry 3,100+ views)
- **15 active misinformation claims** (TPS=EAD until October, work without EAD via ChatGPT, form-only re-parole, etc.)

The seed CSVs in `data/` distill those into structured form. The agent's job is to convert CSVs into typed TS files and add proper helper functions.

## What this task does NOT do

- ❌ NOT making lawyer-quality content (that's Wave 1.5 with attorney review)
- ❌ NOT building UI components that consume the data (that's Wave 1.5 too)
- ❌ NOT writing a Telegram bot (Wave 3)
- ❌ NOT replacing serviceCards.ts (different layer)

It produces structured data + helper functions. UI integration follows in Wave 1.5.

## Status of each entry

Every entry in this task is `review_status: 'draft'` — meaning it's accurate per current research but has NOT been reviewed by a licensed immigration attorney. Wave 1.5 includes attorney review and bumps status to `'approved'`.

The `last_verified` field tracks when the entry was last cross-checked against Tier 1 sources. Entries should be re-verified every 90 days because USCIS policy changes.

## Copyright safety

The forensic audit research includes paraphrased community posts. When generating descriptions and bad_advice_circulating values, the agent must:
- NOT copy-paste verbatim from forensic audit notes
- NOT use direct quotes longer than 15 words from any single source
- Paraphrase into plain professional language
- Cite the validated_sources field with source name + evidence count, not full content

See `output-spec/COPYRIGHT-SAFETY-RULES.md` for details.

## Tone for FAQ answers

- Plain language, not legalese
- Acknowledge the user's situation before answering
- Always cite a Tier 1 official source URL
- End with "If unsure, consult a licensed immigration attorney"
- Match formal register per language (вы, ви, usted)

## Hard rule on misinformation entries

Each misinformation entry MUST have:
- `truth_source_url` pointing to a Tier 1 source (USCIS / Federal Register / eCFR / CBP / DOJ)
- `truth_source_url` is HEAD-checked alive at time of generation
- `risk_if_believed` describing concrete consequences
- `service_pages_to_warn` listing slugs from serviceCards.ts (validated against actual data)
