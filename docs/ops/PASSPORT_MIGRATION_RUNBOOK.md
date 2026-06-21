# PASSPORT MIGRATION RUNBOOK — пошагово для owner'а

Контекст: 3 паспортные схемы (booklet / international / id-card) staged за флагом.
План: `docs/ops/PASSPORT_SCHEMA_MIGRATION_PLAN.md`. Steps A–D уже выполнены агентом:

| Step | Что | Где |
|---|---|---|
| A | Flag-gated регистрация `PASSPORT_SCHEMA_RENDERER_ENABLED` | `schemas/registry.ts` (STAGED_PASSPORT_SCHEMAS) + registryFlagGating.test.ts |
| B | Dual-render лог `PASSPORT_SCHEMA_DUAL_RENDER_ENABLED` | `generate-pdf/route.ts` + `dualRenderCompare.ts` (PII-free hashes) |
| C | GT snapshot tests | `passportSchemaSnapshots.test.ts` (synthetic + локальные owner-GT; intl GT пуст — заполнить qa-private) |
| D | Visual diff harness | `apps/web/scripts/visual-diff-passport.ts` → /tmp/visual-diff-report.html |

Каждый шаг ниже = твоя команда + что смотреть + rollback inline.

## Шаг 0 — Pre-flight (5 мин)
```bash
# свежий visual diff на синтетике (артефакт, прод не трогает):
cd ~/work/uscis-helper
pnpm --filter web exec tsx scripts/visual-diff-passport.ts
open /tmp/visual-diff-report.html
```
Смотреть: mirror-layout приемлем по сравнению с generic-таблицей для всех 3 типов.
Если нет — STOP, сказать агенту что именно не так в layout.

## Шаг E — Canary (owner-сессии only)
Прод-флаг видят все, поэтому canary = включить и немедленно проверить САМОМУ
(owner-трафик в этот момент — твой тест; платящих клиентов на паспортных PDF мало).
```bash
vercel env add PASSPORT_SCHEMA_DUAL_RENDER_ENABLED production   # значение: 1
vercel env add PASSPORT_SCHEMA_RENDERER_ENABLED production      # значение: 1
git commit --allow-empty -m "chore: enable passport schema canary" && git push
```
(деплой ТОЛЬКО через git push — НИКОГДА `vercel --prod`.)

Сразу после деплоя — прогнать паспортные кейсы из
`docs/ops/OWNER_PRODUCTION_VALIDATION_CHECKLIST.md` (booklet, international, id-card):
- PDF-превью рендерится, поля на месте, ничего не исчезло;
- в Vercel logs искать `dual_render_compare` — записи появляются, без PII;
- /admin/status показывает passport schemas = REGISTERED (flag ON).

**Rollback (≤2 мин):**
```bash
vercel env rm PASSPORT_SCHEMA_RENDERER_ENABLED production
git commit --allow-empty -m "chore: rollback passport schema canary" && git push
```
Клиентский PDF мгновенно возвращается на legacy (байт-в-байт).

## Шаг F — Monitoring 7 дней
Ничего не делать руками. Раз в 1–2 дня смотреть:
- /admin/status: guard-block rate не растёт аномально; manual-review queue не пухнет;
- Vercel logs: `dual_render_compare` присутствует, `mirror render failed` отсутствует;
- жалобы клиентов на PDF = 0.
Любой инцидент → rollback из шага E + позвать ментора.

## Шаг G — Full ON
После 7 чистых дней: dual-render можно выключить (экономит рендер):
```bash
vercel env rm PASSPORT_SCHEMA_DUAL_RENDER_ENABLED production
git commit --allow-empty -m "chore: passport schema full ON, dual-render off" && git push
```
`PASSPORT_SCHEMA_RENDERER_ENABLED=1` остаётся.

## Шаг H — Удаление legacy (отдельный PR, агент)
Только после G: попросить агента «удали legacy passport templates per migration plan
step H». Не делать руками. Rollback после H = git revert этого PR.
