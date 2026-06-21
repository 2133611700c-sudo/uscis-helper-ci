# GT Pipeline Bench — Findings (2026-06-10)

Live measurement of the production brain (`/api/translation/vision-extract`,
gemini-3.1-pro-preview) on the owner's real Cyrillic documents vs owner-verified
ground truth. Runner: `apps/web/scripts/gt-pipeline-bench.mjs` (re-runnable).
Sanitized scorecard: `GT_PIPELINE_BENCH_2026-06-10.md`. Raw values: gitignored
`qa-private/`. Sample = 1 doc/class ⇒ **EXPLORATORY ONLY** (per exit criteria).

## Core-goal read: does the brain read Cyrillic reliably?

- **Printed / structured (military booklet): YES.** 4/4 readable identity fields
  exact in BOTH Cyrillic and KMU-55 Latin. All review-flagged (safe).
- **Handwritten (internal-passport booklet): PARTIAL.** Surname + given name + DOB
  read correctly; the model did NOT return patronymic at all. All returned fields
  review-flagged.
- **Handwritten + Soviet-bilingual (birth certificates): UNRELIABLE — as expected.**
  Both: surname Cyrillic correct; given name + patronymic Cyrillic misread; DOB wrong.
  **Every field was review-flagged → no silent bad output.** Identical failure pattern
  on both danger classes. Matches the standing finding: no model is safe on these ⇒
  always-review is mandatory (the safety stack held on both).

Conclusion: the architecture is sound — printed Cyrillic is production-reliable;
handwritten is caught by the always-review gate, not released silently.

## Real issues surfaced (prioritized)

### A. Images > ~4 MB get HTTP 413 at the edge, before the brain  [USER-FACING]
The owner's real photos are 4.1–7.1 MB. The first run returned `Request Entity Too
Large` (Vercel serverless body cap ~4.5 MB) on the 7.1 MB and 4.8 MB files — the
read never happened. Real users with large phone photos hit the same wall with a
cryptic error.
→ **Action:** confirm the wizard downscales client-side before upload; if not, add
a client resize (longest edge ~2400px, JPEG q≈75 brought 7.1MB→1.5MB here with no
accuracy loss). [verify, then fix]

### B. `ua_birth_certificate` registry `handwritten: false` flag is cosmetic-misleading — but the class IS protected  [CORRECTED 2026-06-10]
Correction to the initial read: the protection does NOT depend on the spec flag.
`docintelIdToDocumentClass('ua_birth_certificate')` → `birth_certificate_handwritten`,
which is `always_review: true` (so is `birth_certificate_soviet_bilingual`). The
translation route applies `applyHardCaseReviewOverride` **unconditionally** for UA
identity docs + `applyCertificateRoleGuard` (wrong-person role grounding). The bench
confirmed: every field on BOTH birth certs came back review-flagged. The policy layer
is already unit-tested (`documentClassPolicy.test.ts`: isHardCase, override, mapping).
→ **Residual (not urgent):** the spec's `handwritten: false` is misleading and the
force-review is route-level (translation), not at the shared `readDocument` door — so
other products don't auto-inherit it. Birth certs aren't consumed by TPS/reparole/ead
today, so no live exposure. Owner may still want the spec flag corrected for clarity.

### C. `sex` is not extractable for booklet / birth / military  [SPEC GAP]
GT verifies `sex`, but no `sex` field exists in those registry specs, so the
pipeline never returns it. Minor (sex is often captured elsewhere in the products)
but the GT can never score it today.
→ **Action:** decide whether `sex` belongs in these specs.

### D. Pro misses patronymic on the handwritten booklet  [MODEL, inherent]
The model returned 4 fields (no patronymic) for the booklet. Patronymic handwritten
is the hardest token; the answer is the review gate, not a code fix. Tracked, not a bug.

## What this unblocks

This is the measurement keystone. Coverage now spans 4 of the 5 core UA identity
classes: internal-passport booklet (hw), birth cert (hw), birth cert (Soviet
bilingual), military (printed). **Gap:** the international-passport GT file is
status `MISSING` (no verified fields, no paired fixture) — it cannot be benched until
the owner fills it; this is the printed+MRZ class we'd expect to score highest, so
it's worth completing.

To move from EXPLORATORY to a canary-grade verdict (≥30 docs/class), the binding gap
is **GT documents from different real people** (a single owner's docs cannot detect
wrong-person fabrication). That is an owner-sourcing decision (see
GT_BENCHMARK_EXIT_CRITERIA).
