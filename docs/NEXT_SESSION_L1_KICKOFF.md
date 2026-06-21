# NEXT SESSION — L1 OPERATIONS KICKOFF (paste this as the first message)

Grounded by a read-only map (2026-06-10). Verified premise: **a paid 422/503 IS possible** — the
confirmed_value_guard 422, ocr_field_safety 403, persistCertification 503, and a silent email-failure all occur
AFTER the payment gate (generate-pdf line ~124). The new certifier_override 422 is pre-payment (safe). **No refund
code exists anywhere.** L1 closes this operational blind spot. REUSE existing infra — do NOT reinvent.

```
TASK: Build L1 operations layer. Reuse existing infra. TDD where logic exists.

ANTI-DRIFT: The constitution + ADR-021 are RULED. Refund TERMS are an OWNER business
decision (RULED below) — do not re-open. Synthetic data only; no real PII in
code/tests/logs. The generate-pdf route is the payment path — minimal surface, behind
flags, byte-identical when OFF.

STOP-ON-AMBIGUITY (owner directive 2026-06-10): if something unexpected surfaces during
wiring — e.g. 503 auto-retry conflicting with Stripe idempotency, or ack-routing needing
a webhook path not planned for — STOP, do NOT guess, open a mentor-discussion with the
owner. Stopping at ambiguity is what separates a safe refactor from a dangerous one.

AFTER L1 (do NOT skip to new capability): the next priority is L2 — the GT benchmark with
the OWNER's fixtures (35-49 real docs per class, encrypted, GT-labeled). Until L2 exists,
the L1 dashboard numbers describe an UNKNOWN baseline, not quality. Resist the instinct to
jump to HTR / new document classes / new languages after L1 — that is the recurring
prioritization trap. L2 is owner-time and cannot be delegated.

TURNKEY NOTE: resolve these two as the FIRST code step so nothing downstream guesses —
(1) the `failure_type` enum (the single key that drives BOTH the triage and the ack
routing); (2) the persistence table for guard-block events + open-ticket state (pattern:
translation_quality_log / manual_review_queue). Everything else hangs off these two.

REUSE (mapped 2026-06-10 — do not rebuild):
- Email: apps/web/src/lib/email/resend.ts  sendEmail()
- Owner/operator alert: apps/web/src/lib/translation/manualReview/notifications.ts
    notifyOwnerAlert() / notifyOperator()  (Resend + optional Telegram webhook
    TELEGRAM_OWNER_WEBHOOK_URL). NO Slack — use Telegram + email.
- Auto-ticket: apps/web/src/lib/translation/manualReview/createManualReviewTicket.ts
    + table public.manual_review_queue (already exists)
- Counter candidate: apps/web/src/lib/docintel/documentClassMetric.ts
    recordDocumentClassMetric (behind DOCUMENT_CLASS_METRICS_ENABLED)
- Cron pattern: .github/workflows/federal-register-monitor.yml (scheduled → Supabase → email)
- Tables: translation_quality_log, monitoring_alerts, manual_review_queue

L1 SCOPE (owner-ruled A-full + per-failure-type triage):
1. POST-PAYMENT FAILURE HANDLING — NOT a blanket refund. Each of the 4 failure types
   gets its CORRECT response (a blanket "refund" over-refunds user-input/retry cases =
   double loss: refund + lost conversion). Behind REFUND_AUTOTICKET_ENABLED (default OFF).

   TRIAGE (owner RULED 2026-06-10):
     confirmed_value_guard 422  (user-input issue)
        → correction-flow (user fixes in D5); refund ONLY if user abandons.
     ocr_field_safety 403       (guard block)
        → review-flow + manual decision per case; refund if unresolvable after N tries.
     persistCertification 503   (backend/infra bug)
        → auto-retry 3x exponential backoff; refund ONLY if persistent (>3); owner-alert EVERY case.
     email-failure (silent 200) (delivery)
        → auto-RESEND; refund NEVER (user wants the PDF, not the money); ticket if 2nd resend fails.

   ALL 4 types also get (the A-full structure — without these, A = "Telegram alert + hope"):
     (2) Owner-alert: notifyOwnerAlert() (Telegram + email) — reuse existing.
     (3) Customer-facing acknowledgment email (template below) — without it the user
         thinks the payment is lost and opens a chargeback.
     (4) Escalation timer: ticket >4h no action → 2nd owner alert; >12h → 3rd channel.
     (5) Daily reconciliation cron (federal-register-monitor pattern): open tickets >24h → digest.

   Refund EXECUTION = manual via Stripe dashboard by the owner, applied ONLY when a case
   is explicitly classified "irrecoverable" or "user-requested". NOT auto (B rejected for now:
   autonomous money movement is the highest-risk path; needs fail-type enum + dry-run + cap +
   immutable audit + legal accounting review = 2-3 sessions + legal; A-full gives 80% of the
   user benefit in 1 session). Write docs/policy/REFUND_POLICY.md from this ruling.

   CUSTOMER ACKNOWLEDGMENT = 4 TEMPLATES, routed by failure_type (owner RULED 2026-06-10).
   A single template is WRONG: "no action needed" misleads the 422 case (the user MUST fix a
   field) → they don't return → ticket goes 'abandoned' → artificial refund queue; and the
   email-fail case needs a "check spam" instruction. SLA in every version = 24 hours.

     ack_422_correction  (user-input — ACTION REQUIRED, link back to D5):
       "We've received your payment — thank you. We need one small clarification before we
        finalize your document: please return to your document and confirm the highlighted
        field. It takes under a minute, and your payment is secure. Once you confirm, your
        translation completes automatically."

     ack_403_review  (guard — manual review, wait, no action):
       "We've received your payment — thank you. Your document needs a brief manual review by
        our team to ensure accuracy. No action is needed from you; most cases are completed
        within a few hours, and we'll respond within 24 hours at the latest. Your payment is secure."

     ack_503_retry  (infra — auto-retry, wait, no action):
       "We've received your payment — thank you. We hit a temporary technical issue while
        finalizing your document. The system is retrying automatically; no action is needed.
        If it isn't resolved shortly our team will step in — we'll respond within 24 hours at
        the latest. Your payment is secure."

     ack_email_resend  (delivery — check spam, auto-resend):
       "Your translation is ready and your payment is complete — thank you. We've emailed your
        document; please also check your spam/junk folder. If you don't see it within 24 hours,
        we'll resend it automatically — no action is needed."

   ROUTING: send the template selected by failure_type (the same key that classifies the
   triage above). Wire through the existing Resend sendEmail() (reuse). SLA = 24h (owner-
   confirmed): honest for owner-only transitional ops, beatable via the 4h/12h escalation,
   competitive (24-48h human-review norm). Tighten later if monitoring cadence / delegated certifier.
2. RATE-ALERT on guard-block frequency.
   - Guard-block console logs are NOT consumed today (no log drain). Persist each block
     to a small table (pattern: translation_quality_log), then a GH-cron rate-checker
     (pattern: federal-register-monitor) alerts via notifyOwnerAlert when blocks/hour > X.
   - X: measure current baseline first (start in shadow), then set. Do NOT hardcode blind.
3. HANDWRITING-FAILURE COUNTER (HTR-threshold prerequisite).
   - Define + persist handwriting_field_failure per the constitution HTR gate condition 4:
     field critical AND gemini confidence < 0.7 AND handwritten-origin AND review_required.
   - NOTE (ADDITION C): no handwritten-origin classifier nor visual_evidence_score exists
     yet — build the minimal signal first, then the per-rolling-100-doc counter.
   - Extend documentClassMetric or a new handwriting_failure_log table. Behind a flag.

OUT OF SCOPE:
- D5 review UI
- criticality-per-doc live-swap
- enabling CERTIFIER_OVERRIDE_ENABLED
- gazetteer history
- ADR-020 / HTR itself

DEFINITION OF DONE:
- Post-payment failure points emit an auto-ticket + owner alert (behind flag); tested.
- Guard-block events persist; a rate-checker alerts over threshold (shadow baseline first).
- handwriting_field_failure defined, counted, persisted (behind flag).
- REFUND_POLICY.md written from the owner ruling.
- tsc 0, content-guard 0, full suite green. STATUS/HANDOFF/CHANGELOG updated.
```

## OWNER RULINGS (RESOLVED 2026-06-10)
- Refund execution = **A-full with per-failure-type triage** (above). NOT a blanket refund; NOT auto (B deferred).
- Customer-facing acknowledgment SLA = **24 hours** (owner-CONFIRMED 2026-06-10).
- Acknowledgment = **4 templates routed by failure_type** (owner ruled — a single template misleads the 422 user-input case). Texts above.
- Escalation timer + daily reconciliation cron are MANDATORY parts of A-full, not optional.

## TEMPO RECOMMENDATION
Fresh session for L1 implementation. Reason: context is dense after the L0 build, and item 1 wires the **payment route** — the same sensitivity that warranted a fresh session for the L0 primitive. The map above makes the fresh session start from code, not assumptions.
