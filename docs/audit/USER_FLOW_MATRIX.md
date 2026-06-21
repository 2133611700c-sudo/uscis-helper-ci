# USER_FLOW_MATRIX — Audit Agent 1 (Architecture, Code, Data Flow)

Base: main = prod = `02eb595` (verified: `GET https://messenginfo.com/api/healthz` → `{"sha":"02eb595","environment":"production"}` 2026-06-14T20:25Z).
Method: primary source only — real route code, real Supabase MCP (project `rtfxrlountkoegsseukx`), real GitHub PRs, prod healthz. Every claim re-verified.
Status vocab: PROVEN_PRODUCTION | PROVEN_LOCAL | PROVEN_MOCKED | CODE_ONLY | PARTIAL | BROKEN | NOT_WIRED | DEAD_CODE | UNVERIFIED.

---

## 0. Cross-cutting architecture truth (re-verified)

- The runtime "Document Core" is **`apps/web/src/lib/docintel/documentFieldReader.ts` (`readDocument`)**, NOT `lib/canonical/core/readDocumentCore.ts`. The TPS route imports `readDocument from '@/lib/docintel/documentFieldReader'` (tps route:56). `readDocumentCore` has ZERO non-test importers (`grep -rln readDocumentCore` → only self + mrzAuthority + tests). **`readDocumentCore` = DEAD_CODE.**
- `lib/canonical/core/*Adapter.ts` + `buildCanonicalResult` are used by the product routes, but ONLY to (a) shape fields into a product module result and (b) build a canonical record for **shadow persistence**. They do not arbitrate the live output for non-UA-identity slots.
- Canonical continuity default = **shadow** (`continuityMode.ts:55` returns `'shadow'`; legacy global can never reach `enforce`, clamped at :52). Prod env `CANONICAL_MODE_*` is not readable from repo → UNVERIFIED, but DB evidence (24 `canonical_documents` rows, 0 `canonical_overrides`) is consistent with shadow-persist-only, enforce-never.
- Real DB row counts (MCP `list_tables`, 2026-06-14): `tps_ocr_audit`=668, `translation_sessions`=32, `translation_documents`=17, `extracted_fields`=138, `canonical_documents`=24, `canonical_overrides`=0, `manual_review_queue`=5, `translation_orders`=2, `wizard_drafts`=0, `translation_orders_v2`/`document_artifacts`/`delivery_outbox`/`stripe_processed_events`=0.

---

## 1. TPS (I-821 / I-765 TPS) — MOST LIVE FLOW

| Step | File:line | I/O | Storage | Authority | Fallback | Failure mode | Tests | Runtime proof | Status |
|---|---|---|---|---|---|---|---|---|---|
| Route/UI | `app/[locale]/services/tps-ukraine/start/GeneratePacketBlock.tsx` | wizard form | localStorage (PII) | — | — | — | unit | UI live | PROVEN_PRODUCTION |
| Upload→OCR | `app/api/tps/ocr/extract/route.ts` (1464 ln) | image → fields | `tps_ocr_audit` (668 rows) | docintel `readDocument` | old per-doc modules (passport/booklet/birth/military) at :337+ | core error → `coreStatus='error'`, falls to old path :330 | route itest | 668 audit rows = live | PROVEN_PRODUCTION |
| Classification | `mapTpsHintToDocintelId` (route:267) | hint → docintelId | — | docTypeHint | `skipped_no_mapping` (US-form slots) | none | live | PROVEN_PRODUCTION |
| Candidates→canonical | `docintelToCandidate` + `applyKnowledgeBrainIfEnabled` (route:274-286) | fields → CanonicalField[] | — | knowledgeBrain (KMU-55/dict) | — | unit | live | PROVEN_PRODUCTION |
| Canonical persist (shadow) | route:293-322 `buildCanonicalResult`→`persistCanonicalDocument` | → `canonical_documents` | 6 tps/passport rows | shadow record only | enforce→503; shadow→non-blocking warn :318 | persistence tests | 6 rows (max 2026-06-14) | PARTIAL (shadow; enforce path never hit in prod) |
| Browser-state | localStorage `value` + part7 (GeneratePacketBlock) | — | browser PII | — | — | — | live | PROVEN_PRODUCTION (PII-in-browser — see RISK) |
| Payment | `app/api/stripe/checkout` product='tps' + `x-payment-token` | Stripe cs_ | `audit_log` | **server-verified** | owner bypass | no token→402 (generate route:110) | — | live | PROVEN_PRODUCTION |
| Post-payment→PDF | `app/api/tps/generate-packet/route.ts` | answers → ZIP/PDF | `generated_packets`(0 rows) | `x-payment-token` verified vs Stripe (:109-119) | owner session bypass :102 | no payment→402 | — | route exists, 0 packet rows persisted | PARTIAL (server-gated; packet not persisted to DB) |
| Cleanup | `app/api/cron/cleanup` | TTL | — | — | — | — | — | UNVERIFIED schedule | UNVERIFIED |

