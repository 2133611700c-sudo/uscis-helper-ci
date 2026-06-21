/**
 * /[locale]/services/re-parole-u4u/start
 *
 * Re-Parole U4U wizard entry. Ports the prototype at
 * /uploads/reparole_prototype_final.html into production with real
 * backend wiring: shared OCR endpoint, slot firewall, Stripe checkout,
 * I-131 packet builder. Sitewide Header / language switcher / theme
 * toggle stay above (rendered by [locale]/layout.tsx).
 *
 * REGULATORY (verified 2026-05-04, still current 2026-05-20):
 *   - Form I-131 edition: 01/20/25
 *   - Paper: Part 2 Item 1.e + handwrite "Ukraine RE-PAROLE" at top
 *   - Online (my.uscis.gov): Box 10.C (U4U Ukraine)
 *   - Source: uscis.gov/i-131
 *
 * Legacy WizardProvider / WizardShell / WizardController stack was
 * replaced 2026-05-20 by ReparoleWizardV2. Old code lives in git
 * history (commits prior to this one) if a rollback is ever needed.
 */

import type { Metadata } from 'next'
import ReparoleWizardV2 from './ReparoleWizardV2'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return {
    title: 'Re-Parole U4U — Start Your Application | Messenginfo',
    description:
      'Guided self-help wizard to prepare your Form I-131 Re-Parole packet. ' +
      'Edition 01/20/25. You review, sign, and file yourself. Not legal advice.',
    metadataBase: new URL('https://messenginfo.com'),
    robots: { index: false, follow: false },
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/re-parole-u4u/start`,
    },
  }
}

export default async function ReParoleStartPage({ params }: Props) {
  const { locale } = await params
  return <ReparoleWizardV2 locale={locale} />
}
