# SOP — Phase 1C One-Channel Pipeline

Updated: 2026-04-30

Purpose: process one source channel end-to-end with zero data loss, then move to next source.

## Non-negotiable rules

1. Append-only mode: never delete prior raw rows, only append/update status.
2. No inferred hidden data. If not visible: `not found`.
3. Community claims are discovery-only until official verification.
4. No `verified` claim without direct official URL.
5. No transcript claim unless transcript text was actually opened/imported.
6. Docs/research only in this phase.

## Step-by-step algorithm (one channel)

1. **Open source channel page**
   - Capture: `source_id`, `channel_name`, `handle`, `channel_url`, `language`, `channel_status`.
2. **Extract all visible contacts**
   - `website`, `telegram`, `instagram`, `facebook`, `public_email`, `public_phone`.
   - If missing: `not found`.
3. **Run keyword topic search inside channel**
   - Keywords: `u4u`, `reparole`, `re-parole`, `tps`, `ead`, `work permit`, `i-765`, `i-131`, `i-821`, `i-912`, `i-94`, `case status`, `biometrics`, `rfe`, `denial`, `scan`, `photo`, `translation`, `payment`.
4. **Select topic-relevant video candidates**
   - High priority source: up to 10 videos.
   - Medium: up to 5.
   - Low: up to 3.
5. **Gemini import pass per video URL**
   - Add URL to notebook.
   - Log outcome:
     - `import_status=success|failed`
     - `failure_reason`
     - `gemini_source_link_or_id`
     - `transcript_status=available|unavailable|unknown`
6. **Extract questions and claims**
   - From title/description/transcript (if available).
   - Default claim status: `unverified`.
7. **Build official verification queue**
   - Map each claim/question to required official source URL.
8. **Build product outputs**
   - Site service opportunity rows.
   - Bot answer opportunity rows.
   - Misinformation watchlist rows.
9. **Finalize one-channel dossier**
   - Channel profile
   - Contact capture
   - Video index
   - Gemini import log
   - Claims staging
   - Verification queue
   - Opportunities
10. **Completion gate**
   - Do not start next channel until dossier has no empty required sections.

## Required statuses

- `raw`
- `channel_verified`
- `channel_unreachable`
- `imported_to_gemini`
- `gemini_import_failed`
- `transcript_available`
- `transcript_unavailable`
- `claim_unverified`
- `needs_attorney_review`
- `verified_official`
- `contradicted`
- `outdated`

## Hard stop conditions

- YouTube globally blocked.
- Source requires private/login-only scraping.
- More than 30% of high-priority channels fail in one batch.
- Cannot distinguish creator commentary from official source layer.
- Task requires website code changes.

