# HANDWRITTEN CYRILLIC COVERAGE PROOF (2026-06-11, PII-free)

## Synthetic fixtures × live-prod extraction (vision-extract, core-b2)
| Fixture | docTypeId | fields | values | Verdict |
|---|---|---|---|---|
| synthetic-birth-cert.jpg | ua_birth_certificate | 10 | 10 | ✓ |
| synthetic-military-id.jpg | ua_military_id | 5 | 5 | ✓ (после 100KB quality-gate) |
| synthetic-marriage-cert.jpg | ua_marriage_certificate | generated | — | wizard-E2E кейс |
| synthetic-divorce-cert.jpg | ua_divorce_certificate | 5 | 5 | ✓ |
| synthetic-id-card.jpg | ua_id_card | 5 | 5 | ✓ |
| synthetic-passport.jpg (TD3) | booklet | 3+ | 3+ | ✓ (smoke baseline) |

## Rotation matrix (REAL handwritten cert, pixels rotated, no EXIF)
| Rotation | fields | values | cyr | family vs GT |
|---|---|---|---|---|
| 0° / 90° / 180° / 270° | 10 | 10 | 10 | MATCH на всех |

Auto-orient доказан end-to-end; механизм doc-agnostic (до ридера в одной двери readDocument).

## Real-document benches (gold-only, provenance-separated)
birth 4/6 · military 5/5 (incl doc_number) · passport 3/3 · **SILENT-WRONG = 0 на всех** (см. FIRST_REAL_GT_BENCH).

## Wizard E2E (Playwright, headless, live prod)
birth + military: **2/2 GREEN** (39.9s / 17.7s) — реальный UI-поток: tile → upload → review-таблица с настоящими строками, без manual-fallback. Spec расширен до 6 классов + inventory-страница (прогон в CI после деплоя).

## Edge cases (verified in code)
| Case | Status | Evidence |
|---|---|---|
| HEIC (iPhone) | ❌ НЕ поддерживается | vision-extract ALLOWED_MIME = jpeg/jpg/png/webp (route:58) — known limitation; клиентский pick обычно конвертит, но прямой HEIC отклоняется |
| PDF input | ❌ НЕ поддерживается | тот же ALLOWED_MIME |
| Multi-page | ✓ | repeated `file` key, до MAX_PAGES (route:4-26) |
| 45° angle | ⚠ не покрыто | autoOrient детектит 90°-кратные; произвольный угол = limitation |

## Claim (бережно)
Рукописная кириллица обслуживается review-first пайплайном на всех vintage-классах
(per-field handwritten:true), auto-finalization запрещена, авточтение сложной рукописи = Phase 7 (HTR).
