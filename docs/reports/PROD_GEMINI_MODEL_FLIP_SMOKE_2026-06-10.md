# Prod Gemini Model Flip + Smoke — 2026-06-10

**Result: PASS_PROD_MODEL_SMOKE**

## Context

Phase 2 split (PRs #104–#110) merged to main with PR-F raising timeouts (20s→40s) as prerequisite.
Live prod was running `gemini-2.5-flash` because `GEMINI_MODEL` had a dirty embedded `\n`.
`normalizeGeminiModel()` strips whitespace, so `"gemini-2.5-flash\n"` → `gemini-2.5-flash` — all Phase 1+2 work was delivered to clients via flash, not pro.

## Step 1 — Baseline

| Item | Value |
|---|---|
| `main` SHA | `203b572dc5e063453244b8e824886bfccd9e419d` |
| prod SHA (healthz) | `203b572` |
| healthz | `{"status":"ok","service":"messenginfo","environment":"production"}` |
| `GEMINI_MODEL` before | `"gemini-2.5-flash\n"` (raw: `'"gemini-2.5-flash\\n"\n'`, length 21) |
| `GEMINI_API_KEY_PAY` present | yes |
| `DEEPSEEK_API_KEY` present | yes |
| `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` present | yes |
| Dead flags in Vercel | ONE_BRAIN_CORE_ENABLED, ONE_CORE_TPS_ENABLED, ONE_CORE_REPAROLE_ENABLED, ONE_CORE_EAD_ENABLED (+NEXT_PUBLIC twins) — harmless, Phase 2 removed all gates |

## Step 2 — Env Flip

```
npx vercel env rm GEMINI_MODEL production -y   → "Removed Environment Variable"
printf 'gemini-3.1-pro-preview' | npx vercel env add GEMINI_MODEL production
  → "Added Environment Variable GEMINI_MODEL to Project uscis-helper"
```

Verification via `vercel env pull`:
```
GEMINI_MODEL raw: '"gemini-3.1-pro-preview"\n'   # quotes from .env format; no embedded \n
Stripped: '"gemini-3.1-pro-preview"'
Clean: True
```

## Step 3 — Redeploy

```
npx vercel --prod --yes
```

Output: `Build Completed in /vercel/output [1m]` → `Aliased: https://messenginfo.com`

No TypeScript errors, no build failures. `maxDuration=60` and `timeoutMs=40_000` already on main from PR-F.

## Step 4 — Healthz

```
curl -s https://messenginfo.com/api/healthz
{"status":"ok","service":"messenginfo","timestamp":"2026-06-10T05:57:41.371Z","sha":"203b572","environment":"production"}
```

SHA matches main. Service healthy.

## Step 5 — Live Model Smoke

Synthetic call — 1×1 white PNG, no PII, `docTypeId=us_i94` (US doc = bypasses UA quality gate):

```
POST https://messenginfo.com/api/translation/vision-extract
Content-Type: multipart/form-data
file: 1×1 white PNG (70 bytes)
docTypeId: us_i94
```

Response:
```json
{
  "ok": false,
  "model": "gemini-3.1-pro-preview",
  "provider": "gemini",
  "status": "ok:gemini-3.1-pro-preview:4554ms:0f",
  "error": "No fields extracted across all pages.",
  "fields_count": 0
}
```

- `model: gemini-3.1-pro-preview` — **confirmed live Gemini call**
- 4554ms — well within 40s timeout; no timeout fallback triggered
- `ok: false` / zero fields — expected for a 1×1 white pixel (no text)
- No 5xx, no 429, no 502

## Step 6 — Logs

`vercel logs` streams only — no persistent history available in CLI. No errors observed during smoke call.
Status: `LOG_HISTORY_UNVERIFIED` (expected for Vercel CLI streaming mode).

## Decision

| Check | Result |
|---|---|
| GEMINI_MODEL clean | ✓ `gemini-3.1-pro-preview` (no embedded \n) |
| prod redeployed | ✓ |
| healthz ok | ✓ |
| smoke 200 (route up) | ✓ |
| model metadata verified (live call) | ✓ `gemini-3.1-pro-preview` confirmed in response |
| no 502/404/timeout | ✓ |
| no fallback to flash | ✓ |
| no PII | ✓ (1×1 synthetic PNG) |
| rollback executed | N/A (not needed) |
| code changed | NO |
| Phase 3 started | NO |
| KNOWLEDGE_BRAIN_ENABLED changed | NO |
| Stripe touched | NO |

**RESULT: PASS_PROD_MODEL_SMOKE**

## Next Actions

Phase 3 is UNBLOCKED:
- `final_value: string | null` on `CanonicalField`
- C3 (`applyOcrFieldSafety`) = single writer of `final_value`
- D6/PDF reads only `final_value`; critical null → block

See HANDOFF.md for Phase 3 design spec.

## Residual (non-blocking)

- Dead One-Core env flags in Vercel — harmless cleanup for a future session
- `GOOGLE_CLOUD_VISION_API_KEY` — 403 billing (documented in prior audit); prod Vision runs via SA
- Direct unit test for BUG C (`documentFieldReader.ts:72-92`) — still residual debt
- Soviet-bilingual RU tolerance test — still residual debt
