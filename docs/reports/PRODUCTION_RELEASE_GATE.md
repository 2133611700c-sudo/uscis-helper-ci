# Production Release Gate (G1–G12) — Playbook Prompt 10
**Date:** 2026-05-30 · Owner-facing release checklist. A document type may go
`active` (and `BUREAU_PDF` may be enabled) ONLY when every required gate passes.

## Gates — current status (main / production)

| # | Gate | Status | Evidence |
|---|---|---|---|
| G1 | Source verified (act number + keywords) | 🟢 for КМУ-1025/152/302 · 🔴 military/diploma/pension | `scripts/verify-ukraine-sources.mjs` → `source-verification-report.json` (3 verified, 3 invalid_url) |
| G2 | Schema complete for the pilot document | 🟡 birth full (on `official-docs`, not main) | `birth-certificate.schema.ts` + contract test |
| G3 | Canonical mapping complete | 🟡 birth only (on `official-docs`) | `birthCertificate.mapping.ts` |
| G4 | Review Gate enforced | 🟢 LIVE | `reviewGate.ts` v2 (name+address+2 checkboxes+signature); prod POST→402 |
| G5 | `BUREAU_PDF` default OFF until approval | 🟢 | `process.env.BUREAU_PDF === 'on'`; no default-on |
| G6 | PDF golden readback PASS | 🟢 | `pdf-readback.e2e.test.ts`, `bureauTranslation.golden.test.ts` (official-docs) |
| G7 | Owner visual approval of the signed PDF | 🔴 pending | `birth_certificate.pilot.signed.png` awaits owner |
| G8 | Real fixture E2E PASS | 🟢 birth/passport/military | `pipeline.live.e2e.test.ts` |
| G9 | No mock route linked from pricing/public pages | 🟢 | `ROUTE_INVENTORY_2026-05-29.md` (lab is labelled mock, unlinked) |
| G10 | Payment verification policy documented | 🟢 | route inventory: 3/3 paid routes verify Stripe server-side |
| G11 | No PII in logs/artifacts/git | 🟢 | only `.env.example`; artifacts synthetic; real-docs gitignored |
| G12 | `active_documents_count` matches approved list | 🟢 (0 active) | coverage generator (official-docs): allowlist empty |

## Release rules
- **`active=true` is forbidden** unless G1–G12 all 🟢 for that document AND the
  ReleaseManager (owner) approves.
- The **only** blocker keeping `ua_birth_certificate` from pilot-active is **G7
  (owner visual approval)** + landing `official-docs` (G2/G3/G6 live there).
- Re-run `scripts/verify-ukraine-sources.mjs` and the coverage generator before
  any release decision — statuses are derived from code, not hand-maintained.

## What ships to production today (verified live)
Review-Gate v2, USCIS certifier UX, drawn-signature-in-PDF, attestation audit
trail, no-silent-strip + guard. `BUREAU_PDF` OFF; **0 documents active**.
