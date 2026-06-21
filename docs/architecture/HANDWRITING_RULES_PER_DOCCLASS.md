# HANDWRITING RULES PER DOC-CLASS (2026-06-11)

Принцип (proven by the GT-bench silent-wrong, 2026-06-11): на vintage-бланках рукописно ВСЁ
(форма печатная, значения от руки) ⇒ каждый value-field `handwritten:true` ⇒ безусловный review.
Machine-printed доки: `handwritten:false`, защита = MRZ-anchor + confidence<0.95 + guards.

| Class | handwritten | Reasoning | Source/Proof |
|---|---|---|---|
| ua_internal_passport_booklet | ALL true | советская книжка, рукописные записи | real booklet (bench 3/3) |
| ua_birth_certificate | ALL true | vintage blank | real cert; silent-wrong fix 758415b |
| ua_marriage_certificate | ALL true | та же vintage-семья | family-fix c676d9b |
| ua_divorce_certificate | ALL true | та же vintage-семья | family-fix c676d9b |
| ua_military_id | ALL true | книжка, рукописные записи | real booklet (bench 5/5) |
| ua_international_passport | ALL false | биометрический, печать+MRZ | MRZ = anchor (bench 5/5) |
| ua_id_card | ALL false | пластик, машинная печать | design |
| us_ead / us_i94 / us_i797 | ALL false | машинная печать USCIS | design |

## Защитные слои × kind (кросс-референс)
- anti-fabrication gate: IDENTITY_SUBSTRINGS only; risk-классы = {birth_certificate_handwritten, birth_certificate_soviet_bilingual}. Это ДОПОЛНИТЕЛЬНЫЙ слой для birth.
- ОСНОВНОЙ слой для всех vintage-доков = per-field handwritten:true (reader-level forced review, kind-agnostic — закрывает doc_number/agency/date, которые anti-fab не видит).
- Machine-printed: confidence-гейт + MRZ + confirmedValueGuard.
- ПРОВЕРЕНО: 0 misclassifications осталось (vintage 5/5 классов true; printed 5/5 false). Тест-пин: birthCertHandwrittenFlags.test.ts (параметризован на 3 cert-класса).

## ARCH_DEBT
Будущие machine-printed УА-свидетельства получат лишний review (асимметрия в пользу safety).
Fix = per-field handwriting-origin сигнал (ADDITION-C). Записано в PROD_RISK_NOTES.
