import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { ContactSection } from '@/components/sections/ContactSection'
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
    title: `Contact | Messenginfo`,
    description: t('description'),
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/contact`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `https://messenginfo.com/${l}/contact`]),
      ),
    },
  }
}

export default function ContactPage() {
  return (
    <>
      <ContactSection />
      <DisclaimerSection />
    </>
  )
}
