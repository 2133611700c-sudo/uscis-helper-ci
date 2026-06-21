## TPS Truth Ledger — 2026-05-26

**Status:** DEGRADED  
**Scope:** Без изменений кода/деплоя. Только фиксация текущей правды по TPS booklet-пайплайну.

---

### Repo state

- **HEAD**: `08b4132a63eed0563f45e0c96f8044b6b642f8b2`  
- **origin/main**: `08b4132a63eed0563f45e0c96f8044b6b642f8b2`  
- **Branch**: `main`  
- **Tracked working tree**: **DIRTY**  
  - `CHANGELOG.md`  
  - `HANDOFF.md`  
  - `STATUS.md`  
  - `apps/web/src/lib/tps/__tests__/provenance.test.ts`  
  - `apps/web/src/lib/tps/ai/__tests__/documentBrain.test.ts`  
  - `apps/web/src/lib/tps/ai/documentBrain.ts`  
  - `apps/web/src/lib/tps/ocr/__tests__/documentContracts.test.ts`  
  - `apps/web/src/lib/tps/ocr/documentContracts.ts`  
  - `apps/web/src/lib/tps/provenance.ts`  
- **Untracked (evidence + new test)** — неполный список по папкам:
  - `apps/web/tests/e2e/booklet-only-pdf-proof.spec.ts`
  - `docs/reports/evidence/finish-all-20260525-183306/**`
  - `docs/reports/evidence/finish-all-20260525-232716/**`
  - `reports/booklet-synthetic-multisample-20260525-182417.csv`
  - `reports/booklet-synthetic-multisample-20260525-182452.csv`

**Вывод:**  
`origin/main` чистый и зелёный, но локальный working tree содержит активные TPS-патчи + evidence‑артефакты. Любые утверждения вида «репо clean» сейчас неверны.

---

### Dirty-file classification (tracked)

- **DOB / валидация / контракт booklet**
  - `apps/web/src/lib/tps/ai/documentBrain.ts`
  - `apps/web/src/lib/tps/ai/__tests__/documentBrain.test.ts`
  - `apps/web/src/lib/tps/ocr/documentContracts.ts`
  - `apps/web/src/lib/tps/ocr/__tests__/documentContracts.test.ts`

- **Provenance mapping**
  - `apps/web/src/lib/tps/provenance.ts`
  - `apps/web/src/lib/tps/__tests__/provenance.test.ts`

- **E2E proof (новый сценарий)**
  - `apps/web/tests/e2e/booklet-only-pdf-proof.spec.ts` (**untracked**)

- **Docs truth updates**
  - `CHANGELOG.md`
  - `HANDOFF.md`
  - `STATUS.md`

---

### Scenario ledger

### Scenario separation table (строгий “не смешивать” контракт)

| Dimension | `booklet-review` (multi-doc) | `booklet-only-pdf-proof` (strict) |
|---|---|---|
| **Purpose** | Доказать, что production flow end-to-end работает: upload→OCR→review→generate→ZIP/PDF | Доказать booklet-origin для proof‑полей (особенно `family_name`) без влияния MRZ/DL/I‑94/EAD |
| **Uploads** | `passport` + `booklet` + `i94` + `i797_or_ead` + `dl` | Только `booklet` |
| **Expected winners** | STRONG_IDENTITY победит `passport_ocr_mrz` (или DL/I‑94/EAD), booklet не должен “перебивать” | Для proof‑полей winner обязан быть `booklet` (иначе proof невалиден) |
| **What it CAN prove** | Flow + ZIP/PDF генерация; присутствие некоторых строк в PDF readback | `_provenance.family_name.source_document_type == booklet` и (в том же прогоне) ZIP/PDF/readback |
| **What it CANNOT prove** | “family_name пришла из booklet” (по дизайну арбитра это часто будет `passport`/`dl`) | Общее качество multi-doc арбитража и конфликтов между источниками |
| **Manual edits allowed** | Допустимы как часть реального user-flow (но снижают ценность provenance proof) | Только `MANUAL_GATING_ONLY` поля; proof‑поля запрещено редактировать вручную |
| **PASS gate** | ZIP скачан + readback подтверждает ключевые поля (flow PASS) | В одном прогоне: OCR→review→generate payload provenance→ZIP→PDF readback (strict PASS) |

