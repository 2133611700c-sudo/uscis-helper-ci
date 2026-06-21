# CODEX_SPY_PROJECT_AUDIT

Date: 2026-06-03
Mode: source-code-only audit
Ignored: `.next`, `node_modules`, `dist`, `coverage`, `.turbo`

## Executive Verdict

The project does **not** currently prove one central runtime Document Core across TPS, Translation, Re-Parole, and EAD.

What the source proves instead:

- there is a real shared docintel substrate
- there is a real shared arbitration layer
- there are real product adapters
- live routing is still fragmented by feature flags, document-class gaps, and legacy bypasses

## Output Contract

status:
- FAIL

products_checked:
- TPS
- Translation
- Re-Parole
- EAD

routes_checked:
- `apps/web/src/app/api/tps/ocr/extract/route.ts`
- `apps/web/src/app/api/translation/vision-extract/route.ts`
- `apps/web/src/app/api/reparole/ocr/extract/route.ts`
- `apps/web/src/app/api/ead/ocr/extract/route.ts`

core_confirmed:
- PARTIAL only
- Shared pieces confirmed: `documentRegistry.ts`, `documentFieldReader.ts`, `transliterationPolicy.ts`, `arbitrateDocument()`, product adapters
- Uniform single Core path across all four products: NOT confirmed
- `readDocumentCore()` live runtime usage: NOT confirmed

products_bypassing_core:
- TPS
- Translation
- Re-Parole

libraries_runtime_used:
- KMU-55 via `docintel/transliterationPolicy.ts`
- MRZ via `canonical/core/mrzAuthority.ts` in TPS and Re-Parole
- agency registry via `lookupAuthority()` in TPS `militaryId.ts` and `birthCertificate.ts`
- gazetteer/city normalization via `normalizeCity()` and `snapCity()` in mixed subsystems
- `documentClassPolicy` in TPS and Translation routes
- hard-case override in TPS and Translation routes
- label/value guard in TPS `birthCertificate.ts`

libraries_not_runtime_used:
- `readDocumentCore()` as a live product entrypoint
- a named runtime `DocumentProfile`
- `birthCertificateSchema` in OCR/Core extraction flow
- any shared military-ID extraction schema in OCR/Core flow

profiles_wired:
- `DocTypeSpec` / `getDocTypeSpec()` in shared docintel path

profiles_not_wired:
- `DocumentProfile` as named in the audit request
- shared profile-to-Core wiring through `readDocumentCore()`

cyrillic_status:
- internal passport: shared but dual-path
- international passport: shared but MRZ uneven
- military ID: legacy TPS-only
- birth certificate: split between legacy TPS and generic Translation docintel path
- rotated birth certificate: explicit current route support confirmed in Translation, not in TPS birth-cert-specific routing

mrz_status:
- TPS passport Core path: yes
- Re-Parole passport Core path: yes
- Translation: no MRZ authority injection
- EAD: no MRZ authority injection

legacy_bypasses:
- TPS non-passport slots
- TPS military ID
- TPS birth certificate
- Translation legacy merge path and optional central-brain path
- Re-Parole `i94|ead|dl` to TPS route

missing_tests:
- no proof that live product routes call `readDocumentCore()`
- no route-level test proving birth-certificate schema-driven extraction
- no route-level proof of military-ID shared Core/docintel path
- no proof of MRZ wiring in EAD or Translation
- no cross-product test proving all four use one identical canonical result contract

critical_gaps:
- one central Core is not the only runtime decision path
- `readDocumentCore()` is unused
- `CanonicalDocumentResult` is not universal
- `DocumentProfile` abstraction requested by audit is absent in runtime code
- document-class policy is not applied in Re-Parole/EAD routes
- birth certificate and military ID are not fully on shared Core path

recommended_next_prs:
- wire all four routes through `readDocumentCore()` or delete the dead abstraction
- replace route-local `DocTypeSpec` handling with one explicit shared product-facing profile contract
- move document-class guards into Re-Parole and EAD routes
- add MRZ authority to EAD and, if intended, Translation passport path
- migrate military ID and birth certificate to shared docintel/Core or explicitly mark them legacy-only
- add one end-to-end parity test per product proving the same canonical contract

tests_run:
- pending until command verification section below

tsc_status:
- pending until command verification section below

what_is_not_done:
- no code changes to unify the architecture
- no production/browser verification
- no inspection of PII-bearing `qa-private` contents
- no changes to payments, Stripe, BUREAU_PDF, UI redesign, model defaults, or secrets

next_action:
- run targeted `vitest` and `typecheck`, then append evidence summary to repo status files

## Evidence Notes

High-confidence findings from source:

1. `readDocumentCore()` is dead code for product routing.
2. The runtime equivalent of a document profile is `DocTypeSpec`, not `DocumentProfile`.
3. Re-Parole and EAD each build `CanonicalDocumentResult`, but TPS and Translation do not do so uniformly.
4. Military ID and birth certificate are not fully migrated to the shared Core/docintel path.
