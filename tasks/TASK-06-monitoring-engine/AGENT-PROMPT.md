# AGENT PROMPT — TASK-06 Monitoring Engine

You are Claude Code working in `/Users/sergiiivanenko/work/uscis-helper`.

## STEP 0 — READ CONTEXT

1. `context/PROJECT-STATE.md`
2. `data/monitoring-sources-seed.csv`
3. `data/supabase-migration.sql`
4. `data/env-vars-required.md`
5. `data/rate-limits.md`
6. `output-spec/WORKFLOW-TEMPLATES/*.yml.template`
7. `output-spec/DIGEST-EMAIL-SPEC.md`
8. `output-spec/FINAL-REPORT-TEMPLATE.md`

## STEP 1 — VERIFY ENVIRONMENT

```bash
cd /Users/sergiiivanenko/work/uscis-helper
git status
git checkout -b monitoring-engine-$(date +%Y%m%d-%H%M)

# Verify TASK-04 outputs exist (form intelligence files)
ls apps/web/data/formIntelligence/types.ts apps/web/data/formIntelligence/i131.ts
```

If TASK-04 outputs missing → STOP, ask user.

```bash
# Verify Supabase access via env vars (DO NOT print values)
test -n "$SUPABASE_URL" || echo "MISSING SUPABASE_URL"
test -n "$SUPABASE_SERVICE_ROLE_KEY" || echo "MISSING SERVICE ROLE KEY"

# Verify GitHub CLI
gh --version
gh auth status
```

If env vars missing or gh not authenticated → STOP, ask user.

## STEP 2 — APPLY SUPABASE MIGRATION

```bash
mkdir -p supabase/migrations
cp data/supabase-migration.sql supabase/migrations/$(date +%Y%m%d%H%M%S)_monitoring_engine.sql
```

Apply via Supabase CLI if available:
```bash
supabase db push 2>/dev/null || echo "supabase CLI not available — apply manually via dashboard"
```

OR apply manually via psql with SUPABASE_DB_URL if user provides it.

OR copy SQL to clipboard and instruct user to run via Supabase dashboard SQL editor.

## STEP 3 — CREATE SCRIPTS

Create `scripts/monitoring/` with these 9 files:

### 3.1 `scripts/monitoring/lib/supabase-client.ts`
Service-role Supabase client. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env.

### 3.2 `scripts/monitoring/lib/email.ts`
Resend-based email sender. Reads RESEND_API_KEY + CONTACT_EMAIL_DESTINATION.
If RESEND_API_KEY missing → log to console.log only (graceful fallback for dev).

```typescript
export async function sendDigest(html: string, subject: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_EMAIL_DESTINATION
  if (!apiKey) {
    console.log('=== EMAIL (dry run, RESEND_API_KEY not set) ===')
    console.log('To:', to)
    console.log('Subject:', subject)
    console.log(html)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'monitor@messenginfo.com',
      to,
      subject,
      html,
    }),
  })
  if (!res.ok) throw new Error(`Email failed: ${res.status}`)
}
```

### 3.3 `scripts/monitoring/lib/hash.ts`
Content normalization + SHA-256 hashing.

```typescript
import { createHash } from 'crypto'

export function normalize(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function sha256(content: string): string {
  return createHash('sha256').update(normalize(content)).digest('hex')
}
```

### 3.4 `scripts/monitoring/monitor-uscis-news.ts`
Fetches https://www.uscis.gov/news/rss-feed/all-news. Parses RSS. Compares against monitoring_sources by content_hash. Inserts new items as monitoring_alerts.

### 3.5 `scripts/monitoring/monitor-federal-register.ts`
Queries Federal Register API:
```
https://www.federalregister.gov/api/v1/documents?conditions[term]=TPS+OR+parole&per_page=100
```
Filters for new TPS/parole notices. Respects rate limit (60/min).

### 3.6 `scripts/monitoring/check-form-editions.ts`
Iterates `apps/web/data/formIntelligence/*.ts`. For each form:
- HEAD check `instructions_pdf_url`
- Download with curl, compute SHA-256
- Compare against `form_editions` table
- If hash changed → insert alert + update `form_editions` row

### 3.7 `scripts/monitoring/check-dead-links.ts`
Extracts URLs from:
- `apps/web/data/serviceCards.ts` (officialSourceUrl values)
- `apps/web/data/formIntelligence/*.ts` (official_url + instructions_pdf_url + official_sources)
- `apps/web/data/painPoints.ts` (truth_source_url... wait those are in misinformation.ts)
- `apps/web/data/misinformation.ts` (truth_source_url values)
- `apps/web/data/faqAnswers.ts` (official_source_urls values)

For each URL: HEAD check with 10s timeout. Log non-2xx to dead_links_log table.

