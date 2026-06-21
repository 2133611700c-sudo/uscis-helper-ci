# Vision 429 Diagnosis — OCR Honest Degradation (P1)

Date: 2026-06-14
Branch: `fix/p1-ocr-honest-degradation`
Status: PRIMARY-SOURCE VERIFIED. PII-free. No secrets in this doc.

## TL;DR

The Vision service account is on a **free-tier Google project with low per-minute
rate limits**. Under load it returns **HTTP 429 RATE_QUOTA** — *temporary,
intermittent*, NOT a hard daily cap, NOT billing-disabled. The bug was that the
app **masked this provider failure as HTTP 200 + `fields:[]`** so the client
treated a rate-limit as a successful-but-empty extraction. This PR makes the
failure **honest** (typed error + non-2xx) and stops the deploy smoke from
burning paid OCR.

## Primary-source evidence

1. **Project / tier.** `GOOGLE_VISION_SERVICE_ACCOUNT_JSON` resolves to Google
   project **`gen-lang-client-0450386998`** — an AI Studio / free-tier project
   with **low per-minute** rate limits. A direct off-load call to the same SA
   **succeeded**, confirming the credentials and project are valid and the API is
   enabled.

2. **Error class.** Under concurrent load the provider returns **HTTP 429** with a
   Google envelope whose `details[].reason` is the rate class
   (`RATE_LIMIT_EXCEEDED` / `RATE_QUOTA`). This is **transient** — a retry a few
   seconds later succeeds. It is **NOT** `RESOURCE_EXHAUSTED` (a hard daily/quota
   cap), which would be terminal.

3. **Billing red herring.** A *different* project named **`messenginfo`** has
   billing disabled. **The app does not use that project** — it authenticates with
   the SA on `gen-lang-client-0450386998`. So "billing disabled" is NOT the cause
   of the 429s. (We still classify a real `403 BILLING_DISABLED` correctly if it
   ever appears.)

4. **Invalid API key (latent, unused).** `GOOGLE_CLOUD_VISION_API_KEY` returns
   **400 `API_KEY_INVALID`**, but it is **unused**: the provider prefers the
   service-account path (`credentials` before `apiKey`). Latent cleanup — note
   only, not on the failure path today.

## The bug (BEFORE)

`vision-extract` returned **HTTP 200** with `fields:[]` and
`status:"vision_failed:HTTP 429"`. The wizard's `!res.ok || !json?.ok` branch
treated this as a non-fatal "manual path" — i.e. the user advanced as if the
document had been read but came back empty. **A provider rate-limit looked like a
successful empty read.** That violates the project's no-false-success rule.

## The fix (AFTER)

- **Typed errors** (`lib/ocr/ocrErrors.ts`): `classifyProviderError()` maps a
  provider failure to one of `OCR_RATE_LIMITED` (429 rate, retryable, surfaces
  Retry-After), `OCR_QUOTA_EXHAUSTED` (RESOURCE_EXHAUSTED, not retryable),
  `OCR_PROVIDER_UNAVAILABLE` (5xx/timeout, retryable), `OCR_BILLING_DISABLED`
  (403, not retryable), `OCR_BUDGET_EXCEEDED` (our kill-switch, not retryable),
  `OCR_INVALID_RESPONSE` (malformed/empty-200-with-error, not retryable).
- **Provider** (`lib/ocr/providers/google-vision.ts`) and the Gemini reader
  (`lib/docintel/...`) now **carry the typed error up** instead of flattening it
  into an empty result.
- **Route** (`api/translation/vision-extract`) **fails closed**: when no page
  produced any usable field AND a page surfaced a typed provider error, it returns
  an honest **429 / 503 / 502** with `{ ok:false, error_code, retryable,
  retry_after_seconds?, message }` — never 200+empty. The genuine empty-but-
  successful read (provider 200, zero fields, NO error) is unchanged (still 200,
  per the P0-502 contract).
- **Retry** (`lib/ocr/retryProvider.ts`): bounded (max ~3) exponential backoff +
  jitter, honors Retry-After, retries ONLY transient classes, caps total wait.
- **UI** (`TranslateWizard`): a typed/non-ok provider error shows
  "recognition temporarily unavailable — try again shortly" with a Retry button
  and does NOT advance as a successful read.
- **Smoke** (`.github/workflows`): the deployment smoke no longer POSTs a real
  document to the paid provider — it does a **contract check** (healthz + a
  malformed request that returns the typed 400 before any provider call). A
  separate hourly **`ocr-availability-probe.yml`** does the one minimal paid probe
  and treats a transient typed error as expected (no false alarm).

## Recommended follow-ups (owner)

- Move the Vision SA to a **billing-enabled standard Cloud project** to raise the
  per-minute quota (removes the 429s at the source).
- **Delete / rotate** the invalid `GOOGLE_CLOUD_VISION_API_KEY` (latent cleanup;
  the SA path does not use it).
