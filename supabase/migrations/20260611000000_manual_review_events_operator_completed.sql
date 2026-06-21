-- Allow 'operator_completed' in manual_review_events.event_type.
-- Used by the admin "Approve & Send PDF" server action (operator renders a
-- certified PDF and emails it to the client; the audit trail records the
-- operator completion distinctly from the generic manual_review_completed).

alter table public.manual_review_events
  drop constraint if exists manual_review_events_event_type_check;

alter table public.manual_review_events
  add constraint manual_review_events_event_type_check check (event_type in (
    'manual_review_queued',
    'manual_review_assigned',
    'manual_review_started',
    'manual_review_user_clarification_requested',
    'manual_review_completed',
    'manual_review_approved_for_render',
    'manual_review_rejected',
    'manual_review_cancelled',
    'operator_completed'
  ));
