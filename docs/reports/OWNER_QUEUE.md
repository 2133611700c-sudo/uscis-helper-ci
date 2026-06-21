# OWNER_QUEUE — задачи, которые может сделать только владелец

Агент паркует сюда owner-gate задачи и выдаёт батчем на чекпойнте фазы.
Не делать самому: платные прогоны, prod env, billing, browser-auth, ground-truth значения.

## Phase: Path A (P1.5.4 + P2)

### OG-1 — Вписать ground-truth значения (разблокирует измерение точности P2)
- Файлы (шаблоны уже созданы, поля пустые):
  - `test-fixtures/real-docs/ground-truth/birth_cert_handwritten_ivanenko.json`
  - `test-fixtures/real-docs/ground-truth/birth_cert_soviet_ivanenko.json`
  - `test-fixtures/real-docs/ground-truth/military_id_p1_ivanenko.json`
- Что сделать: открыть фикстуру-картинку, вписать ЭКЗАКТНЫЕ значения, выставить `_meta.ground_truth_status: "VERIFIED_BY_OWNER"`.
- Зачем: без этого нельзя доказать что P2 (snapCity/patronymic/authority) реально улучшает точность. Сейчас доказана только liveness.
- Booklet уже VERIFIED — `qa-private/ground-truth/internal_passport_ivanenko.json` (трогать не надо).

### OG-2 — (опционально) P1.5.3 полная платная baseline matrix
- Owner-gate: платные API-прогоны всех product×class.
- НЕ блокирует Path A. Делать только если нужна полная матрица, а не Gemini-core subset.

### OG-3 — micro: YAML quoting в каноне (необязательно)
- `docs/MIGRATION_BRIEF.yaml` строки вида `{... used_in: orchestrator.ts:65}` не парсятся строгим ruby psych 2.6 (двоеточие во flow-значении).
- Канон человеко-читаемый, приложение его не грузит — НЕ блокирует. Если захочешь строгую валидность: обернуть значения в кавычки `"orchestrator.ts:65"`.
