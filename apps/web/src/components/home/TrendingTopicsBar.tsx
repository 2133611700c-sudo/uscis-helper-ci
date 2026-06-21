import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { TrendingUp } from 'lucide-react'
import { trendingTopics } from '@/data/trendingTopics'

interface TrendingTopicsBarProps {
  locale: string
}

export function TrendingTopicsBar({ locale }: TrendingTopicsBarProps) {
  const t = useTranslations('trending')

  return (
    <div className="w-full bg-brand-50 dark:bg-brand-900/20 border-b border-brand-100 dark:border-brand-900">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-2 flex items-center gap-3 overflow-x-auto scrollbar-none">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 shrink-0">
          <TrendingUp className="w-3.5 h-3.5" />
          {t('label')}
        </span>
        <div className="flex items-center gap-2 flex-nowrap">
          {trendingTopics.map((topic) => (
            <Link
              key={topic.id}
              href={`/${locale}/services/${topic.cardSlug}`}
              className="shrink-0 inline-flex items-center px-3 py-1 rounded-badge bg-white border border-brand-100 dark:border-brand-800 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:border-brand-200 dark:hover:border-brand-700 transition-colors whitespace-nowrap"
            >
              {t(`topics.${topic.id}`)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