**TPS verdict: PROVEN_PRODUCTION for upload→OCR→extract (668 live audit rows). Payment is correctly SERVER-gated (x-payment-token verified vs Stripe). E2E paid→PDF download not independently proven (generated_packets=0 rows; PDF returned inline, not persisted).**

---

## 2. Re-Parole (I-131 U4U)

| Step | File:line | Authority | Failure mode | Status |
|---|---|---|---|---|
| UI | `app/[locale]/services/re-parole-u4u/start/ReparoleWizardV2.tsx` | client state | — | PROVEN_PRODUCTION (code) |
| OCR | `app/api/reparole/ocr/extract/route.ts` (349 ln) → `readDocument` + reParoleAdapter | docintel | falls back | CODE_ONLY (1 canonical_documents row only; no dedicated audit table) |
| Canonical persist | `getCanonicalMode('reparole')` shadow | shadow | non-blocking | PARTIAL |
| **Payment** | PAID ($15, `product='re-parole-u4u'`); client-only gate: `?paid=1`→`setData({paid:true})` (wizard:537-538); owner check :548 | **NONE server-side** | — | **BROKEN (server bypass) — RISK P1** |
| PDF | `app/api/reparole/generate-packet/route.ts` — NO payment/auth/Stripe guard (full grep: zero matches) | ReParoleAnswers→ZIP | direct POST or `?paid=1` generates packet free | NOT_WIRED to payment |

**Re-Parole verdict: PARTIAL/BROKEN. OCR works in code but barely exercised in prod (1 canonical row). It is a PAID product yet `POST /api/reparole/generate-packet` has no server-side payment verification → a crafted request (or `?paid=1`) bypasses the $15 charge. E2E ABSENT.**

---

## 3. EAD (I-765 standalone)

| Step | File:line | Authority | Failure mode | Status |
|---|---|---|---|---|
| UI | `components/services/ead/EADWizard.tsx` | client state | — | PROVEN_PRODUCTION (code) |
| OCR | `app/api/ead/ocr/extract/route.ts` (319 ln) → `readDocument` + eadAdapter + translationAdapter | docintel | falls back | CODE_ONLY (2 canonical rows: ua_international_passport) |
| Canonical persist | `getCanonicalMode('ead')` shadow | shadow | non-blocking | PARTIAL |
| **Payment** | EAD is FREE by design — route docstring (:7): "Free self-help endpoint (no Stripe)" | N/A (free) | — | BY-DESIGN (not a bug) |
| PDF | `app/api/ead/generate-packet/route.ts` — only guard is `403 CANONICAL_SESSION_MISMATCH` (:152); free self-help | answers→ZIP | open generate (intended) | CODE_ONLY |

**EAD verdict: PARTIAL. OCR read path CODE_ONLY (2 canonical rows). Packet generation is intentionally free (no Stripe) — NOT a payment bug. E2E ABSENT.**

---

## 4. Translation (LEGACY operator flow — the LIVE one)

