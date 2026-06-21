# OPS INCIDENT LOG

One entry per operational incident / sensitive operation. Newest first. PII-free.

## 2026-06-11 — METHODOLOGY FIX: wizard-level E2E UI smoke added
- 5+ debugging sessions were lost because verification stopped at the API layer
  (vision-extract probes). Wizard CONFIG bugs were invisible: the autoread flag that
  silently skipped extraction for birth/marriage, and the 6-key label whitelist that
  silently dropped extracted fields (passport number/expiry, 9/10 birth fields). Both
  were found by the OWNER, not by our tests.
- FIX: Playwright E2E smoke (tests/e2e-ui/wizard-smoke.spec.ts) drives the REAL wizard
  on the live deployment with SYNTHETIC fixtures (birth + military), asserting the
  review table renders real rows and never falls to the manual notice.
  .github/workflows/post-deploy-ui-smoke.yml runs it on every production deployment.

## 2026-06-11 — OCR_FIELD_SAFETY false-positive nulling (DETECTED BY OWNER T+24h TEST, ROLLED BACK <10min)
- Owner manual test right after C-activation: TPS passport → "Фамилия: Не найдено — введите
  вручную"; translation wizard → "Извлечённых полей нет" (manual-after-payment fallback).
- ROOT CAUSE (confirmed in code, tps/ocr/extract route ~1205-1226): with
  OCR_FIELD_SAFETY_ENABLED=1, protectOcrField marks critical fields candidate_only when
  there is no strong source anchor → normalized_value→null; product UIs render value=null
  as "not recognized". EXACTLY the latent→active false-positive the audit predicted
  ("OCR safety blocking after future OCR_FIELD_SAFETY_ENABLED=1"). The activation smoke
  checked HTTP/status only, NOT field values — probe blind spot, now known.
- ACTION: rollback per ORR §9/§10 (default=rollback): env rm OCR_FIELD_SAFETY_ENABLED +
  git redeploy (cdc0785). Decision-to-rollback < 10 min. Other 5 activation vars remain
  (observability-only, unaffected).
- LESSONS: (1) this flag needs UI-aware integration (candidate/review rendering) before any
  re-enable — it is NOT a drop-in; (2) smoke probes must assert FIELD VALUES, not just 200;
  (3) the ORR owner-test checkpoint did its job — the owner caught it within the window.
- Re-test request to owner: TPS + translation upload again after cdc0785.

## 2026-06-11 — C-ACTIVATION executed (per C_ACTIVATION ORR, path α agent-executed on owner order)
- 6 env-vars set in production: OWNER_CERTIFIER_ID (stable uuid, owner copy in
  ~/.uscis-helper-owner-certifier-id), GUARD_BLOCK_METRICS_ENABLED=1 (14d baseline clock),
  REFUND_AUTOTICKET_ENABLED=1, CERTIFIER_AUDIT_PERSIST_ENABLED=1 (receiver armed),
  OCR_FIELD_SAFETY_ENABLED=1 (post-payment guard, A-full handled), CONFIRMED_VALUE_GUARD_MODE=shadow (pin).
- NOT activated (owner gates): guard enforce (baseline-first), CERTIFIER_OVERRIDE (L2 PASS + D5 UI).
- ORR deviations (recorded): (1) deploy via git empty-commit, NOT `vercel --prod` — per the
  2026-06-11 broken-CLI-deploy rule in this log; (2) Step-4/6 verify strings adjusted to real
  code signals (the ORR named log lines that do not exist).
- Known degradation: TELEGRAM_OWNER_WEBHOOK_URL absent in Vercel → owner-alert returns
  not_configured (ticket + customer ack still fire). Owner: add the webhook to upgrade alerts.
- Pre-conditions: all TRUE (prod 34fdb51, tsc 0, files present, vercel auth, 0 processing orders).
- Checkpoints: T+60min log sweep (agent, below), T+24h owner test paths, T+14d threshold calibration.

## 2026-06-11 — broken manual CLI deploy → vision-extract 504 (RESOLVED by rollback)
- The git webhook did not fire for commit 758415b; agent ran `npx vercel --prod --yes`
  from the repo root. The resulting artifact 504-ed EVERY vision-extract request
  (healthz fine) — monorepo CLI build ≠ git-integration build. Detected within minutes
  by a light synthetic probe; ROLLED BACK via `vercel promote <last-good>` per the
  runbook (service restored, probe 200). Exposure window ≈15 min, low-traffic hours.
- RULE: deploy ONLY via git push (the integration build). If the webhook misfires,
  re-trigger with an empty commit — never a root-level CLI deploy.

## 2026-06-11 — L1 escalation-tick cron failure (RESOLVED)
- Owner reported `L1 Escalation Tick` failing (~32s). `gh run` logs: Postgres `22P02` —
  supabase-js `.contains()` with a JS array on a **jsonb** column emits a `{}` pg-array literal.
- Fix `dcc2ceb`: both cron scripts pass `JSON.stringify([...])`. Re-ran all 3 workflows live:
  escalation-tick / daily-reconciliation / guard-block-rate-check — all green.
- Swept the repo: no other `.contains(` jsonb call sites exist.

## 2026-06-10/11 — owner-document prod test (PII handling record)
- Purpose: verify the handwritten-Cyrillic pipeline on a REAL handwritten certificate
  (before/after the review-reasons fix). Found + fixed a real bug (reasons lost at two
  adapter boundaries); verified the fix live.
- PII trail audit (performed immediately):
  - Prod DB: **0 rows** created in translation_quality_log / extraction_runs /
    translation_sessions / tps_ocr_audit in the test window (the direct vision-extract
    call carries no session) — verified by SQL.
  - Local: the downscaled temp image + both response JSONs deleted from /tmp.
  - Vercel logs: our log lines are PII-free by design (counts/flags only; bodies not
    logged). Standard log retention applies; nothing actionable to delete.
  - Third-party: the image was processed by the same Gemini path every real client
    uses (provider retention per its API terms). No additional copies created.
- RULE GOING FORWARD: prod tests on real owner documents only on explicit owner request,
  with immediate trail audit + this log entry. For routine verification prefer the
  synthetic fixtures (benchmark/examples/) — they exercise the same chain.
