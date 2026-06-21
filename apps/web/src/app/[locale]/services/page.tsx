import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
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
  const t = await getTranslations({ locale, namespace: 'services' })

  return {
    title: `${t('title')} | Messenginfo`,
    description: t('subtitle'),
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `https://messenginfo.com/${l}/services`]),
      ),
    },
  }
}

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'services' })

  return (
    <>
      <Section>
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-ink-900">{t('title')}</h1>
          <p className="mt-3 text-ink-600 text-base max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 min-[600px]:grid-cols-2 gap-4 min-[600px]:gap-5">
          {serviceCards.map((card) => (
            <ServiceCard key={card.id} card={card} locale={locale} />
          ))}
        </div>
      </Section>
      <DisclaimerSection />
    </>
  )
}
