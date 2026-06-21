# DOCUMENT_RULE_COVERAGE_AUDIT

**Date:** 2026-05-27
**Mode:** READ-ONLY structural audit. No runtime code modified, no commit, no deploy.
**Auditor stance:** Independent engineer. I did not trust the pasted analysis, the existing code comments, or my own sub-agents — every claim below is verified against `file:line`. Where a sub-agent's conclusion contradicted the evidence, I say so explicitly.
**Verdict:** `DEGRADED` — not `FAIL`. The system has more architecture than the team thinks, but it is **fragmented into parallel rule-sources that disagree with each other**, plus one genuinely missing capability (page-type detection). That combination produces the "расфокус" you feel.

---

## 0. The one-sentence diagnosis

> **Your problem is not "no rules." It is the opposite: there are too many places that each define part of the rules, and they have drifted out of agreement. The cure is consolidation to single sources of truth + a coverage auditor, NOT building five new registries from scratch — which would add a sixth disagreeing source.**

The pasted analysis is directionally useful but its central premise ("нет правил", "система работает на глаз") is **factually wrong** for this codebase. I'll show exactly where it's right and where it's wrong, because acting on the wrong parts would burn week 5 the same way week 4 burned.

---

## 1. What actually exists (verified architecture map)

This is NOT a system without rules. Verified inventory of the rule/authority layer under `apps/web/src/lib/tps/`:

| Concern | File | Status (verified) |
|---|---|---|
| Per-slot field firewall (allowed/forbidden) | `ocr/documentContracts.ts` (523 lines, 10 slots) | **EXISTS** — `DOCUMENT_CONTRACTS` record, `applyContract()` at L469 |
| Cross-document source priority | `fieldArbiter.ts` (373 lines) | **EXISTS** — `FIELD_CLASS` L16-43, `IDENTITY_PRIORITY`/`DOCUMENT_PRIORITY` L117-156, `resolveField()` L180-297 |
| Slot→source adapter + controlling Latin | `sourcePriority.ts` (87 lines) | **EXISTS** — `hasControllingLatinSpelling()` L73-87 |
| Merge orchestration | `centralBrain.ts` (257 lines) | **EXISTS** — `mergeToCentralBrain()` L102, 4-step pipeline |
| Hallucination/garbage guard | `hallucinationGuard.ts` (227 lines) | **EXISTS** — `guardField`, `crossValidateField` |
| Normalization bridge | `dictionaryBridge.ts` (156 lines) | **EXISTS** |
| Provenance sidecar | `provenance.ts` (424 lines) | **EXISTS** — `FieldProvenance`, `SourceDocumentType` |
| Output field maps | `forms/i821FieldMap.ts`, `forms/i765FieldMap.ts` | **EXISTS** — 145 + 53 PDF ops |
| Pre-generation gates | `mailReadyGate.ts`, `formIntegrity.ts`, `reviewParity.ts` | **EXISTS** |
| Contract-violation taxonomy | `documentContracts.ts:412` | **EXISTS** — `ContractViolationCode` (4 codes) |
| Rejection-with-reason object | `centralBrain.ts:63` | **EXISTS** — `RejectedField {field, slot, raw_value, reason}` + `ReadinessGate.contract_violations[]` |
| Drift CI gate | `scripts/check-booklet-contract-drift.mjs` | **EXISTS** — 3 sync points, wired in `guards.yml:182` |
| 7 document modules | `modules/{passport,passportBooklet,i94,i797,ead,dl,visionBridge}.ts` | **EXISTS** |

**Conclusion:** The pasted analysis's proposals "create `documentRegistry`, `fieldRegistry`, `FieldAuthorityMatrix`, failure taxonomy, rejection-as-object" are **70% already built**. Building them again from scratch = a parallel system = MORE drift. That is the single most important thing to not do.

---

## 2. What the pasted analysis got RIGHT (act on these)

| Claim | Verdict | Evidence |
|---|---|---|
| **No page-type detection** | ✅ **CORRECT — this is the #1 real gap** | All 7 modules scan ALL OCR lines regardless of which page was uploaded. `passportBooklet.ts` has no identity-page vs issue-page vs registration-page logic; it scans `for (const lc of lines)` globally (L512, L522, L763). Same in `passport.ts` (L116), `i94.ts` (L125), `i797.ts` (L30), `ead.ts` (L39), `dl.ts` (L94). |
| **Need a rule-coverage auditor in CI** | ✅ **CORRECT** | No automated check that every (document × field) has contract+extraction+normalization+authority+output+test. The booklet-drift script checks ONE slot's 3 sync points, nothing else. |
| **Failure reasons should be first-class + surfaced** | ⚠️ **HALF-CORRECT** | The OBJECTS exist server-side (`RejectedField.reason`, `ReadinessGate`). The gap is they are **not unified** (mix of typed codes and free-form strings) and **not surfaced to the user** as "field X blank because Y, do Z." |
| **Field authority should be explicit, not guessed** | ⚠️ **HALF-CORRECT** | It IS explicit (`IDENTITY_PRIORITY`/`DOCUMENT_PRIORITY`). The gap is it's split across 3 files, not one declarative matrix. |

