# V1 COMPLETION PLAN v2 — built from PROVEN facts only

Derived from the 2026-06-14 distrust-everything audit (`FULL_PROJECT_AUDIT_2026-06-14.md`,
`CLAIMS_VS_REALITY.csv`, `RISK_REGISTER.csv`). Ground truth: main=prod=`02eb595`, canonical shadow,
ledger OFF, one Supabase project, no staging. This plan replaces "library-merged-green = done" with
"wired + live-smoke + evidence". Nothing here is started by this audit (READ-ONLY); this is the spec.

**Ordering principle:** stop the bleeding (P0 PII / env isolation / payment bypass) FIRST, then build the
missing proving infrastructure (browser lab, staging, real-doc GT) BEFORE advancing any accuracy/E2E claim,
then wire the already-built libraries, then transplant V2, then enforce.

**Sequencing law (root cause of prior failures):** no task may be marked done on unit/mock tests alone.
Each task's `production_criteria` requires a LIVE assertion (prod/staging row, browser smoke, or real provider run).

---

## PHASE 0 — STOP THE BLEEDING (P0/P1, no new infra needed)

### T0.1 — Redact PII at rest in tps_ocr_audit (R01)
- priority: P0
- exact problem: 575/668 rows store cleartext applicant PII in `brain_raw`; no TTL.
- exact files: `app/api/tps/ocr/extract/route.ts:1153-1191`; table `tps_ocr_audit`.
- exact runtime flow: OCR extract → audit writer serializes full brain field values.
- owner-agent: backend-security.
- prerequisites: none.
- implementation: hash/redact field values before write (keep PII-safe shape like manual_review_events); add `expires_at` + cron purge; one-time scrub of existing 575 rows.
- tests: unit asserting no `source_value`/`final_value`/`input_raw` cleartext persisted; migration test for scrub.
- evidence: prod query showing 0 cleartext PII rows post-scrub (counts/hashes only).
- rollback: revert writer change (audit still functions); scrub is forward-only — snapshot first.
- merge criteria: writer test green + scrub migration reviewed.
- production criteria: live prod count of PII-bearing rows == 0.
- external blocker: none.
- effort: M. dependencies: none.

### T0.2 — Add server payment gate to Re-Parole packet (R03)
- priority: P1
- exact problem: `/api/reparole/generate-packet` has no Stripe/auth check; `?paid=1` yields free $15 packet.
- exact files: `app/api/reparole/generate-packet/route.ts`; `ReparoleWizardV2.tsx:537-538,548`.
- exact runtime flow: wizard → generate-packet POST (currently ungated).
- owner-agent: payments.
- prerequisites: none.
- implementation: require `x-payment-token`, verify vs Stripe for `product='re-parole-u4u'`, mirror TPS generate route:109-119; 402 on missing/invalid; keep owner bypass parity with TPS.
- tests: route test — no token → 402; valid Stripe token → 200; `?paid=1` cannot satisfy server.
- evidence: local route test + staging Stripe-test E2E (after T2.x).
- rollback: revert route guard.
- merge criteria: route test green.
- production criteria: prod attempt without token returns 402 (read-only smoke).
- external blocker: Stripe test E2E needs staging (T2).
- effort: S. dependencies: none for the guard; full E2E depends on T2.

### T0.3 — Correct stale STATUS/RELEASE_STATE + ledger status (R17,R20)
- priority: P3 (do early — prevents acting on false confidence).
- exact files: `STATUS.md`, `RELEASE_STATE.yaml`, `CHANGELOG.md`.
- implementation: set `production_sha=02eb595`; mark ledger NOT_WIRED; cite #116 (not #128) for PDF readback PROVEN_LOCAL.
- tests: session-docs-guard.
- production criteria: docs match live sha + audit findings.
- effort: S. dependencies: none.

---

## PHASE 1 — ENVIRONMENT ISOLATION (P1, unblocks everything provable)

