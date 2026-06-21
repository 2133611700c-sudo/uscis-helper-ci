# Agent Operating Contract — the law for any agent on this repo

**Date:** 2026-06-05. Read this BEFORE touching anything. It exists so no agent again confuses live vs target,
jumps to HTR/GPT/OneBrain, or claims a full brain is live. Where this contract and a task prompt disagree on a
safety boundary, the STRICTER rule wins.

## 1. Current live reality (what prod actually runs)
- **A safety wrapper around ONE Gemini reader** — `route → readDocument (Gemini, Gemini-first) →
  post-passes/arbitration → anti-fabrication + self-consistency gates → product adapter → review UI → PDF block`.
- Anti-fabrication + self-consistency gates: **LIVE, flags ON in prod** (PASS_RUNTIME_VERIFIED; hard-case
  birth cert → all identity forced to review; values unchanged; admin fields free).
- SMART_NORMALIZE: **OFF** (DO_NOT_ENABLE).
- **NOT live:** OneBrain/decideField (parked), consensus.ts (parked), HTR (parked), any second provider.

## 2. Target architecture (NOT current — see RECOGNITION_TARGET_ARCHITECTURE_D0_D6.md)
`D0 quality → D1 readers (Gemini-first) → OneBrain shadow → D2 dictionaries(signal) → D3 translation lock →
D4 validators → D5 review → D6 PDF → Auditor`. The target is a destination, never described as today's state.

## 3. Forbidden confusions (each of these is a FAIL if an agent conflates them)
- raw API read ≠ product accuracy.
- GT "ready" ≠ live-door scorable.
- env var present ≠ runtime observed.
- local proof ≠ prod proof.
- target architecture ≠ live reality.
- self-consistency ≠ truth; agreement ≠ truth (it's an instability detector).
- dictionary signal ≠ silent correction (a dictionary signals/raises review, never rewrites a value).
- **Ukrainian source text as-written = truth; a Russianized output = a model error to penalize.**
- Gemini-first ≠ multi-provider fan-out (near-term = top Gemini versions only; no second provider live).
- HTR research ≠ HTR implementation (research/benchmark only; building HTR now is forbidden).

## 4. Agent autonomy

**May do WITHOUT asking:**
- docs-only truth/status updates; read-only verification (git/gh/healthz/Vercel logs).
- run tests; local non-prod harnesses (gitignored, removed after); sanitized monitoring reports.
- create branches + PRs (docs-only or flagged-OFF code per an explicit phase prompt).
- merge a clearly docs-only PR the owner has authorized.

**MUST STOP and ask the owner before:**
- changing prod env; enabling/disabling any flag; deploying outside an auto-deploy-from-merge.
- paid-API fan-out / large cost; uploading real PII to prod.
- filter-repo / git history rewrite; model switch; HTR integration; any second provider (GPT-4o/Claude…).
- OneBrain live-output change; public posting / customer-facing action; any destructive action.

## 5. Evidence contract (every task returns this)
```
RESULT: PASS / FAIL / BLOCKED / DEGRADED
task_type:
commit: branch:
prod_sha / main_sha (if relevant):
tests_run / tests_passed:
evidence_files:
confirmed_no_pii: confirmed_no_runtime_change:
confirmed_qa_private_not_tracked:
next_action:
STOP.
```
A claim is only "verified" with raw evidence (command output / test / log). No claim from a pasted summary.

## 6. Phase gate rules (see RECOGNITION_PHASE_GATES_CHECKLIST.md)
- No phase starts until the previous phase is PASS (or the owner explicitly waives it).
- Order: **Monitoring clean → D0 quality → ReaderResult → OneBrain shadow → D2/D3/D4 → Auditor.**
- No live-output change until shadow evidence exists.
- HTR / any second provider only after **GT from different people** + owner business decision. Gemini-first until then.
- **Gemini top-version benchmarking must happen BEFORE any non-Gemini provider discussion** — a second provider
  is only on the table if Gemini's best versions are benchmarked and demonstrably insufficient, or a clear
  business need is proven. Until then, the answer to "add GPT-4o/Claude/HTR" is no.
- Any new behavior ships behind a flag default OFF; flag OFF must be byte-identical to current prod.

## 7. Hard rules carried from CLAUDE.md / ADRs (do not relitigate)
Patronymic ≠ Middle Name (source field is `patronymic`); historical Міліція → Militsiya; смт = urban-type
settlement; controlling Latin (MRZ/I-94/EAD) beats re-translit; preserve historical place names; never set
VERIFIED_BY_OWNER autonomously; no PII in docs/logs; never commit qa-private. See ADR-016 (hard-case UA = human
review; OneBrain parked; EAD/I-94 out of UA-door scope).
