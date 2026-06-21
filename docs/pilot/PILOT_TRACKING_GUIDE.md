# Pilot Tracking Guide

**File:** `artifacts/pilot/passport_pilot_tracking_template.csv`  
**Purpose:** Track every pilot user session for post-pilot review.  
**Rule:** Use pilot_user_id (P001, P002, P003). Never use real names in this file.

---

## Column Definitions

| Column | How to fill |
|---|---|
| `pilot_user_id` | P001, P002, or P003. Never use real names. |
| `session_id` | UUID from the URL: `/session/[session_id]/review`. Copy from browser. |
| `date_started` | Date the user started the flow. Format: YYYY-MM-DD. |
| `device_type` | `mobile` / `tablet` / `desktop`. Ask user or observe. |
| `browser` | `Chrome` / `Safari` / `Firefox` / other. |
| `document_type` | Always `ua_passport_internal` for this pilot. |
| `photo_quality_good_yes_no` | `yes` if OCR completed with all fields. `no` if photo was retaken or OCR failed. |
| `ocr_completed_yes_no` | `yes` if `ocr_completed` audit event exists for this session. |
| `critical_fields_count` | Number of extracted_fields rows for this session. Should be 11. |
| `fields_confirmed_count` | Number of fields the user confirmed (confirmed=true in DB). |
| `fields_corrected_count` | Number of fields the user corrected (appears in user_corrections table). |
| `fields_review_required_count` | Number of fields with review_required=true at time of certification. |
| `passport_series_correct_yes_no` | `yes` if series in PDF matches physical document. Operator checks. |
| `passport_number_correct_yes_no` | `yes` if number in PDF matches physical document. Operator checks. |
| `name_correct_yes_no` | `yes` if surname + given_name in PDF match physical document. |
| `dob_correct_yes_no` | `yes` if date_of_birth in PDF matches physical document. |
| `issuing_authority_correct_yes_no` | `yes` if issued_by resolved correctly (no "Police" for pre-2015). |
| `pdf_generated_yes_no` | `yes` if render endpoint returned HTTP 200 with PDF. |
| `pdf_clean_yes_no` | `yes` if PDF has no source trace, no debug text, no JSON (operator verified). |
| `manual_operator_reviewed_yes_no` | `yes` after operator completes full QA checklist. |
| `user_completed_without_help_yes_no` | `yes` if user went through all steps independently. `no` if operator helped. |
| `time_to_complete_minutes` | Minutes from session start to PDF render. Estimate. |
| `bugs_found` | Short description of any bugs found. `none` if clean. |
| `user_confusion_points` | Which steps were confusing. E.g. `correction modal`, `certification form`. |
| `final_status` | `approved` / `hold_user_correction` / `hold_tech_fix` / `rejected` |
| `operator_notes` | Free text. Any issues, observations, or follow-ups needed. |

---

## Status Values

| Status | Meaning |
|---|---|
| `approved` | PDF delivered to user. All checks passed. |
| `hold_user_correction` | User needs to re-check a field. PDF not delivered yet. |
| `hold_tech_fix` | A bug blocked completion. Engineering follow-up needed. |
| `rejected` | Document was wrong type or session cannot be completed. No PDF. |

---

## Important Rules

- Never enter a real passport number, name, or date of birth in this file.
- `pilot_user_id` must be P001/P002/P003 — no real identifiers.
- This file is internal only — do not share with users.
- Archive this file after the pilot review meeting.
