# Recognition Phase Gates — Checklist

**Date:** 2026-06-05. A phase may not start until the prior gate is PASS (or the owner waives it in writing).
Each gate lists the evidence required. No gate is "passed" without raw evidence. See `AGENT_OPERATING_CONTRACT.md`.

## Gate 0 — Monitoring stable (current)
- [ ] PR #87 monitoring merged · PR #89 Gemini-first merged · PASS_RUNTIME_VERIFIED reached.
- [ ] 24–48h: no 5xx / error / fatal spike (healthz ok; `vercel logs --since 24h`).
- [ ] document_class_metric still emitting on real traffic.
- [ ] no review / payment / PDF-block complaints; no false-positive-review storm on printed birth certs.
- [ ] self-consistency latency/cost acceptable (N=2 on hard-case only).
- **If not stable:** rollback `SELF_CONSISTENCY_GATE_ENABLED` first (keep ANTI_FAB), owner-confirmed.
- **Exit:** stable → owner says "start D0"; delete the temp monitor workflow.

## Gate 1 — D0 quality / reshoot
- [ ] behind a flag default OFF; flag OFF = byte-identical prod.
- [ ] reuses existing `sharp`/preprocess where possible.
- [ ] quality signals: rotation, blur, crop/document-bounds, contrast, orientation, document visibility.
- [ ] verdict ∈ {ACCEPT, DEGRADED_REVIEW, RESHOOT_REQUIRED}; blur NEVER used as a fabrication signal.
- [ ] UI reshoot copy simple for an 80-year-old.
- [ ] tests: clean→accept; rotated→corrected; cropped→reshoot; blurred→reshoot; low-contrast→reshoot.
- [ ] no PII fixtures.

## Gate 2 — ReaderResult interface
- [ ] `ReaderResult` formalized; Gemini maps onto it losslessly.
- [ ] readDocument output behavior UNCHANGED (snapshot test).
- [ ] second reader = provider-agnostic DISABLED slot (NOT GPT-4o/Claude/HTR-specific, no wiring).
- [ ] Gemini-first preserved.

## Gate 3 — OneBrain shadow-only
- [ ] `ONEBRAIN_DECIDE_FIELD_ENABLED` default OFF.
- [ ] flag ON → live output IDENTICAL; only a sanitized shadow decision-comparison is written (no PII).
- [ ] thresholds remain PLACEHOLDER (no calibration on N≈1 person).
- [ ] comparison report produced.

## Gate 4 — D2 / D3 / D4
- [ ] D2: dictionary = signal only; exact→normalize, fuzzy→suggestion+review (no silent snap); apostrophe preserved.
- [ ] D3: names/dates/numbers LOCKED before prose translation; translator touches prose only.
- [ ] D4: validators block on future DOB, issue<DOB, bad doc-number, missing critical, unresolved review.

## Gate 5 — Auditor / correction loop
- [ ] correction events recorded {field_before, field_after, reason, document_class, reader_id}.
- [ ] provenance attached; NO PII in public logs; GT-candidate pipeline writes to a gitignored store.

## Gate 6 — Future HTR / second provider research (deferred)
- [ ] **Gemini top-version benchmark done FIRST** — a non-Gemini provider is only discussed if Gemini's best
  versions are benchmarked and demonstrably insufficient, OR a clear business need is proven.
- [ ] GT from DIFFERENT people exists.
- [ ] cost / privacy(egress/DPA) / latency plan written.
- [ ] owner business approval.
- [ ] no automatic fan-out; research/benchmark only; Gemini-first until ROI proven.
