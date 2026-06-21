# PROJECT STATE — Monitoring Engine

## Why this matters

USCIS policy changes constantly. TPS extensions Federal Register notices form edition updates dead-link rot — all happen without warning. Without monitoring, the messenginfo.com site goes stale within months and starts giving outdated guidance.

This task builds an automated monitoring system that:
1. Watches USCIS news daily
2. Watches Federal Register for TPS/parole notices
3. Detects form edition changes (PDF hash diff)
4. Catches dead links among the officialSourceUrl values
5. Tracks new uploads on monitored YouTube channels (Tier 2-3 creators)

All alerts are emailed daily to `2133611700uscis@gmail.com`. No public-facing posting. No automated content updates. Human review before any site change.

## What exists

- Supabase project rtfxrlountkoegsseukx with 5 product tables — this task ADDS 4 new tables
- GitHub repo with Vercel auto-deploy
- Form intelligence files from TASK-04 (used by form-edition-checker)
- Service cards + pain points + misinfo + FAQ data with URLs (used by dead-link-checker)
- monitored channel list from TASK-03 source intelligence audit (used by youtube-monitor)

## What this task does NOT do

- ❌ NOT building a Telegram bot (Wave 3 separate)
- ❌ NOT posting auto-replies in any group
- ❌ NOT scraping USCIS Case Status (forbidden ToS)
- ❌ NOT scraping Telegram channels via web scraping (Bot API only, Wave 3)
- ❌ NOT changing site content automatically — alerts only

## Why GitHub Actions (not Vercel cron)

- GitHub Actions: free tier 2000 minutes/month for private repos — plenty for daily checks
- Vercel cron: requires Pro plan + has shorter execution limits
- Workflows run independently; site continues working even if monitoring fails

## Cadence rationale

- USCIS news — every 6 hours: news drops can be time-sensitive (policy memos)
- Federal Register — daily 9 AM ET: published once daily ~9 AM ET
- Form editions — weekly Monday: form edition updates rare; daily checks waste rate limit
- Dead links — daily 3 AM ET: off-peak for target servers
- YouTube — daily noon ET: enough to catch new videos within ~24h

## Email digest

Single daily HTML email summarizing alerts from last 24h. Plain HTML no images. Sections collapsible by alert_type. Critical alerts at top.

## Rate limit awareness

- USCIS: no published API limit. Self-imposed 1 req/2s.
- Federal Register: 60 req/min documented. Use 30/min for buffer.
- YouTube RSS: 100 req/hour informal. Use 50/hour for buffer.
- Resend: 100/day on free tier. Daily digest = 1/day. Plenty of headroom.

## Failure modes the system must handle

- USCIS site down 4xx/5xx → log error continue
- Federal Register API rate limited 429 → exponential backoff
- Email delivery fails → log to GitHub Actions output user notices via Actions tab
- Supabase connection fails → STOP workflow do not retry endlessly
- Form PDF download corrupt → log content_hash mismatch but flag as `error_during_check` not `changed`
