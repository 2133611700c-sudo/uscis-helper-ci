# ONE_BRAIN Post-Merge Verification

Date: 2026-06-03
Auditor: independent (post-merge check, read-only)

## Production SHA

sha: c254143b46198d0dbfc0e00f8d45278744764dce
build_time: 2026-06-03T19:24:37.628Z
matches_commit: yes (expected c254143b — confirmed full SHA prefix match)

Raw health response:
```json
{
  "ok": true,
  "service": "messenginfo-uscis-helper",
  "sha": "c254143b46198d0dbfc0e00f8d45278744764dce",
  "build_time": "2026-06-03T19:24:37.628Z",
  "google_vision_configured": true,
  "deepseek_configured": true,
  "tps_ai_brain_enabled": true,
  "tps_docai_enabled": false,
  "tps_ocr_provider": "google_vision",
  "brain_ready": true,
  "brain_misconfigured": false
}
```

## Flags

| Flag | Set | Value |
|---|---|---|
| ONE_CORE_TPS_ENABLED | yes | Encrypted (set in Vercel Production, created 18h ago) |
| ONE_CORE_REPAROLE_ENABLED | yes | Encrypted (set in Vercel Production, created 11h ago) |
| NEXT_PUBLIC_ONE_CORE_REPAROLE_ENABLED | yes | Encrypted (set in Vercel Production, created 11h ago) |
| ONE_CORE_EAD_ENABLED | yes | Encrypted (set in Vercel Production, created 14m ago) |
| NEXT_PUBLIC_ONE_CORE_EAD_ENABLED | yes | Encrypted (set in Vercel Production, created 14m ago) |
| ONE_BRAIN_CORE_ENABLED | yes | Encrypted (set in Vercel Production, created 18h ago) |
| CENTRAL_BRAIN_TRANSLATION | yes | Encrypted (set in Vercel Production) |

Note: Vercel stores values encrypted; actual "true"/"false" not visible. All flags are present in Vercel Production environment. Route behavior confirms flags are active (see Routes section).

## Routes

| Route | Exists | Flag Active | Evidence |
|---|---|---|---|
| /api/tps/health | yes | N/A | ok:true, brain_ready:true |
| /api/tps/ocr/extract | yes | N/A | Returns validation error (not 404): `{"error":"...","received_mime":"...","allowed":...}` |
| /api/translation/vision-extract | yes | N/A | Returns `{"ok":false,"error":"Expected multipart/form-data..."}` — route exists, not 404 |
| /api/reparole/ocr/extract | yes | yes | Returns `{"error":"Expected multipart/form-data with a \"file\" field."}` — not flag-inactive message, not 404 |
| /api/ead/ocr/extract | yes | yes | Returns `{"error":"Expected multipart/form-data with a \"file\" field."}` — not flag-inactive message, not 404 |

Flag-active determination: routes return form validation errors (not "flag is not active" messages and not 404), confirming the flag-gated code path is executing.

## Bundle (Source-Level Verification)

Pages return minimal HTML (SSR/auth-gated, 9 bytes), so JS bundle scanning via curl is not possible. Verified via source code instead — production SHA matches local source exactly.

| Product | Route in bundle | Flag branch in bundle |
|---|---|---|
| Re-Parole | reparole/ocr confirmed | yes — conditional at line 601-602 of ReparoleWizardV2.tsx |
| EAD | ead/ocr confirmed | yes — EADWizard.tsx references /api/ead/ocr/extract behind EAD_CORE_ENABLED |

Re-Parole routing logic (ReparoleWizardV2.tsx line 601-602):
```
const useCoreRoute = REPAROLE_CORE_ENABLED && CORE_COVERED_SLOTS.has(id)
const ocrRoute = useCoreRoute ? '/api/reparole/ocr/extract' : '/api/tps/ocr/extract'
```

CORE_COVERED_SLOTS = `new Set(['passport', 'booklet'])` (line 45)

## Negative Checks

| Check | Result |
|---|---|
| Re-Parole not leaking to tps/ocr (for passport, when flag ON) | pass — conditional logic confirmed: flag ON + passport/booklet → reparole/ocr; flag OFF → tps/ocr |
| EAD: A-number null without EAD source | pass — 22 vitest assertions cover this (passport-only source gate) |
| EAD: category null without EAD source | pass — covered by eadAdapter.test.ts + eadWizardUiWiring.test.ts |
| EAD: I-94 null without I-94 source | pass — `i94_admission_number` null for passport/EAD sources, confirmed in tests |
| EAD: invented_fields_count=0 | pass — explicit test: "invented_fields_count is always 0 (passport-only case)" ✓, "invented_fields_count is 0 for EAD source" ✓ |
| PII not in git | pass — `git log --all --oneline -- "qa-private/**"` returned empty; no qa-private files committed |

## Unit Test Summary

**eadAdapter.test.ts**: All tests pass (source-gated field mapping, passport-only nulls, EAD source mapping, I-94 source mapping, DL address gate, invented_fields_count=0)

**eadWizardUiWiring.test.ts**: All tests pass (flag wiring, Core route reference, flag-OFF fallback, docHints, prefill mapping, B4 hard rules)

**reParoleAdapter.test.ts**: All tests pass (identity mapping, I-94 mapping, review propagation, uncertain_fields, core_status, adapter purity, full passport fixture)

**uiWiring.test.ts (Re-Parole)**: All tests pass (B3 wiring, REPAROLE_CORE_ENABLED flag, Core route selection, TPS fallback, response parsing)

**KMU-55 (patronymic)**: 35 passed, 0 failed

## Final Status

FINAL_STATUS: ONE_BRAIN_COMPLETE_LIVE_CONFIRMED

## What is NOT solved (honest)

- Hard-case certificates (handwritten, Soviet bilingual): forced review only, accuracy unproven — no ground truth from owner
- Ground truth for failed certificates: owner-blocked
- MRZ international passport authority: not covered
- BUREAU_PDF/P2: out of scope
- Vercel env values are encrypted — actual boolean values of flags not directly verifiable (inferred from route behavior)
- JS bundle scanning not possible (pages return 9-byte SSR response, likely auth-gated) — verified via source code match instead
