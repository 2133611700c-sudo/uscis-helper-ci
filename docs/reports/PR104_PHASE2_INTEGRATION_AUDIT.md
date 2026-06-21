# PR #104 — Phase 2 Integration Audit (STOP-AND-AUDIT)

Date: 2026-06-09 | Auditor: agent (zero-trust integration audit, owner-ordered)
Scope: PR #104 + 4 unpushed local commits on `feat/one-brain-gemini-core`.
Constraint compliance: no new product code written, no Phase 3 started, no prod env changed, no flags enabled, no payment/Stripe touched, no qa-private commits, no PII below.

---

## RESULT: DEGRADED (code PASS, process SPLIT REQUIRED)

Code quality and safety contracts verify clean. The problem is PR shape: the pushed PR is only
Phase 1.3, while 4 local commits (Phase 2.0→2.6) are NOT pushed, and the last commit mixes
three unrelated risk classes. Merge recommendation: OPTION B (split).

---

## STEP 1 — BASELINE

| item | value |
|---|---|
| branch | `feat/one-brain-gemini-core` |
| local HEAD | `22dda1d` |
| origin/main | `03eb30f` |
| PR #104 head ON GITHUB | `6b8a441` (= Phase 1.3 wiring + docs, 19 files, 9 docs) |
| **unpushed local commits** | **4**: `c81af7d` (Phase 2.0 rawCyrillic), `f71f7d2` (2.1a unbypass), `e3c82d7` (2.1 Translation Core), `22dda1d` (2.2–2.6 gates+GPT) |
| full branch vs main | 34 files (23 code, 11 docs), +1078/−459 |
| PR checks (at 6b8a441) | Forbidden patterns + typecheck + build: SUCCESS; session-docs-guard: SUCCESS |

**Finding:** PR #104 as visible on GitHub is small and green. The "too large" risk lives in the
unpushed local commits. They are already cleanly phase-separated EXCEPT `22dda1d`, which mixes
TPS/Reparole/EAD gate removal + registry + GPT deletion + wizard cleanup in one commit.

## STEP 2 — rawCyrillic CONTRACT: PASS

| path | evidence | status |
|---|---|---|
| ExtractedDocField.raw_cyrillic set | `documentFieldReader.ts:83,98` | PASS |
| → FieldCandidate.rawCyrillic | `translationAdapter.ts:53` (docintelToCandidate) | PASS |
| → CanonicalField.rawCyrillic | `arbitration.ts:113,229,239`; `canonical/types.ts:90-94` | PASS |
| D2 input = rawCyrillic first | `arbitration.ts:161-164` (`f.rawCyrillic ?? f.normalizedValue`) | PASS |
| cyrillicMap demoted to fallback | `translationAdapter.ts:74` (`f.rawCyrillic ?? cyrillicMap?.get(...)`) | PASS |
| PII in logs | counts/codes only (`documentClassMetric.ts:59`, route logs) | CLEAN |

`raw_cyrillic_status: PASS`

## STEP 3 — D2 UNIFICATION: CLEAN (one authority layer, reconciled)

| layer | flag | stage | input |
|---|---|---|---|
| Door A `toCanonicalValue` (+gazetteer city/oblast) | always on | per-field read | Cyrillic |
| Door B patronymicReconcile/authorityResolve | `SMART_NORMALIZE_ENABLED` (OFF) | doc post-pass | raw_cyrillic |
| D2 authority `knowledgeNormalize` via `knowledgeBrain` | `KNOWLEDGE_BRAIN_ENABLED` (OFF) | arbitration | **rawCyrillic** (Phase 2.0) |

Door A/B are preprocessors; D2 is the single final authority and now operates at the right level
(original Cyrillic). No competing active dictionary paths. Two flags still exist (SMART vs
KNOWLEDGE) — consolidation to ONE flag remains open (GAP C, deferred by design, both default OFF).

`d2_unification_status: CLEAN` (flag consolidation = known deferred item, not fragmentation)

## STEP 4 — BUG FIXES: 4/4 PASS

