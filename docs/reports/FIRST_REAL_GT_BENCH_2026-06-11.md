# First REAL ground-truth bench — 2026-06-11 (REVISED with provenance separation)

> REVISION (same day): a methodology critique flagged mixed truth in the GT (some fields
> owner-verified, some agent-labeled → circular risk). VERIFIED against the data and fixed:
> every GT field now carries `field_provenance`; benches report GOLD and AGENT-PROPOSED
> separately. This file replaces the earlier mixed-number version.

## Provenance verification result (the critique, checked)
- **Bench-1 (3 docs, 12 critical fields): ALL 12 fields were OWNER-VERIFIED** via the
  owner's parallel-key GT in qa-private (status VERIFIED_BY_OWNER) → the headline number
  was NOT circular.
- **Full-spec bench (9 fields): 6 GOLD + 3 AGENT-PROPOSED** (father, mother, act number —
  the owner had never filled those) → those 3 are preview-only.

## Numbers (separated, honestly framed)

### GOLD (owner-verified fields only)
| Bench | Gold fields | Match | Caught by review | Silent-wrong |
|---|---|---|---|---|
| Bench-1 (booklet-spec bc + military + passport) | 12 | 11 | 1 (handwritten DOB) | **0** |
| Full-spec birth cert | 6 | 4 | 2 (DOB, issuing authority) | **0** |

### AGENT-PROPOSED (preview only — pending owner eyeball, NOT gold)
| Field | Match vs agent read | Note |
|---|---|---|
| father_full_name | ✓ | corroborated by child patronymic consistency |
| mother_full_name | ✓ | |
| act_record_number | ✗ | **caveat below** |

## Statistical honesty
11/12 → 95% CI ≈ **[62%, 100%]** (Clopper-Pearson). The accuracy number is statistically
UNINFORMATIVE at N=3. What IS informative at this N:
- **silent-wrong = 0 on every gold field, before AND after the registry fix** — the
  fail-closed architecture held on real documents. This is the primary metric.
- The known hard-case (handwritten DOB) was caught by the review gate, as designed.

## The act_record_number "silent-wrong" — honest caveat
The mismatch was scored against an AGENT-PROPOSED value (the agent's visual read of the
hand-written act number). If the agent's read is wrong and the model's right, the VALUE
was not wrong — **but the structural finding stands either way**: a hand-filled
doc-number field reached `review_required=false` at high confidence, and doc_number/agency
kinds are outside the anti-fabrication identity allowlist. The fix (handwritten:true on
all certificate fields → always review) is correct under any truth, and the post-fix
re-bench confirmed every field is now review-gated. OWNER ACTION: eyeball the act number
(plus father/mother) and flip their provenance to owner_verified.

## Boundary conditions (do not extrapolate past these)
- Measured with safety guards in SHADOW mode (`CONFIRMED_VALUE_GUARD_MODE` unset ⇒ shadow;
  `OCR_FIELD_SAFETY_ENABLED` OFF). The bench exercised read + arbitration + review-path —
  NOT the enforce path. False-positive enforcement rate is unmeasured.
- N=3 documents, 1 person's documents — no claim about cross-writer generalization.
- Verdict: **INSUFFICIENT_N** (N<30/class). Rollout decisions still require the L2 gate.

## Process changes locked in
1. Every GT field carries `field_provenance: owner_verified | agent_proposed_pending_owner_review`.
2. Benches score ONLY owner_verified as gold; agent-proposed reported separately as preview.
3. Agent-proposed fields queue for owner review before the next run.

## PII handling
GT values local/gitignored only (verified); /tmp working copies deleted after every run;
this report carries counts and statuses only.

## Per-document numbers (mentor request, 2026-06-11; gold-only, full-spec)

| Document | Spec | GOLD match | Caught by review | NOT_READ (fail-closed) | Silent-wrong |
|---|---|---|---|---|---|
| birth certificate (handwritten) | ua_birth_certificate | 4/6 | dob, issuing_authority | — | **0** (post-fix; was 1 pre-fix) |
| military booklet | ua_military_id | **5/5** — incl doc_number, the same kind-vector as the act# finding (already protected by handwritten:true) | — (all matched, all review-gated) | — | **0** |
| internal passport | ua_internal_passport_booklet | **3/3** | — | patronymic, city_of_birth (skipped, not fabricated) | **0** |

Every scored field on every document is review-gated. No new silent-wrong found on docs 2-3 — the kind↔protection audit (marriage/divorce same-vector fix, machine-printed classes verified correct) holds.