#### 1. `booklet-review` (multi-document production spec)

- **Файл:** `apps/web/tests/e2e/booklet-review.spec.ts`  
- **Слоты в сценарии:** `passport`, `booklet`, `i94`, `i797_or_ead`, `dl` — все загружаются одновременно.
- **Merge-путь:**
  - `/api/tps/ocr/extract` → `WizardData.uploads[slot].fields` (по `docHint = slotId`)
  - `resolveAllFields()` в `fieldArbiter.ts` (по `SourceDoc + SourceType` приоритету)
  - `mergedFields` в `TPSWizardV2.tsx`
  - далее `buildDraftAnswers` + `buildProvenanceFromWizard`

**Ожидаемые победители по источнику (по текущему коду):**

- **`family_name` (STRONG_IDENTITY)**  
  - MRZ (`passport_ocr_mrz`) имеет наивысший приоритет.  
  - Если MRZ нет, **DL (`dl_ocr_keyword`) стоит выше `booklet_dual_ocr_crossref`**.  
  - **Следствие:** в этом multi-doc тесте `family_name` закономерно может быть помечен как пришедший из `passport` или `dl`. Это **не баг** и не опровержение booklet‑трасы.

- **`given_name`, `dob`, `sex`, `passport_number` (STRONG_IDENTITY)**  
  - также ожидается приоритет: паспорт MRZ > I‑94/EAD/DL > booklet/Brain.  
  - Для `passport_number` booklet вообще не является источником (контракт booklet его запрещает).

- **`middle_name`, `city_of_birth`, `province_of_birth` (WEAK_REVIEW)**  
  - Приоритет WEAK_REVIEW: `booklet_dual_ocr_crossref` выше всего остального.  
  - **Именно эти поля — главная область ответственности booklet** в multi-doc сценарии.

**Вердикт по сценарию `booklet-review`:**  
Доказательство того, что в проде ZIP/PDF действительно содержат фамилию `Ivanenko` и другие ключевые поля, **есть** (Playwright + `booklet-review-artifacts`).  
Но этот сценарий **по определению не может** служить строгим доказательством «`family_name` именно из booklet», потому что арбитр честно отдаёт приоритет MRZ/DL над booklet для STRONG_IDENTITY.

Статус: **PASS (flow)**, **DEGRADED** как proof именно booklet‑origin для `family_name`.

---

#### 2. `booklet-only-pdf-proof` (strict booklet-only)

- **Файл:** `apps/web/tests/e2e/booklet-only-pdf-proof.spec.ts` (новый, untracked).
- **Слоты в сценарии:** только `booklet` (паспорт/DL/I‑94/EAD не загружаются).
- **Критерий строгости в тесте:**
  - дождаться OCR (`POST /api/tps/ocr/extract` для `docHint='booklet'`);
  - убедиться, что в review DOM есть `Ivanenko` / `Trostianets` / `Vinnytsia Oblast` / `Tarasovych`;
  - заполнить только gate‑поля, не связанные с booklet proof (паспортный номер допустим как manual gating‑only);
  - при `generate-packet` считать:
    - `_provenance.family_name.source_document_type === 'booklet'` — строгое условие;
    - для `city_of_birth / province_of_birth / middle_name / dob` — если поле вообще есть, оно должно иметь `source_document_type='booklet'`.

**Текущий факт:**  
Тест существует как спека/скрипт, но **строгий прогон до ZIP/PDF ещё не зафиксирован как PASS** в `STATUS.md`. Blocker сейчас: **DOB всё ещё не доходит через текущий production endpoint**, а `passport_number` остаётся обязательным для generate gate в booklet‑only режиме.

Статус: **DEGRADED** (proof‑сценарий существует, но strict PASS не достигнут).

---

### DOB truth

#### Историческое evidence (production SHA периода finish-all)

- **Файл:** `docs/reports/evidence/finish-all-20260525-183306/audit-db/phaseC_fresh_ocr_response.json`
- Ключевые фрагменты:
  - `doc_type_hint: "booklet"`
  - `raw_text` содержит `01 січня 1990 року`
  - `final_field_keys`: `["city_of_birth","family_name","middle_name","province_of_birth"]`
  - `rejected_fields` включает:
    - `{"field": "dob", "reason": "FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT"}`
  - `brain.validated_skipped` содержит:
    - `{"field": "dob", "reason": "date not parseable"}`

