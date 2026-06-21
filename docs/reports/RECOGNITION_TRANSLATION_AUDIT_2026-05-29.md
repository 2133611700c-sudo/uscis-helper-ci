All key facts confirmed against live code. Now I have everything to write the report.

# ОТЧЁТ ГЛАВНОГО ИНЖЕНЕРА — Распознавание + Перевод (кириллица → английский документ USCIS)

Дата: 2026-05-29. Фокус: ПЕРЕВОД (единственный продукт, реально вызывающий central brain). Все факты сверены с живым кодом, не с комментариями.

ГЛАВНЫЙ ВЫВОД ОДНОЙ СТРОКОЙ: ядро распознавания (presence.ts) честное — не выдумывает, флагует рукопись на review. Опасность вся НИЖЕ распознавания: слой доставки в PDF «отмывает» непрочитанные, неверные и неподтверждённые значения в чистый, подписываемый, подаваемый документ БЕЗ предупреждения клиенту.

---

## 1. ИНВЕНТАРИЗАЦИЯ

| Модуль | Что делает | Кому служит | Чем гарантирует | Статус |
|---|---|---|---|---|
| `models.ts` :: geminiReader | Читает кириллицу полей с фото | presence.ts (живой) | Не выдумывает (illegible → can_read=false) | LIVE |
| `models.ts` :: googleVisionFullText | Полнотекстовый OCR страницы | presence.ts (подтверждение) | Хорошо печатное, ГУБИТ рукопись | LIVE (только confirm) |
| `models.ts` :: vertexGeminiReader, openaiReader | Доп. ридеры-голоса | никем | — | **DEAD (определены, не вызываются)** |
| `consensus.ts` :: reconcileField | Сверка ≥2 голосов, hallucination guard | только orchestrator (мёртвый) | ≥2 согласны→accept; спор→can_read=false | **DEAD в проде** |
| `orchestrator.ts` :: extractDocument | Полный путь reader→consensus→result | никем | — | **DEAD** |
| `orchestrator.ts` :: normalize | Кириллица → латиница/EN по kind | presence.ts (LIVE) | KMU-55, газеттир, патроним, даты | LIVE (импортируется) |
| `presence.ts` :: extractDocumentPresence | ЖИВОЙ конвейер: Gemini + GV presence-gate | central-brain/analyze | Печатное: GV-confirm; рукопись: keep+review | **LIVE (единственный)** |
| `docTypes.ts` | Реестр 6 типов док., поля, kind/class | все ридеры | Укр-авторитетная структура (КМУ) | LIVE |
| `htr.ts` (Transkribus) | HTR-ридер рукописи | никем (токен/план блок) | mapLinesToFields детерминирован | **DEAD (auth сломан, 0 бенчей)** |
| `terminologist.ts` :: formatDateEn, translateAuthority | Даты + органы по глоссарию | normalize (LIVE) | Локи (Міліція→Militsiya) | LIVE |
| `translator.ts` :: deepseekProseTranslator | Перевод свободного текста | normalize (опц.) | Не трогает locked-токены | **DEAD на проде (не прокинут)** |
| `assembler.ts` :: assembleDocument | Честная сборка: `____`, [CONFIRM], ready_to_certify | только тесты | Пустое поле → видимая строка-заглушка | **DEAD (нет prod-вызова)** |
| `lib/packet/pdf.ts` :: generateTranslationPDF | Реальная генерация PDF | generate-pdf route (LIVE) | — (см. дыры) | LIVE |
| `eadCategory.ts` | I-765 категория по правилам | central-brain (ead) | Не угадывает; null если basis неизвестен | **DEAD (нет route для ead)** |
| `central-brain/index.ts` :: analyze | Единая точка входа всех продуктов | vision-extract (translation) | Маршрутизация migrated/legacy | LIVE (1 вызывающий) |
| `lib/docintel/*` (legacy) | Один Gemini-ридер, без guard | vision-extract при флаге OFF | review для рукописи по confidence | LIVE-fallback (опасный) |
| `lib/tps/centralBrain.ts` + documentBrain (DeepSeek) | Отдельный мозг TPS | TPS-роуты | Свой guard, своя сверка | LIVE, параллельный (намеренно) |
| `knowledge/transliterate.ts` (KMU-55) | Транслитерация по Пост.55 | normalize | Позиционная, детерминированная | LIVE |
| `knowledge/patronymic.ts` | Валидация/генерация отчества | normalize | ~13 исключений; иначе unresolved | LIVE (узкий) |
| `knowledge/gazetteer.ts` | Снап города по confusable-distance | normalize | СИД ~60 городов | LIVE (СИД, не KOATUU) |

