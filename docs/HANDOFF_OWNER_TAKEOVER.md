# HANDOFF — OWNER TAKEOVER (2026-06-11)

**Одной строкой:** агентский цикл собрал One-Core арбитраж + review-first
пайплайн для рукописи + 6 зарегистрированных mirror-схем (+3 паспортные —
построены, НЕ зарегистрированы) + HEIC-поддержку + E2E CI-смоуки + L1
triage/acks/crons + L2 GT benchmark runner + observability-флаги; дальше всё —
руками владельца по списку ниже.

## 1. Инвентарь (что есть и в каком состоянии)

### Схемы (mirror PDF)
- **6 зарегистрированных** (live при `MIRROR_PDF_ENABLED=1`): internal passport
  booklet, international passport, id card, birth, marriage, divorce / military —
  полный список плиток визарда покрыт.
- **3 паспортные схемы построены, НЕ зарегистрированы** (осознанно — регистрация
  в `OFFICIAL_SCHEMAS` = немедленный live-switch клиентского PDF):
  `internal-passport.schema.ts`, `international-passport.schema.ts`,
  `id-card.schema.ts`. Пин-тест `passportSchemas.test.ts` 5/5 фиксирует
  `hasOfficialSchema(...)===false`. Включение — только по migration-плану
  `docs/ops/PASSPORT_MIGRATION_RUNBOOK.md (пошаговые команды; план: docs/ops/PASSPORT_SCHEMA_MIGRATION_PLAN.md)`.

### Гейты (safety)
- `confirmedValueGuard` — SHADOW-режим по умолчанию (выходная дверь).
- `certifier_override` — построен, флаг **OFF** (`CERTIFIER_OVERRIDE_ENABLED`).
- Anti-fabrication гейты — построены, за флагами, default OFF.
- **Review-first для рукописи** — LIVE: ни одно рукописное значение не
  финализируется без ✍️-подтверждения. Это главный анти-silent-wrong контур.

### Observability
- `guard_block_events` (Supabase, PII-free) — пишется при
  `GUARD_BLOCK_METRICS_ENABLED=1` (включён 2026-06-11, baseline 14 дней).
- post-deploy-smoke — value-checking (не просто 200, а реальные значения полей).
- post-deploy-ui-smoke — Playwright, **7/7** проходов по визарду.

### E2E-покрытие
- 7 wizard-кейсов в CI (по одному на каждый тип документа), синтетические
  фикстуры в `test-fixtures/*.jpg`.

## 2. Действия владельца (по порядку, с оценкой времени)
1. **~30 мин — production-валидация.** Пройти
   `docs/ops/OWNER_PRODUCTION_VALIDATION_CHECKLIST.md` (7 типов + HEIC +
   rotation), заполнить таблицу отчёта, собрать логи для ментора.
2. **Ongoing — 14-дневный L1 baseline.** `GUARD_BLOCK_METRICS_ENABLED=1` работает
   с 2026-06-11. НИЧЕГО не трогать и не «подкручивать» данные: порог
   `GUARD_BLOCK_RATE_THRESHOLD` выставляется только ПОСЛЕ 14 дней по факту.
3. **Ongoing, 8–16 ч суммарно — GT-масштабирование до N=30/класс.** Собрать
   ground-truth документы по каждому классу. Только владелец переводит
   provenance в `owner_verified` — агент/ментор этого не делают.
4. **Решение — канарейка регистрации паспортных схем.** По шагам
   `docs/ops/PASSPORT_MIGRATION_RUNBOOK.md (пошаговые команды; план: docs/ops/PASSPORT_SCHEMA_MIGRATION_PLAN.md)`: флаг
   `PASSPORT_SCHEMA_RENDERER_ENABLED` → dual-render → snapshot на owner-GT →
   visual diff → canary (шаг E) → 7d monitoring → full ON. Rollback = снять флаг.
5. **Решение — scope US-документов.** Расширять ли переводчик на американские
   документы (и какие). Пока не решено — не строим.
6. **Решение — TPS/Reparole-расширение.** Подключать ли пайплайн к
   TPS/Reparole-формам. Пока не решено — не строим.

## 3. Когда звать ментора (и когда НЕ звать)
**Звать обязательно:**
- L1 baseline rate-alert сработал неожиданно (до выставления порога алертов
  быть не должно вообще);
- паспортная канарейка (шаг E migration-плана) провалилась;
- ЛЮБОЙ инцидент silent-wrong (рукописное/неверное значение ушло клиенту без
  review).

**НЕ звать (рутина, делается самостоятельно):** обычные операции по чеклистам,
простые баг-фиксы, обновления документации.

**Разделение ролей:** Supabase-миграции делает ментор. GT provenance →
`owner_verified` переключает ТОЛЬКО владелец.

## 4. Жёсткие правила (напоминание)
- **PII:** фото/данные с реальными именами — только в gitignored `qa-private/`.
  Везде остальное — синтетика (Ivanenko). Никаких реальных ПД в git, логах,
  скриншотах, отчётах.
- **Deploy:** только `git push` в main (Vercel деплоит сам). НИКОГДА не
  `vercel --prod` руками — это обходит CI-смоуки и post-deploy проверки.
- Healthcheck после каждого деплоя: https://messenginfo.com/api/healthz.
