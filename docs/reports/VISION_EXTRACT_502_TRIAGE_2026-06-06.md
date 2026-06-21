# Vision-Extract 502 — P0 Triage (2026-06-06)

Sanitized — all probes used SYNTHETIC images (blank/noise) and an unknown docType, zero PII, no real document.

## RESULT: ROOT CAUSE FOUND + FIXED. The 502 was a wrong status code, not a crash or timeout.

`/api/translation/vision-extract` returned **HTTP 502 whenever it recognized zero fields** — a one-line
status-code bug, not an infrastructure failure. Fixed to return **HTTP 200** with `ok:false` + `status` + `error`
+ `review_required` (the route's existing convention for non-fatal "can't proceed" outcomes).

## Baseline
- prod==main==`0d3d82b`, healthz ok. `OCR_FIELD_SAFETY_ENABLED` ABSENT/OFF (not touched during triage).
- `ONE_BRAIN_CORE_ENABLED` + `CENTRAL_BRAIN_TRANSLATION` present (pre-existing, unchanged). SMART absent.

## Reproduce matrix (flag OFF throughout)
| probe | input | status (via messenginfo / Cloudflare) | stage reached | provider attempted | duration |
|---|---|---|---|---|---|
| A | small UA-identity image (10KB) | **200** `needs_better_scan` | early quality guard (before read) | no | fast |
| B | noise 740KB, `ua_birth_certificate` | **502** | model-read path → no fields | yes | — |
| C | blank 715KB, `ua_birth_certificate` | **502** | model-read path → no fields | yes | — |
| D | small 10KB, `ead` (no registry → 0 fields) | **502** | model-read path | n/a (unknown type) | **0.5–1.3s** |

Then, hitting the **Vercel origin directly (bypassing Cloudflare)** with probe D:
- HTTP **502**, but body = the route's **complete valid JSON**:
  `{"ok":false,"doc_type_id":"ead","fields":[],"ocr_field_safety":{"applied":false},"pages":[{"page":1,"ok":false,"status":"unknown_document_type","error":"No registry entry for \"ead\""}],...}`
- `server: Vercel`, `x-vercel-id` present → the function executed fully, **no crash**, the safety gate ran.
- Through Cloudflare the same 502 has `server: cloudflare`, no `x-vercel-id`, body = bare `error code: 502` →
  CF masks the JSON with a generic error page (why end users saw "HTTP 502").

## Root cause (confidence: HIGH — direct-origin body proves it)
`apps/web/src/app/api/translation/vision-extract/route.ts`, final return:
```
}, { status: ok ? 200 : 502 })   // ok === (fields.length > 0)
```
When extraction yields zero fields (`ok=false`) the route returned **502**. Zero recognition is an EXPECTED
operational outcome (hard-case birth cert, blank/unsupported image, unknown docType) — not a gateway error.
This is the original "translator → 0 results / HTTP 502" incident: the client (`TranslateWizard.tsx:996-1001`)
does `if (!res.ok || !json?.ok) setExtractionError(json?.error ?? 'HTTP ${res.status}')`; on a 502 the body is
non-JSON (CF page) so it falls back to showing literal **"HTTP 502"**.

Root-cause class: **G/H — route returned a 5xx instead of a structured 200 for a non-fatal recognition outcome.**
NOT a timeout (502 in ~0.5–1.3s, far below maxDuration=60), NOT a model hang, NOT a crash, NOT env/provider.

## Real-document impact
**Yes, real hard-case documents are affected** by the same code path: any upload that reads 0 fields (or where
all pages error) returned 502. This is consistent with the original birth-certificate incident. (Not exercised
with a real document here — no PII upload — but the path is identical and docType-independent.)

## Fix
- `route.ts`: final return → **`{ status: 200 }`** (always). Added `review_required: true` to the no-fields
  body so a zero read is never silent success. Genuine bad-request codes (400/413/415/429) unchanged. True
  unhandled exceptions still surface as a platform 500.
- Matches the route's other non-fatal returns (`needs_better_scan`, `reshoot_required` already return 200).

## Tests
- NEW `apps/web/src/app/api/translation/__tests__/visionExtract502.test.ts` (6, source-level guard — same
  pattern as the repo's other route wiring tests): no `ok ? 200 : 502`, no `status: 502` anywhere, terminal
  return is unconditional 200, no-fields ⇒ `review_required:true`, ok:false+error preserved, 400/413/415/429 kept.
- `tsc --noEmit`: 0 errors. Full suite: **2919 passed / 4 skipped** (was 2913 + 6).
- C3 documentSafety tests remain green (38).

## Runtime proof (preview deployment of this branch — only diff from prod is this one-line fix)
- **Proof A** — `ead` (unknown type → 0 fields → the exact fallback return that 502'd on prod): now **HTTP 200**,
  `server: Vercel`, `x-vercel-id` present, body `{ok:false, status:'unknown_document_type', review_required:true,
  error:'No registry entry for "ead"'}`. The identical request returns **502 on prod** → the code fix is proven.
- **Proof B** — blank image as `ua_birth_certificate` (the incident shape): **HTTP 200** via the central-brain
  path, all 10 fields `value:null, review_required:true, kind:"gemini could not read"` — not a 502, and not silent
  success (everything flagged for review; no fabrication).
- Note: the 502 lived only on the FINAL fallback return (line 371); the central-brain / one-brain-core early
  returns already used 200. Proof A is the direct before/after of the fixed line.

## Remaining limitations
- Not exercised with a real document (no PII). Path is identical; behavior is docType-independent.
- A genuine provider OUTAGE (all pages error) now also returns 200 with `ok:false` + per-page `error` — visible
  in the body and `console.error` logs, but no longer as an HTTP 5xx. Acceptable: the client must show a graceful
  message either way; uptime monitoring should key on the body/logs, not the transport code.

## Next action
1. Merge this fix (owner) → redeploy prod → re-run the no-fields probe against prod (expect 200).
2. THEN re-run the OCR field-safety canary (per OCR_FIELD_SAFETY_CANARY_RUNBOOK.md) — the 502 blocker is gone, so
   the gate can finally be route-proven (owner uploads one real hard-case doc with the flag ON).
3. ReaderResult / OneBrain remain HOLD until the canary is PASS.

## Confirmations
No prod env/flag change. No model/provider change. No SMART/D0/ReaderResult/OneBrain. No PII (synthetic inputs). qa-private=0.
