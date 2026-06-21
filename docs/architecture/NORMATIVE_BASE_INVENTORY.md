# Normative Base — Inventory, Responsibility Map & Consolidation Plan
**Date:** 2026-05-30 · Scope: every dictionary, function, agent, and document in the
Ukrainian document pipeline, who applies what, and how to converge to ONE source of
truth (CLAUDE.md mandate: `packages/knowledge` is canonical; no parallel dictionaries).

---

## 0. The one rule
`packages/knowledge/` is the **single source of truth** for terminology,
transliteration, geography and normalization. Anything under
`apps/web/src/lib/translation/glossary/` or `apps/web/src/lib/tps/*dictionary*`
that holds DATA is a **parallel dictionary** and must be converged into knowledge.

---

## 1. DICTIONARIES (словари) — inventory

### 1A. Canonical (packages/knowledge) — KEEP
| File | Holds | Exposed via |
|---|---|---|
| `registry/registry.csv` → `registry.generated.ts` | **D-GLOSSARY**: 54 rows — authority×9, oblast×24, settlement×9, settlement_type×4, civil_registry_term×2, passport_authority×1, military_authority×1, abbreviation×2, field_label×1, document_type×1. Each row has `source_url` (ADR-013). | `registryLookup.ts` |
| `dictionary.ts` | LEGACY dictionary: AUTHORITIES, AUTHORITY_PATTERNS, GEO_CORRECTIONS, SETTLEMENT_TYPES, FIELD_LABELS, SEX_MAP, GLOBAL_BLOCKLIST, OBLAST_GENITIVE_TO_NOMINATIVE, DOCUMENT_TYPES | `index.ts` |
| `gazetteer.ts` | ~74 settlements + `snapCity` fuzzy match | `index.ts` |
| `registry/settlements.generated.ts` | **458 КАТОТТГ cities** (merged into registryIndex) | `registryLookup` |
| `civil_registry_terms.json` | ЗАГС/ДРАЦС/РАЦС terms (202 lines) | `civilRegistryTerms`, `translateCivilRegistryTerm` |
| `transliterate.ts` | **KMU-55** (Resolution 55/2010) | `transliterateKMU55` |
| `patronymic.ts`, `mrz.ts`, `normalize.ts` | patronymic rules, MRZ TD3 parser, normalizers | `index.ts` |

### 1B. Parallel / duplicate (apps/web) — CONVERGE or DELETE
| File | Problem | Consumers (live) |
|---|---|---|
| `glossary/civil_registry_terms.json` | **IDENTICAL DUPLICATE** of knowledge's (byte-for-byte, 202 lines) | 6 modules + tests |
| `glossary/ukraine_agency_abbreviations.json` | 57 agency abbreviations — **parallel** to registry `authority` | 7 modules + agencyGlossary |
| `glossary/glossaryLoader.ts` | inline `FULL_GLOSSARY` (passport_fields/admin_terms/agencies) — **parallel** | 2 extract routes |
| `glossary/agencyGlossary.ts` | logic (`resolveAgencyAbbr`/`scanTextForAgencyAbbr`/`resolveIssuedBy`) over the JSON | 10 files |
| `glossary/nominativeCaseRestorer.ts` | oblast case logic — overlaps registry `normalizeOblastRegistry` | few |
| `tps/dictionaryBridge.ts` | bridge over `dictionary.ts` | 3 TPS files |

---

## 2. FUNCTIONS (функции) — who resolves what

| Function (source) | Resolves | Used by |
|---|---|---|
| `transliterateKMU55` (knowledge) | Cyrillic → Latin (KMU-55) | renderValue, orchestrator, TPS |
| `lookupAuthority` (registryLookup) | agency UK→EN, era-locked | **engine/orchestrator** |
| `lookupSettlement` / `snapCity` | city/смт resolve + fuzzy | engine/orchestrator, schemas, presence |
| `translateCivilRegistryTerm` | ЗАГС/ДРАЦС → EN | orchestrator |
| `normalizeOblastRegistry` / `normalizeOblastToNominative` | oblast genitive→nominative | orchestrator |
| `resolveAgencyAbbr` / `resolveIssuedBy` (agencyGlossary) | abbreviation → agency (PARALLEL) | 10 module/validator files |
| `parseMrz` | passport MRZ controlling-Latin | passport module/engine |
| `buildAttestationRecord` (attestation) | 8 CFR audit record | generate-pdf route |
| `assertReviewGate` (reviewGate) | certification gate | generate-pdf route |