### T1.1 — Dedicated staging Supabase + Stripe Test Mode (R02,R11)
- priority: P1
- exact problem: one Supabase project; preview/dev write prod with prod service-role key; no Stripe-test isolation.
- exact files: Vercel env scopes; `lib/supabase/admin.ts`; `lib/stripe/*`.
- exact runtime flow: all write routes / admin client / checkout.
- owner-agent: infra (OWNER must provision project + keys — external).
- prerequisites: owner approval (paid resource).
- implementation: create staging Supabase project; scope `SUPABASE_SERVICE_ROLE_KEY` to production only; set staging URL/keys for Preview+Development; add `STRIPE_SECRET_KEY_TEST`/`STRIPE_WEBHOOK_SECRET_TEST` for non-prod.
- tests: preview deploy write hits staging DB (verified by row in staging not prod).
- evidence: staging project id; preview write lands in staging.
- rollback: revert env scoping.
- merge criteria: env matrix reviewed.
- production criteria: prod service-role key not present in preview/dev; preview write does NOT mutate prod.
- external blocker: **OWNER** (provisioning + cost).
- effort: M. dependencies: none (gates T2,T4,T5,T8,T9).

---

## PHASE 2 — REAL BROWSER LAB (P1, makes "wired" provable)

### T2.1 — Live-wizard browser smoke harness
- priority: P1
- exact problem: no test asserts the LIVE wizard (`TPSWizardV2`) behavior; orphan-component wiring went undetected (R04).
- exact files: `TPSWizardV2.tsx`; new Playwright/e2e under `apps/web`.
- exact runtime flow: mount real start page → wizard → assert storage + network.
- owner-agent: qa-frontend.
- prerequisites: T1.1 (run against staging).
- implementation: headless browser drives real wizard; asserts which component mounts, what is written to localStorage, what network calls fire.
- tests: smoke asserting `GeneratePacketBlock` is NOT the mounted path; `TPSWizardV2` is.
- evidence: CI artifact (screenshot/trace) per product.
- rollback: n/a (test-only).
- merge criteria: smoke green on staging.
- production criteria: read-only prod smoke variant passes.
- external blocker: T1.1.
- effort: M. dependencies: T1.1.

---

## PHASE 3 — WIRE THE SERVER PII LEDGER FOR REAL (P1)

### T3.1 — Wire ledger into live TPSWizardV2 (R04,R10)
- priority: P1
- exact problem: ledger wired into orphan `GeneratePacketBlock`; `TPSWizardV2` writes localStorage PII regardless of flag.
- exact files: `TPSWizardV2.tsx:1848`; `lib/v1/wizardLedgerClient.ts`; `api/wizard-draft/route.ts`.
- exact runtime flow: wizard save → when `NEXT_PUBLIC_SERVER_LEDGER_ENABLED=1` route PII to `/api/wizard-draft` and DROP value/raw_cyrillic from localStorage.
- owner-agent: backend-frontend.
- prerequisites: T1.1 (key/flag in staging), T2.1 (smoke).
- implementation: add `isLedgerClientEnabled()` branch to TPSWizardV2; provision `WIZARD_DRAFT_ENC_KEY` (32-byte hex) + flag in staging first.
- tests: live-wizard smoke (T2.1) asserts NO value/raw_cyrillic in localStorage when ON; encrypt/decrypt round-trip writes a `wizard_drafts` row.
- evidence: staging `wizard_drafts` row count > 0 from a real browser session.
- rollback: flag OFF → 404 parity (already proven).
- merge criteria: smoke green; OFF parity byte-identical.
- production criteria: with flag ON in prod, a real session produces a `wizard_drafts` row and localStorage has no PII value.
- external blocker: T1.1.
- effort: M. dependencies: T1.1,T2.1.

### T3.2 — Extend ledger to Re-Parole / EAD / Translation wizards
- priority: P2 (after TPS proven).
- exact files: `ReparoleWizardV2.tsx`, `components/services/ead/EADWizard.tsx`, `TranslateWizard.tsx`.
- implementation: same `isLedgerClientEnabled` branch per wizard.
- tests/evidence: per-wizard browser smoke + staging row.
- production criteria: each wizard produces ledger rows with no browser PII when ON.
- effort: M. dependencies: T3.1.

---

## PHASE 4 — REAL-DOC CORPUS + GROUND TRUTH (P1, unlocks accuracy claims)

