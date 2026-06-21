# Gemini Ensemble Bench — 3 models × 3 docs + 5 consensus configs

Models: gemini-2.5-flash-lite, gemini-2.5-flash, gemini-2.5-pro, gemini-3.5-flash, gemini-3.1-pro-preview · scored vs hand-verified ground truth (passport MRZ + cross-doc).


## PASSPORT (printed + MRZ)

| field | ground truth | 2.5-flash-lite | 2.5-flash | 2.5-pro | 3.5-flash | 3.1-pro-preview |
|---|---|---|---|---|---|---|
| surname | Іваненко | ✅ ІВАНЕНКО | ✅ ІВАНЕНКО | ✅ ІВАНЕНКО | ✅ ІВАНЕНКО | ✅ ІВАНЕНКО/IVANENKO |
| given_name | Тарас | ✅ ТАРАС | ✅ ТАРАС | ✅ ТАРАС | ✅ ТАРАС | ✅ ТАРАС/TARAS |
| date_of_birth | 1990-01-01 | ❌ 1986-02-22 | ✅ 1990-01-01 | ✅ 1990-01-01 | ✅ 1990-01-01 | ✅ 1990-01-01 |
| passport_no | AA000000 | ✅ AA000000 | ✅ AA000000 | ✅ AA000000 | ✅ AA000000 | ✅ AA000000 |
| birth_place | Вінницька | ✅ ВІННИЦЬКА ОБЛ./UKR | ✅ ВІННИЦЬКА ОБЛ./UKR | ✅ ВІННИЦЬКА ОБЛ. | ✅ ВІННИЦЬКА ОБЛ./UKR | ✅ ВІННИЦЬКА ОБЛ./UKR |

**Per-model score (correct/total): 2.5-flash-lite 4/5 · 2.5-flash 5/5 · 2.5-pro 5/5 · 3.5-flash 5/5 · 3.1-pro-preview 5/5**

**Ensembles (accept field when ≥2 voters agree):**
- E1 3.1pro+3.5flash (≥2): 5/5 correct, 5/5 auto-accepted
- E2 3.1pro+2.5pro (≥2): 5/5 correct, 5/5 auto-accepted
- E3 3.1pro+3.5flash+2.5flash (≥2): 5/5 correct, 5/5 auto-accepted
- E4 all-5 majority (≥3): 5/5 correct, 5/5 auto-accepted
- E5 3.1pro+3.5flash+GoogleVision (≥2): 5/5 correct, 5/5 auto-accepted

<details><summary>Google Vision OCR anchor</summary>

```
Паспорт громадянина України для виїзду за кордон
є власністю України
The passport of the citizen of Ukraine for travelling abroad
is the property of Ukraine
Іменем України Міністр
закордонних справ України
просить усіх, кого це може
стосуватися, усіма можливими
засобами полегшити поїздку
пред'явника паспорта, надава-
ти йому необхідну допомогу
та захист.
In the name of Ukraine, the
Minister of Foreign Affairs of
Ukraine requests all those whom
it may concern to facilitate in every
possible way the travel of the
bearer of this passport and to
provide the bearer with all neces-
sary assistance and protection.
EMNO 465518
4 УКРАЇНА
Тип/ Туре
UKRAINE
R
Код держави/ Country code Номер паспорта/ Passport No.
ПАСПОРТ
PASSPORT
Р
UKR
Прізвище/ Surname
AA000000
ІВАНЕНКО/IVANENKO
Ім'я/ Given Names
ТАРАС/TARAS
Громадянство/ Nationality
УКРАЇНА/UKRAINE
Дата народження/ Date of birth
25 ЧЕР/JUN 86
Стать/ Sex
ч/м
Запис №/ Record No.
19860625-03734
Місце народження/ Place of birth
ВІННИЦЬКА ОБЛ./UKR
Дата видачі/ Date of issue
22 ЛЮТ/FEB 19
Дата закінчення строку дії/ Date of expiry
22 ЛЮТ/FEB 29
Орган, що видав/ Authority
8034
Підпис пред'явника/ Holder's signature
P<UKRIVANENKO<<TARAS
```
</details>

## BIRTH CERT (handwritten, UkrSSR 1986)

