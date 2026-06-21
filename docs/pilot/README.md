# Passport Translation — Controlled Pilot Documentation

**Status:** CONTROLLED PILOT READY  
**Scope:** Ukrainian internal passport booklet only  
**Users:** 1–3 known, pre-selected users  
**Date:** 2026-05-09  

This is the complete documentation package for the Messenginfo passport translation controlled pilot.  
Do not use for public launch. Do not add new document types before post-pilot review.

---

## Documents

### Runbook
**[PASSPORT_PILOT_RUNBOOK.md](./PASSPORT_PILOT_RUNBOOK.md)**  
Full operator runbook: scope, roles, pre-pilot checklist, user flow, failure handling, stop conditions, success criteria, post-pilot decision.

### User Instructions
**[PASSPORT_PILOT_USER_INSTRUCTIONS.md](./PASSPORT_PILOT_USER_INSTRUCTIONS.md)**  
Simple English instructions for the pilot user. Mobile-first, non-technical.

**[PASSPORT_PILOT_USER_INSTRUCTIONS_RU.md](./PASSPORT_PILOT_USER_INSTRUCTIONS_RU.md)**  
Russian version of the user instructions. Simple language, no legal promises.

### QA Checklist
**[PASSPORT_TRANSLATION_MANUAL_QA_CHECKLIST.md](./PASSPORT_TRANSLATION_MANUAL_QA_CHECKLIST.md)**  
Operator checklist to complete before releasing any PDF. Includes field accuracy, PDF cleanliness, legal compliance, era rules, and final decision.

### Tracking
**[PILOT_TRACKING_GUIDE.md](./PILOT_TRACKING_GUIDE.md)**  
Explains how to fill the tracking sheet. Column definitions, status values, rules.

**[../../artifacts/pilot/passport_pilot_tracking_template.csv](../../artifacts/pilot/passport_pilot_tracking_template.csv)**  
CSV tracking template for P001–P003.

---

## Smoke Test Artifacts

Run date: 2026-05-09 | Session: a9afd327 | Verdict: PASS

| Artifact | Description |
|---|---|
| [../../artifacts/pilot/smoke/smoke_output.json](../../artifacts/pilot/smoke/smoke_output.json) | Full smoke result JSON |
| [../../artifacts/pilot/smoke/smoke_pdf_text.txt](../../artifacts/pilot/smoke/smoke_pdf_text.txt) | Extracted PDF text |
| [../../artifacts/pilot/smoke/smoke_pdf_forbidden_scan.json](../../artifacts/pilot/smoke/smoke_pdf_forbidden_scan.json) | Forbidden phrase scan — 0 violations |
| [../../artifacts/pilot/smoke/smoke_summary.md](../../artifacts/pilot/smoke/smoke_summary.md) | Human-readable smoke summary |

---

## Mobile UX Screenshots

Captured 2026-05-09 at 375×812 viewport (iPhone SE) against production.

| Screen | File | Notes |
|---|---|---|
| Landing + wizard start | [../../artifacts/mobile_ux/01_landing_wizard_start.png](../../artifacts/mobile_ux/01_landing_wizard_start.png) | Locale toggle <44px (non-blocking) |
| Evidence Review top | [../../artifacts/mobile_ux/02_review_top.png](../../artifacts/mobile_ux/02_review_top.png) | Same nav element |
| Evidence Review bbox | [../../artifacts/mobile_ux/03_review_bbox_viewer.png](../../artifacts/mobile_ux/03_review_bbox_viewer.png) | Same nav element |
| Evidence combined bbox | [../../artifacts/mobile_ux/04_review_combined_bbox.png](../../artifacts/mobile_ux/04_review_combined_bbox.png) | Same nav element |
| Correction modal | [../../artifacts/mobile_ux/05_correction_modal.png](../../artifacts/mobile_ux/05_correction_modal.png) | Same nav element |
| Certification form | [../../artifacts/mobile_ux/06_certification_form.png](../../artifacts/mobile_ux/06_certification_form.png) | ✅ Clean |
| Payment gate | [../../artifacts/mobile_ux/07_payment_gate.png](../../artifacts/mobile_ux/07_payment_gate.png) | ✅ Clean |
| Final download | [../../artifacts/mobile_ux/08_final_download.png](../../artifacts/mobile_ux/08_final_download.png) | ✅ Clean |

**Finding:** Icon-only nav buttons and locale toggle are <44px WCAG 2.5.5. Main action buttons not flagged. No JSON bleed, no horizontal overflow. Non-blocking for pilot.

---

## Related Reports

- **[../../artifacts/PILOT_READINESS_REPORT.md](../../artifacts/PILOT_READINESS_REPORT.md)** — Full technical readiness report with all phase evidence
