# PASSPORT SCHEMA MIGRATION PLAN (legacy template → schema-driven mirror)

KEY FACT: регистрация схемы в OFFICIAL_SCHEMAS = НЕМЕДЛЕННЫЙ live-switch клиентского
PDF (generate-pdf:277 `hasOfficialSchema→mirror`). Поэтому 3 паспортные схемы созданы,
протестированы и НЕ зарегистрированы (пин: passportSchemas.test.ts).

A. Flag `PASSPORT_SCHEMA_RENDERER_ENABLED` (default OFF): регистрация per-docType
   только при флаге (условный registry-вызов registerPassportSchemas()).
B. Dual-render в тесте: для N GT-доков рендерить ОБА пути, складывать пары PDF.
C. Snapshot-тесты на ≥10 owner-GT документах (text-extraction построчно).
D. Visual diff (image-diff постранично; допуск — только layout-инварианты).
E. Canary: flag ON 5% (или owner-сессии only).
F. Monitoring 7 дней: pdf success-rate, unresolved-rate, жалобы.
G. Full ON → H. удаление legacy templates + modules (отдельный PR).

## Risk matrix
| Риск | Митигировано |
|---|---|
| Visual regression | C+D до canary |
| Field-name mismatch (template 14 полей ≠ extraction 6) | schema keys = docintel names; расширение полей = отдельный extraction-шаг |
| Suppression нарушение (MRZ/RNOKPP/personal_number) | ключи не объявлены + тест-пин |
| allowAutoPdf семантика (intl/id_card = manual-review only) | classify/render гейты не зависят от mirror — сохраняются |

## Rollback
`vercel env rm PASSPORT_SCHEMA_RENDERER_ENABLED production` + redeploy (byte-identical legacy).
