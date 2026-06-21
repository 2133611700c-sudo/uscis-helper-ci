# Module Acceptance Matrix v1

**Generated:** 2026-05-09
**Repo HEAD at generation:** `ecb6c63c0916ab7d07b91f09672ddeb8ac395726`
**Vercel READY deployment:** `dpl_9RUkHpP9sj8KAcww9ZJeziz4dS33`
**Production URL:** https://messenginfo.com (HTTP 200)

This document is the single source of truth for every Ukrainian document type that
the Messenginfo translation pipeline can encounter. It records:

- **Module status** (`active` / `draft` / `manual_only` / `disabled` / `not_registered`)
- **What artefacts exist** (module file, validators, glossary, extraction prompt, PDF template, fixtures, tests)
- **Auto-draft and auto-PDF eligibility** as enforced in code
- **E2E proof** and **PDF privacy QA** status
- **Manual review fallback** wiring
- **Blockers** and **next required task** to advance

Promotion rules (enforced by `lib/translation/modules/registry.ts` and `manualReviewModule.reviewPolicy`):

- A module marked `active` MUST have: critical-field set, validators, extraction prompt, PDF template, ≥80 unit tests across module/validators/template, fixtures, an E2E smoke that produced a clean customer PDF, and a privacy QA pass (0 PII / 0 forbidden phrases in customer PDF).
- A module marked `draft` is wired into the registry but is **never** allowed to produce a customer PDF (`reviewPolicy.allowAutoPdf=false`); it routes to manual review.
- A module marked `manual_only` is the explicit fallback (`manualReviewModule`); no auto-extraction, no auto-PDF, ever.
- An unregistered document type is treated as `not_registered` → routed to manual review by `getDocumentModule()` and `classifyDocumentType()`.
- `active` is **not** a marketing claim — it is "auto-draft is technically allowed". Whether we surface a doc type publicly is a separate go/no-go decision.

Do not promote a module to `active` without filling every column below. This file replaces ad-hoc claims in product docs.

---

## 1. Summary by status

| Status | Count | Modules |
|---|---|---|
| `active` (auto-PDF allowed) | **1** | `ua_internal_passport_booklet` |
| `draft` (no auto-PDF) | **5** | `ua_birth_certificate` (demoted 2026-05-09), `ua_marriage_certificate` (demoted 2026-05-09), `ua_divorce_certificate` (demoted 2026-05-09), `ua_international_passport`, `ua_id_card` |
| `manual_only` (no auto-anything) | 1 | `manual_review_required` (fallback sentinel) |
| `not_registered` (always manual review) | 7+ | death certificate, driver licence, criminal-record certificate, diploma/transcript, military documents, court decisions, notarial statements |

**2026-05-09 demotion (`DEMOTE_UNPROVEN_MODULES_AND_LOCK_PRODUCTION_SCOPE`):**
Birth, marriage, and divorce modules were flipped from `active` to `draft` because they have no real-fixture E2E evidence. Synthetic-only smoke (birth cert) is not enough for self-serve auto-PDF. While `draft`, `registry.getDocumentModule()` returns `manualReviewModule` for these doc types, so customer PDF cannot be produced and uploads escalate to manual review. Re-promote to `active` only after the FULL pipeline (upload → OCR → DeepSeek extraction → review → certify → render) passes against a real (sanitized) fixture committed under `artifacts/e2e/<doc_type>/`.

Source: `apps/web/src/lib/translation/modules/registry.ts` lists the 7 registered modules; classifier alias table contains 0 aliases for the unsupported types listed above.

---

## 2. Matrix

Columns:

