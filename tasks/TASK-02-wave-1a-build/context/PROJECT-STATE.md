# PROJECT STATE — what already exists

## Infrastructure (LIVE — DO NOT recreate)

**Supabase project**: `rtfxrlountkoegsseukx` (us-east-1, Free plan)
- 5 tables: `profiles`, `form_sessions`, `form_answers`, `translation_orders`, `audit_log`
- Service role key available via env

**GitHub repo**: `2133611700c-sudo/uscis-helper` (private)
- Active branch: `main`
- Audit reference: `docs/audit/2026-04-29-handy-messenginfo-audit.md` (commit `978761b`)

**Vercel project**: `prj_G5Bwd5VMDqEMdbPKLlQW50aF3pQq` (uscis-helper)
- Auto-deploys on push to `main`
- Old project `prj_lTCwWz7Ju2BzlQPutLy5Z6wAlXBc` already DELETED — do not reference

**Domain**: `messenginfo.com`
- DNS via Cloudflare → Vercel
- HTTP 200 currently (old placeholder)
- HSTS expected per `vercel.json`

**Stack**:
- Next.js 15.5
- React 19
- Tailwind v4
- next-intl
- @supabase/ssr
- Vercel Analytics + Speed Insights

## Read-only reference folders (DO NOT MODIFY)

- `/Users/sergiiivanenko/handy-friend-landing-v6` — UX reference for visual style
- `/Users/sergiiivanenko/work/messenginfo-merge` — old logistics project, engineering reference only

## Active working dir

- `/Users/sergiiivanenko/work/uscis-helper` ← this is where you build

## NotebookLM context (separate task TASK-01)

Account `0665638312@gmail.com`, notebook "USCIS Helper — Source Intelligence" — not relevant to this task.

## Contact destination

`2133611700uscis@gmail.com` — used for contact forms (Cloudflare Email Routing rule pending — fine for now, page just needs to render)

## Env vars present in Vercel project

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `CONTACT_EMAIL_DESTINATION=2133611700uscis@gmail.com`
- `HEALTH_TOKEN`

Optional (read but graceful fallback if absent):
- `NEXT_PUBLIC_TELEGRAM_CHANNEL_URL`
- `NEXT_PUBLIC_TELEGRAM_BOT_URL`

If a required env var is missing → STOP and report. Do NOT invent fallback URLs.

## vercel.json (target content)

```json
{
  "redirects": [{
    "source": "/:path*",
    "has": [{ "type": "host", "value": "www.messenginfo.com" }],
    "destination": "https://messenginfo.com/:path*",
    "permanent": true
  }],
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "X-Frame-Options", "value": "DENY" }
    ]
  }],
  "trailingSlash": false
}
```
