# FULL PROJECT REALITY AUDIT — 2026-06-14

**Mode:** READ-ONLY, distrust-everything. Every claim re-verified against the PRIMARY SOURCE
(real code on main, live Supabase via MCP, real GitHub PRs/Actions, real Vercel env, real prod routes,
locally re-run tests). No runtime/env/flag/migration change. No merges. No Stripe. PR #119 audited only, untouched.

**Coordinator role:** synthesis of 4 parallel audit agents. This document cites their per-area files;
it does not restate them in full. Contradictions are LISTED, not hidden.

---

## 1. GROUND TRUTH (independently re-verified)

| Fact | Value | How verified |
|---|---|---|
| main SHA | `02eb59593c1a7f69d6d6c245825827e101d37e0f` | `git ls-remote origin refs/heads/main` |
| production SHA | `02eb595` | `GET https://messenginfo.com/api/healthz` → `{"sha":"02eb595","environment":"production"}` (2026-06-14T20:59Z) |
| main == production | **TRUE** | sha match |
| canonical mode in prod | **shadow** (0 `CANONICAL_MODE_*` enforce; `continuityMode.ts` clamps legacy global to shadow) | code + DB (`canonical_documents`=24, `canonical_overrides`=0) |
| server PII ledger flag (prod) | **OFF** | `GET /api/wizard-draft` → **404**; `wizard_drafts`=0 rows |
| Supabase projects | exactly **ONE** (`rtfxrlountkoegsseukx`) shared by prod+preview+dev | `list_projects`, `vercel env ls` |
| PR #119 (Translation V2) | OPEN, draft, frozen, 6 ahead / 13 behind main | GitHub + `git diff` |

Single source files: `artifacts/audit/project_truth.json` (Etap-1 baseline) + the 18 agent deliverables below.

---

## 2. WHAT IS ACTUALLY PROVEN vs CLAIMED

### PROVEN_PRODUCTION (real prod traffic / real DB rows / live route behavior)
- **TPS upload→OCR→extract** — 668 `tps_ocr_audit` rows; live `readDocument` pipeline. (`USER_FLOW_MATRIX.md` §1)
- **TPS payment gate** — server-verified `x-payment-token` vs Stripe (generate route:109-119). (`USER_FLOW_MATRIX.md` §1)
- **Translation legacy operator flow** up to manual-review queue — `translation_sessions`=32, `extracted_fields`=138, `manual_review_queue`=5, `translation_orders`=2, `translation_payments`=1. (`TRANSLATION_V2_AUDIT.md`)
- **PR #122 operator auth + Stripe-reverified recipient** — auth-first, fail-closed, recipient re-resolved from Stripe (client-writable email ignored), masked/never-logged. (`SECURITY_PII_AUDIT.md` §2)
- **DeepSeek Document Brain anti-fabrication** — `hardenFinalValues()` overwrites every model `final_value` with deterministic KMU-55/WinAnsi transliteration; model value never trusted; 668 audit rows. (`BRAIN_DICTIONARY_AUDIT.md` B1)
- **Knowledge dictionaries** — `@messenginfo/knowledge` imported by 30+ runtime files; all HARD RULES present in code (Patronymic≠Middle Name, Міліція→Militsiya, смт→urban-type settlement, oblast genitive→nominative, MRZ-controlling). (`BRAIN_DICTIONARY_AUDIT.md` PART A)

### PROVEN_LOCAL (real code + green local tests, SYNTHETIC inputs, no prod/staging proof)
- **USCIS PDF field mapping** (I-821/I-131/I-765) — real edition-locked templates rendered through prod `buildPacket`, read back with pdf-lib incl. placement + anti-stale assertions; 46 tests re-run green. **Provenance = PR #116, NOT #128.** (`USCIS_PDF_AUDIT.md`)
- **Server PII ledger crypto/store/route** — AES-256-GCM, fail-closed, httpOnly token; 63 tests re-run green. (`SECURITY_PII_AUDIT.md` §1)
- **Canonical continuity machinery** — persistence, fields_hash v2, immutability triggers, override RPC, optimistic concurrency, C3 release. Runs in **shadow** only. (`CANONICAL_CORE_AUDIT.md`)

