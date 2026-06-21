# Messenginfo Passport Translation Controlled Pilot Runbook

**Version:** 1.0  
**Date:** 2026-05-09  
**Status:** CONTROLLED PILOT — Not public launch  
**Document type in scope:** Ukrainian internal passport booklet only

---

## 1. Pilot Scope

- **Document:** Ukrainian internal passport booklet (синя книжечка). No other document types.
- **Users:** 1–3 known, pre-selected users. No public advertising, no open signup.
- **Promise to users:** English translation draft of the passport data page. Not a certified translation. Not legal advice.
- **Oversight:** Every generated PDF must be reviewed by an internal operator before delivery.
- **Unsupported documents:** If the uploaded photo is not a Ukrainian internal passport booklet, or OCR cannot read the critical fields, do not generate a PDF automatically. Route to manual review.
- **Scope hard limit:** Do not add new document types (birth certificate, foreign passport, etc.) during this pilot.

---

## 2. Pilot Roles

| Role | Responsibility |
|---|---|
| **Operator / internal reviewer** | Reviews every generated PDF before delivery. Checks all 11 critical fields. Signs off or holds/rejects. Monitors audit logs. |
| **User** | Uploads passport photo, reviews/corrects each field, signs certification, completes payment. |
| **System** | Runs Google Vision OCR → DeepSeek field extraction → Evidence Review UI → certification gate → payment gate → PDF render. |
| **Support contact** | Placeholder: support@messenginfo.com — for user questions during pilot. |

---

## 3. Pre-Pilot Checklist

Before starting the pilot with user P001, verify:

- [ ] Production deployment `dpl_44ny8gQ6gWBpGaqk98LnQHmjuLhQ` is READY on Vercel
- [ ] Commit `ff33d88` is deployed (matches local `main`)
- [ ] OCR route `POST /api/translation/[sessionId]/ocr-from-storage` returns HTTP 200 with fields
- [ ] Evidence Review UI loads at `/en/services/translate-document/session/[id]/review`
- [ ] All 11 critical fields appear in review UI
- [ ] PDF render returns HTTP 200 with `application/pdf` (no source trace, no debug text)
- [ ] Customer PDF is exactly 2 pages: Translation + Certification
- [ ] Audit logs contain no raw PII (field values, names, passport numbers)
- [ ] PostHog `maskAllInputs: true` confirmed
- [ ] Sentry `maskAllText: true`, `maskAllInputs: true` confirmed
- [ ] Payment gate enforced: HTTP 402 without confirmed payment
- [ ] User briefed: this is not legal advice, they must check every field
- [ ] Operator knows to hold PDF before delivery until manual QA complete
- [ ] Support contact is reachable

---

## 4. User Flow

```
1. Operator sends user the instructions link + session start URL
       ↓
2. User opens: /en/services/translate-document/start
       ↓
3. User uploads passport photo (the data page — the photo/signature page)
       ↓
4. System runs Google Vision OCR + DeepSeek field extraction (~10–30s)
       ↓
5. User lands on Evidence Review page
   - Sees each extracted field with source evidence badge
   - For each field: tap CONFIRM if correct, tap CORRECT if wrong
       ↓
6. User must confirm all 8 critical fields before certification unlocks:
   surname, given_names, date_of_birth, place_of_birth,
   series, number, issued_by, date_of_issue
       ↓
7. User fills in certification form and signs
       ↓
8. User completes payment (Stripe Live mode)
       ↓
9. System renders PDF and stores signed URL
       ↓
10. OPERATOR reviews PDF using Manual QA Checklist BEFORE delivery
       ↓
11. Operator delivers PDF to user (email or download link)
```

---

## 5. Critical Fields to Verify

All 11 fields must be present or flagged `review_required` in the session:

| Field | Notes |
|---|---|
| `document_type` | Must read "Ukrainian Internal Passport" or equivalent |
| `passport_series` | 2 Cyrillic letters — check against physical document |
| `passport_number` | 6 digits — check against physical document |
| `surname` | Family name — check spelling carefully |
| `given_name` | First name — check spelling carefully |
| `patronymic` | Middle name — may be absent for some users |
| `date_of_birth` | MM/DD/YYYY format — verify day/month not swapped |
| `place_of_birth` | City and/or region — check transliteration |
| `sex` | M or F |
| `issuing_authority` | ДМС/УДМС/МВС/НПУ — check glossary resolved correctly |
| `date_of_issue` | MM/DD/YYYY format — verify day/month not swapped |

