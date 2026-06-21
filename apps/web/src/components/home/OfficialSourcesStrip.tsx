import { useTranslations } from 'next-intl'
import { Section } from '@/components/ui/Section'
import { OfficialSourceCard } from '@/components/cards/OfficialSourceCard'
import { featuredSources } from '@/data/officialSources'

export function OfficialSourcesStrip() {
  const t = useTranslations('officialSources')

  return (
    <Section id="sources" className="bg-slate-50">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-ink-900">{t('title')}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {featuredSources.map((source) => (
          <OfficialSourceCard key={source.id} source={source} />
        ))}
      </div>
    </Section>
  )
}