**Вывод (исторический):**
- DOB попадал в raw OCR/Brain, но:
  - не парсился валидатором (Ukrainian текстовая дата не поддерживалась),
  - и одновременно был **запрещён контрактом для booklet** — поле выкидывалось перед merge.

Отсюда две независимые причины отсутствия DOB: **validation reject + contract strip**.

#### Текущее dirty‑состояние кода

- `apps/web/src/lib/tps/ai/documentBrain.ts`:
  - `parseDate()` теперь явно поддерживает украинский формат:
    - принимает `01 січня 1990 року` и `01 січня 1990`,
    - нормализует в `06/25/1986` (USCIS MM/DD/YYYY).
  - `validateBrainField('dob', ...)`:
    - использует `parseDate` и нормализует DOB в canonical формат.

- `apps/web/src/lib/tps/ocr/documentContracts.ts`:
  - `DOCUMENT_CONTRACTS.booklet.allowed_fields` теперь включает `'dob'`.
  - В `forbidden_fields` booklet `dob` больше **не значится**.

**Вывод (dirty‑код):**
- В локальном рабочем дереве DOB **больше не должен** резаться контрактом для `slot='booklet'`.
- Парсер DOB теперь способен разобрать исторский кейс `01 січня 1990 року`.

#### Что остаётся UNVERIFIED

- Нет отдельного свежего evidence, что:
  - обновлённый `documentBrain.ts` + обновлённый `documentContracts.ts` действительно **задеплоены** в production,
  - production endpoint `/api/tps/ocr/extract` сейчас реально возвращает DOB в `final_field_keys` для booklet.
- Поэтому:
  - Историческое утверждение “DOB ломается на validation + contract” остаётся **HISTORICAL ONLY**.  
  - Новое утверждение “DOB проходит” в данный момент **верно только как код‑уровневая логика**, но не как runtime‑правда.

Статус DOB:
- **HISTORICAL:** DOB отсутствует из-за `date not parseable` + `FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT`.  
- **CODE (dirty):** DOB для booklet разрешён контрактом и парсится украинским парсером.  
- **RUNTIME (current prod):** **UNVERIFIED** в этой сессии.

---

### Provenance truth

#### Почему multi-doc тест не доказывает booklet-origin `family_name`

- `fieldArbiter.ts`:
  - `family_name` относится к классу `STRONG_IDENTITY`.
  - Приоритеты (`IDENTITY_PRIORITY`):
    - `passport_ocr_mrz`: 1
    - `i94_ocr_keyword`: 2
    - `ead_ocr_keyword`: 3
    - `dl_ocr_keyword`: 4
    - `booklet_dual_ocr_crossref`: 5
    - AI / manual — ещё ниже (кроме `user_corrected`).

- В `booklet-review.spec.ts` загружаются **все** документы: паспорт, booklet, I‑94, EAD, DL.
- Поэтому:
  - для `family_name` winner по замыслу — MRZ (или DL, если MRZ нет),
  - booklet (`dual_ocr_crossref`) **осознанно стоит ниже** DL.

**Следствие:**  
Если в `generate-network.json` в multi-doc сценарии `family_name` имеет `source_document_type='driver_license'` или `passport`, это полностью согласуется с архитектурой и **не опровергает** того, что booklet‑трасса существует и работает для WEAK_REVIEW полей.

#### Почему strict proof возможен только в booklet-only сценарии

- В `booklet-only-pdf-proof.spec.ts`:
  - загружается только `booklet`,
  - нет паспорта, DL, I‑94, EAD → нет более приоритетных источников для `family_name`,
  - при этом в тесте проверяется `_provenance.family_name.source_document_type === 'booklet'`.

- `provenance.ts`:
  - `SourceDocumentType` включает `'booklet'`;
  - `toSourceDocType('booklet')` возвращает `'booklet'`;
  - `buildProvenanceFromWizard()` для OCR‑полей использует:
    - `doc_slot` (из UI) → `toSourceDocType` → `source_document_type`.

**Следствие:**  
Только в strict booklet-only сценарии мы можем честно заявить:  
«если generate payload показывает `_provenance.family_name.source_document_type='booklet'`, то фамилия прошла путь **именно из booklet**, а не была переопределена MRZ/DL».

