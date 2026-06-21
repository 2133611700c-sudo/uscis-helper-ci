/**
 * /order/[id] — customer-facing order-status page for the operator flow.
 * The order id (uuid) is the capability token; the page renders NO PII.
 * Data comes only from GET /api/order/{id} (built separately) — no Supabase here.
 */
import OrderStatusClient from './OrderStatusClient'

export const dynamic = 'force-dynamic'

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  return <OrderStatusClient locale={locale} orderId={id} />
}
