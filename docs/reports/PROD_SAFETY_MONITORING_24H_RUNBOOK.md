# Prod Safety Monitoring — 24–48h Runbook (Wave D)

**Date:** 2026-06-05. After PASS_RUNTIME_VERIFIED (anti-fab + self-consistency gates ON in prod).
READ-ONLY. Do NOT change code, flags, or prod env. No PII in output. Watch for 24–48h, then decide.

## Automated (no secrets): `.github/workflows/prod-safety-monitor.yml`
Curls the PUBLIC healthz every 6h (+ manual `workflow_dispatch`), fails if `status != ok`. Self-no-ops after
2026-06-07. **Delete that workflow file when monitoring is done** (it is intentionally temporary). It does NOT
read Vercel logs/env (no `VERCEL_TOKEN` repo secret) — those are the manual checks below.

## Manual checks (need the local `vercel` CLI, authed as owner)

```bash
# 1) health + sha == main
curl -s https://messenginfo.com/api/healthz
git fetch origin && git rev-parse --short origin/main      # sha should match (allow brief deploy lag)

# 2) env flags still set (presence; ls does not print values)
vercel env ls production | grep -E 'ANTI_FABRICATION|SELF_CONSISTENCY|DOCUMENT_CLASS_METRICS|SMART_NORMALIZE'
#    expect: ANTI_FAB + SELF_CONSISTENCY + DOCUMENT_CLASS_METRICS present; SMART_NORMALIZE absent

# 3) errors / 5xx in the last 24h  (expect 0)
vercel logs <latest-production-deployment-url> --since 24h 2>&1 | grep -iE 'error|fatal| 5[0-9][0-9] ' | head

# 4) extraction traffic + gate activity (proxy)
vercel logs <latest-production-deployment-url> --since 24h 2>&1 | grep -c 'document_class_metric'
vercel logs <latest-production-deployment-url> --since 24h 2>&1 | grep -c 'vision-extract'

# 5) self-consistency cost/latency: it does N=2 reads ONLY on hard-case birth classes.
#    Look for repeated/runaway reads on the same request id; check function duration trend in the dashboard.
```
(Get `<latest-production-deployment-url>` from `vercel ls --prod` or the Vercel dashboard.)
**Never print extracted field values / PII** — count occurrences, read field NAMES only.

## What to watch (and the signal)
1. **5xx / error / fatal** — must stay ~0. Any spike → investigate.
2. **document_class_metric count** — should track real upload traffic (sanity that the pipeline runs).
3. **review_rate on birth certs** — the gate forces review on ALL birth certs **including printed** (coarse
   precision). Watch for false-positive-review complaints (users told to review a correct printed cert).
4. **self-consistency latency/cost** — N=2 reads on hard-case only; watch for a duration/cost rise.
5. **UI / PDF / payment block** — users blocked at pay/download. Confirm it's only when review is unresolved.
6. **support complaints / abandonment** at the review step.

## Rollback policy (do NOT execute without owner confirmation, unless active harm)
- **Latency/cost spike from self-consistency** → roll back SELF_CONSISTENCY first, keep ANTI_FAB ON:
  ```bash
  vercel env rm SELF_CONSISTENCY_GATE_ENABLED production --yes   # then redeploy main
  ```
- **Gate wrongly blocks UI/PDF** → pause, inspect, owner decision.
- **Critical identity wrong WITHOUT review** (the exact harm the gate prevents) → roll back both safety flags,
  mark FAIL, investigate. Rollback is byte-identical (test-proven).

## Exit
- Stable + 0 errors through 24–48h → keep gates ON; delete the temporary monitor workflow.
- Then the next real unblock is **GT from different people** (owner) — not new code. HTR/OneBrain stay parked.
