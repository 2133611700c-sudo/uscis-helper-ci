# OWNER QUEUE — actions only the owner can do

Items here are blocked on a human (PII, real documents, prod env, billing).
Agents do NOT perform these. Newest first.

## 2026-06-06 — merge vision-extract 502 fix, then re-run OCR canary
- P0 vision-extract 502 root-caused (status: ok ? 200 : 502 on zero-field reads) and FIXED on branch fix/vision-extract-502-triage (PR open). Affects real hard-case docs that read 0 fields = the original "0 results" incident.
- **Owner action:** review + merge the fix → prod redeploy → confirm a no-fields upload returns 200 (not 502/"HTTP 502").
- **Then:** re-run the OCR field-safety canary (blocker removed) per OCR_FIELD_SAFETY_CANARY_RUNBOOK.md — owner uploads one real hard-case doc with OCR_FIELD_SAFETY_ENABLED=1.
- ReaderResult/OneBrain HOLD until canary PASS.

## 2026-06-06 — canary DEGRADED: owner real-document canary needed + vision-extract 502 triage
- OCR field-safety canary could not be route-proven: the Translation read path returns 502 (pre-existing, flag-independent — reproduced with flag OFF). Flag rolled back to OFF. Gate never ran on real content.
- **Owner action 1:** upload ONE real hard-case document through Translation/TPS UI with OCR_FIELD_SAFETY_ENABLED=1 (per OCR_FIELD_SAFETY_CANARY_RUNBOOK.md) — only path that exercises the gate on real content + the payment-gated PDF flow. Agent cannot (no PII upload, no Stripe token).
- **Owner/triage action 2:** investigate the pre-existing vision-extract 502 on gate-reaching requests — confirm whether REAL uploads are affected or only synthetic/low-content images. May relate to function maxDuration vs Gemini latency. (Agent must not change model/provider.)
- D0/ReaderResult/OneBrain HOLD until a real-document canary is clean.