- `document_type` — canonical key.
- `module_file` — TypeScript module under `apps/web/src/lib/translation/modules/`.
- `status` — `active | draft | manual_only | disabled | not_registered`.
- `auto_draft` — does the wizard attempt automatic field extraction?
- `auto_pdf` — does `reviewPolicy.allowAutoPdf` permit a customer PDF?
- `crit_fields` — count from `criticalFields[]`.
- `valid` — validators file present?
- `gloss` — glossary modules referenced (yes/no).
- `prompt` — DeepSeek extraction prompt file present?
- `tmpl` — PDF template file present?
- `fix` — fixture coverage (live OCR session id or "none").
- `unit_tests` — count from `__tests__` for module + validators + template.
- `e2e_smoke` — last E2E result.
- `pdf_qa` — last PDF forbidden-phrase scan result.
- `priv_qa` — privacy audit (audit log PII / customer PDF debug content).
- `mr_fallback` — manual review fallback wiring.
- `blockers` — open blockers preventing further promotion.
- `next_task` — the exact next required task to advance.

| document_type | module_file | status | auto_draft | auto_pdf | crit_fields | valid | gloss | prompt | tmpl | fix | unit_tests | e2e_smoke | pdf_qa | priv_qa | mr_fallback | blockers | next_task |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ua_internal_passport_booklet` | `passportBooklet.module.ts` | `active` | yes | yes | 11 | yes (`passportBookletContract` + content guard) | yes | yes (in module + system prompt) | yes (`ua_passport_booklet_v1`) | live OCR session `92567d4f-…` + synthetic `a9afd327-…` | 56 module + 101 contract + 95 pilot-validation + 33 glossary | PASS (smoke 2026-05-09, pdf 3162B, 0 PII) | PASS (21 forbidden phrases scanned, 0 violations) | PASS (audit logs 0 PII over 11 events) | yes (registry → manualReview if status not active or low-conf classifier) | none for current scope. Open monitoring item: pilot tracking sheet not yet populated with real customer cases. | Begin controlled paid pilot P001/P002/P003 per existing runbook; populate `artifacts/pilot/passport_pilot_tracking_template.csv`. |
| `ua_birth_certificate` | `birthCertificate.module.ts` | `active` (code) **/ synthetic_e2e_pass / real_fixture_required** (evidence) | yes | yes | 14 | `birthCertificateValidators.ts` (43 tests) | yes (`civil_registry_terms.json`, era guards) | `birthCertificateExtractionPrompt.ts` (NOT exercised this cycle — synthetic seeding bypassed OCR + DeepSeek) | `birthCertificate.template.ts` (25 tests) | **synthetic only** (no real PII, no real OCR): seeded session `658e664f-…` directly into `extracted_fields` with 14 placeholder values (TEST_FAKEFAMILY etc.), confirmed=true. The OCR / DeepSeek extraction path was NOT tested. | 78 module + 43 validators + 25 template = 146 | **PARTIAL — synthetic only**. Renderer + certify + privacy contract proven against seeded data (POST /certify 200, POST /render 200, application/pdf 3444 B / 2 pages, 2026-05-09 against deployed_commit `08753eb`). Real OCR / extraction-prompt path NOT exercised. | **PASS for synthetic PDF only** (18 forbidden phrases scanned against `artifacts/e2e/birth_cert/synthetic_smoke_text.txt`, 0 violations; 0 cyrillic chars). Says nothing about how a real birth-cert PDF would render. | **PASS** for synthetic flow (3 audit_log rows enums-only, 0 of 12 PII markers in metadata). Says nothing about audit content for a real OCR run. | yes — falls back if classifier confidence <0.85 or fields missing | **HIGH** — no real (sanitized) birth-certificate fixture committed; OCR + DeepSeek extraction path UNPROVEN.<br>**MEDIUM** — civil_registry_terms era guards (ЗАГС / РАЦС / ДРАЦС) not field-tested on a Soviet-era certificate.<br>**MEDIUM** — Patronymic / parent-name validators not exercised against real Ukrainian text.<br>**Public self-serve readiness:** NOT proven. Module remains `active` in code (router floor still applies) but matrix evidence is synthetic-only. | Acquire a sanitized **real** birth-certificate fixture (public-domain sample or operator-provided scan with names redacted). Run the FULL pipeline: upload → OCR → extraction → review → certify → render. Re-scan the resulting PDF for forbidden phrases and re-audit log metadata. If any step fails, demote `ua_birth_certificate` to `draft` until fixed. Evidence path: `artifacts/e2e/birth_cert/synthetic_smoke_summary.json` (synthetic-only); a `real_smoke_summary.json` is required to close the HIGH blocker. |
| `ua_marriage_certificate` | `marriageCertificate.module.ts` | `active` | yes | yes | 16 | `marriageCertificateValidators.ts` (42 tests) | yes (`civil_registry_terms.json`) | `marriageCertificateExtractionPrompt.ts` | `marriageCertificate.template.ts` (35 tests) | none committed | 47 module + 42 validators + 35 template = 124 | NOT RUN | NOT RUN | inherited; no real-PDF QA | yes | 1) No fixture.<br>2) No E2E.<br>3) No PDF QA. | Same as birth cert — acquire 1 sanitized fixture, run E2E, save to `artifacts/e2e/marriage_cert/`. |
| `ua_divorce_certificate` | `divorceCertificate.module.ts` | `active` | yes | yes | 15 | `divorceCertificateValidators.ts` (81 tests) | yes (`civil_registry_terms.json`) | `divorceCertificateExtractionPrompt.ts` | `divorceCertificate.template.ts` (42 tests) | none committed | 43 module + 81 validators + 42 template = 166 | NOT RUN | NOT RUN | inherited; no real-PDF QA | yes | 1) No fixture.<br>2) No E2E.<br>3) No PDF QA. **Higher risk**: court-decision-driven divorces have legal-text >30 words paths that should escalate to manual review per spec; not yet smoke-verified. | Same as above + verify `complex_legal_basis` content signal triggers manual review on a real divorce-cert sample with court paragraph. Save to `artifacts/e2e/divorce_cert/`. |
| `ua_international_passport` | `internationalPassport.module.ts` | `draft` | yes (anchor only) | **no** | 16 | `internationalPassportValidators.ts` (49 tests) | not_checked | none yet (extraction handled via MRZ parser, see `identity/mrzParser.ts`) | `identity_anchor_intl_passport` (43 template tests) | none committed | 70 (identityModules.test.ts shared) + 49 validators + 43 template = 162 | NOT RUN as customer flow (correctly: draft → manual review) | n/a (no auto-PDF) | inherited | yes (registry returns manualReview because status≠active) | 1) Module is intentionally draft. Promotion to active requires: extraction prompt, PDF template variant, fixtures, E2E. | Decide whether to invest in promoting to `active`. If yes, write extraction prompt + customer template; otherwise leave as anchor-only and document. |
| `ua_id_card` | `ukrainianIdCard.module.ts` | `draft` | yes (anchor only) | **no** | 18 | `ukrainianIdCardValidators.ts` (45 tests) | not_checked | none yet | `identity_anchor_id_card` (54 template tests) | none committed | 70 (shared) + 45 validators + 54 template = 169 | NOT RUN as customer flow (correctly: draft → manual review) | n/a | inherited | yes | Same as international passport. | Same decision. |
| `manual_review_required` | `manualReview.module.ts` | `manual_only` | n/a | **no** (always blocked) | 0 | n/a | n/a | n/a | n/a (`templateId: manual_review`) | n/a | 33 module + integration coverage in `manualReview` package | PASS (live smoke 2026-05-09: ticket created, 5 events, 0 PII in audit metadata, banner rendered, render gate 423 → 402 after operator approval) | n/a | PASS (admin queue list verified PII-free; events metadata verified PII-free; user-status route verified safe) | self (this IS the fallback) | none | Wire wizard banner now done (commit `8f29964`). Wizard-side HTTP 423 handling done. Live UX evidence committed (`ecb6c63`). |
| `ua_death_certificate` | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes (classifier returns manualReview for unknown alias) | No module. Public copy now correctly states "selected Ukrainian documents only". | If demand: design module → `draft` first, repeat the active-promotion checklist. |
| `ua_driver_licence` | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes | No module. | Same as above. |
| `ua_criminal_record_certificate` | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes | No module. Often time-stamped (≤6mo) — if added, validator must enforce freshness. | Same. |
| `ua_diploma_or_transcript` | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes (router has `diploma_or_transcript` content signal → manual review) | No module. Diplomas frequently have complex tables (transcripts) → router will fire `complex_table_document` if implemented. | Same as above. |
| `ua_military_document` | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes (router has `military_document` content signal) | No module. | Same. |
| `ua_court_decision` | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes (router has `legal_or_court_document` + `long_legal_text` signals) | No module. Long-form prose; fundamentally manual-review-first. | Likely never `active` — keep as manual-only. |
| `ua_notarial_statement` | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes | No module. | Likely never `active`. |
| any unknown / unsupported document | not_registered | n/a | no | no | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | inherited | yes (classifier `usedFallback=true` → `unknown_document_type` reason) | none | Already handled correctly in pipeline. |

---

## 3. Per-module blockers — flat list

(For machine-readable tracking. Severity LOW/MEDIUM/HIGH reflects how close the module is to operationally safe.)

### 3.1 `ua_internal_passport_booklet` (active)

- LOW — pilot tracking sheet `artifacts/pilot/passport_pilot_tracking_template.csv` not yet populated with real customer cases.
- LOW — Russian-month genitive fallback flagged as deferred in commit `308e129`.

### 3.2 `ua_birth_certificate` (active in code / synthetic_e2e_pass + real_fixture_required for evidence)

**Correction (2026-05-09):** the prior cycle marked the HIGH "no E2E / no PDF QA / no privacy QA" blockers as CLOSED. That overstated what the synthetic smoke actually proved. Re-stated honestly:

- **HIGH (still open) — no real (sanitized) birth-certificate fixture committed; the OCR + DeepSeek extraction path was NOT exercised.** The 2026-05-09 smoke seeded 14 fields directly into `extracted_fields` with placeholder values (`TEST_FAKEFAMILY`, `TESTONE`, `SAMPLEVYCH`, …) and skipped Google Vision OCR + DeepSeek field-mapping entirely. The synthetic smoke proved the **renderer**, **certification**, and **audit privacy** contracts; it did **not** prove that a real Ukrainian birth certificate scan would produce safe output.
- **PARTIAL CLOSE — render + certify + privacy** (`artifacts/e2e/birth_cert/synthetic_smoke_summary.json`). Verdict on the synthetic path only: 14/14 fields present, PDF 3444 B / 2 pages, 0 forbidden-phrase violations across 18 phrases, 0 cyrillic chars in PDF text, 3 audit_log rows enums-only, 0 of 12 PII markers in metadata. Treat as "renderer-proven", not "module-proven".
- **MEDIUM** — civil_registry_terms era guards (ЗАГС / РАЦС / ДРАЦС) not field-tested on a real Soviet-era certificate. Synthetic placeholder used `'Kyiv Civil Registry Office'`.
- **MEDIUM** — Patronymic / parent-name / certificate-vs-act-record validators have unit-test coverage only; not exercised against real Ukrainian text on a real certificate.
- **Public self-serve readiness:** **NOT proven.** Module stays `active` in code (so the floor `manualReviewModule.allowAutoPdf=false` does not currently block it), but no public marketing or self-serve flow should be enabled until the real-fixture smoke passes.

### 3.3 `ua_marriage_certificate` (active)

- HIGH — no fixture, no E2E, no PDF QA.
- MEDIUM — `patronymic ≠ Middle Name` rule covered in unit tests; not yet verified against a real Ukrainian or Russian-era marriage certificate.
- MEDIUM — `surname-before/after` swap-protection is unit-tested, not field-tested.

### 3.4 `ua_divorce_certificate` (active)

- HIGH — no fixture, no E2E, no PDF QA.
- HIGH — `basis_of_divorce` extraction with court-decision text >30 words must trigger manual review (per spec); behaviour not yet smoke-verified.
- MEDIUM — court_decision_number / court_name validators logic-tested only.

### 3.5 `ua_international_passport` (draft)

- BLOCKER (intentional) — module is draft; not eligible to produce customer PDF until extraction prompt, customer-PDF template variant, and fixtures exist.

### 3.6 `ua_id_card` (draft)

- BLOCKER (intentional) — same as international passport.

### 3.7 `manual_review_required` (manual_only)

- none.

### 3.8 Unsupported document types

- LOW — public copy now states "selected Ukrainian documents only" (commit `57abea4`). Unsupported types correctly route to manual review. Continue to monitor demand to decide which to formalize next.

---

## 4. What this matrix does NOT claim

- Does **not** claim any module is "USCIS-accepted" — Messenginfo provides a 8 CFR §103.2(b)(3) self-certification template; acceptance is determined by the adjudicating officer.
- Does **not** claim the active modules are ready for unlimited public launch. The honest read of the matrix:
  - **`ua_internal_passport_booklet`** is the only `active` module with end-to-end real-OCR evidence committed (live OCR session `92567d4f-…`, synthetic confirmation session, customer PDF, forbidden-phrase scan, privacy audit). Controlled pilot is appropriate; broad public launch is not.
  - **`ua_birth_certificate`** has, as of 2026-05-09, **synthetic E2E pass** for the renderer + certify + privacy contract only. The OCR + DeepSeek extraction path is **NOT yet proven** — the synthetic smoke seeded `extracted_fields` directly. Status is `synthetic_e2e_pass / real_fixture_required`. **Not public self-serve ready.**
  - **`ua_marriage_certificate`, `ua_divorce_certificate`** have unit-test coverage and PDF templates but **no committed live fixture, no E2E smoke, no PDF QA, no privacy QA** of any kind. They are `active` in code (and therefore can produce auto-PDFs in production), but the "active" status is **not evidenced**. This is a real gap and is the next priority before any public marketing.
- Does **not** mark any unsupported type "ready" — they all route to manual review per spec, and the public translate-document page now says so explicitly.

---

## 5. Verification of this audit

- Status / `allowAutoPdf` / template ids / critical-field counts / unit-test counts: enumerated by reading every `*.module.ts`, `validators/*`, `templates/*`, `extraction/*`, and `__tests__/*` directory.
- E2E + PDF QA + privacy QA: verified against `artifacts/e2e/phase1_summary.json`, `artifacts/pilot/smoke/smoke_summary.md`, `artifacts/pilot/smoke/smoke_pdf_forbidden_scan.json`. Only the passport pipeline has these; the other three "active" modules do not.
- Manual review fallback: verified by reading `registry.ts` (`getDocumentModule()` returns `manualReviewModule` when `module.status !== 'active'`), `classifier.ts` (`classifyDocumentType` returns `manualReviewModule` for unknown / low-conf inputs), and live smoke from cycle ending at commit `8f29964` (HTTP 423 render gate, admin transitions, banner UX).

---

## 6. Cross-cycle exit gate

Any module promotion to `active` requires this matrix to be updated — and the new "active" row must show:

- `crit_fields` ≥ 5 (rule of thumb)
- `valid` = yes
- `prompt` = yes
- `tmpl` = yes
- `fix` ≠ "none"
- `unit_tests` ≥ 80 (combined module + validators + template)
- `e2e_smoke` = PASS with a customer PDF artifact path
- `pdf_qa` = PASS (forbidden-phrase scan ≥ 19 phrases, 0 violations)
- `priv_qa` = PASS (0 PII in audit metadata, 0 debug/source-trace/OCR/bbox in customer PDF)

If any column is empty or NOT RUN, the module stays `draft` (or stays out of the registry).

---

*End of matrix.*