| bug | status | evidence | tests | residual risk |
|---|---|---|---|---|
| A ISO dates | PASS | `knowledgeNormalize.ts:213-220` (`date.iso_to_uscis`, `date.already_uscis`) | phase20CyrillicD2Door 5 tests | low |
| B controlling Latin | PASS | `knowledgeNormalize.ts:55-70,154-155` — sourceBasis mrz/ead/i94=0.99 vs reader=0.6 | 5 tests | low |
| C dropped fields | PASS | `documentFieldReader.ts:72-92` — null canonical + cyrillic → review `canonical_value_unresolved` | implicit only | **MED — add direct unit test** |
| D RU/UA | PASS | `knowledgeNormalize.ts:76-92,160-161` — review+suggest, never silent rewrite; ukrainianDoc=false → as-written | 3 test files | low-med — Soviet bilingual not explicitly tested |

## STEP 5 — PRODUCT ROUTE MATRIX

| product | reader | Core default | fallback | rawCyrillic out | D2 | C3 | fail HTTP | timeout/maxDur |
|---|---|---|---|---|---|---|---|---|
| Translation | Gemini docintel | YES uncond. | legacy reader (0 fields/error) | **YES end-to-end** | YES | YES (flag OFF) | 200 | 20s / 60s |
| TPS | Gemini Core (UA) + rule modules (US) | YES for UA | rule modules + Brain | NO (TPS schema has no raw_cyrillic) | YES | YES (flag OFF) | 200 | 20s / 60s |
| ReParole | Gemini Core + MRZ | YES uncond. | none (422 unmapped; wizard routes US→TPS) | NO (answers schema) | YES | n/a | 200/500 | 20s / 30s |
| EAD | Gemini Core | YES uncond. | none (caller) | NO (answers schema) | YES | n/a | 200/500 | 20s / 30s |
| legacy /api/ocr/extract | DeepSeek text | n/a | manual_review | n/a | NO | YES label | 200 | n/a |

Wizards verified consistent with backend (Reparole `CORE_COVERED_SLOTS`; EAD upload step
unconditional). No stale flag checks.

Notes on subagent findings, adjudicated:
- "EAD missing flag conditional" — **rejected**: gate removal IS Phase 2.4's purpose (flags ON in
  prod); `_flag` keys are observability labels only.
- rawCyrillic absent from TPS/Reparole/EAD **answer schemas** — true and pre-existing by schema
  design; D2 still sees rawCyrillic inside arbitration for all 4 products. Carrying it into those
  response schemas is a Phase 3 (final_value) decision, not a regression.
- Translation route-local `postExtractNormalize` remains only in TPS legacy path (documented).

## STEP 6 — TRANSLATOR HARD-CASE UNBYPASS: PASS

Flag `NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED` default OFF = byte-identical (autoread=false →
no vision-extract call, manual path unchanged). ON: birth/marriage → vision-extract; 0 fields →
manual fallback (`hardCaseHasFields=false`); fields → `needsReviewGate=true`, payment blocked
until every review field confirmed (`TranslateWizard.tsx:1096,1107-1112`). `auto:false` on
DOC_TYPES unchanged. 14 pure-logic tests cover all branches. No payment leak path found. No PII.

`translation_unbypass_status: PASS`

## STEP 7 — GPT REMOVAL: PASS

Grep of `apps/web/src`: zero runtime hits for openai/gpt-4o/ENABLE_OPENAI_VISION/attemptOpenAIVision/
openaiReader (only a harmless mock string in consensus.test.ts). DeepSeek path intact
(`parseTextWithDeepSeek` + manual_review fallback). `models.ts` coherent after `openaiReader`
removal (no dangling refs). Nothing requires `OPENAI_API_KEY` at runtime. `/api/ocr/extract`
has zero frontend callers.

`gpt_removal_status: PASS`

## STEP 8 — MODEL CONFIG AUDIT (inspect-only; env NOT changed)

