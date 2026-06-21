import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import { Container } from '@/components/ui/Container'

export function DisclaimerSection() {
  const t = useTranslations('disclaimer')

  return (
    <div className="py-10 bg-white">
      <Container>
        <div className="rounded-card border border-amber-200 bg-amber-50 p-6 flex gap-4 max-w-3xl mx-auto">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-amber-900">{t('title')}</h3>
            <p className="mt-2 text-sm text-amber-800 leading-relaxed">{t('body')}</p>
          </div>
        </div>
      </Container>
    </div>
  )
}
