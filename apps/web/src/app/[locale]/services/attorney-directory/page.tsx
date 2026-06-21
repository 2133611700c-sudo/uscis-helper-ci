/**
 * /[locale]/services/attorney-directory
 * Immigration Attorney Directory MVP — vetted resources + referral guide
 * Messenginfo is NOT a law firm. No attorney-client relationship.
 */
import type { Metadata } from 'next'
import { AttorneyDirectoryPage } from './AttorneyDirectoryPage'

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    en: 'Immigration Attorney Directory — Find Legal Help for Ukrainians in the US',
    uk: 'Каталог імміграційних адвокатів — Знайдіть юридичну допомогу для українців у США',
    ru: 'Каталог иммиграционных адвокатов — Найдите юридическую помощь для украинцев в США',
    es: 'Directorio de Abogados de Inmigración — Encuentre Ayuda Legal para Ucranianos en EE.UU.',
  }
  const descs: Record<string, string> = {
    en: 'Free and low-cost immigration legal resources for Ukrainian parolees and TPS holders. Find accredited representatives, legal aid organizations, and know your rights.',
    uk: 'Безкоштовні та доступні імміграційні юридичні ресурси для українських паролів та власників TPS. Знайдіть акредитованих представників та організації правової допомоги.',
    ru: 'Бесплатные и доступные иммиграционные юридические ресурсы для украинских парольщиков и держателей TPS. Найдите аккредитованных представителей и организации правовой помощи.',
    es: 'Recursos legales de inmigración gratuitos y de bajo costo para ucranianos en libertad condicional y titulares de TPS.',
  }
  return {
    title: titles[locale] ?? titles.en,
    description: descs[locale] ?? descs.en,
    metadataBase: new URL('https://messenginfo.com'),
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/attorney-directory`,
      languages: {
        en: 'https://messenginfo.com/en/services/attorney-directory',
        uk: 'https://messenginfo.com/uk/services/attorney-directory',
        ru: 'https://messenginfo.com/ru/services/attorney-directory',
        es: 'https://messenginfo.com/es/services/attorney-directory',
      },
    },
  }
}

export default async function AttorneyPage({ params }: Props) {
  const { locale } = await params
  return <AttorneyDirectoryPage locale={locale} />
}
