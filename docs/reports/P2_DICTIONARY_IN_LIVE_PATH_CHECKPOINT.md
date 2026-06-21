# P2 — Dictionaries in the Live Path: Architecture Checkpoint

**Date:** 2026-06-03
**HEAD:** `21e90c6` (P2.3 authority committed)
**Type:** documentation checkpoint — NO code change.

## Goal

Build ONE live brain, in this exact order:

```
document
  → readDocument (single reader / Core)
  → field normalization + dictionaries (INSIDE the live path)
  → document-level validation (review_required, not guessing)
  → arbitrateDocument
  → product adapters (TPS / Translation / Re-Parole / EAD)
  → human review
  → only then PDF / packet
```

The dictionaries must live INSIDE the live path — never in the dead
`orchestrator` / `consensus` cluster. No per-product brains. No silent
correction. Any doubtful normalization → `review_required`.

## Known (verified by raw command output)

- **P2.1 snapCity** — city/place normalization. Wired into
  `dictionaryBridge.normalizeCity`, reached on the live path via
  `transliterationPolicy.toCanonicalValue` (`place_city`). Exact match → normalize
  (no review); fuzzy/unknown → raw kept + `review_required=true` + `suggested_value`
  (NO silent correction). Flag `SMART_NORMALIZE_ENABLED`.
