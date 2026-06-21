# TPS PRODUCT VISION — Complete Package Architecture
Date: 2026-05-23
Author: Architecture session

## What the user gets (one ZIP, one payment)

```
tps-packet.zip
├── I-821.pdf                  ← заполненная форма (TPS Robot)
├── I-765.pdf                  ← заполненная форма (TPS Robot)
├── PASSPORT_TRANSLATION.pdf   ← перевод паспорта (Translation Engine v5)
├── CERTIFICATION.pdf          ← 8 CFR §103.2(b)(3) certification page
├── INSTRUCTION_RU_UK.txt      ← что делать дальше (на языке клиента)
├── CHECKLIST.txt              ← список что положить в конверт
└── AUDIT_PROVENANCE.txt       ← аудит: откуда каждое поле
```

## What already exists for this

### TPS Robot (apps/web/src/lib/tps/)
- 6 OCR extraction modules → 43 auto-extracted fields
- i765FieldMap.ts + i821FieldMap.ts → PDF form filling
- pdfPrefiller.ts → AcroForm/XFA fill with KMU-55 transliteration
- mailReadyGate.ts → blocks incomplete packages
- postExtractNormalize.ts → oblast normalization in OCR route
- packetBuilder.ts → ZIP assembly

### Translation Engine v5 (apps/web/src/lib/translation/)
- passportBooklet.template.ts (155 lines) → internal passport translation
- internationalPassport.template.ts (285 lines) → foreign passport translation
- generateTranslationHTML.ts (884 lines) → HTML → PDF rendering
- certificationRecord.ts → 8 CFR certification page
- glossary/ → agency abbreviations, civil registry terms
- validators/ → quality checks per document type

### Knowledge Package (packages/knowledge/)
- dictionary.ts → canonical terminology
- transliterate.ts → KMU-55 engine
- normalize.ts → oblast, authority, controlling spelling

## What needs to be built (ONE bridge)

File: `apps/web/src/lib/tps/translationBridge.ts`

```
Input:  TPSAnswers + raw extracted fields from OCR
Output: Translation HTML → PDF (ready for ZIP inclusion)

Steps:
1. Detect document type from OCR module result
2. Select correct template (passportBooklet.template or internationalPassport.template)
3. Feed extracted fields + normalized values into template
4. Call generateTranslationHTML to produce HTML
5. Render HTML → PDF
6. Generate certification page
7. Return both PDFs for ZIP inclusion
```

Bridge point in existing code:
- `apps/web/src/lib/tps/packetBuilder.ts` → after I-821 + I-765 PDFs,
  call translationBridge → add PASSPORT_TRANSLATION.pdf + CERTIFICATION.pdf to ZIP

## User flow (3 steps on phone)

```
STEP 1: "Сфотографуйте документы"
  [Паспорт] [I-94] [Права] [I-797]
  
  Робот сам:
  • определит тип документа
  • вытянет все поля
  • транслитерирует на английский
  • подготовит перевод паспорта

STEP 2: "Проверьте данные"
  Робот показывает что нашел.
  Пользователь вводит только:
  телефон, email, семейное положение
  
  Если что-то не так → "Исправить"
  Если всё ок → "Далее"

STEP 3: "Скачайте готовый пакет"
  Один ZIP с ВСЕМ что нужно для подачи:
  • заполненные формы
  • перевод паспорта + сертификация
  • инструкция + чеклист
  
  Пользователь: распечатал → подписал → отправил почтой
```

## Pricing model

Single package price that includes EVERYTHING:
- Form filling (I-821 + I-765)
- Passport translation + certification
- Filing instructions + checklist

Why: translation is REQUIRED by USCIS (8 CFR §103.2(b)(3)).
Making it a separate upsell means some users will skip it and get rejected.
Including it in the base price = higher value, no user confusion.

## What this means for existing code

NO REBUILD. Only one new file (translationBridge.ts) + one edit (packetBuilder.ts).

Translation Engine v5 stays as-is for standalone translation orders
(birth certificates, marriage certificates, etc. — those are NOT part of TPS).

TPS Robot stays as-is for form filling.

Bridge connects them for TPS-specific flow only.
