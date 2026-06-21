'use client'

import type { ReactNode } from 'react'
import { WizardHeader } from '@/components/wizard/WizardHeader'
import { DesktopAssistantPanel } from './DesktopAssistantPanel'

interface DesktopWizardShellProps {
  children: ReactNode
  slug: string
}

/**
 * Desktop wizard shell (≥1024px). 2-column layout matching prototype:
 *   [1fr main content] | [360px assistant panel]
 *
 * Left step sidebar removed — progress shown via dots in WizardHeader.
 */
export function DesktopWizardShell({ children, slug }: DesktopWizardShellProps) {
  return (
    <div
      data-testid="desktop-wizard-shell"
      data-slug={slug}
      className="min-h-screen transition-colors duration-200"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      <WizardHeader />
      <div
        className="grid min-h-[calc(100vh-73px)]"
        style={{ gridTemplateColumns: '1fr 360px' }}
      >
        <main className="overflow-x-hidden px-8 py-7 max-w-3xl">
          {children}
        </main>
        <DesktopAssistantPanel slug={slug} />
      </div>
    </div>
  )
}
