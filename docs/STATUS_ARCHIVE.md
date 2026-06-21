# STATUS ARCHIVE — historical status blocks (NOT current truth)

> This file is an APPEND-ONLY archive of prior STATUS.md headers, moved here on 2026-06-14T05:39:21Z
> as part of Stage 0 (single source of truth). **It is NOT the current state.**
> Current state: see [STATUS.md](../STATUS.md) and [RELEASE_STATE.yaml](../RELEASE_STATE.yaml).
> History of changes also lives in CHANGELOG.md. No PII is present (CI PII gate enforced).

---

# STATUS (2026-06-14 — Browser PII MINIMIZATION/containment (PR #120), content-guard fixed)
- HONEST FRAMING: this is PII MINIMIZATION/containment, NOT removal. `value` (name/DOB/address) REMAINS in localStorage for TPS/Re-Parole; `raw_cyrillic` REMAINS in sessionStorage for Translation (load-bearing carriage, documented exception). Full removal needs Phase B (server-side session ledger + opaque browser token) — separate later PR.
- Containment shipped: persist sanitizer (drops evidence/raw_value/normalized/confidence/sourceTraces/source*) + scalar-coercion (nested object/array under an allowlisted key is DROPPED, cannot smuggle PII) + MAX_PERSISTED_VALUE_LEN=512 cap; 24h TTL discard-on-load; clear-on-completion; static guard test (17 cases incl. nested-object/array bypass, proto, raw_cyrillic translation-only+capped).
- CI fix: content/certification guard FAILED on persistedDraftPolicy.ts:60 "certified translation" (+ CHANGELOG) → reworded to "translation draft hand-off". guard:content now 0 violations. tsc 0 real errors; full suite pass.
- PR #120 DRAFT. Not merged, production shadow unchanged.

---
# STATUS (2026-06-13 — BROWSER PII CONTAINMENT Phase A: draft TTL + clear-on-completion + persist-sanitizer + static guard)
- CONTAINMENT (`apps/web/src/lib/storage/persistedDraftPolicy.ts`): shared per-wizard allowlist + `sanitizeField*ForStorage()` + `DRAFT_TTL_MS=24h` + `isDraftExpired()`. The 3 persisting wizards now strip OCR internals (`raw_value`/`source`/`source_zone`/`source_document_id`/`confidence`/`ensemble_candidate`/`review_reasons`/`kind`) BEFORE `setItem`; persist only `{value, requires_review/review_required, doc_slot|field}` + opaque `canonical_document_id`. Translation keeps `raw_cyrillic` ON PURPOSE (load-bearing operator-handoff carriage; sole documented exception).
- TTL: every draft carries `savedAt`; discarded + `removeItem` on load if >24h (TPS/Re-Parole/Translation). CLEAR-ON-COMPLETION: TPS+Re-Parole clear on packet-generated (`draftClearedRef` suppresses re-persist); Translation clears on `/order/{id}` operator redirect. Start-over already cleared all three; ref reset there.
- EAD = N/A: persists NOTHING to browser storage (React-memory only; verified grep). No exposure window. Allowlist lists `ead:[]` so any future persistence must route through the sanitizer.
- GUARD: `apps/web/src/lib/storage/__tests__/browserPiiGuard.test.ts` FAILS if the sanitizer stops stripping any prohibited key, an allowlist adds one (except translation `raw_cyrillic`), or TTL drifts from 24h.
- CARRIAGE INTACT: `canonical_document_id` (TPS/Re-Parole) + `canonicalDocumentId` (Translation) still persist+restore across `?paid=1`; existing `canonicalCarriage` source-guard tests updated to tolerate the additional sanitized keys and still pass.
- DEFERRED: Phase B (server-side session ledger — browser holds opaque token only) documented in `docs/reports/BROWSER_PII_AUDIT.md`, no code this PR (owner: too risky to bundle with containment).
- GATE: tsc 0 errors (only pre-existing stale `.next/types` artifacts); full vitest 3693 pass / 24 skip / 0 fail; build PASS. NOT merged, no env/Vercel change, all products SHADOW. Branch `architecture/pii-localstorage-containment` (base `main` @ bd98667).

