# Monitoring Engine — Final Report TEMPLATE

Save as `docs/reports/monitoring-engine-report.md`.

---

# Monitoring Engine Report

**Date**: [ISO timestamp]
**Branch**: [branch name]
**Commit**: [SHA]

## Supabase tables created

| Table | Created | Initial rows |
|---|---|---|
| monitoring_sources | yes/no | [N] (after seed) |
| monitoring_alerts | yes/no | 0 |
| form_editions | yes/no | 0 |
| dead_links_log | yes/no | 0 |

Migration file: `supabase/migrations/{timestamp}_monitoring_engine.sql`

## GitHub Actions workflows created

| File | Cadence | Verified valid YAML |
|---|---|---|
| `.github/workflows/uscis-news-monitor.yml` | every 6h | yes/no |
| `.github/workflows/federal-register-monitor.yml` | daily 09 ET | yes/no |
| `.github/workflows/form-edition-checker.yml` | weekly Mon 09 ET | yes/no |
| `.github/workflows/dead-link-checker.yml` | daily 03 ET | yes/no |
| `.github/workflows/youtube-monitor.yml` | daily 12 ET | yes/no |

## Scripts created

| File | Lines | Compiles |
|---|---|---|
| `scripts/monitoring/lib/supabase-client.ts` | [N] | yes/no |
| `scripts/monitoring/lib/email.ts` | [N] | yes/no |
| `scripts/monitoring/lib/hash.ts` | [N] | yes/no |
| `scripts/monitoring/monitor-uscis-news.ts` | [N] | yes/no |
| `scripts/monitoring/monitor-federal-register.ts` | [N] | yes/no |
| `scripts/monitoring/check-form-editions.ts` | [N] | yes/no |
| `scripts/monitoring/check-dead-links.ts` | [N] | yes/no |
| `scripts/monitoring/monitor-youtube.ts` | [N] | yes/no |
| `scripts/monitoring/build-digest-email.ts` | [N] | yes/no |
| `scripts/monitoring/seed-sources.ts` | [N] | yes/no |
| `scripts/monitoring/set-github-secrets.sh` | [N] | (generated, NOT executed) |

## Sources seeded

| source_type | count |
|---|---|
| uscis_rss | [N] |
| uscis_page | [N] |
| form_page | [N] |
| youtube_rss | [N] |

## Test runs

| Workflow | Triggered | Result |
|---|---|---|
| uscis-news-monitor | manual via gh CLI | success/fail |
| federal-register-monitor | manual | success/fail |
| form-edition-checker | manual | success/fail |
| dead-link-checker | manual | success/fail |
| youtube-monitor | manual | success/fail |

## First alerts inserted

```sql
SELECT count(*), alert_type FROM monitoring_alerts
WHERE detected_at > now() - interval '1 hour'
GROUP BY alert_type;
```

[paste output]

## Rate limit status

- Federal Register: no 429 responses
- USCIS: no errors
- YouTube: no errors
- All scripts respect documented limits

## Dead links found in initial scan

[paste list of any URLs that returned non-2xx]

## Action items for user (manual)

1. Set GitHub secrets via `gh secret set` (see `data/env-vars-required.md`):
   - SUPABASE_URL ✅ (already in Vercel, copy to GH)
   - SUPABASE_SERVICE_ROLE_KEY ✅ (already in Vercel, copy to GH)
   - CONTACT_EMAIL_DESTINATION ✅ (constant)
   - FEDERAL_REGISTER_USER_AGENT ✅ (constant)
   - RESEND_API_KEY (optional — sign up at resend.com first)

2. (Optional) Sign up at resend.com:
   - Verify domain messenginfo.com (DNS records in Cloudflare)
   - Generate API key
   - Set as GH secret

3. Verify first daily digest email arrives at `2133611700uscis@gmail.com`
   - Check next morning at 09 ET (after Federal Register monitor runs)
   - If RESEND_API_KEY not yet set: check GitHub Actions logs for console.log output

4. Acknowledge alerts as you review them via Supabase dashboard.

## Pending

- Telegram bot monitoring (Wave 3)
- Admin web UI for acknowledgment (Wave 3)
- Critical alert immediate notification (future)
- Twilio SMS fallback for critical alerts (future)

## Issues / decisions

[Any unresolved items or decisions made autonomously]

---

**Built by**: Claude Code (TASK-06 Agent)
