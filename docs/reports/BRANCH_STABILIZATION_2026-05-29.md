# Branch Stabilization & Merge-Readiness Audit
**Date:** 2026-05-29 · **Mode:** read-only (Prompt 2)

## Branch graph (all off `main` dc1e134)
```
main (dc1e134)
 └─ feat/c3-presence (46de80a) — 18 commits — PR #26  [common base of the stack]
     ├─ koatuu          (969ddb9) — +1  КАТОТТГ 458 cities — PR #27
     ├─ spike/pdf-readback (2563c94) — +1  ADR-015 (docs+test only)
     └─ official-docs   (70ce1d8) — +5  civil schemas/contracts/mapping/bureau-PDF (flag OFF)
```
koatuu, spike, official-docs are **siblings** branching from feat/c3-presence — NOT stacked on each other.

## Key facts
- `official-docs` does **NOT** contain `settlements.generated.ts` → **no КАТОТТГ cities**. That layer is only on `koatuu`. Confirmed: `git ls-tree official-docs … = 0`, `koatuu = 1`.
- `spike/pdf-readback` is ADR + test only — safe ADR-only merge.
- `official-docs` changes the SIGNED PDF only behind `BUREAU_PDF` flag (default OFF) — no runtime change without the flag.

## Recommended merge order (owner action — requires Preview E2E)
1. **#26 `feat/c3-presence`** → main (the base: presence fix, MRZ, D-GLOSSARY registry, sharp, live E2E).
2. **#27 `koatuu`** → main (after #26 it is main +1; lands the 458-city КАТОТТГ layer).
3. **ADR-015** (`spike/pdf-readback`) — accept as architectural decision (docs/test; no runtime risk).
4. **`official-docs`** → **rebase on main** AFTER 1–3, so it inherits КАТОТТГ; then audit `git diff main...official-docs` (verify BUREAU_PDF default OFF, no runtime change without flag, source statuses, mapping coverage). Keep on branch until birth-cert visual + fixture E2E.

## Conflict / runtime risks
- Low textual conflict (siblings touch mostly disjoint paths). Main risk is **semantic**: official-docs assumes geography that only arrives via #27 — hence rebase-after-#27 is mandatory, not optional.
- This `fix/review-gate-hard-block` branch is **independent of the stack** (off main, touches generate-pdf + new reviewGate.ts) → can merge to main on its own without waiting.