Текущий статус provenenace:
- `booklet-review`: **PASS (flow)**, **DEGRADED** как доказательство booklet‑origin для `family_name`.  
- `booklet-only`: **DEGRADED** — сценарий и проверки есть, но полный PASS (ZIP+PDF+provenance) ещё не зафиксирован.

---

### PDF readback truth

Высокоуровневое разделение (без повторения всего evidence):

- **`booklet-review` (multi-doc)**:
  - ZIP/PDF: **ПОЛУЧЕНЫ**, readback показывает `Ivanenko` в обоих формах.
  - `city_of_birth / province_of_birth / middle_name` могут отсутствовать в конкретном прогона → статус **DEGRADED** как proof “все слабые поля стабильно автозаполняются”.

- **`booklet-only` (strict)**:
  - Цель: ZIP/PDF с booklet‑proven `family_name` (и по возможности `city/province/middle/dob`), без ручных правок proof‑полей.
  - На момент этого отчёта: **нет свежего зафиксированного PASS до ZIP/PDF** в strict режиме → статус **DEGRADED**.

---

### Spec vs reality

- `docs/adr/ADR-CENTRAL-BRAIN.md` — **PROPOSED**, а не описание уже реализованного механизма.  
  - Central Brain (orchestrator + hallucination guard + dictionary bridge) **пока не существует в коде**; текущая логика живёт в:
    - `postExtractNormalize.ts`
    - `documentContracts.ts`
    - `fieldArbiter.ts`
    - `documentBrain.ts`
    - `TPSWizardV2.tsx` merge

- `docs/adr/ADR-002-ukraine-dictionary-v1.2.md` — **Accepted**:
  - Истинный source of truth для украинской терминологии и KMU‑55 — `packages/knowledge/*`.
  - Важно: любые будущие Central Brain / TPS‑правила должны опираться именно на knowledge‑пакет.

- `PROJECT_HISTORY.md`:
  - строка про 94.4% auto‑fill — **историческая метрика** (на момент определённого SHA/набора тестов),
  - её нельзя трактовать как “всегда сейчас 94.4% auto‑fill” без свежего e2e‑доказательства.

Статус spec vs reality: **DEGRADED**, т.к. спецификация Central Brain ещё не реализована, а старые успехи (94.4%) не подтверждены новым, независимым strict evidence.

---

### What to commit first (рекомендация порядка, не действие)

### Decision-ready commit plan (A/B/C/D)

Ниже — **план действий после этого ledger**, но это **не выполнение** и не коммит сейчас.

#### Commit A — DOB parser + booklet contract (минимальный DOB-проход)

- **Files**
  - `apps/web/src/lib/tps/ai/documentBrain.ts`
  - `apps/web/src/lib/tps/ai/__tests__/documentBrain.test.ts`
  - `apps/web/src/lib/tps/ocr/documentContracts.ts`
  - `apps/web/src/lib/tps/ocr/__tests__/documentContracts.test.ts`
- **Why**
  - Устранить исторический root cause: `01 січня 1990 року` → парсабельный DOB и DOB не выкидывается контрактом booklet.
- **Tests (локально)**
  - `pnpm --filter web test -- src/lib/tps/ai/__tests__/documentBrain.test.ts src/lib/tps/ocr/__tests__/documentContracts.test.ts`
- **Acceptance criteria**
  - Тест `accepts DOB \"01 січня 1990 року\"` проходит.
  - Контракт `applyContract('booklet', ['dob'], ...)` принимает DOB (unit test).
  - Нет расширения allowed/forbidden вне `dob` (никакой “релаксации всего”).
- **DO NOT include**
  - `provenance.ts` и его тесты.
  - Любые e2e изменения.
  - Любые evidence артефакты из `docs/reports/evidence/**`.
  - Рефакторинг Central Brain.

#### Commit B — provenance booklet mapping (исправление источника)

- **Files**
  - `apps/web/src/lib/tps/provenance.ts`
  - `apps/web/src/lib/tps/__tests__/provenance.test.ts`
- **Why**
  - Исправить adapter truth: `doc_slot='booklet'` не должен деградировать в `user_manual`.
- **Tests (локально)**
  - `pnpm --filter web test -- src/lib/tps/__tests__/provenance.test.ts`