---

## 6. Manual Operator Review

The operator must check every generated PDF before delivery. Use the QA Checklist (`PASSPORT_TRANSLATION_MANUAL_QA_CHECKLIST.md`). At minimum verify:

- No SOURCE TRACE / QA / internal / debug text in the PDF
- No raw JSON, OCR IDs, bounding box coordinates, or confidence scores visible
- No pre-2015 MVS/militsiya authority translated as "Police" — must say "Militia Department" or "District Department of the Ministry of Internal Affairs"
- ДМС/УДМС/ГУДМС terms resolve to "State Migration Service" — not left as transliterated abbreviation
- Names match the user's confirmed spelling exactly
- Dates are correct and unambiguous (day/month not swapped)
- Passport series (2 Cyrillic letters) and number (6 digits) are correct
- Certification block is present and complete
- No wording claiming "USCIS accepted", "guaranteed acceptance", "certified by AI"
- PDF is readable on both phone and desktop

---

## 7. Failure Handling

| Failure | User-facing message | Internal action | Pilot continues? |
|---|---|---|---|
| **Bad photo** (blurry, dark, partial) | "Your photo could not be read clearly. Please retake with good lighting and include the full page." | Log `photo_quality=poor`. Prompt retake. | Yes — after retake |
| **Low OCR confidence** (<0.6 on critical field) | "Some information needs your attention. Please check highlighted fields carefully." | Field shows `review_required=true`. User must correct before confirming. | Yes — user corrects |
| **Missing critical field** | "We could not read [field]. Please enter it manually." | Field row still created with `review_required=true`. User must enter value. | Yes — after correction |
| **Unsupported document** | "This tool is for Ukrainian internal passports only. We cannot process this document type." | Log `doc_type=unsupported`. Do not generate PDF. | No — refer to operator |
| **User confusion on review step** | Operator contacts user and walks through the UI verbally | Note in tracking sheet: `user_confusion_points` | Yes — with support |
| **Payment blocked** | "Payment could not be completed. Please try again or contact support." | Stripe error logged. No PDF generated. | Yes — after payment resolves |
| **PDF render failure** | "Your document could not be generated. Our team will follow up within 24 hours." | Log `event_type=error` in audit_logs. Operator generates PDF manually if possible. | Pause until resolved |
| **PII/log concern** | No user-facing message | STOP. Notify engineer immediately. Audit audit_logs table. | STOP pilot — fix first |

---

## 8. Stop Conditions

**Immediately stop the pilot if:**

- A wrong name, date, or passport number reaches a final delivered PDF
- Customer PDF contains SOURCE TRACE, QA audit, or internal debug text
- PII (names, passport numbers, dates) appears in Supabase audit_logs or Sentry/PostHog
- A pre-2015 MVS/militsiya authority is rendered as "Police" in a delivered PDF
- A user cannot complete the review/certification flow without the operator editing their data directly
- Payment gate fails to enforce (PDF delivered without payment)
- Render gate fails to enforce (PDF delivered without confirmed critical fields)
- Production deployment mismatches pushed main (different commit SHA)

---

## 9. Pilot Success Criteria

At the end of the pilot (1–3 users completed):

- [ ] 1–3 users completed the full flow end-to-end
- [ ] 0 critical field errors in any final delivered PDF
- [ ] 0 PII leaks in audit logs, telemetry, or Sentry
- [ ] 0 internal debug text in any customer PDF
- [ ] Every user completed the review step without operator editing their fields
- [ ] All issues, confusion points, and bugs are logged in the tracking sheet

---

## 10. Post-Pilot Decision

| Outcome | Decision |
|---|---|
| 0 critical bugs, users completed flow | Proceed to Birth Certificate module planning |
| 1+ critical bugs in delivered PDF | Fix passport module first. Do not add new document types. |
| User could not complete flow without help | Fix UX issues first. Re-run with 1 more user. |

**Rule:** Do not add new document types before this post-pilot review is complete.
