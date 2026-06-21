# DOC COVERAGE MATRIX — 10 classes × 12 dimensions (2026-06-11, inventory by 4 parallel agents)

Facts only (file:line in agent inventories; registry = docintel/documentRegistry.ts; schemas = forms/ukraine/schemas/).

| Class | extr.cfg | fields | handwritten | schema | mirror | wizard:Translator | wizard:TPS | wizard:Reparole | synthetic fixture | docClass mapping |
|---|---|---|---|---|---|---|---|---|---|---|
| ua_internal_passport_booklet | ✓ L18 | 6 | ALL true | ❌ (legacy template only) | generic | ✓ | ✓ (booklet) | ❌ | ✓ synthetic-passport.jpg | internal_passport_booklet |
| ua_international_passport | ✓ L38 | 5 | ALL false (MRZ-anchored) | ❌ (draft template, allowAutoPdf=false) | generic | ✓ | ✓ (passport) | ✓ | ✓ (same TD3 fixture) | internal_passport_booklet |
| ua_birth_certificate | ✓ L59 | 10 | ALL true (2026-06-11 fix) | ✓ KMU-1025 | ✓ mirror | ✓ (autoread) | ❌ | ❌ | ✓ | birth_certificate_handwritten (anti-fab ✓) |
| ua_marriage_certificate | ✓ L80 | 6 | ALL true | ✓ KMU-1025 | ✓ mirror | ✓ (autoread) | ❌ | ❌ | ✓ | marriage_apostille |
| ua_divorce_certificate | ✓ L97 | 5 | ALL true | ✓ KMU-1025 | ✓ mirror | **❌ GAP-W1** | ❌ | ❌ | **❌ GAP-F1** | **unknown_document (no mapping) GAP-M1** |
| ua_id_card | ✓ L113 | 5 | ALL false (machine-printed) | ❌ | generic | ✓ | ❌ | ❌ | **❌ GAP-F2** | unknown_document (conservative-safe) |
| ua_military_id | ✓ L135 | 5 | ALL true | ✓ (2026-06-11, AFU blank) | ✓ mirror | ✓ (autoread) | ❌ | ❌ | ✓ | military_id |
| us_ead | ✓ L152 | 8 | ALL false | ❌ | generic | ❌ (US: owner-clarify) | ⚠ hybrid/old slots | ✓ | ✓ generated/ | unknown_document |
| us_i94 | ✓ L172 | 8 | ALL false | ❌ | generic | ❌ | ✓ | ✓ | ✓ generated/ | unknown_document |
| us_i797 | ✓ L193 | 4 | ALL false | ❌ | generic | ❌ | ⚠ hybrid slot | ❌ | ✓ notice fixture | unknown_document |

(+2 registered schemas вне 10-листа: ua_death_certificate, ua_name_change_certificate — KMU-1025, mirror ✓, фикстур нет.)

## PRIORITY_GAPS
- **GAP-W1**: divorce имеет schema+extraction+mirror, но НЕ exposed в TranslateWizard → добавить tile.
- **GAP-F1/F2**: synthetic fixtures отсутствуют для divorce и id_card.
- **GAP-M1**: ua_divorce_certificate без docClass-маппинга → unknown_document; корректнее vintage-семья (как marriage).
- **GAP-S1**: schemas отсутствуют для booklet/international/id_card (рендер generic; legacy booklet-template АКТИВЕН для клиентского PDF — миграция на mirror = осторожный шаг, НЕ слепой).
- **GAP-US**: US-доки в переводчике — ambiguity (нужен ли US-перевод?) → owner-clarify, STOP per anti-drift.
- Anti-fab allowlist кроет только birth-классы; для остальных vintage-доков защита = per-field handwritten:true (см. HANDWRITING_RULES doc) — покрытие полное, механизм другой.
