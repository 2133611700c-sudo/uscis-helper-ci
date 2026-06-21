# C3 USER-CORRECTION CONTRACT (P0 design lock)

Date: 2026-06-10
Status: LOCKED v1 (partially code-implemented; override path = owner decision)
Backs: `confirmedValueGuard.ts`, `generate-pdf/route.ts`, ADR-017 §C3.

## Principle (ADR-017)

> "A confirmed field CAN become final — via C3, never by bypassing it."

User correction does NOT write `finalValue` directly. The flow is:

```
user edits on review screen → value posted as release value (normalized_value)
  → server-side guard (validateConfirmedValue) → C3 decision
    → accept  → finalValue = sanitized value
    → block   → 403 (critical) or null+missing (non-critical)
```

The act of **signing the certification IS the confirmation** — there is no
separate "confirmed" event; every released value is, by signature, user-asserted.
The guard therefore runs on **all release values** (it is legal input sanitation,
not an AI-safety experiment — NOT gated behind `OCR_FIELD_SAFETY_ENABLED`).

### Rollout: SHADOW first, then owner-flipped enforce (measurement-first)

This is a NEW blocking behavior on a live payment/PDF route, so it ships
**measurement-first**, via ONE env knob (no flag sprawl):

`CONFIRMED_VALUE_GUARD_MODE = shadow (default) | enforce | off`
- **shadow (default):** validate + log `[confirmed_value_guard] would_block`, do
  NOT block. **Prod output is byte-identical.** This collects the real block-rate
  per field/class before anything is blocked.
- **enforce:** actually block (422 critical / null non-critical). Owner flips to
  this ONLY after reviewing shadow logs and confirming the over-block rate is
  acceptable.
- **off:** emergency kill-switch — no validation, loudly logged as degraded safety.

Rationale: the defect this catches (Cyrillic/garbage in a `review_required=false`
release field) is RARE because release values are Latin post-KMU-55, so the cost
of a shadow window is small while the over-block data it buys is real. Enforcing
blind on a payment path would risk availability/revenue with zero data.

## Deterministic guard rules (implemented)

`validateConfirmedValue(field, value)`:
- empty/whitespace on a critical field → `empty_critical` → block
- any Cyrillic char (`/[Ѐ-ӿ]/`) → `cyrillic_in_release_value` → a Latin-only PDF must never carry Cyrillic
- length > 200 → `too_long`
- control / non-printable chars → `invalid_chars`
- date-named field not MM/DD/YYYY or YYYY-MM-DD → `invalid_date_format`

Disposition:
- **critical field fails** → 403 `{ gate: 'confirmed_value_guard', field: <NAME only>, reason }`. The rejected value is NEVER echoed (PII rule).
- **non-critical fails** → value nulled (renders MISSING), generation continues.
- **pass** → `finalValue` set; planTranslationRows uses finalValue-first.

## What C3 must NOT do to a user correction

- MUST NOT rewrite a user's value via dictionary/gazetteer. A rare-but-correct
  surname or place the user typed is authoritative over D2's suggestion.
- MUST NOT lower a review flag silently.
- MUST NOT accept Cyrillic/script-violating values into an English release field.
- **DeepSeek MUST NEVER write a release/final value** (ADR-018 model matrix).
  It translates prose and structures legacy TPS OCR text only; its claimed
  `final_value` is always deterministically overwritten from `source_value`.
  It never sees user corrections as authority.

## P0-A status: this is P0-A.1 (sanitation), NOT the full C3 re-run

What ships today validates SCRIPT / CONTROL / LENGTH / DATE-FORMAT on release
values — deterministic sanitation. It is honestly **P0-A.1**.

**P0-A.2 (not yet built):** cross-check a user-corrected CRITICAL value against a
CONTROLLING anchor when one exists — MRZ / EAD / I-94 controlling Latin. Example:
a user types DOB `01/01/1985` that passes sanitation but contradicts the MRZ the
machine read; P0-A.1 lets it through, P0-A.2 would force review.

IMPORTANT scoping correction: P0-A.2 is NOT "run the full D2/gazetteer pipeline on
the corrected value" — that would re-introduce the forbidden dictionary-overwrites-user
behavior above. It is strictly an ANCHOR cross-check (controlling-Latin sources),
never a normalization re-run.

## [OWNER DECISION] manual override path (NOT yet implemented)

A value that is *possible but unprovable* (passes script/format checks but the
system cannot corroborate it) should reach `manual_override_required`, not silent
accept. The override is allowed ONLY with:
- explicit user confirmation,
- a reason code,
- an audit event (see ADR-019),
- no script violation in the final English field,
- no empty critical field,
- the PDF marking the value as **user-confirmed, not machine-read**.

This requires the audit-trail (ADR-019) and a UI affordance. Owner to approve the
override policy and whether the PDF must visually distinguish user-confirmed values.
