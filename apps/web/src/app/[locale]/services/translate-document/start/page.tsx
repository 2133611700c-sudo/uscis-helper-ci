/**
 * /[locale]/services/translate-document/start
 *
 * Translation wizard — v12 (integrated into site layout)
 *
 * The [locale]/layout.tsx already provides:
 *   - <Header /> — Logo / Services / Documents / FAQ / Sources /
 *                  Language switcher / Sign in / Check Status / Theme toggle
 *   - <Footer />
 *   - <MobileBottomBar />
 *   - <MiaFloatingWidget />
 *
 * This page just renders the client-side wizard component.
 * All v11 product logic preserved in TranslateWizard.tsx.
 * Back buttons on every wizard screen navigate to /{locale}/services/translate-document.
 *
 * Indexable — after the 2026-05-28 redirect change, /translate-document
 * (the old landing) 307-forwards here, so /start is the canonical landing
 * page for the service. Marking it noindex would create a SEO regression.
 */

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TranslateWizard } from '@/components/services/translation/TranslateWizard'

interface Props {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const titles: Record<string, string> = {
    uk: 'Переклад документа — Messenginfo',
    ru: 'Перевод документа — Messenginfo',
    en: 'Document Translation — Messenginfo',
    es: 'Traducción de Documentos — Messenginfo',
  }
  // Honest scope after 2026-05-09 demotion: only ua_internal_passport_booklet
  // is fully self-serve. Other Ukrainian documents may be uploaded but route
  // to a team member for manual review. No "PDF ready in minutes" general claim.
  // No "USCIS-accepted" guarantee. No legal advice.
  const descs: Record<string, string> = {
    uk: 'Самостійний переклад українського внутрішнього паспорта для USCIS. Інші українські документи приймаються через ручну перевірку нашою командою. Не є юридичною консультацією.',
    ru: 'Самостоятельный перевод украинского внутреннего паспорта для USCIS. Другие украинские документы принимаются через ручную проверку нашей командой. Не является юридической консультацией.',
    en: 'Self-service translation for the Ukrainian internal passport booklet for USCIS purposes. Other Ukrainian documents are accepted through manual review by our team. Not legal advice.',
    es: 'Traducción autoservicio del pasaporte interno ucraniano para USCIS. Otros documentos ucranianos se procesan mediante revisión manual de nuestro equipo. No es asesoramiento legal.',
  }
  const title = titles[locale] ?? titles.en
  const description = descs[locale] ?? descs.en
  const ogLocale = locale === 'uk' ? 'uk_UA'
    : locale === 'ru' ? 'ru_RU'
    : locale === 'es' ? 'es_ES'
    : 'en_US'
  return {
    title,
    description,
    metadataBase: new URL('https://messenginfo.com'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `https://messenginfo.com/${locale}/services/translate-document/start`,
      languages: {
        uk: 'https://messenginfo.com/uk/services/translate-document/start',
        ru: 'https://messenginfo.com/ru/services/translate-document/start',
        en: 'https://messenginfo.com/en/services/translate-document/start',
        es: 'https://messenginfo.com/es/services/translate-document/start',
      },
    },
    // Explicit openGraph block — without this, Next.js falls back to the
    // root layout's generic «Помощь с USCIS …» OG title for share previews.
    openGraph: {
      title,
      description,
      url: `https://messenginfo.com/${locale}/services/translate-document/start`,
      locale: ogLocale,
      type: 'website',
      siteName: 'Messenginfo',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function TranslateDocumentStartPage({ params }: Props) {
  // params consumed to satisfy Next.js RSC signature
  await params
  return (
    <Suspense>
      <TranslateWizard />
    </Suspense>
  )
}
