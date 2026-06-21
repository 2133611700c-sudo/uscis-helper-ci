import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { ExternalLink, Library, ChevronRight } from 'lucide-react'
import { routing } from '@/i18n/routing'
import { serviceCards } from '@/data/serviceCards'
import { IconBadge } from '@/components/ui/IconBadge'
import { SourceBadge } from '@/components/cards/SourceBadge'
import { ServiceCard } from '@/components/cards/ServiceCard'
import { DisclaimerSection } from '@/components/home/DisclaimerSection'
import { CaseStatusChecker } from '@/components/home/CaseStatusChecker'
import { Container } from '@/components/ui/Container'
import { Section } from '@/components/ui/Section'
import { ServiceBackBar } from '@/components/layout/ServiceBackBar'

const SLUGS = [
  'parole-expires-soon',
  're-parole-u4u',
  'tps-ukraine',
  'ead-work-permit',
  'i-94',
  'uscis-case-status',
  'payment-problem',
  'biometrics',
  'rfe-denial',
  'translate-document',
  'form-draft-helper',
  'official-sources',
] as const

type Slug = (typeof SLUGS)[number]

// Per BUG-003: only services with verified full content are indexable.
// Stub services (placeholder content only) get robots: noindex to avoid
// thin-content SEO penalty. List grows as services are verified one-by-one.
const FULL_DATA_SLUGS: ReadonlySet<Slug> = new Set<Slug>(['re-parole-u4u', 'tps-ukraine'])

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    SLUGS.map((slug) => ({ locale, slug })),
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  if (!SLUGS.includes(slug as Slug)) return {}

  const t = await getTranslations({ locale, namespace: 'cards' })
  const cardData = t.raw(slug) as { title: string; shortProblem: string }

  const title = `${cardData.title} | Messenginfo`
  const description = cardData.shortProblem
  const isFullData = FULL_DATA_SLUGS.has(slug as Slug)

  return {
    title,
    description,
    metadataBase: new URL('https://messenginfo.com'),
    // BUG-003: stub services (full_data: false) get noindex to prevent
    // thin-content SEO penalty. Only services with verified content indexed.
    robots: isFullData
      ? { index: true, follow: true }
      : { index: false, follow: true },
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/${slug}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `https://messenginfo.com/${l}/services/${slug}`]),
      ),
    },
    openGraph: {
      title,
      description,
      url: `https://messenginfo.com/${locale}/services/${slug}`,
      locale: locale === 'uk' ? 'uk_UA' : locale === 'ru' ? 'ru_RU' : locale === 'es' ? 'es_ES' : 'en_US',
    },
  }
}

