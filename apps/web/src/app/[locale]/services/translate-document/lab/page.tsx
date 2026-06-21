import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, FlaskConical } from 'lucide-react'
import { routing } from '@/i18n/routing'
import { Container } from '@/components/ui/Container'
import { IconBadge } from '@/components/ui/IconBadge'
import { TranslationLab } from '@/components/services/translation/TranslationLab'

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Translation Lab — AI Extraction Pipeline | Messenginfo',
    description:
      'Interactive demo: upload a Ukrainian document, watch AI extract all fields, review confidence scores, and download a USCIS-ready translation draft package.',
    robots: { index: false, follow: false },
  }
}

interface Props {
  params: Promise<{ locale: string }>
}

export default async function TranslationLabPage({ params }: Props) {
  const { locale } = await params

  return (
    <>
      {/* Breadcrumb */}
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)]">
        <Container>
          <nav
            className="flex items-center gap-1.5 py-3 text-xs text-[var(--text-2)]"
            aria-label="Breadcrumb"
          >
            <Link href={`/${locale}`} className="transition-colors hover:text-[var(--text-1)]">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link
              href={`/${locale}/services`}
              className="transition-colors hover:text-[var(--text-1)]"
            >
              Services
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link
              href={`/${locale}/services/translate-document`}
              className="transition-colors hover:text-[var(--text-1)]"
            >
              Translate Document
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-[var(--text-1)]">Lab</span>
          </nav>
        </Container>
      </div>

      {/* Hero */}
      <div className="border-b border-[var(--border)] bg-[var(--surface-1)]">
        <Container>
          <div className="py-5">
            <Link
              href={`/${locale}/services/translate-document`}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-1.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text-1)]"
            >
              ← Back to Translation Service
            </Link>
            <div className="flex items-start gap-3">
              <IconBadge icon={FlaskConical} size="lg" />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold leading-tight text-[var(--text-1)] md:text-3xl">
                    Translation Lab
                  </h1>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-800">
                    DEMO
                  </span>
                </div>
                <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-2)] md:text-base">
                  End-to-end demo of the AI translation pipeline. Select a synthetic Ukrainian
                  document, watch the OCR engine extract every field with confidence scores, review
                  and correct any uncertain values, then download 4 USCIS-ready output files.
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700 border border-blue-200">
                    🤖 Mock AI / OCR
                  </span>
                  <span className="rounded-full bg-green-50 px-3 py-1 font-medium text-green-700 border border-green-200">
                    8 CFR 103.2(b)(3)
                  </span>
                  <span className="rounded-full bg-purple-50 px-3 py-1 font-medium text-purple-700 border border-purple-200">
                    4 Output Files
                  </span>
                  <span className="rounded-full bg-gray-50 px-3 py-1 font-medium text-gray-700 border border-gray-200">
                    Synthetic Data Only
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>

      {/* Lab */}
      <div className="bg-[var(--surface-2)] py-6">
        <Container>
          <TranslationLab />
        </Container>
      </div>
    </>
  )
}
