/**
 * customerStatus — collapse internal manual_review_queue states into the
 * 3-step customer view shown on /order/[id]. Intermediate operator states
 * (operator_completed / approved_for_render) deliberately stay "in_review":
 * the customer sees "completed" only when the email actually went out.
 */
export function toCustomerStatus(status: string): 'received' | 'in_review' | 'completed' | 'closed' {
  if (['queued', 'pending'].includes(status)) return 'received'
  if (['assigned', 'in_review', 'needs_user_clarification', 'operator_completed', 'approved_for_render'].includes(status)) return 'in_review'
  if (status === 'completed') return 'completed'
  return 'closed' // rejected / cancelled / unknown
}
