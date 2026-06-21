'use client'

import type { ReactNode } from 'react'
import { WizardHeader } from '@/components/wizard/WizardHeader'

interface MobileWizardShellProps {
  children: ReactNode
  slug: string
}

/**
 * Mobile/tablet wizard shell (<1024px). Single-column flow.
 * WizardHeader provides sticky top bar with LanguageSwitcher + ThemeToggle.
 * WizardNavBar (Back/Next) and MiaFAB live inside WizardController.
 */
export function MobileWizardShell({ children, slug }: MobileWizardShellProps) {
  return (
    <div
      data-testid="mobile-wizard-shell"
      data-slug={slug}
      className="min-h-screen transition-colors duration-200"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      <WizardHeader />
      <main className="px-4 py-5 pb-24">{children}</main>
    </div>
  )
}
