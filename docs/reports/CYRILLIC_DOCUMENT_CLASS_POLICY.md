# Cyrillic Document Class Policy

**Date:** 2026-06-03
**Source:** qa-private/reports/failed_cyrillic_ground_truth_adjudication_20260602.json
**Implementation:** apps/web/src/lib/canonical/core/documentClassPolicy.ts
**Tests:** apps/web/src/lib/canonical/core/__tests__/documentClassPolicy.test.ts (31 passing)

---

## Auto-fill Classes

| Class | Why |
|---|---|
| `internal_passport_booklet` | All tested models returned correct identity. Benchmark: zero critical_wrong_count. Patronymic requires review (often missing from MRZ/vision reads). |
| `military_id` | All tested models correct on tested sample. Printed document, no handwriting ambiguity. Needs larger corpus before auto-final is enabled. |

Both classes: `auto_fill_allowed: true`, `final_without_review: false` — auto-fill means pre-populate fields, NOT final without review.

---

## Hard-Case Review-Only Classes

| Class | Evidence from Benchmark | always_review |
|---|---|---|
| `birth_certificate_handwritten` | gemini-2.5-pro + gemini-2.5-flash both returned wrong person (different family name, given name, birth year, city). gemini-3.1-flash-image reads correct owner identity but DOB uncertain. | true |
| `birth_certificate_soviet_bilingual` | Same wrong-person failure as handwritten. USSR bilingual UA+RU layers cause generic extraction to confuse identity blocks. gemini-2.5-pro additionally set review_required=false while wrong — most dangerous failure mode. | true |
| `marriage_apostille` | 82KB image was insufficient. No verified ground truth. Rescan at 300 DPI required before any extraction can be trusted. | true |
| `unknown_document` | No class match = no trust. | true |

---

## Model Role by Class

| Class | Candidate Model | Disqualified Models |
|---|---|---|
| `internal_passport_booklet` | gemini-3.1-flash-image | gemini-2.0-flash (404) |
| `military_id` | gemini-3.1-flash-image | gemini-2.0-flash (404) |
| `birth_certificate_handwritten` | gemini-3.1-flash-image | gemini-2.5-pro, gemini-2.5-flash (wrong person) |
| `birth_certificate_soviet_bilingual` | gemini-3.1-flash-image | gemini-2.5-pro (wrong person + false confidence), gemini-2.5-flash (wrong person) |
| `marriage_apostille` | gemini-3.1-flash-image (safe/null) | No model trusted without better image |

**Global Gemini default: NOT set.** Model selection is per-class. `gemini-3.1-flash-image` is a per-class candidate, not a global default. Cyrillic is NOT solved globally.

---

## Retired Models (Removed from Code)

| Model | Status | Action |
|---|---|---|
| `gemini-2.0-flash` | HTTP 404 — deprecated | Removed from fallback comment in geminiVisionProvider.ts |
| `gemini-2.0-flash-lite` | HTTP 404 — deprecated | Not in codebase |
| `gemini-2.5-pro` | Disqualified for certificates — wrong person + false confidence | Documented in policy notes; not removed from general fallback (may still be used for non-cert tasks by env var) |

---

## What Remains Blocked by Missing Ground Truth

All three certificate ground truth files exist at `qa-private/ground-truth/` but have `ground_truth_status: MISSING` with empty fields:
- `birth_cert_handwritten_ivanenko.json`
- `birth_cert_soviet_ivanenko.json`
- `marriage_apostille_vasylsiuk.json`

**These files were NOT overwritten.** Owner must fill values from physical documents.

Until ground truth is filled:
- Cannot score model accuracy on birth certificates (benchmark blocked)
- `birth_certificate_handwritten` and `birth_certificate_soviet_bilingual` remain hard-case with no auto-fill
- `marriage_apostille` remains hard-case + rescan required

---

## Wrong-Person Guard

**Location:** `documentClassPolicy.ts` → `applyCertificateRoleGuard()`

**What it does:** On certificate document classes (`birth_certificate_handwritten`, `birth_certificate_soviet_bilingual`, `marriage_apostille`), checks that extracted fields use role-grounded keys (`child_family_name`, `spouse1_family_name`) rather than generic `family_name`. Generic name fields on certificates indicate the model did not distinguish between child/parent/spouse roles — the exact failure mode observed in the benchmark (model returned a completely different person).

**When safe=false:** The field set must be routed to mandatory human review. Auto-fill is blocked.

---

## Hard-Case Review Override

**Location:** `documentClassPolicy.ts` → `applyHardCaseReviewOverride()`

**What it does:** On any `always_review: true` document class, forcibly sets `review_required: true` regardless of the model's output. The `override_reason` field is set to `hard_case_class:<class>`.

**Why:** gemini-2.5-pro set `review_required: false` on `birth_certificate_soviet_bilingual` while returning the wrong person. A model's own confidence signal CANNOT be trusted on hard-case documents.

---

## Image Quality Guard

**Location:** `documentClassPolicy.ts` → `checkImageQuality()`

**Thresholds:**

| Threshold | Value | Reason |
|---|---|---|
| `min_bytes_for_extraction` | 100 KB | General minimum for meaningful OCR |
| `min_bytes_marriage_apostille` | 300 KB | 82 KB proved insufficient in benchmark |
| `max_bytes_before_resize` | 2 MB | gemini-2.5-pro 503 errors observed on 7 MB images |

**Actions:**
- `needs_better_scan` — image below minimum for its class. Do not call API.
- `resize` — image above 2 MB. Must compress before sending to avoid 503.
- `proceed` — image within acceptable range.

---

## Do Not Migrate Until This Policy Is In Core

Per task constraint: Re-Parole, EAD, payment/UI/BUREAU_PDF/P2 migrations are NOT part of this change. Policy is implemented in `canonical/core/documentClassPolicy.ts` — the shared Core layer that all products consume.