DEAD/ДУБЛИРОВАННОЕ (сводно): consensus.ts + orchestrator.extractDocument (весь consensus-путь), vertexGeminiReader, openaiReader, htr.ts (оба пути), assembler.ts, eadCategory (нет route), legacy docintel, tps/centralBrain дублирует guard+normalize. normalize() фактически дублируется: presence.ts вызывает её, но сборку EngineField делает сам инлайн.

---

## 2. КАРТА ДЫР («недостающие приборы»)

### 🔴 CRITICAL

1. **PDF молча ВЫБРАСЫВАЕТ непрочитанные поля.** `pdf.ts:152` → `if (!field.normalized_value) continue`. Честный `assembler.ts` (с `____ [enter from document]`) — мёртвый код.
   → Ведёт к: клиент подписывает свидетельство БЕЗ даты/места рождения, не зная этого. RFE/отказ.
   → Закрыть: рендерить пустые как видимую строку `________ [впишите из документа]`; провести генерацию через assembler-семантику; блокировать «готово» пока есть пустые.

2. **Wizard ХАРДКОДИТ `review_required: true` на ВСЕ поля PDF.** `TranslateWizard.tsx:1087`. Реальный per-field флаг движка выброшен. В PDF — метка `! review` 8pt на полях.
   → Ведёт к: alert-fatigue. Угаданная рукопись неотличима от подтверждённого печатного. Подписывают фабрикацию.
   → Закрыть: пробросить реальный per-field флаг; неподтверждённые рендерить заметно (фон/инлайн «UNVERIFIED»); блокировать генерацию пока review-поля не подтверждены пользователем.

3. **Имена в загранпаспорте РЕ-ТРАНСЛИТЕРИРУЮТСЯ через KMU-55, а не берутся из печатной латиницы/MRZ.** `orchestrator.ts:54` всегда `transliterateKMU55`. Прямое нарушение HARD RULE «Controlling Latin (MRZ/I-94/EAD) beats re-transliteration». Слова `controlling` в engine/ нет.
   → Ведёт к: перевод не совпадает с EAD/I-94 клиента → name-mismatch flag, RFE.
   → Закрыть: для печатных имён читать MRZ/латиницу, она побеждает; KMU-55 только как cross-check; расхождение → review.

4. **«PDF отправлен на email» — ложь.** Wizard нигде не собирает email, `profile.email = ''` (`TranslateWizard.tsx:1098`), `generate-pdf` шлёт на пустой адрес.
   → Ведёт к: оплатил $14.99, закрыл вкладку, не получил ничего, нет записи.
   → Закрыть: добавить поле email до оплаты/скачивания; до этого — убрать обещание из текста.

5. **Manual-review документы (рождение/брак/развод/«другое») берут оплату, но НЕ создают тикет.** Wizard только показывает баннер и идёт к оплате; рабочий `/api/translation/manual-review` никогда не вызывается.
   → Ведёт к: оплатил за услугу, которая не поставлена в очередь — неотличимо от мошенничества.
   → Закрыть: POST в manual-review с изображениями+email при manual-пути; показать номер тикета.

6. **НЕТ пиксельного препроцессинга на живом пути.** Сырое фото байт-в-байт идёт в Gemini+GV. `sharp@0.34.5` в package.json, но НИ РАЗУ не импортирован в src (подтверждено grep).
   → Ведёт к: skew/тень/низкий контраст старых фото 1980-х → мусор на входе → хуже читает И Gemini, И GV (последнее усиливает отбраковку presence-gate).
   → Закрыть: одна функция на `sharp` (auto-orient/grayscale/normalize/unsharp/resize ~2000px) перед `Promise.all` в presence.ts. **#1 рычаг точности, низкий риск.**

