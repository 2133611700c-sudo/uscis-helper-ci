# Channel Dossier — YT-IMIGRANT

Updated: 2026-04-30  
Mode: append-only  
Phase: 1C pilot

## 1) Channel profile

- source_id: `YT-IMIGRANT`
- channel_name: `iMigrant`
- handle: `@imigrant1`
- channel_url: `https://www.youtube.com/@imigrant1`
- language: `ru`
- channel_status: `channel_verified`

## 2) Contact capture

- website: `not found`
- telegram: `not found`
- instagram: `not found`
- facebook: `not found`
- public_email: `not found`
- public_phone: `not found`
- contact_status: `not_found`

## 3) Topic search map (channel-level)

Target topics audited:
- `02_re_parole_u4u`
- `03_work_permit_ead`
- `07_payment_problem`
- `01_translate_document`
- `06_case_status`
- `10_form_help`

## 4) Video candidates selected (9)

1. https://www.youtube.com/shorts/6ZjoAOwHkzI
2. https://www.youtube.com/shorts/RmQu7acDdpg
3. https://www.youtube.com/shorts/ULv4H1AFqlM
4. https://www.youtube.com/shorts/IOWLakRK1qo
5. https://www.youtube.com/shorts/c9NRTOo1vss
6. https://www.youtube.com/shorts/6QK_hNOLsW0
7. https://www.youtube.com/shorts/rP6JpH2Dgss
8. https://www.youtube.com/shorts/lk0eUOcGyR4
9. https://www.youtube.com/shorts/OmKd5sMFwKo

## 5) Gemini import log

Session check:
- target URL: `https://gemini.google.com/u/0/app`
- observed result: redirected to `https://gemini.google.com/app`
- blocking state: `Sign in` required (`accounts.google.com`)

Per-video import status:
- import_status: `gemini_import_failed`
- failure_reason: `Gemini auth required in browser session; source import unavailable without signed-in account`
- gemini_source_link_or_id: `not available`
- transcript_status: `unknown`

## 6) Claims staging summary

- claims_staged: 6
- claims_verified: 0
- claims_rejected: 0
- claims_needs_attorney_review: 2

Detailed rows are stored in:
- `docs/research/source-monitoring/topic-claims-staging.md`

## 7) Official verification queue summary

Grouped queues created:
- Re-Parole/U4U
- EAD/I-765
- Payment
- Translation

Queue file:
- `docs/research/source-monitoring/official-verification-queue.md`

## 8) Product opportunities summary

- Site opportunities: 6 rows
- Bot opportunities: 6 rows
- Misinformation watch items: 5 rows

Files:
- `docs/research/source-monitoring/site-service-opportunities.md`
- `docs/research/source-monitoring/bot-answer-opportunities.md`
- `docs/research/source-monitoring/misinformation-watchlist.md`

## 9) Remaining blockers

1. Gemini source import cannot proceed until authenticated browser session is active in target account.
2. Transcript-level extraction cannot be claimed before successful video import.

## 10) Next action

- Authenticate Gemini in required account/session.
- Re-run section 5 (Gemini import log) for all 10 URLs.
- Update transcript statuses and downstream claim confidence.