## 2026-06-06 — C3 merged; owner canary for OCR_FIELD_SAFETY_ENABLED
- C3 global OCR field safety wired into all 4 flows + merged to main (#94/#95/#96). Flag ABSENT/OFF in prod.
- **Owner action:** run the canary per `docs/reports/OCR_FIELD_SAFETY_CANARY_RUNBOOK.md` — enable
  `OCR_FIELD_SAFETY_ENABLED=1` (preview first), do one controlled upload per flow, verify candidate≠final /
  PDF-block / admin-not-overblocked, then production. Agent will NOT flip the prod flag.
- D0/ReaderResult/OneBrain stay HELD until canary stable.

## 2026-06-05 — D0 built (flag OFF); owner decisions

- **D0 quality/reshoot is implemented behind `QUALITY_GATE_ENABLED` (default OFF)** — prod byte-identical, not
  enabled. **Owner:** after a local/browser proof, you may approve a `QUALITY_GATE_ENABLED` **canary** (agent
  will not flip the prod flag). Review the PR.
- Next code step (agent, no owner needed): **Gate 2 — ReaderResult interface** (Gemini-first, no behavior change).
- Still gated on owner: prod flag/env changes; GT from different people (for any 2nd provider/HTR); "start" for
  any phase that changes live behavior.

## 2026-06-05 — agent rails set; owner commands needed to advance

Operating contract + phase gates + D0 start pack are in (PR #89 Gemini-first merged). **Owner commands required:**
- **"start D0"** — to begin the next CODE step (D0 quality/reshoot, flag default OFF). Only after a clean
  24–48h monitor window. The prompt is ready in `docs/reports/NEXT_PROMPT_B_D0_QUALITY_RESHOOT.md`.
- **Any prod flag/env change** — agent never flips a prod flag itself.
- **GT from DIFFERENT people** — the gate for any second provider (GPT-4o/Claude) or HTR decision (Gemini-first until then).
- **Owner command required before ANY non-Gemini provider discussion** — and only after a Gemini top-version
  benchmark shows Gemini's best is insufficient (or a clear business need). No fan-out by default.
- **Delete the temp monitor workflow** after the 48h window.
- Merge the agent-operating-contract PR (docs-only) to lock the rails in main.

## 2026-06-05 — GEMINI-FIRST locked + follow-up PR awaiting owner merge

Reader strategy correction: **Gemini-first**. Roadmap docs no longer frame GPT-4o as a near-term step.
- **Follow-up PR `recognition-roadmap-gemini-first-correction`** (docs-only) is OPEN — agent did NOT auto-merge
  it (per owner boundary: follow-up PRs need explicit owner go). **Owner: merge it** to lock Gemini-first in main.
- Near-term reader work = top Gemini versions/benchmarks only. A second provider (GPT-4o/Claude) + HTR =
  research-only, gated on **GT from different people** + owner decision + cost/privacy/accuracy evidence.
- Next code step stays **Prompt B (D0 quality, flag OFF)** — only after a clean 24–48h monitor + owner "start D0".

## 2026-06-05 — recognition structure roadmap accepted (map + phased plan, docs-only)

Next recommended sequence: close Wave D monitoring (24–48h) → Phase 2 (D0 quality/reshoot) → Phase 3
(ReaderResult contract) → Phase 4 (OneBrain shadow-only) → D2/D3/D4 → Auditor. Maps + phased plan + copy-paste
prompts are in: `docs/reports/RECOGNITION_SYSTEM_TRUTH_MAP.md`, `docs/architecture/RECOGNITION_TARGET_ARCHITECTURE_D0_D6.md`,
`docs/reports/RECOGNITION_BUILD_PLAN_PHASES.md`, `docs/reports/NEXT_AGENT_PROMPTS_RECOGNITION_STRUCTURE.md`.

**Blocked on owner (gate the deep layers):**
- **GT from DIFFERENT people** — the single unblock for OneBrain calibration (Phase 4 stays shadow until then).
- **HTR A/B business decision** (Phase 10) — Transkribus (third-party PII/DPA) vs TrOCR (own infra) — later, ROI-gated.
- **PII history externalization decision** — only if the repo ever leaves private mode (runbook ready).
- **Delete the temp monitor workflow** after the 48h window.

## 2026-06-05 — Wave D monitoring active (PASS_RUNTIME_VERIFIED reached)

Gate verification COMPLETE; safety-wrapper working in prod. Now 24–48h monitoring.
- **Automated:** `.github/workflows/prod-safety-monitor.yml` watches public healthz every 6h (read-only, no
  secrets). **Owner: delete this workflow file after the window** (it self-no-ops after 2026-06-07; remove to
  avoid toggle debt). It can't read Vercel logs (no `VERCEL_TOKEN` secret).
- **Manual (owner, ~daily):** run `docs/reports/PROD_SAFETY_MONITORING_24H_RUNBOOK.md` — `vercel env ls` +
  `vercel logs --since 24h` for errors/metric/review_rate; watch printed-birth-cert false-positive review.
- **Rollback (owner decision):** if self-consistency raises latency/cost → `vercel env rm
  SELF_CONSISTENCY_GATE_ENABLED production --yes` (keep ANTI_FAB ON); byte-identical by test.
- **Next real unblock (owner):** GT from DIFFERENT people — the only thing that lets calibration proceed.
  No new architecture (HTR/OneBrain/GPT-4o/SMART/L2-WIRE stay parked).

## 2026-06-04 — TURNKEY: gate canary test-proven · OneBrain parked · EAD/I-94 out of scope · decisions for owner

Agent did the full professional pass that does NOT touch prod (ADR-016). Three owner decisions remain:

**1. Gate canary — now turnkey (one owner sequence).** Rollback is PROVEN byte-identical by an automated test
(`canary safety contract`); pre-flight is all green except your enable step. Runbook with the exact commands +
the coarse-precision caveat (gate force-reviews ALL birth certs, printed too): `ANTI_FAB_GATE_CANARY_PLAN.md`
→ "TURNKEY EXECUTION". **Owner action:** run the canary sequence when ready (still your explicit command; agent
will not flip the flag). SMART_NORMALIZE stays OFF.

**2. PII in git history — runbook PREPARED, needs a yes/no.** Survey done (read-only): repo is **PRIVATE**
(not publicly exposed); `docs/reports/evidence/` already gitignored (no new leak); what remains is **51 real
USCIS-packet blobs in history** + the name as an intentional fixture in 26 test files + ID tokens in narrative
docs. Full two-phase runbook (Phase A current-tree scrub = non-destructive; Phase B filter-repo history rewrite
= destructive, force-push) with exact commands, classification, and verification:
**`docs/reports/PII_HISTORY_REWRITE_RUNBOOK.md`** — PREPARED, NOT executed. **Decide:** will this repo EVER be
shared outside the owner? **yes** → run Phase A now, schedule Phase B in a maintenance window; **no** → record
"internal-only forever" and stop re-raising (since it's private + evidence already ignored, urgency is low).

**3. GT breadth — the only thing that unblocks calibration.** Calibration is BLOCKED_INSUFFICIENT_N because all
GT is ~1 person. Need GT from **different people** (any UA docs). Not more docs from the same person.

**Withdrawn (no longer an owner task):** "make EAD/I-94 scorable / reach 6/6." Per ADR-016 these are US/Latin
docs read by the controlling-Latin path, not the UA brain — out of scope by design, a category error, not a
missing fixture. UA live-door coverage is 4/4 of the UA docs that have a real image.


## 2026-06-04 — GT=6 verified · accuracy reconciled · gate = READY_FOR_OWNER_APPROVED_CANARY

**Verified by agent from raw (no values printed):**
- GT ready = **6/30** `VERIFIED_BY_OWNER` (soviet 6/6, handwritten 6/6, internal_passport 5/5, military_id_p1 6/6, i94 6/6, ead 6/6). **GT-count blocker CLEARED.**
- BUT live-door-scorable = **3** (2 hard-case birth + internal_passport). `military_id_p1` has **no registry doc type** (`ua_military_id` absent); `ead`/`i94` are **US docs with no upright real image** → not scorable. Owner's "accuracy on 6 docs" is not evidence-backed; real coverage = 3.
- Hard-case = **1/4 correct even on 3.1-pro** → UNRESOLVED_BLOCKER. Mode C drives `false_negative_review`→0 on both. Passport = 3/3 read fields correct (patronymic dropped — coverage gap).
- Calibration = **BLOCKED_INSUFFICIENT_N** (~11 fields can't set numeric thresholds).

**Owner-only — to scale evidence (the real unblock for calibration):**
1. Provide an **upright real EAD and I-94 image** (matching the filled GT) into `test-fixtures/real-docs/` (gitignored) so they become scorable.
2. Add a **`ua_military_id` registry doc type** (or tell agent to) so `military_id_p1` is routable — code task, needs owner OK.
3. Expand GT to **different people** + more UA-printed docs (current N is 1 person).

**Owner-only — enable the anti-fabrication gate (DO NOT run until rollback rehearsal done; agent will NOT run these):**
```
# canary FIRST (preview/slice), observe metrics, only then production:
vercel env add ANTI_FABRICATION_GATE_ENABLED production   # value: 1
vercel env add SELF_CONSISTENCY_GATE_ENABLED  production   # value: 1  (mode C; needs the former)
# redeploy main (NOT a feature branch)
```
**Rollback (must be ready before enabling):**
```
vercel env rm ANTI_FABRICATION_GATE_ENABLED production
vercel env rm SELF_CONSISTENCY_GATE_ENABLED  production
# redeploy main → behavior returns byte-identical (no data migration)
```
**Stop-conditions (hard — rollback/block immediately):**
- ANY critical identity field wrong WITHOUT review (`false_negative_review` > 0 on critical identity) → rollback/block.
- Review-rate spike beyond the agreed ceiling with no safety payoff → pause + retune.
- `SMART_NORMALIZE_ENABLED` stays **OFF** (no gain). Model switch / HTR / L2-WIRE / P2.4-P2.5 = NOT in this scope.

## 2026-06-04 — UA correction + gate canary prep
- Source docs are UKRAINIAN; Russianized output = model error (memory ukrainian-source-language). KMU-55/dict only after correct UA read.
- ANTI_FABRICATION_GATE = READY_FOR_CANARY_PREP (plan: docs/reports/ANTI_FAB_GATE_CANARY_PLAN.md). NOT enabled. Pre-canary gates unmet: GT≥6 + calibration + rollback rehearsal.
- hard-case model = UNRESOLVED_BLOCKER (neither 2.5-flash nor 3.1-pro reads UA hard-case reliably).
- SMART_NORMALIZE = DO_NOT_ENABLE.


## 2026-06-04 — OneBrain target + priorities (see ARCHITECTURE_INVENTORY_VERDICT.md)

Verdict: PASS_AS_TRUTH_INVENTORY / DEGRADED_AS_TARGET_ARCHITECTURE. Current live = 1 Gemini reader +
arbitration + gates (consensus.ts dormant, HTR not live). Target = OneBrain single field-decision center.

Priorities (do NOT build all at once):
- **L0** (done in docs): inventory verdict + status/handoff.
- **L1** ✅ DONE (design): OneBrain `decideField()` contract + design review.
- **L2-SCAFFOLD** ✅ DONE (code, not wired): `oneBrain/decideField.ts` pure module + tests; prod byte-identical.
- **L3** ✅ DONE (docs + GT workflow): GT-language intent DECIDED (value = as-written; normalized = canonical;
  dictionary = hint, never overwrite — `docs/reports/GT_LANGUAGE_INTENT.md`); calibration plan
  (`docs/reports/ONEBRAIN_L3_GT_CALIBRATION_PLAN.md`); 3 new PII-free templates added
  (`docs/templates/ground-truth/{birth_cert_ua_printed,international_passport,id_card}.template.json`).
  **Owner action (the real unblock):** fill a 6–10 doc GT batch across categories (soviet/UA-printed/
  UA-handwritten birth, passport/ID, EAD, I-94) — copy a template into `qa-private/ground-truth/`, fill
  `value` AS-WRITTEN, set `VERIFIED_BY_OWNER` + `owner_verified_fields`. Then agent calibrates thresholds.
- **L2-WIRE** (after L3 calibration): route decideField through readDocument behind flag, shadow-first, prod byte-identical.
- **L2** (agent, behind flags OFF): integrate the proven anti-fabrication/self-consistency gate INTO OneBrain.
- **L3** (owner): expand GT (different people + Ukrainian-language docs); resolve GT-language intent (RU as-written vs UA canonical); rerun accuracy.
- **L4** (later, metrics-gated): second independent reader (true consensus) / HTR / model switch.

Flag decisions (owner-gated to flip): SMART_NORMALIZE = DO_NOT_ENABLE; HTR = DO_NOT_BUILD; model = DO_NOT_SWITCH;
gate = PREPARE_CANARY only (no prod enable without owner approval + rollback).

## 2026-06-04 — current owner-gates (after PR #80 merge)

**DONE (no longer owner-blocked):**
- ✅ Durability: branch pushed → PR #80 → **MERGED** → `prod == main` (origin/main `46a0912`; healthz ok sha `46a0912`).
- ✅ `DOCUMENT_CLASS_METRICS_ENABLED=1` set in Production (metric code now in prod via main).
- ✅ Prod health verified (messenginfo.com ok, latest deploy Ready).

**DONE:**
- ✅ GT filled (VERIFIED_BY_OWNER, 6 identity fields) + accuracy OFF-vs-ON run (see `ACCURACY_OFFON_RESULTS.md`).

**OPEN — owner only:**
1. **Clarify GT language intent:** should ground-truth be "as written on the document" (Russian spelling)
   or "canonical Ukrainian" (Ukrainian spelling)? The test docs are Russian-language; exact-match scoring
   currently counts the RU↔UA given/patronymic spelling difference as "wrong". This changes which per-field
   misses are real errors vs expected transliteration. (No real names quoted here — see GT files.)
2. **Provide more/varied GT** (different people, Ukrainian-language docs). Current evidence = N=2/one-person
   = signal, not a prod-grade verdict.
3. **Flag decisions (after more GT):** `SMART_NORMALIZE_ENABLED` = **DO_NOT_ENABLE** on current evidence
   (no accuracy gain, small UX cost). The evidence-supported safety lever is instead the
   `ANTI_FABRICATION_GATE_ENABLED` (+ optional `SELF_CONSISTENCY_GATE_ENABLED`) — mode C drove
   false_negative_review to 0 in all cells — but enabling it is an owner decision and still wants more GT.
   See `SMART_NORMALIZE_DECISION.md`.
4. Later: PII history sweep before sharing the repo externally (surname/`FA000000`/DOB pervasive in main
   history — Session-54 debt; not a blocker for internal work).

**Agent can do autonomously (not owner-gated):** verify the `[document_class_metric]` line via Vercel
runtime logs once a real document is processed in prod (currently NOT_OBSERVED_YET — no extraction since deploy).

## 2026-06-03 — P2 ground-truth — SUPERSEDED (the "no images" claim below was FALSE; images exist)

**Verified 2026-06-03 (raw):** the OFF-vs-ON harness was requested but CANNOT run —
precondition not met:
- `test-fixtures/real-docs/ground-truth/*.json` → all `ground_truth_status="NEEDS_OWNER"`,
  `0` filled fields (birth_cert_handwritten 0/11, birth_cert_soviet 0/11, military_id_p1 0/7).
- No document images in `test-fixtures/real-docs/` (`NO_IMAGES_FOUND`) — `readDocument`
  has nothing to read.

**Two things are needed from the owner to unblock the accuracy measurement:**
1. The DOCUMENT IMAGES (birth cert soviet / handwritten, military id p1) placed in
   `test-fixtures/real-docs/` (gitignored) — needed to run `readDocument`.
2. The GROUND-TRUTH VALUES filled into the JSONs + `ground_truth_status=VERIFIED_BY_OWNER`.

Once both exist, the harness runs each doc through `readDocument` twice
(`SMART_NORMALIZE_ENABLED` unset vs `=1`) and reports the per-field delta. **Until
then, enabling `SMART_NORMALIZE_ENABLED` in prod stays FORBIDDEN** (Core is already
ON in prod — see `docs/reports/P2_DICTIONARY_IN_LIVE_PATH_CHECKPOINT.md`).

---

Blank, PII-free templates are versioned at **`docs/templates/ground-truth/`**:

- `birth_cert_soviet.template.json`
- `birth_cert_handwritten.template.json`
- `military_id_p1.template.json`

**Owner action:**
1. Copy each template to a local gitignored path
   (`test-fixtures/real-docs/ground-truth/` or `qa-private/ground-truth/`).
2. Fill the EXACT values from the physical documents.
3. Set `_meta.ground_truth_status` to `VERIFIED_BY_OWNER`.
4. **Do not commit** the filled files (they contain PII).

See `docs/templates/ground-truth/README.md` for the full procedure and how the
P2 OFF-vs-ON delta is measured afterward.

> The passport booklet ground-truth is already VERIFIED at
> `qa-private/ground-truth/internal_passport_<surname>.json` (gitignored).

## 2026-06-05 — PII DECISION: INTERNAL-ONLY FOREVER (CLOSED)

**Decision:** Repository is PRIVATE (verified `isPrivate: true`). It will NOT be shared externally.
PII in git history (surname, FA000000, DOB, 51 USCIS packets) = accepted risk for internal-only repo.
`docs/reports/evidence/` already gitignored — no new leaks forward.
Phase A/B from PII_HISTORY_REWRITE_RUNBOOK.md = NOT NEEDED unless repo goes external (re-open then).
**This topic is CLOSED. Do not re-raise.**

