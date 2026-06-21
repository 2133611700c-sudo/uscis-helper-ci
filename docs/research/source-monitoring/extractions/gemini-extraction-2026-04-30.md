# Gemini Extraction — NotebookLM Cross-Source Synthesis
**Date:** 2026-04-30
**Notebook:** USCIS Helper — Source Intelligence (ID: 555f6e28-1a29-4ea0-9b25-2d1925537145)
**Sources at time of extraction:** 114 sources
**Method:** NotebookLM chat queries, 2 primary prompts, 4 notes saved to notebook

---

## Extraction 1 — USCIS Form Procedures (Cross-Source Synthesis)

### I-131 Re-Parole — Online Filing Procedure

1. Create/login to USCIS online account → select "File a form online" → find I-131
2. Select type "I am outside the United States..." (technical requirement) OR "Reparole process for certain Ukrainian citizens"
3. Decline Expedited Request unless you have critical documented reasons
4. If filing for child under 14 — check "Preparer" field, enter parent contact data
5. Fill personal data (name, all prior surnames, physical and mailing address, phone)
6. Enter A-Number, Social Security Number, I-94 number
7. Indicate immigration status on entry (Class of Admission) — typically UHP, DT, or DA
8. In 500-character Explanation field: briefly describe humanitarian reason (war in Ukraine) and add "See enclosed statement" — attach detailed evidence letter
9. Upload documents: foreign passport (first page + stamp page; if expired — add + first page of new one), I-94 form, EAD card (both sides if available), driver's license or State ID (both sides)
10. For children additionally: birth certificate with certified English translation; parent's passport page + I-94 to show family relationship
11. Sign form by hand (wet signature), enter date
12. **KEY: "I am outside the United States"** — select this even if applicant is physically inside the USA (system technical requirement for re-parole)
13. Expedited processing: "No" if no documented critical reasons
14. Form type: select Re-parole process for Ukrainian citizens
15. Class of admission: UHP, DT, or DA

**Costs:**
- $580 without EAD, or $1,325 with EAD (joint I-765)
- From October 16: new rule — additional $1,000 fee for humanitarian parole paid after conditional approval
- This is a separate fee paid after decision, not upfront

**Cover letter content:**
- Explain humanitarian reason — war in Ukraine, impossibility of return
- Reference all attached documents
- Keep to 500 characters in form field, but attach full letter as separate document

---

### I-765 EAD — Online Filing Procedure

1. In USCIS account select I-765 "Application for Employment Authorization"
2. Select Eligibility Category: **(c)(11)** for humanitarian parole / Re-parole OR **(a)(12)** for approved TPS
3. Select reason: "Initial permission" (first time) OR "Renewal" (extension)
4. Fill personal data: gender, country of birth, I-94 number, date and airport of last arrival, passport number, A-Number
5. Indicate SSN or request new SSN issuance if you don't have one yet
6. Upload files: 2x2 photo, I-94 form, passport scan or previous EAD (both sides), also I-131 Approval or Receipt Notice TPS
7. Check form, add electronic signature, pay fee (by card), click "Submit"

---

### Evidence Upload for RFE Response (Unsolicited Evidence)

1. Login to USCIS account, open relevant case (I-821 or I-131)
2. Go to "My Documents" tab, click "Upload evidence"
3. Prepare files (up to 5 at a time, up to 12 MB each, no special characters in filenames, mandatory with translation to English)
4. Select appropriate category for each document (e.g., Medical, Support Letter, etc.)
5. Verify upload, confirm submission

---

### I-821 + I-765 for children under 14

- **Preparer field:** "Does someone help fill the form?" — answer "Yes", enter parent data
- Status field: indicate "Child"
- Documents: foreign passport + birth certificate with English translation, proof of residence (school records/medical cards), also parent's passport page + I-94
- Signature: parent signs twice — once in Part 12 (as Preparer) and once in Part 10 (as applicant for child)

---

### Critical Errors to Avoid

1. **Filing without evidence:** In 2026, empty application without cover letter and personal safety proof → guaranteed RFE or denial
2. **Wrong file naming:** Files must use only English letters, no spaces, hyphens, periods, special characters (underscores allowed). Size max 12 MB — otherwise system error
3. **Ignoring red window errors:** If system shows red window (errors) before payment — fix them. Window must be green before payment
4. **Double payment on "glitch":** Known bug — money charged from card but USCIS portal shows "not paid". Don't pay again to avoid losing money
5. **Digital signatures on paper forms:** All forms sent by mail (including I-912 Fee Waiver) must have WET (handwritten with pen) signature, handwritten date. Text-typed name will lead to return of entire package

