import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

interface IconBadgeProps {
  icon: LucideIcon
  size?: Size
  className?: string
}

const sizeMap: Record<Size, { container: string; icon: string }> = {
  sm: { container: 'w-8 h-8', icon: 'w-4 h-4' },
  md: { container: 'w-14 h-14', icon: 'w-7 h-7' },
  lg: { container: 'w-16 h-16', icon: 'w-8 h-8' },
}

export function IconBadge({ icon: Icon, size = 'md', className }: IconBadgeProps) {
  const { container, icon } = sizeMap[size]
  return (
    <div className={cn('rounded-full bg-brand-100 flex items-center justify-center shrink-0', container, className)}>
      <Icon className={cn('text-brand-600', icon)} />
    </div>
  )
}
