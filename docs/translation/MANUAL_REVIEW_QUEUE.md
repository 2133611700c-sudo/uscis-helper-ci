# Manual Review Queue v1 — Implementation Guide

**Status:** Path B (additive hardening over v0). Not a new system.
**Migration:** `supabase/migrations/20260509210000_manual_review_queue_v1_hardening.sql`
**Code root:** `apps/web/src/lib/translation/manualReview/`

This document is implementation-focused. It is not user-facing copy and is not
marketing. It exists so the next engineer can extend the queue without
breaking production.

---

## Purpose

The Manual Review Queue is the **safety net** between Messenginfo's automated
translation pipeline and the customer-facing PDF. Documents that the pipeline
cannot safely auto-translate — unknown types, low-confidence extraction,
complex tables, court documents, identity conflicts, etc. — are escalated to
an operator. The customer receives a calm, non-technical status message and
the auto-PDF is blocked until a human approves.

It exists because: "AI translates anything you upload" is a lie that produces
incorrect translations and regulatory damage. This queue makes "you can
upload many documents" honest.

---

## When Manual Review is Triggered

The router `shouldRouteToManualReview()` (`router.ts`) returns
`manualReviewRequired: true` when **any** of the following holds:

| Reason code | Trigger |
|---|---|
| `unknown_document_type` | Empty / null document type from classifier |
| `unsupported_document_type` | Module status is `draft`, `manual_only`, or `disabled` |
| `low_classification_confidence` | Classifier confidence < 0.85 |
| `image_quality_failed` | Image quality failed after `maxImageQualityRetries` (3) |
| `missing_critical_fields` | Any critical field missing OR validator with severity `error` |
| `low_ocr_confidence` | Aggregated OCR confidence < 0.65 |
| `missing_source_evidence` | Critical field present but has no OCR bbox / source trace |
| `unclear_handwriting` | `contentSignals.handwritingHeavy` |
| `unclear_seal_or_stamp` | `contentSignals.unclearSealOrStamp` |
| `complex_table_document` | `contentSignals.complexTable` |
| `long_legal_text` | `contentSignals.longLegalText` |
| `legal_or_court_document` | `contentSignals.legalOrCourt` |
| `military_document` | `contentSignals.military` |
| `diploma_or_transcript` | `contentSignals.diplomaOrTranscript` |
| `identity_conflict` | `contentSignals.identityConflict` (HIGH priority always) |
| `glossary_unresolved` | Agency / civil registry abbreviation could not be resolved |
| `system_error` | Any `extractionErrors[]` reported by upstream |
| `user_requested_human_help` | User clicked "Need human help" |

Thresholds are in `ROUTER_THRESHOLDS` (router.ts). Tune via PR — do not
inline-override at call sites.

### Priority

- `high`: identity_conflict, paid user with any reason, OCR failure count ≥ 3, urgent flag.
- `low`: user clicked "need help" with no other reason.
- `normal`: all other escalation cases.

---

## Statuses

The DB column `manual_review_queue.status` holds the lifecycle state.

### v0 statuses (preserved)

`pending`, `in_review`, `completed`, `cancelled` — kept as-is. No data
migration. Existing rows continue to work.

### v1 statuses (added by 20260509210000 migration)

`queued`, `assigned`, `needs_user_clarification`, `operator_completed`,
`approved_for_render`, `rejected`.

### Compatibility map

| v0 | v1 | Equivalent |
|---|---|---|
| `pending` | `queued` | yes — `canonicalStatus()` maps both → `queued` |
| `cancelled` | `rejected` | yes — `canonicalStatus()` maps both → `rejected` |
| `in_review` | `in_review` | identical |
| `completed` | `completed` | identical |

Use `canonicalStatus(s)` and `isStatusEquivalent(a, b)` from `types.ts`
whenever comparing v0/v1 rows.

### Allowed transitions

Defined in `STATUS_TRANSITIONS` (`types.ts`). Reject illegal transitions
with HTTP 409 from `/api/admin/manual-review/[ticketId]/transition`.

```
queued/pending  → assigned | in_review | cancelled | rejected
assigned        → in_review | cancelled | rejected
in_review       → needs_user_clarification | operator_completed | cancelled | rejected
needs_user_clarification → in_review | cancelled | rejected
operator_completed → approved_for_render | rejected
approved_for_render → completed
completed       → (terminal)
rejected        → (terminal)
cancelled       → (terminal)
```

---

## User-Facing Copy

User-facing text comes from `messages.ts`. Three locales (en/ru/uk).

### Bucket map (status → user bucket)

| Bucket | Statuses | i18n key |
|---|---|---|
| `not_in_review` | (no ticket) | `mr.user.not_in_review` |
| `in_progress` | queued, pending, assigned, in_review | `mr.user.in_progress` |
| `awaiting_you` | needs_user_clarification | `mr.user.awaiting_you` |
| `ready` | operator_completed, approved_for_render | `mr.user.ready` |
| `closed` | completed, rejected, cancelled | `mr.user.closed` |

