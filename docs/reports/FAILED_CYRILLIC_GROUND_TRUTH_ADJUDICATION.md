# Failed Cyrillic Ground Truth Adjudication

**Date:** 2026-06-02  
**Mode:** Zero-trust. No model selection finalized. No production claims.  
**Scope:** 3 failed document classes from real-docs benchmark  
**PII:** Sanitized — no real names, no identifying data in this file. See qa-private/reports/ for full data.

---

## Documents Adjudicated

| doc_id | class | ground_truth_status | result |
|--------|-------|---------------------|--------|
| birth_cert_handwritten | UA_BIRTH_CERT_HANDWRITTEN | MISSING (inferred from cross-ref) | FAIL — wrong person on 3 of 4 models |
| birth_cert_soviet | UA_BIRTH_CERT_SOVIET | MISSING (inferred from cross-ref) | FAIL — wrong person on 3 of 4 models |
| marriage_apostille | UA_MARRIAGE_CERT_APOSTILLE | MISSING (no cross-ref source) | PARTIAL — apostille metadata only |
| internal_passport | ua_internal_passport_booklet | VERIFIED | PASS — not re-tested |
| military_id_p1 | ua_military_id | PARTIAL | PASS — not re-tested |

---

## Phase 2 — Model Run Results (Sanitized)

### birth_cert_handwritten

| model | identity_correct | DOB_correct | review_required | verdict |
|-------|-----------------|-------------|-----------------|---------|
| gemini-2.5-pro | **NO — wrong person** | **NO — wrong year** | true | CRITICAL FAIL |
| gemini-3.1-flash-image | YES — owner identity | UNCERTAIN (day digit) | false (wrong) | LIKELY CORRECT, policy fix needed |
| gemini-2.5-flash (prev, KEY_066) | NO — wrong person | NO | — | CRITICAL FAIL |
| gemini-2.5-flash (prev, KEY_213) | NO — wrong person | NO | — | CRITICAL FAIL |

**Key finding:** gemini-2.5-pro and both gemini-2.5-flash variants returned a completely different person's identity (different family name, different given name, different birth year, different city). All three models are disqualified for this document class.

### birth_cert_soviet

| model | identity_correct | DOB_correct | review_required | verdict |
|-------|-----------------|-------------|-----------------|---------|
| gemini-2.5-pro | **NO — wrong person** | **NO — wrong year** | false (wrong) | CRITICAL FAIL + false confidence |
| gemini-3.1-flash-image | YES — owner identity | UNCERTAIN (day digit) | false (wrong) | LIKELY CORRECT, policy fix needed |
| gemini-2.5-flash (prev) | NO — wrong person | NO | — | CRITICAL FAIL |

**Additional finding:** gemini-2.5-pro returned review_required=false on birth_cert_soviet despite returning an entirely wrong person. This is the most dangerous failure mode — confident and wrong.

**Cross-doc consistency note:** Both birth certs (handwritten + soviet) show different issuing cities and different registration dates — these are likely two distinct documents (e.g., original registration + duplicate). Both contain same owner identity, confirmed by flash-image reading consistent with passport ground truth.

### marriage_apostille

| model | names_extracted | apostille_metadata | review_required | verdict |
|-------|-----------------|-------------------|-----------------|---------|
| gemini-3.1-flash-image | null (all) | apostille_date + country correct | true | SAFE PARTIAL — correctly deferred |
| gemini-2.5-pro | names present but unverified | correct | true | SUSPECT — cannot validate, possible registrar/party confusion |

**Image quality issue:** Source file is 84KB. Both birth certs are ~7MB. Resolution is likely the bottleneck for party name extraction on the apostille.

---

## Phase 3 — Error Classification

### Error Classes Found

| error_class | documents_affected | can_prompt_fix | needs_doc_schema | always_review | pro_fallback_helps | reshoot | block_auto_final |
|-------------|-------------------|----------------|-----------------|---------------|--------------------|---------|------------------|
| wrong_person_selected | birth_cert_handwritten, birth_cert_soviet | partial | YES | YES | **NO** | YES | YES |
| bilingual_layer_confusion | birth_cert_soviet, marriage_apostille | partial | YES | YES | NO | YES | YES |
| handwritten_misread | both birth certs (DOB digits) | partial | NO | YES | NO | YES | YES |
| wrong_record_block | both birth certs (2.5-pro) | YES | YES | YES | NO | YES | YES |
| prompt_not_document_specific | both birth certs (review_required=false) | YES | NO | YES | N/A | NO | NO |
| no_ground_truth | all 3 failed docs | N/A | N/A | YES | N/A | N/A | YES |
| model_503 | birth certs (prev benchmark, 7MB image) | NO | NO | YES | N/A | YES (resize) | YES |

### Critical Pattern: wrong_person_selected

This is the dominant failure. The model reads a different complete identity from the document — not a misread letter, but a different person entirely. The wrong name, wrong year, wrong city, wrong registrar. This suggests:

1. **Multi-document page confusion** — the image may contain visible elements of adjacent records in the register book
2. **Training data contamination** — model returns a "typical" Ukrainian birth cert rather than reading the actual image
3. **Document-specific prompt partially addresses this** — gemini-3.1-flash-image with the birth cert prompt reads correct identity; the same image with a generic prompt caused failures in the previous benchmark

### Critical Pattern: false confidence (review_required=false when wrong)

