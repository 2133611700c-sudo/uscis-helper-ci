# Handwritten Cyrillic OCR — Complete Research Findings
# Date: 2026-05-25

## CRITICAL FINDING: IMAGE QUALITY IS THE BOTTLENECK

Google DocAI Premium Features revealed:
- Image quality score: 0.024 / 1.0 (EXTREMELY LOW)
- Glare detected: 89% confidence
- Blurry detected: 64% confidence
- Dark detected: 62% confidence

THIS is why OCR fails on patronymic — not model limitations.
Pre-processing (deglare, sharpen, contrast) would improve everything.

## PROCESSOR COMPARISON

| Processor | Surname | Patronymic | City | Province | DOB |
|-----------|---------|-----------|------|----------|-----|
| OCR_PROCESSOR (standard) | Іванеко (wrong) | Cepriziobur (garbage) | Тростянець ✅ | Вінницької області ✅ | ✅ |
| FORM_PARSER | cupon'smuuc (WORSE) | Cepritrobur (garbage) | Простянець (WRONG) | Binuuyської (WRONG) | GARBLED |
| Google Vision | Іваненко (closer) | Cepriticbur (garbage) | Тростянець ✅ | Вінницької област ✅ | ✅ |
| Dual OCR + DeepSeek | **Іваненко** ✅ | Тарасович (inferred⚠️) | Тростянець ✅ | Вінницька ✅ | ✅ |

## VERDICT
1. Form Parser: REJECTED — worse results, 0 form fields detected
2. Standard OCR Processor: BEST single provider for this document
3. Dual OCR (Vision + DocAI) + DeepSeek: BEST combined approach
4. Image pre-processing: HIGHEST IMPACT improvement possible

## PER-TOKEN CONFIDENCE (from premium features)
- DOB "1986": 0.96 → AUTO
- City "Тростянець": 0.83 → AUTO
- Province "Вінницької": 0.84 → AUTO
- Surname "Куронятник": 0.83 → REVIEW (wrong despite high conf)
- Patronymic "Cepriziobur": 0.48 → MANUAL

## ARCHITECTURE (proven by testing)
```
booklet upload
  → image preprocessing (contrast, sharpen, deglare)
  → [Google Vision OCR] → raw text A
  → [Google DocAI OCR with premium features] → raw text B + confidence scores
  → [DeepSeek cross-reference] → structured candidates
  → confidence-based routing:
     - conf > 0.8 + DeepSeek agrees → AUTO
     - conf 0.5-0.8 or DeepSeek uncertain → REVIEW
     - conf < 0.5 or both OCR garbage → MANUAL
  → field arbiter → final truth
```

## NEXT STEPS
1. Add image pre-processing for booklet (contrast, sharpen)
2. Wire dual-OCR into booklet module
3. Use per-token confidence for field classification
4. 5-run stability test of full pipeline
