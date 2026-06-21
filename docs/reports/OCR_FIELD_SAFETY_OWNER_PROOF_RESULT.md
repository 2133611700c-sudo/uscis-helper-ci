# OCR Field Safety — Owner Proof Result (2026-06-06)

Sanitized, no PII. Records the state of the owner-assisted canary proof for `OCR_FIELD_SAFETY_ENABLED`.

## RESULT: DEGRADED_MONITORING — flag ON, prod clean. Owner real-document / TPS / PDF proofs PENDING owner action (agent cannot perform them).

The flag is ON and everything observable is clean (no 5xx, no errors, no PII). The three remaining proofs
(real hard-case Translation, TPS, payment-gated PDF block) require the OWNER to physically upload a real
document through the UI and run a Stripe-gated PDF flow. The agent does not upload PII, drive a browser, or
create Stripe sessions — so these proofs cannot be agent-executed. As of this report **no real upload has
occurred** (prod logs show only the agent's synthetic probes). Per the runbook this is DEGRADED_MONITORING:
flag remains ON under monitoring; full PASS awaits the owner proof.

## Preflight (2026-06-06 ~23:37 UTC)
| check | state |
|---|---|
| prod sha == main | ✅ `03eb30f` == `03eb30f` |
| healthz | ✅ ok |
| `OCR_FIELD_SAFETY_ENABLED` | ✅ ON (present, 31m) |
| `SMART_NORMALIZE` / D0 | ✅ absent/OFF (untouched) |
| 5xx last 1h | ✅ none |
| error/fatal last 1h | ✅ none |
| real document traffic since flag ON | ❌ none yet — only agent synthetic probes (all 200) |

## Already proven (agent, route-level, prod)
- 502 fixed (PR #99): zero-field reads return **200** (was 502), confirmed in logs (502 pre-fix → 200 post-fix).
- C3 gate **LIVE** in prod: `ocr_field_safety.applied=true` on the Translation response with the flag ON.
- Zero recognition handled safely: `ok:false` + `review_required:true` + 0 fields, no fabrication, no silent success.
- No 5xx / error / fatal / PII.

## PENDING — owner must perform (agent cannot)
### Step 2 — Translation real hard-case (owner uploads ONE real birth certificate, flag ON)
Fill this sanitized table from the UI (booleans / reason codes only — NEVER paste field values):

| field_name | final_present | candidate_present | review_required | manual_required | reason_codes |
|---|---|---|---|---|---|
| (critical identity field) | no (expected) | yes/no | yes (expected) | yes (expected) | hard_case_manual_required / no_strong_source_anchor / low_confidence |
| (admin field) | yes (ok) | — | no | no | — |

PASS = unsafe critical `final_present=no`, `review_required=yes`, `manual_required=yes`, no 502, no PII.
If an unsafe critical appears as a FINAL value → ROLLBACK (command below).

### Step 3 — TPS (owner runs one controlled TPS upload)
PASS = source-mismatch / legacy critical does NOT become final; candidate preserved; source label truthful;
review/manual preserved; admin fields not over-blocked. If a source-mismatch critical becomes final → ROLLBACK.

### Step 4 — PDF/payment block (owner runs one Translation→review→PDF/payment flow)
PASS = an unresolved critical field BLOCKS PDF/payment (error carries field NAMES only, no values); an admin-only
unresolved field does NOT block; after the owner confirms/corrects the critical field, PDF/payment PROCEEDS.
If an unresolved critical passes into the PDF → ROLLBACK.

## Monitoring (24–48h)
- Agent armed a session-length healthz monitor (catches outages / sha changes).
- Owner watches over 24–48h: `vercel logs` for 5xx / OCR_FIELD_SAFETY exceptions / PDF-payment crashes; support
  complaints; blocked-PDF rate; zero-recognition rate; review/manual rate. Roll back first on any cost/latency/
  over-block/5xx/PII issue.

## Rollback (keep ready)
```
vercel env rm OCR_FIELD_SAFETY_ENABLED production --yes
# then redeploy main → behavior returns byte-identical (no data migration)
```

## Decision matrix (for when the owner completes the proofs)
- All 3 owner proofs clean + logs clean → **PASS_CANARY_FULL** (keep ON, resume D0 → ReaderResult → OneBrain, each gated).
- Owner proofs not yet done, logs clean → **DEGRADED_MONITORING** (current — flag ON).
- Any unsafe-final / PDF-passes-unresolved / 5xx spike / PII → **FAIL_ROLLED_BACK** (rollback immediately).

## Guardrails
No model/provider change. No SMART. No D0 change. No ReaderResult/OneBrain/HTR/GPT/Claude/fanout. No PII
(synthetic inputs only). qa-private=0. ReaderResult/OneBrain remain HOLD until PASS_CANARY_FULL.
