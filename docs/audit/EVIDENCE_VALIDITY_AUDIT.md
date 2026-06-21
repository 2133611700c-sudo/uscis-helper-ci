# Evidence Validity Audit — V1 PR claims (#121–#133)

DISTRUST-EVERYTHING re-verification of each headline claim against primary source
(code on base 02eb595, live Supabase rtfxrlountkoegsseukx, GitHub PRs, Vercel prod
env, CI workflows). Status vocabulary applied.

## Claim 1 — "real-doc benchmark (0 fabricated)" (#128)
- ACTUAL evidence level: **UNVERIFIED → at best PROVEN_LOCAL on non-real inputs.**
- The CI `v1-document-benchmark.yml` is a hard **dry-run** (`exit 0` unless
  `V1_BENCHMARK_PAID_ENABLED && V1_STAGING_READY`, neither true) and explicitly
  refuses to call providers. So the "benchmark" never ran against a real document
  in CI.
- Repo contains exactly ONE image fixture: `apps/web/test-fixtures/proof/
  synthetic_passport.jpg` (synthetic, not a real applicant doc). No real-doc corpus
  is committed.
- "0 fabricated" therefore measures either synthetic fixtures or a local-only run
  with no committed artifact. The anti-fabrication GATE that would enforce it
  (`ANTI_FABRICATION_GATE_ENABLED`) is **default OFF** and not confirmed ON in prod.
- Root cause: the benchmark + ground-truth corpus phase
  (`GROUND_TRUTH_CORPUS_AND_CACHE`) is blocked on a non-existent staging
  environment; the claim was advanced to "PASS" on harness/library tests, not on
  real-document measurement. The MEMORY note (2026-06-12) independently warns
  "synthetic PNG verify doesn't catch read-quality — need real docs."

## Claim 2 — "I-821/I-131/I-765 PDF readback 3/3 PASS" (#128)
- ACTUAL evidence level: **PROVEN_LOCAL with SYNTHETIC inputs (not real-doc).**
- `lib/packet/__tests__/pdf-readback.e2e.test.ts` renders a REAL PDF and reads it
  back — genuine at the output layer. BUT inputs are hand-authored synthetic fields
  (`IVANENKO`, `Militsiya`, `Vinnytsia (urban-type settlement)`, empty DOB).
- The test's own header concedes Cyrillic VALUES are glyph-encoded (subset TTF) and
  "not literal-string searchable"; it asserts the **row planner** equals the draw
  plan, plus `%PDF-` magic and `length > 2000`. It does NOT prove that a real
  uploaded I-821/I-131/I-765 produces a correct PDF.
- Verdict: proves the renderer doesn't silently drop a missing field and respects 3
  hard rules on synthetic data — a real and useful guard, but NOT "real-doc readback
  proof." Title overclaims.

## Claim 3 — "server PII ledger proven E2E" (#132)
- ACTUAL evidence level: **PROVEN_MOCKED (local itest), NOT live.**
- `api/wizard-draft/__tests__/route.itest.test.ts` sets `SERVER_LEDGER_ENABLED=1`
  and `WIZARD_DRAFT_ENC_KEY` IN THE TEST PROCESS. In production both env vars are
  **ABSENT** (verified via `vercel env ls production`), so the route returns **404**
  for every request — the ledger is dark in prod.
- `wizard_drafts` table exists in live DB but has **0 rows** and **0 runtime writers
  reachable** (route is flag-gated off; UI `isLedgerClientEnabled()` is also off).
- So "E2E" = the route + crypto + store wired together under test env only. No live
  encrypt/decrypt round-trip has occurred in production.
- Root cause: feature shipped fail-safe (404 when off) and merged green on its itest,
  but the enabling env (flag + 32-byte key) was never provisioned — and a Supabase
  advisor flags `wizard_drafts` as RLS-enabled-no-policy (acceptable only because it
  is service-role-only). The "proven E2E" wording in the PR title outruns the live
  reality.

## Claim 4 — "advance phases 1-3 to PASS, activate phase 4" (#126)
- ACTUAL evidence level: **CODE_ONLY / PARTIAL.** "PASS" reflects passing unit/
  contract tests and a control-plane doc (`V1_COMPLETION`), not staged or production
  proof. Phase gating (`V1_STAGING_READY`, `V1_BENCHMARK_PAID_ENABLED`) shows the
  program is still pre-staging. No staging environment, no live benchmark, no
  enforced canonical mode in prod.

## Cross-cutting root cause
A consistent pattern: V1 criteria are declared "PASS" when the corresponding
**library + its mocked tests** go green, while the **integration into the live
runtime** (env provisioning, staging, real-doc corpus, enforce-mode flip) is
deferred to phases that depend on infrastructure that **does not yet exist**
(dedicated staging Supabase/Stripe-test/keys). The CI workflows are honest about
this in their comments (they dry-run and `exit 0`), but the PR TITLES collapse
"library proven" into "proven E2E / PASS / 0 fabricated", which is the evidence
overclaim. Net: substantial real engineering, but production-grade proof is
UNVERIFIED for every headline V1 claim audited.