gemini-2.5-pro on birth_cert_soviet: returned wrong person AND set review_required=false. This is the most dangerous failure mode in a legal document extraction pipeline. A human reviewer would not be flagged to check the output.

---

## Phase 4 — Policy Decisions

### Per Error Class

**wrong_person_selected:**
- A. Prompt fix: partial (flash-image responds, pro does not)
- B. Doc-specific schema: required
- C. Always review_required: YES
- D. Pro fallback helps: NO
- E. Reshoot: YES (crop to child name block)
- F. Block auto-final: YES

**bilingual_layer_confusion:**
- A. Prompt fix: partial
- B. Doc-specific schema: required
- C. Always review_required: YES
- D. Pro fallback helps: NO
- E. Reshoot: YES (isolate party block)
- F. Block auto-final: YES

**handwritten_misread:**
- A. Prompt fix: partial (add digit confusion hints)
- B. Doc-specific schema: no
- C. Always review_required: YES — handwritten DOB never auto-final
- D. Pro fallback helps: NO
- E. Reshoot: YES (high-res crop of DOB field)
- F. Block auto-final: YES

---

## Phase 5 — Model Role Table (Candidates Only, Not Final Selection)

| class | candidate_model | review_policy | auto_final_allowed | notes |
|-------|----------------|---------------|--------------------|-------|
| internal_passport_printed | gemini-3.1-flash-image | patronymic always review; others conditional | YES | All tested models correct. Flash fastest. |
| military_id | gemini-3.1-flash-image | conditional on confidence | YES | All tested models correct. Printed doc. |
| birth_cert_handwritten | gemini-3.1-flash-image | ALWAYS review_required=true | **NO** | 2.5-pro/flash catastrophically wrong. Flash reads correct identity but DOB uncertain. |
| birth_cert_soviet_bilingual | gemini-3.1-flash-image | ALWAYS review_required=true | **NO** | Same failure pattern. 2.5-pro false confidence is disqualifying. |
| marriage_apostille | gemini-3.1-flash-image (safe/null) or 2.5-pro (names, unverified) | ALWAYS review_required=true | **NO** | No ground truth. Names unverifiable. Rescan required. |

**Disqualified models for birth certificate classes:**
- gemini-2.5-pro: wrong person on both cert types, including false-confidence case
- gemini-2.5-flash (both keys): wrong person on both cert types

---

## Main Error Patterns Summary

1. **wrong_person_selected** — dominant failure on birth certs for gemini-2.5-pro and gemini-2.5-flash. Not a misread — entirely different person.
2. **false confidence** — gemini-2.5-pro returned review_required=false on a document where it read the wrong person.
3. **DOB digit uncertainty** — even the correct model (flash-image) reads the DOB day differently from the passport. Handwritten digits for 1-digit numbers (1, 2, 6) are ambiguous in Cyrillic handwriting.
4. **review_required=false when should be true** — both flash-image runs set review_required=false despite DOB being uncertain on handwritten documents. This needs to be enforced by policy, not by model output.
5. **Marriage apostille image quality** — 84KB file too small for reliable party name extraction. Flash correctly deferred (null); pro extracted names but unverifiable.
6. **Deprecated model names** — gemini-2.0-flash (404 deprecated), gemini-3.1-flash-latest (404 not found). Current valid flash-image model: gemini-3.1-flash-image.

---

## Ground Truth Gaps — Required Owner Actions

1. **birth_cert_handwritten and birth_cert_soviet**: Owner must look at physical documents and fill in ground truth JSON files:
   - Exact DOB (day especially — flash reads differ from passport DOB)
   - Confirm issuing city (two different cities read — two different documents confirmed)
   - Confirm act record number (87 vs 88 vs 821)

2. **marriage_apostille**: Rescan at higher resolution (minimum 300 DPI, ~1-2MB). Then re-run.

3. **All MISSING files**: Populate `/qa-private/ground-truth/*.json` with verified values before next benchmark.

---

## Deprecated Model References to Update in Codebase

The following model IDs referenced in task description / previous benchmarks are no longer valid:

| task_alias | status | correct_id |
|------------|--------|------------|
| gemini-3.1-flash-image [KEY_066] | ACTIVE | `gemini-3.1-flash-image` |
| gemini-2.0-flash | DEPRECATED (HTTP 404) | use `gemini-2.5-flash` or `gemini-3.1-flash-image` |
| gemini-3.1-flash-latest | NOT FOUND (HTTP 404) | `gemini-3.1-flash-image` (versioned) |

**Note:** `gemini-2.0-flash` is referenced in `apps/web/src/lib/docintel/providers/geminiVisionProvider.ts` fallback chain. This needs updating. Do not update without separate task — this report does not authorize code changes.

---

## Next Actions

1. **Immediate:** Owner populates ground truth JSONs from physical documents
2. **Next benchmark:** Re-run birth certs with verified ground truth, confirm flash-image DOB reads
3. **Prompt hardening:** Add explicit DOB review_required=true trigger for handwritten birth cert prompt
4. **Image preprocessing:** Resize 7MB birth cert images to ≤2MB before API call
5. **Marriage apostille:** Rescan at higher resolution, re-run adjudication
6. **Codebase:** Update deprecated model IDs in fallback chain (separate task)
7. **Policy enforcement:** review_required must be set by pipeline policy for handwritten doc classes, not trusted from model output

---

*Report generated by automated adjudication agent. All PII stripped. Full data with field values: `qa-private/reports/failed_cyrillic_ground_truth_adjudication_20260602.json`*
