# GPT Vision Bench — same 3 docs / same ground truth as Gemini

Models: gpt-5.5-pro, gpt-5.5, gpt-4o


## PASSPORT

| field | truth | gpt-5.5-pro | gpt-5.5 | gpt-4o |
|---|---|---|---|---|
| surname | Іваненко | ❌ ∅ | ✅ ІВАНЕНКО | ✅ ІВАНЕНКО |
| given_name | Тарас | ❌ ∅ | ✅ ТАРАС | ✅ ТАРАС |
| date_of_birth | 1990-01-01 | ❌ ∅ | ✅ 1990-01-01 | ✅ 1990-01-01 |
| passport_no | AA000000 | ❌ ∅ | ✅ AA000000 | ✅ AA000000 |
| birth_place | Вінницька | ❌ ∅ | ✅ ВІННИЦЬКА ОБЛ. | ✅ ВІННИЦЬКА ОБЛ./UKR |

**Score: gpt-5.5-pro 0/5 · gpt-5.5 5/5 · gpt-4o 5/5**

## BIRTH CERT (handwritten)

| field | truth | gpt-5.5-pro | gpt-5.5 | gpt-4o |
|---|---|---|---|---|
| surname | Іваненко | ❌ ∅ | ❌ ∅ | ❌ Левинский |
| given_name | Сергей | ❌ ∅ | ❌ ∅ | ❌ Андрей |
| patronymic | Сергеевич | ❌ ∅ | ❌ ∅ | ❌ Анатольевич |
| date_of_birth | 1990-01-01 | ❌ ∅ | ❌ ∅ | ❌ 1965-06-26 |
| birth_settlement | Тростянец | ❌ ∅ | ❌ ∅ | ❌ г. Львов |
| birth_oblast | Винницкая | ❌ ∅ | ❌ ∅ | ❌ Львовская |
| father_full_name | Іваненко Сергей Леонидович | ❌ ∅ | ❌ ∅ | ❌ Левинский Анатолий Степанович |
| mother_full_name | Іваненко Наталья Степановна | ❌ ∅ | ❌ ∅ | ❌ Левинская Галина Ивановна |
| certificate_number | III-АМ 428069 | ❌ ∅ | ✅ III-АМ № 428069 | ✅ 428069 |

**Score: gpt-5.5-pro 0/9 · gpt-5.5 1/9 · gpt-4o 1/9**

## MILITARY ID

| field | truth | gpt-5.5-pro | gpt-5.5 | gpt-4o |
|---|---|---|---|---|
| surname | Іваненко | ❌ ∅ | ✅ Іваненко | ❌ Киропотенко |
| given_name | Тарас | ❌ ∅ | ✅ Тарас | ✅ Тарас |
| patronymic | Тарасович | ❌ ∅ | ✅ Тарасович | ✅ Тарасович |
| date_of_birth | 1990-01-01 | ❌ ∅ | ✅ 1990-01-01 | ❌ 1996-06-25 |
| birth_settlement | Тростянець | ❌ ∅ | ✅ смт Тростянець | ❌ село Дяківці |
| birth_oblast | Вінницька | ❌ ∅ | ❌ Вінницької об. | ✅ Вінницька обл. |
| series_number | СО 845621 | ❌ ∅ | ✅ СО № 845621 | ❌ СО 018661 |
| issue_date | 2016-12-22 | ❌ ∅ | ❌ 2011-12-22 | ❌ 2018-12-22 |

**Score: gpt-5.5-pro 0/8 · gpt-5.5 6/8 · gpt-4o 3/8**

## OVERALL
- gpt-5.5-pro: 0/22
- gpt-5.5: 12/22
- gpt-4o: 9/22