### 🟠 HIGH

7. **NUMBER-поля (серия/№ паспорта/№ акт. записи) — чистый passthrough.** `orchestrator.ts:79-81` возвращает `cf.value` дословно. Нет маски, длины, чек-цифры, нормализации гомоглифов (О/0, І/1, З/3).
   → Ведёт к: одна ошибка символа в самом filing-critical поле → уверенно неверное значение подписывают.
   → Закрыть: regex/длина в DocFieldSpec; гомоглиф-нормализация в числовых прогонах; mismatch→latin=''+review.

8. **Даты: НЕТ календарной валидации.** `formatDateEn` проверяет только месяц 1–12. `'32.02.1986'` → `'32 February 1986'` с review=false (подтверждено).
   → Ведёт к: OCR-путаница цифр рукописи даёт несуществующую дату как финальную. Неверная DOB.
   → Закрыть: валидация дня по месяцу/году (вкл. високос); future-date guard (DOB/issue ≤ сегодня); fail→null→review.

9. **Sex — бинарный ternary, по умолчанию MALE.** `presence.ts:41` `/ж|f/i.test(...) ? 'F' : 'M'`. Нет ветки unknown. Этот sex кормит генератор отчества.
   → Ведёт к: непрочитанный пол → «Male» на документе женщины + мужское отчество (-ович вместо -івна). Двойная ошибка.
   → Закрыть: tri-state (M/F/unknown); unknown→can_read=false+review; не генерировать отчество без явного пола.

