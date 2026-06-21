# Anti-Fabrication / Hard-Case Forced-Review Gate — DESIGN ONLY

**Date:** 2026-06-04  **Type:** design, NO code change, NO prod env, flag default OFF.

> **IMPLEMENTED (minimal class gate) — 2026-06-04:** the baseline (Option 1, class gate)
> is now wired behind `ANTI_FABRICATION_GATE_ENABLED` (default OFF) at insertion point A
> (`documentFieldReader`). New `docintel/antiFabricationGate.ts` forces review on
> identity-critical fields for hard-case classes (never changes values, never lowers a
> flag), with reasons `hard_case_document` / `model_instability_risk` /
> `no_strong_identity_anchor`. Non-hard-case (passports) untouched → MRZ fields not
> blanket-forced. Two-read self-consistency (Option 2) and blur/rotation signals are NOT
> implemented yet (separate, costed steps). Tests: `antiFabricationGate.test.ts` (pure +
> readDocument OFF/ON gating + 4-route coverage). typecheck PASS.

## Goal

Stop the system from TRUSTING identity fields on hard-case documents where a
multimodal model can fabricate a plausible-but-wrong person and self-report
`review_required=false`. CONFIRMED failure (this session, raw): `gemini-2.5-flash`
on `birth_cert_soviet` produced 2 distinct identities across 3 runs, all identity
fields `review_required=false`.

## Known (raw, file:line)

- `apps/web/src/lib/canonical/core/documentClassPolicy.ts`:
  - hard-case classes `birth_certificate_handwritten` (:40), `birth_certificate_soviet_bilingual` (:51), `marriage_apostille`, `unknown_document`. The soviet class note already records "review_required=false while returning the wrong person — most dangerous failure mode".
  - `isHardCase()` :147, `isAutoFillAllowed()` :151, `applyCertificateRoleGuard()` :167, `applyHardCaseReviewOverride()` :209 (explicitly distrusts model `review_required=false`), `checkImageQuality()` :234 (SIZE-based only), `docintelIdToDocumentClass()` :98 (conservative: `ua_birth_certificate → birth_certificate_handwritten`).
- Wired in 2 routes: `tps/ocr/extract/route.ts` (:63-65, :189-194, :1038-1064) and `translation/vision-extract/route.ts` (:46-49, :117-143, :297-314).
- The shared door `readDocument` (`documentFieldReader.ts`) is called by ALL 4 routes (TPS :266, Translation :217/:263, Re-Parole :188, EAD :170 — from `DOOR_ALIGNMENT_TRACE.md`).

```
hard_case_classifier_exists: PARTIAL (exists + wired in 2/4 routes, NOT in readDocument)
signals_available:
  - doc_type:        YES  (docTypeId → getDocTypeSpec)
  - doc_class_policy: YES (documentClassPolicy.ts)
  - image_quality:   PARTIAL (checkImageQuality — SIZE bytes only; no blur/contrast)
  - rotation:        NO as a hard-case trigger (preprocess auto-rotates but emits no "was-rotated/low-q" class signal)
  - MRZ:             YES for passport (canonical/core/mrzAuthority)
  - source_anchor:   YES (DocTypeSpec.vision_anchor)
missing_signals:
  - self-consistency / multi-read identity-hash detector (does NOT exist)
  - real image-quality (blur/contrast/resolution) hard-case trigger
  - identity-field-level forced-review (current override is a single top-level flag)
  - coverage in Re-Parole + EAD routes (0 calls — CONFIRMED by grep absence)
```

## Not confirmed / UNKNOWN

- Whether `birth_cert_soviet`'s true identity is X — UNKNOWN (no verified GT).
- Whether `gemini-3.5-flash` is globally safe — UNKNOWN (N=1; stability ≠ proof).
- Whether rotation/low-quality reliably triggers a hard-case class today — NOT_CONFIRMED.

## Force-review insertion point — options