- **Acceptance criteria**
  - Unit test подтверждает `doc_slot='booklet' → source_document_type='booklet'`.
  - Manual correction остаётся manual (`user_manual` / `corrected`) и не путается с booklet.
- **DO NOT include**
  - Изменения DOB/контракта (Commit A отдельно).
  - Любые e2e.
  - Любые evidence артефакты.

#### Commit C — strict booklet-only e2e (proof scaffold / либо PASS, либо честный DEGRADED)

- **Files**
  - `apps/web/tests/e2e/booklet-only-pdf-proof.spec.ts`
- **Why**
  - Единственный валидный способ доказать booklet-origin `family_name` без влияния MRZ/DL.
- **Tests (локально, headed)**
  - `cd apps/web && npx playwright test tests/e2e/booklet-only-pdf-proof.spec.ts --headed`
- **Acceptance criteria**
  - Proof‑поля **не редактируются вручную**: `family_name`, `dob`, `city_of_birth`, `province_of_birth`, `middle_name`.
  - Разрешено вручную только **MANUAL_GATING_ONLY** поле(я), например `passport_number`, если gate требует.
  - Если генерация происходит: `_provenance.family_name.source_document_type == 'booklet'` в **том же прогоне** + ZIP/PDF readback.
  - Если генерация НЕ происходит из-за gate/окружения: тест/документация маркируют это как **DEGRADED/BLOCKED**, без фейка.
- **DO NOT include**
  - Изменения в `fieldArbiter.ts` (арбитраж менять нельзя ради прохождения proof).
  - Любые “ослабления” валидации.
  - Любые правки прод-логики, не относящиеся к proof.

#### Commit D — docs truth updates (session docs)

- **Files**
  - `STATUS.md`
  - `HANDOFF.md`
  - `CHANGELOG.md`
- **Why**
  - Закрепить проверяемую правду после A/B/C и не потерять контекст (repo guard требует эти файлы).
- **Tests**
  - Только стандартные проверки репо/CI (локально по желанию): `pnpm --filter web typecheck`, `pnpm --filter web test` (если требуется для уверенности перед push).
- **Acceptance criteria**
  - В docs нет “PASS” без evidence.
  - Чётко отмечено VERIFIED/UNVERIFIED/HISTORICAL ONLY/BLOCKED.
  - Следующий шаг сформулирован однозначно (1 действие).
- **DO NOT include**
  - Кодовые изменения (они должны быть в A/B/C).

---

### Risks

- **Смешение evidence и сценариев**  
  - Риск: использовать multi-doc evidence как proof для booklet‑only (или наоборот).  
  - Митигейшн: всегда указывать, к какому сценарию (и SHA) относится артефакт.

- **Headless sandbox failures воспринимаются как product bug**  
  - Пример: `MachPortRendezvous ... Permission denied` / `EMFILE` на этой машине.  
  - Правильный статус: **BLOCKED environment**, а не “сломанный продукт”.

- **Контракт/валидация/артефакты из разных периодов**  
  - Исторический контракт для booklet запрещал DOB; текущий dirty‑код разрешает.  
  - Митигейшн: при каждом анализе явно указывать “HISTORICAL vs CODE vs RUNTIME_NOW”.

- **Central Brain считается уже реализованным**  
  - На самом деле Central Brain пока только в ADR; реальная логика разбросана по нескольким модулям.  

---

### Summary status

- **status:** DEGRADED  
- **repo_state:** HEAD==origin/main, но working tree dirty (TPS‑патчи + evidence).  
- **dob_truth:** HISTORICAL evidence показывает двойной отказ (validation + contract); dirty‑код это исправляет, но runtime‑доказательства обновлённого поведения ещё нет.  
- **provenance_truth:** multi-doc сценарий справедливо отдаёт STRONG_IDENTITY полям паспорт/DL; strict booklet‑origin возможен только в booklet-only сценарии, который сейчас не доведён до полного PASS.  
- **pdf_readback_truth:** ZIP/PDF производятся и содержат ключевые поля, но strict booklet-only proof пока не закрыт.  
- **spec_vs_reality:** Central Brain — предложенная архитектура; knowledge‑пакет уже принят как канон, но не полностью интегрирован в TPS Central Brain.

