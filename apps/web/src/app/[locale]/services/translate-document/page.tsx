/**
 * Old translate-document landing page (Tailwind blue, 3-plan pricing, ✕)
 * has been REPLACED with a permanent redirect to the new wizard at /start.
 *
 * Why: the landing had stale design (Tailwind blue CTA, $14.99/$19.99/$29.99
 * trio that no longer match the wizard's single $14.99 plan) and was the
 * URL users hit when clicking «Перевод документов» from the site menu —
 * which made every owner-test report «сайт старый, ничего не изменилось».
 *
 * The new wizard at /services/translate-document/start contains the full
 * UX: TPS-restyle, 6 doc-type tiles, multi-page upload, per-row Edit
 * button, real OCR via Gemini (env GEMINI_API_KEY on Production). Both
 * the menu link and any incoming external links now land directly on it.
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'

interface Props {
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const messages = (await import(`../../../../../messages/${locale}.json`)).default
  const title = `${messages.translationService.title} | Messenginfo`
  const description = messages.translationService.subtitle

  return {
    title,
    description,
    metadataBase: new URL('https://messenginfo.com'),
    // Canonical points at the wizard so the redirect doesn't split SEO.
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/translate-document/start`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `https://messenginfo.com/${l}/services/translate-document/start`]),
      ),
    },
    openGraph: {
      title,
      description,
      url: `https://messenginfo.com/${locale}/services/translate-document/start`,
      locale: locale === 'uk' ? 'uk_UA' : locale === 'ru' ? 'ru_RU' : locale === 'es' ? 'es_ES' : 'en_US',
    },
  }
}

export default async function TranslateDocumentPage({ params }: Props) {
  const { locale } = await params
  redirect(`/${locale}/services/translate-document/start`)
}
