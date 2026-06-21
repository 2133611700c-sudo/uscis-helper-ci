# Route Inventory — mock / legacy / payment-bypass / review-bypass audit
**Date:** 2026-05-29 · **Branch:** fix/review-gate-hard-block · **Mode:** read-only audit (Prompt 8)

Zero-trust route inventory of every endpoint that can emit a document (PDF/ZIP),
take payment, or produce a certified translation. Claims verified by reading route
code (file:line), not filenames.

## Document-generating / payment / review routes

| Path | Pub/Priv | Product | Real OCR | Mock data | Pay req | Pay verified server-side | Review/human gate | Emits PDF/ZIP | Risk |
|---|---|---|---|---|---|---|---|---|---|
| POST /api/translation/render | private | Translation | yes | no | yes | **yes** (Stripe cs_* or owner) | **yes** (Gate0 manual-review + Gate3 critical-fields confirmed) | PDF | LOW |
| POST /api/translation/generate-pdf | private | Translation | yes | no | yes | **yes** (Stripe cs_*) | **yes (NEW: review-gate hard block, this PR)** | PDF | MED→LOW |
| POST /api/translation/certify | private | Translation | n/a | no | no | n/a | yes (critical fields confirmed) | no | LOW |
| POST /api/translation/process (legacy v0) | private | Translation | n/a | partial | no | n/a | no | PDF via generateFullPacket | **MED** |
| POST /api/tps/generate-packet | private | TPS UA | yes | no | yes | **yes** (Stripe cs_* + service==tps-ukraine) | no (format firewall only) | ZIP | **MED** |
| POST /api/ead/generate-packet | **public** | EAD | yes (pdf-lib) | no | **no** | n/a | no | PDF (I-765) | **MED** (by policy) |
| POST /api/reparole/generate-packet | private | Re-Parole | yes | no | no (upstream) | n/a | no | ZIP (I-131) | LOW |
| POST /api/tps/ocr/shape-debug | private (secret) | TPS UA | yes | no | no | n/a | no | no (diag dump) | **MED** (PII if secret leaks) |
| POST /api/stripe/webhook | public (HMAC) | Payment | n/a | no | n/a | **yes** (signature) | n/a | no | LOW |

## Findings
- **payment_bypass_routes:** NONE. All paid endpoints verify Stripe server-side; `ead/generate-packet` is intentionally free (service-page policy).
- **review_bypass_routes (before this PR):** `translation/generate-pdf` (payment-only) — **closed in this PR**. `tps/generate-packet` and `ead/generate-packet` have no human-review gate **by design** (self-help drafts; user is sole validator).
- **mock_routes:** only `/[locale]/services/translate-document/lab` — clearly labelled "Mock AI / Synthetic Data Only", not wired to payment/cert.
- **legacy:** `/api/translation/process` (v0 order flow) has no current payment gate — recommend deprecation.
- **owner bypass:** render / generate-pdf / tps-packet allow owner free access — server-validated, HMAC-signed cookie, audited. Not a public bypass.

## Recommended next fixes (NOT implemented — audit only)
1. Deprecate `/api/translation/process` (unclear payment lineage).
2. `tps/generate-packet`: add explicit `X-Service-Type: self-help-draft` + idempotency key (double-bill guard).
3. Rotate `TPS_DEBUG_SECRET`; log shape-debug calls to a separate audit stream.
4. Rate-limit spike detection on all document-generation routes.

**Risk summary:** HIGH none · MED tps-packet (no review, by design), ead-packet (public free, by design), shape-debug (PII if secret leaks), translation/process (legacy) · LOW all others incl. render (hardened).
