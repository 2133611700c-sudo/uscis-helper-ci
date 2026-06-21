import { useTranslations } from 'next-intl'
import { Section } from '@/components/ui/Section'

export function HowWeHelpSection() {
  const t = useTranslations('howWeHelp')
  const items = t.raw('items') as Array<{ title: string; description: string }>

  return (
    <Section className="bg-slate-50">
      <div className="text-center mb-12 md:mb-16">
        {/* H&F-style serif heading */}
        <h2 className="font-display text-2xl md:text-3xl font-bold text-ink-900 tracking-tight">
          {t('title')}
        </h2>
        <p className="mt-3 text-ink-600 text-base max-w-lg mx-auto leading-relaxed">
          {t('subtitle')}
        </p>
      </div>

      {/* H&F-style: numbered steps with connector line on desktop */}
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
        {/* Connector line — desktop only */}
        <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-px bg-brand-100 z-0" aria-hidden="true" />

        {items.map((item, i) => (
          <div key={i} className="relative z-10 flex flex-col items-center text-center gap-4">
            {/* H&F step circle: numbered, brand color, soft shadow */}
            <div className="w-16 h-16 rounded-full bg-white border-2 border-brand-200 flex items-center justify-center shadow-[0_4px_16px_rgba(79,70,229,0.12)] shrink-0">
              <span className="font-display text-xl font-bold text-brand-600">
                {i + 1}
              </span>
            </div>
            <div className="max-w-[240px]">
              <h3 className="font-semibold text-ink-900 text-base leading-snug">{item.title}</h3>
              <p className="mt-2 text-sm text-ink-600 leading-relaxed">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
