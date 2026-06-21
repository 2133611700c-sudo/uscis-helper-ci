import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Container } from './Container'

interface SectionProps {
  children: ReactNode
  className?: string
  containerClassName?: string
  id?: string
}

export function Section({ children, className, containerClassName, id }: SectionProps) {
  return (
    <section id={id} className={cn('py-16 md:py-24', className)}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  )
}