## 3. What the pasted analysis got WRONG (do NOT act on these as written)

| Claim | Verdict | Reality |
|---|---|---|
| "нет правил / работает на глаз" | ❌ **FALSE** | See §1. There is a 4-layer rule pipeline. |
| "Central Brain не имеет жёсткой карты документа" → build `documentRegistry.ts` + `fieldRegistry.ts` from scratch | ❌ **WRONG REMEDY** | `documentContracts.ts` + `fieldArbiter.ts` ARE the registries. Add page-types to the EXISTING contract; do not fork a parallel registry. |
| "сделать агента-юриста (Legal Rules Agent) который работает с правилами" as a **runtime AI agent** | ❌ **DANGEROUS** | Adding another LLM into an unstable pipeline increases nondeterminism. The auditor must be a **deterministic CI script**, not an AI agent. The instability is caused by too many moving parts, not too few brains. |
| Sub-agent #2's own conclusion: "field authority is NOT duplicated, cleanly separated" | ❌ **FALSE (my own agent was wrong)** | It never read the client. There ARE residual client-side duplicates (§4.C) and — worse — three disagreeing "required" lists (§4.A). I flag this to prove the "не верь никому" rule earned its keep. |

---

## 4. The REAL root causes (verified, ranked by impact)

### 4.A — KILLER: three contradictory definitions of "required to generate"
Three files each define what blocks packet generation, and **they disagree**:

| Field | `centralBrain.REQUIRED_FOR_GENERATE` (L86) | `mailReadyGate.REQUIRED_FIELDS` (L34) | `answers.isMinimallyComplete` |
|---|---|---|---|
| `status_at_last_entry` | **REQUIRED** | — | — |
| `country_of_birth` | — | **REQUIRED** | — |
| `us_address_*`, `daytime_phone`, `email` | — | **REQUIRED** | — |
| `filing_path` | — | **REQUIRED** | — |
| `marital_status` | — | **REQUIRED** | **REQUIRED** |
| `part7_reviewed` | — | — | **REQUIRED** |
| `passport_expiration_date` | **REQUIRED** | **REQUIRED** | — |

**Effect:** which fields block the user depends on which gate fires in which path. This is precisely the "кнопка то появляется, то нет, причина непонятна" symptom. There must be exactly ONE required-field definition, consumed everywhere.

