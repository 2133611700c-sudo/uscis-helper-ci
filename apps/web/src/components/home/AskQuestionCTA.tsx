import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { HelpCircle, ArrowRight } from 'lucide-react'
import { Container } from '@/components/ui/Container'

interface AskQuestionCTAProps {
  locale: string
}

export function AskQuestionCTA({ locale }: AskQuestionCTAProps) {
  const t = useTranslations('askQuestion')

  return (
    <div className="py-10" style={{ background: 'var(--bg)' }}>
      <Container>
        <div className="rounded-card bg-brand-50 border border-brand-100 p-6 md:p-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink-900">{t('title')}</h3>
              <p className="mt-1 text-sm text-ink-600">{t('subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              href={`/${locale}/faq`}
              className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-base font-medium px-5 py-2.5 rounded-btn transition-colors"
            >
              {t('ctaFaq')}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="inline-flex items-center justify-center gap-2 border border-brand-200 text-brand-700 hover:bg-brand-100 text-base font-medium px-5 py-2.5 rounded-btn transition-colors"
            >
              {t('ctaContact')}
            </Link>
          </div>
        </div>
      </Container>
    </div>
  )
}
