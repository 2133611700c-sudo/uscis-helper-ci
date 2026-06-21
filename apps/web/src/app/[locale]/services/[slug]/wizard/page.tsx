import { notFound } from 'next/navigation'
import { WizardProvider } from '@/contexts/WizardContext'
import { WizardShell } from '@/components/wizard/WizardShell'
import { WizardController } from '@/components/wizard/WizardController'
import { isValidServiceSlug } from '@/lib/security/validation'

interface WizardPageProps {
  params: Promise<{ slug: string; locale: string }>
}

/**
 * Generic /[locale]/services/[slug]/wizard route.
 *
 * Phase 0 multi-service refactor: the slug is now passed into WizardProvider so
 * sessions persist under the correct service_slug. WizardController itself is
 * still hardcoded to Re-Parole's Screen00..Screen12 — TPS Ukraine uses a
 * separate /services/tps-ukraine/start route, not this generic one. Any slug
 * other than the whitelist returns 404 so unknown slugs don't silently mount
 * the Re-Parole UI under a different brand.
 */
export default async function WizardPage({ params }: WizardPageProps) {
  const { slug, locale: _locale } = await params

  if (!isValidServiceSlug(slug)) {
    notFound()
  }

  return (
    <WizardProvider serviceSlug={slug}>
      <WizardShell slug={slug}>
        <WizardController />
      </WizardShell>
    </WizardProvider>
  )
}
