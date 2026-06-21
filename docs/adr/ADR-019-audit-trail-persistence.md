# ADR-019 — Audit-Trail Persistence for Certified Translations

Date: 2026-06-10
Status: PROPOSED (design only — NO Supabase code until owner approves data/retention/PII)
Related: ADR-017 (C3 final writer), ADR-007 (signature rules), CRITICAL_FIELDS_CONTRACT, C3_USER_CORRECTION_CONTRACT

## Context

We deliver self-certified English translations the user signs and files with
USCIS. USCIS requires a certification of completeness and accuracy for foreign
documents (USCIS Policy Manual, certified-translation requirement). If a filing is
ever questioned, we currently cannot prove **what the machine read, what the human
changed, and what went into the signed PDF** — the `CanonicalDocumentResult` with
provenance lives only in request memory and dies when the response returns.

This is a legal-evidence gap, not cosmetics. It is P0 in importance but its
implementation is gated on owner decisions about data retention and PII.

## Decision (proposed)

Persist a **minimal, provenance-focused, retention-bounded** audit record per
certified-PDF generation. One row per signed translation.

### What to store (proposed minimum)

- session id, timestamp (UTC), doc class, deploy SHA
- per critical field: `read_value_hash`, `final_value_hash`, source (machine/user-corrected), review_required, C3 decision + reason codes, provenance/rule id
- gate outcomes: pre-payment check, payment status, reviewGate, confirmed-value guard, OCR_FIELD_SAFETY (if on)
- signature method + signedAt + certification text version
- payment: Stripe session id (not card data), amount, service

### PII tiers — [OWNER DECISION]

- **Tier 0 (default, safe to ship):** hashes + reason codes + flags only. No names, no values. Proves the *process* ran and *which* fields were machine vs human, without storing personal data.
- **Tier 1 (needs owner + legal):** store actual final values (the certified output) for dispute defense. This is PII; requires retention policy, user consent language, access control, deletion path (we already have a `/delete-confirmed` flow — integrate).

> **WARNING — Tier 0 is NOT sufficient for a USCIS subpoena / audit response.**
> A hash proves an event occurred; it does NOT prove WHAT was delivered to the
> client. For certified-translation dispute defense you need the actual output.
> Tier 0 covers operational/fraud-detection only. Do not choose Tier 0 believing
> it satisfies legal evidence — it does not.
>
> Independent note (breach liability): Tier 1 storing field values makes us a
> holder of immigration PII and a breach target with deletion obligations. A
> lower-liability alternative to evaluate: store the **generated PDF itself**
> (the thing actually delivered) in encrypted cold storage + its hash, rather
> than per-field values. The PDF is the evidence; the user already has a copy.
> Owner/legal to weigh evidence-need vs breach-liability.

Default to Tier 0 now. Tier 1 only on explicit owner+legal approval.

### Retention — [OWNER DECISION]

Proposed: Tier 0 = 24 months; Tier 1 = align with USCIS filing relevance + user
deletion rights. Owner to set.

### Where

Supabase (existing `extracted_fields` / certification tables are the natural home;
a new `certification_audit` table is cleaner). NO migration written until the
PII tier + retention are approved.

## Consequences

- Enables dispute defense and the C3 manual-override path (override needs an audit event).
- Tier 0 is low-risk and high-value; recommend shipping it first.
- Must integrate with the existing deletion flow so audit records honor user deletion (Tier 1 especially).

## Explicitly NOT in this ADR

- No Supabase migration or persistence code (owner gate).
- No change to prod env, payment, or model config.
- Vision bbox/crop evidence is a SEPARATE concern → future ADR-020 (research already
  gathered: bbox infra is ~80% present — word bboxes extracted, stored in
  `extracted_fields.combined_bbox`, rendered in EvidenceReviewPage; ADR-020 will
  formalize threading bbox onto `CanonicalField.evidence` and Vision health/credential
  inventory — SA primary, `GOOGLE_CLOUD_VISION_API_KEY` = broken-fallback, do NOT delete).

## [OWNER DECISIONS] summary

1. PII tier (0 = hashes only, recommended now / 1 = store values, needs legal).
2. Retention windows per tier.
3. New `certification_audit` table vs extend existing — approve before migration.
