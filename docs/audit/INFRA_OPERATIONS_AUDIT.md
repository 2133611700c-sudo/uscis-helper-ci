# Infra & Operations Audit — uscis-helper / messenginfo

Base 02eb595. Read-only. Primary sources: Vercel prod env (`vercel env ls
production`), live Supabase rtfxrlountkoegsseukx (MCP), GitHub workflows + API,
prod healthz.

## Dedicated staging environment — **NOT_BUILT (P1)**
- No separate Supabase project: `list_projects` returns exactly ONE project
  (`rtfxrlountkoegsseukx`, "uscis-helper"). No staging DB.
- Vercel env: `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` =
  `https://rtfxrlount...` for **Production, Preview AND Development**.
  `SUPABASE_SERVICE_ROLE_KEY` is set for **all three**. → Preview/Development
  deployments read AND write the **production database** with the production
  service-role key. **No environment isolation.**
- CI confirms staging is absent: `v1-nightly-staging.yml` and
  `v1-document-benchmark.yml` both `exit 0` as DRY-RUN because `V1_STAGING_READY`
  is not `true`, with comments "until a dedicated staging environment exists" /
  "staging not provisioned".
- No Stripe-test isolation evidenced: only ONE `STRIPE_SECRET_KEY` /
  `STRIPE_WEBHOOK_SECRET` in prod env (test vs live = UNVERIFIED). No `*_TEST`
  variant seen. Preview shares the same env scope risk.
- Evidence: PROVEN (single project, shared env vars).

## Production isolation — **BROKEN (P1)**
- Preview/Dev deployments are not isolated from prod data (shared Supabase + service
  role). A preview build running a migration or a destructive query, or a leaked
  preview URL hitting a write route, mutates production.
- Mitigant: most write routes use anon-keyed RLS paths; but admin/service-role
  routes (`createAdminSupabaseClient`) bypass RLS and run with the prod key in every
  env. Evidence: `vercel env ls`, `lib/supabase/admin.ts`.

## Rollback — **PARTIAL (P2)**
- Vercel auto-deploy on push to main; rollback = redeploy previous build (standard
  Vercel). No documented one-click runbook found. `chore(release-state)` PRs (#121,
  #123) maintain a machine-readable release-state file = a rollback reference point.
- DB rollback: migrations are forward-only; several are explicitly INSERT-only /
  immutable-trigger guarded (canonical_*), so a bad data write cannot be UPDATE/
  DELETE-rolled-back by design. No down-migrations.

## Backups / restore / DR — **UNVERIFIED (P2)**
- Supabase managed PITR/backups depend on plan tier — not verifiable read-only via
  MCP. No restore runbook in repo. No DR plan doc. Status: UNVERIFIED.

## Monitoring / alerts / SLO — **PARTIAL (P2)**
- App-level monitoring tables live and active: `monitoring_alerts` (405 rows),
  `monitoring_sources` (26), `dead_links_log` (42). Cron workflows feed them
  (federal-register, uscis-news, form-edition, youtube, dead-link, prod-safety,
  guard-block-rate, daily-reconciliation, escalation-tick).
- Prod health: `post-deploy-smoke.yml` (healthz + a real prod vision POST),
  `post-deploy-ui-smoke.yml`, `v1-production-readonly-smoke.yml` (daily 200 checks),
  `prod-safety-monitor.yml`. `/api/healthz` is the documented healthcheck.
- Gaps: no SLO/error-budget definition, no external uptime/APM (PostHog client
  analytics only). Smoke checks assert HTTP 200, not output correctness. Alerting
  channel = Telegram owner webhook (env present).

## Cost dashboard / budget — **NOT_BUILT (P2)**
- No runtime provider-budget enforcement (see OCR_CACHE_RUNTIME_AUDIT.md: budget
  guard is library-only, NOT_WIRED). No cost dashboard in repo. Provider spend
  (Gemini/Vision/DeepSeek/DocAI) is uncapped at the route; TPS path can fire up to 3
  paid calls/upload by default. No per-document dedupe. Cost visibility = provider
  consoles only (external).

## Retention — **PARTIAL / P0 gap on PII table**
- `generated_packets`: retention via `CLEANUP_PACKETS_RETENTION_DAYS` + `api/cron/
  cleanup`. OK.
- `wizard_drafts`: `expires_at` column + comment "TTL via expires_at + cron
  cleanup" — but **no cron workflow found** that deletes expired drafts (table is
  empty/flag-off so latent).
- `tps_ocr_audit`: **668 rows, NO retention/TTL**, and `brain_raw` jsonb stores RAW
  applicant PII (`source_value`/`final_value`/`input_raw` per field) in 575 rows
  cleartext. See DATABASE_INVENTORY + finding P0-1. This is the most material
  operational gap.

## Key rotation — **PARTIAL (P3)**
- Multiple Gemini/DeepSeek keys present (rotation-capable per MEMORY: free→paid
  swap). Vision SA key was pasted in chat historically (MEMORY: owner must rotate).
  No automated rotation. Service-role key shared across all envs increases blast
  radius if leaked.

## Runbooks — **PARTIAL (P3)**
- Heavy doc discipline (STATUS/HANDOFF/CHANGELOG enforced by `session-docs-guard`),
  release-state file, V1_STATUS generator. But no incident/rollback/restore/DR
  runbook found.

## Branch protection — **NOT_ENFORCED (P2)**
- `GET /branches/main/protection` → 403 "Upgrade to GitHub Pro or make repo public".
  Private repo on free plan = **no enforced required status checks**; direct push to
  main is permitted (matches CLAUDE.md "Branch: main (direct push)"). guards.yml runs
  full suite+build on push/PR but cannot BLOCK a merge/push (advisory only).
