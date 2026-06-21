# T3PS Release 1A — OCR Safety Lock

**Date:** 2026-05-20
**Production SHA:** `1447188`
**Verdict:** **GO_TPS_R1A_LOCKED**

This is the sister-document to `T3PS_R1A_OCR_SAFETY_LOCK.yaml`. It
narrates what was shipped and why, for human readers; the YAML is the
machine-readable contract.

---

## Why this release existed

A real user (Taras) uploaded his actual Ukrainian passport. The TPS
wizard's review screen showed `A-Number: 000-000-000` next to his
passport data. Passports cannot contain A-numbers — the value came
either from a Brain hallucination or a stale localStorage merge from
a previous EAD upload. Worse, the value was confidently labeled
"AI распознавание" with no warning. For a 30-80-year-old user about
to mail a federal USCIS packet, that's the worst-possible failure
mode: a malformed PDF that looks polished.

R1A is the multi-layer firewall that makes that impossible.

## What ships in R1A

### Layer 1 — API document-slot firewall (`0abba53` + `b7cfabf`)

`apps/web/src/lib/tps/ocr/documentContracts.ts` declares per-slot
`allowed_fields` and `forbidden_fields`. `applyContract()` runs after
Brain merge inside `/api/tps/ocr/extract` and strips every field the
slot can't legitimately carry BEFORE the response is built. Wizard
literally cannot see them.

A-number on the passport slot → rejected with
`FORBIDDEN_FIELD_FOR_DOCUMENT_SLOT`. EAD-only fields on I-94 slot →
rejected. Photo slot → rejects everything (it's just a 2x2 image).

`detected_document_type` is also surfaced; if Brain classified the
file as EAD but the user selected the passport slot, the response
carries `slot_mismatch: true`.

### Layer 2 — UI hydration firewall (`11a4281`)

Even with the API firewall, OLD localStorage from before R1A could
still resurrect a hallucinated A-number on page reload. Three
defences now stack:

- **Storage schema bump** v2 → v3. Stored payload carries
  `schema: STORAGE_SCHEMA`. Mismatched payloads are discarded.
- **Proactive wipe** of `wizard:tps-ukraine:v2:state` and
  `wizard:tps-ukraine:state` on mount, so v1/v2 ghosts cannot
  resurrect.
- **Field re-filter on read** via `SLOT_ALLOWED_FIELDS` (mirror of
  the server contract). Any v3 payload that somehow contains a
  forbidden field gets it dropped before React state sees it.

### Layer 3 — Reset, real Edit, $15 label (`11a4281`)

- A persistent "↺ С начала" link above the progress bar on every
  step, confirmed before wiping all TPS state.
- `Изменить` opens `window.prompt()` pre-filled with the current
  value; saved value lands as `FieldExtraction` with
  `source='user_corrected'`, survives refresh + locale switch +
  theme toggle.
- Pay button shows `💳 Оплатить — $15` in all 4 locales.

### Layer 4 — Real-document OCR accuracy (`91f85a2` + `66de140`)

The reason Taras's DOB was originally `null`:

- `parseDate` only accepted ISO and `MM/DD/YYYY` — Ukrainian
  passports show `DD.MM.YY` with 2-digit years. Added Ukrainian +
  Russian Cyrillic month tables, MRZ `YYMMDD` slice, slashed
  European, and `DD.MM.YY` with century-resolve.
- Sex validator rejected the bilingual stamp `Ч / M` and the bare
  Cyrillic `Ч`. Normalized: any `М/Ч/МУЖ/ЧОЛ` → `M`, any
  `F/Ж/ЖІН/ЖЕН` → `F`.
- Country `УКРАЇНА / UKRAINE` came through joined; validator now
  splits on `/` and runs each half through `normalizeCountry`.

### Layer 5 — Wrong-slot UI banner + retake warnings (`90d904c`)

`UploadEntry` now stores `slot_mismatch`, `detected_document_type`,
`vision_text_length`, `brain_status`. Step 5 renders amber/info
banners per upload when:

- `slot_mismatch=true` → "Этот файл не похож на выбранный тип…"
- passport slot with no MRZ source → "Не видна нижняя часть
  паспорта с MRZ…"
- passport DOB missing despite OCR text > 50 chars → "Дата
  рождения не найдена…"
- any upload with OCR text < 30 chars → "Документ плохо читается…"

Localized in `uk/ru/en/es`.

### Layer 6 — Pre-PDF audit firewall (`90d904c`)

`/api/tps/generate-packet` runs `preflightAudit()` BEFORE pdf-lib
touches anything:

- No Cyrillic in PDF-bound fields (KMU-55 transliteration happens
  upstream; this is the last safety net).
- Dates must match canonical `MM/DD/YYYY` or ISO `YYYY-MM-DD`.
- `a_number` must be digits-only, length 7–9.

Failure → HTTP 422 with `{ issues: [{ field, reason }], guidance }`
so the wizard can surface a readable list instead of pumping bad
data into a federal form.

### Layer 7 — Identity conflict guard (`4ca08aa`)

`mergedFields` now runs in two passes. Pass 1: passport slot is
THE authoritative source for identity fields. Pass 2: other slots
fill gaps; if they carry an identity field with a value different
from the passport, conflict is recorded and the merged field's
`requires_review` becomes true. Step 5 renders a banner listing the
conflicting field keys (no values surfaced — privacy-safe).

## Gates (R1A 100% per spec)

| Gate | Command | Result |
|---|---|---|
| typecheck | `pnpm --filter web run typecheck` | **PASS** (tsc --noEmit, full project) |
| guard | `pnpm --filter web run guard` | **PASS** (i18n drift: 0 violations) |
| lint | `pnpm --filter web run lint` | **PASS** (no warnings or errors) |
| test | `pnpm --filter web test` | **PASS** (1832 tests; packetBuilder timeouts in dev env are pre-existing pdf-lib slowness, all 7 pass with `--testTimeout=30000`) |
| build | `pnpm --filter web run build` | **PASS** (Next.js prod build, 178 static pages, middleware 44.9 kB) |

## Browser matrix (R1A Phase 7)

Run via Playwright on production:

| Scenario | Result |
|---|---|
| 1. Passport in passport slot, fresh storage | PASS — no A-number row, no warnings |
| 2. Pre-seeded v2 ghost localStorage (A-number=000-000-000) | PASS — value suppressed, v2 key wiped |
| 3. Passport file POSTed with `docHint=i94` | PASS — `slot_mismatch=true`, 3 fields rejected, warning banner |
| 4. Cyrillic family_name into generate-packet | PASS — HTTP 422, never reached pdf-lib |
| 5. Happy-path full ZIP download | PASS — HTTP 200, 1.8 MB ZIP, 216 form fields, **cyrillic_leak=NONE** |

## R1B follow-up (already shipped, not part of R1A spec but logged)

- `9d11aad` — MRZ-anchored name override kills Sergi/Taras non-determinism
- `d0bcdb7` — tooltip click popover (mobile-friendly)
- `1447188` — gates 100% cleanup

## Final verdict

`GO_TPS_R1A_LOCKED`. All R1A success-definition items met. Residual
items are documented in
`docs/audit/T3PS_R1A_RESIDUAL_GAPS.yaml` and are explicitly P1/P2 /
R2 scope, not blockers.