| Option | Pros | Cons | 4-product coverage | dup risk | legacy-miss risk | "one brain" |
|---|---|---|---|---|---|---|
| A `documentFieldReader` after readDocument | one place; all 4 routes call it; field-level access; carries review into every adapter | touches the shared reader | **ALL 4** | low | legacy TPS booklet arbiter (`visionReadsToFields`) bypasses readDocument | **closest** |
| B `arbitrateDocument` | central arbiter | not all live paths arbitrate uniformly (Session-103); Translation/TPS Core paths differ | partial | low | high | medium |
| C DocTypeSpec/registry | declarative | static; can't see runtime reads/instability | n/a | low | high | low |
| D product adapters | per-product tuning | 4× duplication = today's gap (Re-Parole/EAD missing) | only where added | **high** | high | far |
| E route layer (current) | already there for 2 | duplicated per route; Re-Parole/EAD NOT covered | **2/4 today** | high | high | far |

```
recommended_insertion_point: A — documentFieldReader (the shared door), after fields are built
why: it is the single point all 4 product routes already call; fixes the current
     Re-Parole/EAD coverage gap in ONE place; has field-level access to force review on
     identity fields and attach reasons; aligns with the "one live brain" model.
     (Legacy TPS booklet arbiter visionReadsToFields bypasses readDocument and is flag-gated
      legacy — note it as a known residual, retire in P5.)
rollback_flag: ANTI_FABRICATION_GATE_ENABLED (default OFF)
```

## Self-consistency / fabrication detector — options

| Option | API cost | catches | misses | where to apply |
|---|---|---|---|---|
| 1 single read + class-based forced review | 1× | hard-case by class (uses existing policy) | instability on non-classified docs; consistent-but-wrong | baseline, everywhere (cheap) |
| 2 two reads same model, compare identity hash | 2× | nondeterminism / hallucination instability (EXACTLY the confirmed failure) | consistent-but-wrong (same wrong answer twice) | hard-case identity only (cost) |
| 3 two different models, compare identity hash | 2× + complexity | model-specific bias; stronger disagreement signal | Gemini×Gemini not truly independent | hard-case identity when budget allows |
| 4 MRZ / stronger-source verification | ~0 when present | authoritative identity (passport) | N/A where no MRZ (birth certs) | passports / docs with a strong anchor |

```
self_consistency_options: 1 (baseline) + 2 (hard-case identity) + 4 (MRZ precedence); 3 optional
recommended_policy:
  - Baseline: Option 1 — class gate ALWAYS (already exists; just consolidate + cover all 4).
  - Hard-case identity with NO strong anchor: Option 2 — 2× same-model read, compare identity
    hash; on disagreement → hard_case_model_instability=true + force review on ALL identity fields.
  - Passports/strong-anchor: Option 4 — MRZ controls; do NOT blanket-force MRZ-controlled fields.
  - Birth certificates have NO MRZ → default to class gate (+ optional Option 2).
  Note: same-model self-consistency is NOT an independent source; agreement ≠ correctness.
  But DISAGREEMENT is a strong instability signal (proven this session).
```

## Honest scope

- `gemini-3.5-flash` stable on N=1 = **risk signal, NOT proof**.
- **Do NOT** change the global production default model on N=1.
- A hard-case forced-review gate is **required regardless of model**.
- Model self-reported `review_required=false` on hard-case identity = **NOT trusted** (this is already the documented policy at documentClassPolicy.ts:204-209).

## Proposed flag

`ANTI_FABRICATION_GATE_ENABLED` (default OFF). When ON, in the shared door:
- hard-case identity fields → `review_required=true` with reason ∈ {`hard_case_document`, `model_instability_risk`, `no_strong_identity_anchor`}.
- if identity hashes disagree across repeated/model reads → `hard_case_model_instability=true` + force review on ALL identity fields.
- **only raises review** — NO value changes, NO invention, NO normalization.

Identity-critical fields: `family_name`, `given_name`, `patronymic`/`middle_name`,
`date_of_birth`, `place_of_birth`, `issuing_authority` (when identity/origin-relevant);
plus role-grounded variants (`child_*`, `spouse*_*`).

Strong anchors (suppress blanket force on the anchored fields): valid MRZ (passport),
I-94 (admission), EAD/I-797 (A-number/category), human-verified GT / user review.
Birth certificates have no MRZ → default hard-case identity review.

## Test plan (no implementation)

- flag OFF → behavior byte-identical to current.
- flag ON + `birth_cert_soviet` → identity fields `review_required=true`.
- flag ON + `birth_cert_handwritten` → identity fields `review_required=true`.
- passport with valid MRZ → MRZ-controlled fields NOT blanket-forced.
- values unchanged; reasons/provenance added.
- same-model repeated reads with identity mismatch → `hard_case_model_instability` + all identity review.
- model `review_required=false` cannot override the hard-case force.
- coverage proof: the gate fires for all 4 products (TPS/Translation/Re-Parole/EAD) from the one insertion point.

