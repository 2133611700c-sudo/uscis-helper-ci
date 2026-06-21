# Door Alignment Trace — smart dictionaries across the 4 products

**Date:** 2026-06-03
**HEAD at trace:** `21e90c6` (P2.3 authority committed)
**Status:** documentation checkpoint — NO code change. Verdict: keep `readDocument`
as the canonical door; defer the true single-door cleanup to P5 (owner-gated).

## Question

Three smart dictionaries were wired behind `SMART_NORMALIZE_ENABLED` (default OFF):
- **P2.1 snapCity** (gazetteer city snap)
- **P2.2 patronymic reconcile** (review guard)
- **P2.3 authority resolve** (registry → English issuing authority)

They sit at two different code points ("doors"). Do all three actually reach all
four products (TPS / Translation / Re-Parole / EAD), or only one path?

## The two doors (raw call-graph)

**Door A — per-field `toCanonicalValue`** (`docintel/transliterationPolicy.ts`).
snapCity is reached here via the `place_city` branch → `dictionaryBridge.normalizeCity`.
Callers of `toCanonicalValue`:
- `docintel/documentFieldReader.ts:63` (inside `readDocument`)
- `tps/ai/geminiVisionArbiter.ts:51` (`visionReadsToFields`, TPS booklet)
- (`normalizeCity` is additionally reachable via `dictionaryBridge.normalize()` ← `tps/centralBrain.ts:152`)

**Door B — document-level post-passes** (`docintel/documentFieldReader.ts`).
patronymic (P2.2) and authority (P2.3) run here, after the field loop, only when
`SMART_NORMALIZE_ENABLED==='1'`:
```
resolveAuthorityFields(reconcilePatronymicFields(fields))
```
Reached ONLY from `readDocument`. Document-level (not per-field) because each needs
the full field set and must preserve a `review_required` signal that the bare-string
`toCanonicalValue` drops.

## Key fact: `readDocument` runs BOTH doors in sequence

`readDocument` calls `toCanonicalValue` per field (Door A), then the post-passes
(Door B). So on the `readDocument` path, **all three dictionaries fire together**.

`readDocument` is called by all 4 product routes, each behind its own flag:

| Product | call site | flag (code default OFF) | PROD value (owner-verified 2026-06-03) | coverage |
|---|---|---|---|---|
| TPS | `tps/ocr/extract/route.ts:266` | `ONE_CORE_TPS_ENABLED==='1'` | **ON (=1)** | only docs mapping to passport/booklet (else `skipped_no_mapping`) |
| Translation | `translation/vision-extract/route.ts:217,263` | `ONE_BRAIN_CORE_ENABLED==='1'` | **ON (=1)** | all pages |
| Re-Parole | `reparole/ocr/extract/route.ts:188` | `ONE_CORE_REPAROLE_ENABLED==='true'` | **ON (=true)** | passport/booklet; i94/ead/dl fall back to `/api/tps` |
| EAD | `ead/ocr/extract/route.ts:170` | `ONE_CORE_EAD_ENABLED==='true'` | **ON (=true)** | — |

**Verdict:** the divergence is NOT per-product. It is per-PATH. On the
`readDocument` (canonical) path, all 4 products run both doors → all three
dictionaries apply. `readDocument` is the canonical door.

## Exceptions (where the doors do NOT both apply)

1. **TPS legacy booklet arbiter** — `geminiVisionArbiter.visionReadsToFields`
   (flag `TPS_GEMINI_VISION_ARBITER_ENABLED`). Runs Door A (snapCity) but NOT the
   Door-B post-passes. Impact: patronymic = zero delta (this path hardcodes
   `review_required:true` on every field, `geminiVisionArbiter.ts:60`); authority =
   loses the value resolution (РАЦС→English) but review is already forced. Legacy,
   flag-off.
2. **centralBrain side-path** — `dictionaryBridge.normalize()` ← `tps/centralBrain.ts:152`
   (flag `CENTRAL_BRAIN_TRANSLATION`). Reaches snapCity via `normalizeCity` but not
   the Door-B post-passes (and authority uses the old `normalizeIssuedBy`, not the
   new `resolveAuthority`). centralBrain is on the "do-not-touch / retire" list.
3. **Re-Parole fallback classes** — i94/ead/dl are not Core-covered; the route
   falls back to `/api/tps/ocr/extract`. Those classes never reach `readDocument`
   here regardless of door.

## Production reality (CORRECTED 2026-06-03 — owner pulled prod env from Vercel)

**The Core flags are ON in production**, owner-verified directly from Vercel:
`ONE_CORE_TPS_ENABLED=1`, `ONE_BRAIN_CORE_ENABLED=1`, `ONE_CORE_REPAROLE_ENABLED=true`,
`ONE_CORE_EAD_ENABLED=true`. So the live brain `readDocument → arbitrateDocument`
**is running for real clients NOW** on all 4 products (for the doc classes each
route maps to Core).

`SMART_NORMALIZE_ENABLED` is **ABSENT (OFF)** in prod. So the P2.1/P2.2/P2.3
dictionary branches are the ONLY part that is dark — the live path itself runs,
but inside it: `normalizeCity` runs without the snapCity sub-branch, and
`documentFieldReader` runs without the patronymic + authority post-passes.

> Earlier versions of this report (and the Session-104 STATUS) claimed "all Core
> flags OFF / zero prod effect" — that was WRONG (read a local `.env`, not prod).
> Corrected here.

The remaining One-Brain debt (Session 103: per-class Core-bypass, legacy arbiter,
centralBrain side-path) is unchanged — but it sits ALONGSIDE a live Core, not
instead of one.

## Architecture recommendation

- **Now:** keep `readDocument` as the single canonical door. Document the verdict
  and the three exceptions (this file). Do NOT add a parallel post-pass to the
  legacy arbiter — that would duplicate the logic, the opposite of one door.
- **P5 (owner-gated migration, NOT now):** retire `visionReadsToFields` so the TPS
  booklet also flows through `readDocument`; remove the duplicate authority maps in
  `militaryId.ts`/`birthCertificate.ts`; retire the centralBrain side-path; close
  the Session-103 Core-bypass. Then the door is literally one.
- **Gate:** P5 is a behavioral migration. With a dirty working tree (in-flight
  Gemini/Vision), no owner-filled ground truth, and flags OFF, it is premature.
  Deferred until those are resolved and the owner approves.