| field | ground truth | 2.5-flash-lite | 2.5-flash | 2.5-pro | 3.5-flash | 3.1-pro-preview |
|---|---|---|---|---|---|---|
| surname | Іваненко | ❌ Ковальчук | ❌ Хроненчук | ❌ Кудрявцев | ✅ Іваненко | ✅ Іваненко |
| given_name | Сергей | ❌ Ірина | ❌ Олег | ❌ Олег | ✅ Сергей | ✅ Сергей |
| patronymic | Сергеевич | ❌ Петрівна | ❌ Васильович | ❌ Васильович | ✅ Сергеевич | ✅ Сергеевич |
| date_of_birth | 1990-01-01 | ❌ 1965-02-26 | ❌ 1976-02-26 | ❌ 1975-09-26 | ❌ 1986-06-29 | ❌ 1985-07-25 |
| birth_settlement | Тростянец | ❌ с. Копачівка | ❌ м. Переяслав-Хмельницький | ❌ м. Хмельницький | ✅ пгт. Тростянец | ✅ пгт. Тростянец |
| birth_oblast | Винницкая | ❌ Володимир-Волинського | ❌ Київська | ❌ Хмельницької | ✅ Винницкая | ✅ Винницкая |
| father_full_name | Іваненко Сергей Леонидович | ❌ Ковальчук Петро Іванович | ❌ Хроненчук Василь Іванович | ❌ Кудрявцев Василь Леонідович | ✅ Іваненко Сергей Леонидович | ✅ Іваненко Сергей Леонидович |
| mother_full_name | Іваненко Наталья Степановна | ❌ Ковальчук Марія Іванівна | ❌ Хроненчук Надія Степанівна | ❌ Кудрявцева Катерина Степанівна | ❌ Іваненко Наталия Степановна | ✅ Іваненко Наталья Степановна |
| certificate_number | III-АМ 428069 | ✅ III-АМ № 428069 | ❌ ІІІ-АМ № 428069 | ✅ III-АМ № 428069 | ❌ ІІІ-АМ № 428069 | ✅ III-АМ № 428069 |

**Per-model score (correct/total): 2.5-flash-lite 1/9 · 2.5-flash 0/9 · 2.5-pro 1/9 · 3.5-flash 6/9 · 3.1-pro-preview 8/9**

**Ensembles (accept field when ≥2 voters agree):**
- E1 3.1pro+3.5flash (≥2): 6/9 correct, 6/9 auto-accepted
- E2 3.1pro+2.5pro (≥2): 1/9 correct, 1/9 auto-accepted
- E3 3.1pro+3.5flash+2.5flash (≥2): 6/9 correct, 7/9 auto-accepted
- E4 all-5 majority (≥3): 1/9 correct, 1/9 auto-accepted
- E5 3.1pro+3.5flash+GoogleVision (≥2): 6/9 correct, 6/9 auto-accepted

<details><summary>Google Vision OCR anchor</summary>

```
СВИДЕТЕЛЬСТВО О РОЖДЕНИИ»
СВІДОЦТВО ПРО НАРОДЖЕННЯ
Гражданин (ка)
Помадянин (га)
M.
Коропятни
прізвище
arel beer
имя, отчество- ім'я, по батькові
180308038
родился (лась) 75licа 1996
народився (лася) число, месяц, год — число, місяць, рік
тысяча девян
(цифрами и прописью - цифрами і прописом)
заЛЬНО ПЛОЩ
восемью есет името
Место рождения: город, селение
Місце народження: місто, селище
20903
район
район
nem.
область, край
область, край
республика
республіка
08080230
ростянец
netreees, seces
Винницкая
YCOP
О чем в книге регистрации актов о рождении
про що в книзі реєстрації актів про народження
19
6года моя месяца
года
року
произведена запись
зроблено запис
за №
місяця
Мечисла
числа
2
MCHEN TM
Отец
Балько
РОДИТЕЛИ:
БАТЬКИ
29.09.20
Kyporism
фамилия прізвище
Геомидович
имя, отчество-м'я, по батькові
национальность Украинец
національність
Мать
Marn
Киропятник
Наталия Степановн
- национальность
національність
имя, отчество -м'я, по батькові
утрацина
Место регистрация Просинеции
Місце реєстрації наименование
наименование и местонахождения органа
hauoit geef!
ЗАГСа - найменування та місцезнаходження органу ЗАГСу
чинницкой обо
22. walk
Дата выдачи
Дата видачі
M. II.
Bix.
Попутатов
Виконавчи
```
</details>