## Bottlenecks

- Option 2 doubles API cost on hard-case docs (acceptable: hard-case is the minority + safety-critical).
- No verified hard-case GT → can prove SAFETY (forced review) but NOT accuracy.
- Legacy TPS booklet arbiter bypasses readDocument (residual; P5).
- Real image-quality (blur/rotation) signal absent → hard-case currently keyed on doc-class, not visual degradation.

## Risks

| Risk | Control |
|---|---|
| Over-review (everything → review) | gate scoped to hard-case classes + identity fields; clean printed docs unaffected |
| Trusting model review=false | documented + enforced: not trusted on hard-case |
| Re-Parole/EAD stay uncovered | insertion point A (shared door) covers all 4 |
| N=1 model conclusions | gate is model-independent; no default change |
| Same-model agreement read as proof | only DISAGREEMENT used as signal; agreement ≠ correct |

## Next action

Owner approves the design + flag, then implementation (separate, code step) wires the
gate at insertion point A behind `ANTI_FABRICATION_GATE_ENABLED` (default OFF). Until
then: SMART_NORMALIZE OFF, P2.4/P2.5 frozen, model default unchanged, no prod env.

---

# Revision 2 (2026-06-04) — Owner fabrication-scope reconnaissance update

New owner-verified facts (treat as inputs; true identity still UNKNOWN — stability not accuracy):

- **handwritten_birth:** gemini-2.5-flash → 3 distinct identity hashes / 3 runs; gemini-3.5-flash → **3 distinct / 3 runs too**. `confidence_low=false` / model `review=false` on all. ⇒ switching to 3.5-flash does NOT fix handwritten fabrication.
- **marriage_1939 (old but PRINTED):** gemini-2.5-flash → 1 identity hash / 3 runs (stable). ⇒ "old/faded" ≠ unstable. The killer signal is **handwriting / handwritten zones**, not age.
- **confidence_low / model self-reported `review_required` is NOT a detector** — cannot build safety on model confidence.
- **passport not measured this run** (connection crash) — claim nothing new about passport; the existing rule stands: valid MRZ = strong anchor.

## Raw signal reconnaissance (file:line)

1. **Document class** — `documentClassPolicy.ts:98` `docintelIdToDocumentClass(docTypeId)` (by docTypeId only; no runtime handwriting/quality detection at class level).
2. **Handwritten signal** — EXISTS per-field: `DocFieldSpec.handwritten` (`docintel/types.ts`); `readDocument` ALREADY forces review on `handwritten:true` fields (`documentFieldReader.ts:75`, helper :107). **BUT** every birth/marriage cert field is `handwritten: false` in the registry (`documentRegistry.ts:8-17`, `:29-34`) → the docs that actually fabricate are NOT flagged handwritten. No doc-level handwritten flag on `DocTypeSpec`.
3. **Image quality / rotation** — a REAL runtime signal EXISTS in `preprocessImage` (`lib/ocr/image-preprocess.ts`): `quality.blurScore` (Laplacian stdev), `warnings[]`, codes `too_blurry`/`too_dark`/…, EXIF auto-rotate (:85). **BUT it is NOT threaded into `readDocument`** (the reader gets only the buffer — `grep`: NONE). So blur/rotation cannot trigger the gate today without wiring that signal in.
4/5. **Insertion point** — remains `documentFieldReader` (the one door all 4 routes call). CONFIRMED still best. Caveat: to trigger on real handwriting/blur (not just doc-class), the gate needs either (a) corrected per-field `handwritten` flags for birth/marriage, and/or (b) `preprocessImage.quality` passed into `readDocument`.

## Revised design (supersedes the blanket "all hard-case" trigger)

**A. Trigger logic (revised):**
- PRIMARY trigger = **handwritten document / handwritten zones / intrinsically-handwritten class** (`birth_certificate_handwritten`, `birth_certificate_soviet_bilingual`). NOT blanket "all hard-case".
- Old/faded/Soviet **printed** docs (e.g. `marriage_apostille`, marriage_1939) are RISK signals but **not enough alone** for forced review — escalate only on low-quality/ambiguity (blur signal) OR detected instability.
- Birth/marriage without MRZ still warrant caution, but **stable printed docs must not be punished blindly**.

