# DICTIONARY / TRANSLATION-RULES INVENTORY (2026-06-11)

КЛЮЧЕВОЙ ФАКТ (verified): `translationRule` в схемах — ДЕКЛАРАТИВНЫЙ контракт.
Центрального switch(rule) НЕ существует; реальные преобразования выполняются UPSTREAM
на этапе extraction/sanitation. Schema-rule = документация того, ЧТО применяется и где.

| Rule | Исполнитель (file:line) | Coverage | Known gaps | Поведение при miss |
|---|---|---|---|---|
| transliterate_kmu55 | packages/knowledge/src/transliterate.ts:54 (transliterateKMU55; + transliterateRussian BGN/PCGN, detectNameScript) | полный УА-алфавит, позиционные правила, ЗГ→Zgh; RU-ветка | — | как есть |
| date_normalize | transliterate.ts:176 (convertDateToUSCIS) | DD.MM.YYYY + прозой UA/RU месяцы | нестандартные форматы | null → review |
| place_gazetteer | packages/knowledge/src/gazetteer.ts (snapCity; 60 seed + 458 КАТОТТГ) | города/смт совр. | pre-2020 имена, сёла (28k не загружены), aliases пусты | raw + review (no-silent-snap) |
| glossary_authority | glossary/agencyGlossary.ts (+56-entry json) | МВС/РАЦС/ЗАГС/ТЦК…, era-safety (Militsiya≠Police) | неизвестные аббревиатуры | review_required |
| locked_verbatim | documentSafety/confirmedValueGuard.ts:52 | no-Cyrillic, no-ctrl, ≤200, date-формат | — | 422/null (shadow: лог) |
| translate_prose | — | НЕ реализован | весь rule | n/a (декларативный) |

## OWNER-DECISIONS (gaps требующие решения)
1. Gazetteer history (pre-2020 + renames + Крым-политика) — Phase-6 roadmap, owner-decision по спорным регионам.
2. translate_prose — будущая фаза (DeepSeek prose, LAW 7 границы).
3. Сёла (28k КАТОТТГ) — re-run gen-settlements.mts при потребности.
