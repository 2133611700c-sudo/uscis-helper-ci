# FINAL STATUS — 2026-06-11 (FINAL-CLOSURE session)

## Что закрыто этой сессией

### P1 — Аудит legacy-шаблонов паспортов
`docs/architecture/LEGACY_PASSPORT_TEMPLATE_AUDIT.md`. Ключевой факт: точка
переключения legacy↔schema — `generate-pdf/route.ts:277`
(`MIRROR_PDF_ENABLED==='1' && hasOfficialSchema(doc_type)`). Регистрация схемы
в `OFFICIAL_SCHEMAS` = НЕМЕДЛЕННЫЙ live-switch клиентского PDF.

### P2 — 3 паспортные схемы (созданы, НЕ зарегистрированы)
- `internal-passport.schema.ts` (6 полей, ключи = docintel-имена)
- `international-passport.schema.ts` (5 полей, ICAO 9303, MRZ/personal_number подавлены отсутствием)
- `id-card.schema.ts` (5 полей, Закон 1474-VIII)
- Тесты `passportSchemas.test.ts` 5/5: форма + инвариант подавления + пин
  `hasOfficialSchema(...)===false` (НЕ зарегистрировано — осознанно).

**Отклонение от промта (зафиксировано):** пункты 2.4 («зарегистрируй») и 2.6
(«legacy остаётся primary») противоречат друг другу, т.к. регистрация и есть
переключатель. Решение: схемы готовы, регистрация — отдельный шаг по
migration-плану (P3).

### P3 — Migration plan
`docs/ops/PASSPORT_SCHEMA_MIGRATION_PLAN.md`: flag-gated регистрация →
dual-render → snapshot на owner-GT → visual diff → canary → 7d monitoring →
full ON → удаление legacy. Rollback = снять env-флаг.

### P4 — HEIC (iPhone) поддержка
- **Критическая находка:** sharp НЕ декодирует iPhone HEIC — prebuilt libvips
  собран без HEVC-кодека (патенты). Проверено локально на реальном
  sips-сгенерированном HEIC: `compression format has not been built in`.
  На Vercel было бы то же самое. Чужая sharp-врезка в vision-extract
  (`transcodeHeicIfNeeded`) была нерабочей — удалена.
- Решение: `heic-convert` (WASM libheif+libde265, работает в serverless) →
  новый модуль `lib/ocr/heicToJpeg.ts` (детект по MIME И magic bytes,
  fail-open — никогда не 500).
- Врезки: vision-extract (конверсия на intake до валидации — чинит ensemble,
  Core и legacy одной точкой), translation/upload (типы + конверсия до
  storage, в Supabase ложится уже JPEG), image-preprocess (шаг 0 — централизованно
  чинит TPS/EAD/Reparole, которые ПРИНИМАЛИ heic по MIME, но preprocess его резал).
- Тесты 6/6 на РЕАЛЬНОМ HEIC-декоде (фикстура `test-fixtures/synthetic-passport.heic`,
  sips из синтетики, ноль PII), включая полный preprocess end-to-end.
- Клиентский downscale fail-open: HEIC>3.8MB на десктоп-Chrome не ужмётся
  (createImageBitmap не декодирует HEVC) → возможен 413 на очень больших HEIC.
  Типичные iPhone HEIC 1.5–3 MB — проходят. Известное ограничение.

### P5 — Discoverability
- Футер → Resources → «Supported Documents» (4 локали, next-intl ключ
  `footer.columns.resources.links.supportedDocuments`).
- `/supported-documents`: строка форматов «JPEG, PNG, WEBP, HEIC (iPhone), до 10 МБ».
- FAQ: 4 записи (en/ru/uk/es) `faq-031-supported-documents-*` в `faqAnswers.ts`.

## Не сделано / owner-side
- Регистрация паспортных схем — ТОЛЬКО по migration-плану P3 (это live-switch).
- Owner: переснять каталог + HEIC с реального iPhone; GT до N=30; act#
  физическая сверка; Telegram token; 14d baseline → порог; enforce/override гейты.
- HTR (рукопись авто-финализация) = Phase 7, ЗАПРЕЩЕНА до условий ADR.

## Evidence
- passportSchemas 5/5; heicToJpeg 6/6 (real decode); tsc 0 errors.
- Полный сьют — см. CHANGELOG записи этой сессии.
