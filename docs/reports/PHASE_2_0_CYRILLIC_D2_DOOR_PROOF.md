# Phase 2.0 — Cyrillic D2 Door Proof (2026-06-09)

Commit: feat(onebrain): preserve raw Cyrillic through knowledge decisions
Branch: feat/one-brain-gemini-core
Agent: Opus 4.8 / Sonnet 4.6

## Pass conditions — all MET

| Check | Status | Evidence |
|---|---|---|
| raw_cyrillic flows ExtractedDocField → FieldCandidate → CanonicalField | ✅ PASS | Test suite: "GAP A: rawCyrillic threaded through pipeline" (5 tests) |
| D2 KnowledgeDecision runs on raw_cyrillic, not only Latin | ✅ PASS | Test suite: "GAP B: D2 receives Cyrillic via applyKnowledge" (4 tests) |
| Late Latin-only arbitration-level duplicate retired (now uses rawCyrillic) | ✅ PASS | `applyKnowledge()` uses `f.rawCyrillic ?? f.normalizedValue ?? f.rawValue` |
| OFF behavior proven identical | ✅ PASS | Test suite: "OFF behavior" (2 tests); full suite 2961/4 = no regressions |
| ON behavior proven on tests | ✅ PASS | Test suite: "ON behavior: D2 receives rawCyrillic" (3 tests) |
| Bug A (ISO date false review) FIXED | ✅ PASS | Test suite: "Bug A fix" (5 tests) |
| Bug B (derived KMU-55 Latin ≠ controlling Latin) FIXED | ✅ PASS | `sourceBasis` ctx field; Test suite: "Bug B fix" (4 tests) |
| Bug C (silent field drop) FIXED | ✅ PASS | `documentFieldReader.ts`: emit review when `!value && r.cyrillic` |
| tsc 0 errors | ✅ PASS | `npx tsc --noEmit -p apps/web/tsconfig.json` → empty output |
| No prod env changes | ✅ PASS | No Vercel flag flips; all changes behind KNOWLEDGE_BRAIN_ENABLED (default OFF) |
| No PII in logs/docs | ✅ PASS | All test values are sanitized synthetic data |
| No prod behavior change | ✅ PASS | KNOWLEDGE_BRAIN_ENABLED absent = old arbitration, byte-identical |

## What changed (code) — surgical only

### `canonical/core/types.ts`
- Added `rawCyrillic?: string` to `FieldCandidate`
- **Why:** GAP A — without this field, the original Cyrillic was dropped before D2

### `canonical/types.ts`
- Added `rawCyrillic?: string | null` to `CanonicalField`
- **Why:** carry Cyrillic through to C3, audit, D5 review UI

### `canonical/core/translationAdapter.ts`
- `docintelToCandidate`: sets `rawCyrillic: f.raw_cyrillic ?? undefined`
- `canonicalToFieldOut`: prefers `f.rawCyrillic` over cyrillicMap (map kept for backward compat)
- **Why:** GAP A fix; cyrillicMap remains redundant (not removed) for safety

### `canonical/core/arbitration.ts`
- `field()` helper: added `rawCyrillic?: string | undefined` parameter; stored in output
- `arbitrateField()`: passes `primary.rawCyrillic` to `field()`
- `applyKnowledge()`: feeds D2 with `f.rawCyrillic ?? f.normalizedValue ?? f.rawValue ?? ''`
- **Why:** GAP A+B fix — D2 now processes original Cyrillic, not derived Latin

### `docintel/documentFieldReader.ts`
- Bug C fix: when `toCanonicalValue()` returns null, check `r.cyrillic`; if non-empty → emit field
  with `value: r.cyrillic`, `review_required: true`, `review_reasons: ['canonical_value_unresolved']`
- **Why:** dates with no iso_date, or other unresolvable fields, were silently dropped

### `canonical/core/knowledgeNormalize.ts`
- Bug A fix: date handler now handles ISO `YYYY-MM-DD` → USCIS `MM/DD/YYYY` without false review;
  also handles already-USCIS `MM/DD/YYYY` as pass-through
- Bug B fix: added `sourceBasis` to `KnowledgeNormalizeCtx`; name `preserve` path sets lower
  evidence (0.6) for `reader_latin`/unknown sources vs MRZ/EAD/I-94 (0.99)
- **Why:** ISO dates from `toCanonicalValue` were triggering false review; KMU-55 derived Latin
  was incorrectly treated as authoritative as MRZ Latin

## Test results

```
Test Files  145 passed | 2 skipped (147)
     Tests  2961 passed | 4 skipped (2965)
  Start at  20:49:05
  Duration  16.75s
```

Before Phase 2.0: 2937 passed. After: 2961 passed (+24 new tests, 0 regressions).

## Architectural state after Phase 2.0

The Cyrillic highway now flows:

```
Gemini reads raw_cyrillic  →  ExtractedDocField.raw_cyrillic  (WAS: only here)
                           →  FieldCandidate.rawCyrillic       (NEW: threaded)
                           →  CanonicalField.rawCyrillic       (NEW: threaded)
                           →  applyKnowledge: inputForD2 = rawCyrillic  (NEW: D2 sees Cyrillic)
                           →  KnowledgeDecision (action/candidate/provenance)
                           →  CanonicalField.normalizedValue (accept/preserve) or review
                           →  C3 (Phase 3: final_value gate)
                           →  PDF / Auditor
```

D2 Cyrillic-dependent rules now FIRE correctly:
- Gazetteer exact/fuzzy snap (was: fed Latin → always fuzzy)
- Russian-spelling-on-UA-doc detection (was: Latin had no Cyrillic → never fired)
- patronymicReconcile on Cyrillic (always worked at Door B, now also at arbitration level)
- normalizeName on Cyrillic surnames/given names

## Remaining gaps (NOT Phase 2.0)

- **GAP C** (flag consolidation): SMART_NORMALIZE_ENABLED at Door A/B is still separate from
  KNOWLEDGE_BRAIN_ENABLED at arbitration. Phase 2.0 makes D2 at arbitration correct; full
  consolidation to ONE flag requires retiring Door A/B use of SMART_NORMALIZE and migrating
  all its logic to the KnowledgeDecision contract at Door A/B level. This is Phase 2.0b.
- **GAP D** (explicit final_value): still Phase 3. `normalizedValue` is still de-facto final;
  C3 (`applyOcrFieldSafety`) runs post-adapter on Latin FieldOut, not on CanonicalField.
- The `issue_date` key name contains `'issu'` which matches the authority handler before
  the date handler. Pre-existing naming collision; does not affect product fields (registry
  uses `date_of_birth` / `date_of_expiry`).
- cyrillicMap in the Translation route is now redundant (canonicalToFieldOut prefers
  rawCyrillic from CanonicalField). Keep until Phase 3 when cyrillicMap can be removed.

## Next actions

1. Commit to feat/one-brain-gemini-core → PR #104 update
2. Phase 2.1a: Translator birth/marriage unbypass (auto:false → Core + hard-case + C3)
3. Phase 2.0b: Gemini-2.0-flash deprecated fallback removal (small, separate)
4. Phase 3: explicit final_value + C3 as single writer
5. Owner GT gate: KNOWLEDGE_BRAIN_ENABLED prod flip FORBIDDEN until GT from different people + OFF/ON delta
