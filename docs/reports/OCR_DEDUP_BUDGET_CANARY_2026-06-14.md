# OCR dedup + budget-shadow production canary — 2026-06-14

Owner-authorized production canary of the OCR cost-layer flags `OCR_DEDUP_ENABLED=1`
+ `OCR_BUDGET_MODE=shadow` + `OCR_BUDGET_DAILY_USD=50` (NO enforce, NO cache). Executed
per the owner's 12-step protocol. **Result: safety PASSED, dedup gave ZERO measured
serverless benefit, rolled back to the proven-OFF baseline.**

## Step 1 — code verified BEFORE the flip
- All 5 paid OCR sites (google-vision, docai, geminiVisionProvider, deepseek, field-mapper)
  pass `meta.gateway` → dedup reachable when `OCR_DEDUP_ENABLED=1`.
- In-flight single-flight (`_inFlight` Map) is cleared in a `finally` AFTER both success
  and failure (`ocrGateway.ts:431`).
- Budget shadow records+logs only; only `enforce` throws → shadow NEVER blocks.
- Cache stays OFF (no store/codec wired at call sites) → the dedup flag changes only
  in-flight collapse, never the response.
- **GAP FOUND + FIXED first (PR #147, main ac3923e):** the dedup/cache key bound only a
  coarse `prompt_version` constant, not the actual prompt. Added `requestSha` (sha256 of
  the real request) to the key: gemini=sha256(prompt), vision=sha256(features+hints),
  docai=sha256(mimeType); field-mapper+deepseek already bind the full prompt. Two
  same-image calls with different prompts can no longer collapse.

## Steps 2–4 — flags + new deployment
- Rollback record (Step 3): all of OCR_DEDUP_ENABLED / OCR_BUDGET_MODE / OCR_BUDGET_DAILY_USD
  / OCR_CACHE_MODE / OCR_CACHE_ENC_KEY were **ABSENT** in prod → rollback = remove the vars.
- Set the 3 flags in prod env; created a NEW production deployment (`1f53ut4jp`, code ac3923e
  + flags) aliased to messenginfo.com.

## Steps 5–7 — canary (synthetic, PII-free)
Two distinct ~480KB noise PNGs (no PII). 5 concurrent identical (A) + 1 sequential
different-hash (B), captured via live `vercel logs` stream.

| Check | Result |
|---|---|
| **ERROR_PATH_PARITY** (5 concurrent identical → distinct bodies) | **PROVEN** — 1 byte-identical body, all `429 OCR_RATE_LIMITED` |
| **SUCCESS_RESPONSE_PARITY** | **UNPROVEN** — no successful (200) provider response was observed (Vision 429 throttle); only the error envelope was compared. Do NOT claim success parity. |
| **CROSS_INSTANCE_DEDUP** | **FAILED** — 0 collapses (see finding); in-flight Map is per-instance |
| HTTP/error mapping vs baseline | unchanged — honest 429 degradation preserved |
| 5xx / crash / memory growth | **0** |
| `budget_blocked` events | **0** (shadow never blocks) |
| `ocr_provider_call` events | 5 captured (orient ok / main read 429) |
| `deduped` (collapse) events | **0** |
| distinct cache keys (orient vs vision, same image) | **distinct** — confirms `requestSha` fix: different prompts → different keys, no wrong collapse |
| cross-request contamination | none (no 5xx, no mixed content) — but note: only error-path observed |
| PII in logs | none (cost events are allow-listed: route/provider/model/cost/key_sha only) |

> **Honest evidence correction:** an earlier draft labelled this `response_parity=PASS`.
> That was wrong — only the **error path** (429) was compared. The successful-OCR
> response path was never exercised (Vision is rate-limited), so the correct split is
> `ERROR_PATH_PARITY=PROVEN`, `SUCCESS_RESPONSE_PARITY=UNPROVEN`,
> `CROSS_INSTANCE_DEDUP=FAILED`. Success parity is proven for the codec math via a
> recorded synthetic fixture (PROVEN_LOCAL_RECORDED_FIXTURE), NOT via a live provider 200.

## Key finding — in-flight dedup does NOT relieve a serverless burst
0 dedup collapses were observed for 5 truly-concurrent identical requests. Root cause:
the `_inFlight` Map is **module-level → per lambda instance**. Vercel fans a concurrent
burst across multiple instances, so the requests never overlap in a single process and the
single-flight never fires. In-flight dedup only collapses calls that overlap **within one
warm instance** (e.g. a request's internal retries, or sequential identical uploads on a
hot instance) — proven by unit tests in-process, but defeated by serverless concurrency
for a burst.

**Implication:** `OCR_DEDUP_ENABLED=1` is SAFE (zero regression) but does **not** mitigate
the Vision 429. The real cross-instance/temporal lever is the persistent **OCR cache**
(`OCR_CACHE_MODE`, still OFF — needs the separate `OCR_CACHE_ENC_KEY` + codec verification,
steps 9-11) and/or raising the provider quota off the free-tier project.

## Step 8 — rollback (executed)
Removed all 3 env vars → redeployed (`g5tbbw969`, code ac3923e, flags absent) → verified:
healthz `ok`; OFF-baseline vision-extract returns the identical honest 429; page routes 307
with a browser UA (the `403` seen with curl is the pre-existing bot-UA blocker, not a
regression). **Prod is back on the proven-OFF baseline.**

## Decision
Rolled back because the canary showed **zero regression but zero measured serverless
benefit** from in-flight dedup — consistent with the prior field-safety-canary doctrine of
returning to the proven-safe baseline when there is no validating benefit. The hardened
`requestSha` key (PR #147) stays in code (correctness improvement, flag-independent).

**Next (separate work):** the OCR cache (cross-instance) is the actual 429 lever —
generate a dedicated `OCR_CACHE_ENC_KEY` (32 random bytes, never echoed), verify codec
encode→decode parity / schema version / integrity / wrong-key fail-closed / error-not-cached,
then enable `OCR_CACHE_MODE=shadow` for PII-free parity before any enforce.