10. **Prose-translator (D3b) НЕ прокинут в прод-роут.** `central-brain/index.ts:46` передаёт `deps.proseTranslator`, но vision-extract его не задаёт → undefined. Свободный текст (орган, место регистрации) → latin='' → выброшен из PDF (дыра #1).
    → Ведёт к: название ЗАГС/органа исчезает из перевода без следа.
    → Закрыть: инстанцировать deepseekProseTranslator в роуте; fallback — KMU-55 транслит + review; никогда пустое из читаемой кириллицы.

11. **Документ-дата/эра НИКОГДА не читается.** Локи (Militsiya), valid_from/valid_until органов, исторические названия городов (Кировоград→Кропивницкий 2016) не срабатывают по контексту. Движок снапит всё в текущее DMS-имя.
    → Ведёт к: 1986 и 2023 нормализуются одинаково; нарушение правила «не модернизировать исторические названия».
    → Закрыть: document_date как контекст в translateAuthority/oblast/city; гейт по valid_from/until; неоднозначно→документ-верная форма+review.

12. **Тихий fallback на legacy при ошибке brain.** `vision-extract/route.ts` catch → legacy single-Gemini БЕЗ guard и presence. Клиент не знает, какой путь его обслужил.
    → Ведёт к: транзиентная ошибка GV/quota молча роняет клиента на путь без анти-фабрикации.
    → Закрыть: не падать молча на худший путь для PII; retry или явная ошибка; при fallback — review_required на всех полях + индикатор.

13. **Город снапится по СИД-газеттиру ~60 записей, без контекста области.** `gazetteer.ts` СИД; `snapCity` ищет глобально. Полный KOATUU (~28-30k) не загружен.
    → Ведёт к: реальное село снапится на фонетически близкий облцентр чужой области; уверенно неверное место рождения.
    → Закрыть: загрузить KOATUU; передавать распознанную область в snapCity; non-exact→raw виден + явный «не подтверждён».

14. **Layout/сегментация отсутствуют; spatial-выход GV выброшен.** Используется только `fullTextAnnotation.text`; boundingPoly/word-confidence отброшены. `isPresent` — подстрока по 10-символьному префиксу (подтверждено).
    → Ведёт к: false-positive подтверждения («Центр» матчит «Централізовано»), нет кропа-источника для ревьюера (consensus.ts обещает кроп — его нет).
    → Закрыть: потреблять word-boxes GV (бесплатно в том же вызове); presence в окрестности label; кроп поля для human-review.

15. **Печатное vs рукопись НЕ маршрутизируется к разным ридерам.** Флаг handwritten только переключает discard. GV (лучший на печатном) низведён до boolean, никогда не источник значения. MRZ паспорта игнорируется на engine-пути.
    → Ведёт к: платим LLM за то, что детерминированный OCR делает лучше; на рукописи «консенсус» = фактически один Gemini.
    → Закрыть: печатное→значение от GV (Gemini cross-check); рукопись→Gemini источник; добавить MRZ-парсер с чек-цифрами.

16. **Скачивание не привязано к подписи.** Кнопка Download выше блока подписи и не гейтится. Можно скачать неподписанный certified-перевод.
    → Ведёт к: подача неподписанного перевода → RFE (8 CFR 103.2(b)(3)).
    → Закрыть: подпись первым шагом, гейт Download до сохранения подписи; принудительный re-download подписанной версии.

17. **review_required-флаги движка отбрасываются на экране Review.** `TranslateWizard.tsx` строит строки без review/confidence; все строки выглядят одинаково; null→голый `—` без пояснения.
    → Ведёт к: помеченное самим движком как неуверенное уходит в USCIS без правки.
    → Закрыть: amber-граница + «проверьте по документу»; null→«НЕ ПРОЧИТАНО — впишите».

18. **Редактирование через `window.prompt`, без показа кириллицы-источника.** Может молча no-op во встроенных браузерах (Instagram/FB webview).
    → Ведёт к: правит английский без референса; поле нередактируемо без ошибки.
    → Закрыть: on-page input с кириллицей-источником над английским.

### 🟡 MEDIUM

19. **uk и es локали молча рендерят ВЕСЬ wizard на русском.** Есть только T.ru (база) + T_OVERRIDES.en. Флагман для украинцев — а оплата/легал на русском.
    → Закрыть: реальный uk-override (мин. экраны 2,5,6,7); если нет — fallback на EN, не RU.

20. **Multi-page merge: first-non-empty-wins, без детекции конфликта.** Если стр.1 ошиблась, а стр.2 верна — берётся ошибка стр.1.
    → Закрыть: разные непустые значения одного поля → конфликт-флаг + оба кандидата; согласие страниц как позитивный сигнал.

21. **isPresent по 10-символьному префиксу.** Печатные значения с общим префиксом проходят guard; короткие (<3) дают false-positive в плотном OCR.
    → Закрыть: для печатных — полное containment; для идентификаторов — точное нормализованное совпадение.

22. **Нет gate качества фото до трат на vision.** Размытое/тёмное фото уходит в 2 платных API, ошибка только на review-экране, вагой текст, без «переснять».
    → Закрыть: лёгкий sharp-чек (разрешение/яркость/Laplacian-резкость) до LLM; «переснимите» + Retake.

23. **Отчество от REGULAR-правил генерируется из, возможно, искажённого given-name.** Не валидируется надёжность исходного имени.
    → Закрыть: гейтить генерацию по can_read/confidence given-name; явно «реконструировано, не прочитано».

24. **Нет model-reliability weighting и аудит-следа.** `presence.ts` всегда `candidates:[]`. gemini-3.1-pro (20/22) и GV равны по весу.
    → Закрыть: вес по надёжности; сохранять candidates[] в review-UI.

25. **Подпись юридически двусмысленна:** «draw translator signature (your signature as the applicant)». Drawn-on-screen может отвергаться частью офицеров.
    → Закрыть: явно «вы сертифицируете владение языками (8 CFR 103.2(b)(3)), подпишите как переводчик»; примечание про wet-sign по запросу.

26. **Нет обработки `?cancelled=1` и только `alert()` на ошибках оплаты/сети; нет контакта поддержки внутри wizard.**
    → Закрыть: дружелюбное состояние отмены, inline-retry, видимый контакт на экранах оплаты/успеха.

---

## 3. СТРУКТУРА-«МИНИСТЕРСТВО» (отделы мозга распознавания+перевода)

| Отдел | Ответственность | Входы → Выходы | СТРАХОВОЧНАЯ функция (что ловит его сбой) | Статус сейчас |
|---|---|---|---|---|
| **Препроцессинг** | auto-orient, grayscale, normalize, denoise, resize, gate качества | фото → чистые пиксели + quality-score | Quality-gate: ниже порога → «переснять», не тратим vision | **ОТСУТСТВУЕТ** (sharp не импортирован) |
| **Layout / печать-vs-рукопись** | сегментация, word-boxes, классификация поля printed/handwritten, MRZ-зона | пиксели → зоны + кропы + класс | Если зона не найдена — поле не уходит как «прочитано»; кроп для человека | **ОТСУТСТВУЕТ** (GV spatial выброшен) |
| **Чтение** | значение поля кириллицей; gemini-3.1-pro (рукопись), GV (печать), MRZ-парсер (печать) | зона/кроп → cyrillic + confidence | Несколько независимых ридеров; нечитаемо→can_read=false | Частично (1 Gemini + GV-confirm) |
| **Подтверждение / антифабрикация** | сверка ≥2 голосов; presence в окрестности label; чек-цифры MRZ/номеров | reads → принято/спор→review | Hallucination guard: спор→can_read=false; систем-ошибка (Тимофевич) → review | **Деградировано**: consensus DEAD, presence=1 ридер+10-симв префикс |
| **Нормализация** | KMU-55, газеттир(KOATUU), патроним, даты(+календарь), пол(tri-state), эра/локи, controlling-Latin | cyrillic+контекст → latin/EN | Нет правила→latin=''+review; календарь/маска/чек-цифра ловят искажение | Частично: имена/даты/патроним есть; номера/эра/controlling — нет |
| **Глоссарий / перевод** | органы (locked, исторические локи) + D3b prose для свободного текста | cyrillic-текст → EN | Нет матча→prose; locked-токены не меняются; иначе транслит+review | **Сломано**: prose не прокинут → пусто |
| **Сборка англ. документа** | рендер всех spec-полей; пустые → `____`; review → видимо; ready_to_certify | EngineResult → PDF/текст | Гейт: пока есть пустые/непроверенные — не certifiable; ничего не прячем | **DEAD** (assembler не вызывается; pdf.ts роняет пустые) |
| **Human-review** | показать кириллицу+EN+кандидаты+кроп; правка on-page; визуальный сигнал review | поля → подтверждённые пользователем | Реальный per-field флаг; edit с источником; подпись-гейт | **Сломано**: флаги хардкод true, prompt без источника |
| **Аудит / мониторинг** | trace: кто что прочитал, какой путь (brain/legacy), email-доставка, тикеты | все решения → ledger | Degraded-path индикатор; alert на сбой email/ticket; A/B консенсуса | Минимален; candidates[] пуст, fallback тихий |

---

## 4. ВЕРДИКТ ПО ГИБРИДНОМУ СТЕКУ (обоснован сверенными фактами)

| Слой | Вердикт | Причина (на наших фактах) |
|---|---|---|
| **OpenCV (препроцессинг)** | **ADOPT интент, REJECT библиотеку** | Препроцессинга НЕТ вообще — #1 рычаг. Но OpenCV = тяжёлый native binary, враждебен Vercel serverless. `sharp@0.34.5` УЖЕ установлен и не используется. Делать на sharp. |
| **Tesseract (печать)** | **REJECT** | `tesseract.js` в deps, не импортирован. Уже платим за Google Vision, который бьёт Tesseract на кириллице-печати. Третий OCR без замеренного выигрыша. Вместо этого — повысить GV из boolean-confirmer в источник значения на печатных/MRZ-полях. |
| **Kraken (layout)** | **REJECT сервис, ADOPT интент** | Kraken = Python/PyTorch, чужой стек. Но GV `DOCUMENT_TEXT_DETECTION` уже возвращает blocks+word-boxes+confidence в том же платном вызове — мы это выбрасываем. Потреблять бесплатно. |
| **Gemini (рукопись)** | **ADOPT (уже сделано, верно)** | gemini-3.1-pro — ЕДИНСТВЕННЫЙ читающий рукопись (8/9 на 1986). 2.5-pro ФАБРИКУЕТ (1/9), GPT-5.5/4o падают (1/9). Оставить, добавить вес по надёжности, кормить препроцессенными пикселями. |
| **DeepSeek как LM-постпроцессор значений** | **REJECT категорически** | DeepSeek text-only (отвергает изображения). LM, «исправляющий» прочитанные имена/числа = ровно та co-hallucination (класс Тимофевич), которую гасит весь дизайн. Не сокращает, а ДОБАВЛЯет LLM-вызов. Держать DeepSeek ТОЛЬКО для prose-перевода свободного текста — и наконец прокинуть в роут. |
| **Transkribus/HTR** | **PARKED** | Auth сломан (federated Google OAuth, нет password-grant; 401/500), 0 бенчей. Не строить на нём, пока владелец не заведёт readcoop-пароль + кредиты metagrapho и не прогонит transkribus-bench.mjs. |

ИТОГ: главные заявленные выгоды (дешевле + точнее) достижимы БЕЗ Tesseract/Kraken/OpenCV/DeepSeek-корректора — через sharp-препроцессинг + quality-gate + потребление spatial-выхода GV + MRZ-парсер + маршрутизацию печать/рукопись к лучшему ридеру.

---

## 5. ПЛАН ПО КИРПИЧИКАМ (benchmark-first, начиная с перевода+кириллицы)

Правило: каждый кирпич сперва получает бенч/тест, который ДО внедрения красный, ПОСЛЕ зелёный. Эталон — фото 1986 birth cert (рукопись) + один печатный загранпаспорт. Флаг `CENTRAL_BRAIN_TRANSLATION=on`.

| # | Кирпич | Что делаем | Зачем | Как проверим | Закрывает 🔴 |
|---|---|---|---|---|---|
| **B1** | **Честный PDF** | pdf.ts: пустое → `________ [впишите из документа]`; пробросить РЕАЛЬНЫЙ per-field review (убрать хардкод :1087); неподтверждённые рендерить заметно; гейт «не certifiable пока пустые/review» | Клиент перестаёт подписывать молча-неполный/неверный документ | Тест: EngineResult с 1 can_read=false → строка-заглушка в PDF; review-поле → видимый маркер; снимок PDF | #1, #2 |
| **B2** | **Email + manual-ticket + подпись-гейт** | Поле email до оплаты; POST в /manual-review для рукоп. путей; Download гейтится подписью | Устранить пост-оплатные провалы доверия | E2E: manual-док → тикет создан + email непустой; нельзя скачать без подписи | #4, #5, #16 |
| **B3** | **Препроцессинг на sharp + quality-gate** | Функция sharp (auto-orient/grayscale/normalize/unsharp/resize) перед Promise.all в presence.ts; pre-check яркость/резкость/разрешение → «переснять» до LLM | #1 рычаг точности; экономия vision-бюджета | Бенч 1986 cert: поля до/после препроцессинга; gate ловит затемнённое тест-фото | #6, #22 |
| **B4** | **Controlling-Latin / MRZ** | Для печатных имён читать MRZ/латиницу; она побеждает KMU-55; расхождение→review; добавить mrz-поле в docTypes загранпаспорта | Соответствие EAD/I-94, исполнение HARD RULE | Тест: паспорт с MRZ «IEVTUSHENKO» → в PDF MRZ, не «Yevtushenko»; чек-цифры валидны | #3 |
| **B5** | **Прокинуть prose-translator + органы fallback** | Инстанцировать deepseekProseTranslator в vision-extract → deps; нет матча и нет prose → KMU-55 транслит + review | Перестать терять название ЗАГС/органа | Тест: свободный текст без глоссария → непустой EN или транслит+review, не '' | #10 |
| **B6** | **NUMBER + дата + sex приборы** | Маска/длина/гомоглиф для номеров; календарь+future-guard для дат; tri-state sex; не генерировать отчество без пола | Защита самых scrutinized USCIS-полей | Unit: `32.02.1986`→review; серия не по маске→review; sex unknown→review, отчество unresolved | #7, #8, #9 |
| **B7** | **Потребление spatial GV + localized presence + кропы** | Захватить word-boxes/confidence; presence в окрестности label (не 10-симв префикс); кроп поля в review-UI | Убить false-positive подтверждения; дать ревьюеру пиксель-доказательство | Тест: «Центр» больше не матчит «Централізовано»; кроп присутствует | #14, #21 |
| **B8** | **Маршрутизация печать/рукопись + 2-й ридер на рукописи + вес** | Печать→значение GV (Gemini cross-check); рукопись→Gemini источник + vertexGeminiReader 2-м голосом в reconcileField; вес по надёжности; сохранять candidates[] | Вернуть анти-фабрикацию рукописи (consensus сейчас мёртв) | Бенч: на рукописи спор 2 ридеров → guard срабатывает; candidates видны в UI | #15, #24 |
| **B9** | **Контекст эры + историч. локи** | document_date как контекст в translateAuthority/oblast/city; гейт valid_from/until; неоднозначно→документ-верно+review | Не модернизировать исторические названия; Militsiya-лок | Тест: 1986-док с «Кировоград» → историч. форма, не «Kropyvnytskyi» | #11 |
| **B10** | **Убрать тихий legacy-fallback + degraded-индикатор + uk-локаль** | На ошибке brain: retry или явная ошибка, не молчаливый legacy; при fallback review на всех + индикатор; реальный uk-override (или EN fallback) | Прозрачность пути + язык флагмана | Тест: имитация ошибки brain → нет тихой деградации; uk-локаль не рендерит RU | #12, #19 |
| **B11** | **Полный KOATUU + oblast-scoped снап** | Загрузить KOATUU (~28-30k); передавать область в snapCity; non-exact→raw виден+review | Перестать снапить сёла на чужие облцентры | Бенч: сельское место рождения снапится в своей области или остаётся raw+review | #13 |
| **B12** | **Аудит + on-page edit + multi-page conflict** | Trace кто/что прочитал; on-page input с кириллицей-источником вместо window.prompt; конфликт страниц→оба кандидата+review | Аудируемость, доступность, корроборация страниц | Тест: правка работает в webview; конфликт страниц флагуется | #17, #18, #20 |

Порядок намеренный: B1–B2 останавливают активное причинение вреда клиенту (выброшенные/неверные/неподписанные документы, потерянная оплата) — это исполнимо малыми правками и уже подтверждено в коде. B3–B5 — самые дешёвые точностные/полнотные выигрыши без новых сервисов. B6–B12 закрывают остальные приборы.

НЕИЗВЕСТНЫЕ (честно): (1) реальная точность MRZ-парсинга из GV-текста на наших паспортах не замерена — нужен бенч в B4. (2) Прод сейчас может сидеть на исчерпанном free-Gemini ключе (STATUS Session 56) — если так, gemini-3.1-pro не активен и вся точность рукописи мнимая; это надо подтвердить ДО любых бенчей. (3) Соответствие drawn-on-screen подписи требованиям конкретных офицеров USCIS не верифицировано. (4) HTR/Transkribus — полностью неизвестная величина (0 бенчей, auth сломан).

Релевантные файлы: `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/packet/pdf.ts` (:152 drop), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/components/services/translation/TranslateWizard.tsx` (:1087 хардкод, :1098 email=''), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/engine/orchestrator.ts` (:54 транслит, :79-81 number passthrough), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/engine/presence.ts` (:19-23 10-симв префикс, :41 sex, :35-38 нет препроцессинга), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/engine/terminologist.ts` (formatDateEn без календаря), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/engine/assembler.ts` (мёртвый честный сборщик), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/central-brain/index.ts` (:46 proseTranslator не задан роутом), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/app/api/translation/vision-extract/route.ts` (тихий legacy-fallback), `/Users/sergiiivanenko/work/uscis-helper/packages/knowledge/src/gazetteer.ts` (СИД ~60), `/Users/sergiiivanenko/work/uscis-helper/apps/web/src/lib/engine/htr.ts` (DEAD).