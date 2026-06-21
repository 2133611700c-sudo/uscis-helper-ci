# OCR Field Safety — Canary Result (OCR_FIELD_SAFETY_ENABLED)

**Date:** 2026-06-06 (UTC). Sanitized — all test inputs were SYNTHETIC images (blank/noise), zero PII, no real document.

## RESULT: DEGRADED — flag rolled back to OFF (safe baseline). 502 found is PRE-EXISTING and flag-independent.

The canary could **not** be route-proven because every request that reaches the Translation model-read path
returns **502**, and that 502 **reproduces with the flag OFF** (two separate redeployments of the same commit).
So the safety gate (which runs *after* the read) never executed, and the flag is neither proven safe nor shown
harmful by this route method. Flag returned to OFF. C3 stays **code-ready, prod OFF**.

## Timeline (UTC)
| time | action | result |
|---|---|---|
| 22:28 | preflight | prod==main==`0d3d82b`, healthz ok, flag ABSENT, SMART absent, anti-fab/self-consistency present |
| ~22:31 | `vercel env add OCR_FIELD_SAFETY_ENABLED=1 production` | set |
| ~22:33 | code-free redeploy (apply env) | aliased to messenginfo.com, sha `0d3d82b` |
| 22:33:48 | Translation probe — synthetic noise 740KB, `ua_birth_certificate`, flag ON | **502** |
| 22:35:37 | Translation probe — synthetic blank 715KB, `ua_birth_certificate`, flag ON | **502** |
| ~22:36 | Probe1 — small 10KB `ua_birth_certificate`, flag ON | **200** `needs_better_scan` (early quality guard, before read/gate) |
| ~22:36 | Probe2 — small 10KB `ead` (skips quality floor → reaches read+gate), flag ON | **502** |
| ~22:39 | `vercel env rm OCR_FIELD_SAFETY_ENABLED production` + redeploy | flag ABSENT (OFF) |
| 22:41:06 | healthz (OFF baseline) | ok, sha `0d3d82b` |
| 22:41 | **disambiguation** — identical Probe2 (`ead`, 10KB), flag **OFF** | **502** (← same as flag ON) |

## Sanitized findings
- **Route alive / flag-early-path healthy:** small UA-identity image → HTTP 200 `needs_better_scan` (the existing
  image-quality guard returns before any model read or safety gate). No flag-caused crash on the early path.
- **Every gate-reaching request → 502**, independent of image size (10KB / 715KB / 740KB) and docType (UA / `ead`).
- **No exception/stack in runtime logs** for the 502s — only a normal `[document_class_metric]` info line, then 502.
  Signature = gateway/function **timeout in the async model-read path**, not a synchronous throw.
- **Flag OFF reproduces the 502** on the identical request → the 502 is **pre-existing and flag-independent**.
  The OCR field-safety gate is synchronous/pure (full unit coverage) and runs *after* the read; it cannot cause a
  502 timeout, and it never ran in these requests.

## Per-flow canary status
| flow | route-level prod proof | status |
|---|---|---|
| Translation (vision-extract) | blocked by pre-existing read-path 502 | NOT PROVEN (flag-independent blocker) |
| TPS (ocr/extract) | not executed (would need a controlled doc; deferred) | NOT TESTED |
| Legacy boundary (ocr/extract) | not executed | NOT TESTED |
| PDF/payment (generate-pdf) | **payment-gated** (Stripe token / owner-bypass) — not agent-testable | OWNER-ONLY |

Logic-level flag-ON proof for all 4 flows remains green (`c3FlowSafety.proof.test.ts`); that is unaffected.

## Decision rationale
Per the explicit stop-conditions ("rollback on 5xx", "do not leave flag ON unproven", "do not call PASS without
route proof"): a 5xx was observed on the wired route, so the flag was **rolled back to the proven-safe OFF
baseline** before claiming anything. The follow-up flag-OFF probe then proved the 502 is **not** a C3 regression.

## Rollback status
- `OCR_FIELD_SAFETY_ENABLED` **ABSENT (OFF)** in prod (verified `vercel env ls production`).
- prod redeployed at `0d3d82b`; healthz ok. anti-fab / self-consistency / SMART / D0 untouched.
- No model/provider/HTR/OneBrain/ReaderResult/SMART change. No PII (synthetic inputs only). qa-private=0.

## NEW finding for owner (separate from C3, out of canary scope)
The public Translation `vision-extract` route returns **502 on requests that reach the Gemini model-read path**,
at least for synthetic blank/noise images, in prod commit `0d3d82b` — with the flag OFF too.
**Caveat — NOT proven for real uploads:** no real user traffic hit this route in the observed window, so this may
be specific to contentless synthetic images pushing the model read past the function timeout. This needs a
separate investigation (function maxDuration vs. Gemini latency on low-content images, or a real-document check).
It does **not** change model/provider and is filed as a finding, not a fix.

## Next action
1. Owner-side: to truly canary OCR field safety, the owner uploads ONE real hard-case document through the
   Translation/TPS UI with the flag ON (per OCR_FIELD_SAFETY_CANARY_RUNBOOK.md) — the only path that exercises the
   gate on real content and the payment-gated PDF flow.
2. Triage the pre-existing `vision-extract` read-path 502 (separate ticket) — confirm whether real uploads are
   affected or only synthetic/low-content images.
3. ReaderResult / OneBrain remain **HOLD** until a real canary is clean.