### Hard rules for copy

- No "AI failed" / "OCR error" / "unsupported error".
- No legal advice. No USCIS-acceptance claims. No guarantees.
- No technical terms (OCR, bbox, source trace, validator).
- Always offers a clear next action.
- Mobile-first: 18px+ body text, 56px+ tap targets.
- The status message is the same regardless of which reason fired —
  reasons are operator-only, not user-facing.

To add a new locale: add a new key to each entry in `MANUAL_REVIEW_MESSAGES`.

---

## Operator Workflow

### List view: `/admin/manual-review` (server component)

- Protected by `ADMIN_SECRET` cookie via `apps/web/src/middleware.ts`.
- Shows `id, doc_type, source_lang, priority, reasons, created_at, expires_at, status`.
- **Privacy rule (Phase 8):** the list **never** shows `contact_name`,
  `contact_email`, `contact_phone`, `source_fields`, `translated_fields`,
  or `notes`. Those are visible only on the protected detail page.
- The Supabase `select(...)` clause in the list page enforces this — do not
  add contact columns to the select without re-reviewing the whole UI.

### Detail view: `/admin/manual-review/[id]` (server component)

- Same admin auth.
- Shows full row including contact fields. Operator can enter English
  translations and submit. Submission triggers `sendTranslation` server
  action which:
  1. Sends translation email to client
  2. Marks status `completed`, sets `reviewed_at`, `reviewed_by='admin'`
  3. Stores `translated_fields`

### Transition API: `POST /api/admin/manual-review/[ticketId]/transition`

- Same admin cookie required (checked in handler — see `adminAuth.ts`).
- Body: `{ to: ManualReviewStatus, operator_id?: string, metadata?: object }`.
- Validates with `canTransition()`. Writes `manual_review_events` row with
  PII-safe metadata only.
- Use this endpoint for status changes that don't go through the existing
  `sendTranslation` / `markInReview` server actions (e.g. marking a ticket
  `needs_user_clarification`, `rejected`, etc.).

### Queue API: `GET /api/admin/manual-review/queue`

- Returns the same redacted projection as the list page.
- Query params: `status`, `priority`, `limit` (default 100, max 500).
- Same admin cookie required.

---

## User-Facing Status API

`GET /api/translation/[sessionId]/manual-review-status`

- Public (anonymous-by-design — session id is the capability token).
- Returns `{ status, messageKey, estimatedHours, nextStepKey }`.
- **Never returns:** admin notes, raw OCR, source/translated field values,
  reasons, safe_summary, contact info, ticket id (only first 8 chars in
  email subjects, never in API response).

---

## Privacy Rules

This queue handles vulnerable populations (Ukrainian / Russian-speaking
immigrants, often under removal proceedings). Privacy is non-negotiable.

### Hard prohibitions

- Audit metadata (`manual_review_events.metadata`) **must not** contain raw
  names, DOB, addresses, document numbers, passport numbers, OCR text,
  correction values. The whitelist is in `safeMetadata.ts`
  (`SAFE_METADATA_KEYS`).
- Queue list view (admin or API) **must not** expose contact fields.
- User-facing status route **must not** expose admin notes, reasons,
  safe_summary, or technical errors.
- Customer PDF **must not** contain admin audit artifact (OCR IDs, bbox,
  source traces, correction history) — that's what `bureauStyleRenderer.ts`
  already guarantees; do not change without renewing the privacy review.

### Allowed audit metadata keys

`field_name`, `reason_code`, `status`, `from_status`, `to_status`,
`value_length`, `duration_ms`, `count`, `route`, `ticket_id`, `session_id`,
`document_id`, `module_type`, `priority`, `event_type`, `http_status`,
`attempt`, `reasons` (array), `operator_id_hash`. Anything outside this list
is dropped by `sanitizeEventMetadata()`.

### Heuristic value-level redaction

`redactValue()` (in `safeMetadata.ts`) replaces:
- email-shaped strings → `[redacted-email]`
- phone-shaped strings → `[redacted-phone]`
- 4+ digit runs → `[redacted-digits]` (catches DOBs without separators,
  document numbers)
- cyrillic word runs → `[redacted-text]`

This is a defense-in-depth measure. Callers must still not pass raw PII to
audit metadata in the first place.

---

## Pipeline Integration

The router and ticket service are wired in at the following gates. Add new
gates only via PR review.

| Gate | File | Action |
|---|---|---|
| After classification | `lib/translation/modules/classifier.ts` | Already returns `manualReviewModule` for unknown / low-confidence types. The new router can be invoked alongside to produce a ticket. |
| After image quality check | extraction route | Call `shouldRouteToManualReview` with `imageQuality` populated; on `true` call `createManualReviewTicket`. |
| After OCR/extraction | extract route | Same pattern with `criticalFieldResults` and `ocrConfidence` populated. |
| After validator run | extract route | Same pattern with `validatorResults`. |
| Before certification | render route | If status is not `approved_for_render` or `completed`, block. |
| Before customer PDF render | `lib/packet/pdf.ts` & `bureauStyleRenderer.ts` | Already enforces `allowAutoPdf: false` on `manualReviewModule`. Do not weaken. |

