/**
 * /[locale]/services/tps-ukraine/start
 *
 * Cycle 2: the static 10-section guide is replaced by a real 5-screen
 * client wizard (TPSWizard) that walks the user through:
 *   S1 SituationRouter      — initial / re_registration / unknown
 *   S2 IdentityArrival      — passport, I-94, date entered US
 *   S3 EadFeeWaiver         — wants EAD, wants fee waiver, online vs paper
 *   S4 EvidenceCollection   — continuous residence + continuous physical presence
 *   S5 SummaryTransferGuide — answers + USCIS form transfer guide + checklist
 *
 * Local-only persistence (localStorage key 'wizard:tps-ukraine:state:v1').
 * No Supabase calls in this cycle (does NOT touch wizard_sessions table).
 * No Stripe. No filing. No legal advice.
 *
 * Re-Parole infrastructure (WizardProvider / WizardController) was
 * inspected during inventory and found to be Re-Parole-specific (hardcoded
 * service slug, hardcoded Screen00–Screen12 list). To avoid Re-Parole
 * regression risk this cycle ships TPS-specific UI without modifying that
 * shared infrastructure.
 */

import type { Metadata } from 'next'
import TPSWizardWithErrorBoundary from './TPSWizardWithErrorBoundary'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    uk: 'TPS Україна — підготовка пакета | Messenginfo',
    ru: 'TPS Украина — подготовка пакета | Messenginfo',
    en: 'TPS Ukraine — packet preparation | Messenginfo',
    es: 'TPS Ucrania — preparación del paquete | Messenginfo',
  }
  const descs: Record<string, string> = {
    uk: '5-крокова підготовка пакета TPS Ukraine: situation router, форми I-821/I-765/I-912, чек-лист доказів, інструкція що куди вписати в USCIS. Ви подаєте самостійно.',
    ru: '5-шаговая подготовка пакета TPS Ukraine: situation router, формы I-821/I-765/I-912, чек-лист доказательств, инструкция что куда вписать в USCIS. Подаёте сами.',
    en: '5-step TPS Ukraine packet preparation: situation router, Forms I-821/I-765/I-912, evidence checklist, USCIS transfer guide. You file yourself.',
    es: 'Preparación TPS Ucrania en 5 pasos: situation router, formularios I-821/I-765/I-912, lista de evidencias, guía de transferencia USCIS. Usted presenta.',
  }
  return {
    title: titles[locale] ?? titles.en,
    description: descs[locale] ?? descs.en,
    metadataBase: new URL('https://messenginfo.com'),
    // Wizard is transactional, not searchable.
    robots: { index: false, follow: false },
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/tps-ukraine/start`,
    },
  }
}

export default async function TpsUkraineStartPage({ params }: Props) {
  const { locale } = await params
  return <TPSWizardWithErrorBoundary locale={locale} />
}
