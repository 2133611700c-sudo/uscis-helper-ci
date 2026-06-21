import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { routing } from '@/i18n/routing'
import { serviceCards } from '@/data/serviceCards'
import { ServiceCard } from '@/components/cards/ServiceCard'
import { Section } from '@/components/ui/Section'
import { DisclaimerSection } from '@/components/home/DisclaimerSection'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata' })

  return {
    title: `FAQ | Messenginfo`,
    description: t('description'),
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/faq`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `https://messenginfo.com/${l}/faq`]),
      ),
    },
  }
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'services' })
  const tAsk = await getTranslations({ locale, namespace: 'askQuestion' })

  // Top 6 cards for FAQ quick links
  const topCards = serviceCards.slice(0, 6)

  return (
    <>
      <Section>
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-ink-900 mb-4">FAQ & Common Questions</h1>
          <p className="text-ink-600 text-base leading-relaxed mb-8">
            Browse the most common topics below. Each page links to official USCIS, CBP, and DOJ sources.
            For questions not covered here, contact us.
          </p>

          <h2 className="text-xl font-bold text-ink-900 mb-4">{t('title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            {topCards.map((card) => (
              <ServiceCard key={card.id} card={card} locale={locale} />
            ))}
          </div>

          <div className="rounded-card bg-brand-50 border border-brand-100 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-ink-900">{tAsk('title')}</p>
              <p className="text-sm text-ink-600 mt-1">{tAsk('subtitle')}</p>
            </div>
            <Link
              href={`/${locale}/contact`}
              className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-btn transition-colors"
            >
              {tAsk('ctaContact')}
            </Link>
          </div>
        </div>
      </Section>
      <DisclaimerSection />
    </>
  )
}