### 4.B — KILLER: no page-type model → cross-page contamination
The Ukrainian booklet is multi-page (identity / issuing-authority / registration). The module collects fields from whatever OCR text exists, with no page boundary. Real consequences already seen in your data:
- A registration-page address can leak into birthplace fields.
- "Prostianets" (today's bug) — the module scanned and the crossref confirmed a misread because nothing constrained WHERE birthplace may come from.
- The "non-identity page warning" (`tps-booklet-no-identity-warning`) is a band-aid for the absence of a page model.

This is the gap that makes booklet extraction feel random across uploads.

### 4.C — residual hand-maintained drift surface (partially fixed, not fully)
Good news first: `SLOT_ALLOWED_FIELDS` and `BOOKLET_WAVE1_FIELDS` are now **derived** from `DOCUMENT_CONTRACTS` (`TPSWizardV2.tsx:1100-1110`) — the worst Session-17 drift is gone. **But** three extraction-source unions are still hand-maintained in parallel and only kept in sync by a CI script:
- `TpsExtractionSource` (`types.ts`)
- `ExtractionSource` (`TPSWizardV2.tsx`)
- `SourceType` (`fieldArbiter.ts`)

A new source value must be added to all three or the drift gate fails the build. This is a maintained smell, not a crash — but it's a smell that signals the pattern.

### 4.D — dual/triple merge paths
Merge logic exists in at least two places that must agree: server `centralBrain.mergeToCentralBrain()` AND inline merging in the OCR route (`applyContract` at `route.ts:804`), plus a client `mergedFields` fallback with a "DEGRADED" banner (per STATUS.md Session 32). Two implementations of "merge" = two behaviors to keep identical forever. They will drift.

### 4.E — symptom-patching culture (the meta-cause)
**26 of the last 40 commits are `fix:` commits (65%).** Recent fixes I can see are all *local special-cases*: DOB fallback scan, rotation-line-count guards, a hardcoded "Prostianets→Trostianets" string, a patronymic min-length guard. Each is locally correct and globally entropic. Without a coverage model, every patch is a new branch in an untracked decision tree. **This is why "we fix one document and another breaks."**

### 4.F — test/coverage islands (verified)
- `ead.ts` — **NO test file** (and EAD drives I-765 — high risk).
- `visionBridge.ts` — **NO test file**.
- `passportBooklet.ts` — only a DOB test, no full-module test (and it's your most-complained-about module, 37KB).
- `i821FieldMap.ts`, `i765FieldMap.ts`, `pdfPrefiller.ts`, `dictionaryBridge.ts` — **NO test files** (the entire OCR→PDF output mapping is untested at unit level).
- **No PDF readback inside the prefiller** — `pdfPrefiller.ts` writes and trusts pdf-lib; only one e2e spec unzips+greps the PDF. A silent field-write failure would not be caught for most fields.

### 4.G — the honest OCR ceiling (must be said)
Handwritten Cyrillic in the booklet has a **hard accuracy ceiling**. No architecture makes Google Vision read a handwritten "Тростянець" or "Тарасович" perfectly every time. Every booklet field is already `review_required=true` (`passportBooklet.ts:551`) for this reason. **The achievable goal is not "everything auto-extracts perfectly." It is "auto-extract what is reliably readable; for the rest, fail honestly with a specific reason and a targeted prompt."** Chasing 100% auto-extraction of handwriting is what keeps the goal permanently one fix away.

---

## 5. Document coverage table (verified)

| Module | Slot | Page detection | Match threshold | Fields | Test file | Inferred/hardcoded |
|---|---|---|---|---|---|---|
| passport.ts | passport | ❌ none | MRZ located | 8 | ✅ passport.test.ts | UKR→Ukraine norm only |
| passportBooklet.ts | passport/booklet | ❌ none | ≥1 field + signal | 13 | ⚠️ DOB-only | 3× "Ukraine" inferred (L913-936) |
| i94.ts | i94 | ❌ none | ≥2 fields | 9 | ✅ i94.test.ts | none |
| i797.ts | i797 | ❌ none | receipt OR markers+2 | 9 | ✅ i797.test.ts | none |
| ead.ts | ead | ❌ none | ≥2 fields | 5 | ❌ **MISSING** | none |
| dl.ts | dl | ❌ none | ≥3 fields | 13 | ✅ dl.test.ts | none |
| visionBridge.ts | (normalizer) | n/a | n/a | 12 mapped | ❌ **MISSING** | none |

---

## 6. Field authority — it exists, but is split across 3 tables

For any field, "who wins" is computed by combining THREE tables queried together (no single matrix):
1. `documentContracts.allowed_fields[slot]` — may this field appear from this slot at all?
2. `fieldArbiter.FIELD_CLASS` + `IDENTITY_PRIORITY`/`DOCUMENT_PRIORITY` — which source wins when several have it?
3. `sourcePriority.hasControllingLatinSpelling` — does a US-doc Latin spelling override Cyrillic transliteration?

Verified gaps in the authority tables:
- `passport_country_of_issuance` is classed `STRONG_DOCUMENT` (`fieldArbiter.ts:38`) but has **no entry in `DOCUMENT_PRIORITY`** — undefined precedence.
- ~25 form fields (mailing address, phone, email, biographics, all 30 Part-7 questions) have **no arbiter entry at all** — intentionally user-entered, but undocumented as such, so an audit can't distinguish "intentionally manual" from "forgotten."

**Remedy:** do not invent a new matrix file. Generate ONE declarative `FIELD_AUTHORITY` object and **derive** `FIELD_CLASS`, the priority tables, and the per-slot allowed-lists FROM it (or assert equality in CI). One source, many consumers.

---

## 7. Failure taxonomy — partial, internal, not surfaced

- Typed: `ContractViolationCode` (4 codes) — `documentContracts.ts:412`.
- Object-level: `RejectedField.reason`, `ReadinessGate.{missing_required, hallucination_blocks, contract_violations}` — `centralBrain.ts:63-91`.
- **Missing:** unified enum spanning validation failures, normalization failures, low-confidence, OCR-empty, page-mismatch, no-source. These are free-form strings today.
- **Missing:** any of this reaching the USER as "field X is blank because no I-94 was uploaded; upload it or type the date." `ocrAudit.ts` logs `rejected_fields[]` but **not the reason per field**.

---

## 8. What to build — prioritized, realistic (my plan, not the pasted one)

**P0 — FREEZE feature work (agree with pasted analysis).** No TASK-04/05/06, no new doc types, no new forms until §P1-P3 land. Allowed: consolidation, auditor, tests, diagnostics.

**P1 — Collapse the 3 required-field lists into ONE (highest ROI, ~1 day).**
Single `REQUIRED_FIELDS` (with conditionals: ead_category if wants_ead, etc.) in one module. `centralBrain`, `mailReadyGate`, `isMinimallyComplete` all import it. Add a CI assertion that no other "required" literal exists. This alone kills the "button appears/disappears" class of bugs (§4.A).

**P2 — Add page-type to the EXISTING contract, not a new registry (~2-3 days).**
Extend `DocumentSlotContract` with `pages: { page_type, required_markers[], allowed_fields[], forbidden_fields[] }`. Add a `detectPage()` step in the booklet module that classifies identity/issue/registration by markers, then restricts extraction to that page's allowed_fields. Emit `PAGE_TYPE_UNKNOWN` / `WRONG_PAGE_FOR_FIELD` reasons. This directly fixes booklet randomness (§4.B).

**P3 — One declarative `FIELD_AUTHORITY`, derive the rest (~2 days).**
Move `FIELD_CLASS` + priority tables + allowed-lists to be derived from one object, OR add a CI equality assertion across them. Fill the `passport_country_of_issuance` gap and tag the ~25 user-only fields explicitly.

**P4 — `LegalRuleAuditor` as a deterministic CI script (`scripts/rule-audit.mjs`) (~2-3 days).**
Fails the build if any (supported document × field-it-can-emit) lacks: contract entry, extraction site, normalization rule, authority entry, output mapping, and at least one test. Emits the per-field coverage matrix to `docs/reports/`. This is the genuinely-missing piece and the thing that stops week-6 regressions.

**P5 — Unify + surface the failure taxonomy (~2 days).**
One `TpsFailureCode` enum; every rejection/missing/blocked path uses it; `ocrAudit` logs per-field reason; the wizard renders a diagnostic panel ("we couldn't read X from doc Y → upload Z or type it").

**P6 — Close test islands (~2 days).** `ead.test.ts`, full `passportBooklet` module test, `i821/i765FieldMap` tests, `pdfPrefiller` readback test.

**P7 — Only then resume OCR-quality work** — now every fix is governed by P4's auditor, so it can't silently break another document.

**Explicitly deferred / rejected:** parallel `documentRegistry.ts` + `fieldRegistry.ts` (would fork existing contracts); a runtime "Legal AI agent" (adds nondeterminism). Consolidate what exists; don't fork it.

---

## 9. Failure taxonomy (proposed single enum — for P5)

```
DOC_NOT_SUPPORTED · PAGE_TYPE_UNKNOWN · WRONG_PAGE_FOR_FIELD ·
FIELD_NOT_FOUND · FIELD_LOW_CONFIDENCE · FIELD_FORBIDDEN_FOR_FORM ·
FIELD_ALLOWED_FOR_TRANSLATION_ONLY · NORMALIZATION_FAILED ·
NO_AUTHORITATIVE_SOURCE · PROVENANCE_MISSING · REVIEW_REQUIRED ·
PDF_MAPPING_MISSING · READBACK_MISMATCH
```
(Subsumes existing `ContractViolationCode`; do not create a second one.)

---

## 10. Honest scorecard (mine, not the pasted analysis's)

| Dimension | Score | Note |
|---|---|---|
| Rule layer EXISTS | 8/10 | Far more than "no rules" |
| Rule layer CONSISTENT | **3/10** | 3 required-lists disagree; dual merge paths; 3 unions |
| Page-level document model | **1/10** | Does not exist |
| OCR quality (handwriting) | 4/10 | Hard ceiling; honest-failure path immature |
| Failure diagnosis surfaced to user | 3/10 | Objects exist server-side, not shown |
| Coverage enforcement (CI) | 3/10 | One slot gated; no field×doc matrix |
| Test coverage of output path | 3/10 | Field maps + prefiller + EAD untested |
| Regression resistance | **2/10** | 65% of recent commits are fixes |

**Overall: DEGRADED.** The foundation is real. The instability is fragmentation + missing page model + no coverage gate + a patch-culture — not absence of rules.

---

## 11. What is blocking you, in one paragraph

You are not missing a brain or rules. You are missing **a single source of truth per concern** (one required-list, one authority object, one merge path), **a page-level document model** (so the booklet stops mixing pages), and **a deterministic coverage auditor in CI** (so a fix to one document provably can't blank another). Until those three exist, every OCR fix is a coin flip on whether something else regresses — which is exactly what weeks 2, 3, and 4 demonstrated. Build those three, freeze features while you do, and week 5 stops feeling like week 4.

---
*Read-only audit. No runtime code changed. Evidence cited at file:line throughout. Sub-agent conclusions were re-verified against source; one was found wrong (§3) and corrected.*
