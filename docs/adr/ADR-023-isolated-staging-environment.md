# ADR-023 — Isolated staging environment (Supabase + Vercel preview)

Status: Accepted (2026-06-19). Issue #160. Parent program #159.

## Context
V1 release gates (browser E2E, paid-path E2E, ledger/canonical canaries, PDF visual)
must run against a staging environment that NEVER touches production data
(`messenginfo.com` / prod Supabase `rtfxrlountkoegsseukx`) or live Stripe. The
`stagingContract.ts` validator existed but no environment was provisioned.

## Decision
Stand up staging entirely through GitHub Actions so all credentials live in GitHub
Secrets (never in chat or local logs):

1. **Database** — a dedicated, isolated Supabase project `rxnlpvldngxgdxkxoaaj`
   (us-west-1), under a separate Supabase account from production. Migrations are
   applied by `.github/workflows/staging-provision.yml` (`supabase db push`) with a
   hard guard that aborts if the target ref ever equals the prod ref. Verified: 44/44
   migrations, 47 tables (all RLS), 28 functions, 23 triggers, 144 indexes, bucket
   `images` private.
2. **App** — a Vercel **preview** deployment via `.github/workflows/staging-deploy.yml`
   (`vercel deploy` with per-deployment `-b`/`-e` flags). Production is a separate
   deployment and is never the target of a preview deploy.

### Key learnings (cost real iterations)
- GitHub runners are **IPv4-only**; the direct `db.<ref>.supabase.co` host is
  IPv6-only → DB verification must use the **session pooler**.
- `vercel build --prebuilt` does **not** set the server **runtime** env — Next.js reads
  server `process.env` at runtime from the project's env, not from an injected build
  file. The staging Supabase + `HEALTH_TOKEN` must be passed via `vercel deploy -e`
  (runtime) / `-b` (build) so the deployment genuinely runs against staging.
- A from-zero migration apply exposed a real ordering defect (three migrations define
  `translation_orders` with conflicting schemas); fixed to be fresh-apply safe.

## Runtime proof (not assumed)
The token-gated deep `/api/health` on the staging preview returns 200 with
`db:true`, `wizard_sessions_ok:true`, `canonical_answers_count:12` (staging seed),
`supabase_storage:true` — proving the running server connects to staging Postgres +
storage. healthz reports `environment=preview`. `V1_STAGING_READY=true`.

## Consequences
- E2E / canary gates can now run on staging without risk to production.
- The staging URL is the immutable per-deploy URL; a stable alias can be added later.
- Full TPS OCR + paid E2E additionally need `GEMINI_*` / `OCR_CACHE_ENC_KEY` /
  Stripe **test** keys passed as further `-e/-b` flags (owner-held).
- `STRIPE_TEST_MODE`/test keys remain an owner action for paid-path E2E.