### T4.1 — Sanctioned redacted real-doc GT mechanism (R05)
- priority: P1
- exact problem: only synthetic fixtures (carry own answers) + a sha256 manifest of absent files; accuracy unmeasured; "0 fabricated" counts EMPTY as pass.
- exact files: `PRIVATE_CORPUS_MANIFEST.safe.yaml`; new GT loader; `CORPUS_INVENTORY.csv`.
- owner-agent: doc-intelligence (OWNER supplies real docs to a secured staging store — external/PII).
- prerequisites: T1.1 (secure staging store), owner consent.
- implementation: store real docs + independently-reviewed GT in staging-only secured location (never repo); loader reads from there; metrics SEPARATE coverage (read correctly) from non-fabrication (didn't invent).
- tests: benchmark runs ≥5 reviewed samples/type through real Gemini+arbitration; reports exact_match, fabricated, EMPTY distinctly.
- evidence: staging benchmark JSON with reviewer sign-off; counts only (no PII).
- rollback: n/a (data lives outside repo).
- merge criteria: loader + metric separation reviewed.
- production criteria: benchmark gate runs in CI against staging corpus (not dry-run).
- external blocker: **OWNER** (real docs + reviewer).
- effort: L. dependencies: T1.1.

---

## PHASE 5 — OCR / BRAIN BENCHMARK + ANTI-FAB GATE (P1)

### T5.1 — Turn on anti-fabrication gate for MRZ-less classes (R06)
- priority: P1
- exact problem: `ANTI_FABRICATION_GATE_ENABLED` default OFF while Gemini vision (wrong-person risk) reads MRZ-less booklet/certificates.
- exact files: `lib/docintel/antiFabricationGate.ts:3`; `arbitration.ts`; `geminiVisionProvider.ts`.
- prerequisites: T4.1 (GT to prove the gate doesn't over-block).
- implementation: enable gate per-class where no MRZ anchor; force review on non-Latin; keep MRZ-controlling where MRZ exists.
- tests: GT benchmark shows reduced fabrication with acceptable review rate.
- evidence: staging benchmark before/after.
- production criteria: gate ON in prod for MRZ-less classes; fabrication count tracked.
- external blocker: T4.1.
- effort: M. dependencies: T4.1.

---

## PHASE 6 — WIRE PROVIDER CACHE + BUDGET (P2)

### T6.1 — Connect cache/budget chokepoint to live OCR (R09,R16)
- priority: P2
- exact problem: cache/budget library has 0 importers; prod OCR uncapped, up to 3 paid calls/upload, no dedupe.
- exact files: `lib/v1/cachedBudgetedProvider.ts` + `ocrCache*` + `providerBudget.ts`; `tps/ocr/extract`, `translation/vision-extract`.
- prerequisites: T1.1 (test on staging spend), behind flag.
- implementation: route provider calls through `cachedBudgetedCall`; add per-document idempotency to stop duplicate charges on Stripe-reload retry; budget fail-closed.
- tests: re-upload same doc → single provider call; budget exceeded → fail-closed.
- evidence: staging spend telemetry; duplicate-charge test.
- production criteria: prod OCR shows cache hits + budget enforcement in telemetry.
- external blocker: T1.1.
- effort: M. dependencies: T1.1.

---

## PHASE 7 — USCIS VISUAL PROOF (P3 hardening)

### T7.1 — Rendered-image diff for I-821/I-131/I-765 (R17)
- priority: P3
- exact problem: readback asserts widget rectangles, not a human/visual diff; #128 PASS string unbacked.
- exact files: `lib/packet/__tests__/*.e2e.test.ts`; i821/i131/i765 mappers.
- implementation: add rendered-image snapshot diff vs approved baseline; drive with one real (staging) extraction.
- tests: visual diff within tolerance; real-doc → correct cell placement.
- production criteria: gate green on a real staging extraction (not synthetic).
- external blocker: T4.1 (real input).
- effort: M. dependencies: T4.1.

---

## PHASE 8 — TRANSLATION V2 TRANSPLANT (P1 if productizing)

### T8.1 — Reconcile DB drift then rebase/transplant #119 (R07)
- priority: P1 (drift) / P2 (productization)
- exact problem: prod schema ahead of main by 4 V2 migrations only in frozen #119; #119 is 13 behind and missing #122 security fix; 0 real orders.
- exact files: `supabase/migrations/*` (main); PR #119 diff; `submit-order/route.ts`; `requireTranslationOperator.ts` (duplicate of `requireAdminAuth`).
- prerequisites: T1.1 (staging), Stripe-test.
- implementation: FIRST back-port the 4 migration `.sql` into main so code-of-record matches prod (do not touch #119 logic yet); THEN if productizing, rebase #119 onto current main (preserve #122), consolidate `requireTranslationOperator` into `requireAdminAuth`, Stripe-test E2E on staging.
- tests: live `.live.test` invariants on staging; Stripe-test order → artifact → outbox → delivery.
- evidence: staging `translation_orders_v2`/`document_artifacts`/`delivery_outbox` rows from a real test order.
- rollback: V2 behind flag; legacy manual flow remains default.
- merge criteria: migrations in main; #122 preserved; staging E2E green.
- production criteria: a Stripe-test order completes end-to-end on staging before any prod cutover.
- external blocker: T1.1; **do NOT touch #119 outside this plan**.
- effort: L. dependencies: T1.1.

---

## PHASE 9 — STRIPE TEST-MODE E2E (P1 acceptance)

### T9.1 — Automated paid→download E2E per product
- priority: P1
- exact problem: no product has automated paid→download E2E; `generated_packets`=0; positive paid delivery UNVERIFIED.
- exact files: per-product generate-packet routes; checkout; new e2e.
- prerequisites: T1.1, T0.2 (reparole gate), T2.1.
- implementation: Stripe Test Mode checkout → x-payment-token → generate-packet → assert downloadable PDF/ZIP, on staging.
- tests: TPS, Re-Parole, EAD(free), Translation paths.
- evidence: staging e2e artifacts.
- production criteria: each product's paid→download proven on staging Stripe-test.
- external blocker: T1.1.
- effort: M. dependencies: T1.1,T0.2,T2.1.

---

## PHASE 10 — PRODUCT-SCOPED ENFORCE (P1, last)

### T10.1 — Wire canonical override loop, then consider enforce per product (R08)
- priority: P1
- exact problem: enforce is unsafe because the override/correction loop is an orphan route (0 prod rows); canonical is not actually authoritative.
- exact files: `app/api/canonical/[id]/override/route.ts`; UI correction components; `continuityMode.ts`.
- prerequisites: T4.1 (GT), T9.1 (E2E), T2.1 (smoke).
- implementation: wire override route to the real correction UI (replace/augment legacy correct-field) so canonical becomes authoritative WITH a working correction path; only THEN flip `CANONICAL_MODE_<product>` to enforce, one product at a time.
- tests: override → 200/409 concurrency exercised in staging; enforce shadow→enforce parity on GT corpus.
- evidence: staging `canonical_overrides` rows > 0; enforce produces identical-or-corrected output vs shadow on GT.
- rollback: per-product flag back to shadow.
- production criteria: enforce ON for one product with override loop live and GT regression clean.
- external blocker: T4.1,T9.1.
- effort: L. dependencies: T4.1,T9.1,T2.1.

---

## V1 ACCEPTANCE (definition of done — all LIVE-proven, no mocks)
1. P0 PII redacted at rest (T0.1) — prod 0 cleartext rows.
2. Env isolation (T1.1) — preview/dev cannot mutate prod.
3. Re-Parole payment gate (T0.2) + paid→download E2E all products (T9.1) on Stripe-test.
4. Ledger wired + browser-smoke-proven, no PII in browser when ON (T3.x).
5. Real-doc GT benchmark in CI, coverage and fabrication reported separately (T4.1,T5.1).
6. Provider cache/budget enforced live, no duplicate charges (T6.1).
7. DB drift reconciled into main (T8.1).
8. Canonical enforce only with a wired override loop + clean GT regression (T10.1).
9. Docs (STATUS/RELEASE_STATE) match live reality (T0.3).

**External blockers concentrated in:** T1.1 (owner provisions staging + Stripe-test) and T4.1 (owner supplies reviewed real docs). Most P0/P1 code fixes (T0.1, T0.2, T0.3, T3.1) can proceed in parallel once staging exists; T0.1/T0.3 need no infra.
