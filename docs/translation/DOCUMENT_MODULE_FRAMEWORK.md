# Document Module Framework

**Version:** 1.0  
**Date:** 2026-05-09  
**Commit:** `8ab712a`  
**Status:** Production-ready (passport active, birth cert draft)

---

## What It Is

A typed, registry-driven system that defines every document type the platform supports. Instead of hardcoded field arrays in route handlers, each document type has a single authoritative `DocumentModule` object that specifies its fields, validators, extraction config, review policy, and routing behavior.

**Core guarantee:** Any document type can be uploaded. Only modules with `status: 'active'` and `allowAutoPdf: true` may generate a PDF automatically. Everything else routes to manual review — cleanly, without throwing.

---

## File Map

```
apps/web/src/lib/translation/modules/
├── types.ts                        ← Core framework types (DocumentModule, FieldSpec, etc.)
├── registry.ts                     ← Central lookup and routing
├── classifier.ts                   ← Alias normalization + confidence routing
├── adapters.ts                     ← Bridge to existing route handlers
├── passportBooklet.module.ts       ← ua_internal_passport_booklet (active)
├── birthCertificate.module.ts      ← ua_birth_certificate (draft — routes to manual review)
├── manualReview.module.ts          ← manual_review_required (fallback, never auto-PDF)
└── __tests__/
    ├── moduleRegistry.test.ts      ← 57 tests
    ├── classifier.test.ts          ← 75+ tests
    ├── passportBooklet.module.test.ts ← 90+ tests
    └── manualReview.module.test.ts ← 33 tests
```

---

## Module Status Lifecycle

```
active      → fully supported; auto-PDF allowed if allowAutoPdf=true
draft       → skeleton defined; not for auto-PDF; routes to manual review
manual_only → exists only to surface the manual-review path; never auto-draft
disabled    → do not use; hidden from all user-facing flows
```

Only `active` modules with `reviewPolicy.allowAutoPdf: true` can produce auto-PDFs. Every other status routes to the manual review module.

---

## Routing Safety Contract

The registry and classifier uphold these invariants — always, without exception:

| Input | Result |
|-------|--------|
| Unknown document type | `manualReviewModule` |
| `draft` module | `manualReviewModule` |
| `disabled` module | `manualReviewModule` |
| `manual_only` module | `manualReviewModule` (pass-through) |
| `active` module | The module itself |
| Confidence < 0.85 | `manualReviewModule` |
| null / undefined / empty | `manualReviewModule` |
| Any exception path | `manualReviewModule` (never throws) |

---

## Currently Registered Modules

### `ua_internal_passport_booklet` — active

Ukrainian internal passport (blue booklet, Cyrillic). The only module in production auto-draft.

**11 critical fields:** document_type, series, number, surname, given_names, patronymic, date_of_birth, place_of_birth, sex, issued_by, date_of_issue

**4 optional fields:** nationality, date_of_expiry, record_number, registration_address

**Validators:** passport_series_format, passport_number_format, date_of_birth_lock, date_of_issue_lock, month_map_uk_ru, name_mixed_script, agency_glossary, no_police_for_pre2015_mvs, bilingual_layer, source_evidence_required, date_zone_cross_check

**Key wiring:**
- `certify/route.ts` — gate checks all 11 critical fields (was 8)
- `render/route.ts` — gate + evidence audit use all 11 critical fields
- `ocr-from-storage/route.ts` — CRITICAL_FIELDS Set + placeholder guard both driven by module

### `ua_birth_certificate` — draft

Planned but not yet implemented. Routes to manual review. Prerequisites before activation:
1. P001 passport pilot GO decision received
2. At least 3 anonymized birth cert samples (new format + Soviet-era + handwritten)
3. `civil_registry_glossary.json` created
4. `certificate_number_not_act_record_number` validator implemented
5. `self_cert_birth_v1.ts` certification template approved
6. Full test suite for field extraction

**Critical distinction that USCIS cares about:**  
`certificate_number` (e.g. І-КВ 123456) ≠ `act_record_number` (e.g. 789). These are different fields. USCIS forms sometimes request the act record number specifically. Both must be extracted separately.

### `manual_review_required` — manual_only

Fallback for all unresolvable, draft, and unknown documents. Never auto-generates a PDF. 9 unsupported condition codes. Used as the fallback by all routing functions.

---

## Registry API

```typescript
import {
  getDocumentModule,     // safe lookup with fallback
  findDocumentModule,    // raw lookup, returns null if not found
  listDocumentModules,   // all modules except manual_review sentinel
  listActiveModules,     // only active modules
  isAutoDraftSupported,  // true only for active + allowAutoPdf
  getFallbackModule,     // always manualReviewModule
  classifyToModule,      // lookup + confidence threshold check
  getRegisteredDocumentTypes,
} from '@/lib/translation/modules/registry'
```