**B. Mechanism:**
1. Handwritten trigger → force `review_required=true` on identity-critical fields; values unchanged; reasons `handwritten_document` / `model_instability_risk` / `no_strong_identity_anchor`.
2. Optional self-consistency (handwritten / ambiguous only): run same model N=2–3, compare identity tuple hash (`family_name+given_name+patronymic+date_of_birth+place_of_birth`); disagreement → `hard_case_model_instability=true` + force review on ALL identity fields. Same-model agreement ≠ proof; disagreement = proof of instability.
3. Model policy: do NOT switch global default to 3.5-flash (it ALSO fabricated on handwritten_birth, 3/3). Gate is model-independent; default model change is not a solution.
4. Confidence policy: model `review=false`/`confidence_low=false` cannot override the gate; on handwritten zones model confidence is advisory and untrusted.
5. Strong anchors: valid MRZ anchors passport MRZ-controlled fields; I-94 anchors admission only; EAD/I-797 anchors A-number/category only; birth/marriage certs have NO MRZ → no strong machine anchor.

**C. Discrepancy with the shipped minimal gate (`4f75bfa`):** the implemented `applyAntiFabricationGate` triggers on ALL `isHardCase` classes — which INCLUDES `marriage_apostille` (printed) and `unknown_document`. Per this revision that is TOO BROAD (printed marriage should not be blanket-forced). **Required narrowing (future code step):** restrict the blanket force to the handwritten classes; route printed-but-old classes through the low-quality/self-consistency path instead. Flag stays default OFF, so no prod effect in the interim.

**D/E/F.** No code this revision. No prod env. SMART_NORMALIZE OFF. P2.4/P2.5 frozen. Not pushed.

---

# Revision 3 (2026-06-04) — shipped gate NARROWED to handwritten risk (code)

Raw signal inventory (file:line) drove the trigger choice:
- `handwritten:true` exists in the registry ONLY for `ua_internal_passport_booklet` fields
  (`documentRegistry.ts:25-30`); birth/marriage/divorce/id-card fields are all
  `handwritten:false` (31 occurrences). ⇒ a `handwritten:true`-based trigger would fire on
  the booklet and MISS the birth certs that actually fabricate. `handwritten_signal_exists: PARTIAL`.
- A real quality signal exists — `PreprocessResult.quality.blurScore` + `warnings[]` + EXIF
  auto-rotate (`lib/ocr/image-preprocess.ts:36-50,85`) — but `readDocument(buffer, mime, docTypeId, opts)`
  does NOT receive it (`grep`: none). `quality_reaches_documentFieldReader: NO`,
  `rotation_reaches: NO`, `usable_now_for_gate: NO` (would need threading the signal in — new wiring).

**Selected trigger: option A — explicit class allowlist** `HANDWRITTEN_FABRICATION_RISK_CLASSES`
= {`birth_certificate_handwritten`, `birth_certificate_soviet_bilingual`}. Replaced the blanket
`isHardCase(docClass)` trigger. Now:
- FORCES review on `birth_certificate_handwritten` (and soviet_bilingual if a mapping emits it).
- Does NOT force `marriage_apostille` (printed — stable in testing), `unknown_document`,
  `internal_passport_booklet`, `military_id`.
- Reasons renamed `hard_case_document → handwritten_document`.

**Honest gaps (TODO, not silently included):**
- `military_id` has handwritten zones in reality but is not in the docintel registry (TPS-legacy)
  and `military_id` class is `always_review:false` → not gated here. Recorded, not auto-included.
- Truly-handwritten marriage / blur / rotation cannot be detected at the reader today (no signal
  reaches `readDocument`). Closing this needs either corrected per-field `handwritten` flags or
  threading `preprocessImage.quality` into `readDocument` (separate code step).
- `birth_certificate_soviet_bilingual` is in the allowlist but no current `docTypeId` maps to it
  (`ua_birth_certificate → birth_certificate_handwritten`); kept for forward-compatibility.

`ANTI_FABRICATION_GATE_ENABLED` stays default OFF. No prod env. Model default unchanged.
Tests: `antiFabricationGate.test.ts` updated (scope: marriage/unknown NOT forced; allowlist
membership; reasons=handwritten_document). docintel 49 pass; typecheck PASS.
