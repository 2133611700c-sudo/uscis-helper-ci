# Post-Certification Zero-Trust Verification
**Date:** 2026-05-30 · Verified from runtime / code / tests / live DB. No features added.

## status: **DEGRADED**
Most claims verified LIVE. One claim is FALSE: the **audit-metadata DB write silently
fails** (schema mismatch) — attestation is built in code but never persisted.

```
main_sha:   84e4284
prod_sha:   84e4284   (MATCH — prod == main)
```

## 1. Production truth — PASS
- prod healthz sha `84e4284` == main `84e4284`.
- git log on main shows all six merges: #31 certifier UX+Review-Gate v2, #32 signature image, #33 silent-strip+guard, #34 attestation, #35 glossary, #36 plan tooling.

## 2. Review Gate v2 — PASS
`reviewGate.test.ts` 13/13: rejects missing name / address / checkbox1 (data_not_reviewed) / checkbox2 (accuracy_not_attested) / signature; accepts name+address+both checkboxes+signature. Route order: **payment (L76) → review gate (L95) → render (L125)** — payment is enforced first. (Full live "accept" path needs a real Stripe payment; covered by unit + wiring, not E2E here.)

## 3. UI (Screen 7) — PASS
`certifierUx.test.ts` 6/6: certifier address input + 2 checkboxes + signature pad present; download button hard-gated until signature + both checkboxes + address. "8 CFR §103.2(b)(3)" appears only as **short reference labels** (disclaimer "we are not attorneys"; "Certification per 8 CFR") — no long legal text shown to the user.

## 4. PDF output — PASS
`certificationPdf.verify.test.ts` 4/4 (hex-readback of the StandardFont cert block):
- contains "competent to translate" and "accurate and complete";
- contains Name, Address, a Date year; embeds the **signature image** (`/Image` XObject);
- contains **no `[CONFIRM]`** in the final output.
- 0 executable silent-strip in `pdf/templates/**` renderers (noSilentStrip guard on main).

## 5. Audit metadata in DB — **FAIL** 🔴
- `buildAttestationRecord()` is correct (`attestation.test.ts` 5/5) and the route passes `{...certRecord, attestation}` to the upsert. BUT:
- **`translation_orders` has no `certification_record` / `session_id` / `document_type` / `payment_confirmed` / `scope_title` / `updated_at` columns.** Actual columns: id, created_at, name, email, phone, address, plan, spanish_copy, locale, signed_at, signature_method, certification_version, status, stripe_checkout_id.
- The route's `upsert({...})` therefore references non-existent columns → PostgREST rejects the whole write → the `try/catch` **swallows it silently**.
- Live DB: **2 rows total, newest 2026-05-08, 0 rows with status='rendered'.** The generate-pdf order write (and thus the attestation) has **never been persisted**.
- **Verdict:** the attestation/audit trail exists in code but is NOT in the database. My earlier "persisted in DB" claim was wrong. This is a pre-existing silently-failing upsert that my attestation change inherited.

## 6. Source verifier — PASS (governance NOT complete)
`scripts/verify-ukraine-sources.mjs` ran live: **VERIFIED** — КМУ-1025, КМУ-152, КМУ-302 (act number + keywords matched on the /print pages). **INVALID/incomplete** — military, education diploma, pension (no correct official URL), internal passport booklet (КМУ-353 appendix not published), driver (no source), **КАТОТТГ byte-verify NOT done** (data.gov.ua XLSX download blocked from env). Source governance is **not complete**.

## 7. Release gate (G1–G12)
| Gate | Status |
|---|---|
| G1 source verified | PARTIAL (КМУ-1025/152/302 ✅; military/diploma/pension/booklet/КАТОТТГ ❌) |
| G2 schema complete (birth) | on official-docs (NOT main) |
| G3 mapping complete (birth) | on official-docs (NOT main) |
| G4 review gate enforced | PASS (live) |
| G5 BUREAU_PDF default OFF | PASS (BUREAU_PDF not even present on main → no bureau path in prod) |
| G6 golden readback | PASS (on official-docs) |
| G7 owner visual approval | **BLOCKED** (pending owner) |
| G8 real fixture E2E | PASS (birth/passport/military) |
| G9 no mock route linked publicly | PASS |
| G10 payment verified server-side | PASS |
| G11 no PII in logs/git | PASS |
| G12 active_documents matches list | PASS (0 active) |
| **G-audit attestation persisted** | **FAIL** (Section 5) |

## 8. Coverage
- The coverage generator and the whole bureau path (`bureauTranslation.ts`, civil schemas, mappings) live on **official-docs (12 commits ahead, UNMERGED)** — **not on main**. Cannot regenerate on main.
- On main/prod: **no bureau path exists**, `BUREAU_PDF` is not referenced → effectively OFF; **active_documents_count = 0**.
- `ua_birth_certificate`: pilot-ready on official-docs, gated on G7 (owner visual) + landing official-docs. marriage/divorce/death/name-change: DRAFT (no mapping/fixtures). 

## Output contract
```
status:              DEGRADED
main_sha:            84e4284
prod_sha:            84e4284
tests_run:           reviewGate 13/13 · certifierUx 6/6 · certificationPdf.verify 4/4 · attestation 5/5 · sourceVerifier 4/4
runtime_checks:      prod healthz 84e4284; payment→review→render order confirmed
api_gate_result:     PASS (unit + wiring; live-accept needs payment)
pdf_result:          PASS (statement + Name/Address/Date + signature image; no [CONFIRM]; no silent strip)
audit_db_result:     FAIL — translation_orders schema mismatch; upsert silently fails; 0 rendered rows; attestation NOT persisted
source_verifier_result: 3 verified (КМУ-1025/152/302), 3+ invalid/incomplete; governance NOT complete
coverage_summary:    active=0; bureau path + coverage generator on official-docs (unmerged); BUREAU_PDF off
remaining_blockers:
  - 🔴 translation_orders order/attestation write silently fails (schema mismatch) — audit trail NOT persisted
  - military/diploma/pension official URLs (owner); КАТОТТГ byte-verify (blocked)
  - official-docs unmerged; birth pilot gated on G7 owner visual approval
next_action:
  - FIX the translation_orders persistence (migration for an attestation/order jsonb OR remap the upsert
    to existing columns) so the audit trail is actually stored — then re-verify with a live row.
  - owner reviews birth_certificate.pilot.signed.png for G7.
```
