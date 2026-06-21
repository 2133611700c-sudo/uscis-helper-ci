# Live-Door Scorable Coverage (sanitized; no PII values)

**Date:** 2026-06-04. "Live-door scorable" = a GT doc that can be run through the real
`readDocument` (registry → vision → arbitration) path the product uses — NOT a raw model API call.
**Rule (binding):** a raw model call is NOT product accuracy. Only the live-door path counts.

## Why GT-ready ≠ scorable
6 GT files are `VERIFIED_BY_OWNER`, but a doc is only scorable if (a) it has a registry doc type that
`readDocument` accepts, and (b) a real upright image exists. Three of the six failed one of those.

## Coverage change this session

| GT doc | before | after | how |
|---|---|---|---|
| birth_cert_soviet | ✅ scorable | ✅ | `ua_birth_certificate` + real image |
| birth_cert_handwritten | ✅ scorable | ✅ | `ua_birth_certificate` + real image |
| internal_passport | ✅ scorable | ✅ | `ua_internal_passport_booklet` + real image |
| **military_id_p1** | ❌ no registry type | ✅ **scorable** | **added `ua_military_id` registry type** |
| ead_owner_fill | ❌ US doc / no image | ❌ **BLOCKED** | US doc; no UA-reader path; no upright real image |
| i94_owner_fill | ❌ US doc / no image | ❌ **BLOCKED** | US doc; no UA-reader path; no upright real image |

**Live-door scorable: 3 → 4 of 6.**

## What changed in code (no prod flags, no deploy; behavior-preserving)

1. **New registry type `ua_military_id`** (`documentRegistry.ts`) — identity-page civil fields only
   (family_name, given_name, patronymic, dob, doc_number). No `sex` field: there is no `sex` FieldKind
   in the reader contract, so sex stays unscored for this type (documented limitation, not a wrong value).
   Inert for prod: no current caller passes `ua_military_id` to `readDocument` (TPS military still uses its
   regex module); this only enables the scorable path + future routing.
2. **Patronymic naming fix** — source field for «По батькові» renamed `middle_name` → `patronymic` on
   `ua_internal_passport_booklet` and `ua_id_card` (birth cert already used `child_patronymic`). This
   enforces the CLAUDE.md hard-rule (Patronymic ≠ Middle Name) at the source layer. The USCIS **form**
   field stays `middle_name` (TPSAnswers.middle_name) — that is a real I-765/I-821/I-131 field; the
   source→form mapping bridges patronymic → the form's Middle Name box.
3. **Backward-compat (no regression):** every consumer accepts `patronymic` with a `middle_name` fallback —
   `documentContracts` allow-list, `postExtractNormalize` guard, `translationBridge`/`translationExtractor`
   getters (`get('patronymic') || get('middle_name')`). `eadAdapter`/`reParoleAdapter` already aliased
   `['patronymic','middle_name_cyrillic']`; gates (`selfConsistency`, `antiFabricationGate`,
   `patronymicReconcile`) already list both. Full suite: 2851 passed / 4 skipped, 0 type errors.

## Live proof (flags OFF, gemini-3.1-pro; raw → qa-private, no PII)

- **`ua_military_id`** (military_id_p1): **5/5 scored fields correct** (family/given/patronymic/dob/doc_number
  all match). Routes through the live door for the first time. The model read the printed identity page cleanly.
- **`ua_internal_passport_booklet`** (re-check): patronymic field is now correctly named `patronymic`, but on
  this image the model **still returns no patronymic value** (`not_read`). So the passport patronymic gap is a
  **vision/image limitation, not a naming bug** — the rename was the right correctness fix but does not, by
  itself, make the model read «По батькові» on this booklet. family/given/dob = 3/3 correct (unchanged).

## EAD + I-94 — goal WITHDRAWN, not blocked (ADR-016)

Earlier framed as a "blocker." That was a category error. EAD and I-94 are **English/Latin US documents the
client already holds**; the controlling-Latin rule reads their MRZ/printed Latin directly. They do NOT belong
in the **Ukrainian** reader brain, and "scorable through the UA door" is the wrong target. So this is not a
missing fixture — it is a withdrawn goal. Their raw model reads are NOT product accuracy and are excluded
from UA-door scoring. If a US-document accuracy path is ever wanted, it is a **separate Latin pipeline**
(its own ADR), not an addition to the UA registry. Net effect: live-door UA coverage = **4/4 of the
UA documents that have a real image** (2 hard-case birth, passport, military); the 2 US docs are out of scope
by design.

## Net
- UA live-door coverage = **4/4 of the UA docs that have a real image** (2 hard-case birth, passport,
  military). Was 3 (military was unroutable); now 4. Military scores 5/5 on the live door.
- Patronymic naming corrected at the source layer, behavior-preserving.
- EAD/I-94: **out of scope by design** (US/Latin docs — ADR-016), not a blocker. No false "6/6" target.
- No flags enabled, no prod env change, no deploy, no model switch, no SMART/HTR/L2-WIRE.