export default async function ServicePage({ params }: Props) {
  const { locale, slug } = await params

  if (!SLUGS.includes(slug as Slug)) notFound()

  const card = serviceCards.find((c) => c.slug === slug)
  if (!card) notFound()

  const tCards = await getTranslations({ locale, namespace: 'cards' })
  const tPages = await getTranslations({ locale, namespace: 'servicePages' })
  const tBreadcrumb = await getTranslations({ locale, namespace: 'services' })
  const pageLabels = await getTranslations({ locale, namespace: 'servicePages.labels' })

  const cardData = tCards.raw(slug) as { title: string; shortProblem: string }
  const pageData = tPages.raw(slug) as {
    title: string
    subtitle: string
    whatHelps: string[]
    commonMistakes: string[]
    officialNote: string
    lastVerifiedLabel: string
  }

  const lastVerified = pageData.lastVerifiedLabel.replace('{date}', card.sourceLastVerified)

  // Related services: sortOrder neighbors (wrapping)
  const sorted = [...serviceCards].sort((a, b) => a.sortOrder - b.sortOrder)
  const idx = sorted.findIndex((c) => c.slug === slug)
  const related = [
    sorted[(idx - 1 + sorted.length) % sorted.length],
    sorted[(idx + 1) % sorted.length],
    sorted[(idx + 2) % sorted.length],
  ].filter((c) => c.slug !== slug).slice(0, 3)

  const isTranslate = slug === 'translate-document'
  const isCaseStatus = slug === 'uscis-case-status'
  const isReParoleU4U = slug === 're-parole-u4u'

  // Verified facts block — only present for re-parole-u4u (full_data: true).
  // Source: serviceData/re-parole-u4u.ts (verified 2026-05-04 from USCIS).
  const reParolePageData = isReParoleU4U
    ? (tPages.raw('re-parole-u4u') as Record<string, unknown>)
    : undefined

  const verifiedFacts = reParolePageData?.verified as
    | {
        facts: { title: string; form: string; item: string; topNote: string; window: string }
        fees: { title: string; note: string; checkLink: string }
        processing: { title: string; note: string }
        disclaimer: string
      }
    | undefined

  // New notice banners (stage-4: medical, EAD, fee waiver)
  const statusWarning = isReParoleU4U ? (reParolePageData?.statusWarning as string | undefined) : undefined
  const feeNotice = isReParoleU4U ? (reParolePageData?.feeNotice as string | undefined) : undefined
  const processingWarning = isReParoleU4U ? (reParolePageData?.processingWarning as string | undefined) : undefined
  const medicalNote = isReParoleU4U ? (reParolePageData?.medicalNote as string | undefined) : undefined
  const eadWarning = isReParoleU4U ? (reParolePageData?.eadWarning as string | undefined) : undefined
  const feeWaiverNote = isReParoleU4U ? (reParolePageData?.feeWaiverNote as string | undefined) : undefined

  // JSON-LD breadcrumb + service schema
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: pageLabels('home'), item: `https://messenginfo.com/${locale}` },
      { '@type': 'ListItem', position: 2, name: tBreadcrumb('title'), item: `https://messenginfo.com/${locale}/services` },
      { '@type': 'ListItem', position: 3, name: cardData.title, item: `https://messenginfo.com/${locale}/services/${slug}` },
    ],
  }

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: cardData.title,
    description: cardData.shortProblem,
    provider: { '@type': 'Organization', name: 'Messenginfo', url: 'https://messenginfo.com' },
    url: `https://messenginfo.com/${locale}/services/${slug}`,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />

      {/* Big senior-friendly back button (visible on mobile where the
          breadcrumb shrinks too small to tap). Mounted alongside the
          desktop breadcrumb — both render but the back bar is the
          primary recovery affordance for older users on phones. */}
      <ServiceBackBar locale={locale} />

      {/* Breadcrumb */}
      <div className="bg-slate-50 border-b border-slate-100">
        <Container>
          <nav className="py-3 flex items-center gap-1.5 text-xs text-ink-600" aria-label="Breadcrumb">
            <Link href={`/${locale}`} className="hover:text-ink-900 transition-colors">{pageLabels('home')}</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href={`/${locale}/services`} className="hover:text-ink-900 transition-colors">{tBreadcrumb('title')}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-ink-900 font-medium">{cardData.title}</span>
          </nav>
        </Container>
      </div>

      {/* Hero */}
      <Section>
        <div className="max-w-3xl">
          <div className="flex items-start gap-4 mb-4">
            <IconBadge icon={card.icon} size="lg" />
            {card.hasOfficialSource && (
              <div className="flex gap-2 flex-wrap pt-1">
                <SourceBadge />
              </div>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-ink-900">{pageData.title}</h1>
          <p className="mt-3 text-lg text-ink-600">{pageData.subtitle}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={card.officialSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-base font-medium px-5 py-2.5 rounded-btn transition-colors"
            >
              {pageLabels('openOfficialSource')}
              <ExternalLink className="w-4 h-4" />
            </a>
            <Link
              href={`/${locale}/services`}
              className="inline-flex items-center gap-2 border border-slate-200 text-ink-700 hover:bg-slate-50 text-base font-medium px-5 py-2.5 rounded-btn transition-colors"
            >
              {pageLabels('backToServices')}
            </Link>
          </div>

          {/* Stage-8: Re-Parole wizard CTA — self-help guided packet builder */}
          {isReParoleU4U && (
            <div className="mt-6 space-y-4">
              {/* Main CTA card */}
              <div className="rounded-xl border-2 border-brand-500 bg-brand-50 p-6">
                <p className="text-xl font-bold text-ink-900 mb-1">
                  Prepare Your Re-Parole Packet
                </p>
                <p className="text-base text-ink-600 mb-2">
                  Step-by-step guided help. You review every page and file yourself.
                </p>
                <p className="text-sm text-ink-600 mb-5">
                  Takes about 20–30 minutes. We prepare the forms — you submit to USCIS.
                </p>
                <Link
                  href={`/${locale}/services/re-parole-u4u/start`}
                  className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-base font-bold px-6 py-3 rounded-lg transition-colors"
                  style={{ minHeight: '52px' }}
                >
                  Start Now — It&apos;s Free to Try
                  <ChevronRight className="w-5 h-5" />
                </Link>
              </div>

              {/* Pricing transparency */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-3">
                  Transparent Pricing
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-brand-100 text-brand-600 text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">Messenginfo service fee: from $15</p>
                      <p className="text-sm text-ink-600">For 1 person — packet preparation, form fill, download. More people = slightly higher fee.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">USCIS government filing fee: $0 for most U4U</p>
                      <p className="text-sm text-ink-600">Re-Parole I-131 currently has no USCIS fee for Ukraine for Ukrainians program participants. Always verify at uscis.gov before filing.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* How it works — 3 steps */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-3">
                  How It Works — 3 Steps
                </p>
                <div className="space-y-3">
                  {[
                    { n: '1', title: 'Upload your documents', desc: 'Passport photo page + Form I-94. We extract the data automatically.' },
                    { n: '2', title: 'Review and confirm', desc: 'Check every field before the packet is assembled. You\'re in control.' },
                    { n: '3', title: 'Download and file', desc: 'Download your I-131 draft packet. Review every field, then file at my.uscis.gov or by mail.' },
                  ].map(({ n, title, desc }) => (
                    <div key={n} className="flex items-start gap-3">
                      <span className="mt-0.5 w-6 h-6 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{n}</span>
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{title}</p>
                        <p className="text-sm text-ink-600">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQ accordion items — static, plain language */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-ink-600 uppercase tracking-wide mb-3">
                  Common Questions
                </p>
                <div className="space-y-3 text-sm">
                  <details className="group">
                    <summary className="font-medium text-ink-900 cursor-pointer list-none flex items-center justify-between">
                      Do I need a lawyer?
                      <ChevronRight className="w-4 h-4 text-ink-400 group-open:rotate-90 transition-transform" />
                    </summary>
                    <p className="mt-2 text-ink-700 text-sm leading-relaxed">
                      No. This is a self-help tool for preparing paperwork. We do not provide legal advice. If your case is complicated (denied before, criminal history, etc.) — consult an immigration attorney.
                    </p>
                  </details>
                  <details className="group">
                    <summary className="font-medium text-ink-900 cursor-pointer list-none flex items-center justify-between">
                      What documents do I need?
                      <ChevronRight className="w-4 h-4 text-ink-400 group-open:rotate-90 transition-transform" />
                    </summary>
                    <p className="mt-2 text-ink-700 text-sm leading-relaxed">
                      Your passport (bio-data page), Form I-94 (printable from i94.cbp.dhs.gov), proof of Ukrainian nationality, and any prior USCIS approval notices if you have them.
                    </p>
                  </details>
                  <details className="group">
                    <summary className="font-medium text-ink-900 cursor-pointer list-none flex items-center justify-between">
                      My parole expires soon — is there still time?
                      <ChevronRight className="w-4 h-4 text-ink-400 group-open:rotate-90 transition-transform" />
                    </summary>
                    <p className="mt-2 text-ink-700 text-sm leading-relaxed">
                      File as early as possible — USCIS recommends applying at least 90 days before your current parole expires. If it expires in less than 30 days, prepare the packet today.
                    </p>
                  </details>
                  <details className="group">
                    <summary className="font-medium text-ink-900 cursor-pointer list-none flex items-center justify-between">
                      Can I file online?
                      <ChevronRight className="w-4 h-4 text-ink-400 group-open:rotate-90 transition-transform" />
                    </summary>
                    <p className="mt-2 text-ink-700 text-sm leading-relaxed">
                      Yes. Re-Parole I-131 can be filed online at my.uscis.gov (Box 10.C) or mailed. We prepare packets for both options. Online filing is faster and you get instant receipt confirmation.
                    </p>
                  </details>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Case Status Checker for uscis-case-status page */}
      {isCaseStatus && (
        <div className="bg-slate-50 py-6">
          <Container>
            <div className="max-w-xl">
              <CaseStatusChecker />
            </div>
          </Container>
        </div>
      )}

      {/* Translate safe statement */}
      {isTranslate && (
        <div className="bg-amber-50 border-y border-amber-200">
          <Container>
            <div className="py-4 max-w-3xl">
              <p className="text-sm text-amber-800 font-medium">{pageLabels('translationNotice')}</p>
            </div>
          </Container>
        </div>
      )}

      {/* What helps */}
      <Section className="bg-slate-50">
        <div className="max-w-3xl grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-bold text-ink-900 mb-4">{pageLabels('whatHelps')}</h2>
            <ul className="space-y-3">
              {pageData.whatHelps.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink-900 mb-4">{pageLabels('commonMistakes')}</h2>
            <ul className="space-y-3">
              {pageData.commonMistakes.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Re-parole U4U notice banners — status, fees, processing, medical, EAD, fee waiver */}
      {isReParoleU4U && (statusWarning || feeNotice || processingWarning || medicalNote || eadWarning || feeWaiverNote) && (
        <div className="border-y border-amber-200 bg-amber-50">
          <Container>
            <div className="py-4 max-w-3xl space-y-3">
              {statusWarning && (
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">Program status: </span>{statusWarning}
                </p>
              )}
              {feeNotice && (
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">Fees: </span>{feeNotice}
                </p>
              )}
              {processingWarning && (
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">Processing: </span>{processingWarning}
                </p>
              )}
              {medicalNote && (
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">Medical documentation: </span>{medicalNote}
                </p>
              )}
              {eadWarning && (
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">EAD / work permit: </span>{eadWarning}
                </p>
              )}
              {feeWaiverNote && (
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">Fee waiver: </span>{feeWaiverNote}
                </p>
              )}
            </div>
          </Container>
        </div>
      )}

      {/* Verified facts block — only for re-parole-u4u (full_data: true) */}
      {isReParoleU4U && verifiedFacts && (
        <Section>
          <div className="max-w-3xl space-y-4">
            <div className="rounded-card border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-semibold text-ink-900 mb-3">{verifiedFacts.facts.title}</h3>
              <ul className="space-y-2 text-sm text-ink-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  {verifiedFacts.facts.form}
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  {verifiedFacts.facts.item}
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  {verifiedFacts.facts.topNote}
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  {verifiedFacts.facts.window}
                </li>
              </ul>
            </div>

            <div className="rounded-card border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-ink-900 mb-2">{verifiedFacts.fees.title}</h3>
              <p className="text-sm text-ink-700 mb-3">{verifiedFacts.fees.note}</p>
              <a
                href="https://www.uscis.gov/feecalculator"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                {verifiedFacts.fees.checkLink}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="rounded-card border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-ink-900 mb-2">{verifiedFacts.processing.title}</h3>
              <p className="text-sm text-ink-700 mb-3">{verifiedFacts.processing.note}</p>
              <a
                href="https://egov.uscis.gov/processing-times/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                USCIS Processing Times
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <p className="text-sm text-ink-600">{verifiedFacts.disclaimer}</p>
          </div>
        </Section>
      )}

      {/* Official source callout */}
      <Section>
        <div className="max-w-3xl rounded-card border border-brand-100 bg-brand-50 p-5 flex items-start gap-4">
          <Library className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-ink-700">{pageData.officialNote}</p>
            <a
              href={card.officialSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              {card.officialSourceUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
            <p className="mt-1.5 text-xs text-ink-600">{lastVerified}</p>
          </div>
        </div>
      </Section>

      {/* Related services */}
      {related.length > 0 && (
        <Section className="bg-slate-50">
          <h2 className="text-xl font-bold text-ink-900 mb-6">{pageLabels('relatedServices')}</h2>
          <div className="grid grid-cols-1 min-[600px]:grid-cols-2 gap-4 min-[600px]:gap-5">
            {related.map((relCard) => (
              <ServiceCard key={relCard.id} card={relCard} locale={locale} />
            ))}
          </div>
        </Section>
      )}

      <DisclaimerSection />
    </>
  )
}
