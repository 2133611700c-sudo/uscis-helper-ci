# L1 + L3-T0 Activation Checklist (owner)

All flags default **OFF** → prod is byte-identical until you flip them. DB side is live and
verified (the owner applied the 4 migrations via Supabase MCP; certifier_override_audit is
append-only with the 5 ADR-021 CHECK constraints; the certifier_id→profiles FK is dropped =
Path B, so any uuid is accepted). Go in this order — do NOT skip the baseline.

**WHERE each variable lives (two different runtimes):**
- **Vercel env** (the Next.js app / route reads these): `OWNER_CERTIFIER_ID`,
  `GUARD_BLOCK_METRICS_ENABLED`, `REFUND_AUTOTICKET_ENABLED`, `CERTIFIER_AUDIT_PERSIST_ENABLED`,
  `CERTIFIER_OVERRIDE_ENABLED`. Set under Vercel → Project → Settings → Environment Variables (Production).
- **GitHub Actions — L1 cron secrets** (the escalation/reconciliation/rate-check scripts read these):
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CONTACT_EMAIL_DESTINATION`,
  `TELEGRAM_OWNER_WEBHOOK_URL`; variable `GUARD_BLOCK_RATE_THRESHOLD`.
- **GitHub Actions — drift-guard secrets** (a SEPARATE set, only for `supabase-drift-check.yml`,
  per docs/ops/SETUP_GITHUB_SECRETS.md): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD`. These do NOT enable the L1 baseline — do not confuse the two sets.

> **L1 baseline DATA COLLECTION needs only `GUARD_BLOCK_METRICS_ENABLED=1` in Vercel** (the route
> writes via the already-set SUPABASE_URL/SERVICE_ROLE_KEY). The cron secrets are for ALERTING,
> which stays silent until `GUARD_BLOCK_RATE_THRESHOLD` is set after the baseline. `OWNER_CERTIFIER_ID`
> belongs to Step 3 (L3 audit), not the baseline.

## Step 0 — prerequisites (one-time)
- [ ] GitHub repo secrets exist: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `RESEND_API_KEY`, `CONTACT_EMAIL_DESTINATION`, `TELEGRAM_OWNER_WEBHOOK_URL`.
- [ ] Vercel env `OWNER_CERTIFIER_ID` = a consistent uuid. Placeholder is fine now:
      `00000000-0000-0000-0000-000000000001` (swap for a real certifier/profile uuid at ADR-021).

## Step 1 — L1 baseline (measurement-first; NO alerts yet)
- [ ] Vercel: `GUARD_BLOCK_METRICS_ENABLED=1`.
- [ ] Leave `GUARD_BLOCK_RATE_THRESHOLD` UNSET (⇒ Infinity ⇒ the hourly rate-check never alerts).
- [ ] Run **14 days**. The `guard-block-rate-check` cron logs the count each hour; the
      `guard_block_events` table fills with PII-free rows.
- [ ] After 14 days: read the typical blocks/hour, pick a threshold (e.g. p95 + headroom),
      set GitHub repo **variable** `GUARD_BLOCK_RATE_THRESHOLD` to that number. Now it alerts.

## Step 2 — L1 A-full (post-payment failure handling)
- [ ] Vercel: `REFUND_AUTOTICKET_ENABLED=1`.
      → a paid 422/403/503/email-fail now sends the correct per-type customer ack +
        (for 403/503) creates a manual-review ticket + alerts you on Telegram.
- [ ] The `escalation-tick` (every 30 min) and `daily-reconciliation` (06:00 UTC) crons
      run automatically. They appear under GitHub → Actions after their first scheduled run;
      to verify immediately, open each workflow and click **Run workflow** (workflow_dispatch).

## Step 3 — L3 T0 durable audit (after L0 is wired, canary)
- [ ] Confirm `OWNER_CERTIFIER_ID` is set (Step 0).
- [ ] Vercel: `CERTIFIER_AUDIT_PERSIST_ENABLED=1`.
- [ ] Vercel: `CERTIFIER_OVERRIDE_ENABLED=1` (canary %, only after the L2 first PASS).
      → each certifier override writes a durable append-only row in `certifier_override_audit`.
      A `[certifier_audit] persist_failed` log = a gap to investigate (e.g. a bad uuid).

## Step 4 — parallel (owner time, the keystone)
- [ ] Collect L2 fixtures per `docs/L2_FIXTURES_HOWTO.md` — **≥30 docs/class from ≥5 people,
      including ≥3 of the 6 adversarial categories per class**. This is what unblocks the L2
      PASS that permits the Step-3 canary.

## Rollback (any step)
- Each flag is independent: set it back to `0` / remove the env var → that layer is OFF,
  byte-identical. The DB tables are inert when their flags are OFF.

## What is already proven
- DB: 4 migrations applied + verified (BEGIN/INSERT/ROLLBACK passed columns + all 5 CHECK
  constraints; UPDATE/DELETE rejected by trigger; FK dropped → arbitrary uuid accepted).
- Code: recordGuardBlock / persistCertifierAudit / triage / escalation / rate / L2 verdict —
  all tested (≈90 unit tests), additive, OFF by default.
