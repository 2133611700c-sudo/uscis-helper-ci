# ONE BRAIN (Gemini) — phased build plan

Decision: ADR-017. Target: one Gemini brain + deterministic knowledge truth + review gate, shared by ALL products.
Constraints (owner): Gemini = recognition (all keys/models); DeepSeek = retained fully (prose, Mia, crossref); GPT = removed; HTR = parked. Keys/prod = owner-managed; agent builds to preview-ready, owner flips prod.

Rule for every phase: behavior-changing code ships behind a flag (default OFF) → tests → preview proof → owner flips prod. tsc 0 + full suite green every commit. No PII; qa-private untouched.

**BINDING CONTRACT (ADR-017, owner-approved 2026-06-09):** D2 annotates only (never writes `final_value`); **C3 is the single writer of `final_value`** (`accept_final`→`final_value=normalized_value`, else null; a D5 user confirmation re-runs C3); **D6/PDF reads only `final_value`**, a critical `final_value=null` blocks; one criticality taxonomy for D2+C3; adapters must not drop `suggested_value`/`rule_id`/`provenance`/`reason_codes`/`evidence_strength`/`review_required`. **The primary risk is downstream bypass; the defense is `final_value=null until C3/confirmation`.** Phase 2 was unblocked only by recording this in ADR-017.

## Phase 1 — Dictionary IN the brain  (CODE, no prod)
The accuracy fix. Knowledge applied to the FINAL value for ALL products, in one place.
- [x] **1.1** `canonical/core/knowledgeNormalize.ts` — pure deterministic normalizer. **DONE**.
- [x] **1.2** **D2 AUTHORITY CONTRACT (AI-risk control) — DONE.** Redesigned per review: `knowledgeNormalize` returns a DECISION `{action, finalValue, candidateValue, ruleId, reasonCodes, provenance, evidenceStrength}`, never a silent override. `arbitrateDocument(candidates, knowledge?)` applies it: accept/preserve → final; suggest/review/block → keep read value + `suggestedValue` + review (conflict never silently finalized). `isKnowledgeBrainEnabled` (KNOWLEDGE_BRAIN_ENABLED, default OFF). `CanonicalField.knowledgeRule/knowledgeProvenance` added. 12 conflict-case tests; canonical suite 329; full suite 2931; tsc 0. OFF = byte-identical (canonical suite proves it).
- [x] **1.3** **DONE — ONE shared helper, not four forks.** `canonical/core/knowledgeBrain.ts` (`isKnowledgeBrainEnabled` / `buildKnowledgeContext` / `applyKnowledgeBrainIfEnabled`). Wired translation/tps/reparole/ead at the arbitration seam via the helper (1-line diff each, no route-local dictionary logic). OFF deep-equals bare arbitration; ON = conflict→review. 18 helper/normalize tests; full suite 2937/4; tsc 0. Legacy `/api/ocr/extract` + generate-pdf are NOT arbitration seams (no D2 fork added). Proof: docs/reports/KNOWLEDGE_BRAIN_PHASE_1_3_WIRING_PROOF.md.
- [x] **1.4** **DONE — real-doc proof (flag ON) on Soviet + handwritten birth certs, real Gemini gemini-3.1-pro-preview.** Safety holds: every field carries D2 provenance; conflict→review (patronymic.fragment, authority.unknown surface `suggestedValue`); NO silent override; no Cyrillic leaks in accepted finals. **FINDING (the value of 1.4):** D2's Cyrillic-dependent rules (gazetteer city snap, Russian-spelling-on-UA detection, `normalizeName` on Cyrillic) are **bypassed on the live pipeline** — the docintel reader KMU-55-transliterates to Latin BEFORE arbitration (`translationAdapter`: candidate.value = "KMU-55 Latin — what the Core arbitrates"; Cyrillic kept in a separate `cyrillicMap`). So D2 currently sees Latin and mostly emits a conservative review, not its real normalization. Safe, but the accuracy value is not yet delivered. **FieldCandidate has no `rawCyrillic` field.**

## Phase 2 — One pipeline (Core-default / consolidation)  (CODE + owner flip)
- [ ] **2.0** **RECONCILE two dictionary layers into ONE (supersedes "thread rawCyrillic").** Inventory + audits
  (KNOWLEDGE_INVENTORY_AUDIT_SYNTHESIS_2026-06-09.md) found a dictionary-in-path layer ALREADY exists at the RIGHT
  place (raw Cyrillic): `SMART_NORMALIZE_ENABLED` P2.1-P2.3 — Door A `transliterationPolicy.toCanonicalValue`→
  `dictionaryBridge.normalizeCity`→`snapCity`; Door B `documentFieldReader` post-passes `patronymicReconcile`+
  `authorityResolve`. My Phase-1 `knowledgeNormalize` at arbitration is at the WRONG layer (post-KMU-55 Latin) and
  duplicates it. **Action:** keep MY `KnowledgeDecision` contract (action/candidate/provenance/final-gate), apply it
  at Door A/B (raw Cyrillic), fold in the existing P2 primitives, unify to ONE flag, retire the arbitration-level
  duplication. OFF=identical. **Prod enablement of ANY dictionary layer stays FORBIDDEN until owner GT + OFF/ON delta
  (P2 hard gate).**
