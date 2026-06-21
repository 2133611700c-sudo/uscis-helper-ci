# Staging provisioning checklist (V1_COMPLETION · STAGING_CONTROL_PLANE)

> **This is a manual runbook. Nothing here is auto-created by code or CI.** The
> control plane only *validates* a staging env (fail-closed) and refuses
> production targets — it never provisions resources, never requests keys, and
> never spends money. Provisioning is an explicit owner action.

## Boundaries (must all be SEPARATE from production)
- [ ] **Supabase**: a dedicated staging project (NOT `rtfxrlountkoegsseukx`).
- [ ] **Vercel**: a dedicated preview/staging environment (NOT the production env).
- [ ] **Stripe**: Test Mode only (`pk_test_`/`sk_test_`); never `*_live_`.
- [ ] **OCR/AI providers**: separate test keys with their own quotas/billing.

## Required env (validated by `apps/web/src/lib/v1/stagingContract.ts`)
- [ ] `STAGING_SUPABASE_URL` (staging ref, not production)
- [ ] `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- [ ] `STAGING_APP_URL` (staging/preview host, not `messenginfo.com`)
- [ ] `STRIPE_TEST_MODE=test`
- [ ] `STAGING_OCR_PROVIDER_KEY` (test key, not `*_live_`)
- [ ] startup validation passes: `validateStagingEnv(env).ok === true`

## Fail-closed rules (enforced)
- [ ] Any staging value referencing a production identifier → rejected.
- [ ] `assertNotProductionTarget()` guards every benchmark/E2E target.
- [ ] Paid provider calls are DISABLED by default (`providerBudget.DEFAULT_BUDGET`).
- [ ] OCR cache key includes `file_sha256 · provider · model_version · prompt_version · preprocessing_version`; a cache miss is filled only after explicit budget approval.

## CI repo variables/secrets (set ONLY when staging actually exists)
- [ ] `vars.V1_STAGING_READY=true` (until then nightly/benchmark stay dry-run)
- [ ] `secrets.STAGING_APP_URL` (+ other staging secrets)
- [ ] `vars.V1_BENCHMARK_PAID_ENABLED=true` ONLY after caps + approval are in place

## Explicitly NOT in this phase
- No real provider calls · no Stripe payments · no key requests · no Supabase/Vercel
  resource creation · no production changes · PR #119 untouched.
