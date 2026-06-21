'use client'

import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconBadge } from '@/components/ui/IconBadge'

interface DocumentTypeCardProps {
  title: string
  description: string
  icon: LucideIcon
  isSelected: boolean
  onSelect: () => void
  actionLabel: string
}

export function DocumentTypeCard({
  title,
  description,
  icon,
  isSelected,
  onSelect,
  actionLabel,
}: DocumentTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex h-full min-h-[184px] w-full flex-col gap-4 rounded-card border p-5 text-left transition-[transform,box-shadow,border-color,background-color] duration-200 md:min-h-[216px] md:p-6',
        'shadow-card hover:-translate-y-1 hover:shadow-card-hover active:scale-[0.99]',
        isSelected
          ? 'border-brand-300 bg-brand-50'
          : 'border-slate-200 bg-white hover:border-brand-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <IconBadge icon={icon} size="md" />
        <span
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
            isSelected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700',
          )}
        >
          {actionLabel}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold leading-snug text-ink-900 md:text-xl">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-600 md:text-base">{description}</p>
      </div>
    </button>
  )
}