| env | prod | preview | local |
|---|---|---|---|
| GEMINI_MODEL | **`gemini-2.5-flash` + trailing newline (dirty)** | not set → default `gemini-3.1-pro-preview` | `gemini-3.1-pro-preview` |
| key resolved | GEMINI_API_KEY_PAY | GEMINI_API_KEY2 | GEMINI_API_KEY_PAY |
| key validity | 200 OK | 200 OK (**PAY and KEY2 are the SAME key** — sha match) | free bare key: 200 but 429 on pro models |
| GOOGLE_CLOUD_VISION_API_KEY | **DEAD: 403 billing disabled** (project 537268475735) | — | same dead key |
| GOOGLE_VISION_SERVICE_ACCOUNT_JSON | **WORKS** (live SA test read OK) | — | not set locally |
| DEEPSEEK_API_KEY | — | — | 200 OK (v4-flash/v4-pro listed) |
| gemini-3-pro-preview | **404 on paid key** — unusable, do not plan around it | | |
| 2.0-flash deprecated | removed from fallback chain (comments only) — confirmed | | |

**Key conflicts:**
1. **Prod runs `gemini-2.5-flash` while preview/local run `3.1-pro-preview`** — preview proof ≠
   prod behavior. Same-day live GT bench (sanitized, owner docs): on handwritten birth cert
   2.5-flash fabricated a DIFFERENT person's identity (wrong family/given/patronymic/DOB);
   3.1-pro-preview/3.5-flash read the right person but russified UA spelling (1/5);
   3.1-flash-image 2/5; internal passport: all models 4/5 (patronymic null→review as GT expects);
   military ID: pro and both flash 6/6, flash-image 4/6. No model is safe on handwritten
   birth certs → always-review policy stays mandatory regardless of model.
2. **Timeout conflict CONFIRMED:** routes pass `timeoutMs: 20_000` to readDocument while
   3.1-pro-preview was observed at 28s on the birth cert; provider default is 45s and the code
   comment itself says pro needs 20–40s. With pro as primary, slow reads abort at 20s and
   silently degrade to 3.5-flash. maxDuration: 60s (translation/TPS) is adequate; 30s
   (reparole/EAD) is tight for pro.

**Recommendation (OWNER decision, env NOT changed by agent):**
prod `GEMINI_MODEL` → `gemini-3.1-pro-preview` (clean value, no `\n`); raise route `timeoutMs`
20s→40s and reparole/EAD `maxDuration` 30→60 in the SAME change; fix or remove the dead Vision
API key (prod works via SA; the dead key only misleads local dev).

`model_config_status: DOCUMENTED_ONLY (prod=flash, preview/local=pro — MISMATCH)`
`timeout_status: CONFLICT (20s route cap vs pro 28s observed)`

## STEP 9 — TESTS

- `tsc --noEmit`: **0 errors**
- Full suite: **Test Files 146 passed | 2 skipped; Tests 2974 passed | 4 skipped | 0 failed**
- Covered targeted areas: phase20CyrillicD2Door (24), hardCaseAutoread (14), knowledgeBrain/
  knowledgeNormalize (30), canonical suite, route wiring suites (all included in full run).

## STEP 10 — REAL FIXTURE PROOF (sanitized; no field values)

Same-session live reads of owner originals vs owner-verified GT (model-level; pipeline-level
threading proven by phase20CyrillicD2Door tests + PHASE_2_0_CYRILLIC_D2_DOOR_PROOF.md):

| doc_class | best model result | prod-model (2.5-flash) result | review_required honored | unsafe_final |
|---|---|---|---|---|
| internal_passport (handwritten) | 4/5 (patronymic→null→review) | 4/5 | yes | none |
| birth_cert_handwritten | 2/5 (flash-image), others 1/5 | **1/5 + fabricated different identity** | yes (hard-case always-review) | none reach final without review |
| military_id_p1 | 6/6 (pro, 3.5-flash, 2.5-flash) | 6/6 | yes | none |

`real_fixture_proof: DONE (sanitized)` | `pii_in_logs: NONE`

## STEP 11 — DECISION: OPTION B — SPLIT REQUIRED

PR #104 as pushed (Phase 1.3 only) is MERGEABLE on its own (checks green, flag OFF=identical).
The 4 local commits must NOT be force-folded into it. Recommended push/PR order:

