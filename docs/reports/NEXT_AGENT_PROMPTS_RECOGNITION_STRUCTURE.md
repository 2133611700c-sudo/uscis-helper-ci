# Next Agent Prompts — Recognition Structure (copy-paste, one at a time)

**Date:** 2026-06-05. Each prompt is self-contained, evidence-first, and forbids touching the proven safety
wrapper. Run in order; do NOT batch. Common forbiddens (all prompts): no prod env change, no flag flip without
owner, no model switch, no SMART, no PII in docs/logs, no committing qa-private, no calling TARGET the CURRENT.

---

## Prompt A — Monitoring closeout (Wave D)
**Context:** PASS_RUNTIME_VERIFIED; PR #87 merged; gates ON in prod; temp workflow self-no-ops after 2026-06-07.
**Goal:** confirm 24–48h stable, then close monitoring.
**Allowed:** read-only healthz + `vercel logs/env` per `PROD_SAFETY_MONITORING_24H_RUNBOOK.md`; delete the temp
workflow file after the window (docs/CI-only PR).
**Forbidden:** flag/env/code change; rollback without owner confirm (unless active harm).
**Tests/evidence:** healthz ok; 5xx=0; metric count > 0; no cost/latency spike; sanitized summary.
**Return:** RESULT, errors_24h, metric_count, review_rate_concern, recommend(keep/rollback), workflow_deleted.
**STOP** after the summary; do not start architecture until clean.

## Prompt B — D0 quality / reshoot (Phase 2)
**Context:** bad photo breaks everything downstream; quality signals exist in preprocess but don't reach readDocument.
**Goal:** additive quality verdict (`accept`/`degraded`/`reshoot_required`) + UI message; behind a flag, default OFF.
**Allowed:** new `qualityVerdict` module; thread signals (rotation/blur/crop/contrast/bounds/orientation); UI hint.
**Forbidden:** blur as a fabrication signal; blocking reads in prod before measured; flag ON in prod.
**Files:** `lib/canonical/vision/preprocess*`, new quality module, intake routes, UI.
**Tests:** clean→accept; rotated→corrected; too-blurred→reshoot; cropped-edge→reshoot; flag OFF→byte-identical.
**Return:** RESULT, files, tests_pass, flag_default_off_confirmed, prod_unchanged.
**STOP** with flag OFF; owner decides any prod enable later.

## Prompt C — ReaderResult contract (Phase 3) — GEMINI-FIRST
**Context:** one Gemini reader; need a reader abstraction. Strategy is **Gemini-first** — near-term reader work
stays within the Gemini family; a second provider is NOT near-term.
**Goal:** formalize `ReaderResult` interface; wrap the current Gemini provider as `reader_1`. No fan-out, no behavior change.
**Allowed:** pure interface + adapter; any second reader = a provider-agnostic DISABLED stub (NOT GPT-4o-specific).
**Forbidden:** any second provider live; fan-out; consensus revival; any change to readDocument's output shape.
**Files:** new `lib/docintel/readers/ReaderResult.ts` + adapter.
**Tests:** Gemini output maps losslessly to ReaderResult; readDocument output unchanged (snapshot).
**Return:** RESULT, interface_file, mapping_test_pass, prod_byte_identical.
**STOP** after the adapter; no live multi-reader.

## Prompt D — OneBrain shadow-only (Phase 4)
**Context:** decideField is PARKED (0 callers, placeholder thresholds). Need a single decision center, shadow-first.
**Goal:** wire decideField to RECEIVE reads+signals and WRITE a sanitized decision-comparison record; LIVE OUTPUT UNCHANGED. Behind `ONEBRAIN_DECIDE_FIELD_ENABLED` (default OFF).
**Allowed:** shadow compare + sanitized record (no PII); thresholds stay PLACEHOLDER.
**Forbidden:** live decisioning; threshold "calibration" on N≈1 person; changing the live value/review path.
**Files:** `lib/docintel/oneBrain/decideField.ts`, shadow writer, readDocument hook (flagged).
**Tests:** flag OFF→no call; flag ON→live output identical, only shadow record written; no PII in record.
**Return:** RESULT, flag_default_off, live_output_diff(must be zero), pii_in_record(no).
**STOP** at shadow; no live wiring.

## Prompt E — Auditor / correction loop (Phase 9 design)
**Context:** user corrections are the best evaluation/GT signal; today they're not systematically captured for learning.
**Goal:** DESIGN (and optionally scaffold) an audit record `{field_before, field_after, reason, document_class, reader_id}` — PII-free in public logs; private GT candidate stored separately (gitignored).
**Allowed:** design doc + optional PII-free scaffold; reuse the existing `user_corrections` path.
**Forbidden:** PII in public logs/docs; auto-promoting model output to ground truth; committing GT/qa-private.
**Files:** `correct-field` route (read), new audit writer (scaffold), gitignored GT-candidate store.
**Tests:** correction recorded with field NAMES + reason codes only; no values/PII in public sink.
**Return:** RESULT, design_file, scaffold(yes/no), pii_free_confirmed.
**STOP** after design/scaffold; no model evaluation yet (needs GT from different people).

---

### Standard return skeleton (every prompt)
```
RESULT: PASS / FAIL / BLOCKED / DEGRADED
commit: branch:
files_changed:
tests_run / tests_pass:
flag_default_off_confirmed:
prod_unchanged: yes
confirmed_no_pii: confirmed_qa_private_not_tracked:
next_action:
STOP.
```
