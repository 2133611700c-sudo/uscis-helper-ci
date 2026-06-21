import { useTranslations } from 'next-intl'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type OfficialSource } from '@/data/officialSources'

interface OfficialSourceCardProps {
  source: OfficialSource
  className?: string
}

export function OfficialSourceCard({ source, className }: OfficialSourceCardProps) {
  const t = useTranslations('officialSources')
  const itemData = t.raw(`items.${source.id}`) as { name: string; description: string }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-start gap-3 rounded-card bg-white border border-slate-100 p-4',
        'shadow-card hover:shadow-card-hover transition-shadow duration-200',
        'hover:-translate-y-0.5 transition-transform group',
        className,
      )}
    >
      <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-brand-600 font-bold text-xs uppercase">
          {source.sourceType === 'uscis' ? 'US' : source.sourceType === 'cbp' ? 'CBP' : source.sourceType === 'doj' ? 'DOJ' : 'GOV'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-ink-900 group-hover:text-brand-600 transition-colors flex items-center gap-1">
          {itemData.name}
          <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </p>
        <p className="mt-1 text-sm text-ink-600 leading-relaxed">{itemData.description}</p>
      </div>
    </a>
  )
}