1. **PR-A (= current #104):** Phase 1.3 knowledge helper wiring — merge as-is.
2. **PR-B:** `c81af7d` Phase 2.0 rawCyrillic + D2 + 4 bug fixes (self-contained, 24 tests).
3. **PR-C:** `e3c82d7` Phase 2.1 Translation Core unconditional (prod-flag-equivalent cleanup).
4. **PR-D:** `f71f7d2` Phase 2.1a Translator hard-case unbypass (new flag, default OFF).
5. **PR-E:** `22dda1d` — **recommend splitting this commit** into (i) TPS/Reparole/EAD gate
   removal + registry + wizard cleanup, and (ii) GPT removal. If owner accepts one PR, label it
   clearly "flag-gate cleanup + GPT removal; prod flags already ON ⇒ behavior unchanged".
6. **PR-F (new, small):** model timeout fix (20s→40s, maxDuration 30→60) — pairs with the
   owner's prod GEMINI_MODEL flip; do NOT flip env before this lands.

OFF-identical proof basis: removed gates were `'1'`/`'true'` checks that prod env already
satisfied (owner-verified ON, P2 checkpoint 06-03) ⇒ removal is identity under current prod env.
All NEW behavior (KNOWLEDGE_BRAIN / SMART / OCR_FIELD_SAFETY / HARD_CASE_AUTOREAD) defaults OFF
with OFF=identical tests.

## RETURN BLOCK

```
RESULT: DEGRADED (code PASS / PR shape SPLIT REQUIRED)
task_type: pr104_phase2_integration_audit
branch: feat/one-brain-gemini-core
commit: 22dda1d (local) / 6b8a441 (PR head on GitHub)
pr: #104 OPEN, checks SUCCESS at 6b8a441
prod_touched: NO
env_changed: NO
tests_run: tsc + full vitest suite
tests_passed: 2974/2978 (4 skipped, 0 failed); tsc 0
raw_cyrillic_status: PASS
d2_unification_status: CLEAN (SMART/KNOWLEDGE flag merge deferred, both OFF)
translation_unbypass_status: PASS
product_route_matrix: see STEP 5 (all 4 products Core-default; fallbacks documented)
gpt_removal_status: PASS
model_config_status: MISMATCH documented (prod 2.5-flash+\n, preview/local 3.1-pro-preview)
timeout_status: CONFLICT (route 20s vs pro 28s observed) — fix queued as PR-F
off_identical_proof: prod flags were ON ⇒ gate removal = identity; new flags OFF+tested
on_preview_proof: preview runs pro by default (NOT representative of prod flash)
real_fixture_proof: 3 owner docs, sanitized, STEP 10
pii_in_logs: NONE
merge_recommendation: OPTION B — merge #104 as-is, then PR-B..PR-F in order above
split_recommendation: split 22dda1d into gate-cleanup vs GPT-removal (or label clearly)
next_3_actions:
  1. Owner: merge PR #104 (Phase 1.3) — green, self-contained.
  2. Agent (after owner ok): push Phase 2.0 as PR-B; do NOT push 22dda1d unsplit.
  3. Owner+agent: PR-F timeout fix, THEN owner flips prod GEMINI_MODEL → 3.1-pro-preview (clean value).
confirmed_no_prod_env_change: YES
confirmed_no_model_provider_change: YES
confirmed_no_phase3_started: YES
```

---

## EXECUTION OUTCOME (2026-06-10, owner "делай")

Split plan executed in full, sequential merge with green checks at every step:

| PR | content | state |
|---|---|---|
| #104 | Phase 1.1–1.3 knowledge authority + helper wiring | MERGED (squash 4dca71b) |
| #105 (PR-B) | Phase 2.0 rawCyrillic + D2 + 4 bug fixes | MERGED |
| #106 (PR-D) | Phase 2.1a Translator hard-case unbypass (flag OFF) | MERGED |
| #107 (PR-C) | Phase 2.1 Translation Core unconditional | MERGED |
| #108 (PR-E) | Phases 2.2–2.6 gates removal + GPT drop (two-part label) | MERGED |
| #109 (PR-F) | timeoutMs 20s→40s ×4; reparole/EAD maxDuration 30→60 | MERGED |

Prod env untouched by agent. OWNER ACTION now unblocked: flip prod GEMINI_MODEL →
gemini-3.1-pro-preview (clean value, no trailing newline).
