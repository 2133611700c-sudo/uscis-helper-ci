# D-GLOSSARY — Glossary Registry Department (Central Brain)

**Status:** G1 built (beside the old system). Not yet wired into the live normalize path (that is G2).
**Date:** 2026-05-29

## Purpose
One source of truth for every Ukrainian glossary term — authorities, settlements,
oblasts, settlement types, abbreviations, civil-registry terms, passport/military
authorities, document types, field labels — that the Central Brain calls **after
OCR/HTR and before translation/PDF**. Replaces three fragmented stores
(`dictionary.ts`, `gazetteer.ts`, `civil_registry_terms.json`) that the live brain
only partially consumed.

## One source → two representations
- **`registry.csv`** — human-editable table (open in Excel/Sheets, sort, filter by `category`). One row = one term.
- **runtime index** (`registryIndex.ts`) — compiled maps for fast agent lookup.

## Files (`packages/knowledge/src/registry/`)
| File | Role |
|---|---|
| `registry.schema.ts` | types, column order, `LookupResult` |
| `registry.csv` | the data (source of truth, every row has `source_url`) |
| `registryLoader.ts` | CSV parser + `validateRegistry` (CI gate) |
| `registryIndex.ts` | builds category/alias maps (lazy singleton) |
| `registryLookup.ts` | `lookupRegistry()` + 7 helper fns + catalog |
| `registry.test.ts` | 10 tests incl. the 7 mandatory |

## CSV columns
`category, key_uk, key_ru, official_en, aliases(|-sep), valid_from, valid_until, source_url, source_authority, source_act, confidence_rule, review_rule, warning, notes`

## Runtime API
```
lookupRegistry(category, input, { documentDate?, oblast?, strict? }) → {
  matched, official_en, normalized_uk, source_url, valid_from, valid_until,
  confidence, review_required, warning, candidates, settlementType?, reason
}
```
Helpers: `lookupAuthority`, `lookupSettlement`, `normalizeSettlementType`,
`normalizeOblastRegistry`, `translateCivilRegistryTerm`, `translatePassportAuthority`,
`resolveAbbreviation`, `registryCatalog`.

## Safety instruments (the rules that were missing)
1. **Never translate without provenance** — a matched result always carries `source_url`; `validateRegistry` fails CI on any row without one.
2. **Era-gating** — `valid_from/valid_until` vs `documentDate`. A 1986 document is never modernised (e.g. `міліція@1986 → Militsiya`, not National Police; `Кіровоград` not auto-`Kropyvnytskyi`). Era mismatch → `review_required` + warning, never silent.
3. **Never drop the settlement type** — `смт/с./м.` is detected, kept (`settlementType`), and carried with its “NEVER city/town” warning.
4. **Never a silent guess** — fuzzy (`Простянець→Trostianets`) and unknown inputs return `review_required=true` with candidates.

## Sources seeded
КАТОТТГ (Наказ Мінрегіону №290, 26.11.2020), КОАТУУ, КМУ №1025 (civil status),
Закон №580-VIII (National Police), ДМС official EN names, Постанова №1351 (Кіровоград→Кропивницький 2016).

## Forbidden (enforced by design/tests)
- translate an authority without `source_url`
- use a modern name for an old document without date check
- strip `смт/с./м.` without keeping the type
- silently return empty
- let DeepSeek/Gemini translate authority names without a glossary lock

## Next steps
- **G2** — wire `engine/orchestrator.ts::normalize` + `terminologist.ts` to call `lookupRegistry` (replace the partial `dictionary.ts`/`gazetteer.ts` path); keep old as fallback until parity tests pass, then remove.
- **G3** — load full KOATUU/КАТОТТГ settlements + civil-registry terms into the CSV; oblast-scoped settlement search.
- **G4** — `registryCatalog()` on the brain health endpoint; CI gate `validateRegistry` in the test suite.
- **Serverless note:** `registryLoader` reads the CSV via `fs`; for the Vercel runtime, G2 should compile the CSV → a generated TS module at build time (one source, two representations) so no fs read at request time.
