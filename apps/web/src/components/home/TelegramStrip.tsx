import { useTranslations } from 'next-intl'
import { ExternalLink } from 'lucide-react'
import { Container } from '@/components/ui/Container'

export function TelegramStrip() {
  const t = useTranslations('telegramStrip')
  const channelUrl = process.env.TELEGRAM_CHANNEL_URL
  const botUrl = process.env.TELEGRAM_BOT_URL
  const hasLinks = channelUrl || botUrl

  return (
    <div className="py-10 border-y" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
      <Container>
        <div className="rounded-card border p-6 flex flex-col md:flex-row md:items-center gap-6" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-ink-900">{t('title')}</h3>
            {!hasLinks && (
              <p className="mt-2 text-sm text-ink-600">{t('fallbackText')}</p>
            )}
          </div>
          {hasLinks && (
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              {channelUrl && (
                <a
                  href={channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-btn transition-colors"
                >
                  {t('channelButton')}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {botUrl && (
                <a
                  href={botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 border border-brand-200 text-brand-700 hover:bg-brand-100 text-sm font-medium px-5 py-2.5 rounded-btn transition-colors"
                >
                  {t('botButton')}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </Container>
    </div>
  )
}