---

## Extraction 2 — TOP Pain Points (By Frequency Across All 114 Sources)

### VERY HIGH FREQUENCY

**1. Deadline/Expiration Panic**
- Description: Mass existential fear of TPS status expiration in October 2026 + dangerous misunderstanding that EAD auto-extension ends July 22, 2026
- Typical user phrases: "Пароль закінчується за декілька днів, і тиша", "Пароль закінчується 3 травня, реціт тільки прийшов", "Подовся у лютому 2025, і тиша", "Рік тому подала, і тишина..."
- Most dangerous misconception: TPS auto-extension of EADs ends on a specific date — people don't know they can lose work authorization even with valid parole
- Product solution: Deadline calculator, status checker, personalized notifications

**2. Confusion About Procedures (Wrong Form / Wrong Step)**
- Description: People don't know which form to file, in what sequence, and what evidence is needed
- Typical phrases: "I filed I-821 but they want something else", "do I need to file I-765 separately or together?"
- Most dangerous: Filing I-131 without supporting letter → guaranteed RFE or denial in 2026
- Product solution: Step-by-step guided wizard by status type

**3. Biometrics Chaos**
- Description: Biometric invitations come chaotically (adults receive, children don't; old addresses); fear of missing appointment
- Typical phrases: "Пришла повістка на біометрію, але не знаю куда йти", "Нам прийшло, а дітям ні"
- Fear: Getting "investigation" for missing appointment, losing case
- Most dangerous: People think not showing up = automatic case closure (not true)
- Product solution: Biometrics guide, appointment reminder, action checklist

**4. EAD Delays Up to 19 Months + E-Verify Paradox**
- Description: EAD approval wait stretches to 19+ months. People lose jobs as employers can't verify via E-Verify. Even worse — re-parole approved but EAD denied
- Frequency: Very high / Critical severity
- Critical consequences: People remain legally in country but lose right to work legally
- Product solution: EAD status tracker, Expedite Request guide

**5. RFE Epidemic**
- Description: In 2026, the "empty" application that worked before now leads to mass RFEs ("insufficient documentation")
- People panic because they don't know what personal safety letters and evidence to provide
- Frequency: Very high / Critical severity
- Product solution: Evidence kit builder, RFE response guide

### HIGH FREQUENCY

**6. Financial Barrier ("Fee Pain")**
- $1,020 per parole ($4,080 for family of 4 just as advance)
- People say "we have no money to file" — yet majority don't know about I-912 fee waiver
- Product solution: I-912 eligibility checker, fee waiver filing guide

**7. Sponsor Blackmail + Notario Fraud**
- I-134A program suspended → new sponsors hard to find
- Documented cases: sponsors threatening refugees with "deportation" if they leave
- Notario/fake lawyers charging $1,000+ for already-approved forms
- People afraid to report to police (don't know about California Safe Harbor provisions)
- Product solution: Sponsor rights explainer, scam warning system, legal resources directory

**8. Fear of Biometrics and Travel**
- Fear of going to ASC (biometric center), fear of travel with Advance Parole
- Confusion: "can I travel if I have Advance Parole?"
- Product solution: Travel rights guide, Advance Parole explainer

**9. Re-Parole Approved but EAD Denied (Split Approval)**
- Mass trend: USCIS approves parole extension but rejects associated I-765 work permit
- People left legally in country but cannot work legally
- Frequency: Hundreds of comments / Critical severity
- Product solution: EAD denial appeal guide, Expedite Request workflow

---

## Form Frequency Ranking (By Source Mentions)

| Tier | Forms | Context |
|---|---|---|
| MOST FREQUENT | I-131, I-765, I-94 | Core problems, deadlines, denials in 2026 |
| FREQUENT | I-821, I-912 | TPS mass re-registration + fee waiver |
| MEDIUM | I-134A | Discussed as closed path due to indefinite suspension |
| RARE / HIGH RISK | I-589, I-485, AR-11, G-1145 | Require attorney; mentioned only as technical supplements |

---

## Product Validation

NotebookLM identified **Messenginfo (USCIS Helper)** directly from the Messenginfo_Project_Plan_RU_EN.pdf source as the product addressing all documented pain points. The platform is described in sources as:

- Web site + Telegram bot (document navigation + collection)
- Telegram channel + Facebook page
- Automated scanner agent for monitoring public groups
- Operates as self-service tool under California Safe Harbor framework
- Provides technical assistance without individual legal advice

> Per source analysis: "Под каждую конкретную боль или страх иммигрантов проектом предусмотрен отдельный продукт или инструмент"

---

## NotebookLM Notes Created

| Note title | Content |
|---|---|
| Інструкція із заповнення форм USCIS дл... | Full I-131, I-765, I-821 procedural steps + errors |
| Інструкція з оформлення статусів ТPS та... | TPS status + channel comparison analysis |
| Криза затримок та процесуальної... | EAD delays, biometrics chaos, processing delays |
| Критичні помилки та правові ризики дл... | Critical errors + legal risks |
| Криза іміграційного статусу: Аналіз... | Form frequency ranking + pain point taxonomy |

---

---

## Extraction 3 — Misinformation Audit (7 Dangerous Myths)

**Query:** TOP 10 dangerous misconceptions among Ukrainians with parole/TPS/U4U status
**Result:** 7 items returned (sources-backed)
**Note saved:** "Критичні помилки та правові ризики дл..." (10 хв тому)

---

### Myth #1: Квитанция (Receipt) или I-94 дают право на работу
- **Миф / Советы от ИИ:** В чатах и от ChatGPT часто звучит мысль, что после одобрения гуманитарного пароля (Re-parole) можно легально работать, имея на руках только форму I-94 или квитанцию о подаче
- **Как на самом деле:** Гуманитарный пароль дает **только право на легальное присутствие** в стране. Для легальной работы **обязательно** нужна одобренная пластиковая карта EAD (форма I-765). Работа без действующего EAD является незаконной, система E-Verify вас не пропустит → немедленное увольнение
- **Задокументированные случаи:** Водители Uber в Чикаго, работавшие без EAD, задерживались ICE во время рейдов и помещались в detention в ожидании суда
- **Опасность:** Уголовные и иммиграционные последствия

---

### Myth #2: Автопродление EAD по TPS работает до октября 2026
- **Миф:** Раз статус TPS для украинцев продлен до 19 октября 2026 года, значит, и старые разрешения на работу автоматически действуют до октября
- **Как на самом деле:** Автоматическое продление разрешений на работу по TPS **жестко заканчивается 22 июля 2026 года**. Работодатели по закону обязаны расторгнуть контракт после 22 июля, если работник не предоставит новую карту EAD
- **Масштаб:** Job loss risk at scale — тысячи семей могут потерять доход в один день
- **Опасность:** КРИТИЧЕСКАЯ — массовая внезапная потеря работы

---

### Myth #3: На Re-parole можно подать только форму I-131 без доказательств
- **Миф:** Можно подать на Re-parole только саму анкету I-131 без доказательств, как это работало в 2025 году
- **Как на самом деле:** В 2026 году правила ужесточились. Подача только формы → гарантированный RFE или отказ. **Обязательно требуются:**
  - Документация о войне
  - Личное заявление о безопасности (500 символов в форме + отдельное письмо)
  - Медицинские справки
  - Письма от работодателя
  - Доказательства ухода за родственниками
  - Просто сослаться на войну недостаточно

---

### Myth #4: Если портал USCIS показывает "Unpaid" — нужно заплатить ещё раз
- **Миф:** Если деньги списались с банковского счета, но портал USCIS показывает статус "Unpaid" (не оплачено), нужно заплатить еще раз, иначе кейс отклонят
- **Как на самом деле:** Это известный системный баг самого портала USCIS. Повторная оплата НЕ решит проблему, а приведет к путанице в бухгалтерии, потере еще одной тысячи долларов и риску создания дубликата дела
- **Действие:** Нужно связаться с USCIS, имея на руках банковскую выписку (bank statement)

---

### Myth #5: Все украинцы могут получить политическое убежище из-за войны
- **Миф:** Все украинцы могут легко получить политическое убежище (asylum) из-за войны
- **Как на самом деле:** Факт войны или проживания на оккупированной территории **не является основанием** для получения политического убежища в США. Убежище дается только за индивидуальное преследование по одному из пяти защищенных признаков (раса, религия, национальность, политические взгляды, принадлежность к соцгруппе)
- **Последствие:** Подача пустой или необоснованной формы I-589 → отказ + передача дела в иммиграционный суд (Notice to Appear) → риск депортации

---

### Myth #6: Документы можно переводить через Google Translate или ChatGPT
- **Миф:** Можно перевести документы через Google Translate или ChatGPT и отправить в USCIS
- **Как на самом деле:** Федеральное правило 8 CFR 103.2(b)(3) строго запрещает это. Искусственный интеллект не может принять на себя юридическую ответственность. Перевод должен быть проверен живым компетентным человеком (переводчиком или билингвальным лицом), который обязан поставить свою подпись и сертификационное заявление под страхом наказания за лжесвидетельство

---

### Myth #7: Программу U4U/спонсорство I-134A ещё можно использовать
- **Миф:** Всё ещё можно найти спонсора и приехать в США по программе Uniting for Ukraine
- **Как на самом деле:** Приём новых заявок от спонсоров по форме I-134A **приостановлен на неопределенный срок** с 27 января 2025 года указом новой администрации. Никакие новые разрешения на поездки (Travel Authorizations) по этой программе не выдаются. Надежды на продолжение спонсорства являются ложными

---

## Extraction 4 — Extended Pain Points Taxonomy (Items 10–14)

**Note:** Items 1–9 were captured in Extraction 2. These are the additional detailed pain points from the same response, providing granular "pain point profile" format.

---

### Pain Point #10: Fee Barrier — тотальное незнание о Fee Waiver
- **Продукт:** I-912 Fee Waiver Guide (бесплатная пошаговая инструкция)
- **Самое опасное заблуждение:** Затягивать с подачей документов до момента выпадения из статуса из-за отсутствия денег, не пытаясь запросить отмену пошлин
- **Типичная формулировка пользователя:** "Ще даже не подавали на продленне. Денег нет." / "Я заплуталась... яку точну суму я маю ще оплатити?"
- **Почему стресс:** Непреодолимый финансовый барьер блокирует семьям путь к легализации

---

### Pain Point #11: Блокировка и дублирование аккаунтов USCIS
- **Название проблемы:** Система USCIS создает дубликаты аккаунтов (например, после смены фамилии), навсегда закрывая доступ к кейсам
- **Продукт:** USCIS Account Recovery Guide + Tier 2 Escalation Template
- **Самое опасное заблуждение:** Пытаться зарегистрировать новый аккаунт на тот же email → системные конфликты и полная потеря связи с делом
- **Типичная формулировка:** "USCIS система створила новий онлайн аккаунт і прив'язала кейс до нового аккаунту і не дає переприв'язати кейс"
- **Почему стресс:** Люди лишаются возможности отслеживать критические документы, не получают RFE и пропускают сроки

---

### Pain Point #12: Риски и страхи путешествий по Advance Parole
*(title captured; detailed content in NotebookLM note "Криза іміграційного статусу: Аналіз...")*

---

### Pain Point #13: Нотарио и лжеюристы — эксплуатация мигрантов
- **Название проблемы:** Эксплуатация мигрантов нелицензированными "помогалами" и халатность адвокатов, подающих пустые анкеты
- **Продукт:** Re-parole Submission Quality Checker / Accredited Rep Directory
- **Самое опасное заблуждение:** Слепая вера в то, что "адвокат знает, что делает", без личной проверки отправляемых документов, или оплата услуг "нотарио" за простые формы
- **Типичная формулировка:** "Вони 'здирають' 1000, коли документи вже апруваніт" / "Виявилось що навіть обгрунтування не було долучено"
- **Почему стресс:** Потеря огромных денег (часто $1000+) и потеря 6+ месяцев времени впустую → гарантированный RFE или отказ

---

### Pain Point #14: Паника из-за "тишины" и приглашений на биометрию
- **Название проблемы:** Полная непрозрачность сроков (от нескольких недель до года) и хаотичная рассылка приглашений на биометрию
- **Продукт:** Biometrics FAQ Card / Crowdsourced Processing Time Tracker
- **Самое опасное заблуждение:** Уверенность в том, что вызов на отпечатки пальцев означает скорый отказ или расследование, либо что "тишина" означает скрытый отказ
- **Типичная формулировка:** "Рік тому подала, і тишина..." / "Якого числа прийняли у вас кейс? І коли були біометрія?"
- **Почему стресс:** Психологическое истощение, доводящее людей до отказа от планов и покупки билетов обратно в Европу

---

### Pain Point #15: Требования к переводам (правило 8 CFR 103.2(b)(3))
- **Название проблемы:** Незнание жестких правил сертификации переводов и ошибки транслитерации
- **Продукт:** Document Translation Tool (гибридный инструмент с ИИ-черновиком и сертификацией человека)
- **Самое опасное заблуждение:** Использование чистого машинного перевода или услуг агентств на родине (СНГ), которые ставят непонятные печати и не владеют "американизмами" (что нарушает федеральные правила)
- **Типичная формулировка:** "Потрібен сертифікований переклад документів з української на англійську для USCIS" / "Потрібно зробити переклад документу з апостилем"
- **Почему стресс:** Задержки в рассмотрении дела или RFE из-за непринятия документов на финальных стадиях процесса

---

## Extraction 5 — Product Mapping (Messenginfo Digital Tools)

**Query (follow-up):** "Как продукт может исправить эту ошибку?"
**Note saved:** "Цифрові інструменти захисту..." (just saved)

Platform: **Messenginfo (USCIS Helper)** — platform designed to neutralize critical mistakes through specialized automated self-service tools. For each dangerous misconception — a dedicated product solution.

| # | Problem | Product Tool |
|---|---|---|
| 1 | EAD deadline confusion (July 22) | TPS July 22 EAD Deadline Alert + Employer Letter (Employer E-Verify gap letter) |
| 2 | Illegal work by I-94/receipt (bad AI advice) | "Can I Work Right Now?" eligibility checker — designed to replace false legal advice from ChatGPT/forums |
| 3 | Empty re-parole applications → RFE | Evidence Kit Builder + 500-character explanation generator; RFE Response Organizer |
| 4 | USCIS double payment bug | USCIS Payment Bug Resolution Guide + USCIS Payment Problem Letter template (flowchart + script for USCIS support call) |

**Additional noted tool:** Re-Parole EAD Denial Response Kit — diagnostic tool and 30-day action checklist for cases where re-parole approved but EAD denied

---

## NotebookLM Notes Created

| Note title | Content | Saved |
|---|---|---|
| Інструкція із заповнення форм USCIS дл... | Full I-131, I-765, I-821 procedural steps + errors | 14+ хв тому |
| Інструкція з оформлення статусів ТPS та... | TPS status + channel comparison analysis | 14+ хв тому |
| Криза затримок та процесуальної... | EAD delays, biometrics chaos, processing delays | 11 хв тому |
| Критичні помилки та правові ризики дл... | Critical errors + legal risks (misinformation audit items 1-7) | 10 хв тому |
| Криза іміграційного статусу: Аналіз... | Form frequency ranking + pain point taxonomy (items 1-14) | 9 хв тому |
| Цифрові інструменти захисту... | Product mapping — digital tools for each misconception | 10 хв тому |
| Біометрія в USCIS: Очікування,... | Biometrics timeline, fears, silence = normal, no link to decision | 10 хв тому |
| Інструкція з оформлення Re-Parole для... | I-131 9-step filing guide, required docs, common errors, RFE protocol | 10 хв тому |
| Дедлайн дозволів на роботу TPS: липен... | July 22 EAD deadline — what ends, E-Verify, employer obligations | 1 хв тому |

---

## Extraction Status

| Priority | Description | Status |
|---|---|---|
| P0 | Cross-source procedural extraction (all forms) | ✅ DONE |
| P0 | TOP pain points across 114 sources (14 items) | ✅ DONE |
| P0 | Misinformation audit (7 myths) | ✅ DONE |
| P0 | Product mapping (digital tools per misconception) | ✅ DONE |
| P1 | Specific biometrics video `ofC15aB6S-k` (162K views) | ✅ DONE |
| P1 | I-131 Re-Parole tutorial `DDu6H4kxd9I` (51K views) | ✅ DONE |
| P0-URGENT | TPS EAD July 22 2026 deadline — employer + worker guidance | ✅ DONE |

---

## Extraction 8 — TPS EAD July 22 2026 Deadline: Critical Legal Guidance
**Source:** NotebookLM synthesis on `I-765 истек: можно ли продолжать работать?` + TPS deadline sources
**Saved note:** "Дедлайн дозволів на роботу TPS: липен..." — 1 хв тому
**Date:** 2026-04-30
**Urgency:** CRITICAL — 83 days from today (2026-04-30)

---

### Q1: Что именно заканчивается 22 июля 2026?

22 июля 2026 года строго заканчивается **период автоматического продления (auto-extension) разрешений на работу (EAD)** для лиц, находящихся в статусе TPS.

**Критическое массовое заблуждение:** Многие иммигранты ошибочно полагают, что раз программа TPS для Украины продлена до 19 октября 2026 года — их разрешения на работу автоматически действуют до октября. **На самом деле: автопродление EAD заканчивается в июле, а не в октябре.**

---

### Q2: Что происходит с EAD после 22 июля если не получить новую карту?

- Текущий документ **теряет юридическую силу**
- Право на трудоустройство **аннулируется**
- В системе **E-Verify** статус перестанет отображаться как авторизованный
- **Риск потери работы уже 23 июля** — работодатель обязан уволить сотрудника без действующего EAD

---

### Q3: Можно ли работать если EAD истек или I-765 подана но не одобрена?

**Правило:** Если вы **вовремя** подали I-765 на продление EAD по статусу TPS — вы можете продолжать работать благодаря правилу автоматического продления, но **исключительно до 22 июля 2026 года**.

**После 22 июля 2026 — работать без физически одобренной новой карты EAD незаконно**, даже если:
- Подача I-765 подтверждена (Receipt Notice получен)
- I-765 всё ещё на рассмотрении
- Есть форма I-94 или гуманитарный пароль

⚠️ **Квитанция (Receipt Notice), I-94 и пароль дают право на легальное присутствие в стране — но НЕ дают права на работу.**

Работа без действующего разрешения влечет серьезные **криминальные и иммиграционные последствия**.

---

### Q4: Что нужно сделать работодателю если EAD работника становится недействительным?

- По закону: работодатель **обязан расторгнуть трудовой договор** с сотрудником
- **E-Verify не подтвердит** легальный статус работника → работодатель вынужден уволить, чтобы не нарушать закон
- **Рекомендация специалистов:** Заранее предоставить работодателю специальное разъяснительное письмо (**Employer E-Verify explanation letter**), подтверждающее право работника работать до 22 июля — это предотвратит преждевременное увольнение из-за неосведомленности HR-отдела

---

### Product Opportunity: July 22 EAD Deadline

| # | Pain | Product entry point |
|---|---|---|
| 1 | TPS October vs July confusion | "До какой даты у меня право работать?" — персональный дедлайн-калькулятор |
| 2 | I-765 pending, can I work? | Auto-extension eligibility checker + end-date calculator |
| 3 | Employer HR doesn't know about auto-extension | Employer E-Verify Explanation Letter Generator |
| 4 | "Что будет если I-765 не одобрят до 22 июля?" | EAD Status Alert — push notification 30/14/7 days before |
| 5 | Receipt Notice confusion ("это право на работу?") | Receipt Notice explainer: presence vs. work authorization |

---

## Extraction 7 — I-131 Re-Parole Filing Guide (Step-by-Step)
**Source:** NotebookLM cross-synthesis across 114 sources, anchored on `DDu6H4kxd9I` (51K, UA-channel Re-Parole step-by-step 2025) + multiple I-131 tutorials from @infoua_usa + Messenginfo_Project_Plan_RU_EN.pdf
**Saved note:** "Інструкція з оформлення Re-Parole для..." — 1 хв тому
**Date:** 2026-04-30

---

### Шаги подачи I-131 онлайн (2025-2026)

**Всего 9 шагов:**

1. **Вход в систему и выбор формы** — Войдите в онлайн-аккаунт USCIS, выберите «File a form online», найдите форму I-131 (Application for Travel Document)

2. **Критический технический нюанс** — В самом первом вопросе **обязательно выберите «I am outside the United States»**, даже если вы физически находитесь в Америке. Это техническое требование USCIS для данной формы (частая ошибка — выбирают "inside")

3. **Отказ от ускорения** — На вопрос об Expedite Request отвечайте «Нет», если нет задокументированных экстренных причин (иначе придется доказывать срочность)

4. **Выбор программы** — Выберите процесс **«Re-parole process for certain Ukrainian citizens and their immediate family members»**

5. **Личные данные и статус** — Заполните анкету (имя, все предыдущие фамилии, физический и почтовый адрес). Введите A-Number, номер Social Security и номер из актуальной формы I-94

6. **Класс допуска (Class of Admission)** — Укажите статус при въезде:
   - **UHP** — для U4U (Uniting for Ukraine)
   - **DT** — въезд через Мексику
   - **DA** — no Advance Parole
   Также укажите дату окончания текущего парола из формы I-94 (Admit Until Date)

7. **Обоснование (500 символов)** — В текстовом поле напишите кратко (война и угроза жизни) и добавьте фразу **«See enclosed statement»** — чтобы прикрепить развернутое письмо-доказательство. Запрашиваемый срок пребывания: **24 месяца**

8. **Запрос EAD (одновременно с I-131)**
   - Пароль + EAD: **$1,325**
   - Только пароль: **$580**
   - ⚠️ После условного одобрения парола придет отдельный счет на обязательную пошлину **$1,020**

9. **Загрузка, подпись и оплата** — Загрузите сканы, убедитесь что горят зеленые галочки, впишите имя как электронную подпись, оплатите банковской картой

---

### Обязательные документы и доказательства (2026)

**В 2026 году подача «пустой» формы больше не работает.** Обязательный пакет:

**Базовые документы:**
- Цифровое фото 2×2 дюйма
- Форма I-94 (актуальная)
- Скан загранпаспорта (первая страница + страница со штампом парола)
- Старый EAD или водительское удостоверение

**Сопроводительное письмо (Personal Statement):**
- Личное заявление — почему вы не можете вернуться в Украину и почему вам нужен пароль

**Доказательства гуманитарных причин:**
- Документация о разрушенном жилье, нахождении региона под обстрелами/оккупацией (статьи из англоязычных СМИ, приказы об эвакуации)
- Медицинские причины: выписки из больницы, письма от лечащего врача о необходимости непрерывного лечения в США

**Доказательства общественной пользы (Significant Public Benefit):**
- Справки с работы, письма работодателя
- Налоговые декларации (1040/W-2)
- Подтверждение обучения в критически важных сферах (медицина, образование)
- Письма от волонтерских организаций

---

### Частые ошибки при заполнении и подаче

1. **Подача без доказательств** — Самая критическая ошибка 2026 года. Следование устаревшим советам «подавать только форму I-131» гарантированно приводит к RFE или отказу

2. **Неправильный формат файлов** — Файлы > 12 МБ; кириллица, точки, тире и пробелы в именах файлов (например "паспорт.pdf"). Правило: только английские буквы и нижнее подчеркивание

3. **Двойная оплата при баге системы** — Списание пошлины при статусе "Unpaid" на портале — это системный баг USCIS. Повторная оплата = потеря денег + дублирование дел

4. **Машинный перевод документов** — Google Translate или ИИ (ChatGPT) **строго запрещены** по правилу 8 CFR 103.2(b)(3). Любой перевод должен быть сертифицирован компетентным человеком с указанием контактных данных

---

### Что делать при RFE

1. **Читать запрос конкретно** — USCIS требует конкретики: почему именно *вам* опасно возвращаться или какая польза от *вас* в США. Стандартные отписки "в Украине война" не принимаются

2. **Один PDF-файл** — Все доказательства (письмо, справки, налоги, переводы) собрать в **один общий PDF** и загрузить как единый ответ. Множество мелких файлов = ошибка

3. **Соблюдать дедлайн** — Срок ответа: от 2 недель до 2 месяцев. Пропуск дедлайна = автоматический отказ в репароле

4. **Превентивное добавление (Unsolicited Evidence)** — Если забыли прикрепить доказательства при подаче: вкладка «My Documents» → «Upload evidence» → добавить документы **до** получения RFE от офицера

---

## Extraction 6 — Biometrics Timeline & Fear Patterns
**Source:** NotebookLM cross-synthesis across 114 sources, anchored on `ofC15aB6S-k` (162K RU, "Через сколько времени после биометрии будет принято решение") + `8vhkG9vt1xM` (57K, USCIS Receipt & Biometrics Delays) + `1uoAbLF3nw4` (biometrics surge, UA)
**Saved note:** "Біометрія в USCIS: Очікування,..." — 1 хв тому
**Date:** 2026-04-30

---

### Q1: Конкретные сроки ожидания после биометрии

**Ответ:** Точных и гарантированных сроков ожидания после сдачи биометрии не существует — процесс идет по собственному графику.

Зафиксированные паттерны из сообществ:
- Люди подавали документы в **сентябре**, сдавали биометрию в **январе**, затем продолжали ждать решения вплоть до **истечения сроков парола**
- В самых экстремальных случаях ожидание выдачи карты EAD (разрешения на работу) после биометрии растягивается на **19 и более месяцев**
- Нет стандартного "срока ожидания" — у разных заявителей он кардинально различается даже при одинаковых формах

---

### Q2: Что происходит с кейсом после биометрии

- Дело **продолжает находиться в очереди** на обработку — биометрия не переводит кейс в приоритетную категорию
- На биометрическом appointment сотрудники ASC делают **новые фотографии заявителя** (формат 5×5 см), так как USCIS перестала принимать селфи-фотографии этого формата для ряда форм
- USCIS может вызвать на биометрию **повторно** — даже если вы уже сдавали отпечатки
- Иногда иммиграционная служба назначает **финальное интервью ещё до того**, как заявитель успел сдать отпечатки пальцев (нетипичная ситуация, но зафиксирована)
- Известны случаи, когда USCIS одобряла формы и **выдавала EAD вообще без вызова на биометрию** — а также случаи, когда дети получали одобрение без сдачи отпечатков

---

### Q3: Самые частые вопросы и страхи после биометрии

**Массовая паника от приглашений:** Рассылка биометрических уведомлений вызывает в иммигрантском сообществе огромную панику — зафиксированы посты с **более чем 4 600 комментариями**.

**5 главных страхов:**

1. **Страх депортации и отказа** — люди боятся, что вызов на отпечатки означает начало расследования против них, скорый отказ по кейсу, или даже арест с последующей депортацией
2. **Путаница с детьми** — огромный стресс вызывает рассинхронизация внутри одной семьи: взрослым прислали приглашение, а детям нет (или наоборот); либо на одну заявку может прийти 2–3 приглашения на разные даты
3. **Сравнение сроков** — самый частый вопрос в группах: «Какого числа приняли ваш кейс и когда была биометрия?» — люди пытаются найти логику и вычислить свои сроки по чужим данным
4. **Боязнь идти на сдачу** — некоторые сомневаются, стоит ли вообще идти на прием; юристы строго предупреждают: **игнорировать приглашение нельзя** — если пропустить запись и не перенести её, в кейсе могут отказать
5. **"Что-то пошло не так"** — долгое молчание после биометрии интерпретируется как сигнал проблемы с кейсом

---

### Q4: Что означает долгое молчание после биометрии — нормально?

**Да — долгое молчание абсолютно нормально** и не должно вызывать панику.

- Задержки вызваны **нехваткой персонала**, огромным наплывом заявок и последствиями коронавирусных ограничений в процессинговых центрах
- Задержки — это **проблема системы**, а не проблемы с вашим конкретным кейсом
- Иммиграционные адвокаты подчеркивают: **долгое ожидание после отпечатков не означает**, что вы сделали что-то неправильно или что вам откажут

---

### Q5: Как биометрия связана с финальным решением (TPS, Re-Parole, EAD)

**Ключевой вывод:** Сдача биометрии **никак не ускоряет** вынесение решения по делу.

- Между датой сдачи отпечатков и датой финального одобрения (или интервью) **нет никакой прямой временной связи**
- Необходимость сдачи биометрии **определяется индивидуально** для каждого кейса
- USCIS одобряла формы и выдавала **EAD вообще без вызова на биометрию**
- Дети получали одобрение **без сдачи отпечатков**
- Биометрия — это одна из административных процедур проверки, но она **не является финальным этапом** и не запускает обратный отсчет до решения

---

### Product Opportunity: Biometrics Panic

| # | Pain | Product entry point |
|---|---|---|
| 1 | "Когда придет решение после биометрии?" | Biometrics Processing Timeline Tracker (crowdsourced) |
| 2 | Паника от приглашения — страх депортации | "Что значит уведомление о биометрии?" — explainer + FAQ |
| 3 | Путаница с детьми на разные даты | Family Biometrics Sync Checker |
| 4 | Боязнь пропустить appointment | Biometrics Appointment Reminder + Reschedule Guide |
| 5 | "Долгое молчание = проблема?" | "Норма ли это?" status reassurance tool |
