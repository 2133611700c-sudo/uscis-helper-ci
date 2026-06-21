# L2 Ground-Truth Fixtures — how to provide them (owner)

The L2 benchmark code is built and tested. It is **blocked only on your ground-truth
fixtures**. This is the one keystone that unblocks: L2 PASS → L0 prod wiring → a measured
false-positive rate → the whole quality chain. ~8–16h of your time; it cannot be delegated.

## Worked examples (copy these shapes)

Three fully-filled SYNTHETIC examples live in
`apps/web/src/lib/canonical/core/benchmark/examples/`:
- `passport_ua_normal.example.json` — a clean baseline (all fields finalize).
- `birth_cert_silent_substitution.example.json` — adversarial: a parent name that must NOT be
  silently rewritten across scripts (`expected: null` = must go to review).
- `birth_cert_cyrillic_in_output.example.json` — adversarial: a Latin-only field with Cyrillic
  left in it must be blocked (`expected: null`).

Each carries `_worked_example` / `_mock_ocr_output` / `_expected_behavior` documentation keys
(the parser ignores `_`-prefixed keys) so you can see the full picture. The L2 runner is
smoke-tested against these end-to-end (`__tests__/l2RunnerSmoke.test.ts`).

## What a fixture is

One JSON file per **real document** = its ground truth (what the translation SHOULD say).
Format (see the synthetic example `apps/web/src/lib/canonical/core/benchmark/examples/birth_certificate.example.json`):

```json
{
  "docId": "birth-07",
  "documentClass": "birth_certificate_handwritten",
  "fields": [
    { "field": "child_family_name", "expected": "Ivanenko", "critical": true },
    { "field": "dob", "expected": "1990-05-14", "critical": true },
    { "field": "issuing_authority", "expected": null, "critical": true }
  ]
}
```

- `expected: "value"` — the correct final value for that field.
- `expected: null` — the field **must NOT be finalized** (illegible / wrong-person / not present).
  If the reader finalizes it anyway, that is a **silent substitution** and fails the class — this is the
  single most important case to label honestly.
- `documentClass` — one of: `internal_passport_booklet`, `military_id`,
  `birth_certificate_handwritten`, `birth_certificate_soviet_bilingual`, `marriage_apostille`.

## How many

Tier-1 decision benchmark = **≥ 30 docs per class**, from **≥ 5 different people** (so it isn't one
person's handwriting). Target classes first: the ones you actually process most.

## ADVERSARIAL cases are MANDATORY (owner rule)

A benchmark of only clean, legible documents measures *"works on easy"* — it verifies **zero safety
invariants**. Each class MUST include **≥ 3 of these 6 adversarial categories** (synthetic example:
`examples/adversarial.example.json`). Each maps to an `expected` the verdict can check:

| # | Category | GT label expectation |
|---|---|---|
| 1 | **Wrong-person** — passport of person A + a birth cert claiming the same person with different names | the cross-document anchor must BLOCK → the conflicting field `expected: null` |
| 2 | **Silent substitution** — Тарас (UA) in the original | `expected: "Taras"` (as-written), NEVER the Russianized form; a wrong script = a wrong |
| 3 | **Illegible critical field** — a DOB/patronymic that truly cannot be read | `expected: null` (must stay review, never a guess) |
| 4 | **Cyrillic-in-output** — a Latin-only critical field whose only value still has Cyrillic | `expected: null` (the guard must block it) |
| 5 | **Soviet bilingual mismatch** — RU and UA versions of one field disagree | `expected:` the as-written value + the other read must NOT force-rewrite it |
| 6 | **Pre-2020 admin unit** — an old place name the gazetteer lacks (Дніпропетровськ, Артемівськ…) | `expected: null` (fallback + review, NOT a silent snap to a similar modern city) |

Without ≥ 3 of these per class, the runner will report "99% accurate" on easy docs and prove nothing about
safety — the same mistake as ML metrics without adversarial testing. The scorer treats a false-finalization
of any `expected: null` field as `critical_wrong` (zero-tolerance), so these cases are what actually exercise
the guards.

## Field provenance is REQUIRED (methodology rule, 2026-06-11)

Every filled GT field must carry a provenance mark:
- `owner_verified` — the owner looked at the physical document and confirmed the value. Only
  these are scored as GOLD by the benchmark.
- `agent_proposed_pending_owner_review` — an agent read it from the image; preview-only until
  the owner flips it. Scoring agent-proposed fields as gold = circular check (the reader vs a
  reader), which silently inflates accuracy.
Record it in `_meta.field_provenance` (see the filled files for the shape).

## Where to put them (PRIVACY — this is real PII)

- Real document **images** + their fixture JSONs go under `test-fixtures/owner/<documentClass>/`.
  That path is **gitignored** (verified) — they are NEVER committed.
- Keep them encrypted at rest (S3+KMS, or an encrypted disk / 1Password for a small set).
- In code/docs/tests/logs only synthetic **Ivanenko** names ever appear (LAW 5).

## How it runs (once fixtures exist)

1. You provide: the document images + the GT JSONs + the Gemini/Vision keys.
2. The runner (`runFixtureBenchmark.ts`) loads the fixtures, runs the live pipeline on each
   image (the injected `predict`), scores each against its GT, and produces a per-class verdict:
   - `INSUFFICIENT_N` if a class has < 30 docs (a number, not a guess),
   - `FAIL` if ANY critical field is finalized wrong (incl. a `null`-expected field finalized),
   - `PASS` only at the locked per-class accuracy (passport ≥99%, military ≥98%, birth/soviet ≥97%).
3. A `PASS` on ≥ 3 classes (fresh, ≤ 7 days) is the permission to enable the L0 canary (Phase 3).

## What is already built (no further code needed to start)

- `groundTruthFixture.ts` — fixture format + validator + scorer (false-finalization → critical_wrong).
- `runFixtureBenchmark.ts` — the runner (predict injected; live wiring is the only owner/keys part).
- `classVerdict.ts` — INSUFFICIENT_N / zero-tolerance / locked thresholds / canary freshness gate.
- All tested with synthetic fixtures. The moment you drop real docs + GT in and supply keys, it runs.
