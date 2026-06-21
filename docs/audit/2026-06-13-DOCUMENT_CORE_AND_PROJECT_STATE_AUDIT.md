# DOCUMENT CORE + PROJECT STATE — CONSOLIDATED AUDIT (2026-06-13)

> **READ THIS BEFORE TOUCHING THE PROJECT.** Single source of audited truth for the
> brain/dictionary/arbitration/canonical pipeline AND the repo/PR/security/deploy
> state. Strict evidence-only: every claim has a `file:line`, a command, or a test
> result behind it. Where something could not be verified it is marked `UNVERIFIED`.
> No PII values appear in this document (redacted to category/count).

- **Audited at:** branch `validation/forms-field-by-field` @ `76c49e2` (PR #116, OPEN/not merged). *Parts 1–2 were first written at `1d2bf41`; the branch then advanced one commit (`76c49e2` — the I-821/I-131→CanonicalField migration), which is in this audit.*
- **main:** `4d3e470` (PR #115, Phase 2A) = **current production** (verified live: `messenginfo.com/api/healthz` → `sha=4d3e470`; Vercel latest `target:production` = `4d3e470`)
- **Method:** git/gh, ripgrep, direct file reads, local `tsc`, vitest (incl. live real-doc gate), redacted PII grep, **live Vercel + Supabase MCP** (Part 3)
- **Overall result:** `DEGRADED` (functional, well-guarded, verified — with the specific gaps in the Risk Registers below)
- **Scope:** Part 1 = repo/PR/security/deploy. Part 2 = Document Core (brain/dictionary/arbitration/canonical). **Part 3 = full system runtime (routes, DB, storage, auth, env, deploy, monitoring, flows, packets, archive, deps, dead code, security, production truth).**

---

## ⚠️ CORRECTIONS TO EARLIER AUDIT CLAIMS (do not trust the stale version)

1. **Forms are NOT "legacy-DTO only".** All three forms delegate **document-derived** fields
   to shared canonical document mappers. Verified by direct read:
   - I-821: `apps/web/src/lib/tps/forms/i821FieldMap.ts:46,58` → `buildI821DocumentOps(i821DocumentFactsToCanonical(a))`
   - I-131: `apps/web/src/lib/reparole/i131FieldMap.ts:39,57` → `buildI131DocumentOps(i131DocumentFactsToCanonical(a))`
   - I-765: both `tps/forms/i765FieldMap.ts` and `ead/i765FieldMap.ts` call the same `buildI765DocumentOps` (`canonical/forms/i765DocumentMapper.ts`).
   The legacy DTO (`TPSAnswers`/`ReParoleAnswers`/`EadFieldData`) is only the **input envelope** carrying user-declared wizard data; document fields are owned by the canonical mappers via per-product boundaries.
2. **`canonical/forms/i821DocumentMapper.ts` and `i131DocumentMapper.ts` DO exist** (not just i765). An earlier pass missed them by reading only the `buildIXXXOps(a: TPSAnswers)` signature and not the body.

---

# PART 1 — REPO / PR / SECURITY / DEPLOY STATE

### Repo / branch / PR truth
- repo: `github.com/2133611700c-sudo/uscis-helper`
- PR **#116 OPEN, NOT merged** (`gh pr view 116` → `mergedAt:null`); base `main`, head `validation/forms-field-by-field`.
- Merged: #115 (Phase 2A real-doc), #114 (Phase 1 canonical cutover), #113 (canonical foundation), #112 (security/PII gate).
- PR #116 checks: `Forbidden patterns + typecheck + build` = **pass**; `session-docs-guard` = pass; `Vercel` preview = pass.
- Working tree: untracked `apps/web/osd.traineddata` (Tesseract binary — should be gitignored) + `monitoring/`. `apps/web/tsconfig.tsbuildinfo` is a tracked build artifact that local `tsc` touches (do not commit).
- No abandoned worktrees.

### Security / PII gate — `PASS (fail-closed, verified)`
- Gate: `.github/workflows/guards.yml` step **"Block real owner PII"**.
- **Fail-closed:** missing/empty `OWNER_PII_PATTERNS_B64` on CI ⇒ `exit 1` (not skip). Local opt-out only via `ALLOW_MISSING_PII_SECRET=1`.
- **Secret-backed:** exact tokens are NOT in the repo; GitHub secret `OWNER_PII_PATTERNS_B64` present (created 2026-06-13). Local `.pii-patterns` (gitignored) is the proxy.
- **Self-test:** synthetic-marker positive+negative step proves the grep fires. Hygiene: `mktemp 0600` + `trap` cleanup; logs **only** `file:line`, never the value.
- **Sensitive applicant PII = 0 tracked hits** (surname, passport#, A#, SSN, EAD#, DOB) — scrubbed; verified by redacted `git grep`.
- Private fixtures: `qa-private/` = 0 tracked; `test-fixtures` = 117 tracked but all synthetic/degraded/proof-yaml. `.gitignore` enforces block-everything on `docs/reports/evidence/`, `reports/`, `qa-shots/private`, `test-fixtures/{owner,real-docs}`, `*.log`, `*.swp`.
- **GAP (MEDIUM):** the public Handy & Friend business contact (address documented at `CLAUDE.md:66`, phone, `…@gmail` local-part) is tracked across source/tests/docs incl. client-visible `apps/web/messages`. Business-public and intentional (content rule + fixed test placeholder), but **NOT covered by the gate's secret list** → not flagged on drift.
- **UNVERIFIED:** the GitHub secret's decoded contents cannot be inspected; whether it matches the local `.pii-patterns` proxy is unknown.

### Production truth
- Production = `main 4d3e470` = Phase 2A. Phase 1 cutover (#114) + security gate (#112) ARE in prod.
- Phase 2B form-mapper fixes (gender inversion, A#/SSN normalizers, DOB/other-names remap) exist **ONLY in PR #116 — NOT in production**.
- STATUS.md / HANDOFF.md are **honest** — both explicitly say "PR open, NOT merged" for 2B. Minor staleness: healthz SHA quoted in STATUS/HANDOFF (`203b572`) is an old session value, ≠ current main.

---

# PART 2 — DOCUMENT CORE / DICTIONARY / ARBITRATION / CANONICAL

### A. Document Core (the live pipeline is assembled per-route, NOT via the `readDocumentCore` wrapper)
```
readDocument (docintel/documentFieldReader.ts:33, LIVE)
  → Gemini vision (geminiVisionProvider.ts, LIVE; model-fallback chain → review flag)
  → KMU-55 transliteration (transliterationPolicy.ts:106, LIVE)
  → docintelToCandidate (canonical/core/translationAdapter.ts:32, LIVE)
  → applyKnowledgeBrainIfEnabled (canonical/core/knowledgeBrain.ts:47 → arbitrateDocument @ arbitration.ts:124, LIVE)
  → buildCanonicalResult (canonical/core/buildCanonicalResult.ts:24, LIVE — pure wrapper)
  → per-product adapter (tpsAdapter / reParoleAdapter / eadAdapter / translationAdapter) → consumer
```
- `canonical/core/readDocumentCore.ts:17` = **DEAD** v1 wrapper ("NOT wired to any product"); the live routes assemble the same pieces manually. The arbitration/dictionary **core itself is LIVE**.
- Single canonical model: `CanonicalField`/`CanonicalDocumentResult` defined once in `canonical/types.ts`. `canonical/core/types.ts` = different reader-layer types (no duplicate model).
- Provenance carried end-to-end: `CanonicalField.evidence[]` + `rawCyrillic` (`types.ts:97,105`).

### B. Dictionaries — ONE shared engine, all in `packages/knowledge/`
- **KMU-55 UA→Latin**: `packages/knowledge/src/transliterate.ts:54` — single source. LIVE via `transliterationPolicy.ts:106`.
- **Controlling-Latin guard CONFIRMED** (`transliterationPolicy.ts:92`): an already-Latin value is kept verbatim, never re-transliterated (passport/MRZ romanization wins).
- **Modern-rename = REVIEW-FLAGGED, not auto-applied** (`normalize.ts:263`): Dnipropetrovsk→Dnipro etc. preserves historical name + forces review. Matches CLAUDE.md.
- Live: `SEX_MAP` (dictionary.ts:290), `AUTHORITIES`+patterns (dictionary.ts:41, Militsiya-era preserved), OBLAST genitive→nominative + `DMS_ENGLISH` (dictionary.ts:312), `SETTLEMENT_TYPES` (dictionary.ts:235, смт="urban-type settlement"), `GEO_CORRECTIONS` (dictionary.ts:215), patronymic engine (patronymic.ts), MRZ parser (mrz.ts), nominative case restorer, registry glossary (fallback), glossary loader (translation).
- **Gated OFF by default:** Gazetteer fuzzy `snapCity` (`SMART_NORMALIZE_ENABLED`), Russian BGN/PCGN transliteration (`RU_TRANSLIT_ENABLED`).
- **DEAD:** `translation/generateTranslationHTML.ts:461 transliterateCyrillic()` — HTML rendering only, NOT extraction path. **Do not add a second normalization module — `packages/knowledge` is canonical (AGENTS.md rule).**

### C. Arbitration (`canonical/core/arbitration.ts`, 8 rules)
Authority order: valid-MRZ (0.99) → invalid-MRZ (0.3 + review) → critical-no-MRZ-anchor (+review) → provider-conflict (+review) → fuzzy (+review) → low-confidence <0.85 (+review) → reader-flag-carried → empty-filtered.
- Hallucinated value can only be selected if highest-authority AND non-empty, and is then gated by confidence/conflict/MRZ/knowledge-brain review. **Live trace = 0 FABRICATED on real docs.**
- **Empty cannot win / blank page cannot clobber** — empties filtered at `arbitration.ts:62` before selection.
- **MRZ authoritative for Latin name** (`arbitration.ts:71`), never re-transliterated.

### D. Canonical field contract (`canonical/core/fieldAccessor.ts:9`)
`finalValue===null` → **hard reject, NO fallback**; `string` → release; `undefined` → `normalizedValue ?? rawValue`. **Sole writer of `finalValue` = `applyOcrFieldSafety` (C3)** — single owner, never written by arbitration or knowledge brain. Forbidden (documented): `finalValue ?? normalizedValue` (would resurrect a rejected value).

### E. Identity fields
Source hierarchy MRZ > authority-doc (EAD/I-94/I-797) > document_ocr > ai_vision > manual.
Normalizers: names→formatLatinName+KMU-55; sex→SEX_MAP; dates→normalizeDate (**refuses** ambiguous DD/MM↔MM/DD → null, no guessing); authority→dict; city→snapCity(gated)+normalizePlace; a_number→strip-to-9-digits.
Corruption-risk flags: patronymic reconciliation (MEDIUM — suggests, review-gated), snapCity fuzzy (MEDIUM — review-gated), all-caps name can't recover internal caps (LOW, raw preserved).

### F. Translation
**Translation Builder reads `CanonicalField[]` DIRECTLY = YES** (`canonical/core/translationAdapter.ts:79 canonicalToFieldOut` via `getCanonicalValue`). No route-local transliteration/date/country logic; same shared knowledgeBrain. Only post-canonical transform = settlement-designator re-add (mirror preservation, guarded against double-add). Parity tests: `translationCanonicalParity.test.ts`, `adapterTranslation.test.ts`.

### G. Forms (see Corrections at top)
- I-821 → `i821DocumentMapper.ts`; I-131 → `i131DocumentMapper.ts`; I-765 (TPS+EAD) → shared `i765DocumentMapper.ts`.
- Verified fixes in code + 46 passing field-by-field tests: I-131 gender widget inversion (target by on-value, `i131FieldMap.ts:112-123`), A#/SSN normalizers, no-fabricated-DOB, other-names→correct cells.
- `normalizeCountryOfBirth` (oblast→Ukraine) runs at **TPS** boundary (i765/i821) but **NOT** at reparole/ead boundaries (pass-through) — asymmetry (see risks).

### H. Consumer map + parity
`Document → readDocument → candidates → knowledgeBrain/arbitration → CanonicalDocumentResult → {Translation, I-821, I-131, I-765, packet gen, review UI}`. Adapters are **thin/non-mutating** (preserve review flags, never lower them; EAD `invented_fields_count=0` contract). **100 deterministic parity tests pass** (translationCanonicalParity, formMapperCanonicalParity, independentCrossProductAudit, eadAdapter, adapter, canonicalContract).

### I. Duplicate-brain detection
- **Zero route-local transliteration / dictionary re-application** (brain runs once in vision-extract).
- **Triplicated PDF-formatting helpers** `toUscisDate()` / `toXXXANumber()` in i765/i821/i131 DocumentMappers (+ tps/reparole answers.ts) — LOW (formatting), drift risk.
- A-number digit-validation duplicated in `/api/tps/generate-packet:76` and `/api/reparole/generate-packet:62` (firewall, count-only) — MEDIUM.

### J. Fallbacks (all loud except one fail-open logged path)
| location | trigger | result | class |
|---|---|---|---|
| geminiVisionProvider.ts:42 | primary model 503/timeout | retry flash; fields flagged `fallback_model_used`+review | loud/provider |
| tps/ocr/extract:1255 | core throws | old TPS module path; `fallback_used=true` | loud/legacy |
| reparole/ocr/extract:278, ead/ocr/extract:250 | core throws | 500 + `fallback_used=true` | loud |
| arbitration.ts:77 | MRZ check-digit fail | value kept, conf 0.3, review | loud |
| arbitration.ts:148 | D2 rule throws | keep un-enriched read | silent but PII-free logged (fail-open) |

No silent value-substituting fallback.

### K. Live runtime trace (real owner EAD + I-94, PII-free verdicts; ran 2026-06-13)
```
EAD  (canonical docintel us_ead → knowledgeBrain → toEadAnswers):
  family_name=SAME given_name=SAME a_number=SAME card_number=SAME ead_category=SAME
  date_of_birth=EMPTY (honest — not on card)   [others GT_MISSING]
I-94 (canonical docintel us_i94 → toEadAnswers):
  family_name=SAME given_name=SAME date_of_birth=SAME
  i94_admission_number=SAME class_of_admission=SAME date_of_entry=SAME   [place GT_MISSING]
I-765 golden parity: TPS boundary ops == EAD boundary ops (IDENTICAL); C3-rejected field absent from PDF.
Legacy Google-Vision leg: all FALLBACK (no Vision creds locally — non-production path).
Result: 0 FABRICATED, 0 REVIEW_LOST across both real docs. 8/8 legs pass.
```
Harness: `apps/web/src/lib/canonical/forms/__tests__/realDocGate.i94Ead.live.test.ts` (gated `RUN_REAL_DOC_GATE=1`, PII-free verdict-enum output only).

---

# CONSOLIDATED RISK REGISTER

**BLOCKER:** none.

**HIGH**
- **C3 OCR Field Safety OFF by default** (`documentSafety/applyOcrFieldSafety.ts:20`, `=== '1'`; test "absent → false"). The strongest anti-fabrication gate (rejects unsafe critical values, `finalValue=null`) is inactive unless `OCR_FIELD_SAFETY_ENABLED=1` in prod. With it off, a high-confidence hallucination on a critical field lacking an MRZ anchor relies only on the soft review flag. **Prod value UNVERIFIED.**
- **Phase 2B form fixes are PR-only, not in production** — incl. the I-131 gender inversion that checked the wrong sex box for every applicant. Real prod users hit unfixed mappers until #116 merges.
- **Two live I-765 field-map wrappers** (TPS + EAD) — mitigated (both call the one shared document mapper; golden-parity proven), but the duplicate wrapper is the consolidation target.

**MEDIUM**
- Country-normalization boundary asymmetry (TPS normalizes oblast→Ukraine; reparole/ead pass-through).
- Triplicated date/A-number formatting helpers across 3 mappers + answers files → drift risk.
- A-number validation duplicated in 2 generate-packet routes (count-only, not position).
- Business contact PII tracked outside gate coverage (incl. client-visible `apps/web/messages`).
- **Multi-page passport cross-page merge** not located in audited core files — blank-page clobber proven safe in arbitration, but session/product-level merge UNVERIFIED.

**LOW**
- Gazetteer (`SMART_NORMALIZE_ENABLED`) + RU transliteration (`RU_TRANSLIT_ENABLED`) OFF by default (likely intentional per regression history).
- `readDocumentCore` dead wrapper coexists with live manual pipeline (design-drift/confusion risk).
- Untracked `apps/web/osd.traineddata` binary should be gitignored.

---

# TEST / BUILD EVIDENCE (this audit, local)
- `tsc --noEmit` → **exit 0**.
- Field-by-field forms: **46/46 pass** (i821/i131/i765 harnesses).
- Consumer-parity + cross-product audit: **100 pass / 1 skip**.
- Live real-doc gate (EAD+I-94): **8/8 pass**, 0 FABRICATED, 0 REVIEW_LOST.
- Full suite + `pnpm build`: NOT re-run locally; verified GREEN via PR #116 CI (`Forbidden patterns + typecheck + build` job runs both). STATUS claims 3456 pass / 18 skip (not independently re-run).

# UNVERIFIED (must not be stated as fact)
- Production env-flag values: `OCR_FIELD_SAFETY_ENABLED`, `KNOWLEDGE_BRAIN_ENABLED`, `SMART_NORMALIZE_ENABLED`, `RU_TRANSLIT_ENABLED` (Vercel prod config not readable here; defaults established from code only — Knowledge Brain default ON, C3 default OFF).
- Multi-page passport cross-page merge (session/product level).
- Translation mirror-template injection (`buildMirrorValues` builders not exhaustively read).
- `lib/tps/ai/documentBrain.ts` (DeepSeek gap-fill, behind `TPS_AI_BRAIN_ENABLED`) — own formatting helpers, not fully read.
- Live accuracy beyond EAD/I-94 (passport/birth/marriage GT absent).
- GitHub secret contents vs local `.pii-patterns`.

# SINGLE RECOMMENDED NEXT ACTION
Verify (read-only) the four production env flags in Vercel — above all whether `OCR_FIELD_SAFETY_ENABLED=1` in prod. If C3 is off in production, that is the highest-leverage correctness gap to close before the canonical-single-currency refactor; if on, the HIGH risk downgrades and the refactor proceeds on a clean, verified base. (Merging PR #116 first also moves the verified form-mapper fixes into production.)

---

# PART 3 — FULL SYSTEM RUNTIME AUDIT (everything outside the Document Core)

## Part 3 — TL;DR (OUTPUT format)
```
RESULT: DEGRADED

SYSTEM_ARCHITECTURE: Next.js 14 App Router (TS strict) on Vercel. 44 page routes,
  51 API routes, 1 middleware (bot-block + /admin cookie guard + i18n + headers;
  /api/* excluded → self-guard), 29 migrations. Cron: /api/cron/cleanup daily 02:00
  UTC + 11 GitHub-Actions monitors.
DATABASES: Supabase Postgres 17, project rtfxrlountkoegsseukx (ACTIVE_HEALTHY),
  38 live tables. Hot: tps_ocr_audit 662, monitoring_alerts 400, audit_logs 184,
  extracted_fields 138, wizard_sessions 45, translation_sessions 32. Dead/drift:
  translations_orders (vs active translation_orders), form_sessions/form_answers,
  /api/review→reviews (table absent → silent loss).
STORAGE: buckets translation-uploads (30d TTL), packets (7d TTL, signed), wizard/*
  (30d DB TTL); daily cron cleanup (3 passes). Gaps: wizard storage objects not
  purged on cascade; final_renders no TTL.
AUTH: Owner (email HMAC code→cookie, Stripe bypass); Admin (ADMIN_SECRET→cookie,
  /admin 404 if unauth); Stripe webhook sig-verified; cron/diag token-gated.
  GAP: product OCR/extract routes accept client session_id without DB validation.
ENV: ~96 vars. KNOWLEDGE_BRAIN_ENABLED ON; all other flags OFF by default
  (OCR_FIELD_SAFETY, ANTI_FABRICATION, GUARD_BLOCK_METRICS, CERTIFIER_* …) —
  confirmed OFF in prod by 0-row audit tables. .env.example drift (Vision/Gemini/flags).
DEPLOYMENT: prod=push main→Vercel target:production; preview=per-branch.
  production_sha=4d3e470 (healthz+Vercel verified); preview_sha=76c49e2 (PR#116 OPEN).
  Rollback=Vercel Promote-to-Production on a prior READY deploy.
MONITORING: /api/healthz (public) + /api/health (token deep) + 11 GH-Actions monitors
  (Telegram/Resend). Blind spots: no live Vision/Gemini/DeepSeek probe, no Stripe-
  webhook-failure monitor, guard-block alerting dark, prod-safety window expired.
USER_FLOWS: TPS (paid, ZIP I-821+I-765), Re-Parole (paid, ZIP I-131), EAD (FREE,
  single I-765 PDF, no order/audit trail), Translation (paid, full review→certify→
  render→email). All four verified end-to-end in code.
PACKETS: one shared prefill() (TPS/Re-Parole/EAD); doc fields via canonical
  i{765,821,131}DocumentMapper.ts; Translation = separate mirror renderer. SHA-256
  form-integrity pinned. No duplicate packet entry points.
ARCHIVE: manual-review queue + operator UI + certification trail = LIVE.
  guard_block_events / certifier_override_audit / translation_certification_audit =
  implemented but DARK (0 rows, flags OFF). General "archive" = planned-only.
DEPENDENCIES: BLOCKER Supabase, Google Vision. HIGH DeepSeek, Stripe.
  MEDIUM Gemini (flag-gated, falls to Vision), Resend, Upstash. LOW Telegram, monitors.
DEAD_CODE: readDocumentCore.ts (unused wrapper), legacy transliterateCyrillic()
  (HTML-only), /api/review→reviews (silent loss), translations_orders/form_sessions/
  form_answers tables. OFF flags = dormant, not dead.
SECURITY: secrets server-only; prompt-injection guard + PII scrubber on /mia/chat;
  uploads MIME/size-capped. Risks: missing session validation before paid AI (MED);
  in-memory rate limiter unless Upstash (LOW); RLS anon-path effectiveness UNVERIFIED.
PRODUCTION: prod (4d3e470) = Phases 0–2A (#112–#115). PR-only (76c49e2, NOT in prod):
  Phase 2B form fixes (I-131 gender inversion, A#/SSN, DOB) + I-821/I-131→CanonicalField.
RISKS: HIGH — C3 (OCR_FIELD_SAFETY) OFF in prod; Phase 2B correctness fixes PR-only.
  MEDIUM — session-validation gap, wizard storage orphans, /api/review silent loss,
  dark audit tables, EAD no audit trail, drift tables. LOW — rate-limiter, env drift,
  dead wrapper, untracked osd.traineddata.
VERIFIED_FACTS: prod 4d3e470 & preview 76c49e2 (Vercel+healthz); 38 tables w/ counts;
  0-row audit tables ⇒ flags OFF; tsc 0 / 46 field tests / 100 parity / 8 live legs (0 fab).
UNVERIFIED_CLAIMS: exact Vercel prod env values; RLS anon-path; youtube-monitor impl;
  Stripe webhook idempotency; whether wizard doc/packet/email 0-rows are intentional.
RECOMMENDED_NEXT_ACTION: read prod Vercel env (read-only) to confirm flag posture —
  above all OCR_FIELD_SAFETY_ENABLED — and merge PR #116. Rest = MEDIUM/LOW cleanup.
```

**RESULT: `DEGRADED`.** Stack: Next.js 14 App Router (TS strict) + Supabase (Postgres 17, project `rtfxrlountkoegsseukx`) + Vercel (project `prj_G5Bwd5VM…`, team `team_qRGWLc9k…`). External: Google Vision (OCR), Gemini (vision, flag-gated), DeepSeek (extraction/Mia), Stripe (payments), Resend (email), Telegram (alerts), optional Upstash (rate limit). Counts: **44 page routes, 51 API routes, 1 middleware, 29 migrations, 38 live tables.**

## A. Runtime architecture
- **Page routes (44):** info (7), service hub (2), TPS (6), Re-Parole (6), EAD (2), Translation (5), supporting (6), admin (2: `/admin/manual-review[/[id]]`), owner, order/[id], delete-confirmed.
- **API routes (51):** TPS (7), Re-Parole (3), EAD (2), Translation (~18), order (2–3), Stripe (2: checkout, webhook), owner-auth (4), packet/generate (1, legacy text), admin manual-review (2), cron (`/api/cron/cleanup`), health (`/api/health` token-gated, `/api/healthz` public), diagnostics (`_diag/vision`, `mia/chat`, `tps/health`, `central-brain/health`).
- **Middleware** (`apps/web/src/middleware.ts`): bot/UA block (403), admin cookie guard for `/admin/*` (returns 404 if unauth), next-intl locale routing, security headers. **`/api/*` is EXCLUDED from the matcher** → each API route must self-guard.
- **Cron:** Vercel `vercel.json` → `/api/cron/cleanup` daily `0 2 * * *` (CRON_SECRET bearer). Plus 11 GitHub-Actions scheduled monitors (see G).
- **Chain:** User → `[locale]` wizard page → product API route → `lib/{tps,reparole,ead,translation}` + `lib/canonical` core → Supabase/Storage/PDF → ZIP/PDF/email.

## B. Database (LIVE Supabase ground truth — row counts confirm usage)
- **Active/used:** `tps_ocr_audit` (662), `monitoring_alerts` (400), `audit_logs` (184), `extracted_fields` (138), `wizard_sessions` (45), `canonical_answers` (42), `dead_links_log` (41), `translation_sessions` (32), `monitoring_sources` (26), `translation_documents` (17), `extraction_runs` (16), `final_renders` (14), `user_corrections` (10), `audit_log` (8), `certification_records` (8), `manual_review_queue` (6), `manual_review_events` (6), `translation_orders` (2), `translation_payments` (1), `form_editions` (1).
- **Created but NEVER written (0 rows):** `guard_block_events`, `certifier_override_audit`, `translation_certification_audit` (all gated behind OFF flags — observability/audit trails are dark), `numeric_evidence`, `translation_quality_log`, `translation_events`, `official_sources`, `assistant_threads` (Mia), `email_events`, `session_members`, `session_documents`, `manual_answers`, `generated_packets` (wizard sub-tables — wizard_sessions persists 45 but its document/packet/email children are empty → those flows persist elsewhere or are ephemeral), `profiles`, `form_sessions`, `form_answers`.
- **Duplicate / naming-drift tables (DEAD):** `translations_orders` (0 rows, from `minimize_schema_v1`) vs the **active** `translation_orders` (2 rows). `form_sessions`/`form_answers` (legacy minimize schema, 0 rows) superseded by `wizard_sessions`/`manual_answers`.
- **Undefined table written by code:** `/api/review` inserts into a `reviews` table that **no migration creates and is absent live** → silent data loss. DEAD endpoint.
- **Clients:** `lib/supabase/admin.ts` (service-role, server-only), `client.ts` (anon, browser), `server.ts` (anon + cookies). All 38 tables have `rls_enabled:true`.

## C. Storage
- Supabase Storage buckets: `translation-uploads` (user files; 30-day TTL via cron PASS 1), `packets` (ZIP/PDF output; 7-day TTL via cron PASS 3, signed URLs), `wizard/{session}/…` (session docs; 30-day DB TTL). Cleanup = `/api/cron/cleanup` (daily 02:00 UTC, 3 passes).
- **Gap:** wizard upload *storage objects* are not explicitly purged when DB rows cascade-delete (orphan risk). `final_renders` PDFs have no observed TTL/expiry.
- Local-only artifacts (gitignored, not prod): `qa-shots/`, `reports/`, `test-results/`, `docs/reports/evidence/`.

## D. Auth
- **Owner** (`lib/ownerAccess.ts`): email 6-digit HMAC code (10-min TTL) via Resend → signed httpOnly `__owner_session` cookie (30 d). Bypasses Stripe.
- **Admin** (`middleware.ts` + `adminAuth.ts`): `?token=ADMIN_SECRET` → `admin_session` cookie (30 d, httpOnly/Secure/SameSite=strict). `/admin/*` returns 404 if unauth (doesn't reveal existence). `/api/admin/*` self-checks `requireAdminAuth()`.
- **Stripe webhook:** signature-verified. **Cron:** CRON_SECRET bearer. **Deep health:** `x-health-token`. **`_diag/vision`:** `INTERNAL_DIAG_TOKEN`.
- **GAP (MEDIUM):** product OCR/extract/generate routes (`/api/{tps,translation,ead,reparole}/…`) accept a client `session_id` but several do **not validate it exists in DB** before calling paid OCR/AI → quota-exhaustion abuse vector. Mitigated only by per-IP rate limits.

## E. Environment / feature flags (~96 env vars; flag defaults from code)
- **Required (prod-blocking):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DEEPSEEK_API_KEY`; Vision creds (`GOOGLE_VISION_SERVICE_ACCOUNT_JSON` or API-key variants — **not in `.env.example`**).
- **Conditional (graceful-degrade):** `STRIPE_*`, `RESEND_API_KEY`, `GEMINI_API_KEY*`, `TELEGRAM_*`, `KV_*`/`UPSTASH_*`.
- **Feature flags & code defaults:** `KNOWLEDGE_BRAIN_ENABLED` **ON** (`!=0`); **OFF** by default → `OCR_FIELD_SAFETY_ENABLED`, `MIRROR_PDF_ENABLED`, `ENSEMBLE_DATE_ENABLED`, `AUTO_ORIENT_ENABLED`, `RU_TRANSLIT_ENABLED`, `SMART_NORMALIZE_ENABLED`, `ANTI_FABRICATION_GATE_ENABLED`, `SELF_CONSISTENCY_GATE_ENABLED`, `TPS_AI_BRAIN_ENABLED`, `TPS_GEMINI_VISION_ARBITER_ENABLED`, `DUAL_OCR_CROSSREF`, `ONE_BRAIN_SHADOW`, `GUARD_BLOCK_METRICS_ENABLED`, `CERTIFIER_AUDIT_PERSIST_ENABLED`, `CERTIFIER_OVERRIDE_ENABLED`, `REFUND_AUTOTICKET_ENABLED`. Live DB 0-row counts on `guard_block_events`/`certifier_override_audit`/`translation_certification_audit` **confirm those flags are OFF in prod.**
- Drift: many flags + Vision/Gemini/DeepSeek model vars are referenced in code but absent from `.env.example`. `.env.example` ships a real owner contact email in `CONTACT_EMAIL_DESTINATION` (business address, not applicant PII).

## F. Deployment (LIVE Vercel ground truth)
- **prod_source:** push to `main` → Vercel `target:production`. **preview_source:** push to any branch → preview URL. PR #116 previews are previews only.
- **production_sha = `4d3e470`** (latest `target:production`, `isRollbackCandidate:true`; healthz agrees). Prior prod rollback candidates: `0561600` (#114), `fb9d55d`(#112)… **rollback path:** Vercel "Promote to Production" on a prior READY deployment.
- **preview_sha = `76c49e2`** (PR #116 head, READY preview, NOT production).
- `vercel.json`: build `pnpm --filter web build`, `www→apex` 308 redirect, security headers, `trailingSlash:false`.

## G. Monitoring
- Health: `/api/healthz` (public liveness, returns sha/env), `/api/health` (token-gated deep: DB + storage + provider-configured booleans).
- 11 GitHub-Actions monitors: post-deploy-smoke (vision-extract value check), post-deploy-ui-smoke, prod-safety-monitor (temporary window, expired 2026-06-07), guard-block-rate-check (hourly→Telegram), escalation-tick (30 min→Telegram), uscis-news-monitor (6 h), federal-register-monitor (daily→Resend digest), daily-reconciliation (daily→Resend), supabase-drift-check (daily, needs secrets), dead-link-checker (daily), form-edition-checker (weekly), youtube-monitor (daily, impl unverified). Plus guards.yml + session-docs-guard on push.
- **Blind spots:** no live Vision/Gemini/DeepSeek health probe (only post-deploy smoke), no Stripe-webhook-failure monitor, no DeepSeek cost monitor, guard-block alerting is dark (table 0 rows + flag OFF).

## H. User flows (all 4 verified end-to-end in code)
- **TPS** (paid): wizard → `/api/tps/ocr/extract` (Vision + canonical + optional Brain) → field review → Stripe → `/api/tps/generate-packet` → ZIP {I-821, I-765?, INSTRUCTION, translation?} → `/order/[id]`.
- **Re-Parole** (paid): wizard → `/api/reparole/ocr/extract` (canonical) → manual Q&A → Stripe → `/api/reparole/generate-packet` → ZIP {I-131, README}. Legacy `/api/packet/generate` (9 txt files) still present.
- **EAD** (FREE): upload/manual → `/api/ead/ocr/extract` → `/api/ead/generate-packet` → single I-765 PDF (no Stripe, no order row, no email — no audit trail).
- **Translation** (paid): session → upload → vision-extract/process (classify+glossary+normalize) → review page (confirm/correct per field) → Stripe → `/api/translation/certify` (signature) → `/render` PDF → email → `/order/[id]`. Most-exercised product per DB.

## I. Packets
- One `prefill()` (`lib/tps/pdfPrefiller.ts`) shared by TPS/Re-Parole/EAD; document fields now via canonical `lib/canonical/forms/i{765,821,131}DocumentMapper.ts`. Translation uses a separate `renderMirrorTranslationPDF` (not prefill). Form integrity SHA-256 pinned (`formIntegrity.ts`); editions I-821 01/20/25, I-131 01/20/25, I-765 08/21/25. ZIP via JSZip per product. No duplicate packet entry points; the only "duplicate" is the I-765 PDF asset shared by TPS+EAD (intended).

## J. Archive / operator
- **IMPLEMENTED & live:** manual review queue (`manual_review_queue` 6 rows + `manual_review_events` 6) with operator UI (`/admin/manual-review`) and server actions (approve/send/operator_completed); certification trail (`certification_records` 8).
- **Implemented but DARK (0 rows / flag OFF):** `guard_block_events`, `certifier_override_audit` (ADR-021), `translation_certification_audit`.
- **NOT built (planned only):** general "archive" system — no table, no route, no code.

## K. Dependency graph
| Service | Purpose | Criticality | Fallback |
|---|---|---|---|
| Supabase | DB + storage + auth | **BLOCKER** | none |
| Google Vision | OCR (all products) | **BLOCKER** | none (503 if creds absent) |
| DeepSeek | field extraction / Mia | HIGH | none for extraction |
| Stripe | payments (TPS/Re-Parole/Translation) | HIGH | owner bypass |
| Gemini | vision read/arbiter | MEDIUM | falls to Vision; flag-gated |
| Resend | email delivery | MEDIUM | in-memory log |
| Telegram | owner alerts | LOW | console log |
| Upstash | distributed rate limit | MEDIUM | in-memory Map (per-instance) |
| Federal Register / USCIS / YouTube | content monitors | LOW | skip on fail |

## L. Dead code (verified)
- `canonical/core/readDocumentCore.ts` — DEAD (not imported outside tests; live routes assemble the pipeline manually).
- `translation/generateTranslationHTML.ts` legacy `transliterateCyrillic()` — DEAD (HTML-gen only, not extraction).
- `/api/review` → `reviews` table — DEAD (table doesn't exist; silent insert failure).
- `translations_orders`, `form_sessions`, `form_answers` tables — DEAD (superseded; 0 rows).
- `ONE_BRAIN_SHADOW` + all OFF-by-default flags — dormant, not dead (intentional infra).
- No `*_v1/_v2/_old/deprecated` files found.

## M. Security surface
- Uploads: 10 MB cap, MIME whitelist; translation persists to Supabase, others memory-only. Key-based storage (no path traversal).
- Secrets server-only; only `NEXT_PUBLIC_{SUPABASE_ANON_KEY, STRIPE_PUBLISHABLE_KEY, APP_URL}` exposed. No secret logged/returned.
- Prompt-injection guard (`security/prompt-guard.ts`, 29 patterns) applied to `/api/mia/chat`; PII scrubber (`security/pii.ts`) on chat + audit logs.
- **Risks:** (1) MEDIUM — missing session-existence validation before paid OCR/AI (quota abuse). (2) LOW — in-memory rate limiter not shared across Vercel instances unless Upstash set. (3) VERY LOW — `_diag/vision` returns masked GCP project/email (token-gated). RLS enabled on all tables but service-role is used for most server writes (RLS effectiveness for anon path UNVERIFIED).

## N. Production truth / documentation drift
- **In production (main `4d3e470`):** Phases 0–2A — security/PII gate (#112), canonical foundation (#113), full canonical cutover incl. I-765 (#114), real-doc validation (#115). Verified live (healthz + Vercel + 0-row audit tables matching OFF flags).
- **PR-only (preview `76c49e2`, NOT in prod):** Phase 2B field-by-field fixes (I-131 gender inversion, A#/SSN normalizers, DOB/other-names) **and** the I-821/I-131→CanonicalField migration. Real prod users still hit the pre-fix mappers until #116 merges.
- **Drift caught:** earlier audit text (written at `1d2bf41`) said I-821/I-131 read legacy DTOs — superseded by `76c49e2`. STATUS/HANDOFF remain honest ("PR open, NOT merged"); stale healthz SHA literals in those docs are cosmetic.

## O. Risk register (Part 3)
**HIGH:** (1) C3 (`OCR_FIELD_SAFETY_ENABLED`) OFF in prod (confirmed by 0-row `*_audit` tables) — strongest anti-fabrication gate inactive. (2) Phase 2B form-correctness fixes are PR-only, not in prod.
**MEDIUM:** (3) missing session validation before paid OCR/AI (quota abuse). (4) wizard storage-object orphan + `final_renders` no-TTL. (5) `/api/review`→nonexistent `reviews` table (silent loss). (6) dark audit/observability tables (guard_block/certifier_override/cert_audit) = no fraud/guard telemetry. (7) EAD free path has no order/audit trail. (8) duplicate/drift tables (`translations_orders`, `form_sessions`).
**LOW:** (9) in-memory rate limiter unless Upstash set. (10) `.env.example` drift (Vision/Gemini/flags undocumented). (11) youtube-monitor impl unverified; prod-safety-monitor window expired. (12) `readDocumentCore` dead wrapper. (13) untracked `apps/web/osd.traineddata` binary.

## Verified facts (Part 3)
- prod sha `4d3e470` (healthz + Vercel target:production); preview `76c49e2` (PR #116 open).
- 38 live tables with row counts (above); 3 audit tables at 0 rows confirm OFF flags.
- 44 pages / 51 API routes / 1 middleware / 29 migrations.
- `reviews` table absent live → `/api/review` silent loss.
- Supabase project `rtfxrlountkoegsseukx` ACTIVE_HEALTHY (pg 17.6).

## Unverified (Part 3)
- Exact Vercel prod env values (flags inferred from code defaults + 0-row tables, not read directly).
- RLS policy effectiveness for the anon path (most writes use service-role).
- youtube-monitor implementation; Stripe webhook idempotency; DeepSeek model variant in prod.
- Whether wizard document/packet/email persistence is intentionally storage-only (0 rows in those tables despite 45 sessions).

## Recommended next action (whole system)
One action: **read the production Vercel env (read-only) to confirm the feature-flag posture** — above all `OCR_FIELD_SAFETY_ENABLED`. The 0-row audit tables strongly imply the safety/observability flags are OFF in prod; confirming this (and deciding whether to enable C3 + guard metrics) is the highest-leverage step, and it pairs with merging PR #116 to move the verified form-correctness fixes into production. Everything else in the risk register is MEDIUM/LOW cleanup.

---

# PART 4 — PHASE 1 GAP AUDIT: "ONE CENTRAL BRAIN / ONE CANONICAL CURRENCY"
*Independent code inventory against the owner's 12 Phase-1 acceptance criteria. Method: direct file:line reads + 2 independent sub-agents + test runs. Trust in prior docs = 0.*

**RESULT: NOT `PHASE1_COMPLETE` — status = SHAPE DONE / CURRENCY NOT CONTINUOUS.** The shape migration (every consumer speaks `CanonicalField[]`) is done and parity-green; the **main gap from commit `5512b8c` is NOT closed** — the Core's `CanonicalDocumentResult` is still discarded after the read and a *synthetic* one is rebuilt from a legacy product DTO at packet time.

### The actual runtime (verified)
```
upload → readDocument → arbitrateDocument → CanonicalDocumentResult (REAL provenance)
  → adapter → PRODUCT DTO  (TPSAnswers / ReParoleAnswers / EadFieldData / ExtractedField)   ← Core canonical DISCARDED here
  → wizard / Supabase (user edits)
  → *DocumentBoundary → NEW synthetic CanonicalDocumentResult (provenance FABRICATED: confidence.final=1, source='document_ocr', reviewRequired=false, evidence=[])
  → form mapper → PDF
```
The object the mapper reads is **not** the object the Core produced.

### Acceptance criteria — verdicts (file:line)
| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | All 4 products call one Document Core | ✅ DONE | `documentFieldReader.ts:33` + `arbitration.ts:124` from all 4 OCR routes |
| 2 | Core returns one CanonicalDocumentResult | ✅ DONE | single model `canonical/types.ts:127` |
| **3** | **Result no longer discarded after Core** | ❌ **FAIL** | `reparole/ocr/extract:245 toReParoleCoreAnswers`, `ead:213 toEadAnswers`, `tps:282 canonicalToTpsModuleResult`, `translation/vision-extract:305 toTranslationRows` — canonical→DTO immediately; DTO is what's returned |
| 4 | Translation Builder reads CanonicalField[] | ✅ extract / ⚠️ render | `translationAdapter.ts:79` via `getCanonicalValue`; but `render/route.ts:64` renders from `ExtractedField[]` (DB DTO) |
| 5 | I-821/I-131/I-765 mappers read CanonicalField[] | ⚠️ PARTIAL | true, but canon rebuilt from DTO at boundary: `i821FieldMap:58`, `i131FieldMap:57`, `i765FieldMap:31`/`ead:90` |
| 6 | DTOs only thin adapters, no logic | ⚠️ PARTIAL | canonical→DTO adapters pure; but boundaries run `normalizeCountryOfBirth` (`i821DocumentBoundary:60`, `tps/forms/i765DocumentBoundary:54`) and fabricate provenance in `docField()` |
| 7 | No product fixes name/city/date/sex/authority | ⚠️ PARTIAL | name/city/authority = Core only; but country normalized at TPS boundary, gender enum→M/F at `ead/i765DocumentBoundary:38` |
| 8 | No silent legacy TPS fallback | ✅ DONE | loud: `tps/ocr/extract:1274 fallback_used/core_path`; reparole/ead `core_status:'failed'+fallback_used:true` |
| 9 | One file → same canonical fields across 4 | ⚠️ PARTIAL | parity tests PASS (mapper-level synthetic) + live EAD/I-94 8/8 SAME (extract); end-to-end continuity broken by DTO round-trip |
| 10 | Old vs new compared by parity before removing old | ✅/⚠️ | parity tests exist & green; old adapters not yet removed (correct), continuity still not achieved |

### What IS genuinely done
One Core + frozen contract (`fieldAccessor`/`adapterContract`/`keyAliases`/`buildCanonicalResult`); all 4 OCR routes through one reader+arbitration+knowledgeBrain; all consumers speak `CanonicalField[]`; one shared `buildI765DocumentOps`; canonical→DTO adapters pure (one documented translation settlement-designator exception); loud fallback; parity tests green (44 pass/1 skip); tsc 0; PII clean; live EAD/I-94 extract = SAME / 0 fabrication.

### What is NOT done (the gap)
- **#3 — canonical discarded & rebuilt from DTO** (the central gap). Mapper reads a synthetic canon, not Core's.
- **Boundaries are not pass-throughs**: `normalizeCountryOfBirth` (TPS) + `gender` map (EAD) = semantics outside Core.
- **Provenance loss at boundary**: a Core `reviewRequired=true` becomes `false` at packet time (mitigated — review is surfaced earlier at the OCR/wizard stage, where `reParoleAdapter` preserves it; but the arbiter decision is formally erased at the boundary).
- **Two I-765 wrappers + two boundaries** still live (`buildI765Ops` + `buildEadI765Ops`) — duplicate not removed (awaiting golden-PDF parity).
- **Telemetry incomplete**: routes expose `core_status`+`fallback_used` but NOT the requested `provider`/`arbitration_used`/`knowledge_used`.
- **Translation render** builds from `ExtractedField` (DB), not canon.

### To reach PHASE1_COMPLETE (not executed — audit only)
1. Carry the **same** `CanonicalDocumentResult` (or its session-id) from OCR route → wizard → generate-packet, replacing the DTO round-trip.
2. Collapse `*DocumentBoundary` to pure pass-through (move `normalizeCountryOfBirth`/gender into Core/arbitration).
3. Preserve real provenance (confidence/source/reviewRequired/evidence) to the mapper; stop fabricating.
4. Merge the two I-765 wrappers behind golden-PDF parity; delete the duplicate.
5. Add `provider`/`arbitration_used`/`knowledge_used` to route telemetry.
6. Render translation from canon (or prove DTO↔canon parity).

**Estimate: Phase 1 ≈ 55–65% done.** Expensive correct foundation built (one Core, one contract, shape migration, parity harness, clean adapters); the **single continuous currency is not achieved** — canon is still discarded and reconstructed from legacy DTOs with boundary normalization and provenance loss.

---
*Audit-only (Parts 1–4). No application code changed, no refactor, nothing merged. The audit document + AGENTS.md/CLAUDE.md read-first pointers are the only artifacts. Generated from verified evidence — incl. live Vercel + Supabase MCP, sub-agent cross-checks, and test runs (tsc 0; parity 44 pass/1 skip; live EAD/I-94 8/8) — on 2026-06-13.*