The existing module registry's `getDocumentModule(type)` returns
`manualReviewModule` for unknown types, which has `allowAutoPdf: false`.
That's the floor: even with no router integration, the existing PDF render
will refuse to produce a PDF for a manual-review document.

---

## Notifications

`notifications.ts` exports three channels:

- `notifyUser`: client email via Resend, body from i18n keys only.
- `notifyOperator`: staff email via Resend, body is sanitized metadata only.
- `notifyOwnerAlert`: optional Telegram webhook (`TELEGRAM_OWNER_WEBHOOK_URL`).

All return `{ channel, status, errorTag? }`. Never throw. If a provider is
not configured, returns `not_configured`. Caller must treat
`not_configured` as a soft signal (do not fail ticket creation).

---

## Unsupported document behavior

Unsupported (= not in registry, or module status not `active`) documents
**must always** route to manual review. The flow is:

1. Classifier returns `manualReviewModule`.
2. Router (`shouldRouteToManualReview`) returns `manualReviewRequired: true`
   with `unknown_document_type` or `unsupported_document_type` reasons.
3. Caller (extraction or render route) calls `createManualReviewTicket()`.
4. Customer sees `mr.user.in_progress` message.
5. Auto-PDF is blocked because `allowAutoPdf: false` on `manualReviewModule`
   AND the render gate checks ticket status.
6. Operator sees the ticket in `/admin/manual-review`.
7. Operator completes translation in detail view.
8. Operator approves render OR sends translation directly via
   `sendTranslation` (existing v0 path).

Do not add an "auto-PDF for unsupported with disclaimer" path. That was
explicitly rejected in mission scope.

---

## Adding a new module — manual-first

When adding support for a new document type that should default to manual
review:

1. Create `apps/web/src/lib/translation/modules/<name>.module.ts` with
   `status: 'manual_only'`.
2. Add to registry in `apps/web/src/lib/translation/modules/registry.ts`.
3. Add aliases in `classifier.ts` so user-input strings resolve to it.
4. Do **not** set `status: 'active'` until you have:
   - extraction prompt
   - validators
   - PDF template
   - reviewPolicy with all gates
   - test coverage for happy path + each `unsupportedConditions` entry
   - operator-tested through `/admin/manual-review` end-to-end

Promoting a module from `manual_only` → `active` is a separate PR with its
own review.

---

## Known Blockers (current cycle)

- **Sandbox build constraint:** the Vercel build needs `pnpm install` and
  `pnpm test` to be re-run on a Mac (or in CI). The current commit was
  prepared with typecheck-only validation locally; vitest could not be
  executed in the sandbox where this code was written due to a
  native-binding architecture mismatch (linux-arm64 vs darwin-arm64).
  Operators MUST run `pnpm install && pnpm test && pnpm typecheck && pnpm
  build && pnpm --filter web run guard:content` on a Mac before pushing.

- **No SSH push from sandbox.** The git commit is local-only; operator must
  `git push origin main` manually.

- **Vercel deploy is operator-driven.** This module does not claim DEPLOYED
  status until the operator pushes and Vercel reports READY.

---

## Test Coverage

Unit tests (vitest):

- `__tests__/router.test.ts` — every routing rule, priority logic, dedup,
  user message keys.
- `__tests__/types.test.ts` — status validity, transition table, alias
  normalization, reason normalization.
- `__tests__/safeMetadata.test.ts` — `redactValue`, `sanitizeEventMetadata`,
  `isSafeMetadata`, `buildSafeSummary`, key whitelist contract.

Integration / E2E tests are not included in this commit. They require a
test Supabase instance to exercise `createManualReviewTicket`,
`writeManualReviewEvent`, and the admin transition API. The pure-function
test layer above gives high confidence in the routing and PII-safety
contracts; the DB layer is intentionally thin and exercised by the existing
integration suite for `manual_review_queue`.

---

## How to extend

| You want to … | Edit |
|---|---|
| Add a new escalation reason | `types.ts` (`MANUAL_REVIEW_REASONS`) + `messages.ts` + `router.ts` (rule that fires the reason) + tests |
| Add a new status | `types.ts` + migration to extend the CHECK constraint + `STATUS_TO_EVENT` map in transition route + tests |
| Tune a threshold | `router.ts` (`ROUTER_THRESHOLDS`) — propose tradeoffs in PR |
| Add a new notification channel | `notifications.ts` — keep it metadata-only |
| Add a new locale | add to each entry in `MANUAL_REVIEW_MESSAGES` |
| Add a new pipeline gate | call `shouldRouteToManualReview` then `createManualReviewTicket`; document the gate in this file |
