import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ProseProps {
  children: ReactNode
  className?: string
}

export function Prose({ children, className }: ProseProps) {
  return (
    <div className={cn('prose prose-slate max-w-none text-ink-700 leading-relaxed', className)}>
      {children}
    </div>
  )
}
