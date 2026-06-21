import { getLocale } from 'next-intl/server'
import { TrendingTopicsBar } from '@/components/home/TrendingTopicsBar'
import { Hero } from '@/components/home/Hero'
import { OfficialSourcesStrip } from '@/components/home/OfficialSourcesStrip'
import { ServiceCardGrid } from '@/components/home/ServiceCardGrid'
import { AskQuestionCTA } from '@/components/home/AskQuestionCTA'
import { HowWeHelpSection } from '@/components/home/HowWeHelpSection'
import { DocumentToolsSection } from '@/components/home/DocumentToolsSection'
import { TelegramStrip } from '@/components/home/TelegramStrip'
import { DisclaimerSection } from '@/components/home/DisclaimerSection'

export default async function HomePage() {
  const locale = await getLocale()

  return (
    <>
      <Hero locale={locale} />
      <ServiceCardGrid locale={locale} />
      <TrendingTopicsBar locale={locale} />
      <OfficialSourcesStrip />
      <AskQuestionCTA locale={locale} />
      <HowWeHelpSection />
      <DocumentToolsSection />
      <TelegramStrip />
      <DisclaimerSection />
    </>
  )
}
