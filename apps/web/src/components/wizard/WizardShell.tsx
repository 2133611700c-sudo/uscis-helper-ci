'use client'

import { type ReactNode, useEffect } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MobileWizardShell } from './MobileWizardShell'
import { DesktopWizardShell } from './desktop/DesktopWizardShell'

interface WizardShellProps {
  children: ReactNode
  slug: string
}

/**
 * Viewport router for the wizard.
 *
 * SSR renders MobileWizardShell as safe fallback (useMediaQuery returns
 * false during SSR). After hydration, React swaps to DesktopWizardShell on
 * 1024px+ screens. Causes a brief visual switch (0.1–0.3s) on desktop —
 * accepted tradeoff for skeleton v3. Wave 2 may replace with a neutral
 * loading skeleton if reported.
 *
 * IMPORTANT: Do NOT render both shells with CSS `md:hidden` / `lg:block` —
 * that duplicates DOM, duplicates IDs, breaks shared state. One shell
 * in the tree at a time, switched by viewport.
 *
 * The wizard adds `wizard-active` to <body> so globals.css can hide the
 * site Header — WizardHeader is the single sticky bar while inside the wizard.
 */
export function WizardShell({ children, slug }: WizardShellProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    document.body.classList.add('wizard-active')
    return () => { document.body.classList.remove('wizard-active') }
  }, [])

  if (isDesktop) {
    return <DesktopWizardShell slug={slug}>{children}</DesktopWizardShell>
  }
  return <MobileWizardShell slug={slug}>{children}</MobileWizardShell>
}
