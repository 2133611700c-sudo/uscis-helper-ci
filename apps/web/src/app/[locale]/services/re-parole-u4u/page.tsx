/**
 * /[locale]/services/re-parole-u4u
 *
 * Redirects to the INFO landing first (4 trust cards, how-it-works, price
 * range, FAQ) so the user understands the service and its cost BEFORE the
 * upload wizard. The info page's "Start" CTA goes to /start.
 *
 * (Was redirecting straight to /start, stranding the landing + pricing.)
 */
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function ReParoleRedirect({ params }: Props) {
  const { locale } = await params
  redirect(`/${locale}/services/re-parole-u4u/info`)
}
