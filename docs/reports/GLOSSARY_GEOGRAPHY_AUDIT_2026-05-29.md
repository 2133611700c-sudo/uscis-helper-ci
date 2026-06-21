# Glossary & Geography Gap Audit
**Date:** 2026-05-29 · **Branch:** fix/review-gate-hard-block (off main) · **Mode:** read-only (Prompt 7)

> Branch note: this audit ran on a **main-based** branch, which does NOT carry the
> D-GLOSSARY `registry/` layer (registry.csv / registryIndex / settlements.generated.ts).
> That richer layer lives on the unmerged stack (`feat/c3-presence` → `koatuu`). The
> counts below are therefore the **production (main)** state; the stack adds more.
> This is itself evidence for the merge-first discipline.

## Agency coverage (main-branch glossary)
Source files: `apps/web/src/lib/translation/glossary/ukraine_agency_abbreviations.json`
(56 abbreviations), `packages/knowledge/src/dictionary.ts` (19 authorities),
`glossary/civil_registry_terms.json`, `glossary/glossaryLoader.ts`.

**Covered (56 abbr):** МВС-era (20: МВС/УМВС/ГУМВС/РВ/ОВС…), ДМС (6), ЗАГС/РАЦС/ДРАЦС (4),
НПУ/ГУНП/ВП (5), ВИКОНКОМ/РДА/ОДА (3), ЦНАП (3), ВГІРФО/УВІР (4), ДСНС/ДПСУ (2), МОУ (1), ТЦК.
**Era-locked:** Міліція (until 2015-11-07), Паспортний стіл (until 2012), НПУ (from 2015) — historical preserved.

**Missing — prioritized:**
| Pri | Entry | EN | Justifying source |
|---|---|---|---|
| P0 | **ПФУ** | Pension Fund of Ukraine | source-ledger (pension cert) — every "issued by" hits review |
| P0 | **КМУ** | Cabinet of Ministers of Ukraine | act refs КМУ №1025/302 appear on blanks |
| P0 | **Мінрегіон** | Ministry of Regional Development | КАТОТТГ source attribution |
| P1 | **МОН / МОЗ** | Min. of Education / Health (abbr) | full names in glossaryLoader, abbr not searchable |
| P1 | **Мінюст (abbr)** | Ministry of Justice | dictionary has MINJUST key but not the abbr form |
| P2 | **ДПС** | State Tax Service | РНОКПП card issuer |

## Geography coverage
| Metric | main (this branch) | koatuu (unmerged) |
|---|---|---|
| Cities (settlements.generated.ts) | **ABSENT** | 458 КАТОТТГ cities (KMU-55) |
| Gazetteer seed (gazetteer.ts) | ~74 (24 oblast + ~50 raion centres) | same |
| Settlement-type abbr (dictionary.ts) | 17 (м./с./смт/обл./р-н/громада…) | same |
| КОАТУУ legacy (Soviet codes) | **NONE** | NONE |
| Villages layer | none (only seed) | none (cities only) |
| КАТОТТГ byte-verified | **NO** (source documented, no checksum) | NO |

## Fallback behaviour (verified)
- Unknown agency / fuzzy place → `review_required=true` (agencyGlossary `findUnrecognizedAbbreviations`, normalize `no_match_passthrough` conf 0.4). ✅ No silent guess.

## Blockers (owner / official source)
- ПФУ / КМУ / Мінрегіон / МОН / МОЗ entries — add with official source URLs.
- КАТОТТГ: download official XLSX (data.gov.ua / Мінрегіон), record sha256 → promote from "mirror" to byte-verified.
- КОАТУУ legacy: needed only for pre-1991 Soviet codes (<1% of scope) — document as known limitation, defer.

## Verdict
Agency ~56 abbr (good breadth, **missing ПФУ/КМУ/Мінрегіон/МОН/МОЗ**). Geography on main is
seed-only (74); the 458-city КАТОТТГ layer is **stranded on koatuu** — merge #27 to land it.
Fallback-to-review is correctly implemented. No byte-verification of geography yet.
