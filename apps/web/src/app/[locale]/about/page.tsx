import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { HowWeHelpSection } from '@/components/home/HowWeHelpSection'
import { DisclaimerSection } from '@/components/home/DisclaimerSection'
import { Section } from '@/components/ui/Section'

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
    title: `About | Messenginfo`,
    description: t('description'),
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/about`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `https://messenginfo.com/${l}/about`]),
      ),
    },
  }
}

export default async function AboutPage() {
  return (
    <>
      <Section>
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-ink-900 mb-4">About Messenginfo</h1>
          <p className="text-ink-600 text-base leading-relaxed">
            Messenginfo is an information resource for people navigating U.S. immigration processes.
            We provide official-source guidance, document checklists, and clear next steps — in 4 languages.
            We are not a law firm and do not provide legal advice.
          </p>
        </div>
      </Section>
      <HowWeHelpSection />
      <DisclaimerSection />
    </>
  )
}
