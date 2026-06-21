import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ContainerProps {
  children: ReactNode
  className?: string
}

export function Container({ children, className }: ContainerProps) {
  return (
    <div className={cn('max-w-[1200px] mx-auto px-4 md:px-6', className)}>
      {children}
    </div>
  )
}
