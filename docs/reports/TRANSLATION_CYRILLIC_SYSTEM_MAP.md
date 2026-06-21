# Translation + Cyrillic + Central Brain — System Map

Status: 2026-06-20 · Branch `feat/tv2-rebuild-on-main` (PR #208) · main `35508c1`
Evidence-based map (file:line). Honest about gaps. Supersedes the assumptions in #197/#119 (both CLOSED).

> Authority claim proven by tests, not asserted: see §"Central Brain is the single arbiter".

## 1. Routes (translation surface)
| Route | Purpose | File |
|---|---|---|
| `POST /api/translation/vision-extract` | per-page read → buildCyrillicMap → docintelToCandidate → **arbitrateDocument (brain)** → buildCanonicalResult → toTranslationRows → C3 safety | `apps/web/src/app/api/translation/vision-extract/route.ts` |
| `POST /api/translation/submit-order` | paid → legacy queue ticket + **durable V2 order** (handleVerifiedPayment) | `app/api/translation/submit-order/route.ts` |
| `POST /api/stripe/webhook` | signature-verified; #184 event-dedupe ledger; durable V2 order for translation | `app/api/stripe/webhook/route.ts` |
| `POST /api/internal/translation-delivery` | CRON_SECRET; outbox drain → SHA-verified exact bytes → email | `app/api/internal/translation-delivery/route.ts` |
| `POST /api/order/[id]/resend` | resend to **Stripe-verified recipient** (P0-2) | `app/api/order/[id]/resend/route.ts` |
| `POST /api/translation/email` | self-email draft (rate-limited, P0-1) | `app/api/translation/email/route.ts` |
| `/admin/manual-review/[id]` + `/v2` | operator review/correction (auth fail-closed) | `app/admin/manual-review/[id]/{page,v2/page,actions,v2Actions}.ts` |

## 2. Central Brain / Canonical Core (single source of truth)
- Final-value resolver: `lib/canonical/core/knowledgeNormalize.ts` (`normalizeCanonicalValue`) — KMU-55/ru transliteration, dictionary resolution, MRZ/Latin priority, place/date/authority/sex normalization.
- Arbiter + canonical envelope: `lib/canonical/core/arbitration.ts` (`arbitrateDocument`) → `buildCanonicalResult.ts`.
- Single value accessor: `lib/canonical/core/fieldAccessor.ts:37` `getCanonicalValue` — `finalValue===null ⇒ null` (no resurrection from normalized/raw).
- Adapter to rows: `lib/canonical/core/translationAdapter.ts` (`toTranslationRows`/`canonicalToFieldOut`, sole caller of `getCanonicalValue`).
- C3 critical-null gate (translation): `lib/documentSafety/applyOcrFieldSafety.ts` — **always-on for translation** (no env-flag guess).

### Central Brain is the single arbiter (PROVEN, not asserted)
`lib/canonical/core/__tests__/brainSingleArbiterInvariant.test.ts` (12): every value path to a translation row passes `arbitrate → buildCanonicalResult → getCanonicalValue`; `finalValue===null ⇒ null` even when normalized+raw are set; MRZ-controlling-Latin wins; `buildCanonicalResult` is a pure wrapper; source-invariant: the route builds rows ONLY via `toTranslationRows`. **No bypass found.** OCR result, translated fields, wizard state, operator fields, PDF fields are NOT independent finals.

## 3. Dictionaries (single source = `packages/knowledge`)
- `dictionary.ts` (authorities incl. Militsiya per ADR-004, settlement types incl. «смт»→urban-type settlement, months, sex, blocklist), `normalize.ts`, `transliterate.ts` (KMU-55 + ru BGN/PCGN + detectNameScript).
- Proof: `packages/knowledge/src/__tests__/goldenDictionaryVectors.test.ts` (59, tsx) + `apps/web/src/lib/canonical/__tests__/cyrillicGoldenVectors.test.ts` (22, vitest).
- Translation glossary (`lib/translation/glossary/*`) imports `@uscis-helper/knowledge` (no parallel authority; renders "Militsiya Department", not "Militia").
- **Two brain bugs found by golden vectors + FIXED** (regression-locked in the golden tests): V1 «смт» designator was silently dropped in the gazetteer path → now `urban-type settlement Vyshneve`; V2 `date_of_issue` misrouted to authority → now accepted.

## 4. DB tables / RPCs / storage (V2 spine — on main via prior migrations)
- Tables: `translation_orders_v2` (UNIQUE checkout_session_id), `translation_order_events` (append-only), `document_artifacts` (immutable triggers), `delivery_outbox` (idempotency_key UNIQUE), `stripe_processed_events`, `stripe_consumed_tokens`, `manual_review_queue` (legacy live path).
- RPCs: `transition_translation_order`, `create_artifact_and_enqueue`, `claim_outbox_event` (FOR UPDATE SKIP LOCKED), `record_stripe_processed_event`, `consume_stripe_packet_token`.
- TS bridge: `lib/translation/orders/index.ts` (createOrGetOrder, transitionOrder, applyOperatorOverride, createArtifactAndEnqueue, downloadArtifactBytes SHA-verified).
- Storage: private `translation-artifacts` bucket (RLS service-role only).

## 5. PDF renderer + delivery
- Renderer: `lib/packet/pdf.ts` `generateTranslationPDF` — **deterministic** (dates + pdf-lib metadata pinned to `signed_at`); WinAnsi-safe (Cyrillic transliterated, never drawn raw). `renderFromCanonical.ts` → SHA + 7-field cert binding.
- Visual acceptance: `lib/packet/__tests__/translationPdfVisualAcceptance.test.ts` + `.github/workflows/translation-pdf-acceptance.yml` (poppler: pages non-blank, English present, 8 CFR cert, **ZERO U+0400–U+04FF leak**).
- Delivery worker: exact stored bytes (SHA re-verified), recipient = server-side verified email only, idempotent outbox claim.

## 6. Stripe boundary
- `verifyStripeSessionPaid` (paid + product + amount) + `requirePaidPacket` (shared fail-closed gate); webhook signature + raw body + #184 event-id idempotency; durable order keyed on `checkout_session_id`. Negative cases proven in `reparolePaymentGate` + `webhook*` tests.

## 7. Feature flags (current defaults)
- `OCR_FIELD_SAFETY_ENABLED` — global default OFF, but translation route applies the gate **unconditionally** (scoped). 
- `SOURCE_SCRIPT_REVIEW_ENABLED` — **default ON** (ambiguous uk/ru → review).
- `RU_TRANSLIT_ENABLED` — **default OFF** (clearly-RU output-flip deferred, needs real-OCR validation).
- `MRZ_TRANSLATION_ENABLED` — default OFF (passport MRZ authority — **GAP**, see §9).
- `ANTI_FABRICATION_GATE_ENABLED` — handwriting distrust; cert fields already carry `handwritten:true` (registry invariant test).

## 8. PII / failure / rollback boundaries
- Logs: counts/keys/ids only (no values/emails/OCR text) — verified by the security audit.
- Failure modes: uncertain critical → `value=null + finalValue=null + review_required`; handwritten cert → review; ledger-unavailable webhook → process-without-dedup (never 500); V2 order best-effort (never fails a paid order).
- Rollback: disable the translation route/flags + restore previous Vercel preview; migrations are additive/forward-only (no destructive DDL). **Rollback drill = TODO before canary.**

## 9. KNOWN GAPS (honest)
1. **Real staging E2E NOT run** — blocked on external creds: Stripe test keys (×3) + new Gemini key (`GEMINI_API_KEY`). (ADMIN_SECRET/CRON_SECRET/OPERATOR_SIGNER_NAME now provisioned; RESEND present.)
2. **MRZ authority incomplete** — check-digit validation + the "invalid MRZ cannot overwrite canonical" invariant not yet implemented for the passport scenario. (Audit in progress.)
3. **RU output-flip** deferred — needs clearly-RU / ambiguous / UA-regression real-OCR validation (Gemini quota).
4. **Secret incident** — Google/Gemini key history-redacted; revocation UNVERIFIED → treat as compromised, new key required. (Audit in progress.)
5. **#208 CI** — Actions was disabled at repo level (now re-enabled); required checks must appear green before merge.
6. **Held-out corpus** — no multi-document corpus framework yet (single-doc is not production proof).

## Data flow (per transition: authority · storage · failure · review · audit · PII)
upload → page storage (`translation-artifacts`/uploads) → classification (`classify`, doc contract) → quality gate (`checkImageQuality`) → Cyrillic OCR (`readDocument`, primary `gemini-3.1-pro-preview` only; flash=force-review) → candidates (`docintelToCandidate`) → **brain arbitration (single authority)** → normalization+dictionary (`normalizeCanonicalValue`) → translation rows → operator review/correction (provenance via `applyOperatorOverride`, base canonical immutable) → approval → deterministic render (once) → immutable artifact (SHA) → outbox delivery (exact bytes) → download.
Every critical field with material uncertainty stops at `review_required=true, finalValue=null`. Audit: `translation_order_events` append-only. PII: never logged; artifact bytes private + SHA-verified.