- [ ] **2.0b** Fix deprecated `gemini-2.0-flash` (HTTP 404) in the `geminiVisionProvider` fallback chain (small).
- [ ] **2.0c** Per-class model selection (2.5-pro DISQUALIFIED for birth certs — wrong person + false confidence;
  flash-image reads correct) — **owner GT-gated**. Dominant failure `wrong_person_selected` is a READER problem,
  defended by always-review policy + model choice + reshoot, NOT by the dictionary.

## Phase 2 — One pipeline (Core-default / consolidation)  (CODE + owner flip)
Kill fragmentation. Make Gemini-Core the default reader, ONE product at a time. Built to the binding contract
(so the Phase-3 `final_value` migration is additive). Each product: OFF=identical, preview-prove reads + PDF,
owner flips. Do NOT do all four at once.
- [ ] **2.1** Translation → Core default (preview-prove read + review + PDF; OFF=identical).
- [ ] **2.1a** **Translator hard-case UNBYPASS (flagship, incident-class fix):** birth/marriage are `auto:false` in
  DOC_TYPES → vision-extract never called → manual ticket (RC-1, still true). Route them through the Core under
  hard-case policy + C3 (auto-read → candidate+review, NOT zero-read → manual). Behind a flag; the safety stack
  that makes this safe is already proven on real docs (06-09). See PRODUCT_READINESS_COMPARISON_2026-06-09.md.
- [ ] **2.2** TPS → Core default for UA identity docs ONLY (booklet/birth/military); keep deterministic US-form rule
  modules (i94/ead/dl/i797) + Vision/DocAI as the technical eye (preview-prove "not worse" vs rule-modules).
- [ ] **2.2a** EAD registry proof: verify `us_ead`/`us_i94`/`i797` DocTypeSpecs actually exist & are correct in
  `docintel/documentRegistry` (PRODUCT_RUNTIME flags them UNPROVEN); owner provides upright real EAD/I-94 fixtures.
- [ ] **2.3** Reparole → Core default (passport/booklet); then extend Core to i94/ead/dl.
- [ ] **2.4** EAD → Core default.
- [ ] **2.5** Retire legacy ungated `/api/ocr/extract` (DeepSeek+gpt, RC-3) — confirm no live caller, then remove.
- [ ] **2.6** **Remove GPT-4o/gpt-4o-mini** + `ENABLE_OPENAI_VISION` (owner: GPT not used).

## Phase 3 — Explicit `final_value` + C3 as the single final writer  (CODE — the structural defense)
The anti-bypass invariant becomes structural, not a comment.
- [ ] **3.1** Add `finalValue: string | null` to `CanonicalField` (default null). One criticality taxonomy shared
  by D2 + C3 (consolidate D2 routing onto C3 `classifyCriticality`).
- [ ] **3.2** Make C3 the ONLY writer of `finalValue`: `accept_final`→`finalValue=normalizedValue`, else null. D2
  stays annotation-only. A D5 user confirmation re-runs C3 → may set `finalValue`.
- [ ] **3.3** Adapters carry the full record (no dropping `suggested_value`/`rule_id`/`provenance`/`reason_codes`/
  `evidence_strength`/`review_required`).
- [ ] **3.4** D6/PDF reads ONLY `finalValue`; critical `finalValue=null` → block. Migrate output consumers off
  `normalizedValue`. C3 (`OCR_FIELD_SAFETY_ENABLED`) default-on. Self-consistency = instability detector (not a vote).

## Phase 4 — Knowledge canary (after Core-default) + provenance/auditor  (owner flip + CODE)
- [ ] **4.1** `KNOWLEDGE_BRAIN_ENABLED` canary in prod — ONLY meaningful after Phase 2 (else no-op). Measure review-rate/conflict.
- [ ] **4.2** Provenance/audit log: persist per-field origin (reader/dictionary/MRZ/user_corrected) + reason codes;
  booleans only, NO PII. Feeds QA + future GT/HTR.

## Phase 5 — Tabs, professional pass + D5 review UI  (CODE/UX, per product)
- [ ] Translator/TPS/Reparole tabs finished (Lab upload; I-131 1.e checkbox; review screen uses the gated value).
- [ ] D5: review surfaces show field + reason + manual correction; uncertain → empty until pay (anti-screenshot).
- [ ] (later) Crop/source in D5 via **ReaderResult/Vision bbox** — does NOT block the safety MVP.

## PARKED (do not build until GT from different people justifies)
- HTR (Transkribus PII/DPA vs own TrOCR). Gemini-pro reads handwriting today.
- Empirical confidence-threshold calibration (needs GT breadth).

## Owner actions (the only blockers)
- Provide/rotate prod Gemini + Vision keys in Vercel (agent never handles prod secrets).
- Flip each phase's flag in prod after the preview proof.
- Provide ground-truth from DIFFERENT people to unblock calibration + the HTR decision.