**Split brain:** the **engine/orchestrator** uses the canonical `registryLookup`;
the **legacy module pipeline** (8 `*.module.ts`) uses `agencyGlossary` + the parallel
JSONs. They resolve the same concepts from two different data sets.

---

## 3. AGENTS (агенты) — responsibility (ADR-AGENT-PERMISSIONS)
SourceResearch · Schema · Mapping · **Glossary** (owns `registry.csv` + regen, validateRegistry) ·
Renderer · OCR · LegalGuard · QA · ReleaseManager (only one who flips `active`/`BUREAU_PDF`).
The **GlossaryAgent** is the single owner of dictionary data → it must own ONE registry,
not 6 files.

---

## 4. DOCUMENTS (документы) — what, why, what applies
8 modules; **all `status:'draft'` except `passportBooklet` (`active`)** → drafts route to
manual review (auto=false), not auto-PDF.

| Document | Why | Dictionaries it pulls (`glossaryFiles`) | Functions |
|---|---|---|---|
| birth / marriage / divorce / death / name-change | civil-status certs for USCIS | `civil_registry_terms.json` + `ukraine_agency_abbreviations.json` | agencyGlossary, civilRegistryTerms, KMU-55 |
| internationalPassport | foreign passport (MRZ) | abbreviations + civil terms | parseMrz (controlling Latin) |
| ukrainianIdCard / passportBooklet | internal ID / booklet | abbreviations + civil terms | agencyGlossary |

Each document also has an **official schema** (`forms/ukraine/schemas/*` on `official-docs`)
and a **source** in `source-ledger.json` (verifier: КМУ-1025/152/302 ✅; military/diploma/pension ❌).

---

## 5. DEPENDENCY MAP (кто куда что применяет)
```
                 ┌─────────────── packages/knowledge (SoT) ───────────────┐
                 │ registry.csv→generated → registryLookup                │
                 │ dictionary.ts · gazetteer · civil_registry_terms.json  │
                 │ transliterate(KMU-55) · patronymic · mrz · normalize   │
                 └───────────────▲───────────────────────▲────────────────┘
                                 │ (canonical)            │ (re-export)
        engine/orchestrator ─────┘                        │
        (NOT yet live)                                    │
                                                          │
   LIVE module pipeline (8 *.module.ts, mostly draft) ────┘ but ALSO reads ↓
        apps/web/.../glossary/  ← PARALLEL: agency JSON + civil dup + glossaryLoader + agencyGlossary
        apps/web/.../tps/dictionaryBridge ← PARALLEL over dictionary.ts
```
**Two brains:** canonical registry (engine) vs parallel glossary (live modules).

---

## 6. CONSOLIDATION PLAN (сведение по инструкции) — phased & SAFE
Big-bang rewire of the live module pipeline is unsafe; converge in order, each phase green:

- **P1 — kill the literal duplicate.** `glossary/civil_registry_terms.json` is byte-identical to knowledge's. Re-point the 6 modules to `@uscis-helper/knowledge` `civilRegistryTerms`; delete the web copy. (low risk, pure path change)
- **P2 — agency data → registry.** Migrate the 57 `ukraine_agency_abbreviations.json` entries into `registry.csv` (category `authority`, with `source_url`); have `agencyGlossary` read the registry; delete the JSON. (medium — agencyGlossary is the adapter, repoint its data source.)
- **P3 — glossaryLoader → registry.** Replace inline `FULL_GLOSSARY` with registry-backed lookups (field_label/admin_terms become registry categories).
- **P4 — dictionary.ts / dictionaryBridge → registry.** Fold AUTHORITIES/SETTLEMENT_TYPES/etc. into registry; keep only logic (patterns) that isn't data.
- **P5 — single resolver.** Modules + engine both call `registryLookup`; remove the parallel adapters; `validateRegistry` (source_url gate) covers everything.

**Acceptance per phase:** module tests green, `validateRegistry` 0 errors, content-guard 0, tsc 0, no live recognition regression. Only `GlossaryAgent` edits registry data; only `ReleaseManager` flips `active`.

---

## 7. Honest state
- Canonical registry exists and is source-gated, but the **live module pipeline still runs on parallel dictionaries** — the convergence (P1–P5) is NOT done.
- ПФУ/КМУ/МОН/МОЗ/Мінрегіон were added to the registry (Session 65), but the parallel JSON still holds its own agency set → both must become one (P2).
- This document is the map; P1 is the safe first cut.
