# USCIS PDF AUDIT — Agent 4 (distrust-everything)

Base: worktree at main HEAD `02eb595` (= verified prod sha via `GET https://messenginfo.com/api/healthz` → `"sha":"02eb595"`).
Scope: I-821, I-131, I-765 field mapping + readback evidence level. Read-only.

## Verdict per form (status vocabulary)

| Form | Edition | Template SHA-256 (prefix) | Mapper | Readback | Status |
|------|---------|----------------------------|--------|----------|--------|
| I-821 | 01/20/25 | `44efaa06…` | `lib/tps/forms/i821FieldMap.ts` | render+pdf-lib+placement | **PROVEN_LOCAL** |
| I-131 | 01/20/25 | `86f832d4…` | `lib/reparole/i131FieldMap.ts` | render+pdf-lib | **PROVEN_LOCAL** |
| I-765 | 08/21/25 | `52759f49…` | `lib/ead/i765FieldMap.ts` + `canonical/forms/i765DocumentMapper.ts` | harness render+pdf-lib | **PROVEN_LOCAL** |

## Re-verified evidence (NOT accepting "3/3 PASS")

**The genuine proof is real and predates the claim.** The 3 field-by-field tests
render the actual edition-locked PDF through the **production** `buildPacket`
code path and read every AcroForm field back with `pdf-lib`, including
**physical-placement** assertions (value lands in the printed-question cell, not
just a plausibly-named field) and anti-fabrication assertions (signature/other-DOB/
country-name cells must be EMPTY, never stale).

Independently RE-RUN locally (this audit):
- `i821FieldByField.test.ts` → **15 passed**.
- Full trio (`i821` + `i131` + `i765` harness) → **3 files / 46 tests passed** (12.0s).

Provenance: all three tests were added in **PR #116** (commit `1d2bf41`, "Phase 2B"),
NOT in PR #128.

## ROOT CAUSE — the "3/3 readback PASS" (#128) claim is unbacked

PR #128 ("real-doc benchmark (0 fabricated) + I-821/I-131/I-765 PDF readback proof")
merge commit `840a069` changed **only 4 files**: `CHANGELOG.md`, `HANDOFF.md`,
`STATUS.md`, and one `artifacts/v1/PRINTED_CYRILLIC_AND_IMAGE_QUALITY/benchmark.json`.
**No test, no fixture, no rendered PDF, no visual diff was added.** The string
`"pdf_readback_proof": {"i821":"PASS","i131":"PASS","i765":"PASS"}` is a
**hand-authored JSON literal**, not executable evidence. The benchmark file itself
admits the recognition set is "not yet wired into a runnable gate."

So the PDF safety is real (**PROVEN_LOCAL**, owed to #116), but PR #128's specific
"proof" is **UNVERIFIED / self-declared** — a documentation artifact masquerading
as a test result. Classify the *claim* as CODE_ONLY-with-no-code (a JSON write).

## Evidence-level gaps (true even for the real #116 tests)
- **Synthetic input only** — no real applicant document drives the readback; OCR
  read-quality is NOT exercised by these tests (a known recurring blind spot per
  project MEMORY: "synthetic PNG verify doesn't catch read-quality").
- **No human visual verification** — placement is asserted via widget rectangles/
  bbox labels captured during authoring, not a rendered-image diff. A label-shift
  in a future template re-import would still need re-authoring of the ground truth.
- **Long-text clipping** not explicitly tested.
- I-821 A-number with prefix/dashes is (correctly) rejected by pdf-lib → field
  comes out BLANK; the test asserts this. Operationally this means a malformed
  A-number silently blanks rather than erroring — acceptable (no fabrication) but
  worth an explicit UI surface.

## Risk
- P1: none confirmed in mapping (readback is genuinely green locally).
- P3: PR #128 "3/3 PASS" doc claim is unbacked → docs-drift / false-confidence.
  Anyone trusting STATUS/CHANGELOG would believe a benchmark gate exists; it does not.
