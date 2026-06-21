import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface SourceBadgeProps {
  className?: string
}

export function SourceBadge({ className }: SourceBadgeProps) {
  const t = useTranslations('badges')
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-badge text-xs font-medium bg-brand-100 text-brand-700',
        className,
      )}
    >
      {t('officialSource')}
    </span>
  )
}
