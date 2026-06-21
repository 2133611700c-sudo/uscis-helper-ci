# Manual Review Pipeline Integration Inventory

**Generated:** 2026-05-09 (UTC)
**Scope:** Where `shouldRouteToManualReview()` and `createManualReviewTicket()` are wired vs. where they should be.

## Summary

Manual Review v1 exists as: types + DB + admin UI + safe metadata + notifications + user-status route + tests. **It is not wired to the production extraction/render pipeline.**

The existing safety floor (`manualReviewModule.reviewPolicy.allowAutoPdf = false`, returned by `getDocumentModule()` for any non-`active` type) keeps customer PDFs safe TODAY, but the queue does not actually receive tickets when the pipeline encounters a manual-review-worthy condition. Most failure paths return HTTP 422/503 with text `manual_review_required` but **no row is written to `manual_review_queue` and no audit event fires**.

## Inventory by gate

### G1 — Document classification

**File:** `apps/web/src/lib/translation/modules/classifier.ts` and `modules/registry.ts`

**What exists:**
- `classifyDocumentType(raw, confidence)` returns `manualReviewModule` for unknown / low-confidence / draft / disabled / manual_only inputs.
- Confidence threshold 0.85 hardcoded inside the classifier (separate from router's `ROUTER_THRESHOLDS.classifierConfidence`).

**What's missing:**
- No call to `shouldRouteToManualReview()`.
- No call to `createManualReviewTicket()`.
- The classifier silently swaps in `manualReviewModule` and downstream code proceeds without any operator visibility.

**Action (Phase 2):** the OCR / extract / render routes that consume classifier output must invoke the router + ticket service when `classifier.usedFallback === true` or `module.status !== 'active'`.

---

### G2 — Image quality (preprocess)

**File:** `apps/web/src/app/api/translation/[sessionId]/ocr-from-storage/route.ts`, lines ~158–175.

**What exists:**
- `preprocessImage()` returns `{ ok: false, code, message, detail }` for unsupported file types or quality failures.
- Route writes `extraction_runs.status = 'failed'` and an audit event.
- Returns HTTP 422.

**What's missing:**
- No ticket created.
- No router call.

**Action:** on `pre.ok === false`, call `createManualReviewTicket({ reasons: ['image_quality_failed'], ...session/document context })` so an operator sees the case.

---

### G3 — OCR provider missing / blocked

**File:** `apps/web/src/app/api/translation/[sessionId]/ocr-from-storage/route.ts`, lines ~183–196.

**What exists:**
- Returns HTTP 503 `ocr_provider_blocked`.

**What's missing:**
- No ticket. (System-level outage, but still worth a ticket for ops visibility.)

**Action:** on `isBlocked(ocrRaw)`, create a ticket with `system_error` + `priority: high`. Notification to operator (`notifyOwnerAlert`) for paging.

---

### G4 — Smart Retake exhausted

**File:** `apps/web/src/app/api/translation/[sessionId]/ocr-from-storage/route.ts`, lines ~200–225 (no text detected) and ~246–265 (image quality below threshold).

**What exists:**
- After `SMART_RETAKE_MAX_ATTEMPTS = 2`, route returns `code: 'manual_review_required'` HTTP 422 with a user message string.

**What's missing:**
- The string `manual_review_required` is **not** a ticket. No DB row, no audit event. The user sees the message and the case dies.

**Action:** on retake-exhausted, call `createManualReviewTicket({ reasons: ['image_quality_failed', 'unclear_handwriting'], priority: 'normal' })`.

---

### G5 — DeepSeek field-mapping failure

**File:** `apps/web/src/app/api/translation/[sessionId]/ocr-from-storage/route.ts`, lines ~233–244.

**What exists:**
- On `mapResult.ok === false || fields.length === 0`, returns HTTP 422 with `code: 'manual_review_required'`.

**What's missing:**
- Same as G4: text only, no ticket.

**Action:** call `createManualReviewTicket({ reasons: ['system_error', 'low_ocr_confidence'] })`.

---

### G6 — Missing critical fields after extraction

**File:** `apps/web/src/app/api/translation/[sessionId]/ocr-from-storage/route.ts`, lines ~322–349.

**What exists:**
- For each missing critical field, a placeholder row with `review_required: true` is inserted into `extracted_fields`.
- Console warning logged.
- Audit log `ocr_completed` includes `missing_critical_count`.

**What's missing:**
- No ticket created when `placeholders.length > 0`.

**Action:** if any critical field is missing OR > N% of fields have `review_required: true`, create ticket with `missing_critical_fields`.

---

### G7 — Module not active (draft / manual_only / disabled)

**File:** classifier returns `manualReviewModule`; OCR route / extract route silently use it.

**What's missing:**
- The case "user uploaded a document type that has a draft module" never produces a ticket, and the user sees a generic OCR result. The translation will fail downstream at certification or render.

**Action:** in OCR route, after resolving `docType`, check `getDocumentModule(docType).status`. If not `'active'`, create ticket with `unsupported_document_type`.

---

### G8 — Certification gate (unconfirmed critical fields)

**File:** `apps/web/src/app/api/translation/certify/route.ts`, lines ~46–68.

**What exists:**
- Blocks certification with HTTP 400 + `gate: 'critical_fields_unconfirmed'`.

**What's missing:**
- No ticket. The user sees the block but nothing escalates to operator.

**Action:** when blocked, optionally create ticket with `missing_critical_fields` (priority: low — the user is still actively in the wizard).

---

### G9 — Render gate (does NOT query manual_review_queue)

**File:** `apps/web/src/app/api/translation/render/route.ts`, lines ~108–264.

**What exists, in order:**
1. Payment verification (Stripe).
2. Certification record exists + valid.
3. Completeness audit (all critical fields confirmed, source-to-final match).
4. OCR/evidence audit.
5. QA validators.

**What's missing:**
- **The render route does NOT query `manual_review_queue` for the session.** If a ticket exists in `queued`/`assigned`/`in_review`/`needs_user_clarification` state, render will still produce a PDF as long as the other gates pass.
- Today's mitigation: `manualReviewModule.reviewPolicy.allowAutoPdf = false` blocks render when classifier resolved to manualReview. But that's a code-level gate, not a DB-backed one. If a future code change loosens it, there's no second line of defense.

**Action:** add a hard gate before payment/cert/QA gates: query `manual_review_queue` where `session_id = ?` and `status NOT IN ('approved_for_render', 'completed')`. If any open ticket → return HTTP 423 (Locked) with `gate: 'manual_review_pending'` and a safe user message.

---

### G10 — Legacy `/api/translation/manual-review` route

**File:** `apps/web/src/app/api/translation/manual-review/route.ts`.

**What exists:**
- Direct insert into `manual_review_queue` (v0 columns only: `doc_type, source_lang, contact_*, source_fields, status='pending'`).
- Resend email to staff with **raw OCR-extracted field values** in the email body. This contradicts our PII-safe notification contract.
- Reasons accepted: `low_confidence`, `user_requested`, `translate_error`, `ocr_unreadable` (v0 codes).

**What's missing:**
- Does not call `createManualReviewTicket()`.
- Does not write to `manual_review_events`.
- Does not populate v1 columns (`reasons`, `priority`, `module_type`, etc.).
- Operator email leaks raw `source_fields` values.

**Action:** rewrite this route to:
1. Translate v0 reason codes via `normalizeReason()`.
2. Call `createManualReviewTicket()` (which writes events, populates v1 columns, idempotent).
3. Replace raw-fields-in-email with `notifyOperator()` (metadata-only).
4. Keep response shape backward-compatible (`{ ok, case_id, estimated_hours }`) so existing wizard callers continue to work.

---

## Files that already use the new system correctly

- `apps/web/src/app/api/admin/manual-review/queue/route.ts` — admin queue list, redacted projection.
- `apps/web/src/app/api/admin/manual-review/[ticketId]/transition/route.ts` — typed status transitions.
- `apps/web/src/app/api/translation/[sessionId]/manual-review-status/route.ts` — user-safe status endpoint.
- `apps/web/src/app/admin/manual-review/page.tsx` — admin queue list with PII redaction.

## Phase 2 plan

1. **New file** `apps/web/src/lib/translation/manualReview/integrations.ts` — thin wrappers around router + ticket service for each pipeline gate. Each wrapper:
   - Takes route-local context (`sessionId`, `docType`, `moduleStatus`, etc.) — never raw PII.
   - Calls `shouldRouteToManualReview()` to compute reasons + priority.
   - Calls `createManualReviewTicket()` if `manualReviewRequired`.
   - Returns `{ created, ticketId, reasons }` so the caller can surface a stable user-facing key.
   - Never throws — DB failure logs and returns `{ created: false }` so the route's HTTP response is unaffected.

2. **Wire in** the routes listed above (G2 / G4 / G5 / G6 / G7 / G9). G1 / G3 / G8 are deferred or covered by other gates.

3. **Render hard gate (G9):** add a small helper `getOpenManualReviewForSession(sessionId)` that runs first in render/route.ts and returns 423 if an open ticket exists.

4. **Legacy /api/translation/manual-review (G10):** rewrite to use `createManualReviewTicket` + `notifyOperator`, keep response shape.

5. **Tests:** integration tests via mocked Supabase client + integration tests against route handlers (POST … expect 422 + ticket row).

This closes the gap without creating a parallel queue and without breaking the existing safety floor.