### CODE_ONLY / NOT_WIRED (built, tests green, NOT connected to a live caller)
- **OCR cache + provider budget** (PR #127) — zero non-test importers; prod OCR has no cache, no budget cap, no kill switch. (`OCR_CACHE_RUNTIME_AUDIT.md`)
- **Server PII ledger product wiring** (#131/#133) — wired into orphaned `GeneratePacketBlock.tsx` (0 importers); live `TPSWizardV2.tsx` is not ledger-aware; reparole/ead/translation zero wiring. (`SECURITY_PII_AUDIT.md` §1)
- **Canonical override route** `/api/canonical/[id]/override` — zero UI callers, 0 prod rows. (`CANONICAL_CORE_AUDIT.md` Q4)
- **Translation V2 orders/outbox stack** (PR #119) — 51 new files, 0 real orders. (`TRANSLATION_V2_AUDIT.md`)

### DEAD_CODE
- `lib/canonical/core/readDocumentCore.ts`, `lib/central-brain/`, `lib/docintel/oneBrain/decideField.ts` — zero non-test/non-self importers. The live brain is `lib/docintel/documentFieldReader.ts`. (`CANONICAL_CORE_AUDIT.md` Q1)

### BROKEN
- **Re-Parole packet generation has NO server-side payment gate** — paid $15 product; `paid` set client-side via `?paid=1`; `/api/reparole/generate-packet` has zero Stripe/auth check. (`USER_FLOW_MATRIX.md` §2) — **P1.**

### UNVERIFIED
- All headline V1 PR claims (#126 PASS, #127 cache live, #128 "0 fabricated"/"3/3 readback", #130/#132 "proven E2E", #133 "TPS wired", #124 staging) — see `CLAIMS_VS_REALITY.csv` + `EVIDENCE_VALIDITY_AUDIT.md`.
- Backups/PITR/DR, branch protection, Stripe test-vs-live key — see `INFRA_OPERATIONS_AUDIT.md`.

---

## 3. PARALLEL V1 TRACK RECONCILIATION (#121–#133)

Between the last documented sha and `02eb595` a parallel "V1" track was merged by other sessions.
Re-verified result: **substantial real engineering, but every headline "PASS/E2E/done" overclaims.**
The recurring root cause is one pattern:

> **"module + its own mocked/unit test go green" was mistaken for "the product uses it."**
> Integration into the live runtime (env provisioning, staging, real-doc corpus, enforce-mode, browser smoke)
> was deferred to phases that depend on infrastructure that **does not exist** (dedicated staging Supabase/Stripe-test).
> The CI workflows are honest (they dry-run and `exit 0`); the PR *titles* collapse "library proven" into "proven E2E / PASS / 0 fabricated".

Per-claim reconciliation: `CLAIMS_VS_REALITY.csv`. Key reconciliations:
- **#120 (localStorage PII minimization) is the ONLY live PII control.** It MINIMIZES (drops evidence/raw/confidence, TTL, clear-on-completion) but its own comment states `value` + `raw_cyrillic` REMAIN in browser. The #129–#133 server ledger (the "full removal" Phase B) is built but inert (flag OFF, 0 rows, wired to an orphan component). **They coexist; #120 is the truth, the ledger does not replace it.** (`SECURITY_PII_AUDIT.md` §1.4)
- **#128 "3/3 PDF readback PASS"** merge changed only 4 docs + 1 JSON literal — a hand-authored `"PASS"` string, no test/fixture/PDF added. The real proof is the #116 tests (genuinely green). The #128 *claim* is a doc artifact masquerading as a gate result. (`USCIS_PDF_AUDIT.md`)
- **#126 "phases 1-3 PASS"** merge changed docs only — no code; "PASS" = doc-state flip. (`SECURITY_PII_AUDIT.md` §5)

---

## 4. BIGGEST TRUTHS

1. **The product that actually works for paying users is the LEGACY manual flow:** TPS read path (server-gated payment) and Translation up to a human-operator queue who emails the PDF. Everything labeled "V1 / V2 / canonical-authoritative / ledger / cache" is shadow, code-only, not-wired, or a frozen draft.
2. **The live document brain is `lib/docintel/`** — NOT the `lib/canonical/core/` "one brain" that ADR-017 implied. The canonical core survives only as per-product adapters + shadow persistence; its arbitration engine and `readDocumentCore` are dead code. (`CANONICAL_CORE_AUDIT.md` Q1)
3. **Read ACCURACY is unmeasured.** Every "0 fabricated"/coverage claim rests on synthetic fixtures that carry their own answers, or a local-dev run on absent private files where critical fields are `EMPTY` (absence counted as "not fabricated"). No reviewed real-doc ground truth exists in repo/CI. (`DOCUMENT_COVERAGE_REALITY.md`)
4. **No environment isolation.** Preview/Dev deploys read AND write the production Supabase with the production service-role key. (`INFRA_OPERATIONS_AUDIT.md`)
5. **Raw applicant PII sits in cleartext in prod DB** — `tps_ocr_audit.brain_raw` stores `source_value`/`final_value`/`input_raw` per field for 575 of 668 rows, no TTL, no redaction. (Agent 2 P0-1; `DATABASE_INVENTORY.csv`, `INFRA_OPERATIONS_AUDIT.md` Retention)

---

## 5. CONTRADICTIONS (listed, not resolved here)

| # | Contradiction | Side A | Side B | This audit's reading |
|---|---|---|---|---|
| C1 | "main == prod sha" | STATUS.md/RELEASE_STATE say `62c897a`/`62c897a` | live healthz = `02eb595` | **Live wins: `02eb595`.** STATUS is stale by ≥5 PRs. (`SECURITY_PII_AUDIT.md` §4) |
| C2 | "TPS wizard WIRED to ledger / READY" (STATUS, #133) | doc claim | live `TPSWizardV2` not ledger-aware; wired component orphaned; flag OFF | **NOT_WIRED.** |
| C3 | "0 fabricated benchmark PASS" | STATUS/CHANGELOG/#128 | benchmark.json: local-dev, 3-doc subset, critical fields EMPTY; CI dry-runs | **PROVEN_LOCAL (narrow) / UNVERIFIED.** |
| C4 | "3/3 PDF readback PASS (#128)" | #128 JSON literal | #128 added no test; real proof is #116 | **PROVEN_LOCAL via #116; #128 claim unbacked.** |
| C5 | "server ledger proven E2E (#132)" | PR title | route tested in isolation; prod 404; 0 rows | **PROVEN_MOCKED (route only), not product-E2E.** |
| C6 | "OCR cache + budget live (#127)" | PR title | zero importers; prod OCR uncapped | **NOT_WIRED.** |
| C7 | "PII removed from browser (#120)" vs ledger | #120 framing | #120 keeps value+raw_cyrillic in localStorage; ledger inert | **PII still in browser, minimized.** |
| C8 | "ONE Document Core / one brain" (ADR-017) | architecture intent | two cores; canonical core's reader is dead | **Two cores; docintel is live, canonical-core reader dead.** |
| C9 | prod DB schema vs main | 4 V2 migrations applied to prod | their `.sql` exist only in frozen #119, not main | **Prod schema ahead of main (drift, P1).** (`TRANSLATION_V2_AUDIT.md`) |
| C10 | "dedicated staging ready (#124)" | control-plane doc | one Supabase project; `V1_STAGING_READY` not true | **NOT_BUILT.** |

---

## 6. DELIVERABLES INDEX (23 files)

Agent deliverables (18): `USER_FLOW_MATRIX.md`, `CANONICAL_CORE_AUDIT.md`, `TRANSLATION_V2_AUDIT.md`, `REPOSITORY_INVENTORY.csv`,
`ENV_FEATURE_FLAG_INVENTORY.csv`, `DATABASE_INVENTORY.csv`, `PROVIDER_COST_INVENTORY.csv`, `OCR_CACHE_RUNTIME_AUDIT.md`,
`TEST_CI_INVENTORY.csv`, `EVIDENCE_VALIDITY_AUDIT.md`, `INFRA_OPERATIONS_AUDIT.md`, `CORPUS_INVENTORY.csv`,
`DOCUMENT_COVERAGE_REALITY.md`, `BRAIN_DICTIONARY_AUDIT.md`, `USCIS_PDF_AUDIT.md`, `USCIS_FIELD_MATRIX.csv`,
`SECURITY_PII_AUDIT.md`, `PII_DATA_MAP.csv`.
Synthesis (4): `FULL_PROJECT_AUDIT_2026-06-14.md` (this), `CLAIMS_VS_REALITY.csv`, `RISK_REGISTER.csv`, `V1_COMPLETION_PLAN_V2.md`.
Baseline (1): `artifacts/audit/project_truth.json`.

---

## 7. TOP-10 REAL BLOCKERS (status-vocab)

1. **[P0] Raw applicant PII cleartext in prod `tps_ocr_audit.brain_raw`** — PROVEN_PRODUCTION (575/668 rows, no TTL).
2. **[P0/P1] No env isolation — Preview/Dev write prod Supabase with prod service-role key** — PROVEN.
3. **[P1] Re-Parole `/api/reparole/generate-packet` has no server payment gate (free $15 packet)** — BROKEN.
4. **[P1] Server PII ledger NOT_WIRED** (orphan component; live wizard untouched; flag OFF) — CODE_ONLY / NOT_WIRED.
5. **[P1] No reviewed real-doc corpus/GT → read accuracy unmeasured; "0 fabricated" counts EMPTY as pass** — NOT_BUILT / UNVERIFIED.
6. **[P1] Anti-fabrication gate OFF while Gemini vision (documented wrong-person risk) is the reader on MRZ-less docs** — PARTIAL.
7. **[P1] Prod DB schema ahead of main by 4 out-of-band V2 migrations (definitions only in frozen #119)** — UNVERIFIED-DRIFT.
8. **[P1] Canonical "authoritative" override loop is an orphan route, 0 prod rows; enforce-flip would be unsafe** — NOT_WIRED.
9. **[P2] OCR cache/budget NOT_WIRED → prod OCR uncapped, up to 3 paid calls/upload, no dedupe** — NOT_WIRED.
10. **[P2] No dedicated staging, no Stripe-test isolation, no enforced branch protection, backups/DR UNVERIFIED** — NOT_BUILT / UNVERIFIED.

See `RISK_REGISTER.csv` for full set; `V1_COMPLETION_PLAN_V2.md` for the realistic remediation order.
</invoke>
