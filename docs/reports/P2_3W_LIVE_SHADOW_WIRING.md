# P2.3-wiring — Live ONE_BRAIN_SHADOW in the TPS route (observe-only)

**Status:** DONE
**Branch:** `feat/canonical-shadow-wiring`
**Scope:** the first LIVE wiring of the canonical core — flag-gated (default OFF), try/catch-guarded, observe-only logging in the TPS OCR route. No output change.

---

## 1. Why

The canonical brain (P2.1–P2.2) and the parity instrument (P2.3) were unwired. To justify migration we need **real-traffic numbers**: on actual uploads, how would the canonical review policy differ from the live brain? This wires that measurement into the TPS extract route — behind a default-OFF flag — so turning it on in an environment collects the signal without touching any user-visible behavior.

## 2. What changed

- New pure helper `apps/web/src/lib/canonical/liveShadow.ts` → `summarizeTpsReviewShift(fields, meta)`: builds the canonical from the SAME live `TpsExtractedField[]` and returns a **PII-free** one-line summary — field count, `requiresReview`, and the review *shift* (`+review[keys]` the canonical would add, `-review[keys]` it would drop). Because the adapter never lowers a module flag, `-review` is structurally always 0; `+review` is the real signal (where the stricter policy — critical fields, disagreement, no-silent-correction, low confidence — adds review).
- `apps/web/src/app/api/tps/ocr/extract/route.ts`: just before the main success return, a block guarded by `if (mergedModule && isShadowEnabled())` **and** wrapped in `try/catch` logs `[ONE_BRAIN_SHADOW] <summary>`. It can never throw into the response and never runs unless the flag is on.

## 3. Safety properties (tested)

Source-level guard `apps/web/src/app/api/tps/ocr/__tests__/shadowWiring.test.ts` (3/3): the call is gated behind `isShadowEnabled()`; it is inside `try { … } catch`; it appears exactly once (no bare/unconditional call). Helper unit test `liveShadow.test.ts` (4/4): surfaces `+review` for a critical field the live brain missed; `-review` always 0; confident low field adds none; PII-free (keys yes, values no).

```
liveShadow.test.ts + shadowWiring.test.ts   7 passed (7)
Full web suite                              2320 passed | 4 skipped (2324)
tsc --noEmit                                0 errors
content guards                              0 violations
```

## 4. Production-impact status

**None by default.** `ONE_BRAIN_SHADOW` is unset → the block never runs → extraction is byte-for-byte unchanged. With the flag on, the only effect is an extra `console.info` line per TPS extraction (no output, no extra provider call, no latency beyond a pure in-memory map). The try/catch guarantees a shadow bug cannot break extraction.

## 5. How to use

Set `ONE_BRAIN_SHADOW=1` in a non-prod (or canary) environment, run real documents through TPS, and read the `[ONE_BRAIN_SHADOW]` lines: a high `+review` rate on critical fields tells us the canonical brain is stricter (expected and desired); the keys show exactly which fields. Collect this before deciding migration.

## 6. Remaining (Phase 2–3)

- Cross-stack shadow (TPS image also run through the Translation reader, both → canonical, `diffCanonical`) — costs an extra AI call, owner-gated.
- A parity threshold + per-product migration behind the flag → consolidation (remove the second brain) → evidence-ledger table + hash chain.
