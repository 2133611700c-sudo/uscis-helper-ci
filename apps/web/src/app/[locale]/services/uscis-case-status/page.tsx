/**
 * /[locale]/services/uscis-case-status
 * USCIS Case Status Tracker — receipt number lookup + email alerts.
 * Links directly to official USCIS Case Status page (uscis.gov/case-status).
 * No legal advice. Not a law firm.
 */
import type { Metadata } from 'next'
import { CaseStatusTracker } from './CaseStatusTracker'

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    en: 'USCIS Case Status Tracker — Check Your Immigration Case Online',
    uk: 'Статус справи USCIS — Перевірте статус вашої імміграційної справи',
    ru: 'Статус дела USCIS — Проверьте статус вашего иммиграционного дела',
    es: 'Estado del Caso USCIS — Verifique el Estado de su Caso Migratorio',
  }
  const descs: Record<string, string> = {
    en: 'Look up your USCIS case status by receipt number. Supports I-131, I-765, I-485, I-797 and more. Direct link to official USCIS portal. Not legal advice.',
    uk: 'Перевірте статус справи USCIS за номером отримання. Підтримує I-131, I-765, I-485, I-797 та інші. Пряме посилання на офіційний портал USCIS.',
    ru: 'Проверьте статус дела USCIS по номеру получения. Поддерживает I-131, I-765, I-485, I-797 и другие. Прямая ссылка на официальный портал USCIS.',
    es: 'Consulte el estado de su caso USCIS por número de recibo. Compatible con I-131, I-765, I-485, I-797 y más. Enlace directo al portal oficial de USCIS.',
  }
  return {
    title: titles[locale] ?? titles.en,
    description: descs[locale] ?? descs.en,
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/uscis-case-status`,
      languages: {
        en: 'https://messenginfo.com/en/services/uscis-case-status',
        uk: 'https://messenginfo.com/uk/services/uscis-case-status',
        ru: 'https://messenginfo.com/ru/services/uscis-case-status',
        es: 'https://messenginfo.com/es/services/uscis-case-status',
      },
    },
    openGraph: {
      title: titles[locale] ?? titles.en,
      description: descs[locale] ?? descs.en,
      url: `https://messenginfo.com/${locale}/services/uscis-case-status`,
    },
  }
}

export default async function CaseStatusPage({ params }: Props) {
  const { locale } = await params
  return <CaseStatusTracker locale={locale} />
}