### 3.8 `scripts/monitoring/monitor-youtube.ts`
For each row in monitoring_sources WHERE source_type='youtube_rss':
- Fetch RSS: `https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}`
- Compare against last known video_id stored in monitoring_sources.last_seen_id (add column if not in migration)
- Insert new videos as monitoring_alerts

### 3.9 `scripts/monitoring/build-digest-email.ts`
Aggregates all unacknowledged alerts from last 24h. Renders HTML email per `output-spec/DIGEST-EMAIL-SPEC.md`. Calls `sendDigest()`.

## STEP 4 — CREATE WORKFLOWS

Create 5 files in `.github/workflows/`:

For each `output-spec/WORKFLOW-TEMPLATES/*.yml.template`:
1. Read template
2. Replace `{{REPO_NAME}}` and `{{NODE_VERSION}}` placeholders
3. Save to `.github/workflows/`

The 5 workflows:
- `uscis-news-monitor.yml` (every 6 hours)
- `federal-register-monitor.yml` (daily 09:00 ET)
- `form-edition-checker.yml` (weekly Mon 09:00 ET)
- `dead-link-checker.yml` (daily 03:00 ET)
- `youtube-monitor.yml` (daily 12:00 ET)

Each workflow runs the corresponding script and (where appropriate) the digest email script.

## STEP 5 — SEED INITIAL SOURCES

Run a one-time seed script:
```bash
npx tsx scripts/monitoring/seed-sources.ts
```

This script reads `data/monitoring-sources-seed.csv` and INSERTs all rows into monitoring_sources table.

## STEP 6 — SET GITHUB SECRETS

Document the env vars that need to be set as GitHub Actions secrets. Generate a script `scripts/monitoring/set-github-secrets.sh`:

```bash
#!/bin/bash
gh secret set SUPABASE_URL --body "$SUPABASE_URL"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_SERVICE_ROLE_KEY"
gh secret set RESEND_API_KEY --body "$RESEND_API_KEY"
gh secret set CONTACT_EMAIL_DESTINATION --body "2133611700uscis@gmail.com"
gh secret set FEDERAL_REGISTER_USER_AGENT --body "Messenginfo Monitoring/1.0 (contact@messenginfo.com)"
```

DO NOT execute this script automatically. Just create it. User runs it after reviewing.

## STEP 7 — VERIFICATION

```bash
# 1. Each workflow file is valid YAML
for f in .github/workflows/{uscis-news,federal-register,form-edition,dead-link,youtube}-*.yml; do
  echo "=== $f ==="
  yq . "$f" > /dev/null && echo "OK" || echo "INVALID YAML"
done

# 2. Each script TypeScript-compiles
npx tsc --noEmit scripts/monitoring/*.ts scripts/monitoring/lib/*.ts

# 3. Test workflows manually (after secrets set):
gh workflow run uscis-news-monitor.yml
sleep 30
gh run list --workflow=uscis-news-monitor.yml --limit 1

# 4. Verify Supabase rows inserted (via psql or dashboard)
echo "Verify: SELECT count(*) FROM monitoring_sources;"
echo "Verify: SELECT count(*) FROM monitoring_alerts WHERE detected_at > now() - interval '1 hour';"
```

## STEP 8 — COMMIT

```bash
git add scripts/monitoring/ \
        .github/workflows/uscis-news-monitor.yml \
        .github/workflows/federal-register-monitor.yml \
        .github/workflows/form-edition-checker.yml \
        .github/workflows/dead-link-checker.yml \
        .github/workflows/youtube-monitor.yml \
        supabase/migrations/*_monitoring_engine.sql
git commit -m "feat(monitoring): 5 workflows + 4 supabase tables + 9 scripts"
git push -u origin HEAD
```

## STEP 9 — FINAL REPORT

Write to `docs/reports/monitoring-engine-report.md` per `output-spec/FINAL-REPORT-TEMPLATE.md`.

Include:
- Tables created with row counts
- Workflows created with paths
- Scripts created with paths
- Env vars to set (instruction for user — agent must NOT set them automatically)
- First test run results (where executable)
- Recommended cadence adjustments

## CONSTRAINTS

- NEVER scrape USCIS Case Status (egov.uscis.gov) — forbidden by ToS
- NEVER bypass rate limits (use exponential backoff if 429 received)
- NEVER print env var values to logs
- NEVER commit secrets to git
- NEVER auto-execute set-github-secrets.sh — user must review and run
- If Supabase migration fails → STOP, do not deploy workflows
- If any workflow runs > 5 minutes → kill, alert via GitHub issue (likely runaway scraping)
- NO Telegram automation in this task (Wave 3 separate)
- NO public-facing posting actions (alerts go to email only)

## EXECUTE NOW.