---
# STATUS (2026-06-13 — RESOLVER HARDENED: legacy global can NEVER enforce + TPS positive carriage + PR cleanup)
- RESOLVER HARDENED (`apps/web/src/lib/canonical/continuityMode.ts`): legacy global `CANONICAL_CONTINUITY_MODE` can NEVER yield `enforce` for ANY product. It may only return `off` or `shadow` (legacy=`enforce` → clamped to `shadow` for tps/reparole/ead/translation). enforce is allowed EXCLUSIVELY via product-scoped envs `CANONICAL_MODE_<PRODUCT>` or the matching key in `CANONICAL_MODES` JSON. This REPLACES the prior behavior where legacy enforce flowed to tps/reparole/ead.
- Malformed `CANONICAL_MODES` JSON now emits a PII-SAFE `console.warn` (static message + product key only; raw value NEVER logged) and falls through safely to shadow.
- TESTS rewritten (`continuityMode.test.ts`, 20 tests): default→shadow×4; legacy enforce→shadow×4; legacy off→off×4; legacy shadow→shadow×4; per-product enforce isolation ×4; CANONICAL_MODES JSON incl. translation; precedence product>JSON>legacy; malformed JSON→shadow+warn-spy-asserted (no value leak); malformed scalar→shadow.
- TPS POSITIVE CARRIAGE: `canonical-carriage.spec.ts` TPS test now asserts `generate_has_id===true && ids_equal===true` after the Stripe `?paid=1` reload (persist/restore fix in TPSWizardV2 carries the id). Intercepts the real POST generate-packet, asserts the body id == extract id, `route.abort()` BEFORE server (no payment, no packet). PII-safe artifact `test-results/canonical-carriage/tps.json` (booleans + deploy SHA + base url host only).
- PR CLEANUP: removed generated `apps/web/tsconfig.tsbuildinfo` (gitignored `*.tsbuildinfo`); removed orphaned `apps/web/osd.traineddata` (10MB, Tesseract-OSD path REMOVED 2026-06-12, no runtime loader, no license — gitignored `*.traineddata`); removed unrelated `monitoring/2026-06-13-federal-register-uscis-briefing.md`.
- TPS WIRE-PROOF (preview built from pushed HEAD, deploy_sha == HEAD, PR #118): all-true — extract 200 / id len 36 / generate_intercepted / generate_has_id / ids_equal; aborted before server (no payment). PII-safe artifact captured. Preview is SSO-gated → test primes the Vercel bypass cookie via `VERCEL_SHARE_URL` (test-only `beforeEach`, no-op when unset).
- GATE: tsc 0 errors; full vitest 3683 pass / 24 skip / 0 fail; build PASS; PII gate CLEAN. NOT merged, no Vercel/env change, not deployed. Branch `architecture/canonical-enforce-e2e`.

---
# STATUS (2026-06-13 — PRODUCT-SCOPED canonical continuity modes; single global enforce PROHIBITED)
- Replaced the single global `CANONICAL_CONTINUITY_MODE` decision point with a per-product resolver `apps/web/src/lib/canonical/continuityMode.ts` (`getCanonicalMode(product)`). Each product (tps/reparole/ead/translation) resolves its OWN mode.
- PRECEDENCE: product env `CANONICAL_MODE_<PRODUCT>` → `CANONICAL_MODES` JSON → legacy global `CANONICAL_CONTINUITY_MODE` (back-compat, resolver-internal ONLY) → `shadow` default.
- HARD GUARD (owner-binding): translation can NEVER reach `enforce` via the legacy global flag (operator-flow continuity not built). Only explicit `CANONICAL_MODE_TRANSLATION` / `CANONICAL_MODES.translation` may set translation enforce.
- 9 routes refactored to read `getCanonicalMode(<product>)`; no bare `process.env.CANONICAL_CONTINUITY_MODE` remains outside the resolver + tests. Behavior identical when no per-product env set (default shadow).
- GATE: tsc 0 errors; full vitest 3675 pass / 24 skip / 0 fail (+12 new in `continuityMode.test.ts`; updated 1 stale reparole source-inspection assertion). NOT merged, no Vercel/env change, not deployed. Branch `architecture/canonical-enforce-e2e`.

---
# STATUS (2026-06-13 — TPS carriage FIXED + owner decision STAGED-SHADOW)
- TPS CARRIAGE BREAK FIXED (`e4e5adc`): TPSWizardV2 persists `canonical_document_id` into localStorage `uploadsMeta` + restores on rehydration, surviving the Stripe `?paid=1` reload. Mirrors ReparoleWizardV2 persist/restore. tsc 0. Wire-re-proof pending.
- TRANSLATION truth: prod runs OPERATOR_FLOW (`NEXT_PUBLIC_NEW_OPERATOR_FLOW_ENABLED` ON). Final PDF is operator-made from `manual_review_queue`; `submit-order` carries no canonical_document_id → canonical→PDF continuity architecturally ABSENT for Translation in prod. Enforce flag is GLOBAL.
- OWNER DECISION: STAGED — keep prod SHADOW; wire-re-prove TPS + watch persist telemetry; decide enforce later. Not flipping global enforce (extract-persist-mandatory = availability risk; Translation operator-flow out of canonical-enforce scope).
- ENFORCE-READINESS: EAD ✅ + Re-Parole ✅ full carriage wire-proven; TPS ✅ fixed (re-proof pending); Translation = extract-persist only.

---
# STATUS (2026-06-13 — Wave 1 E2E INTEGRATION: real-browser carriage proof + DB-truth re-verify on architecture/canonical-enforce-e2e → preview-enforce NO-GO until TPS carriage break fixed)
- INTEGRATION COORDINATOR result: WAVE1_E2E_INTEGRATED on `architecture/canonical-enforce-e2e` (base `4c9fece`, PR #117 squash). integration_sha = `cdf36fd`.
- WHAT MERGED: Agent A's real-browser e2e carriage proof — cherry-pick `77026ab` clean (2 NEW files only, no conflict): `apps/web/tests/e2e/canonical-carriage.spec.ts` (Playwright, 444 lines) + `apps/web/test-fixtures/proof/synthetic_passport.jpg` (synthetic SHEVCHENKO/TARAS fixture, non-PII). The Playwright spec lives OUTSIDE `src/` and is `.spec.ts`, so the vitest `include:['src/**/*.test.ts(x)']` NEVER picks it up — confirmed: unit run shows 0 e2e files, 0 failures. A separate `playwright.config.ts` owns it.
- Agent B was a DB-TRUTH RE-VERIFICATION pass (read-only contract audit), NOT a code producer. Its worktree tip `066ab1f` is an OLDER unsquashed state of the same work already in base (`git diff base..066ab1f` = +33/−1286, base is a SUPERSET). Nothing to cherry-pick from B. Spot-checked B's contract line refs against base: CANONICAL_ID_REQUIRED→422, CANONICAL_NOT_FOUND→404, resolve-null / verifyHash-notFound logic all present and accurate. DB_TRUTH_PASS confirmed against the integrated tree.
- GATE (integration branch `cdf36fd`): tsc 0 errors; tests 3663 pass / 24 skip / 0 fail (Playwright e2e correctly EXCLUDED from vitest — structural, by config, not by failure); build PASS.
- LIVE BROWSER CARRIAGE (Agent A, LIVE prod messenginfo.com, Chromium, synthetic fixture, ids=36-char UUIDs, values never logged): Re-Parole = FULL CARRIAGE PROVEN (extract id == generate-body id on the wire); EAD = FULL CARRIAGE PROVEN; TPS = **CARRIAGE BREAK on paid path** (extract returns id, generate request fires but body does NOT carry the id); Translation = extract proven, generate leg payment-gated → NOT wire-observable.
- carriage_proven_products = EAD, Re-Parole (2 of 4). TPS proven BROKEN. Translation UNPROVEN (not observable).
- DECISION: preview/prod ENFORCE = **NO-GO**. Carriage gap = automatic NO-GO. TPS would 422/409 every real paid user (extract id never resent in generate body); Translation generate carriage is unverified. Open blockers: TPS_CARRIAGE_BREAK_PAID_PATH, TRANSLATION_CARRIAGE_UNPROVEN.
- NOT merged to main, NO Vercel/env change, NOT deployed. Pushed to `architecture/canonical-enforce-e2e` only.

# STATUS (2026-06-13 — HTTP-contract fix: not-found canonical returns 404 not 503/409 in enforce — found by preview-enforce smoke)
- DEFECT (proven by preview-enforce smoke): in enforce mode, a generate-pdf/render/packet request with a `canonical_document_id` that does NOT exist returned **503 CANONICAL_STORAGE_UNAVAILABLE** (translation routes) or **409 CANONICAL_HASH_MISMATCH** (packet routes) instead of the contractual **404 CANONICAL_NOT_FOUND**. Two root causes, both fixed.
- ROOT CAUSE A (translation): `resolveCanonicalDocument()` THREW on base not-found → route catch (enforce) → 503; the route's `if (!sourceCanonical){404}` branch was dead. FIX: `resolveCanonicalDocument` now RETURNS null on not-found (mirrors `loadCanonicalDocumentById`) and THROWS only on a genuine Supabase/DB error. The 404 branch is now live; infra throw still → 503.
- ROOT CAUSE B (packet routes tps/reparole/ead): `verifyCanonicalHash()` runs BEFORE resolve and collapsed not-found + query-error into `{valid:false, mismatch}` → enforce returned 409. FIX: `verifyCanonicalHash` now returns `{valid:false, notFound:true}` for a missing row, THROWS on a real query error; each packet route checks `notFound → 404` BEFORE the 409 hash-mismatch branch, and maps a hash-verify throw → 503.
- CONTRACT now upheld on all 5 routes (generate-pdf, render, tps/reparole/ead generate-packet): missing id → 422 | not-found → 404 | hash mismatch → 409 | session mismatch → 403 | real infra throw → 503. Not-found NEVER collapses into 503/409.
- GATE: tsc 0 errors; tests 3663 pass / 24 skip / 0 fail (+21 new in `canonicalNotFoundContract.test.ts`, none lost). New test drives REAL `resolveCanonicalDocument`/`verifyCanonicalHash` with a configurable Supabase mock (not-found vs infra) + per-route status-mapping.
- Files: `lib/canonical/persistence/index.ts` (resolve + verifyCanonicalHash), `api/{tps,reparole,ead}/generate-packet/route.ts`, new `lib/canonical/persistence/__tests__/canonicalNotFoundContract.test.ts`, persistence test null-guards. NOT merged, no Vercel/env change, not deployed. Pushed to `architecture/canonical-continuity`.

# STATUS (2026-06-13 — Wave 1b INTEGRATION: end-to-end client canonical_document_id carriage WIRED for all 4 products → preview-enforce GO)
- WAVE1B INTEGRATION result: WAVE1B_INTEGRATED. Cherry-picked 4 per-product carriage commits onto `architecture/canonical-continuity` (base `4f8aee70`) in order TPS → ReParole → EAD → Translation. Only conflict: `apps/web/src/lib/tps/answers.ts` (both sides documented the SAME `canonical_document_id?: string` field) — resolved SEMANTICALLY by merging both doc-comments, field kept once, no product field lost.
- This CLOSES the gap that made the prior Wave 1 integration a preview-enforce NO-GO. Prior status claimed canonical continuity "COMPLETE / all 4 products wired" — that was SERVER-ONLY (extract persistence + packet routes). The CLIENT carriage (capture id from extract response → store in wizard state → resend in generate body) was MISSING for all 4. It is now built.
- SERVER EMIT added where missing: ReParole + EAD extract routes now persist the canonical (shadow/enforce) and RETURN `canonical_document_id` (null on shadow persist failure — NEVER fabricated; 503 on enforce failure). TPS + Translation extract routes already emitted the id in base.
- CLIENT CARRIAGE (all 4): TPS (`canonicalCarriage.ts` capture+select, passport→booklet priority), ReParole (capture from `_core` route, survives localStorage across Stripe), EAD (useState capture, single-doc), Translation (capture from vision-extract, survives sessionStorage across Stripe). All resend via conditional spread — field OMITTED when no id captured; shadow mode keeps working absent. No fabricated/stale ids.
- GATE (integration branch): tsc 0 errors; tests 3642 pass / 24 skip / 0 fail (skips pre-existing, none in carriage tests, +45 net vs 3597 baseline); build PASS; PII gate CLEAN (only new logs = ReParole/EAD persist info: event/canonical_document_id-UUID/8-char fields_hash/mode — no field values).
- CARRIAGE PROVEN end-to-end (static) for ALL 4: each wizard captures + resends, each extract route emits id. carriage_all_4_products = true.
- DECISION: preview ENFORCE = **GO** (carriage proven + tsc 0 + build + PII clean + no required skipped tests). Enforce-mode enforcement already lives server-side; flipping CANONICAL_CONTINUITY_MODE=enforce in preview is now safe to smoke. NOT enabled here.
- NOT merged to main, NO Vercel/env change, NOT deployed. Pushed to `architecture/canonical-continuity` only.

# STATUS (2026-06-13 — Wave 1 INTEGRATION: Agent 1 merged onto canonical-continuity, gate GREEN, Agent 2 BLOCKED → preview-enforce NO-GO)
- INTEGRATION COORDINATOR result: WAVE1_INTEGRATED (DB hardening only). Agent 1 commit `066ab1f` cherry-picked clean onto `architecture/canonical-continuity` (base `69717fe`) — NO conflicts; migrations `20260613000004`/`000005` keep distinct, in-order timestamps (no duplicate version).
- Agent 2 returned `BLOCKED_CLIENT_ID_CARRIAGE` with `client_id_carriage_proven=false` and produced ZERO new commits on its base (its worktree HEAD `1919b543` is an unrelated Phase 1/2B forms commit, NOT descended from the integration base — base is NOT its ancestor). There was no runtime/client carriage work to merge. NOTE: the `/api/canonical/[id]/override` HTTP route Agent 2 reported "absent" DOES exist on the integration branch (added in base `69717fe`, after Agent 2's audited HEAD) — Agent 2 audited a stale base.
- LIVE DB RE-PROOF (project rtfxrlountkoegsseukx, integration coordinator, postgres path, synthetic sentinel WAVE1_TEST*): 4 canonical triggers present; product-scoped UNIQUE `canonical_documents_session_product_doc_hash_unique` present + old `..._session_doc_hash_unique` DROPPED; `fields_hash_schema_version` column present; anon/authenticated table grants = 0; UPDATE base REJECTED P0001, DELETE base REJECTED P0001; 0 synthetic leftovers after guarded cleanup. Immutability is enforced at the DB, not RLS-only.
- GATE (integration branch): tsc 0 errors; tests 3597 pass / 24 skip / 0 fail (live DB-invariant 6 self-skip without RUN_DB_INVARIANTS=1 — proven separately live, NOT a blocking skip); build PASS (override route registered ƒ); PII gate CLEAN (canonical persistence logs only docType/product/field-count/session/truncated-hash, no values/evidence).
- DECISION: preview ENFORCE (Wave 2) = **NO-GO**. Automatic NO-GO because `client_id_carriage_proven=false`: no server route returns `canonical_document_id` and no client captures/resends it for any of the 4 products; the extraction-persistence + id-carriage + enforce-by-id layer is UNBUILT. Production enforce today would 422/409 every real user. Open blockers: BLOCKED_CLIENT_ID_CARRIAGE, BLOCKED_EXTRACTION_PERSISTENCE.
- NOT merged to main, NO Vercel/env change, NOT deployed.

# STATUS (2026-06-13 — Wave 1 Agent 1: DB immutability/idempotency/hash/security HARDENED + LIVE-PROVEN)
- CANONICAL DB HARDENING (project rtfxrlountkoegsseukx, all proven against LIVE DB via service-role/postgres):
  - IMMUTABILITY: RLS-only was INSUFFICIENT (service_role bypasses RLS). Live probe proved UPDATE base + UPDATE/DELETE override SUCCEEDED. FIX: 4 BEFORE UPDATE/DELETE triggers raising CANONICAL_BASE_IMMUTABLE / CANONICAL_OVERRIDES_APPEND_ONLY. Re-probe: ALL 4 REJECTED (P0001) even as postgres.
  - IDEMPOTENCY: UNIQUE(session_id,doc_type,fields_hash) caused CROSS-PRODUCT COLLISION (live probe: a 'translation' persist OVERWROTE a 'tps' row). FIX: product-scoped UNIQUE(session_id,product,doc_type,fields_hash) + persist now INSERT…ON CONFLICT DO NOTHING + re-select (base immutable, never UPDATE).
  - HASH INTEGRITY: fields_hash v1 covered only finalValue+confidence+review → provenance UNPROTECTED. FIX: versioned v2 serialization (FIELDS_HASH_SCHEMA_VERSION=2) covering key/rawValue/normalizedValue/finalValue/source/criticality/confidence/review/evidence/knowledge* + docType/product/schemaVersion; persisted fields_hash_schema_version column + verifier version-gate.
  - ATOMIC RPC: verified correct on live DB (batch atomicity, P0002 conflict, monotonic, invalid-source rollback). Advisory lock 32-bit hashtext → 64-bit bigint hashtextextended (fixes collision AND int4-overflow found in live test).
  - SECURITY DEFINER + GRANTS: both fns SECURITY DEFINER owner=postgres search_path=`public, pg_temp`, EXECUTE revoked from PUBLIC/anon/authenticated, granted only service_role (live-tested DENIED). Broad anon/authenticated table grants REVOKEd. Service-role key server-only.
  - 3 forward migrations. Live DB invariant test 6/6 PASS (RUN_DB_INVARIANTS=1). Unit 3597 pass/24 skip. tsc 0 errors. 0 synthetic leftovers. NOT merged, NOT deployed.

# STATUS (2026-06-13 — Override HTTP route added: end-to-end override write-path closed)
- CANONICAL OVERRIDE ROUTE: `apps/web/src/app/api/canonical/[id]/override/route.ts` ADDED (was MISSING — `appendCanonicalOverride` had no HTTP caller). POST: strict 422 for all client errors; 404 not-found; 403 session mismatch; 409 hash-mismatch / version-conflict; 503 infra-only. GET: keys + count + current_version, no values. PII-safe (never logs override_value). 11 route tests pass. Smoke `overrideChecks()` wired (O0 always; O1/O2/O3 gated on SMOKE_CANONICAL_ID). tsc 0 errors; tests 3591 pass; build PASS (route registered ƒ). Pushed to `architecture/canonical-continuity`. NOT merged, enforce NOT enabled. Owner-side remaining: preview enforce-smoke, GO, merge PR #117, prod enforce.

# STATUS (2026-06-13 — Enforce-smoke runbook: turnkey script + owner runbook added)
- ENFORCE SMOKE: `scripts/smoke-enforce-preview.ts` (tsx, read-only HTTP) + `docs/reports/ENFORCE_SMOKE_RUNBOOK.md` added. Smoke asserts the live preview enforce gate (422 CANONICAL_ID_REQUIRED missing id; 404 CANONICAL_NOT_FOUND bogus UUID) on translation/generate-pdf + translation/render — mutation-free (pre-gate runs before payment/review). Override 200/409 + extract→UUID + generate-pdf 200 are owner-manual / integration-test covered (no HTTP override route exists on this branch). Standalone tsc EXIT=0. Owner one-liner: `export PREVIEW_BASE_URL=https://uscis-helper-xxxx.vercel.app && pnpm tsx scripts/smoke-enforce-preview.ts`.

# STATUS (2026-06-13 — Final gate: all migrations applied, integration tests PASS, RPC bug fixed)
- CANONICAL PERSISTENCE: All 4 migrations applied to prod DB. Atomic RPC bug fixed (JSON.stringify → pass array directly; Supabase serializes to JSONB). 6/6 concurrency integration tests PASS against real DB. UNIQUE constraints confirmed. FK confirmed. SECURITY DEFINER confirmed. Tests: 3580 pass. TypeScript: 0 errors. Build: PASS. PR #117 updated. Branch pushed.

# STATUS (2026-06-13 — Persistence hardening: 5 defects fixed, 2 migrations written, NOT applied)
- CANONICAL PERSISTENCE: 5 defects fixed. Migrations `000002` (UNIQUE constraints + atomic RPC) and `000003` (cert FK) written but NOT applied — owner must apply. `persistCanonicalDocument` is now idempotent (upsert). `appendCanonicalOverride` uses atomic RPC with advisory lock. Override resolution ORDER BY version ASC (was created_at). `CanonicalConcurrencyError` typed exception added. TypeScript: 0 errors. Tests: 3580 pass.

# STATUS (2026-06-13 — Migration ledger: duplicate canonical migration removed, version collision RESOLVED)
- MIGRATION LEDGER: duplicate `20260613000001_canonical_documents_and_overrides.sql` removed (byte-for-byte copy of `20260613000000`). Remote applied 3 migrations: 194557 (canonical tables), 194613 (cert binding), 194627 (idempotent no-op). Local now has 2 canonical files: `20260613000000_canonical_documents_and_overrides.sql` + `20260613000001_certification_canonical_hash_binding.sql`. Version collision resolved. Ledger CLEAN.

# STATUS (2026-06-13 — EAD wiring DONE: all 4 products canonical, gate PASS)
- CANONICAL CONTINUITY: ALL 4 products wired (TPS, Re-Parole, Translation/generate-pdf, EAD generate-packet). EAD route follows exact TPS pattern (422/409/404/403/503 HTTP contract). I-765 unified: buildI765DocumentOps is single entry point for both TPS and EAD document-derived fields. 3 migration files on branch (NOT applied — owner approval required). CANONICAL_CONTINUITY_MODE=shadow (default). Tests: 3573 pass (+14 from EAD tests). TypeScript: 0 errors. Build: PASS. Verdict: READY_FOR_MIGRATION (pending DB migration + owner approval to flip enforce).

# STATUS (2026-06-13 — Integration: A1-A4 merged + render/route.ts canonical cutover COMPLETE)
- CANONICAL CONTINUITY: all 4 worktree agents integrated. persistence module, packet routes (TPS + Re-Parole), generate-pdf, AND render/route.ts now wired to canonical continuity pattern. 3 migration files on branch (NOT applied — owner approval required). CANONICAL_CONTINUITY_MODE=shadow (default). Tests: 3559 pass. TypeScript: 0 errors. Verdict: READY_FOR_MIGRATION (pending DB migration + owner approval to flip enforce).

# STATUS (2026-06-13 — Agent 4: canonical continuity translation cutover PARTIAL)
- TRANSLATION CUTOVER: generate-pdf wired to resolveCanonicalDocument in shadow+enforce mode. C3 null filtered (INV-11). Cert binds 7 hashes. 3502 tests pass. Verdict: CONTINUITY_PARTIAL. Blockers: packet routes not wired; render/route.ts not wired; DB migration not applied.

# STATUS (2026-06-13 — FULL SYSTEM + DOCUMENT-CORE AUDIT written; audit-only, no code change, nothing merged)
- AUDIT-ONLY session. Consolidated evidence-only audit written to `docs/audit/2026-06-13-DOCUMENT_CORE_AND_PROJECT_STATE_AUDIT.md` (Part 1 repo/PR/security/deploy; Part 2 Document Core brain/dictionary/arbitration/canonical; Part 3 full system runtime — routes/DB/storage/auth/env/deploy/monitoring/flows/packets/archive/deps/dead-code/security/production). Added a `0.` read-first pointer to AGENTS.md + CLAUDE.md so every agent reads it on contact. NO application code changed. RESULT: DEGRADED (functional + well-guarded; gaps in the doc's risk registers). VERIFIED LIVE: prod=main `4d3e470` (healthz + Vercel `target:production`); preview=PR#116 `76c49e2` (OPEN, not merged); Supabase `rtfxrlountkoegsseukx` ACTIVE_HEALTHY, 38 tables (3 audit/observability tables at 0 rows ⇒ OCR_FIELD_SAFETY/GUARD_BLOCK_METRICS/CERTIFIER_AUDIT flags OFF in prod). tsc 0; field-by-field 46/46; cross-product parity 100/1-skip; live real-doc gate (EAD+I-94) 8/8, 0 FABRICATED/0 REVIEW_LOST. TOP RISKS (HIGH): C3 anti-fabrication gate OFF in prod; Phase 2B form-correctness fixes are PR-only not in prod. NEXT (owner decision): read prod Vercel env to confirm flag posture (esp. OCR_FIELD_SAFETY_ENABLED) + merge PR #116. No new direction taken.

# STATUS (2026-06-13 — Phase 1 canonical single-currency: I-821 + I-131 now read CanonicalField[]; PR on validation/forms-field-by-field, NOT merged)
- PHASE 1 CANONICAL SINGLE-CURRENCY complete on `validation/forms-field-by-field`. All four canonical consumers now read ONLY `CanonicalField[]` via `fieldAccessor`/`adapterContract` — no legacy DTO pass-through for document-derived fields: **Translation** (PR #114, merged), **I-765** (PR #114, both TPS+EAD mappers), **I-821** (new `i821DocumentMapper.ts` + `i821DocumentBoundary.ts`), **I-131** (new `i131DocumentMapper.ts` + `i131DocumentBoundary.ts`). This closes the Phase 2B partial-cutover gap where I-821 and I-131 were still reading `TPSAnswers`/`ReParoleAnswers` directly. Duplicate logic removed: `normalizeCountryOfBirth` out of I-821 mapper (moved to boundary), A-Number normalization unified into canonical mappers, I-131 gender inversion fix baked permanently into `i131DocumentMapper.ts`. Thin compatibility boundaries (`i821DocumentBoundary`, `i131DocumentBoundary`) remain until TPS/Re-Parole feed a real `CanonicalDocumentResult` from arbitration. 18 new parity tests (`i821i131DocumentMapper.test.ts`) covering A-Number normalization, DOB formatting, sex checkbox logic (I-821 standard + I-131 inverted), port-of-entry split, absent-field no-op. EVIDENCE: tsc 0, 3474 pass / 18 skip / 0 fail, PII gate CLEAN. PR open on `validation/forms-field-by-field`, NOT merged. NEXT after owner GO: merge and start Phase 2 planning (owner decision).

# STATUS (2026-06-13 — Phase 2B FORM FIELD-BY-FIELD validation integrated; PR open, NOT merged)
- PHASE 2A DEPLOYED (main 4d3e470, PR #115). PHASE 2B field-by-field I-821/I-131/I-765 validation done on `validation/forms-field-by-field` (base 4d3e470): 4 agents in isolated worktrees + coordinator. Editions footer-locked & re-verified per page (I-821 01/20/25 ×13, I-131 01/20/25 ×14, I-765 08/21/25 ×7) — official == repo, independently audited. **SEVEN real form-mapping defects found + fixed** (this is the payoff of going field-by-field): **I-131 GENDER INVERSION** — AcroForm widget index is reversed vs the visible Male/Female labels (Gender[0]=/F, Gender[1]=/M), so every male applicant got the **Female** box checked (and vice-versa) — fixed to target by on-value; **A-Number silently dropped** on I-131, I-765, AND I-821 (maxLength=9 cells reject "A"-prefixed/dashed numbers → blank on the officer-facing PDF) — fixed with a 9-digit normalizer in all three; **SSN silently dropped** on I-131 (same maxLength cause); **I-821 fabricated DOB** written into "Other Dates of Birth Used" + **other_names written into the "Countries of Residence/Citizenship" cells** (wrong-question / fabrication) — remapped to the correct Item 2/3 cells. Each fix has a synthetic no-PII regression test. Independent PDF audit (pdftoppm render + pdf-lib extraction) AUDIT_PASS after integration; the phase-B re-run CAUGHT the audit's own gender assertion encoding the old bug → corrected to on-value. EVIDENCE: tsc 0, full suite 3456 pass/18 skip, build, knowledge, 0 tracked PII. HONEST FLAGS (NOT fixed — out of mapper scope, owner decision): I-821 Part 7 felony-question wizard↔PDF label drift (safe on the default all-No path; audit before enabling non-default Part 7 answers); over-length address/USCIS-account input is silently dropped by pdf-lib maxLength (UI-validation concern, truncating would corrupt a legal value). PR open, NOT merged. NEXT after owner review: owner decides on the two flagged follow-ups; no new direction.

# STATUS (2026-06-13 — Phase 2A REAL-DOC VALIDATION deployed via PR #115)
- PHASE 1 CUTOVER DEPLOYED to prod (main 0561600, PR #114). PHASE 2A REAL-DOC VALIDATION done on `validation/real-doc-expansion` (base 0561600): the deployed central brain validated on real private docs (4 agents in isolated worktrees + coordinator). ONE real defect found + fixed: **country code `/UKR` leaked into `city_of_birth`** (KNOWLEDGE_WRONG) → new `stripCountryCode` in transliterationPolicy + knowledgeNormalize, synthetic regression test. **Validated on the owner's real international passport** (owner supplied the image 2026-06-13 → GT now VERIFIED): family_name/given_name/passport_number/dob/expiry all SAME (controlling Latin verbatim), `no_country_leak=SAME` (the /UKR fix), sex→Male correct, 4-page set fabricates no identity, full consumer parity. EAD: all 5 owner-verified fields SAME, a_number≠card_number, I-765 golden parity PASS. Internal passport: family/given/dob SAME, patronymic EMPTY = reader coverage (proven NOT a cutover regression). I-94 / birth-cert / military: some DIFFERENT reads but ALL review-gated (READER quality, not cutover defects — no FABRICATED, no REVIEW_LOST anywhere). Independent cross-product audit AUDIT_PASS (every consumer SAME vs Core; 0 mutation/fabrication/review-loss/C3-resurrection/silent-fallback). Form-edition lock: I-821 01/20/25, I-131 01/20/25, I-765 08/21/25 — all EDITION_MATCH current official (SHA differs only by repo XFA-strip; not a stale edition). EVIDENCE: tsc 0, full suite 3410 pass/15 skip, build, knowledge, 0 tracked PII (self-caught + fixed owner-name in 2 harnesses). HONEST: I-94/birth/military read accuracy is review-gated, not perfect; intl-passport GT now verified, booklet/marriage/divorce GT still MISSING. Validation PR open, NOT merged. NEXT after owner review: Phase 2B field-by-field I-821/I-131/I-765.

# STATUS (2026-06-13 — Phase 1 CUTOVER integrated; deployed via PR #114)
- PHASE 1 CENTRAL-BRAIN CUTOVER integrated on `architecture/complete-canonical-cutover` (base 162634a). The three gaps are CLOSED: (1) **Translation** has no legacy bypass — the fallback now runs the SAME arbitration pipeline (candidates→knowledgeBrain→buildCanonicalResult→toTranslationRows) and is marked `fallback_used`/`core_path`; on Core success the legacy reader is never reached. (2) **TPS** does not reprocess canonical values on `coreStatus==='ok'` — postExtractNormalize skips re-translit/oblast/city/name normalization for `canonical_core` fields (formatting-only date→ISO retained); the R1B MRZ name-stability override is gated OFF on Core success (coordinator fix — it would have mutated controlling-Latin names); PII-heavy diagnostics removed from client JSON. (3) **TPS and EAD** use ONE shared canonical I-765 document mapper (`lib/canonical/forms/i765DocumentMapper.ts`, golden-PDF parity PASS); country normalization moved out of the PDF mapper to a per-product boundary. Re-Parole already respects C3 (foundation). 4 agents in isolated worktrees + coordinator integration (order 1→2→3→4, gate after each). EVIDENCE: tsc 0, full suite 3384 pass/4 skip, build, knowledge 35+26+36+13, E2E 13/0, golden I-765 parity, post-canonical mutation detector, cross-product parity, explicit-fallback, 0 tracked PII (self-caught + fixed one surname-in-comment leak). REAL-DOC GATE (live, redacted): internal passport family_name=SAME, given_name=SAME vs owner-VERIFIED GT, no FABRICATED/REVIEW_LOST (patronymic/dob EMPTY = single-page booklet-vision reader coverage, not a cutover regression). HONEST SCOPE: full 5-doctype verified-GT live run is a follow-up — verified GT exists for internal passport + birth certs + military; intl-passport/I-94/EAD GT pending. Final PR opened, NOT merged (awaits owner GO). Legacy fallback remains ONLY for explicit technical Core failure and is always marked.

- PHASE 1 (Agent 1 base): froze the canonical contract — fieldAccessor (exact C3 value semantics: rejected→null no-fallback, finalized→finalValue, not-finalized→normalized??raw), keyAliases registry (mechanical), adapterContract (dumb-mapper engine), buildCanonicalResult (one wrapper for all 4 products). Additive; 9 contract tests pass. BASE for agents 2-4.

- CI PII gate is now FAIL-CLOSED: a missing/empty OWNER_PII_PATTERNS_B64 on CI is exit 1 (not skip) — a security gate must not silently disable itself. Local opt-out only via ALLOW_MISSING_PII_SECRET=1. Added a synthetic-marker self-test step (proves the grep fires). mktemp 0600 + trap cleanup; logs only file:line.

- CI gate hardened: exact PII patterns are NOT stored in the repo — they live in the GitHub secret OWNER_PII_PATTERNS_B64 (base64 of a gitignored .pii-patterns). The workflow decodes to a temp file, greps, deletes it, and logs only file:line (value redacted). Old hardcoded master-email guard removed. Owner-context geography scrubbed from session docs (kept in dictionary/gazetteer).

- SECURITY: PII emergency sweep — scrubbed owner real PII (name, passport FU→AA000000, A#/I-94#/EAD#, email, DOB) from ~190 tracked files → fake placeholders (IVANENKO/TARAS/owner@messenginfo.test). Removed 6 tracked .log + the live-doc harness + a .swp. Added CI gate "Block real owner PII" + .gitignore *.log/*.swp. Geo place names (Kyiv/Boryspil) LEFT — real gazetteer data, weakly identifying; replacing would break the dictionary. tsc 0/build/3287 — sweep broke nothing. Tag stable-2026-06-12-morning at 54c0e43.

- ARCHITECTURE: wrote docs/architecture/UNIFIED_ARCHITECTURE_PLAN.md — complete target model (one spine for TPS/Re-Parole/EAD/Translation), gap table, order/pricing model, 7-phase build plan. Design only.

- Ran the owner's REAL documents through the live pipeline (real Gemini key in apps/web/.env.local, real images in qa-shots/private + test-fixtures/real-docs) via a gated harness `liveRealDocs.test.ts` (RUN_LIVE_DOCS=1). This is now the repeatable real-doc verification (the owner was right — we HAVE his docs + key).
- INTERNATIONAL PASSPORT — all 3 bugs FIXED + verified on his real passport: (1) given_name TARAS (was TARAS) — bilingual `script:'mixed'` docs now prompt the model to return the printed LATIN romanization, and the policy keeps an already-Latin name VERBATIM (controlling-Latin rule, never re-transliterate ТАРАС→Taras). (2) sex Ч/М → Male (the 'sex' case now splits bilingual "Ч/M"). (3) place "КИЇВСЬКА ОБЛ./UKR" → "Kyiv Oblast" (place_city strips the /UKR country code and routes obl./область to the oblast normalizer; JS \b doesn't work on Cyrillic — matched directly). Final: IVANENKO / TARAS / AA000000 / 1990-01-01 / Male / Kyiv Oblast / 2019-02-22 / 2029-02-22 — all correct.
- 4-PAGE PASSPORT "вообще 0" FIXED + verified: the deadline regression (each page capped at 40s was too tight) is resolved — page 1 of the real 4-page booklet now reads in 14s (Ivanenko/Taras/Boryspil/Kyiv Oblast). Route Core read: timeoutMs 85s TOTAL deadline + attemptsPerModel:1 (slow primary doesn't burn the budget; falls back to flash). Pages 3-4 honestly return little/0 (no fabrication). The cross-page arbiter takes the earliest (correct) page.
- Real soviet birth cert also verified: reads fully via flash fallback, no fabricated oblast. Handwritten birth cert still >85s (genuinely hard, not a regression).
- tsc 0/build/3288 web + knowledge 35+26+36+13 pass.
# STATUS (2026-06-12 — owner real-doc test: oblast-fabrication + 4-page-passport=0 fixes)
- Owner tested a REAL birth cert (names/patronymics/ЗАГС/series all CORRECT now — the anti-Russification + dictionary fixes work) + a 4-page passport. Two bugs found + fixed:
  1. OBLAST FABRICATION: the separate `province_of_birth` field I added to the birth cert made the model INFER/fabricate an oblast (owner: "придумал… заготовленную область"). REMOVED `province_of_birth` from the birth registry + `oblast_of_birth` from the birth schema + the dead alias. The oblast, when present, is part of the place-of-birth line; not a standalone field.
  2. 4-PAGE PASSPORT = "вообще 0" (root cause via diagnostic agent): `timeoutMs` in geminiVisionProvider was PER ATTEMPT, and the fallback chain is 3 models × 2 attempts → one page could run up to 240s; 4 pages read in PARALLEL blew the route's 60s maxDuration → the function was killed → ZERO fields (1-page birth cert was fine). FIX: made `timeoutMs` a single TOTAL DEADLINE across the whole fallback chain (each attempt gets the remaining budget; loop stops when <3s left). Raised route maxDuration 60→120 for multi-page headroom. Strengthened the orientation prompt (handwritten booklet shot in portrait — "never return can_read=false just because the text is sideways").
  tsc 0/build/3288 pass. Owner to re-test the passport.
# STATUS (2026-06-12 — FINISH: passport completeness + modern-rename safety + OSD removal)
- PASSPORT COMPLETENESS (загран/ID/booklet): added Sex, Place of birth, Date of issue to all 3 (booklet already had place). Sex done PROPERLY via a new FieldKind 'sex' (toCanonicalValue maps Ч/Ж/M/F → Male/Female via SEX_MAP; added Latin M/Male/Female), not a fragile text path. NOT added: citizenship/nationality (no normalizer → would be half-broken) and issuing-authority code (a number on intl/ID, not an org). Verified: all 3 passports render HOLDER (name/sex/place) + DOCUMENT (number/dates).
- MODERN-RENAME SAFETY (silent-substitution bug from the dictionary audit): Дніпропетровськ→Dnipro / Кіровоград→Kropyvnytskyi was a silent overwrite based on a doc-class flag, not the document DATE → era-wrong on pre-rename docs. Now a renamed city PRESERVES the historical read + flags REVIEW with the modern name as a suggestion (operator decides). Honors CLAUDE.md "preserve historical, do NOT modernize" + no-silent-substitute. OCR-fix corrections (no rename) still auto-apply.
- OSD AUTO-ROTATE REMOVED (not just disabled): deleted the broken Tesseract-OSD code (wrong rotation direction) + the tesseract.js import + the 2 osd-verify dev scripts. Kept the manual rotateImage90 button. prepareImageForUpload is now downscale-only. Orientation handled by the vision reader.
- Verified the FULL SET: all 9 UA doc mirrors render as finished structured English documents (5 certs + military + 3 passports), omitted fields → honest [enter from document]. tsc 0/build/3288 web + knowledge 35+26+36+13 pass.
# STATUS (2026-06-12 — REGRESSION FIX: fabrication + orientation + Russification (owner-reported))
- Owner reported translation recognition got WORSE (invents fields, orientation terrible 1/10, still Ukrainian-as-Russian). Zero-trust audit (4 agents) confirmed ALL THREE were caused by my own recent commits. Reverted/fixed:
  1. RUSSIFICATION: 5a94b2b had SOFTENED the reader LANGUAGE prompt (the load-bearing anti-Russification guard) into a permissive "script-aware" rule → model over-read Ukrainian as Russian. REVERTED to the strong 46ebcc2 rule ("UKRAINIAN-issued… do NOT convert to Russian"). Also re-gated the always-on RU transliteration routing back behind RU_TRANSLIT_ENABLED (was amplifying bad reads).
  2. ORIENTATION: my autoRotate.ts OSD had a WRONG rotation DIRECTION (Tesseract OSD returns the counter-clockwise correction; code applied it clockwise → 90°/270° phone photos rotated 180° wrong, confirmed vs tesseract.js source) + a confidence threshold on the wrong scale. DISABLED client OSD auto-rotate by default (prepareImageForUpload autoRotate default false; TranslateWizard passes false) — the vision reader rotates mentally at read time on the undamaged original. Manual rotate button unaffected.
  3. FABRICATION: I expanded the extractor field set (~30 new fields) → vision prompt asks for many fields → list-completion pressure → model invents absent ones (anti-fab gates are OFF in prod). HARDENED the prompt with an explicit "ABSENT FIELDS ARE NORMAL → can_read=false, NEVER invent, do NOT assume citizenship" clause. CUT spouse `citizenship` (kind:text, zero validation, always guessed "Україна") from marriage registry+schema+aliases.
  tsc 0/build/3286 pass.
- P1 DICTIONARY (gazetteer review inflation — blocked the pay button on legit small towns): (a) a genuinely-unknown town (reason 'unknown_geography', not a fuzzy near-match) is now ACCEPTED (KMU-55 transliteration) instead of forcing review — our seed gazetteer is ~500 of 28k+ settlements. (b) tightened the fuzzy matcher with an ABSOLUTE distance cap (≤2): the ratio threshold alone let a 9-letter name match a DIFFERENT village sharing a suffix (Кудашівка→Жданівка dist 3, Зачепилівка→Решетилівка dist 3.4) → wrong suggestion + review; real OCR confusions are ≤1 (Простянець→Бориспіль 0.4). Now distant reads are accepted as-is, no wrong suggestion. tsc 0/build/3288 pass.
- NOT fixed (needs owner decision, documented): the modern-rename silent overwrite (Дніпропетровськ→Dnipro, Кіровоград→Kropyvnytskyi) fires on a doc-class flag not the document DATE → can be era-wrong on a pre-rename document; honoring "preserve historical, do NOT modernize" needs date-gating or making it a review-suggestion.
# STATUS (2026-06-12 — birth cert mirror COMPLETE: oblast + series + act-record-date now extracted)
- BIRTH CERT completeness: the live registry emitted neither oblast, series, nor act-record-date (all VISIBLE on the cert) → those mirror lines were always blank. Added `province_of_birth` (→oblast_of_birth, alias existed), `certificate_series_number` (→series_number, alias existed), `act_record_date` to the birth documentRegistry entry + `act_record_date` to the birth schema. All handwritten:true → review. Verified: birth mirror now fills Region (Oblast), Act record date, Series and No. tsc 0/build/3286 pass.
# STATUS (2026-06-12 — MIRROR passports LIVE: all 3 UA passport types registered)
- PASSPORTS LIVE: registered the 3 staged passport schemas (internal booklet, international, ID card) into OFFICIAL_SCHEMAS — PASSPORT_SCHEMA_RENDERER_ENABLED flag RETIRED (was the staging gate). Schema keys already matched documentRegistry exactly (no aliases needed); SUPPRESSION INVARIANT preserved (MRZ/personal_number/rnokpp never declared). International passport + ID card use the printed LATIN name verbatim (translationRule locked_verbatim → controlling-Latin rule, no re-transliteration); booklet transliterates KMU-55. Added GROUP_TITLE holder/document; genericized the seal/signature lines (was "head of the civil-registration body" — wrong for a passport → "issuing official"). Added all 3 to MIRROR_READY_DOCTYPES. Updated 6 tests that pinned the old staged-OFF behavior. Verified each by rendering PNG/text. tsc 0/build/3289 pass.
- 8 of 9 UA document mirrors now LIVE (5 certificates + military ID + 3 passports). Remaining: enrich passport extraction (place/sex/nationality/authority not yet read for international/ID) is optional follow-up.
# STATUS (2026-06-12 — MIRROR complete for ALL 5 UA civil certificates per KMU 1025)
- ALL 5 certificate mirrors LIVE + complete (birth, marriage, divorce, death, name-change). Divorce: split composite spouse_*_full_name → groom/bride surname/given/patronymic + surnames-after + date_of_dissolution + act_record_date + series + date_of_issue. Death + name-change had NO documentRegistry entry (→ 100% blank) — ADDED full entries (death: deceased split + DOB/date-of-death/place; name-change: previous_* + new_* split). All schemas enriched with act_record_date + date_of_issue; renderer group titles added (NAME BEFORE/AFTER CHANGE). Aliases spouse_1→groom/spouse_2→bride, date_of_divorce→date_of_dissolution, issuing_authority→place_of_registration, certificate_series_number→series_number. UI labels added. All registry fields handwritten:true → always review (no silent-wrong). Added all 5 to MIRROR_READY_DOCTYPES. Verified each by rendering PNG/text — every section fills, no dup, no ADDITIONAL ENTRIES dump. tsc 0/build/3289 pass.
- OWNER GATE (per type): real-document end-to-end test (pay→operator→PDF). New extraction fields all default to review, so a wrong read can't ship silently.
# STATUS (2026-06-12 — MIRROR marriage cert LIVE: full HUSBAND/WIFE structure per KMU 1025)
- MARRIAGE MIRROR complete + LIVE (added to MIRROR_READY_DOCTYPES). Root cause was the SAME class as birth + worse: the live reader (documentRegistry) emitted COMPOSITE `spouse_1/2_full_name` the split schema (groom_surname/given/patronymic…) couldn't consume → only 4/20 fields filled. Fix: split the registry into the full official blank — husband+wife each Прізвище/Ім'я/По батькові/ДН/місце/громадянство, surnames-after, act record №+date, registration office, series+number, date of issue (ALL handwritten:true → always review, no silent-wrong). Added matching schema field `act_record_date`; removed the duplicate `issuing_authority` schema line (office reads into the official "Place of state registration"). Aliased spouse_1→groom / spouse_2→bride + certificate_series_number→series_number. Added UI labels for all split keys. Verified by rendering the full marriage PNG — every section fills, NO ADDITIONAL ENTRIES dump, no dup; "Wife's surname after marriage" correctly NOT collapsed against the husband's identical surname (validates skipping value-dedup). tsc 0/build/3286 pass.
# STATUS (2026-06-12 — mirror cross-cutting: no-missed-lines (ADDITIONAL ENTRIES) + mixed-script routing)
- NO MISSED LINES: `collectMirrorExtras` surfaces any extracted field with a value but NO schema slot in an "ADDITIONAL ENTRIES" section (marked [CONFIRM]) instead of silently dropping it. Verified: marriage's composite spouse_1/2_full_name now appear there (were dropped); a fully-mapped birth cert produces ZERO extras (no behavior change). Deduped against shown values (never repeats a labeled value; never collapses two people sharing a surname).
- NO DUPLICATION: confirmed already STRUCTURAL — each extracted field resolves to exactly ONE schema key (`alias[f.field] ?? f.field`); value-based dedup deliberately NOT added (would wrongly blank legit shared surnames).
- MIXED-SCRIPT (owner-directed): (a) reader prompt now script-aware — transcribe each line in the language printed, don't Ukrainize genuine Russian/English (apostilles/stamps) and don't Russify Ukrainian. (b) transliterationPolicy ALWAYS routes a clearly-Russian name (ы/э/ё/ъ present, no і/ї/є/ґ) through the Russian table (KMU-55 can't map those letters) — no flag, unambiguous. The 'unknown'-script REVIEW escalation stays flag-gated (forcing review on every distinctive-letter-less Ukrainian surname = owner decision, avoids friction). tsc 0/build/3285 pass.
# STATUS (2026-06-12 — HOTFIX: birth mirror place-of-birth regression + mirror architecture audit)
- HOTFIX (self-inflicted regression in 9fd4abc): the LIVE translation path keys fields by `documentRegistry.ts` (birth emits `place_of_birth_city`), NOT `documentContracts.ts` (TPS path, emits `city_of_birth`). 9fd4abc replaced the alias `place_of_birth_city→place_of_birth` with `city_of_birth→...` based on the wrong contract → Place-of-birth went BLANK on the live birth-cert mirror. Fix: alias BOTH keys → place_of_birth. Tests now pin the LIVE key + both contracts. tsc 0/mirror tests pass.
- ARCHITECTURE AUDIT (3 parallel agents) for the owner's "no missed lines / no dup lines / mixed-script" ask: (1) live extraction = documentRegistry (documentFieldReader drops any key not in it); the *.module.ts files are DEAD (draft→manualReview). (2) marriage/divorce emit COMPOSITE names (spouse_1_full_name) the split schemas can't consume → 4/20 marriage fields fill. (3) death + name-change have NO registry entry → 100% blank. (4) mixed-script: RU_TRANSLIT_ENABLED OFF → Russian names KMU-55'd wrong + reader prompt forces Ukrainianization. (5) no catch-all for extracted-but-unmapped fields → silently dropped. (6) issuing_authority can dup under place_of_registration+issuing_authority on marriage. Build plan staged next.
# STATUS (2026-06-12 — MIRROR translation LIVE for birth certificate: finished structured English document)
- MIRROR TRANSLATION (2nd keystone): birth-cert now outputs a FINISHED structured English document (UKRAINE header, emblem placeholder, CHILD/PARENTS/ACT RECORD/STATE REGISTRATION sections, seal+signature placeholders, 8 CFR cert naming the document + signed date, KMU 1025 source citation) — NOT the old flat field table. Infra was 90% built-but-dark; turned ON for birth cert only via MIRROR_READY_DOCTYPES allowlist (no env flag), fail-open to generic PDF. Fixed 2 alias bugs that silently blanked Place-of-birth + Series: extractor emits `city_of_birth`/`certificate_series_number`, mirror expected `place_of_birth_city`/`series_number`. Old tests encoded the bug (used place_of_birth_city) → updated to real keys + added render regression. signedAt threaded → cert shows real date. Other doc types still gated on MIRROR_PDF_ENABLED=1 (divorce/name-change sparse). tsc 0/build/3278 pass. Verified by rendering PDF + eyeballing PNG.
# STATUS (2026-06-12 — dictionary SAFETY NET: crash-isolation + fuzz + knowledge-tests-in-CI)
- BUGFIX (owner-reported): dark-mode "white patch, invisible text" on selecting a doc-type in the translator = --accent-light token undefined → fixed near-white fallback used in both themes. Defined --accent-light in globals.css (light 0.12 / dark 0.28 translucent accent). 13 wizard spots fixed at once. tsc 0/build.
- UX: wizard processing screen shows a "taking longer, keep page open" reassurance after ~15s (35-80yo don't close the tab). Additive. 3169 pass.
- PHASE 2 QUARANTINE: deleted lib/engine/ (12 mods+10 tests), central-brain analyze()/types/audit/MIGRATION_STATE (index now only brainHealth), dead api/ocr routes, TPSWizard v1, transliterateKMU2010. Added no-engine-revival guard test. HELD: api/translation/extract (owner-confirm), lib/tps/transliterate (live). tsc 0/build/3169 pass. Validated incl scripts/+.github.
- DESKTOP: DesktopStepSidebar contrast (current/future step) fixed. All other survival fixes are responsive (desktop+mobile both). 3229 tests.
- HOTFIX: restored ticketEscalation.ts + guardBlockRate.ts (b5d627b deleted them as "dead" but scripts/monitoring/* import them → 3 cron jobs failed). tsc 0/13 tests. Lesson: dead-code scan must include scripts/ + .github.
- DEPLOYED to prod (messenginfo.com @ main 0ba35db): survival 1B/1C/3A/3B/content all LIVE, smoke-tested green (health truthful, info→start 307, nav 200).
- SURVIVAL 3B-FUNNEL: tps-ukraine + re-parole-u4u bare routes now redirect to /info (price/FAQ/how-it-works) not straight to /start; info pages have Start CTA. Landing+pricing were unreachable before. tsc 0/build/3216.
- SURVIVAL CONTENT: removed banned wording — "сертифицированный перевод" (TPSWizardV2) + "Консультації" (uk.json ×2). tsc 0/3216 pass.
- SURVIVAL 3B-LINKS (nav): removed /sign-in 404, Check-Status→our tracker, #sources fixed (header+footer), dropped duplicate Supported-Docs + fake footer lang-switcher, mobile Status→our tracker. tsc 0/build/3216 pass. Remaining 3B: 4-pillar registry nav + info→start.
- SURVIVAL 3A (visual): ::selection defined (highlighted text readable in dark — owner's main complaint), font tokens wired in @theme (Inter/Playfair, no more system-ui split), Playfair+cyrillic, contrast fixes: button hover / MemberTabs / MobileBottomBar / 9px arrow / TrendingTopics pill hover / Screen12 copy-box / ContactSection. tsc 0, build clean, 3216 pass. Remaining 3A (future): full dark-token migration (drop override hack), text-xs on content.
- BRANCH survival/phases-0-3 (NOT pushed — push=prod auto-deploy; main pinned to prod 54c0e43). Phase 0 operator-flow pre-check = PASS (code-ready; owner manual test still the gate).
- SURVIVAL PHASE 1 (partial): (1B) reviewGate soft-confirm — a passport field flagged ONLY critical_no_mrz_anchor (with a value) is one-click SOFT confirm in wizard, not a hard pay-block; server assertReviewGate stays strict (operator certifies). Fixes the grey-button for ALL passports incl booklet. (1C) central-brain/health no longer lies "migrated/engine consensus" → active_core=docintel/canonical, engine=inactive. tsc 0; reviewGate 24/24; central-brain 7/7. PENDING 1A: MRZ→translation (auto-resolves intl passport/id-card).
- (prior, also on branch) dead-code removal b5d627b: L2 runner + 7 dead documentSafety modules (certifierAuthority/deepseekBoundaryGuard/guardBlockRate/handlePaymentFailure/paymentFailureTriage/ticketEscalation/persistCertifierAudit) + 13 test files DELETED. certifierOverrideApply + paymentFailureRouteAdapter = no-op stubs (operator-flow supersedes). tsc 0, 3208 tests pass, build clean.
- PII SWEEP COMPLETE (3 phases): source (99 files) + active code/scripts/prompts + historical docs (12 files). git grep = 0 hits on all tracked files except docs/reports/ (owner pending) and guards.yml (detection rule, intentional).
- OWNER PENDING: Phase 0 result ($1 test flow). docs/reports/ PII decision (A: replace/B: mv qa-private/C: delete).

# STATUS (2026-06-10 — synthetic L2 fixture pack + runner smoke-test + GH-secrets doc)
- L2 ACTIVATION-ENERGY LOWERED: 3 synthetic worked-example fixtures (examples/: passport baseline + 2 adversarial silent-substitution/cyrillic-in-output) in the EXISTING GroundTruthFixture format (independent deviation from prompt's parallel schema, reconciled via `_`-doc keys). l2RunnerSmoke.test.ts (+5) runs the REAL runner end-to-end → INSUFFICIENT_N + broken-reader false-finalization caught. docs/ops/SETUP_GITHUB_SECRETS.md (drift-guard activation). HOWTO pointer added. PII audit: 0 real (synthetic only). 3203 passed, tsc 0, guard 0. OWNER: copy the 3 shapes → ≥30 real docs/class incl ≥3 adversarial; or L1 baseline. No further agent value without owner deliverable.
- PARITY: supabase db diff --linked NOT runnable here (Docker down + CLI linked to wrong project). MCP-introspection parity instead (columns/types/5 constraints/8 indexes/triggers/fn/RLS/policy/comments) → structurally identical, ONLY 6 missing COMMENTs (gap a) → added verbatim to both migration files. ORPHANS: 0 active-code (recordGuardBlock uses new schema; failure_type matches = legit TS enum or historical docs) → none rewritten. CHECKLIST: +WHERE-each-var-lives (Vercel vs GitHub) + manual-trigger note. CI DRIFT-GUARD added (.github/workflows/supabase-drift-check.yml, daily, graceful-skip until 3 Supabase secrets set). guard 0. OWNER: optional canonical CLI diff (local Docker); set 3 Supabase secrets to activate drift-guard.
- 2026-06-11 OPERATOR FLOW CODE-COMPLETE — ENABLED in prod 2026-06-11 (flag=1 + OPERATOR_SIGNER_* set): pay→queue→/order/[id]→admin PDF email. Pending: mentor migration (operator_completed CHECK), owner $1 real test + flag-on decision (needs OPERATOR_SIGNER_NAME/ADDRESS envs).
- 2026-06-11 PIVOT Phase 1 SHIPPED: 504=parallel pages; unread fields backfilled (patronymic visible as manual-entry); review copy softened. OPEN: operator-flow Phases 2-4, PII sweep in 6 test files. смт preservation SHIPPED (source-driven designator re-add).
- 2026-06-11 MIGRATION-EXEC: passport migration steps A-D CODE-COMPLETE (PASSPORT_SCHEMA_RENDERER_ENABLED + DUAL_RENDER, both default OFF = byte-identical; snapshots; visual-diff artifact). /admin/status dashboard live (owner-only). Runbook + validation checklist + owner takeover doc. Agent-цикл ЗАВЕРШЁН — остались owner-actions (checklist/baseline/GT/3 decisions) + mentor (canary review, L2 verdict, threshold calibration). (hotfix: <a>→<Link> в /admin/status — build-блокер ESLint) Deploy: webhook-miss на хотфиксе → retrigger. Telegram: DROPPED by owner.
- 2026-06-11 FINAL-CLOSURE: 3 passport schemas BUILT NOT REGISTERED (registration = live PDF switch, pinned by test; migration plan in docs/ops/PASSPORT_SCHEMA_MIGRATION_PLAN.md). HEIC (iPhone) WORKS end-to-end via heic-convert WASM (sharp HEVC = dead code, removed): vision-extract intake + upload→storage-as-JPEG + preprocess step-0 (TPS/EAD/Reparole fixed centrally); 6/6 real-decode tests. Footer→Supported Documents (4 locales) + formats note + 4 FAQ. 3241 passed/tsc 0. OPEN: owner iPhone re-test (catalog + HEIC); schema registration only via migration plan.
- REPO↔PROD SYNC: reconstructed the 2 new-table migrations from the LIVE schema (pg_get_* exact), deleted my conflicting dup. Honest note: 4-step history can't be byte-replayed from introspection → FINAL-STATE files + `db pull` for CLI-exact. Path B (certifier_id FK dropped): code already accepts arbitrary uuid — VERIFIED LIVE (placeholder uuid insert+rollback ok). Added .env.example (OWNER_CERTIFIER_ID + 6 flags OFF) + docs/ops/L1_T0_ACTIVATION_CHECKLIST.md (Step0→4). +1 test (3198 passed, tsc 0, guard 0). OWNER: OWNER_CERTIFIER_ID (placeholder ok) → GUARD_BLOCK_METRICS_ENABLED 14d baseline → calibrate threshold → REFUND_AUTOTICKET → (post L2 PASS) audit+override canary. Keystone = L2 fixtures + adversarial.
- L3 T0 receiver: persistCertifierAudit.ts (behind CERTIFIER_AUDIT_PERSIST_ENABLED OFF) maps to owner's REAL certifier_override_audit schema + satisfies all 5 CHECK constraints in code (verified by live BEGIN/INSERT/ROLLBACK). Wired into certifierOverrideApply (async; route awaits). recordGuardBlock FIXED to owner's real guard_block_events schema (gate_type/reason_code/field_name/would_block/uuid) — repo migration realigned. +adversarial fixtures (6-category, ≥3/class) in L2_FIXTURES_HOWTO. +16 tests (3197 passed, tsc 0, guard 0). 2 FINDINGS: (1) guard_block_events schema differed (fixed); (2) certifier_id FK→profiles + profiles EMPTY → T0 persist fails until owner creates a profile + sets OWNER_CERTIFIER_ID (or relaxes FK). OWNER: resolve certifier_id FK; L2 fixtures incl adversarial [keystone]; L1 activation.
- L2 CODE-COMPLETE end-to-end: groundTruthFixture.ts (owner format w/ expected:null=must-not-finalize + validator + scorer folding false-finalization into critical_wrong) + runFixtureBenchmark.ts (DI-predict runner → per-class verdict + PII-free summary) + classVerdict.ts (INSUFFICIENT_N/zero-tolerance/locked thresholds/canary gate) + synthetic example + docs/L2_FIXTURES_HOWTO.md. +9 tests (3186 passed, tsc 0, guard 0). ONLY remaining = owner fixtures+keys (the run). Session: L0/L1/L2 agent-cores all code-complete, ~80 new tests. Binding constraint = OWNER: L2 fixtures (keystone ~8-16h) + L1 activation. Then L0 prod wiring → D5 UI → L3. HTR last.
- L2 RUNNER CORE: classVerdict.ts (evaluateClassBenchmark → INSUFFICIENT_N at N<30, FAIL on any silent wrong-critical, PASS at LOCKED per-class threshold) + canaryDeployAllowed (PASS ≤7d). Thresholds from GT_BENCHMARK_EXIT_CRITERIA (passport .99/military .98/birth-marriage-soviet .97). +7 tests (3177 passed, tsc 0, guard 0). Extends existing scoreAgainstTruth (per-doc). OWNER-BLOCKED: GT fixtures (35-49 docs, encrypted, gitignored). NOT wired: CI canary-gate (would block all deploys until first PASS; activates Phase 3). PHASES: L1 code-complete (owner activation pending); L2 core done (fixtures pending); next = L0 wiring after L2 PASS / D5 UI / L3.
- L1 INFRA complete (built via 2 mapping agents, by-the-book): guard_block_events migration (+ manual_review_queue escalation columns); recordGuardBlock write-hook behind GUARD_BLOCK_METRICS_ENABLED (OFF=no-op), wired at 2 guard points; 3 cron scripts (escalation-tick */30, daily-reconciliation 6:00, guard-block-rate-check hourly) calling the TESTED pure logic; owner-alert Telegram helper; 3 GH workflows. ALL additive + measurement-gated (no prod change until owner enables). 3170 passed, tsc 0, scripts typecheck, guard 0. OWNER to activate: apply migration → set GH secrets → GUARD_BLOCK_METRICS_ENABLED=1 for baseline (14d rec) → set GUARD_BLOCK_RATE_THRESHOLD → REFUND_AUTOTICKET_ENABLED canary. Item-3 handwriting counter blocked on ADDITION-C signals. After-L1=L2 (owner fixtures).
- ACCEPTED reframe: handwritten-Cyrillic translation ALREADY WORKS via human-in-loop; HTR = Phase-7 UX speedup, not unblocker. 7-phase plan accepted.
- L1-finish LOGIC built (pure, additive): ticketEscalation.ts (4h→12h→24h-digest, monotonic) + guardBlockRate.ts (window count + threshold-injected exceedsRate; uncalibrated=never-alerts). +13 tests (3168 passed, tsc 0, guard 0). REMAINING L1 = infra (DB+cron, measurement-gated): guard_block_events table + write hook; GH-cron workflows (escalation-tick/daily-digest/rate-check); 7-14d baseline → calibrate threshold; then REFUND_AUTOTICKET_ENABLED canary. Item-3 handwriting counter BLOCKED on ADDITION-C signals (don't fake). OWNER INPUT: baseline 7 vs 14 days (rec 14). After-L1=L2 (owner fixtures).
- L1 item-1 DOJATO: triage + DI orchestration + route-wired at 4 post-payment failure points (422/403/503/email) behind REFUND_AUTOTICKET_ENABLED (default OFF → byte-identical). paymentFailureRouteAdapter.ts binds 3 typed reuse utils; handler refactored to single escalateToOwner (notifyOwnerAlert is ticket-coupled). Enums extended (EmailType+='payment_failure_ack', ManualReviewReason+='paid_request_failed'). +20 L1 tests (3155 passed, tsc 0, guard 0). Verified twice. Flag OFF in prod (needs measurement + escalation/reconciliation first). REMAINING L1: escalation timer, daily reconciliation cron, item-2 rate-alert, item-3 handwriting counter. After-L1=L2 (owner GT fixtures).
- L1 item-1 LOGIC built (additive, byte-identical prod): paymentFailureTriage.ts (failure_type enum + per-type triage + 4 ack templates, owner-ruled) + handlePaymentFailure.ts (DI orchestration: best-effort, never-throws, PII-free, no money movement). +18 tests (3153 passed, tsc 0, guard 0). DI because the 3 reuse utils have strict typed enums — bind at route boundary, not by guessing (map-first verified sigs). REMAINING item-1: route adapters at 4 failure points behind REFUND_AUTOTICKET_ENABLED (OFF) + extend EmailType/ManualReviewReason enums. Then item-2 rate-alert, item-3 handwriting counter, escalation timer, daily reconciliation. Directives stand: STOP-on-ambiguity; after-L1=L2.
- OWNER FORWARD-DIRECTIVES in kickoff: STOP-on-ambiguity during L1 wiring (mentor-discussion, no guessing); AFTER L1 = L2 GT benchmark with owner fixtures (NOT HTR/new-classes — prioritization trap; dashboard numbers are an unknown baseline until L2); turnkey first step = failure_type enum + persistence table. L1 = fresh session straight to code.
- L1 FULLY SPECCED (fresh session = code): A-full per-type triage (422→correction / 403→review+manual / 503→retry3x+manual / email→resend) + 4 ack-templates routed by failure_type (owner caught: 1 template misleads 422 user-input → drafted ack_422_correction / ack_403_review / ack_503_retry / ack_email_resend, English, in kickoff) + escalation timer 4h/12h + daily reconciliation cron + SLA 24h CONFIRMED. Refund = manual via Stripe (irrecoverable/user-requested only); B deferred. Reuse: Resend, notifyOwnerAlert+Telegram, createManualReviewTicket+manual_review_queue, documentClassMetric, GH-cron. Premise verified (post-payment fails real, no refund code). Earlier: L0 backend done (+29 tests, flag OFF, byte-identical).
- L1 RULED: A-full + PER-TYPE TRIAGE (422 user-input→correction not refund; 403→review+manual; 503→auto-retry 3x then manual refund + owner-alert; email-fail→resend never refund) + customer ack-email + escalation timer (4h/12h) + daily reconciliation cron. Refund = manual via Stripe, only irrecoverable/user-requested. B (auto-refund) deferred. Customer SLA = 24h (agent-rec, owner confirms). All in docs/NEXT_SESSION_L1_KICKOFF.md. Paid-422 premise VERIFIED (post-payment: confirmed_value_guard 422 / 403 / 503 / silent email-fail; no refund code exists). TEMPO: fresh session for L1 (payment-route).
- OWNER RULED next = L1 (not D5 UI). Verified paid-422 premise (2 agents): CONFIRMED — confirmed_value_guard 422 / ocr_field_safety 403 / persistCertification 503 / silent email-failure all AFTER payment gate (line 124); certifier_override 422 is pre-payment (safe). NO refund code anywhere. L1 reuses existing infra (Resend, notifyOwnerAlert+Telegram, createManualReviewTicket+manual_review_queue, documentClassMetric, GH-cron pattern). docs/NEXT_SESSION_L1_KICKOFF.md written (refund+auto-ticket / rate-alert / handwriting counter). OWNER RULING NEEDED: refund = (A) ticket+manual [rec] vs (B) auto stripe.refunds. TEMPO: fresh session for L1 (payment-route sensitivity).
- L0 step 1 WIRED: certifierOverrideApply.ts (pure helper) + ONE guarded call in generate-pdf BEFORE the review check, behind CERTIFIER_OVERRIDE_ENABLED (default OFF → byte-identical prod). finalize→sets final_value+clears review; block (anchor conflict / user-alone-on-T1 / invalid)→422 pre-charge; every decision audited. +6 tests (3135 passed, tsc 0, guard 0). Verified twice (OFF skipped; ON correct). Flag NOT enabled in prod (needs D5 UI + measurement). NEXT: D5 UI (certifier picks reason_code + source side-by-side → sends override) → criticality live-swap (flag+measure) → L1.
- L0 PRIMITIVE LIVE-IN-CODE (additive, byte-identical prod): certifierAuthority.ts (fieldTier matrix + tier×reason matrix + evaluateCertifierOverride per LAW 2#5 + 12-field sha256 audit hook) + deepseekBoundaryGuard.ts (CHECKABLE LAW 7, throws on DeepSeek finalValue). +23 tests (TDD-anchor: user_clarified on T1 → reject). classifyCriticality marked superseded (fallback kept; removal would break 5 call-sites + change prod). 3129 passed, tsc 0, guard 0. Built via 4 parallel Explore agents mapping reality first; plan verified twice. NOT wired into live route yet (prod-behavior change → behind CERTIFIER_OVERRIDE_ENABLED + D5 UI next, measured). NEXT: route wiring (flag OFF) → criticality live-swap (flag+measure) → L1.
- NEXT SESSION = L0 certifier_override. Paste-ready prompt + checklist in docs/NEXT_SESSION_L0_KICKOFF.md. LOCKED docs @46efb8b (constitution + ADR-021 RULED). TDD-anchor test = reject user_clarified on TIER 1. Replace classifyCriticality substring (applyOcrFieldSafety.ts:48-51) with (field,doc_class)→tier matrix. SCOPE: gazetteer-history NOT in L0 PR — sequence AFTER L0 merge (TIER-1 place_of_birth reducer). Anti-drift: RULED docs, don't interpret/extend; ambiguity → STOP+ask.
- ADR-021 RULED v1: Q1 = 3 TIERS (T1 applicant-identity high-friction / T2 related+validity low-friction / T3 user_confirmed), per-doc-class lists. Q2 = ENUM 6 codes (+source_corroborated_user_value, +unreadable_per_source-as-refusal; user_clarified=T3-only). Q3 = parents=T2 + cross_doc_anchor_id. HTR = 15% + ALL 6 conditions (L1 closed, L2 PASS ≥3, post-L1 window, defined handwriting_field_failure, >15%, ADR-020). Agent additions accepted: (A) tier×reason_code matrix enforced in code; (B) anchor_id referent = applicant case key; (C) HTR cond-4 needs signals we don't emit (handwritten classifier + visual_evidence_score) → build those first. Audit hook LOCKED from commit 1. NEXT (agent L0): certifier_override (3-tier+matrix+hook) + criticality-per-doc-class-in-code + DeepSeek-lint; then L1.
- ADR-021 DRAFTED (docs/adr/ADR-021-delegated-certifier.md, v1-min): Q1 scope / Q2 enum reason-codes / Q3 parents=critical-low-friction — OWNER RULING PENDING. Audit-hook schema LOCKED from commit 1. certifier_override code BLOCKED until Q1-Q3 ruled (avoids rewrite). HTR THRESHOLD set in constitution: >15% handwriting failures / rolling 100-doc + ADR-020 locked → needs L1 handwriting-failure counter (absent today). NEXT ORDER: owner rules ADR-021 (~30min) → agent L0 (certifier_override+criticality-per-doc+DeepSeek-lint+audit-hook) → agent L1 (refund+rate-alert+counter) → ADR-020 → ADR-019 persistence (parallel, non-blocking).
- LAW 2#5 RULED (owner Type-3): non-critical → user_confirmed finalizes (+audit+flag); critical identity → certifier_override required (user alone can't); cross-doc anchor always overrides user on critical, conflict→block. certifier=owner-only TRANSITIONAL → ADR-021 (delegated role). MRZ scope ruled: romanization authority + candidate-only on illegible other-doc. Verbatim in constitution LAW 2#5. OPEN sub-q (ADR-021): parents/spouses scope. NEW DEBT: ADR-021 + C3 code has NO certifier_override path yet (must build with tiered authority).
- CONSTITUTION codified (ONE_BRAIN_CYRILLIC_CONSTITUTION.md PART II/III): 8 LAWS (translit/source-of-truth/handwriting/visual-evidence/privacy/critical-fields-per-doc/DeepSeek/audit) + L0–L4 maturity map + build order. 2 clauses ⚠ OWNER-CONFIRM (MRZ-controls scope; user-confirm-as-sole-source-may-final). L1 corrected 10%→~45% (repo-verified). OPEN L0: criticality-per-doc-in-code, DeepSeek lint. OPEN L1: refund + guard-block rate-alert. L2 gated on owner GT fixtures. NEXT SESSION = L1 (refund + rate-alert), HTR stays behind ADR-020 + a real number.
- CORRECTED CLAIMS (owner critique): mirror = TEXT-content verified only, visual layout PENDING owner look (not "end-to-end"). Gazetteer (б) NOT fully closed — pre-2020 names (Дніпропетровськ/Кіровоград/Артемівськ) ABSENT, aliases all-empty (renames unmapped), Crimea no-policy; OLD-doc places still false-negative→review (safe, incomplete). Mirror documented as ADVISORY transparency, NOT a safety control. Rollback handles for all 3 layers in runbook.
- PRIOR 7-ITEM TRUTH (repo-verified): 403→422 ✓, structured guard-block log ✓, DeepSeek-never-final ✓, Tier0≠legal ✓, runbook ✓, kill-switch=decided-as-rollback, **N<30-in-runner STILL OPEN**. Real debt = N<30 + gazetteer history + ADR-020 before HTR. No prod telemetry on handwritten-date failure % (instrumentation gap) → HTR priority unjustified.
- MIRROR PDF (a): route hardened (mirror render in own try/catch → fail-open to generic; was a 500 risk). End-to-end verified (mirrorEndToEnd +4): valid %PDF, review→[CONFIRM], missing→[enter from document], never invents, all 5 schemas render. Text-verified sample structure + content rules (Patronymic/draft/no Apt 8). MIRROR_PDF_ENABLED ENABLED in prod (fail-open, draft-labeled). Rollback: env rm + redeploy. 3106 passed. Extraction quality on real handwriting still review-gated (mirror renders what it gets, marked).
- GEO (b): snapCity gazetteer expanded from 60 hardcoded → ~500 (CURATED_SEED ∪ official КАТОТТГ SETTLEMENT_ROWS, 458 sourced). Matcher unchanged, only data. Anti-silent-snap intact. +5 tests (3102). SCOPE: city/UTS tier, not the 28k villages (re-run gen-settlements.mts for those). CAVEAT: active only where snapCity wired + SMART_NORMALIZE_ENABLED ON (OFF in prod).
- SOURCE-SCRIPT GATE BUILT (owner decision b): name with no distinctive UA letter (і/ї/є/ґ) nor RU letter (ы/э/ё/ъ) → review_required + reason source_script_ambiguous + C3 finalValue=null (no silent KMU-55 final). Best-effort KMU-55 candidate still shown. isNameSourceScriptAmbiguous + gate in documentFieldReader, behind RU_TRANSLIT_ENABLED (ON prod). +7 tests (3097). All 8 owner-required transliteration tests covered. Owner rule: noisy review > clean PDF with wrong name.
- OWNER STANDARD LOCKED: RU=BGN/PCGN (Сергеевич→Sergeyevich), UA=KMU-55, applicant=MRZ/passport, relatives=as-written, ambiguous→review. transliterateRussian updated to BGN/PCGN + visual-evidence rule pinned (cross-doc match = candidate, never finalValue for illegible). 18 tests. Enabling RU_TRANSLIT in prod.
- BUILT date-role guard (deterministic, no flag, in readDocument all products): catches date role-conflation (one date in two role fields) + sequence conflict (issue before birth) → review. +10 tests. From the ChatGPT spec, applicable part.
- APPLIED from ChatGPT spec: Russian transliterator (transliterateRussian) + detectNameScript, wired into transliterationPolicy behind RU_TRANSLIT_ENABLED (OFF). 14 tests. LIMITATION found: ambiguous names (Сергей, no ы/э/ё/ъ) → unknown → need DOC-level script context, not per-name. Rejected ChatGPT fabrication (it never read the image either).
- KIT 2 VERIFIED: passport MRZ decodes DOB=1990-01-01 (June, check-digit valid, conf 0.99); fieldArbiter ranks passport_ocr_mrz #1 → MRZ resolves the illegible birth-cert date in multi-doc flows (TPS/reparole). Test added.
- KIT 1 BUILT: auto-orientation (autoOrient.ts) wired into readDocument behind AUTO_ORIENT_ENABLED. PROVEN on rotated birth cert: day 26→25 (correct), place fuller. Detects content rotation (Gemini thumbnail) + self-verify loop + fail-open.
- EXHAUSTIVE: Gemini, Vision line-seg, Vision multi-crop voting (0/5), HF-TrOCR — ALL fail the handwritten month. Names readable (11/12). Date-month needs a TRAINED HTR (Transkribus/TrOCR) → owner must provide a token. Then ensemble wires it.
- PROVEN WALL: Gemini cannot read this handwritten month (липень/травень never червень, 3 prompts) NOR localize the date line (39% box). Auto-reading handwritten dates needs Vision-tuning (key rotation) or Transkribus HTR (owner creds). Names work; dates stay human-reviewed.
- STOP: ensemble flag turned OFF in prod (full-width band timed out; tight crop garbled month). Infra complete+tested+observable but Vision-reads-month not reliable on auto-crops. Dates already review-gated (safety intact). Crop bounded to avoid timeout.
- TUNING: tight bbox clipped the handwritten month (Vision: year ok, month garbled). Now crop FULL-WIDTH horizontal band at the date line. One targeted attempt.
- DEBUG2: ensemble runs (3 boxes/3 crops/375 chars) but extracts 0 dates. Added month_hits/year_hits/cands diag to see if Vision garbles the month on crops.
- ROOT CAUSE FOUND: ensemble was wired into the legacy path but reads return via the CORE path (ok:core-b2, early return) — ensemble never ran. Now wired into Core path via shared runDateEnsemble helper.
- DEBUG: exposed date_ensemble diagnostics in response (boxes/crops/chars/status) to find why the 2nd reading isnt surfacing in prod.
- FIX: ensemble extractor required day+month+year; Vision OCR drops the day → no candidate → no surfacing. Day now optional. Re-deploy+smoke.
- FIX: ensemble required shared-year anchor → suppressed the real case (Gemini gets year, Vision gets month, no shared component). Relaxed: any date diff on the cropped region surfaces.
- FIX: Gemini bbox returned malformed JSON → boxes empty → ensemble fell back to garbled full-page Vision. Now requests ARRAY boxes + salvages malformed JSON.
- Ensemble now reads date REGIONS zoomed (Vision garbles month on full page, reads it on crop — prod proof). dateRegionRead wired. Live in prod. Re-smoke pending.
- FIX: ensemble date-field detection by NAME (FieldOut.kind is source not type, silenced it). ENSEMBLE_DATE_ENABLED=1 LIVE in prod. Re-smoke pending.
- Review UI now surfaces the ensemble second-reading on a date conflict (Gemini+Vision both shown, human picks). Handwritten-date ensemble is end-to-end (backend+UI) behind ENSEMBLE_DATE_ENABLED=OFF. Remaining: owner rotate key + flip; optional date-crop booster.
- WIRED handwritten-date ensemble into translation route (ENSEMBLE_DATE_ENABLED, default OFF): Gemini+Vision 2nd-read, date disagreement→review+candidate. +7 tests (3057). Remaining: review UI surfacing + date-crop; OWNER rotate Vision key + flip flag.
- HANDWRITTEN DATES: PROVEN ensemble fix — Gemini misreads month, Google Vision reads it right; cross-check recovers the date. Built dateReconcile core (+8 tests). Remaining: wire Vision 2nd-read+crop+review UI. OWNER: ROTATE the Vision SA key pasted in chat.
- HONEST handwritten probe (3 runs): NAMES read well+stable; DATES stably WRONG on birth certs (month/day misread + dob/issue conflation). Real target = handwritten dates, not printed. All review-flagged.
- BUILT mirror translation PDF: official KMU schemas now wired to real extraction (was mockOCR-only). registry+buildMirrorValues+orchestrator, behind MIRROR_PDF_ENABLED (default OFF). Birth cert = strong; marriage/divorce sparse extraction; +9 tests.
- DECIDED (A/B data): no scanner-style greyscale/B&W preprocessing — it collapses handwritten Cyrillic (3/3→0/3); send original color. Geometric crop/deskew = future measured candidate only.
- Bench coverage 4/5 UA classes (+Soviet bilingual: same review-gated misread pattern). Finding B corrected: birth cert IS protected via always_review+route override (not the spec flag). Intl-passport GT MISSING (owner).
- Finding A fully closed: ALL 5 upload paths (translation/EAD/TPS×2/reparole) now downscale >3.8MB photos client-side via shared lib/upload/downscaleImage. No more 413 on large phone photos anywhere.
- FIXED bench finding A: translate wizard now downscales >3.8MB photos client-side before upload (was HTTP 413 at edge). Flagship only; reparole/ead/tps follow-up.
- GT pipeline bench run (live prod): printed Cyrillic reliable (military 4/4); handwritten partial but always-review holds. Findings: 413>4MB, birth-cert handwritten:false mislabel, sex-not-in-spec. EXPLORATORY (1/class).
- Debt closed: BUG C + BUG D tests (+10). NEW finding: RU-spelling guard misses composite full_names without ё/э/ы/ъ — pinned + flagged for owner.
- CI infra: bumped GitHub Actions to Node-24 majors (checkout v6 / setup-node v6 / cache v5 / pnpm-action-setup v6) — clears 2026-06-16 Node-20 deprecation.
- CI fix (content-guard): reworded a 'certified translation' comment in applyOcrFieldSafety.ts (Rule 4 product-claim). No logic change.

## P0-A hardening (2026-06-10, CODE — walked enforce back to shadow)
- **CORRECTION to 816cb64:** that commit shipped the confirmed-value guard ALWAYS-ON/enforcing straight to prod (auto-deploy) with zero block-rate data — a measurement-first violation. This commit reverts it to **SHADOW mode by default**: the guard validates + logs `would_block` but does NOT block → **prod output byte-identical**. Owner flips `CONFIRMED_VALUE_GUARD_MODE=enforce` AFTER reviewing shadow logs.
- ONE env knob, three modes (no flag sprawl): `shadow` (default) | `enforce` | `off` (emergency kill-switch, loudly logged). Collapsed the separate EMERGENCY_GUARD_BYPASS into `off`.
- `403 → 422` for the guard block (content invalid ≠ auth failure; verified frontend just alerts the error string, no breakage).
- PII-free structured log on every would_block/block: `{field, criticality, reason, doc_type}` — no values.
- Added `CERTIFIED_DOC_INCIDENT.md` runbook (kill-switch steps, interim refund policy, SEV levels).
- Contract additions: DeepSeek-never-writes-finalValue (C3 contract); P0-A.1-vs-P0-A.2 scoping (A.2 = MRZ anchor cross-check, NOT full gazetteer re-run); Tier-0≠legal-evidence warning (ADR-019); N<30-binding-in-runner-code (GT criteria).
- tsc 0; **3016 passed | 4 skipped | 0 failed**.

## P0 Design Lock + P0-A (2026-06-10, CODE + 5 contract docs)
- **P0-A output door (now SHADOW-default):** `generate-pdf` runs `validateConfirmedValue` on EVERY release value (not behind OCR_FIELD_SAFETY_ENABLED) — Cyrillic/control/over-length/bad-date in a certified English PDF is a legal defect. Fixed Agent-A keying bug (it keyed on a `confirmed` flag the client never sends; now keys on real release values).
- **classifyCriticality reconciled** to CRITICAL_FIELDS_CONTRACT: added validity DATES (issue/expiry/marriage), issuing_authority, ead_category/class_of_admission, nationality. Previously fell through to `optional` (real gap).
- **Observability (P1 start):** PII-free `[ADR018] fallback_model_used` log (ids+counts only).
- **5 design-lock contracts created:** CRITICAL_FIELDS_CONTRACT, C3_USER_CORRECTION_CONTRACT, PAYMENT_REFUND_LEGACY_GATE_CONTRACT, GT_BENCHMARK_EXIT_CRITERIA (docs/architecture/), ADR-019-audit-trail-persistence (docs/adr/).
- tsc 0; **3011 passed | 4 skipped | 0 failed** (+14: confirmedValueGuard tests).
- **OWNER DECISIONS PENDING (marked in docs):** refund/legacy policy, audit-trail PII tier+retention, manual-override path, GT sample sourcing (need docs from different real people), military rank criticality.
- **NOT done (owner-gated/blocked):** GT benchmark runner (Agent B hit spend limit), audit-trail persistence code (ADR only), canary (blocked on GT Tier-1 sample), Vision bbox ADR-020 (research gathered).

# STATUS (2026-06-10 — ADR-018 model matrix LOCKED: fallback-model reads of Cyrillic docs force review)

## ADR-018 Model Matrix DONE (2026-06-10, CODE + ADR)
- **ADR-018 created** (`docs/adr/ADR-018-model-matrix.md`): iron matrix — gemini-3.1-pro-preview = THE reader; flash = fallback-only; Vision = technical eye; DeepSeek = prose + sanitized TPS text-structuring (never sees image, final_value always overwritten from source); D2/C3/validators/PDF = code, no AI.
- **Safety gap CLOSED:** provider chain silently fell back pro→flash on timeout/5xx — gemini-2.5-flash is DISQUALIFIED on certificate docs (read a different person, 2026-06-02). Now: `documentFieldReader.ts` forces `review_required=true` + `fallback_model_used` on EVERY field when `spec.script !== 'latin'` AND `read.model !== primaryGeminiModel()`. Deterministic, no flag.
- Latin US forms (us_ead/us_i94/us_i797) exempt — flash never disqualified on Latin print.
- `primaryGeminiModel()` exported from geminiVisionProvider.
- New tests: `fallbackModelReview.test.ts` (5). Three existing test mocks updated to report primary model.
- tsc 0; **2997 passed | 4 skipped | 0 failed** (was 2992, +5).

# STATUS (2026-06-10 — housekeeping: Vercel dead flags removed, branches cleaned, 0 open PRs)

## Housekeeping DONE (2026-06-10)
- 7 dead Vercel prod env flags removed: ONE_BRAIN_CORE_ENABLED, ONE_CORE_TPS_ENABLED, ONE_CORE_REPAROLE_ENABLED (+NEXT_PUBLIC), ONE_CORE_EAD_ENABLED (+NEXT_PUBLIC), CENTRAL_BRAIN_TRANSLATION.
- 68 stale local git branches deleted. Only `main` remains.
- All GitHub PRs closed (0 open). Canary docs applied to main.

# STATUS (2026-06-10 — payment ordering bug FIXED in generate-pdf/route.ts)

## Payment ordering bug FIXED (2026-06-10)
- **Bug:** Stripe charge (402) fired before review gate (403) — user could be charged for blocked PDF.
- **Fix:** Pre-payment 400 `fields_require_review` check inserted before Stripe block in `generate-pdf/route.ts`.
- **Applies to:** all users (owner included — certification is legal not financial).
- **tsc:** 0 errors. Tests: 2992 passed | 4 skipped | 0 failed.
- **Prod:** deployed via Vercel on push to main.

# STATUS (2026-06-10 — PR cleanup done; Phase 3 DONE: CanonicalField.finalValue + C3 as only writer)

## Phase 3 DONE (2026-06-09, CODE — CanonicalField.finalValue + C3 as only writer)
- **finalValue added to CanonicalField** (`apps/web/src/lib/canonical/types.ts`): `undefined` = C3 not run, `null` = rejected, `string` = accepted.
- **C3 is now the only writer** (`applyOcrFieldSafety.ts`): accept path sets `finalValue=string`, reject/block path sets `finalValue=null`.
- **3 adapters updated** (finalValue-first pattern, backward compat):
  - `translationAdapter.ts` (`canonicalToFieldOut`): `finalValue !== undefined ? finalValue : normalizedValue ?? rawValue`
  - `tpsAdapter.ts` (`canonicalFieldToTpsField`): same pattern for `normalized_value`
  - `eadAdapter.ts` (`getValue` helper): same pattern
- **pdf.ts updated** (`planTranslationRows`): `final_value !== undefined ? final_value : normalized_value`
- **D2 verified**: does NOT write `CanonicalField.finalValue` — writes `normalizedValue` only (D2's DECISION struct's internal `finalValue` is a different concept).
- **Tests:** 2992 passed | 4 skipped | 0 failed (18 new Phase 3 contract tests).
- **tsc:** 0 errors.
- **Backward compat:** flag OFF → `finalValue=undefined` → all adapters fall back to `normalizedValue` → byte-identical to Phase 2.
- **Prod untouched.** No env changes. `OCR_FIELD_SAFETY_ENABLED` stays OFF in prod.
- **Payment ordering bug noted** (review gate 403 fires after payment gate 402 in `generate-pdf/route.ts`) — separate issue, not fixed here.
- **Proof:** `docs/reports/PHASE_3_FINAL_VALUE_C3_WRITER_PROOF.md`
- **Next:** Owner choice — enable `OCR_FIELD_SAFETY_ENABLED` canary OR PR cleanup (dead env flags) first.

# STATUS (2026-06-10 — PASS_PROD_MODEL_SMOKE: prod on gemini-3.1-pro-preview, Phase 3 UNBLOCKED)

## PROD MODEL FLIP + SMOKE: PASS (2026-06-10)
- **GEMINI_MODEL flipped:** removed dirty `"gemini-2.5-flash\n"` → set clean `gemini-3.1-pro-preview` (no embedded \n).
- **Redeploy:** Vercel build OK, SHA `203b572` (main is current), aliased `messenginfo.com`.
- **Healthz:** `{"status":"ok","sha":"203b572","environment":"production"}` — OK.
- **Model smoke (live Gemini call):** `model: gemini-3.1-pro-preview` confirmed in `/api/translation/vision-extract` response at 4554ms. No 5xx, no timeout, no fallback to flash.
- **Result: PASS_PROD_MODEL_SMOKE.** Phase 3 is UNBLOCKED.
- Report: `docs/reports/PROD_GEMINI_MODEL_FLIP_SMOKE_2026-06-10.md`

## PR-F DONE (2026-06-10, CODE — Core read timeouts raised for pro-model)
- readDocument `timeoutMs` 20s→40s in all 4 product routes; reparole/EAD `maxDuration` 30→60.
- Reason: PR104 audit timeout_status CONFLICT — pro observed 28s, 20s cap silently degraded pro→flash.
- Unblocks owner action: flip prod `GEMINI_MODEL` → `gemini-3.1-pro-preview` (clean value, no \n). **DONE.**

## Phase 2.2–2.6 DONE (2026-06-09, CODE — All One-Core flag gates removed, GPT deleted)
- **Phase 2.2:** TPS OCR (`apps/web/src/app/api/tps/ocr/extract/route.ts`) — `ONE_BRAIN_CORE_ENABLED` flag gate removed. Core B1 is now the unconditional default for UA identity docs.
- **Phase 2.2a:** documentRegistry (`apps/web/src/lib/docintel/documentRegistry.ts`) — added `us_ead`, `us_i94`, `us_i797` specs with `script: 'latin'` (EAD route can now look up these doc types).
- **Phase 2.3:** ReParole OCR (`apps/web/src/app/api/reparole/ocr/extract/route.ts`) — `ONE_CORE_REPAROLE_ENABLED` server-side flag gate removed. Route always runs Core.
- **Phase 2.4:** EAD OCR (`apps/web/src/app/api/ead/ocr/extract/route.ts`) — `ONE_CORE_EAD_ENABLED` server-side flag gate removed. Route always runs Core.
- **Phase 2.5:** `/api/ocr/extract` — no live callers confirmed; DeepSeek text-parse path retained per ADR-017.
- **Phase 2.6:** `attemptOpenAIVision` (gpt-4o-mini) removed from `/api/ocr/extract`; `openaiReader` (gpt-4o) removed from `lib/engine/models.ts`. GPT fully gone per ADR-017.
- **Wizard cleanup:** `ReparoleWizardV2.tsx` — `REPAROLE_CORE_ENABLED` constant removed; `useCoreRoute = CORE_COVERED_SLOTS.has(id)` (always Core for passport/booklet). `EADWizard.tsx` — `EAD_CORE_ENABLED` constant removed; upload step always present (8-step flow).
- Tests: 2974 passed | 4 skipped | 0 failed. tsc: 0 errors.
- Prod untouched. All One-Core flags were already ON in prod; behavior unchanged.
- **Next: Phase 3 — explicit `final_value` + C3 as single writer. Or KNOWLEDGE_BRAIN_ENABLED canary (owner GT-gated).**

## Phase 2.1 DONE (2026-06-09, CODE — Translation Core unconditional)
- `ONE_BRAIN_CORE_ENABLED` flag gate removed from Translation vision-extract route. Core B2 is now the unconditional default.
- Dead `CENTRAL_BRAIN_TRANSLATION` consensus block (~40 lines) removed. Dead imports removed (`analyze`, `deepseekProseTranslator`, `DOC_TYPES`).
- `degradedFromBrain` variable and all ternaries removed. Response `status`: Core = `ok:core-b2`; legacy fallback = `ok:legacy-reader`.
- Legacy reader (with preprocessing) stays as fallback for Core errors / 0 fields.
- tsc 0; 2975/4 (0 regressions). Prod untouched (ONE_BRAIN_CORE_ENABLED=1 was already ON in prod → behavior unchanged).
- Phase 2.0b: `gemini-2.0-flash` was already removed from fallback chain in a prior session. Only appears in comments.
- **Next: Phase 2.2 — TPS → Core default for UA-identity docs (booklet/birth/military).**

## Phase 2.1a DONE (2026-06-09, CODE — Translator hard-case unbypass)
- **Translator birth/marriage** (`auto:false`, incident RC-1 STILL TRUE in prod) now route through vision-extract + review gate when `NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED=1` (default OFF).
- Flag OFF: byte-identical to current behaviour. No vision call, no gate, manual specialist path unchanged.
- Flag ON + 0 fields: falls through to manual (no gate breakage — hardCaseHasFields=false).
- Flag ON + fields: `hardCaseHasFields=true → needsReviewGate=true` → all fields review_required, payment blocked until all confirmed.
- `autoread?: boolean` on DocTypeMeta (separate from `auto`, does NOT change `auto:false`). `hardCaseHasFields` state cleared on `resetAll`.
- Files: `TranslateWizard.tsx`; new test `hardCaseAutoread.test.ts` (14 pure-logic tests).
- tsc 0; full suite 2975/4 (was 2961, +14 new, 0 regressions). Prod untouched. No PII. Branch feat/one-brain-gemini-core (PR #104).
- **Next code step: Phase 2.0b — remove deprecated `gemini-2.0-flash` (HTTP 404) from geminiVisionProvider fallback chain.**

## Phase 2.0 DONE (2026-06-09, CODE — rawCyrillic threaded + D2 sees Cyrillic + 4 bug fixes)
- **GAP A FIXED:** rawCyrillic now threads ExtractedDocField → FieldCandidate.rawCyrillic → CanonicalField.rawCyrillic. `docintelToCandidate` sets `rawCyrillic: f.raw_cyrillic`. `canonicalToFieldOut` prefers `f.rawCyrillic` over cyrillicMap.
- **GAP B FIXED:** `applyKnowledge()` feeds D2 with `f.rawCyrillic ?? f.normalizedValue ?? f.rawValue`. D2 Cyrillic rules (gazetteer, RU/UA spelling, normalizeName, patronymicReconcile) now fire on ORIGINAL Cyrillic text. Phase 1 `knowledgeBrain` at arbitration now receives Cyrillic and is effectively at the right level.
- **Bug A FIXED:** ISO YYYY-MM-DD dates accepted without false review (`date.iso_to_uscis`); already-USCIS MM/DD/YYYY pass-through.
- **Bug B FIXED:** `sourceBasis` in `KnowledgeNormalizeCtx` distinguishes MRZ/EAD/I-94 controlling Latin (evidence 0.99) from derived KMU-55 Latin (0.6).
- **Bug C FIXED:** `documentFieldReader.ts` emits review field (`canonical_value_unresolved`) instead of silent drop when `toCanonicalValue()` returns null but `r.cyrillic` non-empty.
- tsc 0; full suite 2961/4 (was 2937; +24 new tests, 0 regressions). Proof: PHASE_2_0_CYRILLIC_D2_DOOR_PROOF.md.
- **Prod untouched. KNOWLEDGE_BRAIN_ENABLED default OFF. cyrillicMap kept as fallback. No PII.**
- GAP C (flag consolidation SMART_NORMALIZE vs KNOWLEDGE_BRAIN → ONE flag) = Phase 2.0b (future).
- GAP D (explicit final_value + C3 single writer) = Phase 3 (future).
- **Next code step: Phase 2.1a — Translator hard-case unbypass (auto:false → Core + review + C3).**


## ⚠️ SELF-CHECK CORRECTION (2026-06-09, agent): Core flags ARE present in prod
- My earlier claim "Gemini-Core is parked behind flags nobody flips / Knowledge canary is a no-op until Phase 2" was **WRONG** — my `vercel env ls` grep pattern missed `ONE_CORE_*`. Full check: **ONE_BRAIN_CORE_ENABLED, ONE_CORE_TPS_ENABLED, ONE_CORE_REPAROLE_ENABLED, ONE_CORE_EAD_ENABLED (+NEXT_PUBLIC twins), CENTRAL_BRAIN_TRANSLATION, DOCAI_ENABLED are ALL PRESENT in prod** (values unverified by `ls`; P2 checkpoint 06-03 records owner-verified ON). ⇒ the Core arbitration path is LIVE for all 4 products; `KNOWLEDGE_BRAIN_ENABLED=1` in prod would fire IMMEDIATELY on live traffic (not a no-op). Phase 2 reframed: not "flip Core on" but "harden the already-live Core + retire legacy fallbacks". Extra care on any dictionary flag.
- Also confirmed (self-check): `convertDateToUSCIS` does NOT accept ISO `yyyy-mm-dd` → my Phase-1 D2 date rule flags correctly-read ISO dates as `date_unparsed` (false review noise — fix in 2.0); my "preserve Latin" rule wrongly treats derived KMU-55 Latin as controlling Latin (controlling must be SOURCE-based: mrz/ead/i94 — not script-based); `documentFieldReader.ts:71` silently DROPS a field when `toCanonicalValue` returns null (read-but-unparseable fields vanish with their raw_cyrillic — violates candidate≠final spirit; fix in 2.0).

## ARCHITECTURE DECISION ADR-017 + Phase 1 brick #1 (2026-06-09)
- Owner mandate: recognition via Gemini (all keys/models); DeepSeek retained fully; GPT removed; HTR parked; "сделай как должно быть". Decided (ADR-017): core = ONE Gemini brain + deterministic knowledge truth + review gate, NOT multi-reader consensus (consensus fixes none of the incident root causes; with GPT out + HTR dead it is a committee of one). Plan: docs/reports/ONE_BRAIN_GEMINI_BUILD_PLAN.md.
- **Phase 1.1+1.2 DONE (code):** `knowledgeNormalize.ts` rebuilt per AI-risk review as a D2 **authority layer** (NOT auto-replace): returns a DECISION {action accept/preserve/suggest/review/block, finalValue, candidateValue, ruleId, reasonCodes, provenance}. `arbitrateDocument(candidates, knowledge?)` applies it — accept/preserve→final; **conflict (suggest/review/block)→keep read value + suggestedValue + review, never silent override**. Flag `KNOWLEDGE_BRAIN_ENABLED` (default OFF → byte-identical, proven by canonical suite 329). 12 conflict-case tests (Russian-on-UA→review, clean UA→accept, gazetteer exact→accept/fuzzy→suggest, patronymic fragment→review, MRZ→preserve, unknown authority→review). tsc 0; full suite 2931/4. ADR-017 §D2 contract added.
- **Phase 1.3 DONE (code):** ONE shared helper `canonical/core/knowledgeBrain.ts` (isKnowledgeBrainEnabled / buildKnowledgeContext / applyKnowledgeBrainIfEnabled) — wired translation/tps/reparole/ead at the arbitration seam (1-line diff each, no route-local dictionary logic, no four forks). OFF deep-equals bare arbitration; ON=conflict→review. 18 helper/normalize tests; full suite 2937/4; tsc 0. Legacy /api/ocr/extract + generate-pdf are NOT arbitration seams (no D2 fork). Proof: docs/reports/KNOWLEDGE_BRAIN_PHASE_1_3_WIRING_PROOF.md.
- **BINDING CONTRACT recorded (ADR-017, owner-approved 2026-06-09) → Phase 2 unblocked.** D2 annotates only (never writes final_value); **C3 is the single writer of `final_value`** (accept_final→final_value=normalized_value, else null; D5 confirmation re-runs C3); **D6/PDF reads only final_value**, critical null→block; one criticality taxonomy for D2+C3; adapters must not drop suggested/rule_id/provenance/reason_codes/evidence_strength/review_required. Primary risk now = downstream bypass; defense = final_value=null until C3/confirmation. Phase order: 1.4 fixtures → 2 Core-default (one product at a time) → 3 explicit final_value + C3 final writer → 4 Knowledge canary (after Core-default) → ReaderResult/crop later.
- **Phase 1.4 DONE (real-doc proof, flag ON, real Gemini).** Safety holds on real Soviet + handwritten birth certs: D2 provenance on every field, conflict→review+suggestedValue (patronymic.fragment / authority.unknown), no silent override, no Cyrillic leaks. **FINDING:** D2's Cyrillic rules (gazetteer / RU-spelling / normalizeName) are bypassed live — docintel KMU-55-transliterates to Latin BEFORE arbitration (Cyrillic in a separate cyrillicMap; FieldCandidate has no rawCyrillic). Safe but accuracy value not yet delivered. → Phase 2.0 prerequisite: thread rawCyrillic to D2.
- **KNOWLEDGE INVENTORY + AUDIT SYNTHESIS DONE (2026-06-09)** — read live data inventory + 4 prior audits. TWO critical findings: (1) a dictionary-in-path layer ALREADY exists at the RIGHT place (raw Cyrillic) — `SMART_NORMALIZE_ENABLED` P2.1-P2.3 (Door A toCanonicalValue→snapCity; Door B documentFieldReader patronymic/authority). My Phase-1 knowledgeBrain at arbitration is at the WRONG layer (post-KMU-55 Latin) and DUPLICATES it → Phase 2.0 reframed as RECONCILE-to-one-layer (keep my KnowledgeDecision contract, apply at Door A/B, retire arbitration duplication). (2) Dominant real failure = `wrong_person_selected` (model reads a DIFFERENT identity; 2.5-pro false-confidence) — NOT a dictionary problem; defended by always-review policy + model choice + reshoot. Coverage: gazetteer/settlements = SEED (35/458 vs ~28-30k). Bug: deprecated gemini-2.0-flash (404) in fallback chain. HARD GATE: any dict layer in prod FORBIDDEN until owner GT + OFF/ON delta. Report: docs/reports/KNOWLEDGE_INVENTORY_AUDIT_SYNTHESIS_2026-06-09.md.
- **CYRILLIC CONSTITUTION assembled (docs/architecture/ONE_BRAIN_CYRILLIC_CONSTITUTION.md)** — owner's iron constitution mapped node-by-node to real code. Traced the Cyrillic highway: Gemini reads `VisionFieldRead.cyrillic`; `documentFieldReader.ts:70` runs `toCanonicalValue` IN the read loop → `value`=KMU-55 Latin + `raw_cyrillic` kept alongside (`:76`); `docintelToCandidate` (translationAdapter:50) DROPS raw_cyrillic (FieldCandidate.value=Latin; Cyrillic only in a side cyrillicMap for display). GAP A = raw_cyrillic dropped from Core record; GAP B = D2 partial at toCanonicalValue (city/oblast on Cyrillic) but name=bare KMU-55 no RU/UA check; GAP C = 3 D2 sites/2 flags (Door A toCanonicalValue + Door B documentFieldReader post-pass SMART_NORMALIZE + my arbitration knowledgeBrain); GAP D = no final_value, C3 post-adapter on Latin. documentFieldReader IS the one shared door (all 4 products).
- Realization: D2=ONE layer at the one door on raw_cyrillic (upgrade toCanonicalValue+Door B to KnowledgeDecision, retire arbitration dup, one flag); carry rawCyrillic+decision FORWARD into FieldCandidate/CanonicalField; final_value + C3 single writer; PDF reads final_value only.
- **PRODUCT READINESS COMPARISON done (docs/reports/PRODUCT_READINESS_COMPARISON_2026-06-09.md):** 4 products = 4 stages of one migration. Pipeline alignment to Constitution: Reparole 85% (reference: Gemini-Core+MRZ, no ungated fallback) > EAD 80% (cleanest arch, but US-doc registry specs UNPROVEN + no scorable fixtures, thinnest UX) > Translator 60% (3 branches) > TPS 40% (default = Vision/DocAI + rule modules; Gemini only passport/booklet). **FLAGSHIP PARADOX: Translator birth/marriage are `auto:false` → vision-extract NEVER called → manual ticket (incident RC-1, STILL TRUE)** — the most polished product is worst on exactly the docs where Cyrillic matters; the now-proven safety stack makes auto-read safe → added Phase 2.1a (unbypass). TPS convergence narrowed to UA-docs only (keep deterministic US-form modules). Added 2.2a EAD registry proof.
- Next: Phase 2.0 reconcile D2 to the one door on raw_cyrillic + carry forward; then 2.1a flagship unbypass. Branch feat/one-brain-gemini-core (PR #104). No prod/keys/PII change.

## P0 FIX: vision-extract 502 root-caused + fixed (the original "0 results" incident)
- RUNTIME PROOF (preview): ead no-fields probe → HTTP 200 (was 502 on prod); blank birth-cert → 200 all-review, no fabrication. PR #99.
- Root cause: route returned HTTP 502 whenever it recognized ZERO fields (final return `status: ok ? 200 : 502`). NOT a crash/timeout/provider issue — direct-origin probe returned the full valid JSON body with a 502 status; Cloudflare masked it as "error code: 502". Affects real hard-case docs that read 0 fields. Fix: return 200 with ok:false+status+error+review_required (matches the route's other non-fatal returns). tsc 0; suite 2919/4. See docs/reports/VISION_EXTRACT_502_TRIAGE_2026-06-06.md.
- C3 merged but canary BLOCKED by this 502 (now fixed, PR open). OCR_FIELD_SAFETY_ENABLED remains OFF. Re-run canary only AFTER this fix merges. ReaderResult/OneBrain HOLD.

## OCR field-safety canary = DEGRADED (rolled back); pre-existing vision-extract 502 found
- Canary run 2026-06-06: enabled OCR_FIELD_SAFETY_ENABLED=1 + redeploy → route proof blocked by a 502 on the Translation model-read path. 502 REPRODUCES with flag OFF (two redeploys, commit 0d3d82b) → pre-existing, flag-independent; the safety gate never ran. Rolled back to OFF (proven-safe baseline). See docs/reports/OCR_FIELD_SAFETY_CANARY_RESULT.md.
- prod==main==0d3d82b, healthz ok, flag ABSENT/OFF. NEW finding (out of C3 scope, NOT proven for real uploads): vision-extract returns 502 on synthetic gate-reaching requests — needs separate triage. C3 stays code-ready/prod OFF. D0/ReaderResult/OneBrain HOLD until a real-document canary is clean.

## C3 MERGED to main — global OCR field safety code-ready; canary = owner
- Stack #94→#95→#96 MERGED (origin/main 0d3d82b). Guard wired into all 4 flows behind `OCR_FIELD_SAFETY_ENABLED` (ABSENT/OFF in prod — verified vercel env ls). tsc 0; full suite 2913. Flag-ON proof: docs/reports/C3_OCR_FIELD_SAFETY_PROOF.md. Canary runbook: docs/reports/OCR_FIELD_SAFETY_CANARY_RUNBOOK.md.
- Prod deploy of 0d3d82b catching up through the 3 stacked merges (flag OFF = byte-identical). D0/ReaderResult/OneBrain HELD until owner canary. No model/provider/prod-env change.

## C3 wiring COMPLETE — guard wired into all 4 flows behind OFF flag
- `OCR_FIELD_SAFETY_ENABLED` (default OFF). Wired: Translation public (vision-extract), TPS merge (tps/ocr/extract), legacy boundary (/api/ocr/extract), PDF/payment (generate-pdf via hasUnresolvedCriticalForOutput).
- candidate≠final enforced; zero-recognition≠success; unsafe critical → candidate-only+review/manual; PDF blocks unresolved critical. tsc 0; documentSafety 28 tests; full suite 2913 passed (incl. flag-ON proof). OFF=byte-identical. Prod flag NOT enabled; D0/ReaderResult/OneBrain HELD.

## ✅ Containment guard built (ocrFieldSafetyGate) — pure, tested, NOT yet wired
- `lib/documentSafety/ocrFieldSafetyGate.ts`: one global guard, PII-free by construction (no value in/out),
  enforces the 10-rule contract (candidate≠final; zero-recognition≠success; source/stale/hard-case/legacy/low-conf
  → not final). + `hasUnresolvedCriticalForOutput` (shared PDF/payment gate). tsc 0; 18 guard tests; full suite
  2893 passed. Pure/unwired → prod byte-identical. **Next: wire into Translation/TPS/legacy/PDF behind
  `OCR_FIELD_SAFETY_ENABLED` (default OFF), per-flow + tests.** D0/ReaderResult/OneBrain still HELD.
<!-- P0 docs PII-scrubbed: incident identity values replaced by placeholders -->

## ⛔ Global OCR / Recognition = INCIDENT / NOT TRUSTED (2026-06-06)
Owner uploaded a birth cert → translator gave **0 results**; TPS showed a wrong/flagged patronymic (a truncated patronymic suffix)
+ many blank fields. Prior narrow PASS verdicts were per-endpoint, NOT global. **All next brain layers FROZEN**
(D0 prod / ReaderResult / OneBrain / HTR / 2nd provider / SMART / model work).
**P0 forensic audit COMPLETE (docs-only, no code changed):**
- `docs/reports/P0_OCR_FLOW_INVENTORY.md` — 6 reader paths, 4 safety regimes (Gemini-gated / DeepSeek-ungated /
  TPS-legacy-modules-ungated / gpt-4o-mini-ungated).
- `docs/reports/P0_FIELD_LIFECYCLE_MAP.md` — per-field origin/flag/final/PDF trace; where safety is lost.
- `docs/reports/P0_ROOT_CAUSE_ANALYSIS.md` — RC-1 birth `auto:false`→0 results; RC-2 wrong value shown AS value
  (candidate≠final not enforced — "a truncated patronymic"); RC-3 six paths/four regimes; RC-4 TPS multi-doc; RC-5 core→legacy fallback ungated.
- `docs/architecture/GLOBAL_OCR_FIELD_SAFETY_CONTRACT.md` — 10 binding rules.
- `docs/reports/P0_OCR_SAFETY_TEST_PLAN.md` — RED-first regression tests.
Ruled out: NOT my D0 (flag absent in prod), NOT the gates (keep values), NOT a crash (0 errors), NOT Supabase.
**Next phase:** adopt the contract → build shared `ocrFieldSafetyGate` + RED tests → only then resume D0/ReaderResult/OneBrain.

# STATUS (2026-06-05 — honest, no overclaiming)

## D0 quality/reshoot — IMPLEMENTED behind flag OFF (first real brick)
- `lib/docintel/quality/documentImageQuality.ts`: image metrics → ACCEPT / DEGRADED_REVIEW / RESHOOT_REQUIRED
  + reshoot messages. Flag `QUALITY_GATE_ENABLED` default OFF → prod byte-identical. Inert hook in translation
  vision-extract route. Blur is NEVER a fabrication signal. tsc 0; D0 16 tests; full suite 2875 passed.
- NOT enabled in prod. Next (Gate 2) = ReaderResult interface. Enabling D0 in prod = separate owner decision.

## Agent rails in place (operating contract + phase gates + D0 start pack)
- Refined: Gemini-first guardrails hardened — "Gemini-first ≠ fan-out", "HTR research ≠ implementation",
  and a Gemini top-version benchmark must precede ANY non-Gemini provider discussion.
- `docs/architecture/AGENT_OPERATING_CONTRACT.md` = the law (live vs target, autonomy boundaries, evidence
  contract, phase-gate order). `docs/reports/RECOGNITION_PHASE_GATES_CHECKLIST.md` = Gates 0–6.
- Next CODE step = D0 quality/reshoot (`docs/reports/NEXT_PROMPT_B_D0_QUALITY_RESHOOT.md`), flag default OFF,
  ONLY after clean 24–48h monitor + owner "start D0". HTR/2nd provider/OneBrain stay gated.

## Reader strategy = GEMINI-FIRST (locked 2026-06-05)
- Near-term reader work stays within the Gemini family (top versions/benchmarks). A second reader = a
  provider-agnostic DISABLED slot — GPT-4o/Claude NOT near-term; HTR research-only. No fan-out until ROI proven.
  All gated on GT breadth from different people + owner decision. (Roadmap docs corrected via follow-up PR.)

## Recognition structure roadmap accepted (docs-only; build = next, phased)
- Truth map + target D0–D6 + 10-phase build plan + 5 next-prompts written (see CHANGELOG / OWNER_QUEUE).
- Order: monitoring closeout → D0 quality → ReaderResult contract → OneBrain shadow → D2/D3/D4 → Auditor;
  HTR/GPT-4o research only AFTER GT from different people. Still a safety wrapper, NOT a full brain.

## Wave D monitoring ACTIVE (PASS_RUNTIME_VERIFIED reached; PR #86 merged)
- Read-only healthz workflow `.github/workflows/prod-safety-monitor.yml` (every 6h, no secrets, self-no-ops
  after 2026-06-07 — delete after window) + manual runbook `docs/reports/PROD_SAFETY_MONITORING_24H_RUNBOOK.md`.
- Watch 24–48h: 5xx, document_class_metric count, review_rate (incl. printed-birth-cert false positives),
  self-consistency latency/cost, UI/PDF block. Rollback: SELF_CONSISTENCY first, keep ANTI_FAB (owner-confirm).
- No new architecture (HTR/OneBrain/GPT-4o/SMART/L2-WIRE parked). Next real unblock = GT from different people.

## Translation hardening — NOW IN PROD (verified 2026-06-05 01:43)

- ✅ **Live in prod**: PR #84 merged; `origin/main` = `2d2a391`; review-gate commit `e298d97` is an ancestor
  of main; prod `healthz` sha = `2d2a391` == main. The fix that was "local only" last entry IS now deployed.
- (history) Public Translation Wizard false-readiness gap CLOSED:
  - OCR `review_required` fields now block payment and PDF download
  - user can explicitly confirm unchanged flagged OCR values
  - `/api/translation/generate-pdf` now rejects unresolved OCR review fields from the legacy public wizard payload
- Local proof:
  - Typecheck PASS
  - Vitest PASS
  - Build PASS
  - Live local browser run on `/en/services/translate-document/start` with real booklet fixture:
    - `reviewBadgesBefore=4`
    - `confirmButtonsBefore=4`
    - `payDisabledBefore=true`
    - `reviewBadgesAfter=0`
    - `confirmButtonsAfter=0`
    - `payDisabledAfter=false`
- Evidence: `docs/reports/TRANSLATION_REVIEW_HARDENING_2026-06-04.md`
- Independent re-verify (agent, raw): tsc 0 errors; full suite **2859 passed / 4 skipped** (matches claim);
  server gate logic + wizard block + tests read and correct. Build NOT re-run by agent (tsc+suite = proxy).

## Production Safety Gates — PASS_RUNTIME_VERIFIED (2026-06-05, prod==main==7c6068c)

| Gate | Env (prod) | Firing proven | Evidence |
|------|-----|-----------------|----------|
| ANTI_FABRICATION_GATE | **present** (`vercel env ls`, set 2h ago) | **YES — prod + local agree** | owner prod-HTTP: 8/10 review=true, ALL identity protected (corroborated by logs, 0 errors); agent local real-model: 5/5 identity forced, reasons attached, values unchanged. Field-for-field match. |
| SELF_CONSISTENCY_GATE | **present** (set 1h ago) | **YES (runtime, local real-model)** | `self_consistency=mismatch` (2 reads disagreed on identity) → forced review. |
| DOCUMENT_CLASS_METRICS | **present — RUNTIME VERIFIED =1** | **YES** | multiple `[document_class_metric]` on real prod `POST /vision-extract` 200 (01:01–01:03, 02:01–02:02) |
| (extraction path) | — | **HEALTHY** | all vision-extract / tps-ocr 200; **0 error/fatal**. No regression. |
| SMART_NORMALIZE | **absent** | N/A | DO_NOT_ENABLE ✅ |

> Gate firing is now **prod-runtime-observed** (owner's controlled hard-case upload) AND independently
> reproduced by the agent's local real-model proof — the two agree field-for-field. Remaining honesty note:
> env `ls` shows presence not the literal `=1` value (metric proves its own flag `=1`; the two gate flags are
> presence + set-time + the observed firing). This is a **safety wrapper working in prod**, NOT a full OneBrain.
> Full report: `docs/reports/POST_RUNTIME_GATE_VERIFICATION.md`. **Next: monitor 24–48h.**

## What is NOT live (do not claim otherwise)

- HTR: dead (auth 401)
- GPT-4o second reader: code exists, not in live path
- consensus.ts: dormant (gated by ONE_BRAIN_CORE)
- OneBrain/decideField: PARKED, 0 callers
- Quality signal to readDocument: not threaded

## Accuracy (measured, owner GT, N=6/1 person)

- Printed: 60-83% (live-door-scorable fields only)
- Hard-case: 25% (1/4 identity). Model Russianizes Ukrainian.
- false_negative_review mode C = 0

## Decisions (ADR-016)

- Hard-case UA = human review by policy
- PII = internal-only forever (CLOSED)
- OneBrain = PARKED until GT≥50

## Next owner action

ONE CONTROLLED UPLOAD of a hard-case document through messenginfo.com UI.
This is the ONLY way to change status from ENABLED_BY_ENV to RUNTIME_VERIFIED.

## 2026-06-04 — TARGET SCHEME FILE VERIFICATION

- Report added: `docs/reports/TARGET_RECOGNITION_SCHEME_FILE_VERIFICATION_2026-06-04.md`
- Verified file-by-file against the requested D0..D6 + Auditor scheme.
- Verdict: the scheme exists as documentation and as parked `engine/*` / `central-brain/*` code, but the live product spine is still `docintel/documentFieldReader.ts` + `geminiVisionProvider.ts` + `canonical/core/arbitration.ts`.
- Confirmed mismatch to the exact target:
  - `consensus.ts` exists but is not the live default Chief Engineer.
  - `models.ts` contains Gemini/GPT-4o/Vision readers, but not as the active multi-reader production fanout.
  - `htr.ts` exists, but HTR is not proven live and not the active reader path.
  - D0 preprocess is real, but it does not cut documents into line crops as claimed in the target scheme.
  - D2 KMU-55 is live; gazetteer/patronymic are real but partly flag-sensitive, not universally "inside the brain by default".
- Current truth:
  - target scheme documented = PASS
  - most building blocks present in repo = PASS
  - project already matches the exact target scheme in live runtime = FAIL

## 2026-06-04 — LATEST AUDIT / INVENTORY RECONCILIATION

- Report added: `docs/reports/LATEST_AUDIT_INVENTORY_RECONCILIATION_2026-06-04.md`
- Verified latest report layer against current code.
- Current trustworthy layer:
  - `TARGET_RECOGNITION_SCHEME_FILE_VERIFICATION_2026-06-04.md`
  - `ARCHITECTURE_INVENTORY_VERDICT.md`
  - `BASELINE_MATRIX.md`
  - `GT_ACCURACY_VERIFICATION.md`
  - `ACCURACY_OFFON_RESULTS.md`
  - `LIVE_DOOR_SCORABLE_COVERAGE.md`
  - `RECOGNITION_ROADMAP_FROM_CURRENT_TO_TARGET.md`
- Partially stale snapshots:
  - `PROJECT_ARCHITECTURE_VERDICT.md`
  - `DOCUMENT_CLASS_EXTRACTION_MATRIX.md`
  - parts of `KNOWLEDGE_CORE_INVENTORY.md`
- Strongest stale point confirmed by code:
  - older reports saying `ua_military_id` is absent are now false; registry entry exists in `docintel/documentRegistry.ts`
- Reconfirmed live truth:
  - default runtime spine is still `readDocument()` -> Gemini provider -> arbitration/gates
  - exact target multi-reader consensus runtime is still not live

## 2026-06-04 — CRITICAL LIVE-DOOR RE-VERIFY

- Report added: `docs/reports/CRITICAL_REVERIFY_LIVE_DOOR_2026-06-04.md`
- Correction to earlier over-broad audit wording:
  - `snapCity` IS already wired into the live door, but behind `SMART_NORMALIZE_ENABLED`
  - patronymic reconcile IS already wired into the live door, but behind `SMART_NORMALIZE_ENABLED`
  - authority resolve IS already wired into the live door, but behind `SMART_NORMALIZE_ENABLED`
  - anti-fabrication and self-consistency ARE already wired into `readDocument`, but behind flags
  - `garbageGuard` is runtime-used in UI/review surfaces, but NOT server-side in `readDocument`
- Strong corrected truth:
  - "not wired at all" was too rough for several D2 / gate components
  - more exact status = wired, but flag-gated and OFF by default

## 2026-06-04 — PROJECT UNDERSTANDING MASTER

- Report added: `docs/reports/PROJECT_UNDERSTANDING_MASTER_2026-06-04.md`
- Full-project understanding pass completed across:
  - startup truth docs (`AGENTS.md`, `STATUS.md`, `HANDOFF.md`, `SOURCE_OF_TRUTH.md`, `CHANGELOG.md`)
  - accepted ADRs
  - top-level repo structure
  - `apps/web/src/lib/*`
  - product OCR routes
- Strongest verified understanding:
  - this repo contains **three architectural eras at once**
    1. legacy TPS/product-specific pipelines
    2. current shared live `docintel` + `canonical/core` spine
    3. parked / target `central-brain` + `engine/consensus` layer
  - project understanding must distinguish these planes instead of flattening them into one claim
  - TPS merge brain (`lib/tps/centralBrain.ts`) is a separate live plane, not dead code
- 2026-06-10 clarified L1_T0_ACTIVATION_CHECKLIST: 3 distinct secret-sets (baseline≠crons≠drift-guard); baseline data needs only GUARD_BLOCK_METRICS_ENABLED in Vercel.
- 2026-06-10 HANDWRITTEN: live prod test on REAL handwritten cert → found+FIXED review_reasons loss (translationAdapter 2 boundaries, TDD +4); +handwrittenCyrillicE2E.test.ts (+4, full chain real functions); GT templates UNFILLED (owner: fill 3 JSONs). 3207 passed.
- 2026-06-11 fix: L1 crons .contains on jsonb reasons → JSON.stringify (22P02 in live run, diagnosed from gh logs)
- 2026-06-11 cleanup: PII-trail 0 rows (verified), OPS_INCIDENT_LOG + PROD_RISK_NOTES created (F1/F2, exact handwritten wording, boundary-loss audit, alert-logic-untested). No code/env changes.
- 2026-06-11 GT filled (3 files, owner qa-private merged + agent visual reads) + FIRST REAL BENCH: 11/12 (91%), SILENT-WRONG=0, INSUFFICIENT_N honest. Report committed PII-free.
- 2026-06-11 fix: repaired printf-truncated CHANGELOG bench entry.
- 2026-06-11 silent-wrong fix: ua_birth_certificate all fields handwritten:true (real GT-bench catch: act_record_number wrong+unflagged); +3 regression tests; 3 stale tests updated. 3214 passed.
- 2026-06-11 incident: manual CLI deploy broke vision-extract (504) → rolled back per runbook, service restored; rule: git-push deploys only.
- 2026-06-11 CLOSED LOOP: after-fix re-bench on the real cert → SILENT-WRONG=0 (act_record_number now review-gated); 6/9 match, all 9 review-gated; service healthy on git build aaed819.
- 2026-06-11 methodology fix: GT field_provenance added (gold vs agent-proposed); bench report REVISED with separated numbers + CI[62,100] + shadow-mode disclaimer + act# caveat. Verified: bench-1 11/12 was ALL-GOLD (not circular); full-spec had 3 agent-proposed.
- 2026-06-11 corroboration pass: father+mother CONFIRMED by 2nd independent max-zoom read (+patronymic consistency); act# AMBIGUOUS (8+crossed-7: 87 likely, 84 possible) — owner must adjudicate on the physical doc. Evidence in GT _meta; provenance NOT flipped (owner-only).
- 2026-06-11 critic-round closed: docs 2-3 full-spec bench (mil 5/5 incl doc_number-vector, pass 3/3, SILENT-WRONG=0 everywhere); kind↔anti-fab audit done → marriage+divorce same-vector flags flipped (TDD, +6 tests); post-deploy-smoke workflow added (CI gap); ARCH_DEBT handwritten-assumption recorded; provenance was ALREADY applied (81bb43e). 3220 passed.
- 2026-06-11 untracked triage: 15 PII-bearing reports → qa-private/reports (gitignored, LAW 5); 11 clean historical reports committed; 4 daily-briefings → qa-private/briefings (personal artifacts, duplicate CHANGELOG function — reversible decision).
- 2026-06-11 bench report: per-document numbers section added (mil 5/5, pass 3/3, birth 4/6; silent-wrong 0 everywhere).
- 2026-06-11 C-ACTIVATION: 6 env-vars live (baseline clock started; paid-incident handling on; T0 receiver armed; OCR guard on; shadow pinned). Enforce+override stay gated. Deploy via git (CLI forbidden per incident).
- 2026-06-11 INCIDENT+ROLLBACK: OCR_FIELD_SAFETY=1 nulled critical values (candidate-only, no anchor) → TPS/translation showed 'не найдено'. Owner T+24h test caught it; rollback <10min (cdc0785). Flag needs UI-aware integration before re-enable. Smoke must assert values.
- 2026-06-11 lessons IMPLEMENTED (not just listed): (1) post-deploy-smoke now VALUE-CHECKING (fails on nulled-values-with-200 — the exact incident mode); (2) UI-aware candidate render in TPS+Reparole ingest (safety-demoted value → prefill raw_value + forced review, not 'Не найдено'). Tail-1 closed with DATA: vertical real doc post-rollback = 10/10 values SET (vertical was the flag symptom). Tail-2: all session tables 0/24h = owner stopped at the broken extraction screen (sessions created later) — no DB anomaly; owner-login = setup step (/api/owner/request-code, OWNER_EMAILS set in prod).
- 2026-06-11 OWNER UI-FAIL ROOT CAUSES (не распознавание!): (1) birth/marriage autoread был OFF (NEXT_PUBLIC_HARD_CASE_AUTOREAD_ENABLED отсутствовал) → визард шёл в manual-fallback НЕ вызывая extraction → env=1 поставлен; (2) военника НЕ БЫЛО в DOC_TYPES визарда → добавлен (military, autoread, ua_military_id, 6 insertion points); (3) загран правильным путём = 5/5 SET incl номер+expiry (3 поля у owner'а = окно сломанного флага). + Telegram NATIVE Bot API (TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID) в оба alert-пути — BotFather 3 мин вместо самодельного webhook.
- 2026-06-11 ROTATION VERIFIED LIVE: real doc pixel-rotated 0/90/180/270 → 10/10 fields+values+cyr, family MATCH vs GT on ALL four (autoOrient works). TEMPLATES truth: dictionaries DO apply (values are KMU-55); structural mirror templates exist for 5 certs only; passport/military/ID render generic; wizard sample previews were stub dashes → upgraded to real registry field sets (passport_foreign 5, birth 8, marriage 5, id_card 4, military 4).
- 2026-06-11 SILENT-DROP UI bug FIXED (the REAL passport-3-fields cause): translation review table filtered fields through a 6-key booklet-only label map → passport number/expiry, 9/10 birth-cert fields, military doc_number SILENTLY DROPPED. New translationFieldLabels.ts (full registry coverage, test-pinned 7 tests) + ukrLabelFor fallback (never drop). Mentor's null-render premise was the wrong mechanism (owner's '—' was the SAMPLE-stub path, fixed earlier); the label-filter was the live hole.
- 2026-06-11 TRIPLE-CLOSURE: (3) synthetic generators birth/military/marriage written+validated vs prod (birth 10/10, military 5/5 after size fix; marriage gen ready) + README; (2) ua_military_id mirror schema (source=official booklet blank, verified vs real doc; keys=docintel, no aliases) + registry + 2 tests (PDF renders, [CONFIRM] works) + stale no-schema test updated; (1) Playwright E2E wizard smoke (config+spec birth/military+workflow on deployment_status) + methodology entry in OPS_INCIDENT_LOG; first live run in progress.
- 2026-06-11 FULL-COVERAGE P1/3/4/7 docs: DOC_COVERAGE_MATRIX (10×12, gaps W1/F1/F2/M1/S1/US), HANDWRITING_RULES_PER_DOCCLASS (vintage=true 5/5, printed=false 5/5, anti-fab cross-ref), DICTIONARY_RULES_INVENTORY (KEY: translationRule = declarative, исполнение upstream), HANDWRITTEN_CYRILLIC_COVERAGE_PROOF (fixtures×prod, rotation 4-way, E2E 2/2 GREEN, edge: HEIC/PDF unsupported, 45° limitation).
- 2026-06-11 FULL-COVERAGE code: divorce в TranslateWizard (tile+samples+title, autoread) + divorce→marriage_apostille docClass mapping + 2 synthetic generators (divorce 5/5, id-card 5/5 vs prod) + labels-test +divorce (8/8) + /supported-documents страница (registry-driven, 4 локали, 10 классов, ✍️-бейджи) + линк из визарда + E2E spec → 6 классов + inventory-page check.
- 2026-06-11 CI-smoke fixes: marriage/divorce fixtures bumped past the 300KB apostille quality-gate (paper-grain noise; marriage now 6/6 vs prod); page-test locators .first() (strict-mode). 4/6 wizard cases were already green in CI incl divorce/passport/id-card.
- 2026-06-11 E2E COMPLETE: все 6 wizard-кейсов GREEN в CI (marriage 22.7s после fixture-fix; military через retry=транзиент); page-тест починен (бейдж внутри collapsed details → scoped expand) и зелёный локально 921ms.

<!-- 2026-06-13: added Part 3 OUTPUT-format TL;DR block to docs/audit/2026-06-13-DOCUMENT_CORE_AND_PROJECT_STATE_AUDIT.md (audit-only, no code change). -->

<!-- 2026-06-13: added Part 4 (Phase 1 ONE-CENTRAL-BRAIN gap audit) to docs/audit/2026-06-13-DOCUMENT_CORE_AND_PROJECT_STATE_AUDIT.md. Finding: SHAPE DONE / CURRENCY NOT CONTINUOUS — Core CanonicalDocumentResult still discarded after read & rebuilt from legacy DTO at packet boundary (crit #3 FAIL). Phase1 ~55-65%. Audit-only, no code change. -->
