import {
  CalendarClock, ShieldCheck, Flag, IdCard, Stamp, Search,
  CreditCard, Fingerprint, FileWarning, Languages,
  ClipboardEdit, Library, ShieldAlert, Scale, BookOpen,
  type LucideIcon
} from 'lucide-react'

export interface ServiceCard {
  id: string
  slug: string
  icon: LucideIcon
  image?: string
  hasOfficialSource: boolean
  officialSourceUrl: string
  sourceLastVerified: string
  sortOrder: number
  // Verified-data flags (BUG-002+). Only present for full_data services.
  formId?: string
  formEdition?: string
  feeCalculatorUrl?: string
  fullData?: boolean
}

export const serviceCards: ServiceCard[] = [
  { id: 'parole-expires-soon', slug: 'parole-expires-soon', icon: CalendarClock, image: '/service-icons/parole-expires-soon.webp', hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/humanitarian/uniting-for-ukraine', sourceLastVerified: '2026-04-29', sortOrder: 1 },
  { id: 're-parole-u4u', slug: 're-parole-u4u', icon: ShieldCheck, image: '/service-icons/re-parole-u4u.webp', hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/humanitarian/uniting-for-ukraine/re-parole-process-for-certain-ukrainian-citizens-and-their-immediate-family-members', sourceLastVerified: '2026-05-04', sortOrder: 2, formId: 'I-131', formEdition: '01/20/25', feeCalculatorUrl: 'https://www.uscis.gov/feecalculator', fullData: true },
  { id: 'tps-ukraine', slug: 'tps-ukraine', icon: Flag, image: '/service-icons/tps-ukraine.webp', hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine', sourceLastVerified: '2026-04-29', sortOrder: 3 },
  { id: 'ead-work-permit', slug: 'ead-work-permit', icon: IdCard, image: '/service-icons/work-permit.webp', hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/i-765', sourceLastVerified: '2026-05-06', sortOrder: 4, formId: 'I-765', feeCalculatorUrl: 'https://www.uscis.gov/feecalculator', fullData: true },
  { id: 'i-94', slug: 'i-94', icon: Stamp, image: '/service-icons/i-94.webp', hasOfficialSource: true, officialSourceUrl: 'https://i94.cbp.dhs.gov/', sourceLastVerified: '2026-04-29', sortOrder: 5 },
  { id: 'uscis-case-status', slug: 'uscis-case-status', icon: Search, image: '/service-icons/uscis-case-status.webp', hasOfficialSource: true, officialSourceUrl: 'https://egov.uscis.gov/', sourceLastVerified: '2026-04-29', sortOrder: 6 },
  { id: 'payment-problem', slug: 'payment-problem', icon: CreditCard, hasOfficialSource: true, officialSourceUrl: 'https://my.uscis.gov/', sourceLastVerified: '2026-04-29', sortOrder: 7 },
  { id: 'biometrics', slug: 'biometrics', icon: Fingerprint, image: '/service-icons/biometrics.webp', hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/forms/filing-fees/biometric-services-fee', sourceLastVerified: '2026-04-29', sortOrder: 8 },
  { id: 'rfe-denial', slug: 'rfe-denial', icon: FileWarning, hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/policy-manual', sourceLastVerified: '2026-04-29', sortOrder: 9 },
  { id: 'translate-document', slug: 'translate-document', icon: Languages, image: '/service-icons/translate-document.webp', hasOfficialSource: true, officialSourceUrl: 'https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-103/section-103.2', sourceLastVerified: '2026-04-29', sortOrder: 10 },
  { id: 'form-draft-helper', slug: 'form-draft-helper', icon: ClipboardEdit, image: '/service-icons/form-draft-helper.webp', hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/forms', sourceLastVerified: '2026-04-29', sortOrder: 11 },
  { id: 'official-sources', slug: 'official-sources', icon: Library, hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/', sourceLastVerified: '2026-04-29', sortOrder: 12 },
  { id: 'tps-status', slug: 'tps-status', icon: ShieldAlert, hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/humanitarian/temporary-protected-status/temporary-protected-status-designated-country-ukraine', sourceLastVerified: '2026-05-06', sortOrder: 13 },
  { id: 'attorney-directory', slug: 'attorney-directory', icon: Scale, hasOfficialSource: true, officialSourceUrl: 'https://www.uscis.gov/avoid-scams/find-legal-services', sourceLastVerified: '2026-05-06', sortOrder: 14 },
  { id: 'i-94-guide', slug: 'i-94-guide', icon: BookOpen, hasOfficialSource: true, officialSourceUrl: 'https://i94.cbp.dhs.gov/', sourceLastVerified: '2026-05-06', sortOrder: 15 },
]

export function getServiceCard(slug: string): ServiceCard | undefined {
  return serviceCards.find((c) => c.slug === slug)
}

export function getRelatedServices(slug: string, count = 3): ServiceCard[] {
  const current = getServiceCard(slug)
  if (!current) return []
  return serviceCards
    .filter((c) => c.slug !== slug)
    .sort((a, b) => Math.abs(a.sortOrder - current.sortOrder) - Math.abs(b.sortOrder - current.sortOrder))
    .slice(0, count)
}