- **P2.2 patronymic** — VALIDATION / review guard ONLY, **NOT reconstruction**.
  `docintel/patronymicReconcile.ts` post-pass: sex inferred from the patronymic
  suffix; well-formed kept; malformed/undeterminable → `review_required=true`,
  value preserved. Does NOT regenerate from a sibling name (the holder's given name
  is not the father's, and there is no `sex` field — regenerating would fabricate).
- **P2.3 authority** — registry/glossary resolver. `dictionaryBridge.resolveAuthority`
  + `docintel/authorityResolve.ts` post-pass over `kind:'agency'`: civil-registry
  terms (РАЦС/ЗАГС/ДРАЦС) then authority registry (МВС/міліція→Militsiya). Carries
  the registry `review_required` verbatim (ЗАГС/міліція → review); never lowers a
  flag; no match → passthrough (keeps the transliteration — no silent downgrade).
- All three fire ONLY when `SMART_NORMALIZE_ENABLED === '1'`. **Flag default OFF.**
- Tests (this checkpoint): `dictionaryBridge.snapCity` 4/4, `patronymicReconcile`
  8/8, `authorityResolve` 13/13 → 25/25. `typecheck` PASS. `YAML_OK`.

## Not confirmed (honest gaps)

- **No accuracy claim.** No live document was run; no owner-filled ground truth →
  the OFF-vs-ON per-field delta is unmeasured. Liveness/typecheck/tests only.
- Owner ground-truth templates exist (`docs/templates/ground-truth/`) but are
  blank (`OWNER_QUEUE.md`).

## Production reality (owner-verified from Vercel, 2026-06-03)

- **Core flags are ON in prod:** `ONE_CORE_TPS_ENABLED=1`, `ONE_BRAIN_CORE_ENABLED=1`,
  `ONE_CORE_REPAROLE_ENABLED=true`, `ONE_CORE_EAD_ENABLED=true`. The live brain
  `readDocument → arbitrateDocument` is serving real clients on all 4 products NOW.
- **`SMART_NORMALIZE_ENABLED` is ABSENT (OFF)** in prod → the three P2 dictionary
  branches are dark, but the live path runs without them.
- Raw gating proof — all three hang ONLY on `SMART_NORMALIZE_ENABLED`, nothing else:
  - snapCity: `dictionaryBridge.ts:106` `if (process.env.SMART_NORMALIZE_ENABLED === '1' && cleaned)` (the only env var in that file)
  - patronymic + authority post-passes: `documentFieldReader.ts:87` `process.env.SMART_NORMALIZE_ENABLED === '1'` (the only env var; `patronymicReconcile.ts` / `authorityResolve.ts` read no env themselves)
- (Earlier text here claimed Core flags OFF — that was wrong, corrected.)

## If SMART_NORMALIZE_ENABLED=1 were set in prod tomorrow (Core already ON)

It would activate, on LIVE clients, across all 4 products (for the doc classes each
Core path reads):
- **snapCity** — fires inside `normalizeCity` for `place_city` fields → touches
  city/place-of-birth values (e.g. birth-cert place). Exact gazetteer match →
  normalized; fuzzy/unknown → raw kept + `review_required` + suggestion.
- **patronymic** — fires the validation post-pass on `middle_name`/`child_patronymic`
  → can RAISE `review_required` on malformed reads; never silently changes a value.
- **authority** — fires on `kind:'agency'` (`issuing_authority` on birth/marriage/
  divorce certs) → РАЦС/ЗАГС/ДРАЦС/міліція resolved to English + carries the
  registry review flag.

This is a REAL behavioral change to client-facing extracted fields — not a no-op.

## Gate (hard)

**Enabling `SMART_NORMALIZE_ENABLED` in production is FORBIDDEN until owner-filled
ground truth exists and the OFF-vs-ON per-field accuracy delta is measured.** No
accuracy claim may be made before then. Owner-only action; agents must not set it.

## Decision

P2.1–P2.3 stand as committed. `readDocument` is the canonical door. Do not bolt a
parallel post-pass onto the legacy arbiter (that duplicates logic = the opposite of
one door). True single-door consolidation is deferred to P5 (owner-gated migration).

## Door model

- **Door A — per-field normalization:** `dictionaryBridge` ←
  `transliterationPolicy.toCanonicalValue`. Carries snapCity (and the existing
  name/place/oblast/date normalizers).
- **Door B — document-level post-passes:** `docintel/documentFieldReader.ts`
  (after the field loop, behind the flag). Carries patronymic (P2.2) + authority
  (P2.3) — placed here because they need the full field set and must preserve a
  `review_required` signal that the bare-string `toCanonicalValue` drops.
- **On the `readDocument` path, Door A then Door B run in sequence** → all 3
  dictionaries apply for all 4 products' Core paths. The divergence is per-PATH,
  not per-product. Full call-graph: `docs/reports/DOOR_ALIGNMENT_TRACE.md`.

### Exceptions (where both doors do NOT both apply)

1. **Legacy TPS booklet arbiter** — `geminiVisionArbiter.visionReadsToFields`
   (flag `TPS_GEMINI_VISION_ARBITER_ENABLED`): Door A only. Over-reviews every
   field, so patronymic = 0 delta; only authority value-resolution is absent.
2. **centralBrain side-path** — `dictionaryBridge.normalize()` ←
   `tps/centralBrain.ts:152` (flag `CENTRAL_BRAIN_TRANSLATION`): snapCity only;
   on the do-not-touch / retire list.
3. **Re-Parole fallback classes** — i94/ead/dl fall back to `/api/tps`; never reach
   `readDocument` here.

## Steps (done this checkpoint)

1. Ran YAML / typecheck / 3 targeted test files — all green (raw output in session).
2. Wrote this report + `DOOR_ALIGNMENT_TRACE.md` (prior checkpoint).
3. Updated STATUS / HANDOFF / CHANGELOG.
4. Docs-only commit (`--no-gpg-sign`). No code, no push.

## Bottlenecks

- Owner ground-truth is the gate for any accuracy proof (and therefore for turning
  `SMART_NORMALIZE_ENABLED` ON anywhere).
- Dirty working tree: in-flight Gemini/Vision changes (`gemini/model.ts`,
  `visionCredentials.ts` ADC, `vision-extract/route.ts`, `presence.ts`,
  `geminiVisionProvider.ts`) must be triaged/landed/reverted before the next brick.
- True single-door requires retiring the legacy arbiter + centralBrain side-path
  (P5 migration), which is behavioral and owner-gated.

## Risks

| Risk | Control |
|---|---|
| Continue bricks (P2.4/P2.5) on a dirty base | FROZEN until tree clean + GT |
| Start P5 too early | docs checkpoint only; P5 = owner-gated |
| Dictionaries "partially in the brain" | door model written down here |
| P2.2 mistaken for reconstruction | flagged VALIDATION ONLY |
| Accuracy claimed without ground truth | forbidden; liveness only |
| Legacy exceptions forgotten | listed explicitly above |

## Next action

STOP. Not P2.4/P2.5 (frozen). Not P5 (premature). The next move before P2.4 is to
resolve the dirty working tree (in-flight Gemini/Vision) and obtain owner-filled
ground truth — owner decision.
