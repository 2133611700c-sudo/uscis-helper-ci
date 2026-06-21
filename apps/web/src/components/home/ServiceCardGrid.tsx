import { useTranslations } from 'next-intl'
import { Section } from '@/components/ui/Section'
import { ServiceCard } from '@/components/cards/ServiceCard'
import { serviceCards } from '@/data/serviceCards'

interface ServiceCardGridProps {
  locale: string
}

export function ServiceCardGrid({ locale }: ServiceCardGridProps) {
  const t = useTranslations('services')

  return (
    <Section id="services">
      <div className="text-center mb-10 md:mb-14">
        {/* H&F pattern: serif display for section heading */}
        <h2 className="font-display text-3xl md:text-4xl font-bold text-ink-900 leading-tight tracking-tight">
          {t('title')}
        </h2>
        <p className="mt-3 text-ink-600 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
          {t('subtitle')}
        </p>
      </div>
      {/* H&F exact grid: 1-col mobile → 2-col at 600px max */}
      {/* H&F exact: 1-col mobile gap-16px → 2-col at 600px gap-20px */}
      <div className="grid grid-cols-1 min-[600px]:grid-cols-2 gap-4 min-[600px]:gap-5">
        {serviceCards.map((card) => (
          <ServiceCard key={card.id} card={card} locale={locale} />
        ))}
      </div>
    </Section>
  )
}