| Step | File:line | I/O | Storage | Authority | Failure mode | Status |
|---|---|---|---|---|---|---|
| UI | `app/[locale]/services/translate-document/...` + `TranslateWizard.tsx` | upload | `translation_sessions`(32) | — | — | PROVEN_PRODUCTION |
| Upload | `app/api/translation/upload/route.ts` | image | `translation_documents`(17) | — | — | PROVEN_PRODUCTION |
| OCR | `app/api/translation/vision-extract/route.ts` (575 ln) → `readDocument`+translationAdapter+knowledgeBrain | fields | `extracted_fields`(138) | docintel | legacy path :449 | PROVEN_PRODUCTION |
| Canonical persist | vision-extract:301-316 `buildCanonicalResult`→persist (shadow) + legacy persist :449-458 | → `canonical_documents` | 15 translation rows | shadow | non-blocking | PARTIAL |
| Review | `correct-field`/`confirm-field`/`review-state` session routes; UI `EvidenceReviewPage.tsx` | corrections | `user_corrections`(10) | operator/user | — | PROVEN_PRODUCTION |
| Payment | `stripe/checkout` product='translation' (checkout:44-57) | cs_ | `translation_orders`(2),`translation_payments`(1) | Stripe verified | — | PROVEN_PRODUCTION |
| Submit-order | `app/api/translation/submit-order/route.ts` (125 ln): `verifyStripeSessionPaid`→insert `manual_review_queue`→email | order | `manual_review_queue`(5) | **recipient = re-verified paid Stripe session** (PR #122) | — | PROVEN_PRODUCTION |
| Operator delivery | `/admin/manual-review` + `sendEmail` operator templates | manual PDF email | `translation_events`,`manual_review_events`(5) | operator (auth req PR #122) | — | PARTIAL — positive paid delivery RUNTIME_UNVERIFIED (per RELEASE_STATE:47) |

**Translation verdict: PROVEN_PRODUCTION up to operator queue. The current product is a MANUAL operator flow (operator reviews in admin, emails PDF). Auto-delivery positive path UNVERIFIED. Translation V2 (auto artifacts/outbox) is NOT live — see TRANSLATION_V2_AUDIT.md.**

---

## Where the flow BREAKS / proof gaps

1. **P1 — Re-Parole packet generation has NO server-side payment gate (real bypass).** Re-Parole is a PAID product ($15 Tier 1, `product='re-parole-u4u'` Stripe checkout, explicit Pay button — wizard:17,30,1033). But `paid` is set purely client-side by the `?paid=1` URL param (wizard:537-538). `app/api/reparole/generate-packet/route.ts` performs NO `x-payment-token`/Stripe verification (full guard scan: zero payment/auth references). TPS by contrast requires `x-payment-token` verified vs Stripe (TPS generate route:109-119). Root cause: when Re-Parole was cloned from the TPS flow, the server-side payment gate (`x-payment-token`) was NOT carried over. **A direct POST to `/api/reparole/generate-packet`, or simply appending `?paid=1`, yields a free $15 packet.** (EAD is excluded — it is free by design, route docstring:7.) Status: BROKEN.
2. **P1 — Canonical override route is orphaned.** `/api/canonical/[id]/override` (360 ln, correct 409 concurrency) has ZERO UI callers (`grep api/canonical` in app/components → none). The translation UI uses legacy `correct-field`/`confirm-field` session routes instead. `canonical_overrides`=0 rows confirms it has never run in prod. C3/override/optimistic-concurrency = CODE_ONLY, PROVEN_LOCAL at best.
3. **P2 — E2E is ABSENT for all four products.** No product has an automated paid→download E2E. `generated_packets`=0 rows (TPS PDFs returned inline, never persisted). RELEASE_STATE itself marks every product `positive_runtime_e2e: UNVERIFIED`.
4. **P2 — Canonical persistence is shadow-only everywhere.** 24 `canonical_documents` rows exist but enforce is never reached; the persisted canonical record does not authoritatively drive any product's output. The "carriage" of `canonical_document_id` extract→generate is wire-proven in code but the value carried is a shadow artifact.
5. **P3 — Cron cleanup schedule UNVERIFIED** from repo (route exists, schedule not readable).

Proof legend per product: TPS=PROVEN_PRODUCTION(read path); Translation=PROVEN_PRODUCTION(to operator queue); Re-Parole/EAD=CODE_ONLY read + BROKEN payment gate.
