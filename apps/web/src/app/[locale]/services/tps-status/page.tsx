/**
 * /[locale]/services/tps-status
 * TPS Ukraine Status tracker — official info + email alerts
 * Sources: uscis.gov/tps, federalregister.gov
 * Last verified: 2026-05-06
 */
import type { Metadata } from 'next'
import { TPSStatusPage } from './TPSStatusPage'

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    en: 'TPS Ukraine Status 2026 — Temporary Protected Status Updates',
    uk: 'Статус TPS Україна 2026 — Оновлення тимчасового захисного статусу',
    ru: 'Статус TPS Украина 2026 — Обновления временного защитного статуса',
    es: 'Estado TPS Ucrania 2026 — Actualizaciones de Estatus de Protección Temporal',
  }
  const descs: Record<string, string> = {
    en: 'Latest TPS Ukraine designation status, extension deadlines, and registration windows. Stay informed with official USCIS sources. Not legal advice.',
    uk: 'Актуальний статус TPS Україна, терміни продовження та вікна реєстрації. Будьте в курсі з офіційними джерелами USCIS.',
    ru: 'Актуальный статус TPS Украина, сроки продления и окна регистрации. Будьте в курсе с официальными источниками USCIS.',
    es: 'Estado actual de TPS Ucrania, plazos de extensión y ventanas de registro. Manténgase informado con fuentes oficiales de USCIS.',
  }
  return {
    title: titles[locale] ?? titles.en,
    description: descs[locale] ?? descs.en,
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/tps-status`,
      languages: {
        en: 'https://messenginfo.com/en/services/tps-status',
        uk: 'https://messenginfo.com/uk/services/tps-status',
        ru: 'https://messenginfo.com/ru/services/tps-status',
        es: 'https://messenginfo.com/es/services/tps-status',
      },
    },
  }
}

export default async function TPSPage({ params }: Props) {
  const { locale } = await params
  return <TPSStatusPage locale={locale} />
}