**Never use** `findDocumentModule()` in route handlers. Use `getDocumentModule()` — it applies the safety routing and never returns null.

---

## Classifier API

```typescript
import {
  classifyDocumentType,    // returns ClassificationResult (module + metadata)
  resolveDocumentModule,   // simplified: returns just the module
  getAliasTable,           // for testing/inspection
} from '@/lib/translation/modules/classifier'
```

### Alias Table (key examples)

| Raw input | Resolves to |
|-----------|-------------|
| `ua_internal_passport_booklet` | `ua_internal_passport_booklet` |
| `ua_passport_booklet` | `ua_internal_passport_booklet` |
| `internal_passport` | `ua_internal_passport_booklet` |
| `ua_passport_internal` | `ua_internal_passport_booklet` (legacy render default) |
| `паспорт` | `ua_internal_passport_booklet` |
| `ua_birth_certificate` | `ua_birth_certificate` → manualReview (draft) |
| `birth_certificate` | `ua_birth_certificate` → manualReview (draft) |
| `manual_review` | `manual_review_required` |
| `unknown` | `manual_review_required` |

The classifier normalizes: lowercase, trim, then tries exact → underscores-to-hyphens → underscores-to-spaces.

---

## Adapters API (for route handlers)

```typescript
import {
  getCriticalFieldsForDocumentType,         // string[] — for gate checks
  getEvidenceRequiredFieldsForDocumentType, // string[] — evidenceRequired='required' only
  getAllFieldTargetsForDocumentType,         // string[] — critical + optional
  getCriticalFieldSetForDocumentType,       // Set<string> — for O(1) membership
  getReviewPolicyForDocumentType,           // ReviewPolicy object
  isAutoDraftSupported,                     // boolean
  getUserStatusMessageForDocumentType,      // safe user-facing message
} from '@/lib/translation/modules/adapters'
```

All adapter functions accept `string | null | undefined` and never throw. Unknown types fall back to the passport booklet module (backward compatibility during transition — remove this fallback once all DB `doc_type` values are normalized).

---

## Wired Routes

| Route | Before | After |
|-------|--------|-------|
| `certify/route.ts` | 8-field hardcoded array | `getCriticalFieldsForDocumentType(doc_type)` — 11 fields from session |
| `render/route.ts` | 8-field hardcoded array | `getCriticalFieldsForDocumentType(doc_type)` from sessionData |
| `render/route.ts` (evidence) | same 8-field array | `getEvidenceRequiredFieldsForDocumentType(doc_type)` |
| `ocr-from-storage/route.ts` (Set) | 8-field Set | `getCriticalFieldSetForDocumentType(docType)` |
| `ocr-from-storage/route.ts` (placeholder guard) | 11-field hardcoded array | `getCriticalFieldsForDocumentType(docType)` |

**Not yet wired** (next sprint):
- `confirm-field/route.ts` — still uses 8-field hardcoded list for `canCertify` check
- `review-state/route.ts` — same
- `correct-field/route.ts` — same
- `field-mapper.ts` — still uses `UA_INTERNAL_FIELDS` hardcoded array
- `inputValidation.ts` — still uses `UA_PASSPORT_ALLOWED_FIELDS` Set

These are safe to defer: the non-wired routes don't block PDF generation and the field lists are consistent with the module for passport sessions.

---

## Adding a New Document Type

1. Create `apps/web/src/lib/translation/modules/<name>.module.ts` with `status: 'draft'`
2. Register it in `registry.ts` MODULE_REGISTRY
3. Add alias entries in `classifier.ts` DOCUMENT_TYPE_ALIASES
4. Write tests in `__tests__/<name>.module.test.ts`
5. Do NOT set `allowAutoPdf: true` until the module is promoted to `status: 'active'`
6. Do NOT promote to `active` without:
   - At least 3 real document samples tested
   - All critical field validators implemented
   - Full test suite passing
   - Business decision to support the document type

---

## Next Sprint Work

1. **Wire remaining routes** to adapters (confirm-field, review-state, correct-field)
2. **Wire field-mapper.ts** — replace `UA_INTERNAL_FIELDS` with `getAllFieldTargetsForDocumentType()`
3. **Wire inputValidation.ts** — replace `UA_PASSPORT_ALLOWED_FIELDS` Set with `getCriticalFieldSetForDocumentType()`
4. **Birth certificate activation** — after P001 GO decision and 3 sample documents
5. **Remove backward-compat fallback** in `adapters.ts` once all DB `doc_type` values are normalized
