# Environment Isolation Plan — Preview/Dev must never silently use Production Supabase

Status: **SHADOW DETECTION SHIPPED** (this PR). Full isolation is **BLOCKED_EXTERNAL** —
owner must provision a dedicated staging Supabase project + test-mode keys.

## Problem (audit-confirmed, 2026-06-14)

Only **one** Supabase project exists: ref `rtfxrlountkoegsseukx`.
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set for **Production AND Preview AND
Development**. The service-role key **bypasses RLS**. Therefore every Preview and
Development deployment reads and writes **production data** with a key that ignores
row-level security. There is no dedicated staging. Heavy OCR e2e + paid providers run
against the production DB.

This is a P0/P1 data-isolation gap: a preview branch (or a local dev run with the prod
service-role key) can mutate, leak, or delete production rows with no RLS protection.

## Detection contract (this PR)

`apps/web/src/lib/env/environmentGuard.ts`:

- `resolveEnvironment()` → PII-free `EnvFingerprint { appEnv, supabaseRef|null, stripeMode, providerMode }`.
  - `appEnv` from `APP_ENVIRONMENT` → `VERCEL_ENV` → `NODE_ENV` (unknown defaults to `production` —
    the safe default, so an unknown env is never falsely declared "isolation-clean").
  - `supabaseRef` from `SUPABASE_PROJECT_REF`, else derived from the `SUPABASE_URL`
    host (`https://<ref>.supabase.co` → `<ref>`). **Never** reads any secret value.
  - `stripeMode` from `STRIPE_MODE`, else derived from the key prefix (`sk_test`/`sk_live`)
    — the key itself is never read into the fingerprint, logged, or thrown.
  - `providerMode` from `PROVIDER_MODE` (defaults `live`).
- `checkEnvironmentConsistency(fp)` → typed, PII-free violations:
  - `NONPROD_USES_PROD_SUPABASE` — `appEnv != production` AND `supabaseRef == rtfxrlountkoegsseukx`.
  - `STAGING_USES_LIVE_STRIPE` — `appEnv != production` AND `stripeMode == live`.
  - `MISSING_SUPABASE_REF` — ref could not be resolved.
  - `PROD_USES_NONPROD_SUPABASE` — `appEnv == production` AND ref is some other project.
- `assertEnvironmentConsistency()` — mode from `ENV_ISOLATION_MODE` (default `shadow`):
  - `shadow` → structured PII-free `console.warn` per violation
    (`{event:'env_isolation_violation', appEnv, supabaseRef_present, stripeMode, providerMode, violation_code, mode}`),
    **never throws**.
  - `enforce` → throws `EnvironmentIsolationError` listing violation codes (opt-in).
  - `off` → no-op.

**Shadow wiring:** a one-time `assertEnvironmentConsistency()` call sits at the top of
`createAdminSupabaseClient()` in `apps/web/src/lib/supabase/admin.ts` — the single
server-side service-role client factory. In shadow (default) it only **logs**; it does
**not** gate client creation and is wrapped so it can never throw there. This makes the
misconfiguration **visible in preview/dev logs** without changing any behaviour.

**This PR does NOT** change production behaviour, remove/modify any Vercel env var, or wire
`enforce` into any production startup path. `enforce` is opt-in and intended for
preview/dev only, **after** staging exists.

## Staged path to full isolation

### (a) THIS PR — shadow detection ✅
Detection + contract + guard (shadow) + tests. Misconfiguration becomes observable.
No infra change, no behaviour change. Default `ENV_ISOLATION_MODE=shadow`.

### (b) Owner provisions staging — **BLOCKED_EXTERNAL** ⛔
Cannot be done from the repo. The owner must create, outside this codebase:

1. **A dedicated staging Supabase project** (new project ref, e.g. `staging-xxxxx`):
   - schema migrated to match prod (`supabase db push` of all `supabase/migrations/*`),
   - its own `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + anon key,
   - **no production PII** seeded (synthetic fixtures only).
2. **Stripe TEST-mode keys** (`sk_test_…`, `pk_test_…`, test webhook signing secret).
   (Audit note: currently only LIVE Stripe keys exist — this is also what blocks hosted
   Stripe Test Mode E2E.)
3. **Test/staging provider keys** for the OCR/AI providers (so staging never spends prod
   provider budget or hits prod rate limits): Gemini/Vision/DeepSeek test or separate keys,
   or `PROVIDER_MODE=mock`.
4. (Optional) a staging deploy target / Vercel env scope for staging.

Until (1)–(3) exist, **full isolation is impossible** — there is nowhere for preview/dev to
point except prod, and no test-mode keys to use.

### (c) Point preview/dev env to staging refs
In Vercel, set for the **Preview** and **Development** scopes (NOT production):
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` → staging; `STRIPE_*` → test keys;
provider keys → test/mock; and set `APP_ENVIRONMENT=preview`/`development` +
`SUPABASE_PROJECT_REF=<staging-ref>` so the guard fingerprint is unambiguous.

### (d) Flip `ENV_ISOLATION_MODE=enforce` in preview/dev only
Set `ENV_ISOLATION_MODE=enforce` for Preview + Development scopes **only**. Never set
`enforce` on Production (a prod misconfig should page, not crash the app at the client
factory). With staging in place, a preview that still points at prod now **fails closed**.
Rollback: set `ENV_ISOLATION_MODE=shadow` (or `off`) and redeploy — no data change.

### (e) Remove the prod service-role key from preview/dev
Final hardening: delete `SUPABASE_SERVICE_ROLE_KEY` (prod) from the Preview/Development
scopes entirely, leaving only the staging key. After this, even a guard bug cannot give
preview/dev prod write access. **Do this only after (c)/(d) are verified** — removing it
before staging exists breaks preview.

## What is impossible without the staging project

- Preview/dev cannot stop using prod data — there is no other Supabase project to use.
- Hosted Stripe Test Mode E2E cannot run — no `sk_test` keys exist.
- `enforce` cannot be turned on for preview/dev without locking those deployments out of
  their only DB. So `enforce` stays **opt-in / off** until staging is provisioned.

## Exact BLOCKED_EXTERNAL resources the owner must create

1. Staging Supabase project (ref + URL + service-role key + anon key), migrated, no prod PII.
2. Stripe test-mode keys: `sk_test`, `pk_test`, test webhook signing secret.
3. Test/staging provider keys (Gemini / Google Vision / DeepSeek) or `PROVIDER_MODE=mock`.
4. Vercel Preview/Development env scoped to the above (and, last, removal of the prod
   service-role key from those scopes).