## MILITARY ID (printed + handwritten)

| field | ground truth | 2.5-flash-lite | 2.5-flash | 2.5-pro | 3.5-flash | 3.1-pro-preview |
|---|---|---|---|---|---|---|
| surname | Іваненко | ✅ Іваненко | ✅ Іваненко | ✅ Іваненко | ✅ Іваненко | ✅ Іваненко |
| given_name | Тарас | ✅ Тарас | ✅ Тарас | ✅ Тарас | ✅ Тарас | ✅ Тарас |
| patronymic | Тарасович | ✅ Тарасович | ✅ Тарасович | ✅ Тарасович | ✅ Тарасович | ✅ Тарасович |
| date_of_birth | 1990-01-01 | ✅ 1990-01-01 | ✅ 1990-01-01 | ✅ 1990-01-01 | ✅ 1990-01-01 | ✅ 1990-01-01 |
| birth_settlement | Тростянець | ❌ м. Кіровоград | ❌ с.м.т. Простенець | ✅ с.м.т. Тростянець | ✅ смт. Тростянець | ✅ смт. Тростянець |
| birth_oblast | Вінницька | ❌ Кіровоградської області | ❌ Бобринецького р-ну Кіровоградської обл. | ❌ Вінницької обл. | ❌ Вінницької обл. | ❌ Вінницької обл. |
| series_number | СО 845621 | ✅ СО 845621 | ✅ СО 845621 | ✅ СО 845621 | ❌ CO 845621 | ✅ СО 845621 |
| issue_date | 2016-12-22 | ❌ 2014-12-22 | ❌ 2016-12-27 | ✅ 2016-12-22 | ❌ 2011-12-22 | ✅ 2016-12-22 |

**Per-model score (correct/total): 2.5-flash-lite 5/8 · 2.5-flash 5/8 · 2.5-pro 7/8 · 3.5-flash 5/8 · 3.1-pro-preview 7/8**

**Ensembles (accept field when ≥2 voters agree):**
- E1 3.1pro+3.5flash (≥2): 5/8 correct, 6/8 auto-accepted
- E2 3.1pro+2.5pro (≥2): 7/8 correct, 8/8 auto-accepted
- E3 3.1pro+3.5flash+2.5flash (≥2): 6/8 correct, 7/8 auto-accepted
- E4 all-5 majority (≥3): 6/8 correct, 7/8 auto-accepted
- E5 3.1pro+3.5flash+GoogleVision (≥2): 5/8 correct, 6/8 auto-accepted

<details><summary>Google Vision OCR anchor</summary>

```
УКРАЇНА
12994800
Прізвище
Ім'я
ВІЙСЬКОВИЙ КВИТОК,
Серія Со
No 845621
Іваненко
Ceprits
По батькові
Тарасович
Особистий підпис
Виданий Кіровоградськальковим
комісаріатом Кіровоградськовості
MIHICTERS
радський
рад
MIC
до грудня 2016.
MIL
Військовий комір
1. Число, місяць, рік народження
01 січня 1990 р.н.
Місце народження,
(назва населеного пункту,
смт. простенець
району, області)
Вінницької обл
2. Освіта вища; Піроварадсь-
кии иститут petioeaes
ного управління еконо
міки я права
3. Основна цивільна спеціальність
юрист; облік і aygum;
4. Сімейний стан
Давання,
1
```
</details>

## OVERALL

**Individual models (correct across all docs):**
- gemini-2.5-flash-lite: 10/22
- gemini-2.5-flash: 10/22
- gemini-2.5-pro: 13/22
- gemini-3.5-flash: 16/22
- gemini-3.1-pro-preview: 20/22

**Ensembles (correct across all docs):**
- E1 3.1pro+3.5flash (≥2): 16/22 correct, 17/22 accepted
- E2 3.1pro+2.5pro (≥2): 13/22 correct, 14/22 accepted
- E3 3.1pro+3.5flash+2.5flash (≥2): 17/22 correct, 19/22 accepted
- E4 all-5 majority (≥3): 12/22 correct, 13/22 accepted
- E5 3.1pro+3.5flash+GoogleVision (≥2): 16/22 correct, 17/22 accepted