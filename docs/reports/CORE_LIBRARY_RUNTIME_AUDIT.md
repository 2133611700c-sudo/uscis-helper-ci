# CORE_LIBRARY_RUNTIME_AUDIT

Date: 2026-06-03
Scope: runtime usage proof from source imports and call sites only

## Verdict

The project has a shared library layer, but several required libraries are not wired through the live cross-product Core path. Some are only used in legacy TPS modules, some only in central-brain/translation subsystems, and some are present as policy intent but not runtime extraction logic.

## Runtime Usage Summary

### Confirmed runtime-used in active OCR flows

#### KMU-55

Confirmed runtime use:

- `apps/web/src/lib/docintel/transliterationPolicy.ts`
- called by `apps/web/src/lib/docintel/documentFieldReader.ts`
- transitively used by TPS Core path, Translation path, Re-Parole Core path, and EAD Core path via `readDocument()`

Status:

- runtime-used by shared docintel path

#### MRZ

Confirmed runtime use:

- `apps/web/src/lib/canonical/core/mrzAuthority.ts` uses `parseMrz` from `@uscis-helper/knowledge`
- injected in TPS Core passport path
- injected in Re-Parole Core passport path

Not wired:

- EAD Core route does not inject MRZ candidates
- Translation route does not inject MRZ candidates

Status:

- runtime-used, but not uniformly across products

#### documentClassPolicy / hard-case policy

Confirmed runtime use:

- `apps/web/src/app/api/tps/ocr/extract/route.ts`
- `apps/web/src/app/api/translation/vision-extract/route.ts`

Not wired:

- Re-Parole route does not call `checkImageQuality`, `applyHardCaseReviewOverride`, or `applyCertificateRoleGuard`
- EAD route does not call them

Status:

- runtime-used only in TPS and Translation

#### label/value guard

Confirmed runtime use:

- `apps/web/src/lib/tps/modules/labelValueExtractor.ts`
- called by `apps/web/src/lib/tps/modules/birthCertificate.ts`
- birth certificate module called from TPS OCR route only

Status:

- runtime-used, but only in legacy TPS birth certificate module

#### agency registry

Confirmed runtime use:

- `lookupAuthority()` in `apps/web/src/lib/tps/modules/militaryId.ts`
- `lookupAuthority()` and `translateCivilRegistryTerm()` in `apps/web/src/lib/tps/modules/birthCertificate.ts`

Also used in central-brain orchestrator:

- `apps/web/src/lib/engine/orchestrator.ts`

Not wired in shared docintel/Core path:

- `docintel/transliterationPolicy.ts` does not use `lookupAuthority()`
- Re-Parole/EAD adapters do not resolve agencies

Status:

- runtime-used, but only in legacy TPS modules and central-brain

#### gazetteer

Confirmed runtime use:

- `snapCity()` in `apps/web/src/lib/engine/orchestrator.ts`
- `normalizeCity()` in `apps/web/src/lib/docintel/transliterationPolicy.ts`
- `normalizeCity()` in `apps/web/src/lib/tps/dictionaryBridge.ts`

Important nuance:

- shared docintel path does not call `snapCity()` directly
- it calls `normalizeCity()`, whose implementation is in TPS dictionary bridge, not the canonical Core package itself

Status:

- runtime-used, but split across shared docintel and non-Core bridge code

### Present but not proven runtime-used in live shared Core path

#### birth_certificate schema

Found:

- `apps/web/src/lib/translation/forms/ukraine/schemas/birth-certificate.schema.ts`

Observed usage:

- translation PDF/template/tests

Not observed:

- no OCR route imports this schema
- no shared Core extraction path imports this schema
- no route-level birth certificate role extraction depends on this schema at runtime

Status:

- not runtime-used in OCR/Core extraction flow

#### military_id schema

Observed:

- no equivalent schema file found in the OCR/Core path
- military document definitions exist in `translation/docDefinitions.ts`, but not as a shared OCR extraction schema

Status:

- not runtime-used as a shared extraction schema

### Conceptual-only / partially wired

#### `readDocumentCore()`

Found:

- `apps/web/src/lib/canonical/core/readDocumentCore.ts`

Observed runtime calls:

- none in product routes

Status:

- not runtime-used

#### `CanonicalDocumentResult`

Observed runtime use:

- built in Re-Parole route
- built in EAD route

Not built in:

- Translation Core path
- live TPS Core path

Status:

- partially runtime-used

#### `DocumentProfile`

Observed:

- no live `DocumentProfile` symbol in OCR/Core stack
- actual runtime equivalent is `DocTypeSpec` from `docintel/types.ts`

Status:

- not present as named runtime abstraction

## Product-by-Product Library Wiring

| Library / policy | TPS | Translation | Re-Parole | EAD |
| --- | --- | --- | --- | --- |
| KMU-55 via shared docintel | partial | yes | yes | yes |
| MRZ authority | yes | no | yes | no |
| agency registry | yes, legacy-only | central-brain only, not route Core | no proof | no proof |
| gazetteer / city normalization | yes | yes | yes via docintel | yes via docintel |
| documentClassPolicy | yes | yes | no | no |
| hard-case override | yes | yes | no | no |
| birth certificate schema | no OCR proof | no OCR proof | no OCR proof | n/a |
| military ID schema | no | no | no | n/a |
| label/value guard | yes, birth cert legacy module | no | no | no |

## High-Signal Gaps

1. The shared docintel/Core path does not currently prove runtime use of the agency registry for shared extraction across all products.
2. MRZ authority is not uniformly wired; EAD and Translation do not consume it.
3. `documentClassPolicy` is not cross-product; Re-Parole and EAD routes omit it.
4. `birthCertificateSchema` is not part of runtime OCR extraction despite policy comments requiring certificate-specific schema handling.
5. No shared military-document schema is wired into OCR extraction.
6. The label/value guard exists only inside TPS birth certificate extraction, not as a shared Core primitive.

## Bottom Line

The runtime library picture is mixed:

- strong shared use for doc registry, Gemini docintel read, KMU-55 transliteration, and arbitration primitives
- partial or legacy-only use for MRZ, agency registry, hard-case policy, label/value protection
- no proof of runtime OCR/Core use for the named birth-certificate schema requirement
