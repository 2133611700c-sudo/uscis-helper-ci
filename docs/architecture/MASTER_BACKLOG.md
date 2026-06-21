# Messenginfo — MASTER BACKLOG (consolidated, 2026-05-29)

Single list of everything NOT done across all threads. Branch `feat/central-brain`; main = prod `0878e5e` (untouched); NOTHING deployed.

## P0 — makes the system actually work on the site (currently lib-only)
- [ ] Wire `central-brain/analyze` into `/api/translation/vision-extract` behind flag `CENTRAL_BRAIN_TRANSLATION` (default off). Prod has only Gemini → need a 2nd independent reader (Google Vision/DocAI or Gemini-pro) for consensus; build `googleVisionReader` in engine/models. Then preview-deploy for owner live test.
- [ ] `/api/central-brain/{analyze,merge,review,generate}` routes (health route = done this commit).
- [ ] D5 Review UI: field + source crop, uncertain→empty, one-tap fix (30–80yo). Not built in app.

## P1 — recognition quality / honesty
- [ ] D0 preprocessing in app: deskew, auto-rotate, crop-to-document, contrast (only ad-hoc scripts now). Pushes Transkribus printed toward CER 4.57%.
- [ ] Handwriting reality: NO engine auto-reads faded handwritten Soviet docs (proven). Path = human-assist (crop+type) OR custom Transkribus model training (months + labeled data). Build the assist UI; collect ground truth.
- [ ] Transkribus prod: refresh-token (short TTL), endpoint not for prod yet.
- [ ] Ground-truth JSON per fixture for real accuracy scoring (now by eye).
- [ ] Engine docTypes: split names per official form (groom/bride surname/given/patronymic) — engine still combined.

## P1 — official forms layer (Phase 3/4)
- [x] source-ledger (8 groups/15 types) ; marriage schema + renderer.
- [ ] Schemas: birth (this commit), divorce, death, name-change, internal-id-card, internal-booklet-legacy, foreign-passport, driver-license, military-id, tax-card, education(×4), pension.
- [ ] Renderers per schema (only marriage now).
- [ ] Confirm visual-blank vs description for booklet/military/DL/tax/education/pension (some = official_description_not_visual_blank).

## P1 — central brain migration (Phase 5)
- [x] Translation (full), Re-Parole (intake), EAD (intake+category) — lib level + 45/45 tests.
- [ ] Re-Parole/EAD generation still legacy — wire generation through brain.
- [ ] TPS Step 5: wrap existing TPS brain into common wrapper, behavior-preserving (riskiest — last).
- [ ] D7 Auditor: one shared evidence ledger (provenance/rejected/corrections/readback) for all products. Not built.

## P2 — docs/process
- [ ] Phase 6 department docs D0–D8 (mission/inputs/outputs/forbidden/tests).
- [ ] Phase 7 product E2E + browser/PDF/audit proof per product.
- [ ] Commit/merge feat/central-brain → main + deploy (owner decision).

## Older audit items (owner-decided, tracked)
- Free Gemini key on public endpoint = PII risk during real-client use (owner: keep during testing; swap to paid/gate before real clients).
- PII purged from HEAD (commit 24b1813); git history rewrite NOT done (owner declined; private repo).
