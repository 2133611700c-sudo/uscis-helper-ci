# Env vars required

These must be set as **GitHub Actions secrets** (Repository Settings → Secrets and variables → Actions → New repository secret).

The agent must NOT set these automatically. User reviews and runs `scripts/monitoring/set-github-secrets.sh` after generating it.

## Required

| Name | Source | Notes |
|---|---|---|
| `SUPABASE_URL` | Already set in Vercel project | `https://rtfxrlountkoegsseukx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Already set in Vercel project | Full DB access — handle carefully |
| `CONTACT_EMAIL_DESTINATION` | Constant | `2133611700uscis@gmail.com` |
| `FEDERAL_REGISTER_USER_AGENT` | Constant | `Messenginfo Monitoring/1.0 (contact@messenginfo.com)` (Federal Register asks API users to identify themselves) |

## Optional (workflows degrade gracefully if missing)

| Name | Source | Notes |
|---|---|---|
| `RESEND_API_KEY` | Resend dashboard (https://resend.com) | If missing → email goes to console.log only, alerts still inserted to DB |
| `YOUTUBE_API_KEY` | Google Cloud Console | Not currently needed (RSS feeds don't require key). Reserved for future Data API use |

## How to set via gh CLI

```bash
# Set each one (run from repo root with gh authenticated)
gh secret set SUPABASE_URL --body "https://rtfxrlountkoegsseukx.supabase.co"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "..."  # paste from Supabase dashboard
gh secret set CONTACT_EMAIL_DESTINATION --body "2133611700uscis@gmail.com"
gh secret set FEDERAL_REGISTER_USER_AGENT --body "Messenginfo Monitoring/1.0 (contact@messenginfo.com)"
gh secret set RESEND_API_KEY --body "..."  # paste from Resend dashboard
```

## Verifying secrets are set

```bash
gh secret list
```

Should show all 4-5 secrets without their values (values are write-only via API).

## Pending Resend setup

Before RESEND_API_KEY is meaningful:
1. Sign up at https://resend.com (free tier 100 emails/day)
2. Verify domain `messenginfo.com` (add DNS records in Cloudflare)
3. Create sender `monitor@messenginfo.com`
4. Generate API key
5. Set as GitHub secret

Until that's done, workflows run successfully but emails just go to console.log. Alerts are still recorded in Supabase.

## Pending Cloudflare email forwarding

Separate user-facing email setup (not automation):
- Cloudflare Email Routing rule: `contact@messenginfo.com` → `2133611700uscis@gmail.com`
- This is for the contact form on the site, not for monitoring
- Not needed for TASK-06 to work
