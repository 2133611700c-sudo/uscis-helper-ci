# AGENT PROMPT — TASK-03 Source Intelligence

You are Claude in Chrome with browser automation, plus the ability to write files.

## STEP 0 — READ CONTEXT

1. `context/PROJECT-STATE.md`
2. `context/TIER-DEFINITIONS.md`
3. `data/target-channels.csv`
4. `data/search-terms-matrix.csv`
5. `data/tier1-sources.csv`
6. `output-spec/PER-CHANNEL-REPORT-TEMPLATE.md`
7. `output-spec/DATABASE-SCHEMAS.md`

## EXECUTION MODE

Process **ONE channel at a time**. After each channel, stop and produce the per-channel report. Wait for user approval before continuing.

## STEP 1 — PER-CHANNEL ALGORITHM

For each channel from `target-channels.csv`:

### 1.1 Open channel
Navigate to `https://www.youtube.com/{handle}`.
Screenshot: `/tmp/source-intel/screenshots/{source_id}/01-channel.png`

### 1.2 Read About page
Click About tab. Extract:
- Subscribers count
- Total videos count
- Description text
- Linked accounts (telegram, instagram, website, etc.)
- Email if visible
- Country if visible

Screenshot: `02-about.png`
Save to: `/tmp/source-intel/contacts/{source_id}.json`

### 1.3 Search by 30 terms (10 topics × 3 languages)

For each row in `search-terms-matrix.csv`:
- URL: `https://www.youtube.com/@{handle}/search?query={search_term}`
- Wait for results to load
- Screenshot: `03-search-{topic}-{lang}.png`
- Collect all video results (URL, title, view count, date if visible)

If 0 results, log `NOT_FOUND` for that topic+lang pair and continue.

### 1.4 Select top videos per topic
Per topic (across all 3 languages combined):
- Sort by view count, descending
- Take top 3 OR all videos with > 5,000 views, whichever is fewer
- Skip Shorts (< 60 sec) — usually low signal
- Skip videos > 12 months old unless top performer

### 1.5 Extract video_ids
Parse YouTube URL pattern: `https://www.youtube.com/watch?v={VIDEO_ID}`

Save to: `/tmp/source-intel/video-queue/{source_id}-videos.csv`
Columns: `topic, video_id, url, title, views, date`

### 1.6 Import to NotebookLM
Open NotebookLM "USCIS Helper — Source Intelligence" in another tab.

For each selected video:
- + Add sources → Website → paste YouTube URL
- Wait for import
- Click source title → rename to format: `[{video_id}] @{channel} — {short title}`
- Screenshot: `04-notebooklm-{video_id}.png`

### 1.7 Query NotebookLM for claims
In NotebookLM chat for this notebook, send query:

```
Extract from video [{video_id}] all claims about USCIS forms, fees, deadlines, and requirements.

Format response as:

CLAIMS:
1. [exact claim in source language] — [timestamp if available]
2. ...

OFFICIAL SOURCES MENTIONED:
- [URL or name]

CONTACTS MENTIONED:
- [phone, email, telegram, website]

WARNINGS / DISCLAIMERS:
- [text]

If no claims found, respond "NO_CLAIMS".
```

Screenshot: `05-claims-{video_id}.png`
Save raw response to: `/tmp/source-intel/claims-raw/{source_id}-{video_id}.md`

### 1.8 Verify each claim against Tier 1

For each claim:
- Read `data/tier1-sources.csv` to find which Tier 1 source matches the claim's topic
- Open that Tier 1 URL in browser
- Search for matching fact (use Cmd+F or read content)
- Mark status: `verified` / `unverified` / `contradicted` / `outdated`
- If verified: save the specific Tier 1 URL that confirms it

Save to: `/tmp/source-intel/verified-claims/{source_id}-{video_id}.csv`
Columns: `claim_id, claim_text, claim_lang, status, tier1_url, notes`

### 1.9 Per-channel report
Write to: `/tmp/source-intel/source-reports/{source_id}-report.md`
Format per `output-spec/PER-CHANNEL-REPORT-TEMPLATE.md`.

### 1.10 STOP and wait for user

Output the report path. Tell user: "Channel {source_id} report ready at [path]. Reply 'next' to continue with the next channel, or 'stop' to pause."

DO NOT proceed to the next channel without explicit "next" instruction.

## STEP 2 — AFTER ALL 20 CHANNELS

Aggregate per-channel data into 4 master databases per `output-spec/DATABASE-SCHEMAS.md`:

- `/tmp/source-intel/database/verified-claims.csv`
- `/tmp/source-intel/database/rejected-claims.csv`
- `/tmp/source-intel/database/creator-contacts.csv`
- `/tmp/source-intel/database/official-sources.json`

Write a final summary report to `/tmp/source-intel/database/SUMMARY.md`.

## CONSTRAINTS

- NEVER process more than 1 channel per turn — must stop and wait
- NEVER skip the verification step (claim without Tier 1 URL = not verified)
- NEVER copy full transcripts to output files (DMCA risk — paraphrase only)
- NEVER claim a video processed without screenshot evidence
- If channel doesn't exist (404) → log and continue with next priority
- If channel has 0 immigration content → escalate to user
- If a channel contradicts MULTIPLE Tier 1 sources → flag as potential scam channel for user review

## EXECUTE NOW — START WITH CHANNEL #1.
