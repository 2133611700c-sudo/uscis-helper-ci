# LEGACY PASSPORT TEMPLATE AUDIT (2026-06-11, agent-inventoried)

## Решающая точка legacy-vs-schema (THE switch)
`apps/web/src/app/api/translation/generate-pdf/route.ts:277` —
`MIRROR_PDF_ENABLED==='1' && hasOfficialSchema(doc_type)` → mirror; иначе → generic
`generateTranslationPDF`. ⇒ **Регистрация схемы в OFFICIAL_SCHEMAS = немедленное
переключение клиентского PDF.** Поэтому новые паспортные схемы созданы, но НЕ
зарегистрированы (см. PASSPORT_SCHEMA_MIGRATION_PLAN).

## Три legacy-шаблона
| Template | status | allowAutoPdf | fields | Suppressed (никогда в output) |
|---|---|---|---|---|
| passportBooklet | active | **true** (единственный self-serve) | 14 | — |
| internationalPassport | draft | false (identity-anchor) | 13 | personal_number, mrz_line_1/2 |
| ukrainianIdCard | draft | false | 15 (doc_number ≠ record_number!) | rnokpp, mrz_line_1/2 |

## Usage map
modules/* (3 модуля), tps/translationBridge (resolveTranslationTemplate),
passport/passportBookletContract; тесты: templates/__tests__ (2), v5StandardLayer,
passportBookletContract, modules-тесты пинят allowAutoPdf семантику.

## allowAutoPdf enforcement chain
classify/route (selfServeEligible) → generate-pdf reviewGate (403) → render/route
(423 при open manual-ticket для draft-модулей). Гейты НЕ зависят от mirror-пути.

## Suppression-инвариант для будущих схем
Любая паспортная схема ОБЯЗАНА сохранять подавление personal_number/rnokpp/MRZ-строк
(legacy auditRenderOutputForSuppressedFields) — в schema-мире это значит: эти ключи
в schema НЕ объявляются вовсе (buildMirrorValues не получит их в whitelist).
