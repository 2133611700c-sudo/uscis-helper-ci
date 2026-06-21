import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'

export function Footer() {
  const t = useTranslations('footer')
  const locale = useLocale()

  return (
    <footer className="bg-ink-900 text-slate-300">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* About */}
          <div>
            <p className="text-white font-bold text-base mb-2">{t('columns.about.title')}</p>
            <p className="text-slate-400 text-sm leading-relaxed">{t('columns.about.tagline')}</p>
          </div>

          {/* Services */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">{t('columns.services.title')}</p>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href={`/${locale}/services`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.services.links.all')}
              </Link>
              <Link href={`/${locale}/services/re-parole-u4u`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.services.links.reparole')}
              </Link>
              <Link href={`/${locale}/services/ead-work-permit`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.services.links.ead')}
              </Link>
              <Link href={`/${locale}/services/tps-ukraine`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.services.links.tps')}
              </Link>
            </nav>
          </div>

          {/* Resources */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">{t('columns.resources.title')}</p>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href={`/${locale}#sources`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.resources.links.officialLinks')}
              </Link>
              <Link href={`/${locale}/faq`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.resources.links.faq')}
              </Link>
              <Link href={`/${locale}/supported-documents`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.resources.links.supportedDocuments')}
              </Link>
              <Link href={`/${locale}/contact`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.resources.links.contact')}
              </Link>
              <Link href={`/${locale}/pricing`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.resources.links.pricing')}
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">{t('columns.legal.title')}</p>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href={`/${locale}/privacy`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.legal.links.privacy')}
              </Link>
              <Link href={`/${locale}/terms`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.legal.links.terms')}
              </Link>
              <Link href={`/${locale}/disclaimer`} className="text-slate-400 hover:text-white transition-colors">
                {t('columns.legal.links.disclaimer')}
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <a href={`/${locale}/owner`} className="text-xs text-slate-500 hover:text-slate-400 transition-colors cursor-default">{t('bottom')}</a>
          {/* The static EN·RU·UK·ES row was removed: it looked clickable but did
              nothing. The working language selector lives in the header. */}
        </div>
      </div>
    </footer>
  )
}
