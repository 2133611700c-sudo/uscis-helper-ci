/**
 * /[locale]/services/tps-ukraine
 *
 * Redirects to the INFO landing first (hero, price range, how-it-works, FAQ)
 * so a 35–80yo user understands what this is and what it costs BEFORE being
 * dropped into the upload wizard. The info page's "Start" CTA goes to /start.
 *
 * (Was redirecting straight to /start, which stranded the whole landing +
 * pricing content and gave first-time users no context.)
 */
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function TpsUkraineRedirect({ params }: Props) {
  const { locale } = await params
  redirect(`/${locale}/services/tps-ukraine/info`)
}
